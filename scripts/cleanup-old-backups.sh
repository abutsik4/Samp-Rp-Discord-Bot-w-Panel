#!/bin/bash
# Cleanup old jepsencloud-bot backup directories
# Removes dated backup dirs older than 30 days (matches DEFAULT_RETENTION_DAYS)
# Keeps: money/, samp-state/, sqlite/, money-restores/, pre-repair/, post-repair/
#         (these are managed by the built-in scheduler pruning)

BACKUP_DIR="/opt/jepsencloud-bot/backups"
RETENTION_DAYS=30
CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d)

echo "Cleaning up backups older than ${CUTOFF_DATE}..."

# Find and remove dated directories (YYYYMMDD_HHMMSS pattern) older than retention period
# These are manual snapshot dirs from DB repair sessions
find "$BACKUP_DIR" -maxdepth 1 -type d -name '[0-9]*_[0-9]*' | while read -r dir; do
    dirname=$(basename "$dir")
    datedir="${dirname:0:8}"  # Extract YYYYMMDD
    
    if [[ "$datedir" < "$CUTOFF_DATE" ]]; then
        echo "Removing old backup: $dir ($(du -sh "$dir" 2>/dev/null | cut -f1))"
        rm -rf "$dir"
    else
        echo "Keeping recent backup: $dir"
    fi
done

# Also remove orphan .bak files in src/ created during maintenance (older than 7 days)
find /opt/jepsencloud-bot/src -name '*.bak.p*' -type f -mtime +7 -delete 2>/dev/null

echo "Backup cleanup complete"