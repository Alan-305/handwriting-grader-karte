# 過去問 PDF 配置ディレクトリ

## 東大向け・4ファイル構成（推奨）

手動でリスニング脚本を問題 PDF から外し、**4つに分ける**運用が最も確実です。

```
data/past-exams/universities/todai/2026/
  2026東大問題.pdf        … 脚本を除いた問題用紙
  2026東大解答.pdf        … 模範解答
  2026東大リスニング.pdf  … 脚本のみ
  2026東大分析シート.pdf  … 分析シート（任意）
```

ファイル名の例（いずれも自動検出）:

| 種類 | 例 |
|------|-----|
| 問題 | `exam.pdf`, `*問題*.pdf` |
| 模範解答 | `answers.pdf`, `*解答*.pdf` |
| リスニングスクリプト | `listening.pdf`, `*リスニング*.pdf` |
| 分析シート | `analysis.pdf`, `*分析*.pdf` |

## インポート

### アプリから（推奨）

1. サイドバー **過去問** → 大学を選択 → **新しい年度を取り込む**
2. 任意の年度と PDF（問題・模範解答・リスニングスクリプト・分析シート）をアップロード
3. 解析結果を確認・編集 → **ドラフト保存** または **承認して保存**

年度数に上限はありません。新しい入試が公開されるたびに追加してください。

### CLI（開発・バッチ用）

```bash
npm run import:past-exam -- --university todai --year 2026
npm run import:past-exam -- --university todai --year 2026 --from-draft --write-firestore
```

### 脚本だけ後から（問題取り込み済みのあと）

```bash
npm run import:listening -- --university todai --year 2026
npm run import:listening -- --university todai --year 2026 --from-listening-draft --write-firestore
```

## Firestore 保存先（教師ごと・非共有）

過去問の**中身**（問題文・模範解答・脚本・PDF）は、取り込んだ教師の UID 配下のみに保存されます。他の教師からは閲覧・問題生成の参照はできません。

| データ | 保存先 |
|--------|--------|
| 大問 | `teachers/{teacherId}/past_exam_catalog/todai/past_questions/2026_{大問ID}` |
| 脚本・年度メタ | `teachers/{teacherId}/past_exam_catalog/todai/exam_years/2026` |
| PDF原本 | Storage `teachers/{teacherId}/past-exams/todai/2026/` |
| 大学名マスタのみ | `universities/todai`（名称・slug のみ。過去問本文は含まない） |

CLI で Firestore に書き込む場合は `--teacher-id <Firebase Auth UID>` を指定してください。

### 旧共有データの移行（再取り込み不要）

教師隔離以前に `universities/{slug}/...` に入っていた過去問を、指定 UID 配下へコピーする:

```bash
backend/.venv/bin/python3 scripts/migrate_legacy_past_exams.py --teacher-id YOUR_UID --dry-run
backend/.venv/bin/python3 scripts/migrate_legacy_past_exams.py --teacher-id YOUR_UID
```

`GOOGLE_APPLICATION_CREDENTIALS` または Secret Manager 経由の認証が必要です。

## ドラフト JSON

- 問題一式: `import-draft.json`
- 脚本のみ: `listening-import-draft.json`

どちらも手修正してから `--write-firestore` してください。

## 注意

- PDF は `.gitignore` 対象（リポジトリにコミットしない）
- 問題 PDF に脚本ページが残っている場合、OCR が長くなります。**脚本を切り出して別 PDF 推奨**
- macOS では `python` ではなく `backend/.venv/bin/python3` または `npm run` を使用
