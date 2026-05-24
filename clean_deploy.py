import os, subprocess, sys

os.chdir("/opt/jepsencloud-bot")

def read(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def write(path, content):
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

# ─── Clean up broken patches ────────────────────────────────
for fpath in ["src/features/samp-life.js", "src/features/samp-extended.js", "src/features/samp-prestige.js"]:
    c = read(fpath)
    lines = c.split("\n")
    cleaned = []
    for line in lines:
        stripped = line.strip()
        if "awardMaterialDrops" in stripped:
            continue
        cleaned.append(line)
    cleaned_str = "\n".join(cleaned)
    cleaned_str = cleaned_str.replace('const { awardMaterialDrops } = require("./phasec-utils");\n', "")
    cleaned_str = cleaned_str.replace('const { awardMaterialDrops } = require("./phasec-utils");', "")
    write(fpath, cleaned_str)
    print(f"  Cleaned {fpath}")

# ─── Copy phasec-utils.js ──────────────────────────
if not os.path.exists("src/features/phasec-utils.js"):
    write("src/features/phasec-utils.js", read("phase_c_deploy/phasec-utils.js"))
    print("  Copied phasec-utils.js")

# ─── Add material drop calls ────

def add_drops(content, action_name, insert_after_text):
    idx = content.find(insert_after_text)
    if idx == -1:
        print(f"  WARN: marker missing for {action_name}")
        return content
    brace = content.find("});", idx)
    if brace == -1:
        print(f"  WARN: no '}});' after {action_name} marker")
        return content
    insert_at = brace + 3
    call = f'\n    // Phase C drops\n    try {{ require("./phasec-utils").awardMaterialDrops(db, userId, "{action_name}"); }} catch (e) {{}}'
    if "Phase C drops" in content[insert_at-5:insert_at+50]:
        print(f"  Already present: {action_name}")
        return content
    return content[:insert_at] + call + content[insert_at:]

life = read("src/features/samp-life.js")
life = add_drops(life, "work", 'addLedgerUnique(db, "work", null, userId, earnings, opKey')
life = add_drops(life, "truck", 'addLedgerUnique(db, "truck", null, userId, earnings, opKey')
life = add_drops(life, "rob", 'addLedgerUnique(db, "rob", null, userId, loot, makeInteractionOpKey(interaction, "rob")')
write("src/features/samp-life.js", life)

ext = read("src/features/samp-extended.js")
ext = add_drops(ext, "heist", 'addLedgerUnique(db, "heist_payout"')
if ext == read("src/features/samp-extended.js"):
    ext = add_drops(ext, "heist", 'addLedgerUnique(db, "heist_success"')
write("src/features/samp-extended.js", ext)

pres = read("src/features/samp-prestige.js")
pres = add_drops(pres, "airjob", 'addLedger(db, "airjob"')
write("src/features/samp-prestige.js", pres)

print("\nAdded material drop hooks")

# ─── Syntax check ───────────────────────────────────────────
print("\n=== SYNTAX CHECK ===")
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
    print(f"  {'OK' if ok else 'FAIL'} {f}")
    if not ok:
        print(f"     {r.stderr[:300]}")

if not all_ok:
    print("\nSyntax check failed.")
    sys.exit(1)

# ─── Git commit ────────────────────────────────────────────
subprocess.run(["git", "add", "-A"], check=False)
subprocess.run(["git", "commit", "-m", "Phase C: Prestige Casino + Gang Evolution + Crafting + BM2.0 + RTP FAQ + Market Gini"], check=False)
print("\nGit committed.")

# ─── Restart ─────────────────────────────────────────
print("Restarting...")
r = subprocess.run(["pm2", "restart", "jepsencloud-bot"], capture_output=True, text=True)
print(r.stdout)
print("Done.")
