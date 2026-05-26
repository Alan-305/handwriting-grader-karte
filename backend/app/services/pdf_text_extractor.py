"""PDF からテキストを抽出するユーティリティ。"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)

OCR_BATCH_SIZE = 8
OCR_DPI = 150


def extract_text_from_pdfs(
    pdf_paths: list[str | Path],
    *,
    label_prefix: str = "File",
    gemini_client=None,
) -> str:
    """複数 PDF を順に結合してテキスト化する。"""
    if not pdf_paths:
        raise ValueError("At least one PDF path is required")
    sections: list[str] = []
    for index, pdf_path in enumerate(pdf_paths, start=1):
        body = extract_text_from_pdf(pdf_path, gemini_client=gemini_client)
        name = Path(pdf_path).name
        sections.append(f"=== {label_prefix} {index}: {name} ===\n{body}")
    return "\n\n".join(sections).strip()


def extract_text_from_pdf(pdf_path: str | Path, *, gemini_client=None) -> str:
    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {path}")

    try:
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise ImportError(
            "PyMuPDF is required for PDF import. Install with: pip install pymupdf"
        ) from exc

    doc = fitz.open(path)
    pages: list[str] = []
    try:
        for i, page in enumerate(doc):
            text = page.get_text("text").strip()
            if text:
                pages.append(f"--- Page {i + 1} ---\n{text}")
    finally:
        doc.close()

    combined = "\n\n".join(pages).strip()
    if combined:
        return combined

    if gemini_client is None:
        raise ValueError(
            f"No extractable text in {path}. "
            "This PDF appears to be scan-only. Set GEMINI_API_KEY for Vision OCR import."
        )

    logger.info(
        "No embedded text in %s; using Vision OCR (%s pages)",
        path.name,
        pdf_page_count(path),
    )
    return _ocr_pdf_with_gemini(path, gemini_client)


def render_pdf_pages_as_jpeg(pdf_path: Path, *, dpi: int = OCR_DPI) -> list[bytes]:
    import fitz

    doc = fitz.open(pdf_path)
    images: list[bytes] = []
    try:
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        for page in doc:
            pix = page.get_pixmap(matrix=matrix, alpha=False)
            images.append(pix.tobytes("jpeg"))
    finally:
        doc.close()
    return images


def _ocr_pdf_with_gemini(pdf_path: Path, gemini_client) -> str:
    from app.ai.prompts.past_exam_ocr import PAST_EXAM_OCR_SYSTEM

    page_images = render_pdf_pages_as_jpeg(pdf_path)
    if not page_images:
        raise ValueError(f"No pages rendered from {pdf_path}")

    chunks: list[str] = []
    total = len(page_images)
    for start in range(0, total, OCR_BATCH_SIZE):
        batch = page_images[start : start + OCR_BATCH_SIZE]
        page_from = start + 1
        page_to = start + len(batch)
        user_text = (
            f"ファイル: {pdf_path.name}\n"
            f"ページ {page_from}〜{page_to} / 全{total}ページ\n"
            "画像内の文字をすべて書き起こしてください。"
        )
        text = gemini_client.transcribe_images(
            system=PAST_EXAM_OCR_SYSTEM,
            user_text=user_text,
            images_jpeg=batch,
        )
        chunks.append(f"--- Pages {page_from}-{page_to} ---\n{text.strip()}")

    return "\n\n".join(chunks).strip()


def pdf_page_count(pdf_path: str | Path) -> int:
    import fitz

    doc = fitz.open(pdf_path)
    try:
        return doc.page_count
    finally:
        doc.close()
