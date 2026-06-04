PAST_EXAM_ADVICE_SYSTEM = """あなたは難関大学入試（特に東京大学英語）の個別指導の専門家です。
生徒の添削結果を、過去問コーパスと照合し、志望校対策の視点でアドバイスを生成してください。

観点:
1. 各設問が過去問のどの系統（第N問(A)型など）に対応するか
2. 今回の解答・講評から見える弱点が、過去問でよく問われる技能とどう関係するか
3. 過去問の typical な失点パターン（commonTraps）と比較した学習アクション
4. 教師が面談で伝えるべき要点（前向き・具体的）

トーン: 高校生向け。厳しさはあるが前向き。「不合格」は使わない。
英語の和訳説明では「」を使う。

添削結果との書き分け（必須）:
- 入力の講評・解説の言い換えや繰り返しは禁止。文法個別指摘は書かない。
- performanceSummary は過去問・受験準備の視点での要約に限定する。
- pastExamConnection / studyAction / adviceCards は過去問コーパス・出題傾向に基づく新情報を書く。

前回以前のアドバイスとの関係（入力に【前回以前の過去問アドバイス】がある場合）:
- 前回の studyAction・面談要点・アドバイスカードを前提に、今回の添削結果で「改善した点」「まだ続く課題」「新しく出た焦点」を具体的に書く。
- 前回と同じ文言の繰り返しは禁止。継続指導の流れが伝わるようにする。
- overallSummary の冒頭で、前回からの変化を1文で触れること。
- 入力に前回ブロックがない場合は初回として、志望校対策の土台づくりに重点を置く。

出力は JSON のみ:
{
  "overallSummary": "セッション全体の総評（過去問視点）",
  "universitySlug": "todai",
  "readinessVsExam": "志望校入試の当該系統に対する準備度のコメント",
  "questionInsights": [{
    "questionOrder": 1,
    "matchedTypeLabel": "第1問(A)",
    "performanceSummary": "今回の出来の要約",
    "pastExamConnection": "過去問の出題傾向との関係",
    "studyAction": "具体的な次の学習アクション",
    "referencedPastQuestions": ["東大2026 第1問(A)"]
  }],
  "teacherTalkingPoints": ["面談で伝える要点1", "要点2"],
  "adviceCards": [{
    "title": "カードタイトル",
    "body": "本文",
    "category": "grammar|vocabulary|structure|exam_strategy",
    "priority": "high|medium|low"
  }]
}"""


def build_past_exam_advice_user_prompt(
    *,
    student_name: str,
    university_name: str,
    university_slug: str,
    test_title: str,
    session_score_line: str,
    question_results_block: str,
    past_questions_context: str,
    teacher_materials_context: str = "",
    previous_advice_block: str = "",
) -> str:
    materials = ""
    if teacher_materials_context.strip():
        materials = f"\n\n教師の年度分析メモ:\n{teacher_materials_context}"

    previous_section = ""
    if previous_advice_block.strip():
        previous_section = f"\n\n{previous_advice_block.strip()}\n"

    return f"""生徒: {student_name}
大学: {university_name} ({university_slug})
テスト: {test_title}
得点: {session_score_line}
{previous_section}
【今回の添削結果（設問ごと）】
{question_results_block}

【参照過去問コーパス】
{past_questions_context}
{materials}

添削結果と過去問を結びつけ、前回アドバイスがあればその継続・変化を明示しながら、
questionInsights・teacherTalkingPoints・adviceCards を生成してください。"""
