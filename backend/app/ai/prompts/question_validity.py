VALIDITY_CHECK_SYSTEM = """あなたは難関大学入試（特に東京大学英語）の問題作成・分析の専門家です。
教師が作成した練習問題を、同じ大学の過去問コーパスと比較し、出題系統の妥当性を評価してください。

評価の観点:
1. 出題系統（第N問(A)型など）との一致度
2. 技能・形式（要約字数、語数、選択肢形式など）の適切さ
3. 難易度・題材の長さが過去問水準と比べて妥当か
4. この問題で当該系統の対策として十分か（sufficient / partial / insufficient）

修正提案は必ず具体的に:
- 問題文・模範解答・配点・指示文のどれを直すか field に指定
- currentExcerpt に現状の該当部分（短く抜粋）
- proposedText にそのまま使える修正案全文
- reason に過去問を根拠にした理由

トーン: 高校生向け指導の現場で使える、前向きで具体的な表現。「不合格」という語は使わない。

出力は JSON のみ。スキーマ:
{
  "overallSummary": "テスト全体の総評",
  "universitySlug": "todai",
  "items": [{
    "questionOrder": 1,
    "matchedTypeLabel": "第1問(A)",
    "coverage": "sufficient|partial|insufficient",
    "summary": "設問ごとの総評",
    "improvements": ["改善点1", "改善点2"],
    "referencedPastQuestions": ["東大2026 第1問(A)", "東大2025 第1問(A)"],
    "revisionSuggestions": [{
      "field": "prompt|modelAnswer|points|instructions",
      "currentExcerpt": "...",
      "proposedText": "...",
      "reason": "..."
    }]
  }]
}"""


def build_validity_user_prompt(
    *,
    university_name: str,
    university_slug: str,
    teacher_test_title: str,
    teacher_questions: list[dict],
    past_questions_context: str,
    teacher_materials_context: str = "",
) -> str:
    teacher_lines = []
    for q in teacher_questions:
        teacher_lines.append(
            f"--- 設問 order={q.get('order')} ---\n"
            f"type: {q.get('type')}\n"
            f"prompt:\n{q.get('prompt', '')}\n"
            f"modelAnswer:\n{q.get('modelAnswer', '')}\n"
            f"points: {q.get('points', 0)}\n"
        )

    materials_block = ""
    if teacher_materials_context.strip():
        materials_block = f"\n\n教師の年度分析メモ:\n{teacher_materials_context}"

    return f"""大学: {university_name} ({university_slug})
テスト名: {teacher_test_title}

【教師が作成した問題】
{"".join(teacher_lines)}

【参照過去問コーパス】
{past_questions_context}
{materials_block}

各教師設問について、最も近い過去問の系統と比較し、coverage・改善点・具体的な修正提案を返してください。"""
