from pydantic import BaseModel, Field, field_validator


class Q1ChoiceItem(BaseModel):
    label: str = ""
    text: str = ""


class Q1NumberedParagraph(BaseModel):
    paragraph_index: int = Field(alias="paragraphIndex", ge=1)
    text: str = ""

    model_config = {"populate_by_name": True}


class Q1SynonymQuestion(BaseModel):
    underlined_text: str = Field(alias="underlinedText", default="")
    prompt_ja: str = Field(alias="promptJa", default="")
    choices: list[Q1ChoiceItem] = Field(default_factory=list)
    correct_label: str = Field(alias="correctLabel", default="")
    explanation_ja: str = Field(alias="explanationJa", default="")

    model_config = {"populate_by_name": True}


class Q1ClozeBlank(BaseModel):
    blank_label: str = Field(alias="blankLabel", default="")
    choices: list[Q1ChoiceItem] = Field(default_factory=list)
    correct_label: str = Field(alias="correctLabel", default="")
    explanation_ja: str = Field(alias="explanationJa", default="")

    model_config = {"populate_by_name": True}


class Q1ComprehensiveGenerationResult(BaseModel):
    theme: str = ""
    word_count: int = Field(alias="wordCount", default=0)
    instructions_ja: str = Field(alias="instructionsJa", default="")
    numbered_paragraphs: list[Q1NumberedParagraph] = Field(alias="numberedParagraphs", default_factory=list)
    passage_for_exam: str = Field(alias="passageForExam", default="")
    synonym_questions: list[Q1SynonymQuestion] = Field(alias="synonymQuestions", default_factory=list)
    cloze_prompt_ja: str = Field(alias="clozePromptJa", default="")
    cloze_blanks: list[Q1ClozeBlank] = Field(alias="clozeBlanks", default_factory=list)
    explanation_prompt_ja: str = Field(alias="explanationPromptJa", default="")
    explanation_target: str = Field(alias="explanationTarget", default="")
    char_limit_ja: int = Field(alias="charLimitJa", default=60)
    model_answer_explanation_ja: str = Field(alias="modelAnswerExplanationJa", default="")
    explanation_rationale_ja: str = Field(alias="explanationRationaleJa", default="")
    translation_prompt_ja: str = Field(alias="translationPromptJa", default="")
    underlined_sentence_en: str = Field(alias="underlinedSentenceEn", default="")
    model_translation_ja: str = Field(alias="modelTranslationJa", default="")
    translation_rationale_ja: str = Field(alias="translationRationaleJa", default="")
    essay_prompt_ja: str = Field(alias="essayPromptJa", default="")
    essay_word_min: int = Field(alias="essayWordMin", default=50)
    essay_word_max: int = Field(alias="essayWordMax", default=60)
    model_answer_essay_en: str = Field(alias="modelAnswerEssayEn", default="")
    essay_rationale_ja: str = Field(alias="essayRationaleJa", default="")
    passage_summary_ja: str = Field(alias="passageSummaryJa", default="")
    common_mistakes_ja: list[str] = Field(alias="commonMistakesJa", default_factory=list)

    model_config = {"populate_by_name": True}

    @field_validator(
        "numbered_paragraphs",
        "synonym_questions",
        "cloze_blanks",
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


class Q1ComprehensiveValidatorResult(BaseModel):
    passed: bool = True
    issues: list[str] = Field(default_factory=list)
    summary: str = ""

    model_config = {"populate_by_name": True}
