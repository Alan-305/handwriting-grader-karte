from app.services.question_prompt_markup import PROMPT_MARKUP_RULES

GENERATION_SYSTEM = f"""あなたは難関大学入試（特に東京大学英語）の問題作成の専門家です。
過去問の出題系統（第N問(A)型など）を参考に、**新しいオリジナル問題**を作成してください。

ルール:
- 過去問の文章をそのままコピーしない。題材・設問は新規作成する
- 形式・技能・字数/語数・指示の厳しさは参照過去問に合わせる
- 模範解答も作成する（記述・英作文は模範文、選択式は正答記号と簡潔な根拠）
- type は english / japanese / symbol のいずれか
- answerFormat は japanese_writing / english_writing / symbol / composite のいずれか（該当時）
- notes に参考にした過去問（年度・型）と作成の意図を簡潔に
- points は必ず整数（null 不可。不明なら参照過去問の配点に合わせる）

{PROMPT_MARKUP_RULES}

出力は JSON のみ:
{{
  "questions": [{{
    "typeLabel": "第1問(A)",
    "majorOrder": 1,
    "partLabel": "(A)",
    "prompt": "次の英文の下線部を日本語訳せよ。\\n\\nHe made an *important decision* yesterday.",
    "modelAnswer": "模範解答",
    "points": 10,
    "type": "english",
    "answerFormat": "japanese_writing",
    "notes": "参考: 東大2026 第1問(A)。100字要約形式。",
    "referenceExamples": ["東大2026 第1問(A)"]
  }}]
}}"""


def build_generation_user_prompt(
    *,
    university_name: str,
    selections: list[dict],
    reference_context: str,
    difficulty: str,
    topic_hint: str,
    count_per_type: int,
) -> str:
    selection_lines = []
    for sel in selections:
        selection_lines.append(
            f"- {sel.get('typeLabel')} (majorOrder={sel.get('majorOrder')}, partLabel={sel.get('partLabel')!r})"
        )

    topic_block = f"\n題材の方向性: {topic_hint}" if topic_hint.strip() else ""

    return f"""大学: {university_name}
難易度: {difficulty}（standard=過去問同等, easier=やや易, harder=やや難）
1型あたり {count_per_type} 問生成{topic_block}

生成する型:
{chr(10).join(selection_lines)}

【参照過去問（形式の手本）】
{reference_context}

上記の型ごとに、過去問と同じ出題形式・技能だが内容は新規の問題文と模範解答を生成してください。
参照過去問の prompt に *語句* や ___ がある場合は、生成する prompt にも必ず同様の記法で下線・空欄を入れてください。"""
