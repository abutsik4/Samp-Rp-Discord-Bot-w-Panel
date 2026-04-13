"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet, dbRun } = require("../utils/db-helpers");
const {
  ensureWeeklyAwardsTable,
  grantWeeklyRewards,
  resetWeeklyCounters,
  getWeekStart,
  getWeeklyAwardRun,
} = require("./weekly-awards");

function makeDb() {
  return new sqlite3.Database(":memory:");
}

async function createSupportTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS user_reactions (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reactions_given_weekly INTEGER NOT NULL DEFAULT 0,
      reactions_received_weekly INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )`
  );
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS trivia_scores (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      weekly_points INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )`
  );
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_users (
      user_id TEXT PRIMARY KEY,
      money INTEGER NOT NULL DEFAULT 0,
      car_id TEXT NOT NULL DEFAULT 'bicycle',
      rep INTEGER NOT NULL DEFAULT 0,
      jail_until INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      type TEXT NOT NULL,
      from_user TEXT,
      to_user TEXT,
      amount INTEGER NOT NULL,
      meta_json TEXT
    )`
  );
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
}

test("weekly rewards are idempotent per guild and week", async () => {
  const db = makeDb();
  await createSupportTables(db);
  await ensureWeeklyAwardsTable(db);

  try {
    await dbRun(db, `INSERT INTO samp_users(user_id, money, car_id, rep, jail_until) VALUES(?, 0, 'bicycle', 0, 0)`, ["u1"]);
    await dbRun(db, `INSERT INTO user_levels(guild_id, user_id, xp, level) VALUES(?, ?, 0, 1)`, ["g1", "u1"]);

    const awards = [{ category: "top_chatter", userId: "u1", value: 10 }];
    const first = await grantWeeklyRewards(db, "g1", awards);
    const second = await grantWeeklyRewards(db, "g1", awards);

    const user = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u1"]);
    const xp = await dbGet(db, `SELECT xp FROM user_levels WHERE guild_id = ? AND user_id = ?`, ["g1", "u1"]);
    const ledgerRows = await dbGet(db, `SELECT COUNT(*) as c FROM samp_ledger WHERE to_user = ?`, ["u1"]);
    const run = await getWeeklyAwardRun(db, "g1", getWeekStart());

    assert.equal(first.rewarded, 1);
    assert.equal(second.skipped, true);
    assert.equal(user.money, 25000);
    assert.equal(xp.xp, 2000);
    assert.equal(ledgerRows.c, 2);
    assert.ok(run.rewards_granted_at, "weekly run should mark rewards as granted");
  } finally {
    db.close();
  }
});

test("weekly counter reset is guild-scoped and idempotent", async () => {
  const db = makeDb();
  await createSupportTables(db);
  await ensureWeeklyAwardsTable(db);

  try {
    await dbRun(db, `INSERT INTO user_reactions(guild_id, user_id, reactions_given_weekly, reactions_received_weekly) VALUES('g1', 'u1', 4, 5)`);
    await dbRun(db, `INSERT INTO user_reactions(guild_id, user_id, reactions_given_weekly, reactions_received_weekly) VALUES('g2', 'u2', 7, 8)`);
    await dbRun(db, `INSERT INTO trivia_scores(guild_id, user_id, weekly_points) VALUES('g1', 'u1', 11)`);
    await dbRun(db, `INSERT INTO trivia_scores(guild_id, user_id, weekly_points) VALUES('g2', 'u2', 13)`);

    const firstReset = await resetWeeklyCounters(db, "g1", getWeekStart());
    const secondReset = await resetWeeklyCounters(db, "g1", getWeekStart());

    const g1Reactions = await dbGet(db, `SELECT reactions_given_weekly, reactions_received_weekly FROM user_reactions WHERE guild_id = 'g1' AND user_id = 'u1'`);
    const g2Reactions = await dbGet(db, `SELECT reactions_given_weekly, reactions_received_weekly FROM user_reactions WHERE guild_id = 'g2' AND user_id = 'u2'`);
    const g1Trivia = await dbGet(db, `SELECT weekly_points FROM trivia_scores WHERE guild_id = 'g1' AND user_id = 'u1'`);
    const g2Trivia = await dbGet(db, `SELECT weekly_points FROM trivia_scores WHERE guild_id = 'g2' AND user_id = 'u2'`);

    assert.equal(firstReset.reset, true);
    assert.equal(secondReset.skipped, true);
    assert.deepEqual(g1Reactions, { reactions_given_weekly: 0, reactions_received_weekly: 0 });
    assert.deepEqual(g2Reactions, { reactions_given_weekly: 7, reactions_received_weekly: 8 });
    assert.equal(g1Trivia.weekly_points, 0);
    assert.equal(g2Trivia.weekly_points, 13);
  } finally {
    db.close();
  }
});