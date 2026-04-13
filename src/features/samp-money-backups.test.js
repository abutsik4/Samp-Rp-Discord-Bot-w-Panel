"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const { dbRun } = require("../utils/db-helpers");
const {
  backupSampMoney,
  createSqliteSnapshot,
  exportSampState,
  getSampBackupManifest,
  pruneOldBackupFiles,
  restoreSampState,
} = require("./samp-money-backups");
const { ensureSampLifeTables } = require("./samp-life");
const { ensureSampExtendedTables } = require("./samp-extended");
const { ensureStreakTable } = require("./streaks");
const { ensureBadgesTable } = require("./badges");
const { ensureLevelsTable } = require("./levels");
const { ensurePerksTables } = require("./perks");
const { ensureWeeklyAwardsTable } = require("./weekly-awards");

function makeDb() {
  return new sqlite3.Database(":memory:");
}

function makeFileDb(filePath) {
  return new sqlite3.Database(filePath);
}

test("backupSampMoney writes a JSON snapshot with totals", async () => {
  const db = makeDb();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "samp-money-backup-"));

  try {
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

    await dbRun(db, `INSERT INTO samp_users(user_id, money, car_id, rep, jail_until) VALUES('u1', 1500, 'bicycle', 0, 0)`);
    await dbRun(db, `INSERT INTO samp_users(user_id, money, car_id, rep, jail_until) VALUES('u2', 250, 'manana', 3, 0)`);

    const now = new Date("2026-04-08T04:00:00.000Z");
    const result = await backupSampMoney(db, { backupDir: tempDir, now });
    const content = JSON.parse(await fs.readFile(result.filePath, "utf8"));

    assert.equal(result.userCount, 2);
    assert.equal(result.totalMoney, 1750);
    assert.equal(content.userCount, 2);
    assert.equal(content.totalMoney, 1750);
    assert.equal(content.users[0].user_id, "u1");
    assert.equal(content.users[1].user_id, "u2");
  } finally {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("createSqliteSnapshot writes a SQLite copy and metadata", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "samp-sqlite-backup-"));
  const dbPath = path.join(tempDir, "stats.db");
  const db = makeFileDb(dbPath);

  try {
    await ensureSampLifeTables(db);
    await dbRun(db, `INSERT INTO samp_users(user_id, money, car_id, rep, jail_until) VALUES('u1', 4200, 'bicycle', 0, 0)`);

    const result = await createSqliteSnapshot(db, {
      backupDir: tempDir,
      now: new Date("2026-04-10T04:00:00.000Z"),
      retentionDays: 30,
    });

    const metadata = JSON.parse(await fs.readFile(result.metadataPath, "utf8"));
    const snapshotDb = makeFileDb(result.filePath);
    const rows = await require("../utils/db-helpers").dbAll(snapshotDb, `SELECT user_id, money FROM samp_users`);

    assert.equal(metadata.totalSampMoney, 4200);
    assert.equal(metadata.ledgerMaxId, 0);
    assert.deepEqual(rows, [{ user_id: "u1", money: 4200 }]);

    snapshotDb.close();
  } finally {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("exportSampState manifest covers logical restore tables", async () => {
  const manifest = getSampBackupManifest();

  assert.ok(manifest.logicalTables.includes("samp_users"));
  assert.ok(manifest.logicalTables.includes("samp_properties"));
  assert.ok(manifest.logicalTables.includes("user_streaks"));
  assert.ok(manifest.logicalTables.includes("user_badges"));
  assert.ok(manifest.logicalTables.includes("user_levels"));
  assert.ok(manifest.logicalTables.includes("perk_grant_claims"));
  assert.ok(manifest.logicalTables.includes("weekly_award_runs"));
});

test("exportSampState and restoreSampState preserve SAMP state without touching unrelated tables", async () => {
  const db = makeDb();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "samp-state-export-"));

  try {
    await ensureSampLifeTables(db);
    await ensureSampExtendedTables(db);
    await ensureStreakTable(db);
    await ensureBadgesTable(db);
    await ensureLevelsTable(db);
    await ensurePerksTables(db);
    await ensureWeeklyAwardsTable(db);

    await dbRun(db, `CREATE TABLE custom_stats (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`);
    await dbRun(db, `INSERT INTO custom_stats(id, name) VALUES(1, 'keep-me')`);
    await dbRun(db, `INSERT INTO samp_users(user_id, money, car_id, rep, jail_until) VALUES('u1', 5000, 'bicycle', 2, 0)`);
    await dbRun(db, `INSERT INTO samp_gangs(id, name, tag, leader_id, treasury) VALUES(1, 'Grove', 'GRV', 'u1', 9000)`);
    await dbRun(db, `INSERT INTO samp_gang_members(gang_id, user_id, role) VALUES(1, 'u1', 'leader')`);
    await dbRun(db, `INSERT INTO user_streaks(guild_id, user_id, current_streak, longest_streak, last_message_date) VALUES('g1', 'u1', 7, 7, '2026-04-10')`);
    await dbRun(db, `INSERT INTO user_levels(guild_id, user_id, xp, level, last_xp_at) VALUES('g1', 'u1', 250, 3, 0)`);

    const exported = await exportSampState(db, {
      backupDir: tempDir,
      now: new Date("2026-04-10T05:00:00.000Z"),
      retentionDays: 30,
    });

    await dbRun(db, `UPDATE samp_users SET money = 1 WHERE user_id = 'u1'`);

    const dryRun = await restoreSampState(db, exported.filePath, { dryRun: true });
    const moneyAfterDryRun = await require("../utils/db-helpers").dbGet(db, `SELECT money FROM samp_users WHERE user_id = 'u1'`);
    assert.equal(dryRun.applied, false);
    assert.equal(moneyAfterDryRun.money, 1);

    const restored = await restoreSampState(db, exported.filePath, { dryRun: false });
    const restoredUser = await require("../utils/db-helpers").dbGet(db, `SELECT money FROM samp_users WHERE user_id = 'u1'`);
    const unrelated = await require("../utils/db-helpers").dbGet(db, `SELECT name FROM custom_stats WHERE id = 1`);

    assert.equal(restored.applied, true);
    assert.equal(restoredUser.money, 5000);
    assert.equal(unrelated.name, "keep-me");
  } finally {
    db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("pruneOldBackupFiles removes files older than retention window", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "samp-prune-"));
  const oldFile = path.join(tempDir, "old.json");
  const freshFile = path.join(tempDir, "fresh.json");

  try {
    await fs.writeFile(oldFile, "old\n", "utf8");
    await fs.writeFile(freshFile, "fresh\n", "utf8");

    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await fs.utimes(oldFile, fortyDaysAgo, fortyDaysAgo);

    const result = await pruneOldBackupFiles(tempDir, { retentionDays: 30 });
    const oldExists = await fs.stat(oldFile).then(() => true).catch(() => false);
    const freshExists = await fs.stat(freshFile).then(() => true).catch(() => false);

    assert.equal(result.removedFiles.length, 1);
    assert.equal(oldExists, false);
    assert.equal(freshExists, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});