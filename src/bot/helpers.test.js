"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbRun } = require("../utils/db-helpers");
const helpers = require("./helpers");

function makeDb() {
  return new sqlite3.Database(":memory:");
}

test("command channel helpers persist and clear per-category restrictions", async () => {
  const db = makeDb();

  try {
    await dbRun(
      db,
      `CREATE TABLE command_channel_restrictions (
        guild_id TEXT NOT NULL,
        command_category TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        PRIMARY KEY (guild_id, command_category)
      )`
    );

    helpers.init({
      db,
      dbRun: (sql, params) => dbRun(db, sql, params),
      dbGet: (sql, params) => require("../utils/db-helpers").dbGet(db, sql, params),
      dbAll: (sql, params) => require("../utils/db-helpers").dbAll(db, sql, params),
    });

    assert.equal(await helpers.getCommandCategoryChannel("g1", "samp_game"), null);
    assert.equal(await helpers.isCommandCategoryAllowedInChannel("g1", "samp_game", "chan-a"), true);

    await helpers.setCommandCategoryChannel("g1", "samp_game", "1492082119466287114", "admin");

    const row = await helpers.getCommandCategoryChannel("g1", "samp_game");
    assert.equal(row.channel_id, "1492082119466287114");
    assert.equal(row.updated_by, "admin");

    const rows = await helpers.listCommandCategoryChannels("g1");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].command_category, "samp_game");

    assert.equal(await helpers.isCommandCategoryAllowedInChannel("g1", "samp_game", "1492082119466287114"), true);
    assert.equal(await helpers.isCommandCategoryAllowedInChannel("g1", "samp_game", "other-channel"), false);

    await helpers.clearCommandCategoryChannel("g1", "samp_game");

    assert.equal(await helpers.getCommandCategoryChannel("g1", "samp_game"), null);
    assert.equal(await helpers.isCommandCategoryAllowedInChannel("g1", "samp_game", "other-channel"), true);
  } finally {
    db.close();
  }
});