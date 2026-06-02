"""大学別プロンプトの公開 API（実体は universities/registry + _defaults）。"""

from app.ai.prompts.universities import _defaults
from app.ai.prompts.universities.registry import (
    build_generation_system,
    build_q5_passage_system,
    build_q5_questions_system,
    build_q5_solver_system,
    build_q5_teacher_pack_system,
    get_prompt_status,
    grading_supplement,
    list_university_prompt_slugs,
)

difficulty_label = _defaults.difficulty_label

# 後方互換: slug 未指定の呼び出し用（従来シグネチャ）
def build_generation_system_legacy(university_name: str) -> str:
    return build_generation_system("", university_name)


# テスト・旧 import 向け
GENERATION_SYSTEM = build_generation_system("todai", "東京大学")

__all__ = [
    "difficulty_label",
    "build_generation_system",
    "build_q5_passage_system",
    "build_q5_questions_system",
    "build_q5_solver_system",
    "build_q5_teacher_pack_system",
    "get_prompt_status",
    "grading_supplement",
    "list_university_prompt_slugs",
]
