"use strict";

const fs = require("fs/promises");
const path = require("path");

const { dbAll, dbGet, dbRun } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");
const { ensureSampLifeTables } = require("./samp-life");
const { ensureSampExtendedTables } = require("./samp-extended");
const { ensureStreakTable } = require("./streaks");
const { ensureBadgesTable } = require("./badges");
const { ensureLevelsTable } = require("./levels");
const { ensurePerksTables } = require("./perks");
const { ensureWeeklyAwardsTable } = require("./weekly-awards");

const BACKUP_SCHEMA_VERSION = 1;
const DEFAULT_RETENTION_DAYS = 30;

const SAMP_LOGICAL_TABLES = [
  "samp_users",
  "samp_garage",
  "samp_inventory",
  "samp_user_settings",
  "samp_cooldowns",
  "samp_gangs",
  "samp_gang_members",
  "samp_gang_territories",
  "samp_properties",
  "samp_car_upgrades",
  "samp_car_tuning_level",
  "samp_race_stats",
  "samp_car_offers",
  "samp_bounties",
  "samp_cosmetics",
  "samp_lottery",
  "samp_lottery_history",
  "samp_live_ops",
  "samp_live_ops_presets",
  "badge_definitions",
  "user_badges",
  "user_streaks",
  "user_levels",
  "perk_rules",
  "perk_grant_claims",
  "weekly_awards",
  "weekly_award_runs",
  "samp_ledger",
];

const AUTOINCREMENT_TABLES = new Set([
  "samp_ledger",
  "samp_car_offers",
  "samp_bounties",
  "samp_gangs",
  "samp_lottery",
  "samp_lottery_history",
  "samp_live_ops_presets",
  "perk_rules",
]);

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatBackupStamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function getMoneyBackupDir(baseDir) {
  return baseDir || path.join(__dirname, "..", "..", "backups", "money");
}

function getSqliteSnapshotDir(baseDir) {
  return baseDir || path.join(__dirname, "..", "..", "backups", "sqlite");
}

function getSampStateBackupDir(baseDir) {
  return baseDir || path.join(__dirname, "..", "..", "backups", "samp-state");
}

function getRetentionDays(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_RETENTION_DAYS;
  return parsed;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function escapeSqliteString(value) {
  return String(value).replace(/'/g, "''");
}

async function tableExists(db, tableName) {
  const row = await dbGet(
    db,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [String(tableName)]
  );
  return Boolean(row);
}

async function pruneOldBackupFiles(dirPath, options = {}) {
  const retentionDays = getRetentionDays(options.retentionDays);
  if (retentionDays === 0) return { removedFiles: [] };

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const removedFiles = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(dirPath, entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || stat.mtimeMs >= cutoff) continue;
    await fs.rm(filePath, { force: true });
    removedFiles.push(filePath);
  }

  return { removedFiles };
}

async function getDatabaseFilePath(db) {
  const rows = await dbAll(db, "PRAGMA database_list");
  const main = (rows || []).find((row) => row?.name === "main");
  const filePath = String(main?.file || "").trim();
  if (!filePath) {
    throw new Error("Main database is not backed by a file; SQLite snapshot is unavailable for in-memory DBs");
  }
  return path.resolve(filePath);
}

async function collectSampBackupStats(db) {
  const tableCounts = {};
  for (const tableName of SAMP_LOGICAL_TABLES) {
    if (!(await tableExists(db, tableName))) {
      tableCounts[tableName] = null;
      continue;
    }
    const row = await dbGet(db, `SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`);
    tableCounts[tableName] = Number(row?.count || 0);
  }

  const totalMoneyRow = (await tableExists(db, "samp_users"))
    ? await dbGet(db, "SELECT COALESCE(SUM(money), 0) AS total_money FROM samp_users")
    : null;
  const ledgerRow = (await tableExists(db, "samp_ledger"))
    ? await dbGet(db, "SELECT COALESCE(MAX(id), 0) AS max_id FROM samp_ledger")
    : null;

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    totalSampMoney: Number(totalMoneyRow?.total_money || 0),
    ledgerMaxId: Number(ledgerRow?.max_id || 0),
    tableCounts,
  };
}

