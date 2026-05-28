from app.ai.schemas.question_design import GeneratedQuestionItem


def test_generated_question_item_coerces_null_points():
    item = GeneratedQuestionItem.model_validate(
        {
            "typeLabel": "第1問(A)",
            "majorOrder": 1,
            "prompt": "問題文",
            "modelAnswer": "模範解答",
            "points": None,
        }
    )
    assert item.points == 10


def test_generated_question_item_coerces_missing_points():
    item = GeneratedQuestionItem.model_validate(
        {
            "typeLabel": "第2問",
            "majorOrder": 2,
            "prompt": "Q",
            "modelAnswer": "A",
        }
    )
    assert item.points == 10
    assert item.major_order == 2
