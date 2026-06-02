"""大学別プロンプトレジストリのテスト。"""

from app.ai.prompts.universities.registry import (
    build_generation_system,
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


def test_list_includes_todai():
    slugs = list_university_prompt_slugs()
    assert "todai" in slugs
