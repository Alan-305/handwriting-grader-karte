"""過去問設問マージのテスト。"""

from app.ai.schemas.past_exam import ParsedPastQuestion
from app.services.past_exam_question_utils import (
    consolidate_parsed_questions,
    ensure_majors_from_exam_text,
    extract_major_sections,
)


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


def test_extract_major_sections_finds_question_five():
    text = "前置き\n第4問 四問目\n第5問 英語本文 The passage continues here.\n"
    sections = extract_major_sections(text)
    assert 5 in sections
    assert "英語本文" in sections[5]


def test_ensure_majors_recovers_missing_question_five():
    exam_text = "第4問 四\n第5問 五問目の英語 Long text for Q5."
    questions = [
        ParsedPastQuestion(major_order=1, type="english", prompt="一"),
        ParsedPastQuestion(major_order=4, type="english", prompt="四"),
    ]
    recovered, notes = ensure_majors_from_exam_text(questions, exam_text)
    majors = {q.major_order for q in recovered}
    assert 5 in majors
    assert any("復元" in n for n in notes)
    q5 = next(q for q in recovered if q.major_order == 5)
    assert "五問目" in q5.prompt
