from app.services.generation_units import pipeline_for_selection


def test_pipeline_for_q1b():
    assert pipeline_for_selection(1, "(B)") == "q1b"
    assert pipeline_for_selection(1, "B") == "q1b"


def test_pipeline_for_q1a():
    assert pipeline_for_selection(1, "(A)") == "q1a"


def test_pipeline_for_q5():
    assert pipeline_for_selection(5, None) == "q5"


def test_pipeline_for_q4a():
    assert pipeline_for_selection(4, "(A)") == "q4a"


def test_pipeline_for_q2a():
    assert pipeline_for_selection(2, "(A)") == "q2a"
    assert pipeline_for_selection(1, "(A)") == "q1a"


def test_pipeline_for_q2b():
    assert pipeline_for_selection(2, "(B)") == "q2b"
    assert pipeline_for_selection(1, "(B)") == "q1b"


def test_pipeline_for_q4b():
    assert pipeline_for_selection(4, "(B)") == "q4b"
    assert pipeline_for_selection(4, "(A)") == "q4a"
