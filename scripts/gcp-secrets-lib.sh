#!/usr/bin/env bash
# shellcheck shell=bash
# Secret Manager 共通処理（setup-gcp-secrets.sh / deploy-trial.sh から source）

gcp_secrets_project() {
  echo "${GCP_PROJECT_ID:-handwriting-grader-karte}"
}

gcp_secrets_run_service_account() {
  local project_id
  project_id="$(gcp_secrets_project)"
  local project_number
  project_number="$(gcloud projects describe "$project_id" --format='value(projectNumber)')"
  echo "${CLOUD_RUN_SERVICE_ACCOUNT:-${project_number}-compute@developer.gserviceaccount.com}"
}

gcp_secrets_enable_apis() {
  gcloud services enable secretmanager.googleapis.com run.googleapis.com --quiet
}

gcp_secrets_create_or_update() {
  local name=$1
  local value=$2
  if [[ -z "$value" ]]; then
    echo "Skip $name (empty)"
    return 1
  fi
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    echo -n "$value" | gcloud secrets create "$name" \
      --replication-policy="automatic" \
      --data-file=-
  else
    echo -n "$value" | gcloud secrets versions add "$name" --data-file=-
  fi
  echo "OK: $name (new version)"
  return 0
}

gcp_secrets_grant_run_access() {
  local project_id
  project_id="$(gcp_secrets_project)"
  local run_sa
  run_sa="$(gcp_secrets_run_service_account)"

  for role in roles/secretmanager.secretAccessor roles/datastore.user roles/storage.objectAdmin; do
    gcloud projects add-iam-policy-binding "$project_id" \
      --member="serviceAccount:${run_sa}" \
      --role="$role" \
      --quiet >/dev/null
  done
  echo "IAM: $run_sa → secretAccessor, datastore.user, storage.objectAdmin"
}

gcp_secrets_require_exists() {
  local name=$1
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    echo "Error: Secret '$name' not found. Run: npm run setup:gcp-secrets"
    return 1
  fi
  if ! gcloud secrets versions list "$name" --filter="state=enabled" --limit=1 --format='value(name)' 2>/dev/null | grep -q .; then
    echo "Error: Secret '$name' has no enabled version. Run: npm run setup:gcp-secrets"
    return 1
  fi
  return 0
}
