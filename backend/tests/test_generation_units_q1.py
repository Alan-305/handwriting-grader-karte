from app.services.generation_units import catalog_to_generation_units, pipeline_for_selection


def test_q1_unified_major_uses_q1_pipeline():
    catalog = [
        {"majorOrder": 1, "partLabel": None, "typeLabel": "第1問", "years": [2026], "sampleQuestionIds": []},
        {"majorOrder": 1, "partLabel": "(1)", "typeLabel": "第1問(1)", "years": [2026], "sampleQuestionIds": []},
    ]
    units = catalog_to_generation_units(catalog)
    assert len(units) == 1
    assert units[0]["pipeline"] == "q1"
    assert units[0]["typeLabel"] == "第1問"


def test_pipeline_for_selection_major1_without_part():
    assert pipeline_for_selection(1, None) == "q1"
