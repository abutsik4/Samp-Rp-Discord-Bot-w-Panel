
import re
path = "/opt/jepsencloud-bot/src/features/samp-phasec.js"
with open(path, "r") as f:
    text = f.read()

old = """async function adjustChips(db, uid, delta, type, meta = {}) {
  await dbRun(db, "UPDATE samp_users SET chips = chips + ?, updated_at = datetime('now') WHERE user_id = ?", [Number(delta), String(uid)]);
  await dbRun(db, "INSERT INTO samp_chip_ledger(user_id, type, amount, meta_json) VALUES(?, ?, ?, ?)", [String(uid), type, Number(delta), JSON.stringify(meta)]);
}"""

new = """async function adjustChips(db, uid, delta, type, meta = {}) {
  let finalDelta = Number(delta);
  if (type === "casino_win") {
    try {
      const gm = await dbGet(db, "SELECT gang_id FROM samp_gang_members WHERE user_id = ?", [String(uid)]);
      if (gm?.gang_id) {
        const evo = await dbGet(db, "SELECT * FROM samp_gang_evolution WHERE gang_id = ?", [gm.gang_id]);
        const lvl = getGangLevelByXp(Number(evo?.xp || 0));
        if (lvl.level >= 5) finalDelta = Math.round(finalDelta * 1.005);
      }
    } catch (_e) {}
  }
  await dbRun(db, "UPDATE samp_users SET chips = chips + ?, updated_at = datetime('now') WHERE user_id = ?", [finalDelta, String(uid)]);
  await dbRun(db, "INSERT INTO samp_chip_ledger(user_id, type, amount, meta_json) VALUES(?, ?, ?, ?)", [String(uid), type, finalDelta, JSON.stringify(meta)]);
}"""

if old in text:
    text = text.replace(old, new)
    with open(path, "w") as f:
        f.write(text)
    print("[OK] patched adjustChips")
else:
    print("[WARN] adjustChips block not found")
