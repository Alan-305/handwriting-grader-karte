from app.services.generation_units import catalog_to_generation_units


def test_q4a_unit_when_part_a_present():
    catalog = [
        {"majorOrder": 4, "partLabel": None, "typeLabel": "第4問", "years": [2025], "sampleQuestionIds": ["x"]},
        {"majorOrder": 4, "partLabel": "(A)", "typeLabel": "第4問(A)", "years": [2025], "sampleQuestionIds": ["a"]},
        {"majorOrder": 4, "partLabel": "(B)", "typeLabel": "第4問(B)", "years": [2025], "sampleQuestionIds": ["b"]},
    ]
    units = catalog_to_generation_units(catalog)
    pipelines = {u["typeLabel"]: u["pipeline"] for u in units}
    assert pipelines.get("第4問(A)") == "q4a"
    assert pipelines.get("第4問(B)") == "q4b"
    labels = [u["typeLabel"] for u in units if u["majorOrder"] == 4]
    assert labels == ["第4問(A)", "第4問(B)"]
