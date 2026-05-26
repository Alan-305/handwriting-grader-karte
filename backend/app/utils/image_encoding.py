import base64
from io import BytesIO

from PIL import Image

# Gemini Vision 向け（極端なサイズは空応答の原因になりやすい）
GEMINI_MAX_EDGE = 2048
GEMINI_MIN_EDGE = 320


def image_to_base64(image_bytes: bytes, media_type: str = "image/jpeg") -> tuple[str, str]:
    return base64.standard_b64encode(image_bytes).decode("utf-8"), media_type


def pil_to_bytes(image: Image.Image, fmt: str = "JPEG", *, quality: int = 92) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format=fmt, quality=quality, optimize=True)
    return buffer.getvalue()


def prepare_image_for_gemini(image_bytes: bytes) -> bytes:
    """手書き crop を Gemini 向けに RGB・解像度を正規化する。"""
    if not image_bytes or len(image_bytes) < 32:
        raise ValueError("答案画像が空です。切り出し範囲を確認してください。")

    img = Image.open(BytesIO(image_bytes))
    img = img.convert("RGB")
    width, height = img.size

    longest = max(width, height)
    if longest > GEMINI_MAX_EDGE:
        scale = GEMINI_MAX_EDGE / longest
        img = img.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.LANCZOS,
        )
        width, height = img.size

    shortest = min(width, height)
    if shortest < GEMINI_MIN_EDGE and shortest > 0:
        scale = GEMINI_MIN_EDGE / shortest
        img = img.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.LANCZOS,
        )

    return pil_to_bytes(img, quality=88)
