from app.ai.anthropic_client import normalize_anthropic_model


def test_normalize_anthropic_model_defaults():
    assert normalize_anthropic_model(None) == "claude-sonnet-4-6"
    assert normalize_anthropic_model("") == "claude-sonnet-4-6"


def test_normalize_anthropic_model_migrates_deprecated():
    assert normalize_anthropic_model("claude-sonnet-4-20250514") == "claude-sonnet-4-6"
    assert normalize_anthropic_model("claude-sonnet-4-0") == "claude-sonnet-4-6"
