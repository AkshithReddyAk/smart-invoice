#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=================================================="
echo "⚡ Starting SmartInvoice Studio (Public Online Host)"
echo "=================================================="

# Check if background server is running on 8010
if ! curl -s http://127.0.0.1:8010/api/health > /dev/null 2>&1; then
  echo "📦 Starting FastAPI backend server..."
  cd backend
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010 &
  SERVER_PID=$!
  cd ..
  sleep 2
fi

echo "🌐 Starting Cloudflare Public Tunnel..."
"$HOME/.local/bin/cloudflared" tunnel --url http://127.0.0.1:8010
