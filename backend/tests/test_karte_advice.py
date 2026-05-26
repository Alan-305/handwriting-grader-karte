from app.ai.prompts.karte_advice import build_karte_user_prompt


def test_prompt_includes_interview_profile_and_records():
    text = build_karte_user_prompt(
        student_name="山田",
        course="医学部受験コース",
        target_universities=[
            {
                "id": "u1",
                "name": "東京大学",
                "faculty": "理科三類",
                "difficultyLevel": 5,
                "examTrends": "英語重視",
            }
        ],
        session_summaries="Session x: 80/100点",
        error_stats={"grammar": 2},
        interview_profile={
            "targetUniversities": [
                {"universityId": "u1", "name": "東京大学", "faculty": "理科三類", "priority": 1}
            ],
            "commonTestYear": 2026,
            "commonTestScores": {"englishReading": "80_89"},
            "confirmedFactIds": ["no_other_faculty", "todai_sci_3"],
        },
        interview_records=[
            {
                "recordNumber": 1,
                "studentConsultation": "英作文が不安",
                "teacherAdvice": "週2本の過去問",
            },
            {
                "recordNumber": 2,
                "studentConsultation": "理三と医学部の併願",
                "teacherAdvice": "英作文量を増やす",
            },
        ],
    )
    assert "理科三類" in text
    assert "80〜89点" in text
    assert "英作文が不安" in text
    assert "週2本の過去問" in text
    assert "第2回面談" in text
    assert "【生徒の相談】" in text
    assert "【教師のアドバイス】" in text
    assert "このリスト以外" in text
