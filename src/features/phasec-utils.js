"use strict";

const { dbRun, dbGet } = require("../utils/db-helpers");
const { MATERIALS } = require("./constants/crafting");

/**
 * Roll material drops for a given action and award them to user.
 * Safe to call after any action completion.
 */
async function awardMaterialDrops(db, userId, actionName) {
  try {
    const { rollMaterialDrops } = require("./constants/crafting");
    const drops = rollMaterialDrops(actionName);
    for (const { materialId, qty } of drops) {
      await dbRun(db, `INSERT INTO samp_crafting_inventory(user_id, material_id, qty) VALUES(?, ?, ?)
        ON CONFLICT(user_id, material_id) DO UPDATE SET qty = qty + excluded.qty, updated_at = datetime('now')`,
        [String(userId), materialId, qty]);
    }
  } catch (_e) {}
}

module.exports = { awardMaterialDrops, incrementGangXp };

async function incrementGangXp(db, userId, amount) {
  try {
    const row = await dbGet(db, "SELECT gang_id FROM samp_gang_members WHERE user_id = ?", [String(userId)]);
    if (!row || !row.gang_id) return;
    await dbRun(db,
      `INSERT INTO samp_gang_evolution(gang_id, xp, level, updated_at)
       VALUES(?, ?, 1, datetime('now'))
       ON CONFLICT(gang_id) DO UPDATE SET xp = xp + excluded.xp, updated_at = datetime('now')`,
      [row.gang_id, amount]
    );
  } catch (_e) {}
}
