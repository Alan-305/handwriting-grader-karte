"""Q2B Claude 簡略スキーマ → 内部モデル変換のテスト。"""

from app.ai.schemas.q2b_generation_claude import Q2BProblemClaudeResult, Q2BTeacherPackClaudeResult
from app.services.q2b_claude_convert import (
    merge_teacher_pack,
    parse_bad_literal_line,
    parse_sample_answer_line,
    parse_segment_line,
    problem_from_claude,
)


def test_parse_sample_answer_pipe_format():
    line = "standard|解答例1（標準）|This is the standard translation."
    parsed = parse_sample_answer_line(line, index=0)
    assert parsed is not None
    assert parsed.approach == "standard"
    assert parsed.label_ja == "解答例1（標準）"
    assert parsed.english == "This is the standard translation."


def test_parse_segment_line():
    parsed = parse_segment_line("言葉の壁|直訳の罠|英語的発想")
    assert parsed is not None
    assert parsed.segment_ja == "言葉の壁"
    assert parsed.literal_trap_ja == "直訳の罠"
    assert parsed.english_thinking_ja == "英語的発想"


def test_parse_bad_literal_line():
    parsed = parse_bad_literal_line("NG英文|理由|言い換え")
    assert parsed is not None
    assert parsed.ng_english == "NG英文"
    assert parsed.why_wrong_ja == "理由"
    assert parsed.suggested_rephrase_ja == "言い換え"


def test_problem_from_claude_and_merge_teacher_pack():
    problem_raw = Q2BProblemClaudeResult.model_validate(
        {
            "theme": "日常",
            "genre": "会話",
            "instructionJa": "以下の日本文の下線部を英訳せよ。",
            "japanesePassage": "彼は*勇気*を出して話しかけた。",
            "underlinedSegmentsJa": ["勇気"],
            "sampleAnswers": [
                "standard|解答例1|He plucked up courage and spoke to her.",
                "paraphrase|解答例2|He gathered his courage and started talking.",
            ],
        }
    )
    base = problem_from_claude(problem_raw)
    assert base.theme == "日常"
    assert len(base.sample_answers) == 2
    assert base.sample_answers[0].approach == "standard"

    pack_raw = Q2BTeacherPackClaudeResult.model_validate(
        {
            "wakuyakuProcessJa": "和訳の流れ",
            "grammarEssentialsJa": ["pluck up courage"],
            "segmentExplanations": ["勇気|勇気を出すを courage を出す|pluck up courage"],
            "badLiteralTranslations": ["He made courage.|make courage は不可|pluck up courage"],
            "commonMistakesJa": ["make courage の誤用"],
        }
    )
    merged = merge_teacher_pack(base, pack_raw)
    assert merged.wakuyaku_process_ja == "和訳の流れ"
    assert len(merged.segment_explanations) == 1
    assert merged.segment_explanations[0].segment_ja == "勇気"
    assert len(merged.bad_literal_translations) == 1
    assert merged.bad_literal_translations[0].ng_english == "He made courage."
