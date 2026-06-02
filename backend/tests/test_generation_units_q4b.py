from app.services.generation_units import catalog_to_generation_units, pipeline_for_selection, sort_generation_units


def test_q4b_unit_and_sort_order():
    catalog = [
        {"majorOrder": 4, "partLabel": "(B)", "typeLabel": "第4問(B)", "years": [2025], "sampleQuestionIds": ["b"]},
        {"majorOrder": 4, "partLabel": "(A)", "typeLabel": "第4問(A)", "years": [2025], "sampleQuestionIds": ["a"]},
        {"majorOrder": 2, "partLabel": "(A)", "typeLabel": "第2問(A)", "years": [2025], "sampleQuestionIds": ["2a"]},
    ]
    units = catalog_to_generation_units(catalog)
    pipelines = {u["typeLabel"]: u["pipeline"] for u in units}
    assert pipelines.get("第4問(A)") == "q4a"
    assert pipelines.get("第4問(B)") == "q4b"
    assert pipeline_for_selection(4, "(B)") == "q4b"

    labels = [u["typeLabel"] for u in units]
    assert labels.index("第2問(A)") < labels.index("第4問(A)") < labels.index("第4問(B)")


def test_sort_generation_units_major_then_part():
    units = [
        {"majorOrder": 5, "partLabel": None, "typeLabel": "第5問", "pipeline": "q5"},
        {"majorOrder": 1, "partLabel": "(B)", "typeLabel": "第1問(B)", "pipeline": "q1b"},
        {"majorOrder": 1, "partLabel": "(A)", "typeLabel": "第1問(A)", "pipeline": "q1a"},
    ]
    sorted_units = sort_generation_units(units)
    assert [u["typeLabel"] for u in sorted_units] == ["第1問(A)", "第1問(B)", "第5問"]
