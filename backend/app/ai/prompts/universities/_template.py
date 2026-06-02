"""大学別プロンプトの雛形 — コピーして {slug}.py として保存してください。

例: 大阪大学用 → `osaka.py`（過去問コーパスの slug と同じ名前にする）

使い方:
1. このファイルを `app/ai/prompts/universities/あなたのslug.py` にコピー
2. SLUG を確認（過去問登録時の slug と一致させる）
3. 準備できた定数だけ文字列を入れる（None のまま = アプリ共通デフォルト）
4. バックエンドを再起動（本番は再デプロイ）

定数一覧:
- GENERATION_SYSTEM      … 型別問題生成（第1〜4問など）のシステムプロンプト全文
- Q5_PASSAGE_SYSTEM      … 第5問・物語本文 Writer
- Q5_QUESTIONS_SYSTEM    … 第5問・設問 Writer
- Q5_SOLVER_SYSTEM       … 第5問・検証 Evaluator（省略可）
- Q5_TEACHER_PACK_SYSTEM … 第5問・解答・解説・全訳（省略可）
- Q4A_PROBLEM_SYSTEM     … 第4問(A)・誤り指摘問題（省略可）
- Q4A_VALIDATOR_SYSTEM   … 第4問(A)・検証（省略可）
- Q4A_TEACHER_PACK_SYSTEM … 第4問(A)・解答・解説（省略可）
- GRADING_SUPPLEMENT     … 添削時に追加する大学固有の指示（短文で可）
- NOTES                  … 管理用メモ（AIには渡らない）

すべて None のファイルを置いても構いません（「この大学用枠を確保した」印）。
"""

# 過去問コーパスの slug と一致させること（例: osaka, kyodai, todai）
SLUG = "your_slug_here"

# --- 以下、準備できたものだけ文字列を代入（未準備は None のまま） ---

GENERATION_SYSTEM: str | None = None

Q5_PASSAGE_SYSTEM: str | None = None

Q5_QUESTIONS_SYSTEM: str | None = None

Q5_SOLVER_SYSTEM: str | None = None

Q5_TEACHER_PACK_SYSTEM: str | None = None

Q4A_PROBLEM_SYSTEM: str | None = None

Q4A_VALIDATOR_SYSTEM: str | None = None

Q4A_TEACHER_PACK_SYSTEM: str | None = None

GRADING_SUPPLEMENT: str | None = None

NOTES: str | None = "作成者メモ: 初版はデフォルトプロンプトを使用"
