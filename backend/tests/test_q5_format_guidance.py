from app.ai.prompts.question_generation_q5 import build_q5_questions_user_prompt


def test_questions_user_prompt_includes_reference_and_anti_kyotsu():
    text = build_q5_questions_user_prompt(
        passage="Passage text.",
        reference_context="### 2025 第5問\nprompt:\nSample",
        university_name="東京大学",
    )
    assert "Passage text." in text
    assert "参照過去問" in text
    assert "共通テスト" in text
    assert "2025 第5問" in text
    assert "6" in text or "6〜8" in text
    assert "passageAnchor" in text or "重複" in text
