import base64
from io import BytesIO

from PIL import Image


def image_to_base64(image_bytes: bytes, media_type: str = "image/jpeg") -> tuple[str, str]:
    return base64.standard_b64encode(image_bytes).decode("utf-8"), media_type


def pil_to_bytes(image: Image.Image, fmt: str = "JPEG") -> bytes:
    buffer = BytesIO()
    image.save(buffer, format=fmt, quality=92)
    return buffer.getvalue()
