"""過去問設問マージのテスト。"""

from app.ai.schemas.past_exam import ParsedPastQuestion
from app.services.past_exam_question_utils import consolidate_parsed_questions


def test_consolidate_drops_empty_and_merges_parts():
    questions = [
        ParsedPastQuestion(major_order=1, type="english", prompt="", model_answer=""),
        ParsedPastQuestion(major_order=1, type="english", prompt="Part A", model_answer=""),
        ParsedPastQuestion(major_order=1, type="english", prompt="English body.", model_answer="ans"),
        ParsedPastQuestion(major_order=2, type="english", prompt="Q2", model_answer=""),
    ]
    merged = consolidate_parsed_questions(questions)
    assert len(merged) == 2
    assert "Part A" in merged[0].prompt
    assert "English body" in merged[0].prompt
    assert merged[0].model_answer == "ans"
