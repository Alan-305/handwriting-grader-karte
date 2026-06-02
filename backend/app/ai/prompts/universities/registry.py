"""大学 slug ごとのプロンプト上書きを解決するレジストリ。

`app/ai/prompts/universities/{slug}.py` を追加すると、その大学だけ
GENERATION_SYSTEM 等を差し替え可能。未作成の大学は _defaults を使用。
"""

from __future__ import annotations

import importlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from app.ai.prompts.universities import _defaults

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
_SKIP_MODULES = frozenset({"_defaults", "_template", "registry"})


@dataclass
class UniversityPromptOverrides:
    """大学別 .py で定義する任意の上書き（None = デフォルトを使用）。"""

    generation_system: str | None = None
    q5_passage_system: str | None = None
    q5_questions_system: str | None = None
    q5_solver_system: str | None = None
    q5_teacher_pack_system: str | None = None
    q4a_problem_system: str | None = None
    q4a_validator_system: str | None = None
    q4a_teacher_pack_system: str | None = None
    q1a_generation_system: str | None = None
    q1a_validator_system: str | None = None
    q1b_generation_system: str | None = None
    q1b_validator_system: str | None = None
    q2a_generation_system: str | None = None
    q2a_validator_system: str | None = None
    q2b_generation_system: str | None = None
    q2b_validator_system: str | None = None
    q4b_generation_system: str | None = None
    q4b_validator_system: str | None = None
    grading_supplement: str | None = None
    notes: str = ""


@dataclass
class UniversityPromptStatus:
    slug: str
    has_custom_module: bool
    configured_keys: list[str] = field(default_factory=list)


def _normalize_slug(slug: str) -> str:
    return (slug or "").strip().lower()


def _module_name_for_slug(slug: str) -> str:
    return slug.replace("-", "_")


def _prompts_dir() -> Path:
    return Path(__file__).resolve().parent


def list_university_prompt_slugs() -> list[str]:
    """登録用 .py が存在する slug 一覧（_ で始まるファイルは除外）。"""
    slugs: list[str] = []
    for path in sorted(_prompts_dir().glob("*.py")):
        stem = path.stem
        if stem.startswith("_") or stem in _SKIP_MODULES:
            continue
        mod = _load_module(stem.replace("-", "_"))
        declared = _non_empty(getattr(mod, "SLUG", None)) if mod else None
        slugs.append(declared or stem.replace("_", "-"))
    return slugs


def _load_module(slug: str):
    normalized = _normalize_slug(slug)
    if not normalized or not _SLUG_RE.match(normalized):
        return None
    module_name = f"app.ai.prompts.universities.{_module_name_for_slug(normalized)}"
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError:
        return None


