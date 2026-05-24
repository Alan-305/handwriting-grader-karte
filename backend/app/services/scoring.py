"""得点集計・100点満点換算。"""

SCORE_SCALE = 100


def to_score_out_of_100(total_score: float, max_score: float) -> int:
    if max_score <= 0:
        return 0
    return round((total_score / max_score) * SCORE_SCALE)


def clamp_score(score: float, max_points: float) -> float:
    return max(0.0, min(float(score), float(max_points)))
