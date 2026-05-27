"""PDF テキスト抽出の品質判定テスト。"""

from app.services.pdf_text_extractor import (
    count_latin_letters,
    is_embedded_pdf_text_insufficient,
)


def test_count_latin_letters():
    assert count_latin_letters("Hello 世界") == 5


def test_insufficient_when_no_latin():
    text = "第1問\n" * 5 + "入試問題\n" * 10
    assert is_embedded_pdf_text_insufficient(text, page_count=8) is True


def test_sufficient_when_english_present():
    text = "Question 1. " + ("The quick brown fox jumps. " * 30)
    assert is_embedded_pdf_text_insufficient(text, page_count=2) is False
