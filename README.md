# 手書き答案添削・個人指導カルテアプリ

高校生の大学受験（主に医学部・難関大）を対象とした、英語・日本語・記号混在の「手書き答案自動添削・個別指導管理アプリ」です。

単なる自動採点ツールではなく、毎回のセッション（授業）データが蓄積され、志望校合格に向けた**個人指導用カルテ（ダッシュボード）**として機能します。

## 技術スタック

| レイヤ | 技術 |
|--------|------|
| Frontend | React (Vite + TypeScript), Tailwind CSS, shadcn/ui, Recharts |
| Backend | Python Flask, OpenCV（トンボ検出・射影変換・トリミング） |
| Database | Firebase Firestore, Firebase Storage, Firebase Auth |
| 添削 AI | Anthropic API (Claude Vision) — 1リクエストで全問採点 |
| カルテ AI | Google Gemini API — 履歴ベースの志望校対策アドバイス |
| コード管理 | GitHub / Cursor |

## セットアップ

### 1. 環境変数

```bash
cp .env.example .env
# Firebase / Anthropic / Gemini のキーを設定
```

### 2. 開発サーバー起動（1コマンド）

初回のみルートで `npm install`（`concurrently` 用）と `frontend` の依存関係を入れます。

```bash
cd frontend && npm install && cd ..
npm install
```

**以降はプロジェクトルートで:**

```bash
npm run dev
```

ブラウザで **http://localhost:5173/login** を開いてください（Chrome / Safari 推奨）。

- フロント: `localhost:5173`（画面）
- バックエンド: `localhost:5001`（API・自動起動。直接開く必要なし）
- フロントの `/api` は Vite が 5001 に転送します

`npm` を使わない場合:

```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

#### なぜ2つに分かれているか

フロント（React/Vite）とバックエンド（Python/Flask）は**言語も開発サーバーも別**です。開発中はそれぞれがホットリロード用のサーバーを立てます。本番でも Hosting + Cloud Run のように別デプロイになるため、リポジトリも `frontend/` と `backend/` に分けています。`npm run dev` で両方まとめて起動し、**確認用 URL は localhost:5173 だけ**で足ります。

### 3. Frontend（個別起動する場合）

```bash
cd frontend
npm install
npm run dev
```

### 4. Backend（個別起動する場合）

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 run.py
```

macOS では `python` / `pip` ではなく **`python3` / `pip3`**（または venv 有効化後の `python3`）を使ってください。

Firebase Admin SDK 用に `GOOGLE_APPLICATION_CREDENTIALS` にサービスアカウント JSON のパスを指定してください。

### 5. Firebase

```bash
firebase deploy --only firestore:rules,storage:rules,firestore:indexes
```

`firebase/` ディレクトリのルールとインデックスをデプロイします。認証設定は [docs/FIREBASE_AUTH_SETUP.md](docs/FIREBASE_AUTH_SETUP.md) を参照。

## 主な機能

| 機能 | 説明 |
|------|------|
| 生徒管理 | 志望校・コース情報の登録 |
| 問題セット | 英/日/記号問題、模範解答、crop 座標 |
| 答案添削 | トンボ位置合わせ → Claude Vision 添削 |
| プリント | 生徒用返却 / 教師用指導資料（PDF） |
| カルテ | 得点推移グラフ、弱点分析、Gemini アドバイス |

## 1セッションのワークフロー

```
【ステップ1: 事前準備】
  先生 → 問題・模範解答・配点を登録（Firebase 保存）
  生徒 → トンボ付き専用解答用紙（A4×2枚）に手書き解答

【ステップ2: 読み込み・補正】
  2枚を D&D アップロード → OpenCV でトンボ検出・射影変換 → 第1〜4問を crop
  処理中は「添削中」「考えてます」を表示

【ステップ3: 評価・フィードバック】
  crop 画像4枚を Claude Vision に1リクエスト送信 → 全問採点・講評・解説

【ステップ4: 資料出力】
  生徒用返却プリント / 教師用指導資料 → 画面表示・PDF → セッション完了
```

### 解答用紙構成

| ページ | 内容 |
|--------|------|
| PAGE 1 | 氏名欄、第1問（100字記述）、第2問（記号・短答(1)〜(4)） |
| PAGE 2 | 第3問（記述・短答(1)〜(2)）、第4問（目安80語の自由英作文） |

## UI/UX 方針 (Pro Max)

- 英語: **Century**、日本語: **明朝体**（`frontend/src/styles/tokens.css`）
- 解説・添削の文字サイズは CSS 変数で固定（画面ごとに変えない）
- Enter キーによる意図しないフォーム送信を防止（`SafeForm`）
- 模範解答は解説枠の外 + TTS ボタンを最優先配置
- 和訳の英語部分には「」、英文に括弧なし、「あなたの解答」の後は1行空ける
- 「不合格」という言葉は使わず、優・良・不可で前向きに添削

