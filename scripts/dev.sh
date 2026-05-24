#!/usr/bin/env bash
# バックエンド + フロントエンドを同時起動（npm 未インストール時の代替）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PY="$ROOT/backend/.venv/bin/python3"

if [[ ! -x "$BACKEND_PY" ]]; then
  echo "backend/.venv がありません。先に以下を実行してください:"
  echo "  cd backend && python3 -m venv .venv && source .venv/bin/activate && pip3 install -r requirements.txt"
  exit 1
fi

cleanup() {
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ Backend  http://127.0.0.1:5001/api/health"
echo "→ Frontend http://localhost:5173/login  ← ブラウザはこちら"
echo ""

"$BACKEND_PY" "$ROOT/backend/run.py" &
BACKEND_PID=$!

cd "$ROOT/frontend"
exec npm run dev
