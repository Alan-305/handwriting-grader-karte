from pydantic import BaseModel, Field, field_validator


class Q2ChoiceItem(BaseModel):
    label: str = ""
    text: str = ""

    model_config = {"populate_by_name": True}


class Q2NumberedParagraph(BaseModel):
    paragraph_index: int = Field(alias="paragraphIndex", ge=1)
    text: str = ""

    model_config = {"populate_by_name": True}


class Q2IdiomQuestion(BaseModel):
    underlined_text: str = Field(alias="underlinedText", default="")
    prompt_ja: str = Field(alias="promptJa", default="")
    choices: list[Q2ChoiceItem] = Field(default_factory=list)
    correct_label: str = Field(alias="correctLabel", default="")
    explanation_ja: str = Field(alias="explanationJa", default="")

    model_config = {"populate_by_name": True}


class Q2ClozeBlank(BaseModel):
    blank_label: str = Field(alias="blankLabel", default="")
    choices: list[Q2ChoiceItem] = Field(default_factory=list)
    correct_label: str = Field(alias="correctLabel", default="")
    explanation_ja: str = Field(alias="explanationJa", default="")

    model_config = {"populate_by_name": True}


class Q2EssayAnswerExample(BaseModel):
    stance_label: str = Field(alias="stanceLabel", default="")
    answer_en: str = Field(alias="answerEn", default="")
    explanation_ja: str = Field(alias="explanationJa", default="")

    model_config = {"populate_by_name": True}


class Q2ComprehensiveGenerationResult(BaseModel):
    theme: str = ""
    word_count: int = Field(alias="wordCount", default=0)
    instructions_ja: str = Field(alias="instructionsJa", default="")
    numbered_paragraphs: list[Q2NumberedParagraph] = Field(alias="numberedParagraphs", default_factory=list)
    passage_for_exam: str = Field(alias="passageForExam", default="")
    comprehension_prompt_ja: str = Field(alias="comprehensionPromptJa", default="")
    comprehension_target: str = Field(alias="comprehensionTarget", default="")
    comprehension_paragraph_index: int | None = Field(alias="comprehensionParagraphIndex", default=None)
    comprehension_char_limit_ja: int = Field(alias="comprehensionCharLimitJa", default=80)
    model_answer_comprehension_ja: str = Field(alias="modelAnswerComprehensionJa", default="")
    comprehension_rationale_ja: str = Field(alias="comprehensionRationaleJa", default="")
    idiom_questions: list[Q2IdiomQuestion] = Field(alias="idiomQuestions", default_factory=list)
    truth_prompt_ja: str = Field(alias="truthPromptJa", default="")
    truth_choices: list[Q2ChoiceItem] = Field(alias="truthChoices", default_factory=list)
    truth_correct_label: str = Field(alias="truthCorrectLabel", default="")
    truth_select_mode: str = Field(alias="truthSelectMode", default="one_correct")
    truth_rationale_ja: str = Field(alias="truthRationaleJa", default="")
    interpretation_prompt_ja: str = Field(alias="interpretationPromptJa", default="")
    interpretation_target: str = Field(alias="interpretationTarget", default="")
    interpretation_char_limit_ja: int = Field(alias="interpretationCharLimitJa", default=80)
    model_answer_interpretation_ja: str = Field(alias="modelAnswerInterpretationJa", default="")
    interpretation_rationale_ja: str = Field(alias="interpretationRationaleJa", default="")
    cloze_prompt_ja: str = Field(alias="clozePromptJa", default="")
    cloze_blanks: list[Q2ClozeBlank] = Field(alias="clozeBlanks", default_factory=list)
    essay_prompt_ja: str = Field(alias="essayPromptJa", default="")
    essay_word_min: int = Field(alias="essayWordMin", default=80)
    essay_answer_examples: list[Q2EssayAnswerExample] = Field(alias="essayAnswerExamples", default_factory=list)
    passage_summary_ja: str = Field(alias="passageSummaryJa", default="")
    common_mistakes_ja: list[str] = Field(alias="commonMistakesJa", default_factory=list)

    model_config = {"populate_by_name": True}

    @field_validator(
        "numbered_paragraphs",
        "idiom_questions",
        "truth_choices",
        "cloze_blanks",
        "essay_answer_examples",
        "common_mistakes_ja",
        mode="before",
    )
    @classmethod
    def coerce_lists(cls, value: object) -> list:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class Q2ComprehensiveValidatorResult(BaseModel):
    passed: bool = True
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}
