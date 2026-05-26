"""Gemini model name normalization tests."""

from app.ai.gemini_client import normalize_gemini_model


def test_normalize_gemini_model_defaults():
    assert normalize_gemini_model(None) == "gemini-2.5-flash"
    assert normalize_gemini_model("") == "gemini-2.5-flash"


def test_normalize_gemini_model_strips_models_prefix():
    assert normalize_gemini_model("models/gemini-2.5-flash") == "gemini-2.5-flash"


def test_normalize_gemini_model_migrates_deprecated():
    assert normalize_gemini_model("gemini-2.0-flash") == "gemini-2.5-flash"
    assert normalize_gemini_model("models/gemini-2.0-flash") == "gemini-2.5-flash"
    assert normalize_gemini_model("gemini-2.0-flash-exp") == "gemini-2.5-flash"
