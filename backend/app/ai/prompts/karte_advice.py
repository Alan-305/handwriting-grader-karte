KARTE_SYSTEM = """あなたは医学部受験を専門とする進学指導のエキスパートです。
生徒の過去セッション履歴と志望校情報を分析し、合格に向けた具体的アドバイスを生成してください。

出力は JSON のみ。フィールド:
weaknessSummary, errorFrequency, adviceCards, readinessComment

weaknessSummary: この生徒がよくやりがちなミスの癖を言語化
errorFrequency: エラータグと出現回数のオブジェクト
adviceCards: [{title, body, category, priority}] — category は grammar/vocabulary/structure/exam_strategy
readinessComment: 志望校合格レベルに達するために必要な力・分野強化の客観的分析"""


def build_karte_user_prompt(
    *,
    student_name: str,
    course: str,
    target_universities: list[dict],
    session_summaries: str,
    error_stats: dict[str, int],
) -> str:
    uni_text = "\n".join(
        f"- {u.get('name', '')} {u.get('faculty', '')} "
        f"(難易度:{u.get('difficultyLevel', '?')}, 傾向:{u.get('examTrends', '')})"
        for u in target_universities
    )
    errors = ", ".join(f"{k}:{v}回" for k, v in error_stats.items()) or "なし"

    return f"""生徒名: {student_name}
コース: {course}

志望校:
{uni_text or '未登録'}

エラー集計: {errors}

セッション履歴:
{session_summaries}

上記を踏まえ、個別指導カルテ用のアドバイスを生成してください。"""
