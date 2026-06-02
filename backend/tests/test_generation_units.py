from app.services.generation_units import catalog_to_generation_units


def test_q5_merges_sub_parts_into_one_unit():
    catalog = [
        {"majorOrder": 5, "partLabel": "本文", "typeLabel": "第5問", "years": [2025], "sampleQuestionIds": ["a"]},
        {"majorOrder": 5, "partLabel": "(1)", "typeLabel": "第5問(1)", "years": [2025], "sampleQuestionIds": ["b"]},
    ]
    units = catalog_to_generation_units(catalog)
    assert len(units) == 1
    assert units[0]["majorOrder"] == 5
    assert units[0]["typeLabel"] == "第5問"
    assert units[0]["pipeline"] == "q5"


def test_q2_merges_numeric_sub_parts():
    catalog = [
        {"majorOrder": 2, "partLabel": None, "typeLabel": "第2問", "years": [2024], "sampleQuestionIds": []},
        {"majorOrder": 2, "partLabel": "(1)", "typeLabel": "第2問(1)", "years": [2024], "sampleQuestionIds": []},
        {"majorOrder": 2, "partLabel": "(2)", "typeLabel": "第2問(2)", "years": [2024], "sampleQuestionIds": []},
    ]
    units = catalog_to_generation_units(catalog)
    assert len(units) == 1
    assert units[0]["typeLabel"] == "第2問"
    assert units[0]["pipeline"] == "generic"


def test_q1_keeps_letter_parts_separate():
    catalog = [
        {"majorOrder": 1, "partLabel": "(A)", "typeLabel": "第1問(A)", "years": [2024], "sampleQuestionIds": []},
        {"majorOrder": 1, "partLabel": "(B)", "typeLabel": "第1問(B)", "years": [2024], "sampleQuestionIds": []},
    ]
    units = catalog_to_generation_units(catalog)
    assert len(units) == 2
    labels = {u["typeLabel"] for u in units}
    assert labels == {"第1問(A)", "第1問(B)"}
