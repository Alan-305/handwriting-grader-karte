#!/usr/bin/env bash
# 試験運用デプロイ: Cloud Run (API) + Firebase Hosting (画面)
# 機密キーは Secret Manager 経由（平文の Cloud Run 環境変数には載せない）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_ID="${GCP_PROJECT_ID:-handwriting-grader-karte}"
REGION="${GCP_REGION:-asia-northeast1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-hgk-api}"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
# 1 で Secret Manager 同期をスキップ（既に登録済みで .env にキーがない CI 向け）
SKIP_SECRETS_SYNC="${SKIP_SECRETS_SYNC:-0}"

HOSTING_WEB="https://${PROJECT_ID}.web.app"
HOSTING_FB="https://${PROJECT_ID}.firebaseapp.com"
CORS_DEPLOY="${CORS_ORIGINS:-$HOSTING_WEB,$HOSTING_FB}"

# shellcheck source=gcp-secrets-lib.sh
source "$ROOT/scripts/gcp-secrets-lib.sh"
export GCP_PROJECT_ID="$PROJECT_ID"

echo "==> Project: $PROJECT_ID  Region: $REGION  Service: $SERVICE_NAME"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Copy .env.example to .env and fill values."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

for key in FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET VITE_FIREBASE_API_KEY VITE_FIREBASE_PROJECT_ID; do
  if [[ -z "${!key:-}" ]]; then
    echo "Error: $key is empty in $ENV_FILE"
    exit 1
  fi
done

command -v gcloud >/dev/null || { echo "gcloud CLI required"; exit 1; }
command -v firebase >/dev/null || { echo "firebase CLI required (npm i -g firebase-tools)"; exit 1; }

gcloud config set project "$PROJECT_ID" >/dev/null
gcp_secrets_enable_apis
gcloud services enable cloudbuild.googleapis.com artifactregistry.googleapis.com --quiet

if [[ "$SKIP_SECRETS_SYNC" != "1" ]]; then
  echo "==> Syncing secrets to Secret Manager from $ENV_FILE ..."
  bash "$ROOT/scripts/setup-gcp-secrets.sh"
else
  echo "==> SKIP_SECRETS_SYNC=1 — using existing Secret Manager versions"
fi

for secret_name in HGK_ANTHROPIC_API_KEY HGK_GEMINI_API_KEY; do
  gcp_secrets_require_exists "$secret_name"
done

SECRET_BINDINGS="HGK_ANTHROPIC_API_KEY=HGK_ANTHROPIC_API_KEY:latest,HGK_GEMINI_API_KEY=HGK_GEMINI_API_KEY:latest"
if gcloud secrets describe HGK_FIREBASE_SERVICE_ACCOUNT_JSON >/dev/null 2>&1; then
  SECRET_BINDINGS="${SECRET_BINDINGS},HGK_FIREBASE_SERVICE_ACCOUNT_JSON=HGK_FIREBASE_SERVICE_ACCOUNT_JSON:latest"
fi

ENV_YAML="$(mktemp)"
trap 'rm -f "$ENV_YAML"' EXIT
cat >"$ENV_YAML" <<EOF
FLASK_ENV: production
FLASK_DEBUG: "0"
FIREBASE_PROJECT_ID: "${FIREBASE_PROJECT_ID}"
FIREBASE_STORAGE_BUCKET: "${FIREBASE_STORAGE_BUCKET}"
CORS_ORIGINS: "${CORS_DEPLOY}"
ANTHROPIC_MODEL: "${ANTHROPIC_MODEL:-claude-sonnet-4-6}"
GEMINI_MODEL: "${GEMINI_MODEL:-gemini-2.5-flash-lite}"
EOF

echo "==> Deploying API to Cloud Run (secrets from Secret Manager)..."
gcloud run deploy "$SERVICE_NAME" \
  --source "$ROOT/backend" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --max-instances 5 \
  --min-instances 0 \
  --env-vars-file "$ENV_YAML" \
  --set-secrets="$SECRET_BINDINGS" \
  --quiet

API_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')"
echo "==> API URL: $API_URL"

echo "==> Building frontend..."
export VITE_API_BASE="$API_URL"
export VITE_FIREBASE_AUTH_DOMAIN="${VITE_FIREBASE_AUTH_DOMAIN:-${PROJECT_ID}.firebaseapp.com}"
(cd "$ROOT/frontend" && npm ci && npm run build)

echo "==> Deploying Firebase (Hosting + rules + indexes)..."
firebase deploy --project "$PROJECT_ID" --only hosting,firestore:rules,firestore:indexes,storage

echo ""
echo "=============================================="
echo "  Deploy complete (trial)"
echo "=============================================="
echo "  App (open this):  $HOSTING_WEB"
echo "  Alt URL:          $HOSTING_FB"
echo "  API:              $API_URL"
echo "  Secrets:          Secret Manager (HGK_ANTHROPIC_API_KEY, HGK_GEMINI_API_KEY)"
echo ""
echo "  If login fails, add authorized domains in Firebase Console:"
echo "    ${PROJECT_ID}.web.app"
echo "    ${PROJECT_ID}.firebaseapp.com"
echo "=============================================="
