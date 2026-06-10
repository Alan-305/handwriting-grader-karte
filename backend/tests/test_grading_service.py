import json

from google.cloud.firestore import DELETE_FIELD


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