def _non_empty(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def get_overrides(slug: str) -> UniversityPromptOverrides:
    mod = _load_module(slug)
    if mod is None:
        return UniversityPromptOverrides()
    return UniversityPromptOverrides(
        generation_system=_non_empty(getattr(mod, "GENERATION_SYSTEM", None)),
        q5_passage_system=_non_empty(getattr(mod, "Q5_PASSAGE_SYSTEM", None)),
        q5_questions_system=_non_empty(getattr(mod, "Q5_QUESTIONS_SYSTEM", None)),
        q5_solver_system=_non_empty(getattr(mod, "Q5_SOLVER_SYSTEM", None)),
        q5_teacher_pack_system=_non_empty(getattr(mod, "Q5_TEACHER_PACK_SYSTEM", None)),
        q4a_problem_system=_non_empty(getattr(mod, "Q4A_PROBLEM_SYSTEM", None)),
        q4a_validator_system=_non_empty(getattr(mod, "Q4A_VALIDATOR_SYSTEM", None)),
        q4a_teacher_pack_system=_non_empty(getattr(mod, "Q4A_TEACHER_PACK_SYSTEM", None)),
        q1a_generation_system=_non_empty(getattr(mod, "Q1A_GENERATION_SYSTEM", None)),
        q1a_validator_system=_non_empty(getattr(mod, "Q1A_VALIDATOR_SYSTEM", None)),
        q1b_generation_system=_non_empty(getattr(mod, "Q1B_GENERATION_SYSTEM", None)),
        q1b_validator_system=_non_empty(getattr(mod, "Q1B_VALIDATOR_SYSTEM", None)),
        q2a_generation_system=_non_empty(getattr(mod, "Q2A_GENERATION_SYSTEM", None)),
        q2a_validator_system=_non_empty(getattr(mod, "Q2A_VALIDATOR_SYSTEM", None)),
        q2b_generation_system=_non_empty(getattr(mod, "Q2B_GENERATION_SYSTEM", None)),
        q2b_validator_system=_non_empty(getattr(mod, "Q2B_VALIDATOR_SYSTEM", None)),
        q4b_generation_system=_non_empty(getattr(mod, "Q4B_GENERATION_SYSTEM", None)),
        q4b_validator_system=_non_empty(getattr(mod, "Q4B_VALIDATOR_SYSTEM", None)),
        grading_supplement=_non_empty(getattr(mod, "GRADING_SUPPLEMENT", None)),
        notes=_non_empty(getattr(mod, "NOTES", None)) or "",
    )


def get_prompt_status(slug: str) -> UniversityPromptStatus:
    normalized = _normalize_slug(slug)
    overrides = get_overrides(normalized)
    keys: list[str] = []
    if overrides.generation_system:
        keys.append("generation_system")
    if overrides.q5_passage_system:
        keys.append("q5_passage_system")
    if overrides.q5_questions_system:
        keys.append("q5_questions_system")
    if overrides.q5_solver_system:
        keys.append("q5_solver_system")
    if overrides.q5_teacher_pack_system:
        keys.append("q5_teacher_pack_system")
    if overrides.q4a_problem_system:
        keys.append("q4a_problem_system")
    if overrides.q4a_validator_system:
        keys.append("q4a_validator_system")
    if overrides.q4a_teacher_pack_system:
        keys.append("q4a_teacher_pack_system")
    if overrides.q1a_generation_system:
        keys.append("q1a_generation_system")
    if overrides.q1a_validator_system:
        keys.append("q1a_validator_system")
    if overrides.q1b_generation_system:
        keys.append("q1b_generation_system")
    if overrides.q1b_validator_system:
        keys.append("q1b_validator_system")
    if overrides.q2a_generation_system:
        keys.append("q2a_generation_system")
    if overrides.q2a_validator_system:
        keys.append("q2a_validator_system")
    if overrides.q2b_generation_system:
        keys.append("q2b_generation_system")
    if overrides.q2b_validator_system:
        keys.append("q2b_validator_system")
    if overrides.q4b_generation_system:
        keys.append("q4b_generation_system")
    if overrides.q4b_validator_system:
        keys.append("q4b_validator_system")
    if overrides.grading_supplement:
        keys.append("grading_supplement")
    mod = _load_module(normalized)
    return UniversityPromptStatus(
        slug=normalized,
        has_custom_module=mod is not None,
        configured_keys=keys,
    )


def build_generation_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.generation_system:
        return overrides.generation_system
    return _defaults.default_generation_system(university_name)


def build_q5_passage_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q5_passage_system:
        return overrides.q5_passage_system
    return _defaults.default_q5_passage_system(university_name)


def build_q5_questions_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q5_questions_system:
        return overrides.q5_questions_system
    return _defaults.default_q5_questions_system(university_name)


def build_q5_solver_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q5_solver_system:
        return overrides.q5_solver_system
    if default_system.strip():
        return default_system
    from app.ai.prompts.question_generation_q5 import Q5_SOLVER_SYSTEM

    return Q5_SOLVER_SYSTEM


def build_q5_teacher_pack_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q5_teacher_pack_system:
        return overrides.q5_teacher_pack_system
    return default_system


def grading_supplement(slug: str) -> str:
    return get_overrides(slug).grading_supplement or ""


def build_q4a_problem_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q4a_problem_system:
        return overrides.q4a_problem_system
    return _defaults.default_q4a_problem_system(university_name)


def build_q4a_validator_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q4a_validator_system:
        return overrides.q4a_validator_system
    if default_system.strip():
        return default_system
    from app.ai.prompts.question_generation_q4a import Q4A_VALIDATOR_SYSTEM_FALLBACK

    return Q4A_VALIDATOR_SYSTEM_FALLBACK


def build_q4a_teacher_pack_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q4a_teacher_pack_system:
        return overrides.q4a_teacher_pack_system
    if default_system.strip():
        return default_system
    from app.ai.prompts.question_generation_q4a import Q4A_TEACHER_PACK_SYSTEM_FALLBACK

    return Q4A_TEACHER_PACK_SYSTEM_FALLBACK


def build_q1a_generation_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q1a_generation_system:
        return overrides.q1a_generation_system
    return _defaults.default_q1a_generation_system(university_name)


def build_q1a_validator_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q1a_validator_system:
        return overrides.q1a_validator_system
    if default_system.strip():
        return default_system
    from app.ai.prompts.question_generation_q1a import Q1A_VALIDATOR_SYSTEM_FALLBACK

    return Q1A_VALIDATOR_SYSTEM_FALLBACK


def build_q1b_generation_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q1b_generation_system:
        return overrides.q1b_generation_system
    return _defaults.default_q1b_generation_system(university_name)


def build_q1b_validator_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q1b_validator_system:
        return overrides.q1b_validator_system
    if default_system.strip():
        return default_system
    from app.ai.prompts.question_generation_q1b import Q1B_VALIDATOR_SYSTEM_FALLBACK

    return Q1B_VALIDATOR_SYSTEM_FALLBACK


def build_q2a_generation_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q2a_generation_system:
        return overrides.q2a_generation_system
    return _defaults.default_q2a_generation_system(university_name)


def build_q2a_validator_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q2a_validator_system:
        return overrides.q2a_validator_system
    if default_system.strip():
        return default_system
    from app.ai.prompts.question_generation_q2a import Q2A_VALIDATOR_SYSTEM_FALLBACK

    return Q2A_VALIDATOR_SYSTEM_FALLBACK


def build_q2b_generation_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q2b_generation_system:
        return overrides.q2b_generation_system
    return _defaults.default_q2b_generation_system(university_name)


def build_q2b_validator_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q2b_validator_system:
        return overrides.q2b_validator_system
    if default_system.strip():
        return default_system
    from app.ai.prompts.question_generation_q2b import Q2B_VALIDATOR_SYSTEM_FALLBACK

    return Q2B_VALIDATOR_SYSTEM_FALLBACK


def build_q4b_generation_system(slug: str, university_name: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q4b_generation_system:
        return overrides.q4b_generation_system
    return _defaults.default_q4b_generation_system(university_name)


def build_q4b_validator_system(slug: str, default_system: str) -> str:
    overrides = get_overrides(slug)
    if overrides.q4b_validator_system:
        return overrides.q4b_validator_system
    if default_system.strip():
        return default_system
    from app.ai.prompts.question_generation_q4b import Q4B_VALIDATOR_SYSTEM_FALLBACK

    return Q4B_VALIDATOR_SYSTEM_FALLBACK
