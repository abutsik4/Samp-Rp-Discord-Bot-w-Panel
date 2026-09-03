"use strict";

/**
 * Shared bootstrap for index.js and panel-only.js
 *
 * Exports:
 *   initCore({ dbPath })  →  { db, dbRun, dbGet, dbAll }
 *   initFeatureTables(db, dbRun)  →  Promise<void>
 *   createDbHelpers(db)    →  { dbRun, dbGet, dbAll }  (short-form closures)
 *   parsePanelConfig()    →  { PANEL_BASE, TRUST_PROXY, COOKIE_SECURE, isAllowedChannel }
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const { dbRun: dbRunHelper, dbGet: dbGetHelper, dbAll: dbAllHelper } = require("./utils/db-helpers");

// ── Feature table ensure modules ─────────────────────────────────────
const { ensureHolidayTable } = require("./features/holidays");
const { ensureStreakTable } = require("./features/streaks");
const { ensureMilestoneTable } = require("./features/milestones");
const { ensureReactionsTable } = require("./features/reactions");
const { ensureWeeklyStatsTable } = require("./features/weekly-stats");
const { ensureAIEngagementTables } = require("./features/ai-engagement");
const { ensureUserPreferencesTables } = require("./features/user-preferences");
const { ensureRateLimitTables } = require("./features/rate-limiter");
const { ensureSampLifeTables } = require("./features/samp-life");
const { ensureBadgesTable } = require("./features/badges");
const { ensureTriviaTable } = require("./features/trivia");
const { ensureLevelsTable } = require("./features/levels");
const { ensureWantedTable } = require("./features/wanted-stars");
const { ensureWeeklyAwardsTable } = require("./features/weekly-awards");
const { ensureRadioTable } = require("./features/radio-vote");
const { ensurePerksTables } = require("./features/perks");
const { ensureXpMultipliersTable } = require("./features/xp-multipliers");
const { ensureSampExtendedTables } = require("./features/samp-extended");
const { ensurePrestigeTables } = require("./features/samp-prestige");
const { ensureVipTables } = require("./features/samp-vip");
const { ensureUpgradeColumns } = require("./features/samp-property-upgrades");
const { ensureCrateTables } = require("./features/samp-crates");
const { ensureCraftingTables } = require("./features/samp-phasec");
const { ensureSeasonalEventsTables } = require("./features/seasonal-events");
const { ensureGiveawayTables } = require("./features/giveaway");
const { ensureStaffRoleRequestsTable } = require("./features/staff-role-requests");

const { initSchema } = require("./db/schema");

/**
 * Open the SQLite database and set busyTimeout.
 * Returns { db, dbRun, dbGet, dbAll } where the helpers are short-form closures
 * bound to this db instance.
 *
 * DEPRECATED short form: dbRun(sql, params) — implicitly uses db
 * Preferred explicit form:  dbRun(db, sql, params)
 * TODO: Migrate all short-form calls to explicit (db, sql, params) then remove dual signature
 */
function initCore({ dbPath } = {}) {
  const resolved = dbPath
    ? path.resolve(dbPath)
    : path.join(__dirname, "..", "data", "stats.db");

  const db = new sqlite3.Database(resolved);
  db.configure("busyTimeout", 5000);

  // Dual-signature helpers — see deprecation comment above
  function dbRun(sqlOrDb, sqlOrParams = [], params = []) {
    if (typeof sqlOrDb === "string") return dbRunHelper(db, sqlOrDb, sqlOrParams);
    return dbRunHelper(sqlOrDb, sqlOrParams, params);
  }
  function dbGet(sqlOrDb, sqlOrParams = [], params = []) {
    if (typeof sqlOrDb === "string") return dbGetHelper(db, sqlOrDb, sqlOrParams);
    return dbGetHelper(sqlOrDb, sqlOrParams, params);
  }
  function dbAll(sqlOrDb, sqlOrParams = [], params = []) {
    if (typeof sqlOrDb === "string") return dbAllHelper(db, sqlOrDb, sqlOrParams);
    return dbAllHelper(sqlOrDb, sqlOrParams, params);
  }

  return { db, dbRun, dbGet, dbAll };
}

/**
 * Create all feature tables. Call after initSchema.
 */
