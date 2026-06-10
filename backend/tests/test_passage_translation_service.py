from app.services.passage_translation_service import (
    extract_english_passage_from_prompt,
    format_translation_with_markers,
    question_has_english_passage,
    split_source_paragraphs,
)


def test_question_has_english_passage():
    q = {
        "type": "english",
        "prompt": "次の英文を読みなさい。\n\n" + "word " * 60,
    }
    assert question_has_english_passage(q) is True


def test_extract_english_passage_stops_at_question_section():
    prompt = (
        "次の英文を読みなさい。\n\n"
        "First paragraph of the passage.\n\n"
        "Second paragraph continues here.\n\n"
        "問1\n下線部を選べ。"
    )
    passage = extract_english_passage_from_prompt(prompt)
    assert "First paragraph" in passage
    assert "Second paragraph" in passage
    assert "問1" not in passage


def test_format_translation_with_markers_for_long_passage():
    text = format_translation_with_markers(["第一段", "第二段"])
    assert "¶1" in text
    assert "¶2" in text
    assert "第一段" in text
    assert "第二段" in text


def test_format_translation_single_paragraph_no_marker():
    text = format_translation_with_markers(["短い和訳"])
    assert "¶" not in text
    assert text == "短い和訳"


def test_split_source_paragraphs():
    passage = "Para one.\n\nPara two."
    assert len(split_source_paragraphs(passage)) == 2
