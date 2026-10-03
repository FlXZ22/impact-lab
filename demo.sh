#!/usr/bin/env bash
# Starts both halves of the demo and waits until each answers.
#
#   ./demo.sh            keyless  — works, uses the keyword stand-in classifier
#   ANTHROPIC_API_KEY=sk-... ./demo.sh   recommended for a live/unscripted demo
#
# Ctrl-C stops both.
set -euo pipefail

ROUTING_REPO="${ROUTING_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../segnalazioni_ai" && pwd)}"
CHAT_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROUTING_PORT="${ROUTING_PORT:-8081}"   # 8080 is often already taken on this machine
CHAT_PORT="${CHAT_PORT:-3000}"
LOGS="${CHAT_REPO}/.demo-logs"

mkdir -p "$LOGS"
cleanup() { echo; echo "stopping…"; kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "routing service → http://127.0.0.1:${ROUTING_PORT}   (logs: $LOGS/routing.log)"
( cd "$ROUTING_REPO" && mvn -B -q spring-boot:run \
    -Dspring-boot.run.arguments=--server.port="${ROUTING_PORT}" ) > "$LOGS/routing.log" 2>&1 &

for _ in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${ROUTING_PORT}/api/v1/agencies" 2>/dev/null)" = "200" ] && break
  sleep 1
done || true

echo "chat            → http://127.0.0.1:${CHAT_PORT}        (logs: $LOGS/chat.log)"
( cd "$CHAT_REPO" && ROUTING_URL="http://127.0.0.1:${ROUTING_PORT}" PORT="${CHAT_PORT}" npm start ) > "$LOGS/chat.log" 2>&1 &

for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${CHAT_PORT}/api/config" 2>/dev/null)" = "200" ] && break
  sleep 1
done || true

echo
echo "  Open http://127.0.0.1:${CHAT_PORT}  — use 127.0.0.1, not the LAN IP:"
echo "  geolocation and the microphone need a secure context."
echo "  Script: DEMO.md.  Ctrl-C stops both."
echo
wait
