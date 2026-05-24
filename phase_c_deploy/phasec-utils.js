"use strict";

const { dbRun } = require("../utils/db-helpers");
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

module.exports = { awardMaterialDrops };
