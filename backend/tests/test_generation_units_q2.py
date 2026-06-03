from app.services.generation_units import catalog_to_generation_units, pipeline_for_selection


def test_q2_unified_major_uses_q2_pipeline():
    catalog = [
        {"majorOrder": 2, "partLabel": None, "typeLabel": "第2問", "years": [2026], "sampleQuestionIds": []},
    ]
    units = catalog_to_generation_units(catalog)
    assert len(units) == 1
    assert units[0]["pipeline"] == "q2"


def test_pipeline_for_selection_major2_without_part():
    assert pipeline_for_selection(2, None) == "q2"
