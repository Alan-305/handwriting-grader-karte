from app.services.generation_units import catalog_to_generation_units


def test_q1b_unit_when_part_b_present():
    catalog = [
        {"majorOrder": 1, "partLabel": "(A)", "typeLabel": "第1問(A)", "years": [2025], "sampleQuestionIds": ["a"]},
        {"majorOrder": 1, "partLabel": "(B)", "typeLabel": "第1問(B)", "years": [2025], "sampleQuestionIds": ["b"]},
    ]
    units = catalog_to_generation_units(catalog)
    pipelines = {u["typeLabel"]: u["pipeline"] for u in units}
    assert pipelines.get("第1問(A)") == "q1a"
    assert pipelines.get("第1問(B)") == "q1b"
