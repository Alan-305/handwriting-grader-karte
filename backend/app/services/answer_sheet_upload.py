"""手書き答案アップロード（画像・PDF）をページ単位の JPEG バイト列に展開する。"""

from __future__ import annotations

import tempfile
from pathlib import Path

from app.services.pdf_text_extractor import render_pdf_pages_as_jpeg
from app.services.session_images import MAX_ANSWER_SHEET_PAGES

# 答案用紙の位置合わせ向け（OCR 用 DPI よりやや高め）
ANSWER_SHEET_PDF_DPI = 200


def _is_pdf_file(filename: str, content_type: str | None) -> bool:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return True
    return (content_type or "").lower() == "application/pdf"


def _is_image_file(filename: str, content_type: str | None) -> bool:
    if (content_type or "").lower().startswith("image/"):
        return True
    name = (filename or "").lower()
    return name.endswith((".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp"))


def expand_upload_file_to_jpeg_pages(
    file_bytes: bytes,
    *,
    filename: str = "",
    content_type: str | None = None,
) -> list[bytes]:
    """1 アップロードファイルを 1 枚以上の JPEG ページ列に展開する。"""
    if _is_pdf_file(filename, content_type):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=True) as tmp:
            tmp.write(file_bytes)
            tmp.flush()
            return render_pdf_pages_as_jpeg(
                Path(tmp.name),
                dpi=ANSWER_SHEET_PDF_DPI,
            )
    if not _is_image_file(filename, content_type):
        raise ValueError(
            "対応形式は写真（JPEG/PNG 等）または PDF です。"
            f"（{filename or '不明なファイル'}）"
        )
    if not file_bytes:
        raise ValueError(f"ファイルが空です: {filename or '不明'}")
    return [file_bytes]


def expand_upload_files_to_jpeg_pages(files) -> list[bytes]:
    """複数ファイルをアップロード順にページ展開し、最大枚数を検証する。"""
    pages: list[bytes] = []
    for upload in files:
        if not upload or not getattr(upload, "filename", None):
            continue
        chunk = expand_upload_file_to_jpeg_pages(
            upload.read(),
            filename=upload.filename or "",
            content_type=getattr(upload, "content_type", None),
        )
        pages.extend(chunk)

    if not pages:
        raise ValueError("写真または PDF を1件以上アップロードしてください")

    if len(pages) > MAX_ANSWER_SHEET_PAGES:
        raise ValueError(
            f"答案は合計 {MAX_ANSWER_SHEET_PAGES} ページまでです（"
            f"取り込み後 {len(pages)} ページになります）"
        )
    return pages
