#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME=${1:-jepsencloud-bot.service}
MODE=${2:-failure} # "failure" | "test"

BOT_DIR="/opt/jepsencloud-bot"
ENV_FILE="$BOT_DIR/.env"

get_env_value() {
  local key="$1"
  local file="$2"
  [[ -f "$file" ]] || return 1

  # Read KEY=VALUE from .env without executing it.
  # Supports optional single/double quotes. Ignores commented lines.
  local line
  line=$(grep -m1 -E "^${key}=" "$file" 2>/dev/null || true)
  [[ -n "$line" ]] || return 1

  local value="${line#*=}"
  # strip surrounding quotes if present
  value=$(printf '%s' "$value" | sed -E 's/^"(.*)"$/\1/; s/^\x27(.*)\x27$/\1/')
  printf '%s' "$value"
}

# Prefer environment injected by systemd (EnvironmentFile=...)
# If not present (manual run), fall back to reading .env safely.
if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  TELEGRAM_BOT_TOKEN=$(get_env_value "TELEGRAM_BOT_TOKEN" "$ENV_FILE" || true)
fi
if [[ -z "${TELEGRAM_CHAT_ID:-}" ]]; then
  TELEGRAM_CHAT_ID=$(get_env_value "TELEGRAM_CHAT_ID" "$ENV_FILE" || true)
fi

if [[ -z "${TELEGRAM_NOTIFY_THROTTLE_START_SEC:-}" ]]; then
  TELEGRAM_NOTIFY_THROTTLE_START_SEC=$(get_env_value "TELEGRAM_NOTIFY_THROTTLE_START_SEC" "$ENV_FILE" || true)
fi
if [[ -z "${TELEGRAM_NOTIFY_THROTTLE_FAILURE_SEC:-}" ]]; then
  TELEGRAM_NOTIFY_THROTTLE_FAILURE_SEC=$(get_env_value "TELEGRAM_NOTIFY_THROTTLE_FAILURE_SEC" "$ENV_FILE" || true)
fi

TELEGRAM_NOTIFY_THROTTLE_START_SEC=$(printf '%s' "${TELEGRAM_NOTIFY_THROTTLE_START_SEC:-}" | tr -d '\r' | sed -E 's/^\s+//; s/\s+$//')
TELEGRAM_NOTIFY_THROTTLE_FAILURE_SEC=$(printf '%s' "${TELEGRAM_NOTIFY_THROTTLE_FAILURE_SEC:-}" | tr -d '\r' | sed -E 's/^\s+//; s/\s+$//')

# Normalize hidden CRLF / whitespace that can break curl URLs.
TELEGRAM_BOT_TOKEN=$(printf '%s' "${TELEGRAM_BOT_TOKEN:-}" | tr -d '\r' | sed -E 's/^\s+//; s/\s+$//')
TELEGRAM_CHAT_ID=$(printf '%s' "${TELEGRAM_CHAT_ID:-}" | tr -d '\r' | sed -E 's/^\s+//; s/\s+$//')

: "${TELEGRAM_BOT_TOKEN:?Missing TELEGRAM_BOT_TOKEN in /opt/jepsencloud-bot/.env}"
: "${TELEGRAM_CHAT_ID:?Missing TELEGRAM_CHAT_ID in /opt/jepsencloud-bot/.env}"

state_file="$BOT_DIR/data/telegram-notify-state.json"

now_epoch() {
  date +%s
}

read_last_sent_epoch() {
  local mode="$1"
  [[ -f "$state_file" ]] || return 1
  node - "$state_file" "$mode" <<'NODE' 2>/dev/null || return 1
const fs = require('fs');
// When running via `node -`, argv[1] is '-' and args start at argv[2].
const p = process.argv[2];
const mode = process.argv[3];
try {
  const raw = fs.readFileSync(p, 'utf8');
  const j = JSON.parse(raw);
  const v = j?.lastSentEpoch?.[mode];
  if (typeof v === 'number' && Number.isFinite(v)) {
    process.stdout.write(String(v));
    process.exit(0);
  }
} catch (_) {}
process.exit(1);
NODE
}

