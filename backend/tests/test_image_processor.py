import numpy as np
import pytest

from app.services.image_processor import align_sheet, crop_region


def test_crop_region_returns_bytes():
    import cv2

    img = np.ones((100, 100, 3), dtype=np.uint8) * 255
    _, encoded = cv2.imencode(".jpg", img)
    source = encoded.tobytes()

    region = {"x": 10, "y": 10, "width": 50, "height": 50}
    result = crop_region(source, region)
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_align_sheet_with_default_marks():
    import cv2

    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    _, encoded = cv2.imencode(".jpg", img)
    source = encoded.tobytes()

    marks = [
        {"corner": "tl", "x": 0, "y": 0},
        {"corner": "tr", "x": 199, "y": 0},
        {"corner": "br", "x": 199, "y": 199},
        {"corner": "bl", "x": 0, "y": 199},
    ]
    result = align_sheet(source, marks, 200, 200)
    assert isinstance(result, bytes)
    assert len(result) > 0
