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
    ) -> BaseModel:
        if not self.model:
            return self._mock_response(response_schema)

        prompt = f"{system}\n\n{user_text}\n\nRespond with valid JSON only."

        def call():
            response = self._generate_content(prompt)
            text = _extract_response_text(response) or "{}"
            logger.info("Gemini analysis completed")
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
        if schema.__name__ == "KarteAdviceResponse":
            mock = {
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
            }
            return schema.model_validate(mock)

        raise RuntimeError(
            "GEMINI_API_KEY が未設定です。.env に HGK_GEMINI_API_KEY または GEMINI_API_KEY を設定してください。"
        )
