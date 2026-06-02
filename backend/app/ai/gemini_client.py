import json
import logging
import os
from io import BytesIO

import google.generativeai as genai
from flask import current_app
from google.generativeai.types import GenerationConfig, HarmBlockThreshold, HarmCategory
from PIL import Image
from pydantic import BaseModel

from app.ai.retry import parse_json_response, with_retry
from app.utils.image_encoding import prepare_image_for_gemini

logger = logging.getLogger(__name__)


def _resolve_gemini_api_key() -> str:
    try:
        return current_app.config["GEMINI_API_KEY"]
    except RuntimeError:
        return os.getenv("HGK_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY", "")


DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"

# 空応答時のフォールバック（2.5-flash の thinking 枯渇を避けるため lite を優先）
TRANSCRIPTION_MODEL_FALLBACKS = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
]

# 2025以降、新規利用者には 2.0 系が提供されないため自動で最新安定版へ寄せる
_DEPRECATED_GEMINI_MODELS = {
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-pro",
}


def normalize_gemini_model(raw: str | None) -> str:
    """models/ 接頭辞や廃止モデル名を正規化する。"""
    if not raw or not str(raw).strip():
        return DEFAULT_GEMINI_MODEL

    name = str(raw).strip()
    if name.startswith("models/"):
        name = name[len("models/") :]

    if name in _DEPRECATED_GEMINI_MODELS or name.startswith("gemini-2.0-"):
        logger.warning(
            "Gemini model %r is deprecated/unavailable; using %s instead.",
            raw,
            DEFAULT_GEMINI_MODEL,
        )
        return DEFAULT_GEMINI_MODEL

    return name


def _resolve_gemini_model() -> str:
    try:
        return normalize_gemini_model(current_app.config["GEMINI_MODEL"])
    except RuntimeError:
        return normalize_gemini_model(os.getenv("GEMINI_MODEL"))


# 入試答案の手書き転記は誤検知が多いため、教育用途ではフィルタを緩める
EXAM_TRANSCRIPTION_SAFETY = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}


_FINISH_REASON_LABELS = {
    0: "未指定",
    1: "STOP",
    2: "MAX_TOKENS",
    3: "SAFETY",
    4: "RECITATION",
    5: "OTHER",
}


def _finish_reason_label(finish_reason) -> str:
    if finish_reason is None:
        return "不明"
    name = getattr(finish_reason, "name", None)
    if name:
        return name
    try:
        return _FINISH_REASON_LABELS.get(int(finish_reason), str(finish_reason))
    except (TypeError, ValueError):
        return str(finish_reason)


def _extract_response_text(response) -> str:
    """response.text を使わず Part からテキストを取り出す（空応答時の例外を避ける）。"""
    if not getattr(response, "candidates", None):
        block = getattr(
            getattr(response, "prompt_feedback", None), "block_reason", None
        )
        if block:
            raise ValueError(
                f"Gemini がプロンプトをブロックしました（block_reason={block}）。"
                " 画像が鮮明か、答案用紙の切り出しが正しいか確認してください。"
            )
        raise ValueError("Gemini が候補応答を返しませんでした。")

    candidate = response.candidates[0]
    finish = getattr(candidate, "finish_reason", None)
    label = _finish_reason_label(finish)

    chunks: list[str] = []
    for cand in response.candidates:
        content = getattr(cand, "content", None)
        if not content or not getattr(content, "parts", None):
            continue
        for part in content.parts:
            text = getattr(part, "text", None)
            if not text:
                continue
            # 2.5 系の思考パートは転記結果に含めない
            if getattr(part, "thought", False):
                continue
            chunks.append(text)

    combined = "\n".join(chunks).strip()
    if combined:
        return combined

    # 最後の手段（旧 SDK の集約テキスト）
    try:
        fallback = (response.text or "").strip()
        if fallback:
            return fallback
    except Exception:
        pass

    if label == "SAFETY" or finish == 3:
        raise ValueError(
            "Gemini の安全フィルタにより転記できませんでした。"
            " 別の画像・設問で再試行するか、確認画面で手入力してください。"
        )
    if label == "MAX_TOKENS" or finish == 2:
        raise ValueError(
            "Gemini の応答が長さ制限で切れました。設問を分けて再試行してください。"
        )

    raise ValueError(
        f"Gemini の応答が空です（finish_reason={label}）。"
        " 画像の解像度・切り出し範囲を確認して再試行してください。"
    )


