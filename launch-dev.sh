#!/bin/bash
# Dev launcher for the NEW React frontend.
#
# Runs the Flask API (:5001) and the Vite dev server (:5173) together with hot
# reload, then opens the React app. The Vite dev server proxies /api to Flask,
# so it's one origin in the browser.
#
# The primary ./launch.sh still runs the existing Jinja app on :5001 — this
# script is for working on the migration. Production wiring (Flask serving the
# built SPA from one port) lands in a later phase.
set -e
cd "$(dirname "$0")"

# 1. Backend venv
if [ ! -x ".venv/bin/python" ]; then
  echo "→ Creating backend venv…"
  python3 -m venv .venv
  ./.venv/bin/pip install -q -r requirements.txt
fi

# 2. Frontend deps
if [ ! -d "frontend/node_modules" ]; then
  echo "→ Installing frontend deps…"
  (cd frontend && npm install)
fi

# 3. Run both, tear both down together
echo "→ Starting Flask API on :5001 and Vite dev server on :5173…"
PORT=5001 ./.venv/bin/python app.py &
FLASK_PID=$!
(cd frontend && npm run dev) &
VITE_PID=$!

cleanup() { kill "$FLASK_PID" "$VITE_PID" 2>/dev/null; }
trap cleanup EXIT INT TERM

# Open the React app once Vite is up
( sleep 2; python3 -c "import webbrowser; webbrowser.open('http://localhost:5173')" >/dev/null 2>&1 ) &

echo "→ React app:  http://localhost:5173   (Ctrl+C to stop both)"
wait
