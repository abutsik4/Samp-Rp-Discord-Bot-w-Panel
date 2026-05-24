#!/usr/bin/env python3
"""Deploy Phase C (patch existing files, upload new ones, migrate, restart)."""
import os, sys, sqlite3

BASE = "/opt/jepsencloud-bot"
os.chdir(BASE)

def read_file(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def write_file(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

# ─── 1. Upload new constant files ──────────────────────────────────────
for src, dst in [
    ("/Users/tjoma/phase_c_deploy/prestige-casino.js", "src/features/constants/prestige-casino.js"),
    ("/Users/tjoma/phase_c_deploy/blackmarket2.js",     "src/features/constants/blackmarket2.js"),
    ("/Users/tjoma/phase_c_deploy/gang-evolution.js",  "src/features/constants/gang-evolution.js"),
    ("/Users/tjoma/phase_c_deploy/crafting.js",        "src/features/constants/crafting.js"),
    ("/Users/tjoma/phase_c_deploy/samp-phasec.js",     "src/features/samp-phasec.js"),
]:
    write_file(dst, read_file(src))
    print(f"  Uploaded {dst}")

# ─── 2. Patch dispatcher.js ──────────────────────────────────────────
disp = read_file("src/bot/commands/dispatcher.js")

# Add import
disp = disp.replace(
    'const { handleSampPrestigeCommand, PRESTIGE_COMMAND_NAMES } = require("../../features/samp-prestige");',
    'const { handleSampPrestigeCommand, PRESTIGE_COMMAND_NAMES } = require("../../features/samp-prestige");\nconst { handlePhaseCCommand, PHASEC_COMMAND_NAMES, getPhaseCCommandBuilders } = require("../../features/samp-phasec");',
    1
)

# Add phaseC commands to SAMP_GAME_COMMANDS
disp = disp.replace(
    'const SAMP_GAME_COMMANDS = new Set([...SAMP_LIFE_COMMANDS, ...SAMP_EXTENDED_COMMANDS, ...SAMP_COSMETICS_COMMANDS, ...SAMP_ONBOARDING_COMMANDS, ...SAMP_PRESTIGE_COMMANDS]);',
    'const SAMP_PHASEC_COMMANDS = PHASEC_COMMAND_NAMES;\nconst SAMP_GAME_COMMANDS = new Set([...SAMP_LIFE_COMMANDS, ...SAMP_EXTENDED_COMMANDS, ...SAMP_COSMETICS_COMMANDS, ...SAMP_ONBOARDING_COMMANDS, ...SAMP_PRESTIGE_COMMANDS, ...SAMP_PHASEC_COMMANDS]);',
    1
)

# Add dispatch handler after prestige
disp = disp.replace(
    '    if (SAMP_PRESTIGE_COMMANDS.includes(commandName)) {\n      await handleSampPrestigeCommand({ interaction, db });\n      return;\n    }',
    '    if (SAMP_PRESTIGE_COMMANDS.includes(commandName)) {\n      await handleSampPrestigeCommand({ interaction, db });\n      return;\n    }\n    if (SAMP_PHASEC_COMMANDS.includes(commandName)) {\n      await handlePhaseCCommand({ interaction, db });\n      return;\n    }',
    1
)

# Add builder call in sync commands section if there's a builder registration pattern
# Find "getPrestigeCommandBuilders" and append our builders
if "getPhaseCCommandBuilders" not in disp and "getPrestigeCommandBuilders" in disp:
    disp = disp.replace(
        "...getPrestigeCommandBuilders()",
        "...getPrestigeCommandBuilders(),\n      ...getPhaseCCommandBuilders()",
        1
    )

write_file("src/bot/commands/dispatcher.js", disp)
print("  Patched dispatcher.js")

# ─── 3. Patch samp-life.js with material drops ────────────────────────
life = read_file("src/features/samp-life.js")

def add_drop_after_ledger(content, action_name, ledger_type):
    marker = f'await addLedger(db, "{ledger_type}"'
    idx = content.find(marker)
    if idx == -1:
        print(f"  WARN: marker '{marker}' not found")
        return content
    # find the next semicolon after marker
    semi = content.find(";", idx)
    if semi == -1:
        print(f"  WARN: no semicolon after {marker}")
        return content
    end = semi + 1
    drop_code = f'''\n    // Phase C material drops
    try {{\n      const {{ rollMaterialDrops }} = require("./constants/crafting");\n      const drops = rollMaterialDrops("{action_name}");\n      for (const {{ materialId, qty }} of drops) {{\n        await dbRun(db, `INSERT INTO samp_crafting_inventory(user_id, material_id, qty) VALUES(?, ?, ?) ON CONFLICT(user_id, material_id) DO UPDATE SET qty = qty + excluded.qty, updated_at = datetime('now')`, [userId, materialId, qty]);\n      }}\n    }} catch (_e) {{}}'''
    if content[end:end+20].strip().startswith("// Phase C"):
        print(f"  Drops already present for {action_name}")
        return content
    return content[:end] + drop_code + content[end:]

for action, ledger_type in [("work", "work"), ("truck", "truck"), ("rob", "rob")]:
    life = add_drop_after_ledger(life, action, ledger_type)

# Also try "robbery" if "rob" didn't match
if "robbery" in life:
    life = add_drop_after_ledger(life, "rob", "robbery")

write_file("src/features/samp-life.js", life)
print("  Patched samp-life.js")

# ─── 4. Patch samp-extended.js with material drops ────────────────────
ext = read_file("src/features/samp-extended.js")

for action, lt in [("heist", "heist"), ("heist", "heist_payout"), ("gcapture", "gcapture")]:
    ext = add_drop_after_ledger(ext, action, lt)

# Also check for "territory" ledger
tm = ext.find('await addLedger(db, "territory"')
if tm != -1:
    ext = add_drop_after_ledger(ext, "gcapture", "territory")

write_file("src/features/samp-extended.js", ext)
print("  Patched samp-extended.js")

# ─── 5. Patch samp-prestige.js to add airjob drops ────────────────────
pres = read_file("src/features/samp-prestige.js")
pres = add_drop_after_ledger(pres, "airjob", "airjob")

# Also patch prestige-prestige interactions to add builder
# Already handled via dispatcher

write_file("src/features/samp-prestige.js", pres)
print("  Patched samp-prestige.js")

# ─── 6. Patch game-faq.js ─────────────────────────────────────────────
faq = read_file("src/features/game-faq.js")

if "prestige_rtp" not in faq:
    new_entries = '''    {
      id: "prestige_rtp",
      question: /rtp|возврат|казино|шанс|казин/i,
      answer: `🎰 **VIP Казино RTP**\\n• Chemin de Fer: ~95%\\n• Баккара (Banker): ~99%\\n• High Roller Wheel: ~96%\\nВсе результаты случайны (crypto-secure random).`,
    },
    {
      id: "phasec_overview",
      question: /prestige|чипы|крафт|эволюция|blackmarket 2/i,
      answer: `👑 **Phase C**\\n• /prestige — чипы и VIP\\n• /prestigecasino — Chemin de Fer, Баккара, High Roller\\n• /craft + /craftshop — крафт из материалов\\n• /blackmarket prestige — уникальные расходники\\n• /evolvegang — эволюция банды`,
    },'''
    # Find the FAQ_ENTRIES array opening
    pos = faq.find("const FAQ_ENTRIES = [")
    if pos != -1:
        brace = faq.find("[", pos)
        if brace != -1:
            faq = faq[:brace+1] + "\\n" + new_entries + faq[brace+1:]
            print("  Added FAQ entries")
    write_file("src/features/game-faq.js", faq)

# ─── 7. DB Migration ──────────────────────────────────────────────────
print("\n  Running DB migration...")
subprocess.run([sys.executable, "/Users/tjoma/phase_c_deploy/phase_c_migration.py"], check=False)

# ─── 8. Syntax check ────────────────────────────────────────────────────
print("\n=== SYNTAX CHECK ===")
import subprocess
checked = [
    "src/features/samp-phasec.js",
    "src/features/constants/prestige-casino.js",
    "src/features/constants/blackmarket2.js",
    "src/features/constants/gang-evolution.js",
    "src/features/constants/crafting.js",
    "src/bot/commands/dispatcher.js",
    "src/features/samp-life.js",
    "src/features/samp-extended.js",
    "src/features/samp-prestige.js",
    "src/features/game-faq.js",
]
all_ok = True
for f in checked:
    r = subprocess.run(["node", "-c", f], capture_output=True, text=True)
    ok = r.returncode == 0
    all_ok = all_ok and ok
    status = "✅" if ok else "❌"
    print(f"  {status} {f}")
    if not ok:
        print(f"      {r.stderr[:250]}")

if not all_ok:
    print("\nSome syntax checks failed. Please fix before restart.")
    sys.exit(1)

# ─── 9. Git commit ────────────────────────────────────────────────────
subprocess.run(["git", "add", "-A"], check=False)
subprocess.run(["git", "commit", "-m", "Phase C: Prestige Casino + Gang Evolution + Crafting + BM2.0 + RTP FAQ + Market Gini"], check=False)

# ─── 10. Restart bot ──────────────────────────────────────────────────
print("\n=== Restarting bot ===")
r = subprocess.run(["pm2", "restart", "jepsencloud-bot"], capture_output=True, text=True)
print(r.stdout)
print("Phase C deploy complete.")
