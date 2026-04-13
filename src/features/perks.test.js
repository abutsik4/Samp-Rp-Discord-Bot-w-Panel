"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet, dbRun } = require("../utils/db-helpers");
const { ensureSampLifeTables } = require("./samp-life");
const { ensurePerksTables, upsertPerkRule, applyMoneyXpGrants } = require("./perks");

function makeDb() {
  return new sqlite3.Database(":memory:");
}

test("perk grants are applied only once per trigger", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensurePerksTables(db);

  try {
    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS user_levels (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        last_xp_at INTEGER,
        PRIMARY KEY (guild_id, user_id)
      )`
    );

    await dbRun(db, `INSERT INTO samp_users(user_id, money, car_id, rep, jail_until) VALUES(?, ?, 'bicycle', 0, 0)`, ["u1", 500]);
    await dbRun(db, `INSERT INTO user_levels(guild_id, user_id, xp, level) VALUES(?, ?, 0, 1)`, ["g1", "u1"]);

    await upsertPerkRule(db, "g1", {
      trigger_type: "badge",
      trigger_value: "msg_100",
      action_type: "grant_money",
      action_value: "5000",
    });
    await upsertPerkRule(db, "g1", {
      trigger_type: "badge",
      trigger_value: "msg_100",
      action_type: "grant_xp",
      action_value: "250",
    });

    const first = await applyMoneyXpGrants(db, "g1", "u1", [{ type: "badge", value: "msg_100" }]);
    const second = await applyMoneyXpGrants(db, "g1", "u1", [{ type: "badge", value: "msg_100" }]);

    const user = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u1"]);
    const levelRow = await dbGet(db, `SELECT xp FROM user_levels WHERE guild_id = ? AND user_id = ?`, ["g1", "u1"]);
    const claims = await dbGet(db, `SELECT COUNT(*) as c FROM perk_grant_claims WHERE guild_id = ? AND user_id = ?`, ["g1", "u1"]);

    assert.equal(first.moneyGranted, 5000);
    assert.equal(first.xpGranted, 250);
    assert.equal(second.moneyGranted, 0);
    assert.equal(second.xpGranted, 0);
    assert.equal(user.money, 5500);
    assert.equal(levelRow.xp, 250);
    assert.equal(claims.c, 2);
  } finally {
    db.close();
  }
});