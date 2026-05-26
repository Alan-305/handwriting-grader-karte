from app.services.image_processor import resolve_crop_location


def test_resolve_crop_location_with_page_index():
    region = {"x": 120, "y": 400, "width": 800, "height": 200, "pageIndex": 1}
    page_index, local = resolve_crop_location(region, 3508)
    assert page_index == 1
    assert local == {"x": 120, "y": 400, "width": 800, "height": 200}


def test_resolve_crop_location_legacy_absolute_y():
    region = {"x": 120, "y": 3600, "width": 800, "height": 200}
    page_index, local = resolve_crop_location(region, 3508)
    assert page_index == 1
    assert local["y"] == 3600 - 3508


def test_resolve_crop_location_page_one():
    region = {"x": 120, "y": 500, "width": 800, "height": 200, "pageIndex": 0}
    page_index, local = resolve_crop_location(region, 3508)
    assert page_index == 0
    assert local["y"] == 500
