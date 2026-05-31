"""多段カルテ分析の各ステージ用プロンプト。

共通コンテキスト（生徒・志望校・面談・集計）を1か所で組み立て、
各ステージはそれぞれの指示文だけを差し替える。
karte_advice.py の整形ヘルパーを再利用する。
"""

from __future__ import annotations

import json

from app.ai.prompts.karte_advice import (
    _format_common_test_scores,
    _format_confirmed_facts,
    _format_interview_records,
)

# すべてのステージで厳守する共通制約（KARTE_SYSTEM と grading-criteria に準拠）
KARTE_COMMON_RULES = """厳守事項:
- 面談プロフィールに登録された志望校・学部・確定事項「のみ」を前提に話すこと。
- 登録されていない大学・学部・入試区分には一切触れないこと。
- 共通テストは登録された得点帯・状態のみ参照し、数値を推測・捏造しないこと。
- 「不合格」という言葉は絶対に使わないこと。前向きで次の学習につながる表現にすること。
- 高校生にも分かるよう、やさしく簡潔に。冗長な長文は避けること。
- 出力は指定された JSON のみ。前後に説明文を付けないこと。"""


def build_context_block(
    *,
    student_name: str,
    target_universities: list[dict],
    session_summaries: str,
    error_stats: dict[str, int],
    interview_profile: dict | None = None,
    interview_records: list[dict] | None = None,
    error_by_session: list[dict] | None = None,
) -> str:
    """全ステージ共通の入力コンテキストを文字列化する。"""
    profile = interview_profile or {}
    targets = profile.get("targetUniversities") or []
    if targets:
        uni_sources = []
        for tu in targets:
            uni = next(
                (u for u in target_universities if u.get("id") == tu.get("universityId")),
                None,
            )
            uni_sources.append(uni or tu)
    else:
        uni_sources = target_universities

    uni_text = (
        "\n".join(
            f"- 第{u.get('priority', '?')}志望: {u.get('name', '')} {u.get('faculty', '')} "
            f"(難易度:{u.get('difficultyLevel', '?')}, 傾向:{u.get('examTrends', '')})"
            for u in uni_sources
        )
        or "未登録 — 面談画面で志望校を登録してください"
    )

    year = profile.get("commonTestYear")
    year_line = f"{year}年度" if year else "未選択"
    common_test_block = _format_common_test_scores(profile.get("commonTestScores"))
    facts_block = _format_confirmed_facts(profile.get("confirmedFactIds"))
    records_block = _format_interview_records(interview_records)

    errors = ", ".join(f"{k}:{v}回" for k, v in error_stats.items()) or "なし"

    trend_block = "（時系列データなし）"
    if error_by_session:
        lines = []
        for block in error_by_session:
            order = block.get("order", "?")
            tags = block.get("tags") or []
            tag_text = (
                ", ".join(f"{t.get('tag')}×{t.get('count')}" for t in tags)
                or "ミスなし"
            )
            lines.append(f"第{order}回: {tag_text}")
        trend_block = "\n".join(lines)

    return f"""生徒名: {student_name}

【面談で確定した志望校】（このリスト以外の学部・大学には言及しないこと）
{uni_text}

【大学入学共通テスト】受験年度: {year_line}
{common_test_block}

【面談で確定した事項】
{facts_block}

【面談記録（時系列・全回）】
{records_block}

【エラー集計（添削履歴・累積）】
{errors}

【ミス傾向の時系列（回ごと）】
{trend_block}

【セッション履歴】
{session_summaries}"""


# ---------------------------------------------------------------------------
# Stage 1: 弱点診断
# ---------------------------------------------------------------------------
DIAGNOSIS_SYSTEM = f"""あなたは難関大学・医学部受験を専門とする進学指導のエキスパートです。
添削履歴と集計データから、この生徒の弱点を「根拠付き」で診断してください。

{KARTE_COMMON_RULES}

出力 JSON フィールド:
- weaknessSummary: 弱点の全体傾向を1〜3文で言語化
- weaknesses: [{{label, category, severity, trend, errorTags, evidence}}]
  - category は grammar / vocabulary / structure / exam_strategy
  - severity は high / medium / low
  - trend は improving / flat / worsening（ミス傾向の時系列から判断）
  - evidence は「どの回・どの観点が根拠か」を必ず1つ以上。集計に現れない弱点は出さない。"""


def build_diagnosis_prompt(context_block: str) -> str:
    return (
        f"{context_block}\n\n"
        "上記の事実のみを根拠に、弱点を診断してください。"
        "各弱点には必ず evidence（回・観点）を付けること。"
    )