function getSampBackupManifest() {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    retentionDays: DEFAULT_RETENTION_DAYS,
    logicalTables: [...SAMP_LOGICAL_TABLES],
    directories: {
      money: getMoneyBackupDir(),
      sqlite: getSqliteSnapshotDir(),
      sampState: getSampStateBackupDir(),
    },
  };
}

async function ensureSampBackupTables(db) {
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);
  await ensureStreakTable(db);
  await ensureBadgesTable(db);
  await ensureLevelsTable(db);
  await ensurePerksTables(db);
  await ensureWeeklyAwardsTable(db);
}

async function writeJsonFile(filePath, payload) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function createSqliteSnapshot(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const backupDir = getSqliteSnapshotDir(options.backupDir);
  const retentionDays = getRetentionDays(options.retentionDays);
  const sourcePath = options.sourcePath ? path.resolve(options.sourcePath) : await getDatabaseFilePath(db);

  await fs.mkdir(backupDir, { recursive: true });

  const baseName = `${formatBackupStamp(now)}_stats.sqlite`;
  const filePath = path.join(backupDir, baseName);
  const metadataPath = `${filePath}.json`;
  await fs.rm(filePath, { force: true });
  await fs.rm(metadataPath, { force: true });

  await dbRun(db, `VACUUM INTO '${escapeSqliteString(filePath)}'`);

  const stat = await fs.stat(filePath);
  const integrity = await collectSampBackupStats(db);
  const metadata = {
    createdAt: now.toISOString(),
    schemaVersion: BACKUP_SCHEMA_VERSION,
    sourcePath,
    snapshotPath: filePath,
    sizeBytes: stat.size,
    ...integrity,
  };
  await writeJsonFile(metadataPath, metadata);

  const pruneResult = await pruneOldBackupFiles(backupDir, { retentionDays });

  return {
    filePath,
    metadataPath,
    sourcePath,
    sizeBytes: stat.size,
    stats: integrity,
    removedFiles: pruneResult.removedFiles,
  };
}

async function exportTableRows(db, tableName) {
  if (!(await tableExists(db, tableName))) {
    return { exists: false, rows: [] };
  }
  const rows = await dbAll(db, `SELECT * FROM ${quoteIdentifier(tableName)}`);
  return { exists: true, rows };
}

async function exportSampState(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const backupDir = getSampStateBackupDir(options.backupDir);
  const retentionDays = getRetentionDays(options.retentionDays);
  const manifest = getSampBackupManifest();

  await fs.mkdir(backupDir, { recursive: true });

  const tables = {};
  const tableCounts = {};
  const missingTables = [];
  for (const tableName of manifest.logicalTables) {
    const exported = await exportTableRows(db, tableName);
    tables[tableName] = exported.rows;
    if (!exported.exists) {
      tableCounts[tableName] = null;
      missingTables.push(tableName);
      continue;
    }
    tableCounts[tableName] = exported.rows.length;
  }

  const stats = await collectSampBackupStats(db);
  const payload = {
    createdAt: now.toISOString(),
    schemaVersion: BACKUP_SCHEMA_VERSION,
    manifest,
    stats,
    missingTables,
    tables,
    tableCounts,
  };

  const filePath = path.join(backupDir, `${formatBackupStamp(now)}_samp_state.json`);
  await writeJsonFile(filePath, payload);

  const pruneResult = await pruneOldBackupFiles(backupDir, { retentionDays });

  return {
    filePath,
    tableCounts,
    missingTables,
    stats,
    removedFiles: pruneResult.removedFiles,
  };
}

async function withTransaction(db, fn) {
  return withSerializedTransaction(db, fn);
}

async function clearTable(db, tableName) {
  if (!(await tableExists(db, tableName))) return;
  await dbRun(db, `DELETE FROM ${quoteIdentifier(tableName)}`);
}

