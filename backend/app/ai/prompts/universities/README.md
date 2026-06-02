# 大学別プロンプト（コード登録）

過去問コーパスの **slug**（例: `todai`, `osaka`）と同じ名前の Python ファイルを置くと、その大学だけ AI 指示を差し替えられます。

## 手順

1. `_template.py` をコピーし、`{slug}.py` として保存（例: `osaka.py`）
2. `SLUG` とファイル名が一致していることを確認
3. 準備できた定数だけ文字列を書き込む（未準備は `None` のまま）
4. ローカル: バックエンド再起動 / 本番: 再デプロイ

## 定数

| 定数名 | 用途 |
|--------|------|
| `GENERATION_SYSTEM` | 第1〜4問など、型別の問題・模範解答生成 |
| `Q5_PASSAGE_SYSTEM` | 第5問・長文物語本文 |
| `Q5_QUESTIONS_SYSTEM` | 第5問・設問 (1)〜(5) |
| `Q5_SOLVER_SYSTEM` | 第5問・解答妥当性検証（任意） |
| `Q5_TEACHER_PACK_SYSTEM` | 第5問・解答・解説・全訳（任意） |
| `GRADING_SUPPLEMENT` | 手書き添削時に追加する大学固有の短文 |
| `NOTES` | 人間用メモ（AI には送られません） |

## デフォルト

ファイルが無い大学、または定数が `None` の項目は、`universities/_defaults.py` の共通テンプレート（大学名だけ差し替え）が使われます。

第5問生成は **大学入学共通テスト第5問の定型（時系列並べ替え・Story Map 等）には寄せません**。`todai.py` には東大二次向けの専用プロンプトがあります。

## API

`GET /api/universities/{slug}/prompt-config` で、モジュールの有無と設定済みキーを確認できます。
