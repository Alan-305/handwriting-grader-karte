# 手書き答案添削・個人指導カルテアプリ

高校生の大学受験（医学部・難関大）向け、手書き答案の自動添削と個別指導カルテ管理アプリです。

## 技術スタック

- **Frontend**: React (Vite + TypeScript), Tailwind CSS, shadcn/ui, Recharts
- **Backend**: Python Flask
- **Database**: Firebase (Firestore, Storage, Auth)
- **AI**: Anthropic Claude Vision（添削）, Google Gemini（カルテ分析）

## セットアップ

### 1. 環境変数

```bash
cp .env.example .env
# Firebase / Anthropic / Gemini のキーを設定
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

http://localhost:5173 で起動。API は Vite プロキシ経由で `http://localhost:5001` に転送されます。

### 3. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

macOS では `python` / `pip` ではなく **`python3` / `pip3`**（または venv 有効化後の `python`）を使ってください。

Firebase Admin SDK 用に `GOOGLE_APPLICATION_CREDENTIALS` にサービスアカウント JSON のパスを指定してください。

### 4. Firebase

```bash
firebase deploy --only firestore:rules,storage:rules,firestore:indexes
```

`firebase/` ディレクトリのルールとインデックスをデプロイします。

## 主な機能

| 機能 | 説明 |
|------|------|
| 生徒管理 | 志望校・コース情報の登録 |
| 問題セット | 英/日/記号問題、模範解答、crop 座標 |
| 答案添削 | トンボ位置合わせ → Claude Vision 添削 |
| プリント | 生徒用返却 / 教師用指導資料（PDF） |
| カルテ | 得点推移グラフ、弱点分析、Gemini アドバイス |

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

## UI/UX

- 英語: Century、日本語: 明朝体
- Enter キーによる意図しないフォーム送信を防止
- 添削中 / 考えてます のローディング表示