# ---------------------------------------------------------------------------
# Stage 2: 志望校ギャップ分析
# ---------------------------------------------------------------------------
READINESS_SYSTEM = f"""あなたは難関大学・医学部受験を専門とする進学指導のエキスパートです。
診断された弱点を、登録された志望校の出題傾向に照らして「到達度・ギャップ」として分析してください。

{KARTE_COMMON_RULES}

出力 JSON フィールド:
- readinessComment: 登録志望校の合格レベルに向けた全体の到達度コメント（前向きに）
- byArea: [{{area, currentLevel, targetLevel, gapComment}}]
  - area は分野（例: 自由英作文 / 100字記述 / 短答 など）
  - currentLevel は現状、targetLevel は志望校が要求する水準、gapComment は差の言語化
- priorityAreas: 優先的に強化すべき分野名の配列（重要順）"""


def build_readiness_prompt(context_block: str, diagnosis_json: str) -> str:
    return (
        f"{context_block}\n\n"
        f"【Stage1 弱点診断の結果】\n{diagnosis_json}\n\n"
        "上記の弱点診断と、登録志望校の出題傾向を突き合わせ、分野別の到達度とギャップを分析してください。"
    )


# ---------------------------------------------------------------------------
# Stage 3: 指導プラン生成
# ---------------------------------------------------------------------------
ADVICE_PLAN_SYSTEM = f"""あなたは難関大学・医学部受験を専門とする進学指導のエキスパートです。
弱点診断と志望校ギャップ分析を踏まえ、具体的な指導アドバイスと次回の出題プランを作成してください。
面談記録がある場合は、生徒の相談に答える形で一貫性を保つこと。

{KARTE_COMMON_RULES}

出力 JSON フィールド:
- adviceCards: [{{title, body, category, priority}}]
  - category は grammar / vocabulary / structure / exam_strategy
  - priority は high / medium / low
- nextSessionPlan: {{focus, recommendedQuestionTypes, drillSuggestions}}
  - focus は次回指導の主眼、recommendedQuestionTypes は推奨出題タイプ、drillSuggestions は具体ドリル"""


def build_advice_plan_prompt(
    context_block: str, diagnosis_json: str, readiness_json: str
) -> str:
    return (
        f"{context_block}\n\n"
        f"【Stage1 弱点診断】\n{diagnosis_json}\n\n"
        f"【Stage2 志望校ギャップ分析】\n{readiness_json}\n\n"
        "上記を踏まえ、指導アドバイスと次回の出題プランを作成してください。"
    )


# ---------------------------------------------------------------------------
# Stage 4: 整合チェック（自己検証）
# ---------------------------------------------------------------------------
INTEGRITY_SYSTEM = """あなたは生成物を厳しく検証する独立した評価者です。
以下のカルテ生成結果が、登録情報とプロジェクト制約に反していないかを点検してください。
あなた自身が新しい助言を加えてはいけません。点検のみ行うこと。

検出すべき違反:
1. 登録された志望校・学部・確定事項以外の大学・学部・入試区分への言及。
2. 共通テスト得点の捏造（登録された得点帯・状態以外の具体的数値）。
3. 「不合格」という語の使用。
4. 集計・履歴に根拠がない断定（evidence の伴わない弱点・主張）。

出力 JSON フィールド:
- passed: 上記すべてに違反がなければ true、1つでもあれば false
- violations: 検出した違反の説明（日本語、簡潔に）
- fabricationRisk: 事実・得点の捏造が疑われる箇所"""


def build_integrity_prompt(
    *,
    allowed_universities: list[dict],
    diagnosis_json: str,
    readiness_json: str,
    advice_plan_json: str,
    common_test_scores: dict | None,
) -> str:
    uni_lines = (
        "\n".join(
            f"- {u.get('name', '')} {u.get('faculty', '')}" for u in allowed_universities
        )
        or "（登録なし）"
    )
    scores_block = _format_common_test_scores(common_test_scores)
    return (
        "【登録されている志望校（これ以外への言及は違反）】\n"
        f"{uni_lines}\n\n"
        "【登録されている共通テスト得点帯（これ以外の具体数値は捏造）】\n"
        f"{scores_block}\n\n"
        "【点検対象: Stage1 弱点診断】\n"
        f"{diagnosis_json}\n\n"
        "【点検対象: Stage2 志望校ギャップ分析】\n"
        f"{readiness_json}\n\n"
        "【点検対象: Stage3 指導プラン】\n"
        f"{advice_plan_json}\n\n"
        "上記の制約に照らして点検し、結果を JSON で返してください。"
    )


def to_json(model) -> str:
    """pydantic モデルを後段プロンプトに埋め込む用の JSON 文字列化。"""
    if hasattr(model, "model_dump"):
        return json.dumps(model.model_dump(by_alias=True), ensure_ascii=False, indent=2)
    return json.dumps(model, ensure_ascii=False, indent=2)
