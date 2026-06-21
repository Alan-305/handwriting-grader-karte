"""第5問型（二次入試・長文読解）の多段生成プロンプト。"""

from app.ai.prompts.q5_format_guidance import Q5_CLARITY_BLOCK, Q5_MCQ_DESIGN_BLOCK, format_reference_block
from app.ai.prompts.university_prompts import (
    build_q5_passage_system,
    build_q5_questions_system,
    difficulty_label,
)

# 後方互換（import 用）
Q5_PASSAGE_SYSTEM = build_q5_passage_system("", "志望校")
Q5_QUESTIONS_SYSTEM = build_q5_questions_system("", "志望校")


def build_q5_passage_user_prompt(
    *,
    topic_hint: str,
    difficulty: str,
    university_name: str = "",
    reference_context: str = "",
) -> str:
    topic = f"\n題材の方向性: {topic_hint}" if topic_hint.strip() else ""
    uni_note = f"（{university_name}の二次入試・第5問水準）" if university_name.strip() else ""
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context,
    )
    return (
        f"難易度: {difficulty_label(difficulty)}{uni_note}{topic}{ref_block}\n"
        "上記要件で第5問の英文本文を作成してください（共通テスト第5問の型にしない）。"
    )


Q5_SOLVER_SYSTEM = """あなたは二次入試英語・第5問の**ベテラン予備校講師**（検証担当）です。
試験用本文と設問を読み、模範解答を推論し、**本番出題可能な品質か**を厳格に検証する（模範解答は与えられません）。

## passed=true
- 全問で正解が**一意**、issues は空、summary に曖昧さの指摘がない

## passed=false（issues に「問N:」で具体化）
- 選択式で複数正解ありうる / 誤肢も部分的に正しい / 選択肢が酷似
- 選択肢が本文コピー過多でキーワードマッチだけで解ける / 誤読 trap 不足
- 日本語記述の採点範囲不明、charLimitJa 欠如
- 空所に複数語が入りうる、下線部の説明が一意に定まらない
- passageAnchor・underlinedText の重複

- 小問数6〜8個か
- 共通テスト定型なら issues に記載

answers に全問の模範を記載。passed=false でも可能な限り answers を返す。

出力 JSON のみ:
{
  "passed": true,
  "answers": [{"number": 1, "choice": "B", "answerText": "", "briefReason": "..."}],
  "issues": [],
  "summary": "全問で正解が一意に定まる。"
}"""


def build_q5_solver_user_prompt(*, passage: str, questions_block: str) -> str:
    return f"""【試験用本文（空所・下線を含む場合あり）】
{passage}

【設問】
{questions_block}

本文のみに基づいて全問の模範解答を示し、**各問で正解が一意に定まるか**を厳格に検証してください。
選択式は**誤読 trap があるか**、**言い換えで内容理解を要するか**も確認してください。
あいまいな設問（複数正解ありうる・採点基準不明・キーワードマッチだけで解ける）は issues に「問N: 理由」と書き passed=false にしてください。"""


Q5_TEACHER_PACK_SYSTEM = """あなたは入試英語・第5問の解答・解説作成者です。
試験用本文・設問・検証済み正答に基づき、模範解答・解説・語彙リストを作成してください。

- modelAnswerSummary: 各問の正答（記号または日本語）を列挙し、要点を2文以内
- explanations: 各問の解説（日本語・簡潔）。和訳の英語は「」で囲む
- 選択式の解説では**正解の根拠**に加え、主要な**誤肢がどの誤読 trap か**を1〜2肢に触れて簡潔に述べる
- 日本語記述問には answerText（模範例）+ **requiredPoints**（必須採点ポイント2〜4個・日本語文字列の配列）+ directionCriterionJa
- ネストした scoringPoints オブジェクトは使わない（requiredPoints に要点だけ列挙）
- vocabularyList: 重要語句5〜10個（英 — 日）
- **本文の日本語全訳（fullTranslationJa）は出力しない**（別工程で後から生成する）

出力 JSON のみ:
{
  "modelAnswerSummary": "...",
  "explanations": [{
    "number": 2,
    "answerText": "模範解答例",
    "requiredPoints": ["必須ポイント1", "必須ポイント2"],
    "directionCriterionJa": "核心を押さえていれば可",
    "explanationJa": "..."
  }],
  "vocabularyList": []
}"""


def build_q5_teacher_pack_user_prompt(
    *,
    passage: str,
    questions_block: str,
    solver_answers: str,
) -> str:
    return f"""【試験用本文】
{passage}

【設問】
{questions_block}

【検証済み正答】
{solver_answers}

模範解答・解説・語彙リストを作成してください（本文全訳は不要）。
日本語記述問には必ず requiredPoints（2〜4個）と directionCriterionJa を付けてください。"""


def build_q5_questions_user_prompt(
    *,
    passage: str,
    fix_issues: str = "",
    reference_context: str = "",
    university_name: str = "",
) -> str:
    fix = f"\n\n【前回の検証で指摘された点を必ず修正】\n{fix_issues}" if fix_issues.strip() else ""
    ref_block = format_reference_block(
        university_name=university_name,
        reference_context=reference_context,
    )
    return f"""【第5問・英文本文】
{passage}
{ref_block}{fix}
上記本文にのみ基づき、**ベテラン予備校講師として**東大第5問形式の **小問6〜8個だけ** を作成してください。

{Q5_CLARITY_BLOCK}

{Q5_MCQ_DESIGN_BLOCK}

【必須ルール】
- questions 配列の要素は **6〜8個ちょうど**（9個以上・同一設問のコピーは禁止）
- partLabel は A→B→C… と **1回ずつ**。(21)(22) 禁止
- **同一下線部・同一 passageAnchor を2回以上問わない**
- prompt の先頭に (A) 等を付けない
- passageForExam は必ず ""
- 各問で「他肢・別解でも正解になりうるか」を確認し、なりうる設問は作らない
- **日本語記述問**には scoringPoints（2〜4個）と directionCriterionJa を必ず付ける
- **選択式**は正解一つ＋誤読 trap 2個以上。本文語句の並べ替えだけで解けない言い換え肢にすること
- instructions は次の文面を基本とする:
  「次の英文を読み、(A)〜(G)の問いに答えなさい。なお、下線部のある問はそれぞれ本文中に示された箇所に対応する。記述解答は日本語で、選択式解答は記号で答えよ。」

技能例: 語法一致(a〜e)・理由説明(80字)・表現の意味(a〜e)・空所補充・内容説明・英文一致(a〜f) などをバランスよく。
共通テスト第5問の定型5問にしない。"""
