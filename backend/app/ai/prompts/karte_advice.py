KARTE_SYSTEM = """あなたは難関大学・医学部受験を専門とする進学指導のエキスパートです。
生徒の面談で確定した志望校・共通テスト・確定事項と、添削セッション履歴を分析し、
個別指導カルテ用のアドバイスを生成してください。

厳守:
- 面談プロフィールに登録された志望校・学部・確定事項「のみ」を前提に話すこと。
- 登録されていない大学・学部・入試区分（例: 志望にない理系・文系・医学部）には触れないこと。
- 「上記志望以外の学部・入試区分は話さない」が確定事項に含まれる場合は特に厳守すること。
- 共通テストの得点は登録された得点帯・状態のみ参照し、推測で数値を捏造しないこと。

出力は JSON のみ。フィールド:
weaknessSummary, errorFrequency, adviceCards, readinessComment

weaknessSummary: この生徒がよくやりがちなミスの癖を言語化
errorFrequency: エラータグと出現回数のオブジェクト
adviceCards: [{title, body, category, priority}] — category は grammar/vocabulary/structure/exam_strategy
readinessComment: 登録志望校の合格レベルに達するために必要な力・分野強化の客観的分析"""

_COMMON_TEST_SCORE_LABELS = {
    "": "未入力",
    "not_taken": "未受験",
    "pending": "未発表・未定",
    "under_40": "40点未満",
    "40_49": "40〜49点",
    "50_59": "50〜59点",
    "60_69": "60〜69点",
    "70_79": "70〜79点",
    "80_89": "80〜89点",
    "90_99": "90〜99点",
    "100": "100点",
}

_COMMON_TEST_SUBJECT_LABELS = {
    "englishReading": "英語（リーディング）",
    "englishListening": "英語（リスニング）",
    "math1": "数学①",
    "math2": "数学②",
    "japanese": "国語",
    "science1": "理科①",
    "science2": "理科②",
    "geographyHistoryCivics": "地歴公民",
    "information": "情報",
}

_CONFIRMED_FACT_LABELS = {
    "med_school": "医学部（国公立・私立）を志望",
    "todai_sci_3": "東京大学理科三類を志望",
    "todai_lit_1": "東京大学文科一類を志望",
    "todai_sci_general": "東京大学理科系（理三以外）を志望",
    "todai_lit_general": "東京大学文科系（文一以外）を志望",
    "kyutei_sci": "旧帝大理系（東大以外）を志望",
    "kyutei_lit": "旧帝大文系を志望",
    "waseda_keio": "早慶上智クラスを志望",
    "current_senior": "現役高校3年",
    "ronin": "浪人生",
    "english_focus": "英語対策を最優先",
    "common_test_primary": "共通テスト利用入試が中心",
    "secondary_only": "二次・個別学力試験が中心",
    "no_other_faculty": "上記志望以外の学部・入試区分は話さない（面談合意）",
}


def _format_common_test_scores(scores: dict | None) -> str:
    if not scores:
        return "未登録"
    lines = []
    for key, value in scores.items():
        if not value:
            continue
        subj = _COMMON_TEST_SUBJECT_LABELS.get(key, key)
        band = _COMMON_TEST_SCORE_LABELS.get(str(value), str(value))
        lines.append(f"- {subj}: {band}")
    return "\n".join(lines) if lines else "（科目未入力）"


def _format_confirmed_facts(fact_ids: list | None) -> str:
    if not fact_ids:
        return "未登録"
    return "\n".join(
        f"- {_CONFIRMED_FACT_LABELS.get(fid, fid)}" for fid in fact_ids
    )


def _format_interview_records(records: list[dict] | None) -> str:
    if not records:
        return "（面談記録なし）"
    lines = []
    for rec in sorted(records, key=lambda r: r.get("recordNumber") or 0):
        num = rec.get("recordNumber", "?")
        consultation = (rec.get("studentConsultation") or "").strip() or "（なし）"
        advice = (rec.get("teacherAdvice") or "").strip() or "（なし）"
        lines.append(
            f"--- 第{num}回面談 ---\n"
            f"【生徒の相談】\n{consultation}\n"
            f"【教師のアドバイス】\n{advice}"
        )
    return "\n\n".join(lines)


def build_karte_user_prompt(
    *,
    student_name: str,
    course: str,
    target_universities: list[dict],
    session_summaries: str,
    error_stats: dict[str, int],
    interview_profile: dict | None = None,
    interview_records: list[dict] | None = None,
) -> str:
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

    uni_text = "\n".join(
        f"- 第{u.get('priority', '?')}志望: {u.get('name', '')} {u.get('faculty', '')} "
        f"(難易度:{u.get('difficultyLevel', '?')}, 傾向:{u.get('examTrends', '')})"
        for u in uni_sources
    )

    year = profile.get("commonTestYear")
    year_line = f"{year}年度" if year else "未選択"
    common_test_block = _format_common_test_scores(profile.get("commonTestScores"))
    facts_block = _format_confirmed_facts(profile.get("confirmedFactIds"))
    notes = (profile.get("additionalNotes") or "").strip()
    records_block = _format_interview_records(interview_records)

    errors = ", ".join(f"{k}:{v}回" for k, v in error_stats.items()) or "なし"

    notes_block = f"\n【補足メモ（旧形式）】\n{notes}" if notes else ""

    return f"""生徒名: {student_name}
コース: {course}

【面談で確定した志望校】（最新。このリスト以外の学部・大学には言及しないこと）
{uni_text or '未登録 — 面談画面で志望校を登録してください'}

【大学入学共通テスト】受験年度: {year_line}
{common_test_block}

【面談で確定した事項】
{facts_block}
{notes_block}

【面談記録（時系列・全回）】
生徒の相談と教師アドバイスを分けて記録しています。指導の一貫性と変化を踏まえて分析すること。
{records_block}

エラー集計（添削履歴）: {errors}

セッション履歴:
{session_summaries}

上記の面談プロフィール・面談記録・添削履歴のみを根拠に、個別指導カルテ用のアドバイスを生成してください。"""
