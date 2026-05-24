from app.services.scoring import clamp_score, to_score_out_of_100


def test_to_score_out_of_100():
    assert to_score_out_of_100(45, 50) == 90
    assert to_score_out_of_100(0, 100) == 0
    assert to_score_out_of_100(10, 0) == 0


def test_clamp_score():
    assert clamp_score(12, 10) == 10
    assert clamp_score(-1, 10) == 0