# API キー未設定（開発・モック）時の各スキーマ向けダミー応答
_MOCK_PAYLOADS: dict[str, dict] = {
    "KarteAdviceResponse": {
        "weaknessSummary": "時制の取り違えとスペルミスが繰り返し見られます。",
        "errorFrequency": {"時制ミス": 3, "スペルミス": 5},
        "adviceCards": [
            {
                "title": "時制の定着",
                "body": "過去形・現在完了の使い分けドリルを週3回実施しましょう。",
                "category": "grammar",
                "priority": "high",
            }
        ],
        "readinessComment": "志望校合格には英作文の安定化が最優先課題です。",
    },
    "DiagnosisResult": {
        "weaknessSummary": "時制の運用とスペルが不安定で、英作文で失点しやすい傾向です。",
        "weaknesses": [
            {
                "label": "時制の運用",
                "category": "grammar",
                "severity": "high",
                "trend": "flat",
                "errorTags": ["時制ミス"],
                "evidence": ["第2回 自由英作文: 過去形→現在完了の誤り"],
            },
            {
                "label": "スペル",
                "category": "vocabulary",
                "severity": "medium",
                "trend": "improving",
                "errorTags": ["スペルミス"],
                "evidence": ["第1回 短答: つづり誤り複数"],
            },
        ],
    },
    "ReadinessResult": {
        "readinessComment": "英作文の安定化が進めば志望校水準に近づけます。",
        "byArea": [
            {
                "area": "自由英作文",
                "currentLevel": "文法ミスで減点されやすい",
                "targetLevel": "減点の少ない論理的な英文",
                "gapComment": "時制とスペルの安定が次の一歩です。",
            }
        ],
        "priorityAreas": ["自由英作文"],
    },
    "AdvicePlanResult": {
        "adviceCards": [
            {
                "title": "時制の定着",
                "body": "過去形・現在完了の使い分けドリルを週3回行いましょう。",
                "category": "grammar",
                "priority": "high",
            }
        ],
        "nextSessionPlan": {
            "focus": "自由英作文の時制精度",
            "recommendedQuestionTypes": ["english"],
            "drillSuggestions": ["時制書き換え10問", "スペル確認テスト"],
        },
    },
    "IntegrityCheck": {
        "passed": True,
        "violations": [],
        "fabricationRisk": [],
    },
    "Q5PassageResult": {
        "title": "A Second Chance",
        "passage": (
            "When Ken joined the volunteer club, he did not expect to fail so publicly. "
            "On the first weekend, he forgot the supplies and the event was cancelled. "
            "His friends were disappointed, and Ken felt ashamed. "
            "The following week, he apologized and made a checklist. "
            "He arrived early, prepared snacks, and guided new members. "
            "By spring, the club welcomed more students than ever. "
            "Ken realized that growth begins when we face mistakes honestly."
        ),
        "wordCount": 80,
        "themeSummary": "失敗から学び、ボランティア活動で成長する高校生",
    },
    "Q5QuestionsResult": {
        "instructions": "次の英文を読み、下の問いに答えなさい。",
        "passageForExam": (
            "When Ken joined the volunteer club, he did not expect to fail so publicly. "
            "On the first weekend, he forgot the supplies and the event was cancelled. "
            "His friends were disappointed, and Ken felt *ashamed*. "
            "The following week, he apologized and made a checklist."
        ),
        "questions": [
            {
                "number": 1,
                "partLabel": "A",
                "questionType": "cloze",
                "prompt": "空所(21)に入る最も適当なものを1つ選べ。",
                "blankLabels": ["(21)"],
                "choices": [
                    {"label": "A", "text": "ashamed"},
                    {"label": "B", "text": "proud"},
                    {"label": "C", "text": "indifferent"},
                    {"label": "D", "text": "angry"},
                ],
            },
            {
                "number": 2,
                "partLabel": "B",
                "questionType": "underlined_explanation",
                "prompt": "下線部の意味として最も適当なものを、日本語で40字以内に述べよ。",
                "underlinedText": "ashamed",
                "charLimitJa": 40,
                "choices": [],
            },
            {
                "number": 3,
                "partLabel": "C",
                "questionType": "content_match",
                "prompt": "本文の内容と一致するものを1つ選べ。",
                "choices": [
                    {"label": "A", "text": "初週末、イベントは中止になった。"},
                    {"label": "B", "text": "ケンは初日から部長になった。"},
                    {"label": "C", "text": "部は賞を受けた。"},
                    {"label": "D", "text": "ケンはすぐに部を辞めた。"},
                ],
            },
        ],
    },
    "Q5SolverResult": {
        "passed": True,
        "answers": [
            {"number": 1, "choice": "A", "answerText": "", "briefReason": "文脈上 ashamed が適切"},
            {
                "number": 2,
                "choice": "",
                "answerText": "恥ずかしく思った、という心情",
                "briefReason": "下線部の語義",
            },
            {"number": 3, "choice": "A", "answerText": "", "briefReason": "初週末に中止とある"},
        ],
        "issues": [],
        "summary": "東大型の設問として成立。",
    },
    "Q5TeacherPackResult": {
        "modelAnswerSummary": "1 A, 2 恥ずかしく思った心情, 3 A。",
        "explanations": [
            {
                "number": 1,
                "correctChoice": "A",
                "answerText": "",
                "explanationJa": "失望のあと恥じている描写です。",
            }
        ],
        "fullTranslationJa": "ケンがボランティア部に入ったとき…（モック全訳）",
        "vocabularyList": ["ashamed — 恥ずかしい"],
    },
    "Q4AProblemResult": {
        "instructions": "次の各英文について、下線部のうち不適切なものを1つずつ選べ。",
        "layout": "five_paragraphs",
        "sourceNote": "モック: AI社会の倫理",
        "items": [
            {
                "number": i,
                "itemLabel": f"({20 + i})",
                "instructionJa": "次の英文の下線部のうち、文法・語法・構文・文脈のいずれかの観点から不適切なものを1つ選べ。",
                "englishBlock": (
                    "The debate over AI ethics *has been growing* rapidly as systems "
                    "*are deployed* in sensitive domains where *policymakers struggle* "
                    "to balance *innovation* with *public trust*."
                ),
                "parts": [
                    {"label": "a", "text": "has been growing"},
                    {"label": "b", "text": "are deployed"},
                    {"label": "c", "text": "sensitive"},
                    {"label": "d", "text": "domains"},
                    {"label": "e", "text": "rapidly"},
                ],
                "errorLabel": "b",
                "errorCategory": "syntax",
            }
            for i in range(1, 6)
        ],
    },
    "Q4AValidatorResult": {
        "passed": True,
        "issues": [],
        "summary": "各問1誤り・東大レベルの誤りとして成立。",
    },
    "Q4ATeacherPackResult": {
        "modelAnswerSummary": "(21) b, (22) b, (23) b, (24) b, (25) b。",
        "explanations": [
            {
                "number": 1,
                "errorLabel": "b",
                "errorCategory": "syntax",
                "explanationJa": "主語 The debate は単数のため are deployed は不適切。",
                "correctionEn": "is deployed",
            }
        ],
    },
}


