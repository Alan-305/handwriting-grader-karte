from app.services.university_context_service import (
    UniversityContextService,
    primary_past_exam_slug,
)


def test_primary_past_exam_slug_from_interview_profile():
    student = {
        "targetUniversities": [],
        "interviewProfile": {
            "targetUniversities": [
                {
                    "universityId": "legacy-id",
                    "pastExamSlug": "osaka",
                    "name": "大阪大学",
                    "faculty": "医学部",
                    "priority": 1,
                }
            ]
        },
    }
    assert primary_past_exam_slug(student) == "osaka"


def test_resolve_priority_explicit_over_student():
    svc = UniversityContextService()
    student = {
        "interviewProfile": {
            "targetUniversities": [
                {"pastExamSlug": "osaka", "priority": 1, "universityId": "osaka"}
            ]
        }
    }
    slug = svc.resolve_university_slug(
        explicit_slug="kyodai",
        student=student,
    )
    assert slug == "kyodai"


def test_resolve_from_test_then_student():
    svc = UniversityContextService()
    slug = svc.resolve_university_slug(
        test={"universitySlug": "waseda"},
        student={
            "interviewProfile": {
                "targetUniversities": [
                    {"pastExamSlug": "osaka", "priority": 1, "universityId": "osaka"}
                ]
            }
        },
    )
    assert slug == "waseda"
