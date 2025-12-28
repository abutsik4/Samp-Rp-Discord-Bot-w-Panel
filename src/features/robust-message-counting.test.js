"use strict";

const assert = require("assert/strict");
const { test } = require("node:test");
const sqlite3 = require("sqlite3").verbose();
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const {
  incrementMessageCountRobust,
  decrementMessageCountRobust,
  bulkDecrementRobust,
  processErrorQueue,
} = require("./robust-message-counting");

function createDb() {
  return new sqlite3.Database(":memory:");
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function createRobustSchema(db) {
  await dbRun(db, `PRAGMA journal_mode = WAL`);
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS user_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )`
  );
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS message_index (
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, message_id)
    )`
  );
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS message_count_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      guild_id TEXT,
      user_id TEXT,
      message_id TEXT,
      details TEXT,
      timestamp INTEGER NOT NULL
    )`
  );
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS message_count_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_id TEXT,
      operation TEXT NOT NULL CHECK (operation IN ('increment', 'decrement')),
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
}

async function createErrorQueueOnlySchema(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS message_count_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      guild_id TEXT,
      user_id TEXT,
      message_id TEXT,
      details TEXT,
      timestamp INTEGER NOT NULL
    )`
  );
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS message_count_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_id TEXT,
      operation TEXT NOT NULL CHECK (operation IN ('increment', 'decrement')),
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
}

test("increment stores user stats, index, and event", async () => {
  const db = createDb();
  await createRobustSchema(db);

  await incrementMessageCountRobust(db, "g1", "u1", "m1");

  const stat = await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, ["g1", "u1"]);
  assert.equal(stat?.message_count, 1);

  const idx = await dbGet(db, `SELECT user_id FROM message_index WHERE guild_id = ? AND message_id = ?`, ["g1", "m1"]);
  assert.equal(idx?.user_id, "u1");

  const events = await dbAll(db, `SELECT event_type FROM message_count_events WHERE event_type = 'increment'`);
  assert.ok(events.length >= 1);

  await closeDb(db);
});

test("decrement clamps at zero and removes index", async () => {
  const db = createDb();
  await createRobustSchema(db);

  await dbRun(db, `INSERT INTO user_stats (guild_id, user_id, message_count) VALUES (?, ?, ?)`, ["g1", "u1", 1]);
  await dbRun(db, `INSERT INTO message_index (guild_id, message_id, user_id) VALUES (?, ?, ?)`, ["g1", "m1", "u1"]);

  await decrementMessageCountRobust(db, "g1", "u1", "m1");

  const stat = await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, ["g1", "u1"]);
  assert.equal(stat?.message_count, 0);

  const idx = await dbGet(db, `SELECT 1 FROM message_index WHERE guild_id = ? AND message_id = ?`, ["g1", "m1"]);
  assert.equal(idx, null);

  const events = await dbAll(db, `SELECT event_type FROM message_count_events WHERE event_type = 'decrement'`);
  assert.ok(events.length >= 1);

  await closeDb(db);
});

test("bulk decrement reduces counts per user and clears index", async () => {
  const db = createDb();
  await createRobustSchema(db);

  await dbRun(db, `INSERT INTO user_stats (guild_id, user_id, message_count) VALUES (?, ?, ?)`, ["g1", "u1", 5]);
  await dbRun(db, `INSERT INTO user_stats (guild_id, user_id, message_count) VALUES (?, ?, ?)`, ["g1", "u2", 3]);

  await dbRun(db, `INSERT INTO message_index (guild_id, message_id, user_id) VALUES (?, ?, ?)`, ["g1", "m1", "u1"]);
  await dbRun(db, `INSERT INTO message_index (guild_id, message_id, user_id) VALUES (?, ?, ?)`, ["g1", "m2", "u1"]);
  await dbRun(db, `INSERT INTO message_index (guild_id, message_id, user_id) VALUES (?, ?, ?)`, ["g1", "m3", "u2"]);

  const userCounts = new Map([
    ["u1", 2],
    ["u2", 1],
  ]);

  const messageIds = ["m1", "m2", "m3"];

  await bulkDecrementRobust(db, "g1", userCounts, messageIds);

  const stat1 = await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, ["g1", "u1"]);
  const stat2 = await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, ["g1", "u2"]);
  assert.equal(stat1?.message_count, 3);
  assert.equal(stat2?.message_count, 2);

  const remaining = await dbAll(db, `SELECT message_id FROM message_index WHERE guild_id = ?`, ["g1"]);
  assert.equal(remaining.length, 0);

  const events = await dbAll(db, `SELECT event_type FROM message_count_events WHERE event_type = 'bulk_decrement'`);
  assert.ok(events.length >= 1);

  await closeDb(db);
});

test("processErrorQueue replays queued increments", async () => {
  const db = createDb();
  await createRobustSchema(db);

  await dbRun(
    db,
    `INSERT INTO message_count_errors (guild_id, user_id, message_id, operation, error, retry_count) VALUES (?, ?, ?, 'increment', 'simulated', 0)`,
    ["g1", "u1", "m9"]
  );

  const result = await processErrorQueue(db);
  assert.equal(result.processed, 1);
  assert.equal(result.succeeded, 1);

  const stat = await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, ["g1", "u1"]);
  assert.equal(stat?.message_count, 1);

  const remainingQueue = await dbAll(db, `SELECT id FROM message_count_errors`);
  assert.equal(remainingQueue.length, 0);

  await closeDb(db);
});

test("processErrorQueue bumps retry_count when operations keep failing", async () => {
  const db = createDb();
  await createErrorQueueOnlySchema(db);

  await dbRun(
    db,
    `INSERT INTO message_count_errors (guild_id, user_id, message_id, operation, error, retry_count) VALUES (?, ?, ?, 'increment', 'missing tables', 0)`,
    ["g1", "u1", "m10"]
  );

  const result = await processErrorQueue(db);
  assert.equal(result.processed, 1);
  assert.equal(result.succeeded, 0);

  const queueRows = await dbAll(db, `SELECT retry_count FROM message_count_errors WHERE guild_id = ? AND user_id = ? ORDER BY id ASC`, ["g1", "u1"]);
  assert.equal(queueRows.length, 2); // original row + newly queued failure
  assert.equal(queueRows[0]?.retry_count, 1);
  assert.equal(queueRows[1]?.retry_count, 0);

  await closeDb(db);
});
