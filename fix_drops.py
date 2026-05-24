#!/usr/bin/env python3
"""Fix missing / broken material drop hooks for heist, bizrun, airjob."""
import os

EXT = "/opt/jepsencloud-bot/src/features/samp-extended.js"
PRE = "/opt/jepsencloud-bot/src/features/samp-prestige.js"

with open(EXT, "r", encoding="utf-8") as f:
    text = f.read()

# --- 1. Fix broken heist drop block ---
old_heist = (
    '            await addLedger(db, "heist", null, pid, share, { tier: tierKey, crew_size: participantIds.length });\n'
    '    // Phase C material drops\n'
    '    try {\n'
    '      const { rollMaterialDrops } = require("./constants/crafting");\n'
    '      const drops = rollMaterialDrops("heist");\n'
    '      for (const { materialId, qty } of drops) {\n'
    '        await dbRun(db, `INSERT INTO samp_crafting_inventory(user_id, material_id, qty) VALUES(?, ?, ?) ON CONFLICT(user_id, material_id) DO UPDATE SET qty = qty + excluded.qty, updated_at = datetime(\'now\')`, [userId, materialId, qty]);\n'
    '      }\n'
    '    } catch (_e) {}'
)
new_heist = (
    '            await addLedger(db, "heist", null, pid, share, { tier: tierKey, crew_size: participantIds.length });\n'
    '            try { const { awardMaterialDrops } = require("./phasec-utils"); await awardMaterialDrops(db, pid, "heist"); } catch (_e) {}'
)
assert old_heist in text, "Heist drop block not found in samp-extended.js"
text = text.replace(old_heist, new_heist)

# --- 2. Add bizrun drop after withTx cooldown insert ---
old_bizrun = (
    '    await dbRun(\n'
    '      db,\n'
    '      `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)\n'
    '       ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`,\n'
    '      [userId, cooldownAction, nowMs() + operation.cooldownMs]\n'
    '    );\n'
    '  });'
)
new_bizrun = (
    '    await dbRun(\n'
    '      db,\n'
    '      `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)\n'
    '       ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`,\n'
    '      [userId, cooldownAction, nowMs() + operation.cooldownMs]\n'
    '    );\n'
    '  });\n'
    '  try { const { awardMaterialDrops } = require("./phasec-utils"); await awardMaterialDrops(db, userId, "bizrun"); } catch (_e) {}'
)
assert old_bizrun in text, "Bizrun cooldown block not found in samp-extended.js"
text = text.replace(old_bizrun, new_bizrun)

with open(EXT, "w", encoding="utf-8") as f:
    f.write(text)

# --- 3. Add airjob drop inside withTx in samp-prestige.js ---
with open(PRE, "r", encoding="utf-8") as f:
    text2 = f.read()

old_airjob = (
    '      await adjustMoney(db, userId, pay);\n'
    '      const inserted = await addLedgerUnique(\n'
    '        db, "airjob", null, userId, pay, opKey,\n'
    '        { aircraft: aircraft.id, line }\n'
    '      );\n'
    '      if (!inserted) throw new Error("DUPLICATE_OPERATION");\n'
    '    });'
)
new_airjob = (
    '      await adjustMoney(db, userId, pay);\n'
    '      const inserted = await addLedgerUnique(\n'
    '        db, "airjob", null, userId, pay, opKey,\n'
    '        { aircraft: aircraft.id, line }\n'
    '      );\n'
    '      if (!inserted) throw new Error("DUPLICATE_OPERATION");\n'
    '      try { const { awardMaterialDrops } = require("./phasec-utils"); await awardMaterialDrops(db, userId, "airjob"); } catch (_e) {}\n'
    '    });'
)
assert old_airjob in text2, "Airjob block not found in samp-prestige.js"
text2 = text2.replace(old_airjob, new_airjob)

with open(PRE, "w", encoding="utf-8") as f:
    f.write(text2)

print("Fixed heist drop, added bizrun drop, added airjob drop.")
