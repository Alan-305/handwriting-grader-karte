from io import BytesIO

from PIL import Image

from app.utils.image_encoding import GEMINI_MAX_EDGE, prepare_image_for_gemini


def test_prepare_image_for_gemini_downscales_large():
    img = Image.new("RGB", (4000, 3000), color=(255, 255, 255))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    out = prepare_image_for_gemini(buf.getvalue())
    result = Image.open(BytesIO(out))
    assert max(result.size) <= GEMINI_MAX_EDGE


def test_prepare_image_for_gemini_upscales_tiny():
    img = Image.new("RGB", (80, 60), color=(255, 255, 255))
    buf = BytesIO()
    img.save(buf, format="JPEG")
    out = prepare_image_for_gemini(buf.getvalue())
    result = Image.open(BytesIO(out))
    assert min(result.size) >= 320
