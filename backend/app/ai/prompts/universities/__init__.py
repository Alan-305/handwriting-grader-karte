"""大学別プロンプトパック（slug ごとに .py を追加）。"""

from app.ai.prompts.universities.registry import (
    build_generation_system,
    build_q5_passage_system,
    build_q5_questions_system,
    build_q5_solver_system,
    build_q5_teacher_pack_system,
    get_overrides,
    get_prompt_status,
    grading_supplement,
    list_university_prompt_slugs,
)

__all__ = [
    "build_generation_system",
    "build_q5_passage_system",
    "build_q5_questions_system",
    "build_q5_solver_system",
    "build_q5_teacher_pack_system",
    "get_overrides",
    "get_prompt_status",
    "grading_supplement",
    "list_university_prompt_slugs",
]
