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


def test_align_sheet_scales_design_marks_on_high_res_photo():
    """テンプレート座標のトンボでも、高解像度写真の全面が使われること。"""
    import cv2

    h, w = 4000, 3000
    img = np.ones((h, w, 3), dtype=np.uint8) * 255
    img[h - 10, w - 10] = (0, 0, 255)
    _, encoded = cv2.imencode(".jpg", img)
    source = encoded.tobytes()

    marks = [
        {"corner": "tl", "x": 0, "y": 0},
        {"corner": "tr", "x": 2479, "y": 0},
        {"corner": "br", "x": 2479, "y": 3507},
        {"corner": "bl", "x": 0, "y": 3507},
    ]
    page_w, page_h = 2480, 3508
    result = align_sheet(source, marks, page_w, page_h)
    warped = cv2.imdecode(np.frombuffer(result, np.uint8), cv2.IMREAD_COLOR)
    assert warped is not None
    assert warped.shape[1] == page_w
    assert warped.shape[0] == page_h
    assert warped[page_h - 5, page_w - 5, 2] >= 250