### 評価基準

| 評価 | 条件 |
|------|------|
| 優 | 別解可。文法的に正しく意味が通じれば正解 |
| 良 | スペルミス、軽微なケアレスミス |
| 不可 | 時制ミス、文構造の明らかな誤り |

---

## プロジェクトディレクトリ構成

```
handwriting-grader-karte/
├── .cursor/rules/              # Cursor AI 向けプロジェクトルール
├── backend/
│   ├── app/
│   │   ├── ai/                 # Anthropic / Gemini クライアント
│   │   │   ├── anthropic_client.py
│   │   │   ├── gemini_client.py
│   │   │   ├── prompts/        # 添削・カルテ用プロンプト（英/日/記号/no_model）
│   │   │   └── schemas/        # レスポンス JSON スキーマ
│   │   ├── routes/             # Flask ブループリント
│   │   │   ├── upload.py       # 答案画像アップロード
│   │   │   ├── image.py        # align / crop
│   │   │   ├── grading.py      # Claude Vision 添削
│   │   │   ├── analysis.py     # Gemini カルテ分析
│   │   │   └── health.py
│   │   ├── services/
│   │   │   ├── image_processor.py   # OpenCV トンボ検出・補正・トリミング
│   │   │   ├── session_service.py   # セッション CRUD
│   │   │   ├── karte_service.py     # 統計集計・Gemini 連携
│   │   │   ├── scoring.py           # 得点計算
│   │   │   └── grading_prompt.py    # プロンプト組み立て
│   │   ├── utils/
│   │   ├── config.py
│   │   └── extensions.py
│   ├── tests/
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── app/                # App, routes, providers
│   │   ├── pages/              # 画面（生徒・テスト・セッション・カルテ・プリント）
│   │   ├── components/
│   │   │   ├── dashboard/      # Recharts グラフ、AdviceCard
│   │   │   ├── grading/        # 評価バッジ、模範解答パネル
│   │   │   ├── print/          # 生徒用/教師用/A4 レイアウト
│   │   │   ├── upload/         # D&D、crop プレビュー
│   │   │   ├── forms/          # SafeForm（Enter ガード）
│   │   │   ├── typography/     # Century / 明朝 typography
│   │   │   └── ui/             # shadcn/ui
│   │   ├── hooks/              # useAuth, useSession, useStudent, useTts
│   │   ├── lib/                # api-client, firebase, pdf-export, scoring
│   │   ├── styles/             # tokens.css, globals.css
│   │   └── types/              # firestore.ts, api.ts
│   └── vite.config.ts
├── firebase/
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── storage.rules
├── shared/
│   └── openapi.yaml            # フロント・バック共通 API 契約
└── docs/
    └── FIREBASE_AUTH_SETUP.md
```

---

## Firestore データ設計

型定義の正本: `frontend/src/types/firestore.ts`

### コレクション一覧

```
teachers/{teacherId}
students/{studentId}
  ├── karte_snapshots/{snapshotId}    # Gemini 生成のカルテスナップショット
  └── stats/{statId}                  # 集計統計（得点推移など）
target_universities/{universityId}    # 志望校マスタ（難易度・出題傾向）
answer_sheet_templates/{templateId}   # 解答用紙テンプレート（トンボ座標）
tests/{testId}
  └── questions/{questionId}          # 大問・小問・crop 座標・模範解答
sessions/{sessionId}
  ├── question_results/{resultId}       # 各問の採点結果
  └── print_artifacts/{artifactId}    # 生徒用/教師用プリントデータ
```

### 主要ドキュメント

#### `students`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| teacherId | string | 担当教師 UID |
| name | string | 生徒名 |
| course | string | 受講コース |
| targetUniversities | array | 志望大学・学部（priority 付き） |
| memo | string? | メモ |

#### `target_universities`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| name, faculty | string | 大学名・学部 |
| difficultyLevel | 1–5 | 難易度 |
| examTrends | string | 出題傾向（Gemini 参照用） |
| passingScoreGuide | string? | 合格ライン目安 |

#### `tests` / `questions`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| title, totalPoints | — | テスト名・満点 |
| templateId | string | 解答用紙テンプレート参照 |
| questions.prompt | string | 問題文 |
| questions.modelAnswer | string | 模範解答 |
| questions.points | number | 配点 |
| questions.cropRegion | {x,y,width,height} | トリミング座標 |
| questions.answerParts | array? | 小問 (1)(2)… ごとの crop・模範解答 |
| questions.type | english \| japanese \| symbol | 問題種別 |

#### `sessions`

