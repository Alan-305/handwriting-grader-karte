from app.ai.schemas.q1_comprehensive_generation import (
    Q1ChoiceItem,
    Q1ComprehensiveGenerationResult,
    Q1ClozeBlank,
    Q1SynonymQuestion,
)
from app.services.question_q1_service import (
    QuestionQ1Service,
    assemble_q1_model_answer,
    assemble_q1_prompt,
    english_word_count,
)


def test_english_word_count():
    assert english_word_count("Hello world test") == 3


def test_assemble_q1_prompt_includes_all_questions():
    result = Q1ComprehensiveGenerationResult(
        instructions_ja="次の英文を読み、下の問いに答えなさい。",
        passage_for_exam="(1) First paragraph about medicine.\n\n(2) Second paragraph.",
        synonym_questions=[
            Q1SynonymQuestion(
                underlined_text="crucial",
                prompt_ja="下線部の意味として最も適当なものを1つ選べ。",
                choices=[Q1ChoiceItem(label="A", text="minor"), Q1ChoiceItem(label="B", text="essential")],
                correct_label="B",
            ),
            Q1SynonymQuestion(
                underlined_text="undermine",
                prompt_ja="下線部の意味として最も適当なものを1つ選べ。",
                choices=[Q1ChoiceItem(label="A", text="weaken"), Q1ChoiceItem(label="B", text="strengthen")],
                correct_label="A",
            ),
        ],
        cloze_prompt_ja="空所に入る語句を選べ。",
        cloze_blanks=[
            Q1ClozeBlank(
                blank_label="(ア)",
                choices=[Q1ChoiceItem(label="A", text="However")],
                correct_label="A",
            )
        ],
        explanation_prompt_ja="比喩表現について説明せよ。",
        char_limit_ja=60,
        translation_prompt_ja="下線部を和訳せよ。",
        underlined_sentence_en="Had the policy been enforced, outcomes would have differed.",
        essay_prompt_ja="本文のテーマについて意見を述べよ。",
        essay_word_min=50,
        essay_word_max=60,
    )
    text = assemble_q1_prompt(result=result)
    assert "問1" in text
    assert "問5" in text
    assert "*crucial*" in text
    assert "50語〜60語" in text


def test_assemble_q1_model_answer_sections():
    result = Q1ComprehensiveGenerationResult(
        synonym_questions=[
            Q1SynonymQuestion(correct_label="B", explanation_ja="文脈上 essential。"),
        ],
        cloze_blanks=[Q1ClozeBlank(blank_label="(ア)", correct_label="C", explanation_ja="逆接。")],
        model_answer_explanation_ja="比喩の説明。",
        model_translation_ja="自然な和訳。",
        model_answer_essay_en="In my opinion, public health requires balance.",
        passage_summary_ja="医療と社会の関係について論じた評論文。",
    )
    text = assemble_q1_model_answer(result=result)
    assert "■ 解答例" in text
    assert "■ 解説" in text
    assert "【問5】" in text


def test_structural_issues_flags_missing_questions():
    result = Q1ComprehensiveGenerationResult(
        passage_for_exam="word " * 950,
        synonym_questions=[Q1SynonymQuestion()],
    )
    issues = QuestionQ1Service._structural_issues(result)
    assert any("問1" in i for i in issues)
    assert any("問2" in i for i in issues)