async function insertRows(db, tableName, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const columnSql = columns.map(quoteIdentifier).join(", ");
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO ${quoteIdentifier(tableName)} (${columnSql}) VALUES (${placeholders})`;

  for (const row of rows) {
    await dbRun(
      db,
      sql,
      columns.map((column) => (Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null))
    );
  }
}

async function resetAutoincrementSequence(db, tableName) {
  if (!AUTOINCREMENT_TABLES.has(tableName)) return;
  const sqliteSequenceExists = await tableExists(db, "sqlite_sequence");
  if (!sqliteSequenceExists) return;

  const row = await dbGet(db, `SELECT COALESCE(MAX(id), 0) AS max_id FROM ${quoteIdentifier(tableName)}`);
  const maxId = Number(row?.max_id || 0);
  await dbRun(db, `DELETE FROM sqlite_sequence WHERE name = ?`, [tableName]);
  if (maxId > 0) {
    await dbRun(db, `INSERT INTO sqlite_sequence(name, seq) VALUES(?, ?)`, [tableName, maxId]);
  }
}

async function restoreSampState(db, exportPath, options = {}) {
  const absolutePath = path.resolve(exportPath);
  const dryRun = options.dryRun !== false;
  const payload = JSON.parse(await fs.readFile(absolutePath, "utf8"));
  if (!payload || payload.schemaVersion !== BACKUP_SCHEMA_VERSION || typeof payload.tables !== "object") {
    throw new Error("Unsupported or invalid SAMP state export file");
  }

  await ensureSampBackupTables(db);

  const beforeStats = await collectSampBackupStats(db);
  const summary = {
    exportPath: absolutePath,
    createdAt: payload.createdAt || null,
    schemaVersion: payload.schemaVersion,
    before: beforeStats,
    incoming: payload.stats || null,
    tableCounts: payload.tableCounts || {},
  };

  if (dryRun) {
    return { applied: false, dryRun: true, summary };
  }

  const restoreOrder = SAMP_LOGICAL_TABLES.filter((tableName) => Object.prototype.hasOwnProperty.call(payload.tables, tableName));
  const clearOrder = [...restoreOrder].reverse();

  await withTransaction(db, async () => {
    await dbRun(db, "PRAGMA foreign_keys = OFF");
    for (const tableName of clearOrder) {
      await clearTable(db, tableName);
    }
    for (const tableName of restoreOrder) {
      await insertRows(db, tableName, Array.isArray(payload.tables[tableName]) ? payload.tables[tableName] : []);
      await resetAutoincrementSequence(db, tableName);
    }
    await dbRun(db, "PRAGMA foreign_keys = ON");
  });

  return {
    applied: true,
    dryRun: false,
    summary: {
      ...summary,
      after: await collectSampBackupStats(db),
    },
  };
}

async function runSampBackupCycle(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const snapshot = await createSqliteSnapshot(db, {
    now,
    backupDir: options.sqliteBackupDir,
    retentionDays: options.retentionDays,
  });
  const stateExport = await exportSampState(db, {
    now,
    backupDir: options.sampStateBackupDir,
    retentionDays: options.retentionDays,
  });
  const money = await backupSampMoney(db, {
    now,
    backupDir: options.moneyBackupDir,
    retentionDays: options.retentionDays,
  });

  return {
    snapshot,
    stateExport,
    money,
  };
}

async function backupSampMoney(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const backupDir = getMoneyBackupDir(options.backupDir);
  const retentionDays = getRetentionDays(options.retentionDays);
  const rows = await dbAll(
    db,
    `SELECT user_id, money, rep, car_id, jail_until, created_at, updated_at
     FROM samp_users
     ORDER BY money DESC, updated_at DESC, user_id ASC`
  );

  const userCount = rows.length;
  const totalMoney = rows.reduce((sum, row) => sum + Number(row.money || 0), 0);
  const payload = {
    createdAt: now.toISOString(),
    userCount,
    totalMoney,
    users: rows,
  };

  await fs.mkdir(backupDir, { recursive: true });
  const fileName = `${formatBackupStamp(now)}_samp_money.json`;
  const filePath = path.join(backupDir, fileName);
  await writeJsonFile(filePath, payload);

  const pruneResult = await pruneOldBackupFiles(backupDir, { retentionDays });

  return {
    filePath,
    userCount,
    totalMoney,
    removedFiles: pruneResult.removedFiles,
  };
}

module.exports = {
  BACKUP_SCHEMA_VERSION,
  backupSampMoney,
  createSqliteSnapshot,
  exportSampState,
  formatBackupStamp,
  getMoneyBackupDir,
  getSqliteSnapshotDir,
  getSampStateBackupDir,
  getSampBackupManifest,
  collectSampBackupStats,
  pruneOldBackupFiles,
  restoreSampState,
  runSampBackupCycle,
};