| フィールド | 型 | 説明 |
|-----------|-----|------|
| studentId, testId | string | 生徒・テスト参照 |
| status | uploaded → aligning → grading → review → completed | 進行状態 |
| sourceImagePath | string | Storage 上の原画像 |
| alignedImagePath | string? | 補正後画像 |
| totalScore, maxScore | number | 合計得点 |
| gradingProgress | {current, total, message} | 「添削中」「考えてます」 |

#### `question_results`（sessions サブコレクション）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| grade | 優 \| 良 \| 不可 | 評価 |
| score, maxPoints | number | 得点 |
| feedback, explanation | string | 講評・解説 |
| errorTags | string[] | 弱点タグ（時制ミス、スペルミス等） |
| croppedImagePath | string | crop 画像パス |

#### `karte_snapshots`（students サブコレクション）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| weaknessSummary | string | ミス傾向の言語化 |
| errorFrequency | map | エラー種別の頻度 |
| adviceCards | array | Gemini 生成の指導アドバイス |
| readinessComment | string | 志望校合格レベルに対するコメント |
| sessionIdsIncluded | string[] | 分析対象セッション |

### AI エンジンとデータの関係

| エンジン | 読み取り | 書き込み |
|---------|---------|---------|
| Claude Vision | tests/questions, sessions | question_results, sessions.status/score |
| Gemini | students, sessions/question_results, target_universities, stats | karte_snapshots, stats |

---

## 開発ロードマップ

安全に UI/UX Pro Max 品質を保ちながら段階的に実装する順序です。

### Phase 0 — 基盤 ✅

- [x] モノレポ構成（frontend / backend / firebase / shared）
- [x] Firebase Auth・Firestore ルール・型定義
- [x] Flask スケルトン、Vite プロキシ、OpenAPI 契約
- [x] UI トークン（Century / 明朝）、SafeForm、LoadingOverlay

### Phase 1 — 問題・解答用紙管理

- [x] 生徒 CRUD、志望校マスタ
- [x] テストエディタ（大問・小問・crop 座標・模範解答）
- [x] 解答用紙 / テスト問題の印刷レイアウト
- [ ] crop 座標のビジュアルエディタ（ドラッグで領域指定）

### Phase 2 — 画像パイプライン（OpenCV）

- [x] トンボ検出・射影変換・トリミング（`image_processor.py`）
- [x] アップロード → align → crop API
- [ ] 2ページ（A4×2枚）の一括処理とページ自動判別
- [ ] crop プレビュー UI の精度確認・手動補正フォールバック

### Phase 3 — 添削エンジン（Claude Vision）

- [x] プロンプト分離（英/日/記号/no_model）
- [x] 1リクエスト全問採点、優・良・不可 評価
- [x] モックモード（API キー未設定時）
- [ ] セッション結果画面の講評・TTS 連携の完成度向上
- [ ] 教師による講評修正 → 再保存フロー

### Phase 4 — プリント・セッション完了

- [x] 生徒用返却 / 教師用指導資料レイアウト
- [x] PDF エクスポート
- [ ] 印刷プレビューの最終調整（フォント・余白・1行空け）
- [ ] studentPrintFinalizedAt による確定フロー

### Phase 5 — 個人指導カルテ（Gemini + Recharts）

- [x] 得点推移グラフ、大問別正解率（Recharts）
- [x] 弱点タグ集計、AdviceCard
- [x] Gemini カルテ分析 API
- [ ] 志望校難易度との readiness スコア可視化
- [ ] カルテスナップショットの履歴比較

### Phase 6 — 本番・品質

- [ ] E2E テスト（アップロード → 添削 → プリント）
- [ ] Cloud Run / Firebase Hosting デプロイ
- [ ] エラーハンドリング・リトライ・レート制限
- [ ] パフォーマンス（大容量履歴の Gemini コンテキスト最適化）

---

## 開発モード

API キー未設定時、Claude / Gemini はモックレスポンスを返します。Firebase 未設定時もバックエンドは起動可能です（Storage/Firestore 書き込みはスキップ）。

## テスト

```bash
cd backend
pytest
```

## デプロイ方針

- **Frontend**: Firebase Hosting または Vercel
- **Backend**: Cloud Run または Railway
- **Firebase Rules**: `firebase/` からデプロイ

## Cursor ルール

`.cursor/rules/` に以下を配置しています。エージェントが自動参照します。

| ファイル | 内容 |
|---------|------|
| `project-overview.mdc` | 目的・ワークフロー・技術スタック |
| `grading-criteria.mdc` | 評価基準・トーン・TTS・プリントルール |
| `frontend-uiux.mdc` | UI/UX Pro Max 規約 |
| `backend-conventions.mdc` | Flask / OpenCV / AI 規約 |
