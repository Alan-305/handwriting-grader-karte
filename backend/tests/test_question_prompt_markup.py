from app.services.question_prompt_markup import (
    append_markup_reminder_if_needed,
    has_underline_markup,
    normalize_prompt_markup,
)


def test_has_underline_markup_emphasis():
    assert has_underline_markup("He *did* it")


def test_normalize_u_tag_to_asterisk():
    text = normalize_prompt_markup("Translate: <u>important</u> word")
    assert text == "Translate: *important* word"
    assert has_underline_markup(text)


def test_append_reminder_when_underline_format_without_markup():
    notes = append_markup_reminder_if_needed(
        "Read the passage.",
        "underline",
        "",
    )
    assert "要確認" in notes
    assert "下線" in notes


def test_no_reminder_when_markup_present():
    notes = append_markup_reminder_if_needed(
        "Translate *the phrase*.",
        "underline",
        "ok",
    )
    assert notes == "ok"
