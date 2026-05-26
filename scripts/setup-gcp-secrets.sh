#!/usr/bin/env bash
# .env の機密値を Google Secret Manager に登録し、Cloud Run 実行 SA に参照権限を付与
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
PROJECT_ID="${GCP_PROJECT_ID:-handwriting-grader-karte}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Copy .env.example to .env"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# shellcheck source=gcp-secrets-lib.sh
source "$ROOT/scripts/gcp-secrets-lib.sh"

export GCP_PROJECT_ID="$PROJECT_ID"
gcloud config set project "$PROJECT_ID" >/dev/null

ANTHROPIC_KEY="${HGK_ANTHROPIC_API_KEY:-${ANTHROPIC_API_KEY:-}}"
GEMINI_KEY="${HGK_GEMINI_API_KEY:-${GEMINI_API_KEY:-}}"

echo "==> Secret Manager setup (project: $PROJECT_ID)"
gcp_secrets_enable_apis

missing=0
if [[ -z "$ANTHROPIC_KEY" ]]; then
  echo "Error: HGK_ANTHROPIC_API_KEY (or ANTHROPIC_API_KEY) is empty in $ENV_FILE"
  missing=1
fi
if [[ -z "$GEMINI_KEY" ]]; then
  echo "Error: HGK_GEMINI_API_KEY (or GEMINI_API_KEY) is empty in $ENV_FILE"
  missing=1
fi
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

gcp_secrets_create_or_update "HGK_ANTHROPIC_API_KEY" "$ANTHROPIC_KEY"
gcp_secrets_create_or_update "HGK_GEMINI_API_KEY" "$GEMINI_KEY"

# 任意: ローカル用 serviceAccountKey.json を本番でも明示 SA として使う場合
SA_PATH="${GOOGLE_APPLICATION_CREDENTIALS:-}"
if [[ -n "$SA_PATH" && -f "$SA_PATH" ]]; then
  SA_JSON="$(cat "$SA_PATH")"
  if gcp_secrets_create_or_update "HGK_FIREBASE_SERVICE_ACCOUNT_JSON" "$SA_JSON"; then
    echo "Note: Cloud Run は通常 ADC で十分です。HGK_FIREBASE_SERVICE_ACCOUNT_JSON は任意です。"
  fi
else
  echo "Skip HGK_FIREBASE_SERVICE_ACCOUNT_JSON (GOOGLE_APPLICATION_CREDENTIALS 未設定またはファイルなし)"
fi

gcp_secrets_grant_run_access

echo ""
echo "Registered secrets (values are not shown):"
gcloud secrets list --filter='name~(HGK_ANTHROPIC_API_KEY|HGK_GEMINI_API_KEY|HGK_FIREBASE_SERVICE_ACCOUNT_JSON)' \
  --format='table(name,createTime)' 2>/dev/null || gcloud secrets list --format='table(name)'

echo ""
echo "Done. Deploy with: npm run deploy:trial"
