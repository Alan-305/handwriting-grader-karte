"""Pydantic モデルを Gemini response_schema 向けに整形する。"""

from __future__ import annotations

import copy
from typing import Any

from pydantic import BaseModel

_STRIP_KEYS = frozenset(
    {
        "$defs",
        "title",
        "default",
        "additionalProperties",
        # google.generativeai の response_schema（OpenAPI 3.0 サブセット）非対応
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "minLength",
        "maxLength",
        "minItems",
        "maxItems",
        "multipleOf",
        "pattern",
    }
)


def gemini_response_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Gemini GenerationConfig.response_schema 用に JSON Schema を簡略化する。"""
    raw = model.model_json_schema()
    defs = raw.pop("$defs", {})
    resolved = _resolve_node(raw, defs)
    return _prune_for_gemini(resolved)


def _resolve_node(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, dict):
        if "$ref" in node:
            ref_name = node["$ref"].rsplit("/", 1)[-1]
            if ref_name not in defs:
                raise ValueError(f"Unknown schema ref: {node['$ref']}")
            return _resolve_node(copy.deepcopy(defs[ref_name]), defs)
        if "anyOf" in node:
            variants = [v for v in node["anyOf"] if v != {"type": "null"}]
            if len(variants) == 1:
                return _resolve_node(variants[0], defs)
        if "allOf" in node:
            merged: dict[str, Any] = {}
            for part in node["allOf"]:
                resolved = _resolve_node(part, defs)
                if isinstance(resolved, dict):
                    merged.update(resolved)
            return merged
        return {k: _resolve_node(v, defs) for k, v in node.items()}
    if isinstance(node, list):
        return [_resolve_node(item, defs) for item in node]
    return node


def _prune_for_gemini(node: Any) -> Any:
    if isinstance(node, dict):
        return {
            k: _prune_for_gemini(v)
            for k, v in node.items()
            if k not in _STRIP_KEYS
        }
    if isinstance(node, list):
        return [_prune_for_gemini(item) for item in node]
    return node
