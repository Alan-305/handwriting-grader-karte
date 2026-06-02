from app.ai.schemas.q2b_generation import (
    Q2BBadLiteralTranslation,
    Q2BGenerationResult,
    Q2BSampleAnswer,
    Q2BSegmentExplanation,
)
from app.services.question_q2b_service import (
    QuestionQ2BService,
    assemble_q2b_model_answer,
    assemble_q2b_prompt,
    count_underline_segments,
)


def test_assemble_q2b_prompt_with_underline():
    result = Q2BGenerationResult(
        instruction_ja="以下の日本文の下線部を英訳せよ。",
        japanese_passage="彼は*空気を読んで*黙った。",
    )
    text = assemble_q2b_prompt(result=result)
    assert "下線部を英訳" in text
    assert "*空気を読んで*" in text
    assert count_underline_segments(result.japanese_passage) == 1


def test_assemble_q2b_model_answer_sections():
    result = Q2BGenerationResult(
        japanese_passage="*背中を押された*。",
        sample_answers=[
            Q2BSampleAnswer(
                label_ja="解答例1（構文・熟語を活かした標準的な訳）",
                english="His friends encouraged him to take the step.",
                approach="standard",
            ),
            Q2BSampleAnswer(
                label_ja="解答例2（より平易な単語でパラフレーズした柔軟な訳）",
                english="They gave him the push he needed.",
                approach="paraphrase",
            ),
        ],
        wakuyaku_process_ja="比喩を英語的に言い換えてから訳す。",
        grammar_essentials_ja=["受動態の選択"],
        segment_explanations=[
            Q2BSegmentExplanation(
                segment_ja="背中を押された",
                literal_trap_ja="push his back は不可",
                english_thinking_ja="encourage / give a push",
            )
        ],
        bad_literal_translations=[
            Q2BBadLiteralTranslation(
                ng_english="Someone pushed his back.",
                why_wrong_ja="字面の押すだけになり不自然",
                suggested_rephrase_ja="背中を押す＝励ます",
            )
        ],
        common_mistakes_ja=["直訳"],
    )
    text = assemble_q2b_model_answer(result=result)
    assert "■ 解答例" in text
    assert "標準的な訳" in text
    assert "NG:" in text
    assert "和文和訳" in text


def test_structural_issues_missing_underline():
    result = Q2BGenerationResult(
        instruction_ja="以下の日本文の下線部を英訳せよ。",
        japanese_passage="下線のない日本語だけ。",
        sample_answers=[
            Q2BSampleAnswer(label_ja="1", english="A", approach="standard"),
            Q2BSampleAnswer(label_ja="2", english="B", approach="paraphrase"),
        ],
        bad_literal_translations=[
            Q2BBadLiteralTranslation(ng_english="x", why_wrong_ja="y")
        ],
        grammar_essentials_ja=["時制"],
    )
    issues = QuestionQ2BService._structural_issues(result)
    assert any("*...*" in i or "下線" in i for i in issues)
