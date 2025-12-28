#!/usr/bin/env bash
set -euo pipefail

# Safe cleanup script: archives non-essential files for review instead of deleting.
# Creates backups/cleanup_TIMESTAMP/* folders and moves items there.

ROOT="/opt/jepsencloud-bot"
TS=$(date +%Y%m%d_%H%M%S)
ARCHIVE="$ROOT/backups/cleanup_$TS"

mkdir -p "$ARCHIVE"/{docs,status,data,backups,scripts,logs,other}

log() { printf "[cleanup] %s\n" "$*"; }
safe_move() {
  local src="$1" dest="$2"
  if [ -e "$src" ]; then
    mkdir -p "$dest"
    mv -f "$src" "$dest/" || true
    log "moved: $src -> $dest/"
  fi
}

log "Archiving to: $ARCHIVE"

# 1) Documentation (keep START_HERE.md)
DOCS=(
  "DEPLOYMENT.md"
  "PRODUCTION.md"
  "DEPLOYMENT_GUIDE.md"
  "DEPLOYMENT_CHECKLIST.md"
  "PRODUCTION_CHECKLIST.md"
  "PRODUCTION_DEPLOYMENT.md"
  "DEPLOYMENT_INDEX.md"
  "TEST_RESULTS.md"
  "IMPLEMENTATION_SUMMARY.md"
  "VERIFICATION_DASHBOARD_GUIDE.md"
  "WEB_INTEGRATION_SUMMARY.md"
  "QUICK_REFERENCE.md"
)
for f in "${DOCS[@]}"; do safe_move "$ROOT/$f" "$ARCHIVE/docs"; done

# 2) Status text artifacts
STATUS_FILES=(
  "LIVE.txt"
  "PRODUCTION_READY.txt"
  "VERIFICATION_SYSTEM_STATUS.txt"
)
for f in "${STATUS_FILES[@]}"; do safe_move "$ROOT/$f" "$ARCHIVE/status"; done

# 3) Test databases and temp files
safe_move "$ROOT/data/test-robust-counting.db" "$ARCHIVE/data"
safe_move "$ROOT/data/test-stress.db" "$ARCHIVE/data"
safe_move "$ROOT/data/test-stress.db-shm" "$ARCHIVE/data"
safe_move "$ROOT/data/test-stress.db-wal" "$ARCHIVE/data"
for f in "$ROOT"/data/stats.db.backup_*; do [ -e "$f" ] && safe_move "$f" "$ARCHIVE/data"; done

# 4) Old backups (dated folders under backups)
for d in "$ROOT"/backups/*; do
  base=$(basename "$d")
  # Skip our new cleanup folder and non-directories
  if [ "$d" = "$ARCHIVE" ] || [ ! -d "$d" ]; then continue; fi
  # Move dated backup folders (YYYYMMDD_*) only
  if [[ "$base" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
    safe_move "$d" "$ARCHIVE/backups"
  fi
done

# 5) Test-only scripts
safe_move "$ROOT/scripts/stress-test-counting.js" "$ARCHIVE/scripts"
safe_move "$ROOT/scripts/test-robust-counting.js" "$ARCHIVE/scripts"
safe_move "$ROOT/scripts/create-test-user.js" "$ARCHIVE/scripts"
safe_move "$ROOT/scripts/test-panel-e2e.sh" "$ARCHIVE/scripts"

# 6) Logs
for f in "$ROOT"/logs/*.log; do [ -e "$f" ] && safe_move "$f" "$ARCHIVE/logs"; done

# 7) Other artifacts
safe_move "$ROOT/VERIFICATION_DASHBOARD_INTEGRATED.js" "$ARCHIVE/other"

log "Cleanup complete. Review archived files under $ARCHIVE"
log "Rollback example: mv -f $ARCHIVE/docs/*.md $ROOT/"