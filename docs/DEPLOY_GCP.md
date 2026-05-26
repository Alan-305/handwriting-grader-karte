# GCP 試験運用デプロイ（Firebase Hosting + Cloud Run）

## 構成

| 役割 | サービス | URL の例 |
|------|----------|----------|
| **画面（フロント URL）** | Firebase Hosting | `https://handwriting-grader-karte.web.app` |
| **API** | Cloud Run `hgk-api` | `https://hgk-api-xxxxx-an.a.run.app` |

先生がブックマークするのは **Hosting の URL（フロント）** だけです。

## 前提

- GCP / Firebase プロジェクト: `handwriting-grader-karte`
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) ログイン済み
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm i -g firebase-tools` → `firebase login`
- ルート `.env` に Firebase 設定・AI キーを記入（`.env.example` 参照）
- **本番の機密キーは Google Secret Manager に保存**し、Cloud Run は Secret を環境変数として参照（平文の `--set-env-vars` には載せない）

## 初回のみ（推奨）

### 1. Secret Manager にキーを登録

```bash
chmod +x scripts/setup-gcp-secrets.sh scripts/deploy-trial.sh scripts/gcp-secrets-lib.sh
npm run setup:gcp-secrets
```

登録される Secret（名前は Secret Manager 上の ID）:

| Secret ID | 内容 | 必須 |
|-----------|------|------|
| `HGK_ANTHROPIC_API_KEY` | Claude API キー | はい |
| `HGK_GEMINI_API_KEY` | Gemini API キー | はい |
| `HGK_FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SA の JSON 全文 | いいえ（`GOOGLE_APPLICATION_CREDENTIALS` のファイルがあるときのみ） |

Cloud Run のデフォルト実行 SA に `secretAccessor` / Firestore / Storage 権限を付与します。

### 2. Firebase Auth の承認済みドメイン

[Authentication → Settings → Authorized domains](https://console.firebase.google.com/project/handwriting-grader-karte/authentication/settings)

- `handwriting-grader-karte.web.app`
- `handwriting-grader-karte.firebaseapp.com`

Google OAuth の **承認済み JavaScript 生成元** にも Hosting URL を追加（[FIREBASE_AUTH_SETUP.md](./FIREBASE_AUTH_SETUP.md)）。

## デプロイ（試験運用）

```bash
npm run deploy:trial
# または ./scripts/deploy-trial.sh
```

処理内容:

1. `.env` から Secret Manager へキーを同期（`setup-gcp-secrets.sh`）
2. Cloud Run に `backend/` をデプロイ（**`--set-secrets`** で AI キーを注入）
3. API URL を取得し、`VITE_API_BASE` に設定してフロントをビルド
4. `firebase deploy` で Hosting + Firestore/Storage ルール

`.env` にキーが無い CI などでは、事前に Secret を登録したうえで:

```bash
SKIP_SECRETS_SYNC=1 npm run deploy:trial
```

## 環境変数の扱い

| 変数 | 保存場所 |
|------|----------|
| `VITE_FIREBASE_*` | `.env` → フロントビルド（公開設定。Secret Manager には入れない） |
| `VITE_API_BASE` | デプロイスクリプトが Cloud Run URL を自動設定 |
| `FIREBASE_PROJECT_ID` / `FIREBASE_STORAGE_BUCKET` / `CORS_ORIGINS` / モデル名 | Cloud Run **非機密**環境変数 |
| `HGK_ANTHROPIC_API_KEY` / `HGK_GEMINI_API_KEY` | **Secret Manager** → Cloud Run `--set-secrets` |
| `HGK_FIREBASE_SERVICE_ACCOUNT_JSON` | 任意。登録時のみ Secret Manager |

### Secret の確認

```bash
gcloud secrets list --project handwriting-grader-karte \
  --filter='name~(HGK_)'

gcloud run services describe hgk-api --region asia-northeast1 \
  --format='yaml(spec.template.spec.containers[0].env)'
```

`valueFrom.secretKeyRef` が付いていれば Secret Manager 経由です。値そのものはコンソール・CLI ではマスクされます。

### キーのローテーション

`.env` のキーを更新したあと:

```bash
npm run setup:gcp-secrets
npm run deploy:trial
```

新しい Secret **バージョン**が作成され、デプロイで `latest` が参照されます。

## 手動デプロイ（参考）

```bash
npm run setup:gcp-secrets
gcloud run deploy hgk-api --source backend --region asia-northeast1 \
  --set-secrets=HGK_ANTHROPIC_API_KEY=HGK_ANTHROPIC_API_KEY:latest,HGK_GEMINI_API_KEY=HGK_GEMINI_API_KEY:latest \
  --env-vars-file=...
```

## トラブルシュート

| 症状 | 対処 |
|------|------|
| 画面は出るが API エラー | `VITE_API_BASE` が空でビルドしていない → 再デプロイ |
| Google ログイン失敗 | Auth 承認済みドメイン・OAuth 生成元を確認 |
| 403 on Firestore | Cloud Run SA に `datastore.user` / Storage 権限（`setup-gcp-secrets` で付与） |
| Secret not found | `npm run setup:gcp-secrets` を実行 |
| Permission denied on secret | 実行 SA に `roles/secretmanager.secretAccessor` |
| OpenCV エラー | Cloud Run メモリ 2Gi 以上（スクリプト既定） |
