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
const { ensureSeasonalEventsTables } = require("./features/seasonal-events");
const { ensureGiveawayTables } = require("./features/giveaway");

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
  await ensureSeasonalEventsTables(db);
  await ensureGiveawayTables(db);
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