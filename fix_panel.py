#!/usr/bin/env python3
"""Fix panel port binding: panel-only.js should fallback to PORT env var."""
import pathlib, re, sys

PANEL_ONLY = pathlib.Path("/opt/jepsencloud-bot/src/panel-only.js")
ECOSYSTEM = pathlib.Path("/opt/jepsencloud-bot/ecosystem.config.js")

# Patch 1: panel-only.js line 18
orig = PANEL_ONLY.read_text()
old_line = 'const PORT = Number(process.env.PANEL_PORT || 3001);'
new_line = 'const PORT = Number(process.env.PANEL_PORT || process.env.PORT || 3001);'
if old_line not in orig:
    print("ERROR: could not find expected line in panel-only.js")
    sys.exit(1)
orig = orig.replace(old_line, new_line, 1)
PANEL_ONLY.write_text(orig)
print("[OK] patched panel-only.js")

# Patch 2: ecosystem.config.js — add PANEL_PORT: 5013 for the panel app only
eco = ECOSYSTEM.read_text()
# Find the jepsencloud-panel env block and add PANEL_PORT
if 'PANEL_PORT' not in eco:
    # We want to insert PANEL_PORT: 5013 right after PORT: 5012 in the jepsencloud-panel env
    # Since both apps share the same env structure in the file, we need to be careful.
    # The file shows PORT: 5012, then PANEL_DISABLE_DISCORD: "1".
    # We'll add PANEL_PORT after PORT in the whole file (it appears once in the panel section).
    eco = eco.replace(
        'PORT: 5012,',
        'PORT: 5012,\n        PANEL_PORT: 5013,'
    )
    ECOSYSTEM.write_text(eco)
    print("[OK] patched ecosystem.config.js with PANEL_PORT: 5013")
else:
    print("[SKIP] PANEL_PORT already present in ecosystem.config.js")

print("Done.")