write_last_sent_epoch() {
  local mode="$1"
  local epoch="$2"
  mkdir -p "$BOT_DIR/data"
  node - "$state_file" "$mode" "$epoch" <<'NODE'
const fs = require('fs');
// When running via `node -`, argv[1] is '-' and args start at argv[2].
const p = process.argv[2];
const mode = process.argv[3];
const epoch = Number(process.argv[4]);
let j = {};
try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { j = {}; }
j.lastSentEpoch = j.lastSentEpoch || {};
j.lastSentEpoch[mode] = epoch;
const tmp = p + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(j), 'utf8');
fs.renameSync(tmp, p);
NODE
}

throttle_for_mode() {
  case "$MODE" in
    start)
      echo "${TELEGRAM_NOTIFY_THROTTLE_START_SEC:-300}" ;;
    failure)
      echo "${TELEGRAM_NOTIFY_THROTTLE_FAILURE_SEC:-60}" ;;
    test)
      echo "0" ;;
    *)
      echo "0" ;;
  esac
}

THROTTLE_SEC=$(throttle_for_mode)
if [[ "$THROTTLE_SEC" =~ ^[0-9]+$ ]] && [[ "$THROTTLE_SEC" -gt 0 ]]; then
  last=$(read_last_sent_epoch "$MODE" || true)
  if [[ "$last" =~ ^[0-9]+$ ]]; then
    delta=$(( $(now_epoch) - last ))
    if [[ "$delta" -ge 0 ]] && [[ "$delta" -lt "$THROTTLE_SEC" ]]; then
      echo "Throttled ($MODE): last sent ${delta}s ago (min ${THROTTLE_SEC}s)."
      exit 0
    fi
  fi
fi

HOST=$(hostname)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

systemd_prop() {
  local prop="$1"
  systemctl show "$SERVICE_NAME" -p "$prop" --value 2>/dev/null || true
}

ACTIVE_STATE=$(systemd_prop "ActiveState")
SUB_STATE=$(systemd_prop "SubState")
RESULT=$(systemd_prop "Result")
PID=$(systemd_prop "ExecMainPID")
EXIT_STATUS=$(systemd_prop "ExecMainStatus")
EXIT_CODE=$(systemd_prop "ExecMainCode")
NRESTARTS=$(systemd_prop "NRestarts")

short_state="$ACTIVE_STATE"
if [[ -n "$SUB_STATE" ]]; then
  short_state="$short_state/$SUB_STATE"
fi

headline="[$HOST] $SERVICE_NAME"
case "$MODE" in
  start)
    headline="$headline STARTED"
    ;;
  failure)
    headline="$headline FAILED"
    ;;
  test)
    headline="$headline TEST"
    ;;
  *)
    headline="$headline $MODE"
    ;;
esac

LOG_LINES=0
case "$MODE" in
  start) LOG_LINES=4 ;;
  failure) LOG_LINES=14 ;;
  test) LOG_LINES=6 ;;
  *) LOG_LINES=8 ;;
esac

LOG_TAIL=""
if [[ "$LOG_LINES" -gt 0 ]]; then
  # Keep logs compact and readable; last N lines only.
  LOG_TAIL=$(journalctl -u "$SERVICE_NAME" -n "$LOG_LINES" --no-pager 2>/dev/null | tail -n "$LOG_LINES" || true)
fi

TEXT=$(cat <<EOF
$headline
Time: $NOW
State: $short_state
PID: ${PID:-N/A}
Restarts: ${NRESTARTS:-0}
Result: ${RESULT:-unknown} (code=${EXIT_CODE:-?} status=${EXIT_STATUS:-?})
EOF
)

if [[ -n "$LOG_TAIL" ]]; then
  TEXT="$TEXT

Logs (last $LOG_LINES):
$LOG_TAIL"
fi

# Telegram has a 4096-character message limit.
# Keep some headroom for encoding overhead.
MAX_LEN=3800
if [[ ${#TEXT} -gt $MAX_LEN ]]; then
  TEXT="${TEXT:0:$MAX_LEN}\n\n(truncated)"
fi

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"

curl -fsS -X POST "$API" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${TEXT}" \
  -d "disable_web_page_preview=true" \
  >/dev/null

write_last_sent_epoch "$MODE" "$(now_epoch)" || true

echo "Telegram notification sent."
