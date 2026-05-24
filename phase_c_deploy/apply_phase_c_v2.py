#!/usr/bin/env python3
"""Clean deploy: add awardMaterialDrops calls to 3 files."""
import os

BASE = "/opt/jepsencloud-bot"
os.chdir(BASE)

def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

# Upload phasec-utils.js
write_file("src/features/phasec-utils.js", open("phase_c_deploy/phasec-utils.js").read())
print("Uploaded phasec-utils.js")

def add_import_and_drops(content, action_markers):
    """action_markers: list of (search_text, action_name)"""
    # Add import at top after 'use strict'
    import_line = 'const { awardMaterialDrops } = require("./phasec-utils");\n'
    if import_line not in content:
        pos = content.find('"use strict";')
        if pos != -1:
            end = content.find("\n", pos) + 1
            content = content[:end] + import_line + content[end:]
    
    for search_text, action_name in action_markers:
        idx = content.find(search_text)
        if idx == -1:
            print(f"  WARN: '{search_text}' not found")
            continue
        # Find the closing brace/line after the transaction block
        # Strategy: after the search text, look for '});' (end of withTransaction) or next blank line
        pos = idx + len(search_text)
        # Find '});' within next 200 chars
        brace = content.find('});', pos)
        if brace == -1:
            print(f"  WARN: no '}});' after '{search_text}'")
            continue
        insert_at = brace + 3
        call = f'\n    await awardMaterialDrops(db, userId, "{action_name}");'
        if call in content[insert_at-10:insert_at+50]:
            print(f"  Already present: {action_name}")
            continue
        content = content[:insert_at] + call + content[insert_at:]
        print(f"  Added drop call: {action_name}")
    return content

# ─── samp-life.js ───
life = read("src/features/samp-life.js")
life = add_import_and_drops(life, [
    ('"work", null, userId, earnings, opKey', "work"),
    ('"truck", null, userId, earnings, opKey', "truck"),
    # Rob has two cases: pvp caught and success. Find the PvP success ledger block
    ('"rob_pvp", null, userId, net, opKey', "rob"),
])
write("src/features/samp-life.js", life)
print("Patched samp-life.js")

# ─── samp-extended.js ───
ext = read("src/features/samp-extended.js")
ext = add_import_and_drops(ext, [
    ('"heist_success"', "heist"),
    # gcapture may not have a ledger; skip if not found
])
write("src/features/samp-extended.js", ext)
print("Patched samp-extended.js")

# ─── samp-prestige.js ───
pres = read("src/features/samp-prestige.js")
pres = add_import_and_drops(pres, [
    ('"airjob"', "airjob"),
])
write("src/features/samp-prestige.js", pres)
print("Patched samp-prestige.js")

# ─── Syntax check ───
print("\n=== SYNTAX CHECK ===")
import subprocess
files = [
    "src/features/samp-phasec.js",
    "src/features/phasec-utils.js",
    "src/bot/commands/dispatcher.js",
    "src/features/samp-life.js",
    "src/features/samp-extended.js",
    "src/features/samp-prestige.js",
    "src/features/game-faq.js",
]
all_ok = True
for f in files:
    r = subprocess.run(["node", "-c", f], capture_output=True, text=True)
    ok = r.returncode == 0
    all_ok = all_ok and ok
    print(f"  {'✅' if ok else '❌'} {f}")
    if not ok:
        print(f"     {r.stderr[:300]}")

if not all_ok:
    print("\nFix errors before restart.")
    exit(1)

# Git commit
subprocess.run(["git", "add", "-A"], check=False)
subprocess.run(["git", "commit", "-m", "Phase C: Clean deploy with material drops"], check=False)

# Restart
print("\nRestarting bot...")
result = subprocess.run(["pm2", "restart", "jepsencloud-bot"], capture_output=True, text=True)
print(result.stdout)
print("Phase C deployed.")
