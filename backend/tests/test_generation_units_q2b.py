from app.services.generation_units import catalog_to_generation_units, pipeline_for_selection


def test_q2b_unit_when_part_b_present():
    catalog = [
        {"majorOrder": 2, "partLabel": "(A)", "typeLabel": "第2問(A)", "years": [2025], "sampleQuestionIds": ["a"]},
        {"majorOrder": 2, "partLabel": "(B)", "typeLabel": "第2問(B)", "years": [2025], "sampleQuestionIds": ["b"]},
    ]
    units = catalog_to_generation_units(catalog)
    pipelines = {u["typeLabel"]: u["pipeline"] for u in units}
    assert pipelines.get("第2問(A)") == "q2a"
    assert pipelines.get("第2問(B)") == "q2b"
    assert pipeline_for_selection(2, "(B)") == "q2b"
