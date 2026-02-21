"use strict";

const assert = require("assert/strict");
const { test } = require("node:test");
const sqlite3 = require("sqlite3").verbose();

const { dbRun } = require("../utils/db-helpers");
const { ensureRateLimitTables } = require("./rate-limiter");
const { runSecurityPipeline, invalidateBannedWordsCache } = require("./security-pipeline");

function createDb() {
  return new sqlite3.Database(":memory:");
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });
}

async function ensureBannedWordsTable(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS banned_words (
      guild_id TEXT NOT NULL,
      word TEXT NOT NULL,
      case_sensitive INTEGER DEFAULT 0,
      added_by TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, word)
    )
  `
  );
}

async function enablePipelineForChannel(db, guildId, channelId, limit = 999) {
  await ensureRateLimitTables(db);
  await dbRun(
    db,
    `INSERT OR REPLACE INTO rate_limit_config (guild_id, channel_id, enabled, default_limit)
     VALUES (?, ?, 1, ?)`,
    [guildId, channelId, limit]
  );
}

function createMessage({ guildId, channelId, userId, content }) {
  const state = { deleted: false, dm: null };
  const message = {
    content,
    webhookId: null,
    guild: { id: guildId },
    channel: { id: channelId },
    author: {
      id: userId,
      bot: false,
      send: async (txt) => {
        state.dm = txt;
      },
    },
    member: null,
    delete: async () => {
      state.deleted = true;
    },
  };
  return { message, state };
}

test("automod: Cyrillic token boundaries match whole words only", async () => {
  const db = createDb();
  const guildId = "g-automod-boundary";
  const channelId = "c1";
  const userId = "u1";

  await enablePipelineForChannel(db, guildId, channelId);
  await ensureBannedWordsTable(db);
  await dbRun(
    db,
    `INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, 0)`,
    [guildId, "тест"]
  );

  {
    const { message, state } = createMessage({
      guildId,
      channelId,
      userId,
      content: "это тест.",
    });
    const res = await runSecurityPipeline(db, message, []);
    assert.deepStrictEqual(res, { allowed: false, stop: true });
    assert.equal(state.deleted, true);
  }

  {
    const { message, state } = createMessage({
      guildId,
      channelId,
      userId,
      content: "протест не должен совпасть",
    });
    const res = await runSecurityPipeline(db, message, []);
    assert.deepStrictEqual(res, { allowed: true, stop: false });
    assert.equal(state.deleted, false);
  }

  await closeDb(db);
});

test("automod: ё≈е equivalence applies only for case-insensitive entries", async () => {
  const db = createDb();
  const channelId = "c1";
  const userId = "u1";

  await ensureBannedWordsTable(db);

  // NOTE: security-pipeline caches banned words per-guild for 60s.
  // Use distinct guild IDs so we don't depend on cache invalidation.
  const guildInsensitive = "g-automod-yo-insens";
  const guildSensitive = "g-automod-yo-sens";

  await enablePipelineForChannel(db, guildInsensitive, channelId);
  await dbRun(
    db,
    `INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, 0)`,
    [guildInsensitive, "ёлка"]
  );

  {
    const { message, state } = createMessage({
      guildId: guildInsensitive,
      channelId,
      userId,
      content: "Елка",
    });
    const res = await runSecurityPipeline(db, message, []);
    assert.deepStrictEqual(res, { allowed: false, stop: true });
    assert.equal(state.deleted, true);
  }

  await enablePipelineForChannel(db, guildSensitive, channelId);
  await dbRun(
    db,
    `INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, 1)`,
    [guildSensitive, "ёлка_case_sensitive"]
  );

  {
    const { message, state } = createMessage({
      guildId: guildSensitive,
      channelId,
      userId,
      content: "елка_case_sensitive",
    });
    const res = await runSecurityPipeline(db, message, []);
    assert.deepStrictEqual(res, { allowed: true, stop: false });
    assert.equal(state.deleted, false);
  }

  {
    const { message, state } = createMessage({
      guildId: guildSensitive,
      channelId,
      userId,
      content: "ёлка_case_sensitive",
    });
    const res = await runSecurityPipeline(db, message, []);
    assert.deepStrictEqual(res, { allowed: false, stop: true });
    assert.equal(state.deleted, true);
  }

  await closeDb(db);
});

test("automod: NFKC normalization catches full-width ASCII", async () => {
  const db = createDb();
  const guildId = "g-automod-nfkc";
  const channelId = "c1";
  const userId = "u1";

  await enablePipelineForChannel(db, guildId, channelId);
  await ensureBannedWordsTable(db);
  await dbRun(
    db,
    `INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, 0)`,
    [guildId, "test"]
  );

  const { message, state } = createMessage({
    guildId,
    channelId,
    userId,
    content: "ＴＥＳＴ",
  });
  const res = await runSecurityPipeline(db, message, []);
  assert.deepStrictEqual(res, { allowed: false, stop: true });
  assert.equal(state.deleted, true);

  await closeDb(db);
});

test("automod: multi-word phrases use substring matching", async () => {
  const db = createDb();
  const guildId = "g-automod-substr";
  const channelId = "c1";
  const userId = "u1";

  await enablePipelineForChannel(db, guildId, channelId);
  await ensureBannedWordsTable(db);
  await dbRun(
    db,
    `INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, 0)`,
    [guildId, "плохое слово"]
  );

  const { message, state } = createMessage({
    guildId,
    channelId,
    userId,
    content: "Это ПЛОХОЕ СЛОВО!",
  });
  const res = await runSecurityPipeline(db, message, []);
  assert.deepStrictEqual(res, { allowed: false, stop: true });
  assert.equal(state.deleted, true);

  await closeDb(db);
});

test("automod: banned-words cache invalidation reloads immediately", async () => {
  const db = createDb();
  const guildId = "g-automod-cache-invalidate";
  const channelId = "c1";
  const userId = "u1";

  await enablePipelineForChannel(db, guildId, channelId);
  await ensureBannedWordsTable(db);

  await dbRun(
    db,
    `INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, 0)`,
    [guildId, "test"]
  );

  // Prime cache.
  {
    const { message, state } = createMessage({ guildId, channelId, userId, content: "test" });
    const res = await runSecurityPipeline(db, message, []);
    assert.deepStrictEqual(res, { allowed: false, stop: true });
    assert.equal(state.deleted, true);
  }

  // Remove from DB, but cache would normally keep it for up to TTL.
  await dbRun(db, `DELETE FROM banned_words WHERE guild_id = ? AND word = ?`, [guildId, "test"]);

  // Without invalidation, we'd still hit. With invalidation, it should allow.
  invalidateBannedWordsCache(guildId);

  {
    const { message, state } = createMessage({ guildId, channelId, userId, content: "test" });
    const res = await runSecurityPipeline(db, message, []);
    assert.deepStrictEqual(res, { allowed: true, stop: false });
    assert.equal(state.deleted, false);
  }

  await closeDb(db);
});