async function initFeatureTables(db, dbRun) {
  await ensureHolidayTable(db);
  await ensureStreakTable(db);
  await ensureMilestoneTable(db);
  await ensureReactionsTable(db);
  await ensureWeeklyStatsTable(db);
  await ensureAIEngagementTables(db);
  await ensureUserPreferencesTables(db);
  await ensureRateLimitTables(db);
  await ensureSampLifeTables(db);
  await ensureBadgesTable(db);
  await ensureTriviaTable(db);
  await ensureLevelsTable(db);
  await ensureWantedTable(db);
  await ensureWeeklyAwardsTable(db);
  await ensureRadioTable(db);
  await ensurePerksTables(db);
  await ensureXpMultipliersTable(db);
  await ensureSampExtendedTables(db);
  await ensurePrestigeTables(db);
  // New 2026-05-27 money sinks. Order matters: upgrade ALTERs must run after
  // ensurePrestigeTables so the mansion/aircraft tables exist.
  await ensureVipTables(db);
  await ensureUpgradeColumns(db);
  await ensureCrateTables(db);

  // ── samp_command_logs ───────────────────────────────────────────────────
  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_command_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT    NOT NULL,
    guild_id      TEXT,
    channel_id    TEXT,
    command_name  TEXT    NOT NULL,
    subcommand_name TEXT,
    command_type  TEXT    NOT NULL DEFAULT 'slash',
    success       INTEGER NOT NULL DEFAULT 1,
    duration_ms   INTEGER,
    error_message TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cmdlog_cmd   ON samp_command_logs(command_name, created_at)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cmdlog_user  ON samp_command_logs(user_id,       created_at)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_cmdlog_guild ON samp_command_logs(guild_id,      created_at)`);

  // Safe migrations — add columns that may not exist on older DB files
  const cmdLogCols = (await dbRun(db, `PRAGMA table_info(samp_command_logs)`).catch(() => null)
    .then ? await new Promise((res) => db.all(`PRAGMA table_info(samp_command_logs)`, [], (e, r) => res(r || [])))
    : []);
  const existingCmdLogCols = new Set((cmdLogCols || []).map((c) => c.name));
  const cmdLogNewCols = [
    ["channel_id",     "TEXT"],
    ["command_type",   "TEXT    NOT NULL DEFAULT 'slash'"],
    ["success",        "INTEGER NOT NULL DEFAULT 1"],
    ["duration_ms",    "INTEGER"],
    ["error_message",  "TEXT"],
  ];
  for (const [col, def] of cmdLogNewCols) {
    if (!existingCmdLogCols.has(col)) {
      await dbRun(db, `ALTER TABLE samp_command_logs ADD COLUMN ${col} ${def}`).catch(() => {});
    }
  }

  // ── samp_login_streak ───────────────────────────────────────────────────
  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_login_streak (
    user_id        TEXT PRIMARY KEY,
    current_streak INTEGER NOT NULL DEFAULT 0,
    last_login     TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  await ensureCraftingTables(db);
  await ensureSeasonalEventsTables(db);
  await ensureGiveawayTables(db);
  await ensureStaffRoleRequestsTable(db);

  // ── samp_vehicle_insurance (new money sink) ────────────────────────────
  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_vehicle_insurance (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT    NOT NULL,
    car_id      TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    paid_amount INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, car_id)
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_insurance_user ON samp_vehicle_insurance(user_id)`);

  // ── samp_users: garage_slots column migration ──────────────────────────
  const garageColCheck = await new Promise((res) =>
    db.all(`PRAGMA table_info(samp_users)`, [], (e, r) => res(r || []))
  );
  if (!garageColCheck.some((c) => c.name === "garage_slots")) {
    await dbRun(db, `ALTER TABLE samp_users ADD COLUMN garage_slots INTEGER NOT NULL DEFAULT 3`).catch(() => {});
  }

  await dbRun(db, `CREATE TABLE IF NOT EXISTS bot_command_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    command_name TEXT,
    user_id TEXT,
    guild_id TEXT,
    error_message TEXT,
    stack TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  console.log("[BOT] Feature tables initialized.");
}

/**
 * Parse panel-related env config.
 */
function parsePanelConfig() {
  const PANEL_BASE = "/panel";
  const TRUST_PROXY = process.env.TRUST_PROXY === "1";
  // Boolean coercion: only 'true' string or boolean true → true
  const COOKIE_SECURE =
    process.env.COOKIE_SECURE === true ||
    process.env.COOKIE_SECURE === "true";

  function isAllowedChannel(channelId) {
    const list = (process.env.ALLOWED_CHANNEL_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.length) return true;
    return list.includes(channelId);
  }

  return { PANEL_BASE, TRUST_PROXY, COOKIE_SECURE, isAllowedChannel };
}

module.exports = {
  initCore,
  initFeatureTables,
  parsePanelConfig,
};