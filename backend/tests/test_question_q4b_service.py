from app.ai.schemas.q4b_generation import (
    Q4BBadTranslation,
    Q4BGenerationResult,
    Q4BSampleAnswer,
    Q4BSegmentAnalysis,
)
from app.services.question_q4b_service import (
    QuestionQ4BService,
    assemble_q4b_model_answer,
    assemble_q4b_prompt,
)


def test_assemble_q4b_prompt_underline():
    result = Q4BGenerationResult(
        instruction_ja="次の英文の下線部(ア)及び(イ)を日本語に訳せ。",
        segment_i_extra_instruction_ja='下線部(イ)の "it" の内容を具体的に明らかにして和訳せよ。',
        passage="Context *inverted clause here* and more *this refers to it*.",
    )
    text = assemble_q4b_prompt(result=result)
    assert "下線部" in text
    assert "*inverted clause here*" in text
    assert "it" in text


def test_assemble_q4b_model_answer():
    result = Q4BGenerationResult(
        sample_answers=[
            Q4BSampleAnswer(blank_label="ア", translation_ja="倒置を自然な日本語に。"),
            Q4BSampleAnswer(blank_label="イ", translation_ja="それは状況を指す。"),
        ],
        paragraph_summary_ja="全体の要約。",
        segment_analyses=[
            Q4BSegmentAnalysis(
                blank_label="ア",
                syntax_tree_ja="S=…",
                translation_process_ja="倒置を処理",
                required_elements_ja=["主語の補足"],
                deduction_points_ja=["語順の硬さ"],
                fatal_mistakes_ja=["字面直訳"],
                points_hint="12点",
            ),
            Q4BSegmentAnalysis(
                blank_label="イ",
                syntax_tree_ja="it=前文",
                translation_process_ja="指示語特定",
                required_elements_ja=["指示内容"],
                deduction_points_ja=[],
                fatal_mistakes_ja=["itを「それ」だけ"],
                points_hint="13点",
            ),
        ],
        bad_translation_examples=[
            Q4BBadTranslation(
                blank_label="イ",
                ng_translation_ja="それはそれである。",
                why_wrong_ja="指示内容が不明",
            )
        ],
    )
    text = assemble_q4b_model_answer(result=result)
    assert "（ア）" in text
    assert "（イ）" in text
    assert "採点基準" in text
    assert "NG:" in text


def test_structural_issues():
    result = Q4BGenerationResult(
        instruction_ja="訳せ。",
        passage="No underline markup.",
        sample_answers=[
            Q4BSampleAnswer(blank_label="ア", translation_ja="a"),
            Q4BSampleAnswer(blank_label="イ", translation_ja="b"),
        ],
        segment_analyses=[
            Q4BSegmentAnalysis(
                blank_label="ア",
                syntax_tree_ja="x",
                translation_process_ja="y",
                required_elements_ja=["a"],
                deduction_points_ja=[],
                fatal_mistakes_ja=[],
            ),
            Q4BSegmentAnalysis(
                blank_label="イ",
                syntax_tree_ja="x",
                translation_process_ja="y",
                required_elements_ja=["a"],
                deduction_points_ja=[],
                fatal_mistakes_ja=[],
            ),
        ],
        bad_literal_translations=[],
        grammar_essentials_ja=["時制"],
    )
    issues = QuestionQ4BService._structural_issues(result)
    assert any("下線" in i for i in issues)
