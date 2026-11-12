#!/usr/bin/env bash
set -e
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="$HOME/.local/tools/node/bin:$PATH"
API_PORT="${API_PORT:-8010}"
export VITE_API_PORT="$API_PORT"

echo "Starting SmartInvoice Backend on http://127.0.0.1:$API_PORT ..."
(cd "$ROOT_DIR/backend" && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT") &
BACK_PID=$!

echo "Starting SmartInvoice Frontend on http://localhost:5175 ..."
(cd "$ROOT_DIR/frontend" && npm run dev) &
FRONT_PID=$!

trap 'kill $BACK_PID $FRONT_PID 2>/dev/null || true' EXIT INT TERM
wait
