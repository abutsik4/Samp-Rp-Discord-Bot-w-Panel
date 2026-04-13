"use strict";

const assert = require("assert/strict");
const { test } = require("node:test");
const sqlite3 = require("sqlite3").verbose();

const { dbRun } = require("../utils/db-helpers");
const { ensureWatermarkForGuild, getWatermark } = require("./incremental-sync");

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

async function createSyncSchema(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS message_index (
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, message_id)
    )`
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS backfill_watermarks (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT '__guild__',
      last_message_id TEXT NOT NULL,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      messages_synced INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, channel_id)
    )`
  );
}

test("ensureWatermarkForGuild restores missing watermark from indexed history", async () => {
  const db = createDb();
  await createSyncSchema(db);

  await dbRun(
    db,
    `INSERT INTO message_index (guild_id, message_id, user_id, channel_id, created_at) VALUES (?, ?, ?, ?, ?)` ,
    ["g1", "100", "u1", "c1", "2026-04-13T10:00:00.000Z"]
  );
  await dbRun(
    db,
    `INSERT INTO message_index (guild_id, message_id, user_id, channel_id, created_at) VALUES (?, ?, ?, ?, ?)` ,
    ["g1", "200", "u1", "c1", "2026-04-13T10:05:00.000Z"]
  );

  const result = await ensureWatermarkForGuild({}, db, "g1");
  const watermark = await getWatermark(db, "g1");

  assert.equal(result.success, true);
  assert.equal(result.source, "index");
  assert.equal(result.messageId, "200");
  assert.equal(watermark?.last_message_id, "200");

  await closeDb(db);
});

test("ensureWatermarkForGuild falls back to live initialization when no history exists", async () => {
  const db = createDb();
  await createSyncSchema(db);

  const latestMessage = { id: "300", createdTimestamp: 3000 };
  const olderMessage = { id: "250", createdTimestamp: 2500 };
  const guild = {
    name: "Test Guild",
    channels: {
      fetch: async () => new Map([
        ["c1", {
          id: "c1",
          name: "general",
          isTextBased: () => true,
          isDMBased: () => false,
          lastMessageId: "300",
          messages: { fetch: async () => latestMessage },
        }],
        ["c2", {
          id: "c2",
          name: "offtopic",
          isTextBased: () => true,
          isDMBased: () => false,
          lastMessageId: "250",
          messages: { fetch: async () => olderMessage },
        }],
      ]),
    },
  };
  const client = {
    guilds: {
      fetch: async () => guild,
    },
  };

  const result = await ensureWatermarkForGuild(client, db, "g1");
  const watermark = await getWatermark(db, "g1");

  assert.equal(result.success, true);
  assert.equal(result.source, "live-init");
  assert.equal(result.messageId, "300");
  assert.equal(watermark?.last_message_id, "300");

  await closeDb(db);
});