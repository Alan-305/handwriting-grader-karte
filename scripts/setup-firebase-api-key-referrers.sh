#!/usr/bin/env bash
# Firebase Browser API キーの HTTP リファラーに本番・ローカル URL を追加する。
# auth/requests-from-referer-...-are-blocked. の原因になることが多い。
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-handwriting-grader-karte}"

HOSTING_WEB="https://${PROJECT_ID}.web.app/*"
HOSTING_FB="https://${PROJECT_ID}.firebaseapp.com/*"
LOCAL_DEV="http://localhost:5173/*"
LOCAL="http://localhost/*"

echo "==> Project: $PROJECT_ID"

KEY_NAME="$(gcloud services api-keys list --project="$PROJECT_ID" \
  --filter='displayName="Browser key (auto created by Firebase)"' \
  --format='value(name)' | head -1)"

if [[ -z "$KEY_NAME" ]]; then
  echo "Error: Firebase Browser API key not found."
  exit 1
fi

echo "==> Updating $KEY_NAME"

# 既存の allowedReferrers を読み取り、不足分だけ追加
EXISTING="$(gcloud services api-keys describe "$KEY_NAME" --project="$PROJECT_ID" \
  --format='value(restrictions.browserKeyRestrictions.allowedReferrers)' 2>/dev/null || true)"

merge_referrers() {
  local existing="$1"
  shift
  local -a merged=()
  local item want
  for want in "$@"; do
    merged+=("$want")
  done
  if [[ -n "$existing" ]]; then
    while IFS= read -r item; do
      [[ -z "$item" ]] && continue
      local found=0
      for want in "${merged[@]}"; do
        [[ "$item" == "$want" ]] && found=1 && break
      done
      [[ "$found" -eq 0 ]] && merged+=("$item")
    done <<< "$(echo "$existing" | tr ';' '\n')"
  fi
  (IFS=','; echo "${merged[*]}")
}

REFERRERS="$(merge_referrers "$EXISTING" "$HOSTING_WEB" "$HOSTING_FB" "$LOCAL_DEV" "$LOCAL")"

gcloud services api-keys update "$KEY_NAME" \
  --project="$PROJECT_ID" \
  --allowed-referrers="$REFERRERS"

echo "==> Allowed referrers:"
echo "$REFERRERS" | tr ',' '\n' | sed 's/^/  /'
echo "Done."
