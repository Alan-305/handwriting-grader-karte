"""大学別プロンプトレジストリのテスト。"""

from app.ai.prompts.universities.registry import (
    build_generation_system,
    build_q1_generation_system,
    build_q2_generation_system,
    build_q1a_generation_system,
    build_q1b_generation_system,
    build_q2a_generation_system,
    build_q2b_generation_system,
    build_q4b_generation_system,
    build_q5_passage_system,
    build_q5_questions_system,
    get_overrides,
    get_prompt_status,
    grading_supplement,
    list_university_prompt_slugs,
)


def test_todai_has_custom_q5_prompts_not_defaults():
    status = get_prompt_status("todai")
    assert status.slug == "todai"
    assert status.has_custom_module is True
    assert "q5_passage_system" in status.configured_keys
    assert "q5_questions_system" in status.configured_keys

    passage = build_q5_passage_system("todai", "東京大学")
    questions = build_q5_questions_system("todai", "東京大学")
    assert "共通テスト" in passage
    assert "二次試験" in passage
    assert "共通テスト" in questions
    assert "二次試験" in questions
    assert "cloze" in questions
    assert "underlined_explanation" in questions
    assert "q5_solver_system" in status.configured_keys
    assert "q5_teacher_pack_system" in status.configured_keys

    overrides = get_overrides("todai")
    assert overrides.generation_system is None
    assert "東大" in (overrides.notes or "")
    assert "q1a_generation_system" in status.configured_keys
    assert "q1a_validator_system" in status.configured_keys

    q1a = build_q1a_generation_system("todai", "東京大学")
    assert "70" in q1a
    assert "要約" in q1a
    assert "300" in q1a

    assert "q1b_generation_system" in status.configured_keys
    q1b = build_q1b_generation_system("todai", "東京大学")
    assert "空所" in q1b or "(ア)" in q1b
    assert "500" in q1b or "600" in q1b

    assert "q2a_generation_system" in status.configured_keys
    q2a = build_q2a_generation_system("todai", "東京大学")
    assert "60" in q2a
    assert "80" in q2a
    assert "自由英作文" in q2a or "解答例" in q2a

    assert "q2b_generation_system" in status.configured_keys
    q2b = build_q2b_generation_system("todai", "東京大学")
    assert "和文英訳" in q2b or "下線" in q2b
    assert "直訳" in q2b or "比喩" in q2b

    assert "q4b_generation_system" in status.configured_keys
    q4b = build_q4b_generation_system("todai", "東京大学")
    assert "下線" in q4b or "(ア)" in q4b
    assert "和訳" in q4b or "日本語" in q4b


def test_unknown_slug_falls_back_to_defaults():
    status = get_prompt_status("unknown-uni-xyz")
    assert status.has_custom_module is False
    assert status.configured_keys == []

    text = build_generation_system("unknown-uni-xyz", "テスト大学")
    assert "テスト大学" in text
    assert grading_supplement("unknown-uni-xyz") == ""

    q5 = build_q5_questions_system("unknown-uni-xyz", "テスト大学")
    assert "共通テスト" in q5
    assert "二次入試" in q5


def test_sapporo_med_has_q1_comprehensive_prompts():
    status = get_prompt_status("sapporo-med")
    assert status.slug == "sapporo-med"
    assert status.has_custom_module is True
    assert "q1_generation_system" in status.configured_keys
    assert "q1_validator_system" in status.configured_keys
    assert "q2_generation_system" in status.configured_keys
    assert "q2_validator_system" in status.configured_keys

    q1 = build_q1_generation_system("sapporo-med", "札幌医科大学")
    assert "札幌医科大学" in q1
    assert "900" in q1

    q2 = build_q2_generation_system("sapporo-med", "札幌医科大学")
    assert "1,000" in q2 or "1000" in q2
    assert "問6" in q2 or "自由英作文" in q2
    assert "対話文" in q2

    assert grading_supplement("sapporo-med").startswith("札幌医科大学")


def test_list_includes_sapporo_med():
    slugs = list_university_prompt_slugs()
    assert "sapporo-med" in slugs


def test_list_includes_todai():
    slugs = list_university_prompt_slugs()
    assert "todai" in slugs
