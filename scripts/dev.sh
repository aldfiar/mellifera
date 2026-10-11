#!/usr/bin/env bash
#
# dev.sh — one-command dev mode: Go API server (:8080) + Vite dev server (:5173).
#
# Vite proxies /api, /openapi.*, /docs to the Go server (see web/vite.config.ts),
# so the SPA hot-reloads against the real backend. MELLIFERA_WEB_DEV=true loosens
# the Go server's cache headers for the same reason. Ctrl+C stops both (the Go
# server shuts down gracefully: HTTP -> enrich pool -> plugins -> store).
#
# Usage:
#   scripts/dev.sh                                   # token defaults to dev-token
#   MELLIFERA_ADMIN_TOKEN=secret scripts/dev.sh      # custom admin token
#   make dev                                         # the same, via the Makefile
#
# Logs land in .tmp/dev/ (gitignored).

set -euo pipefail

cd "$(dirname "$0")/.."

TOKEN="${MELLIFERA_ADMIN_TOKEN:-dev-token}"
GO_ADDR="${MELLIFERA_LISTEN:-127.0.0.1:8080}"
GO_PORT="${GO_ADDR##*:}"
VITE_URL="http://localhost:5173"
LOG_DIR=".tmp/dev"
BIN="$LOG_DIR/mellifera"

log() { printf '\033[1;36m[dev]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }
mkdir -p "$LOG_DIR"

GO_PID=""
VITE_PID=""
cleanup() {
  trap - EXIT INT TERM
  if [ -n "$VITE_PID" ]; then kill "$VITE_PID" 2>/dev/null || true; fi
  if [ -n "$GO_PID" ]; then kill "$GO_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 1. Plugin binaries — a missing one IS a startup failure (unlike ffprobe/exiftool).
log "building plugin binaries (make build-plugin)..."
make build-plugin >/dev/null

# 2. External runtime tools — soft-fail at runtime; warn here so it is not a surprise.
for tool in ffprobe exiftool; do
  if ! command -v "$tool" >/dev/null; then
    log "WARNING: $tool not on PATH — $tool-backed enrichment soft-fails per source (scans still succeed)"
  fi
done

# 3. Web dependencies.
if [ ! -d web/node_modules ]; then
  log "installing web dependencies (npm ci)..."
  (cd web && npm ci --no-fund --no-audit)
fi

# 4. Go server. Built to a file (not `go run`) so the kill below reaches the real
#    server process and its graceful shutdown runs.
log "compiling the server..."
CGO_ENABLED=0 go build -o "$BIN" ./cmd/mellifera

log "starting the Go server on $GO_ADDR (log: $LOG_DIR/go.log)..."
MELLIFERA_ADMIN_TOKEN="$TOKEN" MELLIFERA_WEB_DEV=true "$BIN" >"$LOG_DIR/go.log" 2>&1 &
GO_PID=$!

for i in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:$GO_PORT/openapi.json"; then break; fi
  if ! kill -0 "$GO_PID" 2>/dev/null; then
    tail -n 20 "$LOG_DIR/go.log" >&2
    die "Go server exited early (full log: $LOG_DIR/go.log)"
  fi
  if [ "$i" -eq 60 ]; then
    tail -n 20 "$LOG_DIR/go.log" >&2
    die "Go server not ready after 30s (full log: $LOG_DIR/go.log)"
  fi
  sleep 0.5
done
log "Go server ready (admin token: $TOKEN)"

# 5. Vite dev server. --strictPort: fail instead of drifting to 5174 when busy.
log "starting Vite on :5173 (log: $LOG_DIR/vite.log)..."
(cd web && exec npm run dev -- --strictPort) >"$LOG_DIR/vite.log" 2>&1 &
VITE_PID=$!

for i in $(seq 1 30); do
  if curl -sf -o /dev/null "$VITE_URL"; then break; fi
  if ! kill -0 "$VITE_PID" 2>/dev/null; then
    tail -n 20 "$LOG_DIR/vite.log" >&2
    die "Vite exited early (full log: $LOG_DIR/vite.log)"
  fi
  if [ "$i" -eq 30 ]; then
    tail -n 20 "$LOG_DIR/vite.log" >&2
    die "Vite not ready after 15s (full log: $LOG_DIR/vite.log)"
  fi
  sleep 0.5
done

log "ready — open $VITE_URL"
echo "    API:     http://$GO_ADDR/api/v1  (Swagger UI: http://$GO_ADDR/docs/)"
echo "    token:   $TOKEN"
echo "    logs:    $LOG_DIR/go.log, $LOG_DIR/vite.log"
log "Ctrl+C stops both."

wait
