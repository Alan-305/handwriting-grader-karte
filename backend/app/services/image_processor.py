import logging
from io import BytesIO

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

CORNER_ORDER = ["tl", "tr", "br", "bl"]


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def align_sheet(
    image_bytes: bytes,
    alignment_marks: list[dict],
    page_width: int,
    page_height: int,
) -> bytes:
    """Apply perspective transform using alignment marks (トンボ)."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image data")

    if len(alignment_marks) >= 4:
        src_pts = np.array(
            [[m["x"], m["y"]] for m in sorted(alignment_marks, key=lambda m: CORNER_ORDER.index(m["corner"]))],
            dtype="float32",
        )
    else:
        h, w = image.shape[:2]
        src_pts = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype="float32")

    dst_pts = np.array(
        [[0, 0], [page_width - 1, 0], [page_width - 1, page_height - 1], [0, page_height - 1]],
        dtype="float32",
    )

    matrix = cv2.getPerspectiveTransform(_order_points(src_pts), dst_pts)
    warped = cv2.warpPerspective(image, matrix, (page_width, page_height))

    _, encoded = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return encoded.tobytes()


def crop_region(image_bytes: bytes, region: dict) -> bytes:
    """Crop a question region from an aligned sheet."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image data")

    x, y = int(region["x"]), int(region["y"])
    w, h = int(region["width"]), int(region["height"])
    cropped = image[y : y + h, x : x + w]

    _, encoded = cv2.imencode(".jpg", cropped, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return encoded.tobytes()


def resolve_crop_location(region: dict, page_height: int) -> tuple[int, dict]:
    """Map crop region to (page_index, page-local region)."""
    page_index = region.get("pageIndex")
    if page_index is not None:
        return int(page_index), {
            "x": int(region["x"]),
            "y": int(region["y"]),
            "width": int(region["width"]),
            "height": int(region["height"]),
        }

    y = int(region["y"])
    idx = y // page_height if page_height > 0 else 0
    return idx, {
        "x": int(region["x"]),
        "y": y - idx * page_height,
        "width": int(region["width"]),
        "height": int(region["height"]),
    }


def crop_region_from_pages(pages: list[bytes], region: dict, page_height: int) -> bytes:
    page_index, local = resolve_crop_location(region, page_height)
    if page_index < 0 or page_index >= len(pages):
        raise ValueError(
            f"Crop page {page_index + 1} is required but only {len(pages)} page(s) were uploaded"
        )
    return crop_region(pages[page_index], local)


def bytes_to_pil(image_bytes: bytes) -> Image.Image:
    return Image.open(BytesIO(image_bytes))
