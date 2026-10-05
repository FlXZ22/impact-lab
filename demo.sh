#!/usr/bin/env bash
# Starts both halves of the demo and waits until each answers.
#
#   ./demo.sh            keyless  — works, uses the keyword stand-in classifier
#   ANTHROPIC_API_KEY=sk-... ./demo.sh   recommended for a live/unscripted demo
#
# Ctrl-C stops both.
set -euo pipefail

# The dispatch service repo. Clones of segnalazioni-impact-lab-be land under either name,
# so try both before giving up.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${ROUTING_REPO:-}" ]; then
  for candidate in "$HERE/../segnalazioni_ai" "$HERE/../segnalazioni-impact-lab-be" "$HERE/../segnalazioni-ai"; do
    [ -f "$candidate/pom.xml" ] && ROUTING_REPO="$(cd "$candidate" && pwd)" && break
  done
fi
# Validate however it was resolved: an explicit ROUTING_REPO that points nowhere would
# otherwise fail deep inside Maven, with the error buried in a log file.
if [ -z "${ROUTING_REPO:-}" ] || [ ! -f "${ROUTING_REPO}/pom.xml" ]; then
  echo "Cannot find the dispatch service repo${ROUTING_REPO:+ at $ROUTING_REPO}." >&2
  echo "Clone it beside this one:" >&2
  echo "  git clone https://github.com/fabianhogger/segnalazioni-impact-lab-be.git ../segnalazioni_ai" >&2
  echo "or set ROUTING_REPO=/path/to/repo (the directory containing pom.xml)." >&2
  exit 1
fi
CHAT_REPO="$HERE"
ROUTING_PORT="${ROUTING_PORT:-8081}"   # 8080 is often already taken on this machine
CHAT_PORT="${CHAT_PORT:-3000}"
LOGS="${CHAT_REPO}/.demo-logs"

mkdir -p "$LOGS"

# Stop only the two services this script started. An earlier version used `kill 0`,
# which signals the whole process group — the script included — so the TERM it sent
# re-entered this very handler and recursed until bash overflowed its stack and
# dumped core on Ctrl-C.
PIDS=()
stop_one() {
  local pid="$1" pgid
  kill -0 "$pid" 2>/dev/null || return 0
  # Each child is its own group leader (setsid below), so signal the group: Maven
  # forks the JVM, and killing Maven alone would leave the port held.
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  if [ -n "$pgid" ] && [ "$pgid" != "$SELF_PGID" ]; then
    kill -TERM "-$pgid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi
}
cleanup() {
  trap - EXIT INT TERM          # disarm before signalling, or we re-enter ourselves
  echo; echo "stopping…"
  local pid
  for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && stop_one "$pid"; done
  wait 2>/dev/null || true
}
SELF_PGID="$(ps -o pgid= -p $$ | tr -d ' ')"
trap cleanup EXIT INT TERM

echo "routing service → http://127.0.0.1:${ROUTING_PORT}   (logs: $LOGS/routing.log)"
setsid bash -c 'cd "$1" && exec mvn -B -q spring-boot:run -Dspring-boot.run.arguments=--server.port="$2"' \
    _ "$ROUTING_REPO" "$ROUTING_PORT" > "$LOGS/routing.log" 2>&1 &
PIDS+=($!)

for _ in $(seq 1 90); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${ROUTING_PORT}/api/v1/agencies" 2>/dev/null)" = "200" ] && break
  sleep 1
done || true

echo "chat            → http://127.0.0.1:${CHAT_PORT}        (logs: $LOGS/chat.log)"
setsid bash -c 'cd "$1" && ROUTING_URL="$2" PORT="$3" exec npm start' \
    _ "$CHAT_REPO" "http://127.0.0.1:${ROUTING_PORT}" "${CHAT_PORT}" > "$LOGS/chat.log" 2>&1 &
PIDS+=($!)

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
