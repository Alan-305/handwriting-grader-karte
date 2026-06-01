"""手書き答案アップロードのページ展開テスト。"""

from __future__ import annotations

from types import SimpleNamespace

import fitz
import pytest

from app.services.answer_sheet_upload import (
    expand_upload_file_to_jpeg_pages,
    expand_upload_files_to_jpeg_pages,
)
from app.services.session_images import MAX_ANSWER_SHEET_PAGES


def _minimal_pdf_bytes(page_count: int = 1) -> bytes:
    doc = fitz.open()
    try:
        for _ in range(page_count):
            doc.new_page(width=200, height=300)
        return doc.tobytes()
    finally:
        doc.close()


def _fake_upload(filename: str, data: bytes, content_type: str = ""):
    return SimpleNamespace(
        filename=filename,
        content_type=content_type,
        read=lambda: data,
    )


def test_expand_single_image_page():
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    pages = expand_upload_file_to_jpeg_pages(
        png,
        filename="page1.png",
        content_type="image/png",
    )
    assert len(pages) == 1
    assert pages[0] == png


def test_expand_pdf_to_multiple_pages():
    pdf = _minimal_pdf_bytes(2)
    pages = expand_upload_file_to_jpeg_pages(
        pdf,
        filename="scan.pdf",
        content_type="application/pdf",
    )
    assert len(pages) == 2
    assert all(p.startswith(b"\xff\xd8") for p in pages)


def test_rejects_unsupported_format():
    with pytest.raises(ValueError, match="対応形式"):
        expand_upload_file_to_jpeg_pages(b"hello", filename="notes.txt", content_type="text/plain")


def test_expand_files_respects_max_pages():
    uploads = [
        _fake_upload("a.pdf", _minimal_pdf_bytes(3), "application/pdf"),
        _fake_upload("b.jpg", b"\xff\xd8\xff", "image/jpeg"),
        _fake_upload("c.jpg", b"\xff\xd8\xff", "image/jpeg"),
    ]
    with pytest.raises(ValueError, match=str(MAX_ANSWER_SHEET_PAGES)):
        expand_upload_files_to_jpeg_pages(uploads)


def test_expand_files_preserves_order():
    pdf = _minimal_pdf_bytes(1)
    uploads = [
        _fake_upload("first.jpg", b"\xff\xd8\xff", "image/jpeg"),
        _fake_upload("second.pdf", pdf, "application/pdf"),
    ]
    pages = expand_upload_files_to_jpeg_pages(uploads)
    assert len(pages) == 2
    assert pages[0] == b"\xff\xd8\xff"
    assert pages[1].startswith(b"\xff\xd8")
