from pydantic import BaseModel, Field, field_validator


class Q5PassageResult(BaseModel):
    title: str = ""
    passage: str
    word_count: int | None = Field(alias="wordCount", default=None)
    theme_summary: str = Field(alias="themeSummary", default="")

    model_config = {"populate_by_name": True}


Q5_MIN_SUB_QUESTIONS = 6
Q5_MAX_SUB_QUESTIONS = 8

Q5_QUESTION_TYPES = (
    "cloze",
    "content_explanation",
    "reason_explanation",
    "word_usage_match",
    "expression_meaning",
    "english_match",
    "underlined_explanation",
    "content_match",
    "short_answer_ja",
    "ordering",
)


class Q5ChoiceItem(BaseModel):
    label: str
    text: str


class Q5ScoringPoint(BaseModel):
    point_ja: str = Field(alias="pointJa")
    passage_basis: str = Field(
        default="",
        alias="passageBasis",
        description="本文中の根拠箇所（短い引用または要約）",
    )
    points_hint: str = Field(
        default="",
        alias="pointsHint",
        description="配点目安・必須/加点の区別など",
    )

    model_config = {"populate_by_name": True}


class Q5SubQuestion(BaseModel):
    number: int
    part_label: str = Field(
        default="",
        alias="partLabel",
        description="小問記号 A, B, C …（表示は (A)(B)(C)）",
    )
    question_type: str = Field(
        alias="questionType",
        description=(
            "cloze|content_explanation|reason_explanation|word_usage_match|"
            "expression_meaning|english_match|underlined_explanation|content_match|"
            "short_answer_ja|ordering "
            "（共通テスト型 chronology/story_map/theme は不可）"
        ),
    )
    prompt: str
    passage_anchor: str = Field(
        default="",
        alias="passageAnchor",
        description="本文中の当該箇所・根拠フレーズ（小問間で重複させない）",
    )
    target_word: str = Field(
        default="",
        alias="targetWord",
        description="word_usage_match で問う語",
    )
    choices: list[Q5ChoiceItem] = Field(default_factory=list)
    underlined_text: str = Field(default="", alias="underlinedText")
    char_limit_ja: int | None = Field(default=None, alias="charLimitJa")
    select_count: int | None = Field(
        default=None,
        alias="selectCount",
        description="内容一致で「正しいものをすべて選べ」等のとき",
    )
    blank_labels: list[str] = Field(
        default_factory=list,
        alias="blankLabels",
        description="空所補充の小問ラベル（(A)(B) 形式。試験番号 (21) は使わない）",
    )
    scoring_points: list[Q5ScoringPoint] = Field(
        default_factory=list,
        alias="scoringPoints",
        description="日本語記述問の必須採点ポイント（2〜4個）",
    )
    direction_criterion_ja: str = Field(
        default="",
        alias="directionCriterionJa",
        description="解答全体の方向性判定基準（日本語1文）",
    )

    model_config = {"populate_by_name": True}

    @field_validator("scoring_points", mode="before")
    @classmethod
    def coerce_scoring_points(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []

    @field_validator("choices", mode="before")
    @classmethod
    def coerce_choices(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q5QuestionsResult(BaseModel):
    instructions: str = ""
    """試験用紙に載せる本文（空所 ___・下線 *語句* を含めてよい）。"""
    passage_for_exam: str = Field(default="", alias="passageForExam")
    questions: list[Q5SubQuestion] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class Q5SolverAnswer(BaseModel):
    number: int
    choice: str = ""
    answer_text: str = Field(default="", alias="answerText")
    brief_reason: str = Field(alias="briefReason", default="")

    model_config = {"populate_by_name": True}


class Q5SolverResult(BaseModel):
    passed: bool = True
    answers: list[Q5SolverAnswer] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}


class Q5QuestionExplanation(BaseModel):
    number: int
    correct_choice: str = Field(alias="correctChoice", default="")
    answer_text: str = Field(default="", alias="answerText")
    explanation_ja: str = Field(alias="explanationJa")
    scoring_points: list[Q5ScoringPoint] = Field(
        default_factory=list,
        alias="scoringPoints",
    )
    direction_criterion_ja: str = Field(default="", alias="directionCriterionJa")

    model_config = {"populate_by_name": True}

    @field_validator("scoring_points", mode="before")
    @classmethod
    def coerce_scoring_points(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q5TeacherPackResult(BaseModel):
    model_answer_summary: str = Field(alias="modelAnswerSummary")
    explanations: list[Q5QuestionExplanation] = Field(default_factory=list)
    full_translation_ja: str = Field(alias="fullTranslationJa")
    vocabulary_list: list[str] = Field(default_factory=list, alias="vocabularyList")

    model_config = {"populate_by_name": True}

    @field_validator("vocabulary_list", mode="before")
    @classmethod
    def coerce_vocab(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v) for v in value if str(v).strip()]
        return []


class Q5PipelineMeta(BaseModel):
    passage_title: str = Field(alias="passageTitle", default="")
    evaluator_passed: bool = Field(alias="evaluatorPassed", default=True)
    evaluator_issues: list[str] = Field(alias="evaluatorIssues", default_factory=list)
    retried_questions: bool = Field(alias="retriedQuestions", default=False)

    model_config = {"populate_by_name": True}
