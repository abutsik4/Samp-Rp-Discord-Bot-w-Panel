/**
 * Standalone Web Panel Launcher
 * 
 * This is an alternative entry point that only starts the web panel
 * without running the Discord bot. Useful for testing the panel independently.
 * 
 * Usage: node src/panel-only.js
 */

require("dotenv").config();
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const { createDiscordClient } = require("./bot/discordClient");
const { initSchema } = require("./db/schema");
const { createPanelApp } = require("./web/panel-app");
const { dbRun: dbRunHelper, dbGet: dbGetHelper, dbAll: dbAllHelper } = require("./utils/db-helpers");

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

const PORT = Number(process.env.PANEL_PORT || 3001);
const TOKEN = process.env.DISCORD_TOKEN;

const PANEL_BASE = "/panel";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === "auto"
    ? "auto"
    : process.env.COOKIE_SECURE === "true";

function isAllowedChannel(channelId) {
  const list = (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) return true;
  return list.includes(channelId);
}

const dbPath = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, "..", "data", "stats.db");

const db = new sqlite3.Database(dbPath);

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

async function initDb() {
  await initSchema(dbRun, dbPath);

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
}

async function startPanelOnly() {
  console.log("🚀 Starting JepsenCloud Panel...\n");

  await initDb();
  console.log("✅ Database initialized:", dbPath);

  // Initialize Discord client (needed for bot management, but won't login without token)
  const discordClient = createDiscordClient();

  // Bot helpers required by panel routes
  const helpers = require("./bot/helpers");
  helpers.init({ db, dbRun, dbGet, dbAll });
  const {
    ruPlural,
    getUserMessageCount,
    recordOperation,
    performUndo,
    getDisabledCommands,
    enableCommand,
    disableCommand,
  } = helpers;

  const bots = [{ key: "samprp", name: "JepsenCloud Bot", kind: "discord", client: discordClient, guild_id: "537187880842559499" }];

  // Start web server
  const { app } = createPanelApp({
    client: discordClient,
    db,
    dbRun,
    dbGet,
    dbAll,
    bots,
    isAllowedChannel,
    PANEL_BASE,
    TRUST_PROXY,
    COOKIE_SECURE,
    recordOperation,
    performUndo,
    getUserMessageCount,
    ruPlural,
    getDisabledCommands,
    enableCommand,
    disableCommand,
  });

  app.listen(PORT, () => {
    console.log(`\n✨ Panel ready!`);
    console.log(`📍 http://localhost:${PORT}${PANEL_BASE}/login`);
    console.log(`\n💡 Tip: run 'node scripts/init-panel-users.js' to create panel users if needed.\n`);
  });

  // If Discord token is available, connect the bot
  if (TOKEN) {
    console.log("\n🔗 Connecting to Discord...");
    try {
      await discordClient.login(TOKEN);
      console.log(`✅ Connected as ${discordClient.user.tag}`);
    } catch (error) {
      console.log("⚠️  Discord connection failed (panel will work without bot features)");
      console.log(`   Error: ${error.message}`);
    }
  } else {
    console.log("⚠️  No DISCORD_TOKEN found - running panel without Discord connection");
  }
}

startPanelOnly().catch(error => {
  console.error("❌ Failed to start panel:", error);
  process.exit(1);
});
