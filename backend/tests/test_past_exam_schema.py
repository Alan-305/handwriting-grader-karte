"""過去問 import スキーマの null 耐性テスト。"""

from app.ai.schemas.past_exam import (
    ListeningScriptParseResponse,
    ParsedPastQuestion,
    PastExamParseResponse,
    _normalize_parsed_question_dict,
)


def test_parsed_question_accepts_null_notes():
    q = ParsedPastQuestion.model_validate(
        {
            "majorOrder": 1,
            "type": "english",
            "prompt": "第1問",
            "modelAnswer": None,
            "notes": None,
        }
    )
    assert q.notes == ""
    assert q.model_answer == ""


def test_past_exam_response_accepts_null_fields():
    data = PastExamParseResponse.model_validate(
        {
            "year": 2026,
            "universityName": None,
            "parseNotes": None,
            "questions": [
                {
                    "majorOrder": 1,
                    "type": "english",
                    "prompt": "test",
                    "notes": None,
                }
            ],
        }
    )
    assert data.parse_notes == ""
    assert data.questions[0].notes == ""


def test_listening_parse_accepts_empty_list_parse_notes():
    data = ListeningScriptParseResponse.model_validate(
        {
            "year": 2026,
            "listeningScripts": [{"content": "Hello"}],
            "parseNotes": [],
        }
    )
    assert data.parse_notes == ""


def test_listening_parse_accepts_string_list_parse_notes():
    data = ListeningScriptParseResponse.model_validate(
        {
            "year": 2026,
            "listeningScripts": [{"content": "A"}],
            "parseNotes": ["line one", "line two"],
        }
    )
    assert data.parse_notes == "line one\nline two"


def test_parsed_question_swaps_type_and_answer_format():
    q = ParsedPastQuestion.model_validate(
        {
            "majorOrder": 1,
            "type": "japanese_writing",
            "questionText": "和文要約の指示",
            "notes": None,
        }
    )
    assert q.type == "english"
    assert q.answer_format == "japanese_writing"
    assert q.prompt == "和文要約の指示"


def test_parsed_question_accepts_symbol_in_type_field():
    q = ParsedPastQuestion.model_validate(
        {
            "majorOrder": 2,
            "type": "symbol",
            "stem": "マークシート",
        }
    )
    assert q.type == "symbol"
    assert q.answer_format == "symbol"
    assert q.prompt == "マークシート"


def test_past_exam_response_normalizes_mislabeled_questions():
    data = PastExamParseResponse.model_validate(
        {
            "year": 2026,
            "questions": [
                {
                    "majorOrder": 1,
                    "type": "english_writing",
                    "content": "英作文",
                },
                {
                    "majorOrder": 2,
                    "type": "symbol",
                    "problemText": "記号",
                },
            ],
        }
    )
    assert data.questions[0].type == "english"
    assert data.questions[0].answer_format == "english_writing"
    assert data.questions[0].prompt == "英作文"
    assert data.questions[1].type == "symbol"


def test_normalize_prompt_alias_priority():
    normalized = _normalize_parsed_question_dict(
        {"majorOrder": 1, "type": "english", "prompt": "", "questionText": "fallback"}
    )
    assert normalized["prompt"] == "fallback"


def test_parsed_question_merges_passage_and_content():
    q = ParsedPastQuestion.model_validate(
        {
            "majorOrder": 1,
            "type": "english",
            "content": "次の英文を読み",
            "passage": "The English passage is here.",
        }
    )
    assert "次の英文" in q.prompt
    assert "English passage" in q.prompt


def test_listening_script_merges_dialogue_into_content():
    from app.ai.schemas.past_exam import ListeningScript

    script = ListeningScript.model_validate(
        {
            "title": "Passage A",
            "content": "指示のみ",
            "dialogue": "A: Hello.\nB: Hi there.",
        }
    )
    assert "Hello" in script.content
    assert "指示のみ" in script.content


def test_past_exam_response_accepts_list_parse_notes():
    data = PastExamParseResponse.model_validate(
        {
            "year": 2026,
            "parseNotes": [],
            "questions": [
                {
                    "majorOrder": 1,
                    "type": "english",
                    "prompt": "test",
                }
            ],
        }
    )
    assert data.parse_notes == ""
