import json

from google.cloud.firestore import DELETE_FIELD

from app.services.grading_service import apply_teacher_priority, build_preserved_grade_update


def test_grade_step_response_excludes_delete_field_sentinel():
    """API レスポンスに Firestore DELETE_FIELD を含めない。"""
    update_data = {
        "grade": "良",
        "score": 8,
        "contentEvaluation": DELETE_FIELD,
        "grammarEvaluation": "不可",
        "polishedAnswer": DELETE_FIELD,
    }
    response = {k: v for k, v in update_data.items() if v is not DELETE_FIELD}
    json.dumps(response)
    assert "contentEvaluation" not in response
    assert response["grammarEvaluation"] == "不可"
    assert "polishedAnswer" not in response


def test_build_preserved_grade_update_keeps_teacher_fields():
    stored = {
        "grade": "優",
        "score": 9,
        "maxPoints": 10,
        "feedback": "教師の講評",
        "explanation": "(1) 正解：a — 理由のみ",
        "teacherReviewed": True,
    }
    update = build_preserved_grade_update(
        stored=stored,
        target={"points": 10, "modelAnswer": "a"},
        student_text="修正後の解答",
    )
    assert update["studentAnswerText"] == "修正後の解答"
    assert update["feedback"] == "教師の講評"
    assert update["explanation"] == "(1) 正解：a — 理由のみ"
    assert update["grade"] == "優"
    assert update["score"] == 9
    assert update["teacherReviewed"] is True


def test_apply_teacher_priority_overrides_ai_output():
    stored = {
        "grade": "良",
        "score": 6,
        "feedback": "教師の総評",
        "explanation": "教師の解説",
        "teacherReviewed": True,
    }
    ai_update = {
        "grade": "不可",
        "score": 2,
        "maxPoints": 10,
        "feedback": "AIの総評",
        "explanation": "AIの解説",
        "teacherReviewed": False,
    }
    merged = apply_teacher_priority(stored, ai_update)
    assert merged["grade"] == "良"
    assert merged["score"] == 6
    assert merged["feedback"] == "教師の総評"
    assert merged["explanation"] == "教師の解説"
    assert merged["teacherReviewed"] is True
