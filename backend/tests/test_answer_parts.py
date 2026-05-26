from app.services.answer_parts import iter_crop_targets


def test_points_split_across_answer_parts():
    questions = [
        {
            "id": "q2",
            "order": 2,
            "type": "english",
            "prompt": "第2問",
            "modelAnswer": "(1) a (2) b (3) c (4) d",
            "points": 25,
            "cropRegion": {"x": 0, "y": 0, "width": 100, "height": 100},
            "answerParts": [
                {"label": "(1)", "cropRegion": {"x": 0, "y": 0, "width": 10, "height": 10}},
                {"label": "(2)", "cropRegion": {"x": 0, "y": 10, "width": 10, "height": 10}},
                {"label": "(3)", "cropRegion": {"x": 0, "y": 20, "width": 10, "height": 10}},
                {"label": "(4)", "cropRegion": {"x": 0, "y": 30, "width": 10, "height": 10}},
            ],
        }
    ]
    targets = iter_crop_targets(questions)
    assert len(targets) == 4
    assert all(t["points"] == 6.25 for t in targets)
    assert targets[0]["partIndex"] == 0
    assert targets[1]["partIndex"] == 1
