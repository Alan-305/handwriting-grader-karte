from app.ai.schemas.q5_generation import (
    Q5ChoiceItem,
    Q5QuestionExplanation,
    Q5QuestionsResult,
    Q5ScoringPoint,
    Q5SubQuestion,
    Q5TeacherPackResult,
)
from app.ai.schemas.q5_generation_claude import (
    Q5ExplanationClaude,
    Q5QuestionsClaudeResult,
    Q5SubQuestionClaude,
    Q5TeacherPackClaudeResult,
)
from app.services.q5_scoring import (
    choice_design_issues,
    choice_passage_overlap_ratio,
    format_q5_part_rubric,
    format_q5_scoring_points_lines,
    has_long_verbatim_phrase,
    parse_q5_choice_line,
    questions_from_claude,
    teacher_pack_from_claude,
)
from app.services.question_q5_service import assemble_q5_model_answer


def test_format_q5_scoring_points_lines():
    points = [
        Q5ScoringPoint(pointJa="演劇的なもてなしに慣れていた", passageBasis="theatrical hospitality"),
        Q5ScoringPoint(pointJa="素朴な善意の対比", pointsHint="必須"),
    ]
    lines = format_q5_scoring_points_lines(
        points,
        direction_criterion="本文の因果に沿っていれば可",
    )
    text = "\n".join(lines)
    assert "【採点ポイント" in text
    assert "演劇的なもてなし" in text
    assert "【方向性の判定】" in text


def test_format_q5_part_rubric_for_grading():
    rubric = format_q5_part_rubric(
        [
            Q5ScoringPoint(pointJa="ポイント1"),
            Q5ScoringPoint(pointJa="ポイント2"),
        ],
        direction_criterion="核心を押さえていれば可",
        char_limit=80,
    )
    assert "必須採点ポイント" in rubric
    assert "ポイント1" in rubric
    assert "方向性" in rubric
    assert "文言一致は不要" in rubric


def test_choice_passage_overlap_detects_copy_paste():
    passage = (
        "When Ken joined the volunteer club he forgot the supplies "
        "and the event was cancelled his friends were disappointed"
    )
    copied = "Ken forgot the supplies and the event was cancelled quickly"
    paraphrased = "He failed to bring materials so the gathering could not proceed"
    assert choice_passage_overlap_ratio(copied, passage, "forgot the supplies") > 0.7
    assert choice_passage_overlap_ratio(paraphrased, passage, "forgot the supplies") < 0.5


def test_has_long_verbatim_phrase():
    passage = "the club welcomed more students than ever before in spring"
    assert has_long_verbatim_phrase(
        "By spring the club welcomed more students than ever",
        passage,
    )
    assert not has_long_verbatim_phrase(
        "Membership increased significantly by the end of the season",
        passage,
    )


def test_choice_design_issues_flags_copy_heavy_choices():
    passage = (
        "When Ken joined the volunteer club he forgot the supplies "
        "and the event was cancelled his friends were disappointed"
    )
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=4,
                questionType="english_match",
                prompt="本文に最も合致する英文を一つ選べ。",
                passageAnchor="forgot the supplies and the event was cancelled",
                choices=[
                    Q5ChoiceItem(label="a", text="Ken forgot the supplies and the event was cancelled."),
                    Q5ChoiceItem(label="b", text="Ken forgot the supplies and friends were disappointed."),
                    Q5ChoiceItem(label="c", text="Ken forgot supplies and the event was cancelled quickly."),
                    Q5ChoiceItem(label="d", text="Ken forgot the supplies and event was cancelled sadly."),
                    Q5ChoiceItem(label="e", text="Ken forgot supplies and cancelled the volunteer event."),
                    Q5ChoiceItem(label="f", text="Membership grew after Ken learned from failure."),
                ],
            )
        ]
    )
    issues = choice_design_issues(questions, passage)
    assert any("コピー" in i or "パラフレーズ" in i for i in issues)


def test_parse_q5_choice_line():
    item = parse_q5_choice_line("a: First choice text")
    assert item is not None
    assert item.label == "a"
    assert item.text == "First choice text"


def test_questions_from_claude_converts_choices_and_points():
    raw = Q5QuestionsClaudeResult(
        instructions="読んで答えよ",
        questions=[
            Q5SubQuestionClaude(
                number=1,
                questionType="english_match",
                prompt="一致する英文を選べ",
                passageAnchor="unique anchor phrase",
                choices=[
                    "a: Paraphrased option one",
                    "b: Paraphrased option two",
                ],
            ),
            Q5SubQuestionClaude(
                number=2,
                questionType="reason_explanation",
                prompt="理由を述べよ",
                passageAnchor="theatrical hospitality scene",
                charLimitJa=80,
                requiredPoints=["ポイント1", "ポイント2"],
                directionCriterionJa="因果が本文に沿っていれば可",
            ),
        ],
    )
    result = questions_from_claude(raw)
    assert len(result.questions) == 2
    assert result.questions[0].choices[0].label == "a"
    assert result.questions[1].scoring_points[0].point_ja == "ポイント1"
    assert result.questions[1].scoring_points[0].passage_basis == "theatrical hospitality scene"


def test_teacher_pack_from_claude_merges_inherited_basis():
    questions = Q5QuestionsResult(
        questions=[
            Q5SubQuestion(
                number=2,
                questionType="reason_explanation",
                prompt="理由を述べよ",
                passageAnchor="theatrical hospitality",
                scoringPoints=[
                    Q5ScoringPoint(
                        pointJa="演劇的なもてなし",
                        passageBasis="theatrical hospitality",
                        pointsHint="必須",
                    ),
                    Q5ScoringPoint(
                        pointJa="素朴な善意",
                        passageBasis="without performance",
                        pointsHint="必須",
                    ),
                ],
                directionCriterionJa="因果が本文に沿っていれば可",
            )
        ]
    )
    raw = Q5TeacherPackClaudeResult(
        modelAnswerSummary="(B) 記述例",
        explanations=[
            Q5ExplanationClaude(
                number=2,
                answerText="都市の演劇的な歓待に慣れ、少女の素朴な善意に打ちのめされたから。",
                requiredPoints=["演劇的なもてなしに慣れていた", "素朴な善意の対比"],
                explanationJa="本文の対比が根拠。",
            )
        ],
    )
    pack = teacher_pack_from_claude(raw, questions)
    assert pack.full_translation_ja == ""
    assert len(pack.explanations) == 1
    pts = pack.explanations[0].scoring_points
    assert pts[0].passage_basis == "theatrical hospitality"
    assert pts[0].point_ja == "演劇的なもてなしに慣れていた"
    assert pack.explanations[0].direction_criterion_ja == "因果が本文に沿っていれば可"


def test_assemble_q5_model_answer_shows_scoring_block():
    pack = Q5TeacherPackResult(
        modelAnswerSummary="(B) 記述例",
        explanations=[
            Q5QuestionExplanation(
                number=2,
                answerText="都市の演劇的な歓待に慣れ、少女の素朴な善意に打ちのめされたから。",
                scoringPoints=[
                    Q5ScoringPoint(pointJa="演劇的なもてなし", passageBasis="theatrical"),
                    Q5ScoringPoint(pointJa="素朴な善意", passageBasis="without performance"),
                ],
                directionCriterionJa="理由の因果が本文に沿っていれば可",
                explanationJa="本文の対比が根拠。",
            )
        ],
        fullTranslationJa="全訳",
    )
    text = assemble_q5_model_answer(pack)
    assert "【採点ポイント" in text
    assert "【方向性の判定】" in text
    assert "演劇的なもてなし" in text
