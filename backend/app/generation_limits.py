"""Gemini 問題生成のトークン・文字数上限。

Gemini 2.5 Flash-Lite の公式上限:
- 入力: 約 1,048,576 tokens
- 出力: 最大 65,536 tokens（max_output_tokens で指定）

1000語前後の長文 + 設問6問 + 模範解答（JSON）向けに参照文字数・出力トークンを別枠で確保する。
"""

# --- 出力トークン（Gemini max_output_tokens）---
GEMINI_MAX_OUTPUT_COMPREHENSIVE = 65536
GEMINI_MAX_OUTPUT_STANDARD = 16384
GEMINI_MAX_OUTPUT_VALIDATOR = 4096

# --- 参照過去問（1問あたりの切り詰め）---
REFERENCE_PROMPT_MAX_CHARS = 24_000
REFERENCE_MODEL_ANSWER_MAX_CHARS = 12_000

# --- 参照過去問（プロンプトに載せる合計）---
REFERENCE_CONTEXT_MAX_CHARS_COMPREHENSIVE = 52_000
REFERENCE_CONTEXT_LIMIT_COMPREHENSIVE = 2
REFERENCE_CONTEXT_MAX_CHARS_STANDARD = 12_000
REFERENCE_CONTEXT_LIMIT_STANDARD = 3
