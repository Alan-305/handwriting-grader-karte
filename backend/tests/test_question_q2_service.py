from app.ai.schemas.q2_comprehensive_generation import (
    Q2ChoiceItem,
    Q2ComprehensiveGenerationResult,
    Q2ClozeBlank,
    Q2EssayAnswerExample,
    Q2IdiomQuestion,
)
from app.services.question_q2_service import (
    QuestionQ2Service,
    assemble_q2_model_answer,
    assemble_q2_prompt,
    english_word_count,
)


def test_assemble_q2_prompt_includes_six_questions():
    result = Q2ComprehensiveGenerationResult(
        instructions_ja="次の英文を読み、下の問いに答えなさい。",
        passage_for_exam="(1) Medical history passage.\n\n(2) Continued.",
        comprehension_prompt_ja="第2段落の内容を説明せよ。",
        comprehension_char_limit_ja=80,
        idiom_questions=[
            Q2IdiomQuestion(
                underlined_text="rule out",
                choices=[Q2ChoiceItem(label="A", text="exclude"), Q2ChoiceItem(label="B", text="include")],
                correct_label="A",
            )
        ],
        truth_prompt_ja="正しいものを1つ選べ。",
        truth_choices=[Q2ChoiceItem(label="A", text="The discovery was immediate.")],
        interpretation_prompt_ja="筆者の主張を説明せよ。",
        cloze_prompt_ja="空所に入る語を選べ。",
        cloze_blanks=[Q2ClozeBlank(blank_label="(ア)", choices=[Q2ChoiceItem(label="A", text="However")])],
        essay_prompt_ja="本文のテーマについて意見を述べよ。",
        essay_word_min=80,
    )
    text = assemble_q2_prompt(result=result)
    assert "問1" in text
    assert "問6" in text
    assert "*rule out*" in text
    assert "80語以上" in text


def test_assemble_q2_model_answer_two_essay_examples():
    essay = "word " * 85
    result = Q2ComprehensiveGenerationResult(
        model_answer_comprehension_ja="段落の要約。",
        idiom_questions=[Q2IdiomQuestion(correct_label="B", explanation_ja="文脈より。")],
        truth_correct_label="C",
        truth_rationale_ja="本文と一致。",
        model_answer_interpretation_ja="筆者は…",
        cloze_blanks=[Q2ClozeBlank(blank_label="(ア)", correct_label="D", explanation_ja="逆接。")],
        essay_answer_examples=[
            Q2EssayAnswerExample(stance_label="賛成", answer_en=essay, explanation_ja="科学的根拠あり。"),
            Q2EssayAnswerExample(stance_label="反対", answer_en=essay, explanation_ja="慎重論。"),
        ],
        passage_summary_ja="医学史の評論。",
    )
    text = assemble_q2_model_answer(result=result)
    assert "【問6】" in text
    assert "賛成" in text
    assert "反対" in text


def test_structural_issues_flags_missing_essay_examples():
    result = Q2ComprehensiveGenerationResult(
        passage_for_exam="word " * 1050,
        comprehension_prompt_ja="説明せよ",
        model_answer_comprehension_ja="解答",
        idiom_questions=[Q2IdiomQuestion()],
        truth_choices=[Q2ChoiceItem(label="A", text="Statement")],
        truth_correct_label="A",
        interpretation_prompt_ja="主張",
        model_answer_interpretation_ja="解答",
        cloze_blanks=[Q2ClozeBlank()],
        essay_prompt_ja="意見を述べよ",
        essay_answer_examples=[Q2EssayAnswerExample(answer_en="short")],
        passage_summary_ja="要約",
    )
    issues = QuestionQ2Service._structural_issues(result)
    assert any("2パターン" in i for i in issues)
    assert any("80語" in i for i in issues)