class GeminiAnalysisClient:
    def __init__(self, api_key: str | None = None, model: str | None = None):
        if api_key is not None:
            self.api_key = api_key
        else:
            self.api_key = _resolve_gemini_api_key()

        if model is not None:
            self.model_name = model
        else:
            self.model_name = _resolve_gemini_model()

        if self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = self._model_for(self.model_name)
            logger.info("Gemini client initialized with model=%s", self.model_name)
        else:
            self.model = None

    def _model_for(self, model_name: str, *, system_instruction: str | None = None):
        return genai.GenerativeModel(
            model_name,
            safety_settings=EXAM_TRANSCRIPTION_SAFETY,
            system_instruction=system_instruction,
        )

    def _generate_content(
        self,
        parts,
        *,
        model: genai.GenerativeModel | None = None,
        **kwargs,
    ):
        active = model or self.model
        try:
            return active.generate_content(parts, **kwargs)
        except Exception as exc:
            message = str(exc).lower()
            if (
                self.model_name != DEFAULT_GEMINI_MODEL
                and ("404" in message or "no longer available" in message or "not found" in message)
            ):
                logger.warning(
                    "Gemini model %s failed (%s); retrying with %s",
                    self.model_name,
                    exc,
                    DEFAULT_GEMINI_MODEL,
                )
                self.model_name = DEFAULT_GEMINI_MODEL
                self.model = self._model_for(self.model_name)
                return self.model.generate_content(parts, **kwargs)
            raise

    def _transcribe_attempt(
        self,
        *,
        model_name: str,
        system: str,
        user_text: str,
        images_jpeg: list[bytes],
        use_pil: bool,
    ) -> str:
        gen_cfg = GenerationConfig(
            temperature=0.1,
            max_output_tokens=8192,
        )
        vision_model = self._model_for(model_name, system_instruction=system)
        content: list = [user_text]
        for raw in images_jpeg:
            prepared = prepare_image_for_gemini(raw)
            if use_pil:
                content.append(Image.open(BytesIO(prepared)))
            else:
                content.append({"mime_type": "image/jpeg", "data": prepared})

        response = self._generate_content(
            content,
            model=vision_model,
            generation_config=gen_cfg,
        )
        return _extract_response_text(response)

    def complete_structured(
        self,
        *,
        system: str,
        user_text: str,
        response_schema: type[BaseModel],
        image_base64: str | None = None,
        media_type: str = "image/jpeg",
        images_jpeg: list[bytes] | None = None,
        max_output_tokens: int = 16384,
        model_name: str | None = None,
    ) -> BaseModel:
        if not self.model:
            return self._mock_response(response_schema)

        prompt = f"{system}\n\n{user_text}\n\nRespond with valid JSON only."
        gen_cfg = GenerationConfig(
            temperature=0.1,
            max_output_tokens=max_output_tokens,
        )
        active_model = self._model_for(
            normalize_gemini_model(model_name or self.model_name),
            system_instruction=system,
        )

        def call():
            parts: list = [prompt]
            if image_base64:
                import base64

                raw = base64.b64decode(image_base64)
                prepared = prepare_image_for_gemini(raw)
                parts.append(Image.open(BytesIO(prepared)))
            if images_jpeg:
                for raw in images_jpeg:
                    prepared = prepare_image_for_gemini(raw)
                    parts.append(Image.open(BytesIO(prepared)))
            response = self._generate_content(
                parts,
                model=active_model,
                generation_config=gen_cfg,
            )
            text = _extract_response_text(response) or "{}"
            logger.info(
                "Gemini analysis completed (model=%s)",
                model_name or self.model_name,
            )
            return parse_json_response(text, response_schema)

        return with_retry(call)

    def transcribe_images(
        self,
        *,
        system: str,
        user_text: str,
        images_jpeg: list[bytes],
    ) -> str:
        if not self.model:
            raise RuntimeError(
                "GEMINI_API_KEY が未設定です。.env に HGK_GEMINI_API_KEY または GEMINI_API_KEY を設定してください。"
            )

        if not images_jpeg:
            raise ValueError("転記する画像がありません。")

        models_to_try: list[str] = []
        for name in [self.model_name, *TRANSCRIPTION_MODEL_FALLBACKS]:
            normalized = normalize_gemini_model(name)
            if normalized not in models_to_try:
                models_to_try.append(normalized)

        minimal_user = (
            "添付は大学入試の手書き答案欄です。"
            "善意に解釈し、生徒の答えとして自然な文・記号だけを書き起こしてください。"
            "説明や採点は不要。転記テキストのみ出力。"
        )

        # 1設問あたり最大3回（APIコストと待ち時間を抑える）
        strategies: list[dict] = [
            {
                "model_name": models_to_try[0],
                "system": system,
                "user_text": user_text,
                "use_pil": True,
            },
        ]
        if len(models_to_try) > 1:
            strategies.append(
                {
                    "model_name": models_to_try[1],
                    "system": system,
                    "user_text": user_text,
                    "use_pil": True,
                }
            )
        strategies.append(
            {
                "model_name": models_to_try[0],
                "system": (system.split("\n")[0] if system else "手書き答案を転記する。"),
                "user_text": minimal_user,
                "use_pil": True,
            }
        )

        last_error: Exception | None = None
        for idx, strategy in enumerate(strategies):
            try:
                text = self._transcribe_attempt(
                    model_name=strategy["model_name"],
                    system=strategy["system"],
                    user_text=strategy["user_text"],
                    images_jpeg=images_jpeg,
                    use_pil=strategy["use_pil"],
                )
                if text:
                    if strategy["model_name"] != self.model_name:
                        logger.info(
                            "Transcription succeeded with fallback model %s (attempt %s)",
                            strategy["model_name"],
                            idx + 1,
                        )
                    return text
            except ValueError as exc:
                last_error = exc
                logger.warning(
                    "Gemini transcription attempt %s failed (model=%s, pil=%s): %s",
                    idx + 1,
                    strategy["model_name"],
                    strategy["use_pil"],
                    exc,
                )
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Gemini transcription attempt %s error (model=%s): %s",
                    idx + 1,
                    strategy["model_name"],
                    exc,
                )

        if last_error:
            raise last_error
        raise ValueError(
            "Gemini が答案の転記結果を返しませんでした。"
            " 切り出し範囲と画像の鮮明さを確認し、再試行してください。"
        )

    def _mock_response(self, schema: type[BaseModel]) -> BaseModel:
        mock = _MOCK_PAYLOADS.get(schema.__name__)
        if mock is not None:
            return schema.model_validate(mock)

        raise RuntimeError(
            "GEMINI_API_KEY が未設定です。.env に HGK_GEMINI_API_KEY または GEMINI_API_KEY を設定してください。"
        )
