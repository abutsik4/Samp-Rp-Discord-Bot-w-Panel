// Bot that counts messages and provides statistics for users in a Discord server

// Load environment variables from .env file
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");

const {
  ensureHolidayTable,
  startDailyHolidayPosts,
} = require("./features/holidays");

const { ensureSampLifeTables } = require("./features/samp-life");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const express = require("express");
const { initSchema } = require("./db/schema");

// dotenv already loaded at top of file

// Panel security deps
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);


// Structured logging
const { createLogger, newTraceId } = require("./utils/logger");

// New feature modules
const { dbRun: dbRunHelper, dbGet: dbGetHelper, dbAll: dbAllHelper } = require("./utils/db-helpers");

const { ensureStreakTable } = require("./features/streaks");
const { ensureMilestoneTable } = require("./features/milestones");
const { ensureReactionsTable } = require("./features/reactions");

const { ensureWeeklyStatsTable } = require("./features/weekly-stats");
const { ensureAIEngagementTables } = require("./features/ai-engagement");

const { ensureUserPreferencesTables } = require("./features/user-preferences");



const {
  ensureRateLimitTables,
} = require("./features/rate-limiter");


// D-track feature modules (badges, trivia, levels, wanted stars, weekly awards, radio vote)
const { ensureBadgesTable } = require("./features/badges");
const { ensureTriviaTable } = require("./features/trivia");
const { ensureLevelsTable } = require("./features/levels");
const { ensureWantedTable } = require("./features/wanted-stars");
const { ensureWeeklyAwardsTable } = require("./features/weekly-awards");
const { ensureRadioTable } = require("./features/radio-vote");

// -------------------------
// CONFIG / ENV
// -------------------------
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN || !OWNER_ID) {
  console.error("Please set DISCORD_TOKEN and OWNER_ID in your .env file.");
  process.exit(1);
}

// Panel base path (landing at /, panel under /panel)
const PANEL_BASE = "/panel";

// Optional: if you are behind a reverse proxy and want secure cookies:
// set TRUST_PROXY=1 and COOKIE_SECURE=true in env
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";

// Optional allow-list for panel posting (comma-separated IDs).
// If not set, panel can post to any text channel the bot can access.
function isAllowedChannel(channelId) {
  const list = (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!list.length) return true;
  return list.includes(channelId);
}

// -------------------------
// DATABASE (SQLite)
// -------------------------
// Single DB file used for:
// - user_stats (message counts)
// - message_index (message_id -> author_id, for robust delete decrement)
// - panel_sent_items (store sent messages/embeds from panel)
// - bot_kv (small KV store for schedulers, etc.)
const dbPath = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, "..", "data", "stats.db");

const db = new sqlite3.Database(dbPath);

// Promisified helpers (using shared module)
// Supports both signatures:
// - (sql, params)
// - (dbInstance, sql, params)
function dbRun(sqlOrDb, sqlOrParams = [], params = []) {
  if (typeof sqlOrDb === 'string') return dbRunHelper(db, sqlOrDb, sqlOrParams);
  return dbRunHelper(sqlOrDb, sqlOrParams, params);
}
function dbGet(sqlOrDb, sqlOrParams = [], params = []) {
  if (typeof sqlOrDb === 'string') return dbGetHelper(db, sqlOrDb, sqlOrParams);
  return dbGetHelper(sqlOrDb, sqlOrParams, params);
}
function dbAll(sqlOrDb, sqlOrParams = [], params = []) {
  if (typeof sqlOrDb === 'string') return dbAllHelper(db, sqlOrDb, sqlOrParams);
  return dbAllHelper(sqlOrDb, sqlOrParams, params);
}

// KV helpers for scheduler state
async function getKV(key) {
  const row = await dbGet(`SELECT value FROM bot_kv WHERE key = ?`, [key]);
  return row ? row.value : null;
}
async function setKV(key, value) {
  await dbRun(
    `INSERT INTO bot_kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)]
  );
}

async function initDb() {
  // Core schema (tables, indexes, migrations) — single source of truth in src/db/schema.js
  await initSchema(dbRun, dbPath);

  // Feature module tables
  await ensureHolidayTable(db);
  await ensureStreakTable(db);
  await ensureMilestoneTable(db);
  await ensureReactionsTable(db);
  await ensureWeeklyStatsTable(db);
  await ensureAIEngagementTables(db);
  await ensureUserPreferencesTables(db);
  await ensureRateLimitTables(db);
  await ensureSampLifeTables(db);

  // D-track feature tables
  await ensureBadgesTable(db);
  await ensureTriviaTable(db);
  await ensureLevelsTable(db);
  await ensureWantedTable(db);
  await ensureWeeklyAwardsTable(db);
  await ensureRadioTable(db);
}

initDb().catch((e) => {
  console.error("DB init failed:", e);
  process.exit(1);
});


// Bot helpers (extracted from this file)
const helpers = require("./bot/helpers");
helpers.init({ db, dbRun, dbGet, dbAll });

const {
  sleep, ruPlural, formatTimeOnServer,
  disableCommand, enableCommand, isCommandDisabled, getDisabledCommands,
  incrementMessageCount, decrementMessageCount, getUserMessageCount, resetStats,
  getCachedLeaderboard, setCachedLeaderboard, getTopUsers,
  STATUS_POOL, STATUS_ROTATION_ENABLED, STATUS_ROTATION_INTERVAL_MINUTES, setRandomPresence,
  indexMessage, cacheUserUsername, lookupIndexedAuthor, removeIndexedMessage,
  lookupIndexedAuthorsBulk, removeIndexedBulk,
  recordOperation, performUndo,
} = helpers;


// -------------------------
// DISCORD CLIENT
// -------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

client.on("error", (err) => {
  console.error("Discord client error:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});



// Slash commands (canonical definitions in src/bot/slashCommands.js)
const { registerGuildCommands } = require("./bot/slashCommands");

// Backfill utility (extracted to src/features/backfill.js)
const { backfillGuild: _backfillGuildCore } = require("./features/backfill");
function backfillGuild(guild) {
  return _backfillGuildCore(guild, { resetStats, incrementMessageCount, indexMessage, sleep });
}

// Schedulers (extracted to src/bot/schedulers.js)
const { startSchedulers } = require("./bot/schedulers");
let holidaysScheduler = null;

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag} (JepsenCloud bot ready).`);

  const result = await startSchedulers({
    client, db, TOKEN, dbAll,
    startDailyHolidayPosts,
    registerGuildCommands,
    setRandomPresence,
    ruPlural,
    STATUS_ROTATION_ENABLED,
    STATUS_ROTATION_INTERVAL_MINUTES,
  });
  holidaysScheduler = result.holidaysScheduler;
});

// Event handlers (extracted to src/bot/events/handlers.js)
const { registerEventHandlers } = require("./bot/events/handlers");
registerEventHandlers({
  client, db, TOKEN,
  registerGuildCommands,
  cacheUserUsername, getUserMessageCount,
  lookupIndexedAuthor, lookupIndexedAuthorsBulk,
  dbAll,
});

// Command handlers (extracted to src/bot/commands/dispatcher.js)
const { registerCommandHandlers } = require("./bot/commands/dispatcher");
registerCommandHandlers({
  client, db, dbRun, dbGet, dbAll,
  OWNER_ID, TOKEN,
  isCommandDisabled, getUserMessageCount,
  ruPlural, formatTimeOnServer, performUndo,
  registerGuildCommands, backfillGuild,
  holidaysScheduler,
});



// Panel helpers (extracted to src/web/panel-helpers.js)
const panelHelpers = require("./web/panel-helpers");
panelHelpers.init({ db, dbRun, dbGet, dbAll, panelBase: PANEL_BASE });

const {
  escapeHtml, parseHexColor, validateLength,
  requireAuth, requireAdmin,
  createPanelUser, getPanelUser, getAllPanelUsers,
  updatePanelUserPassword, updatePanelUserLastLogin,
  deletePanelUser, updatePanelUserRole, validateLogin,
  upsertPanelItem, markPanelItemDeleted, deletePanelItemLocalById,
  listPanelItems, getPanelItemById,
  fetchChannelForBot, isTextSendableChannel, extractEmbedForStorage,
  buildEmbedFromFields, getAllSendableChannels,
} = panelHelpers;

// WEB (Landing + Panel under /panel)
// -------------------------
const app = express();
if (TRUST_PROXY) app.set("trust proxy", 1);

const panelHttpLogger = createLogger("panel-http");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: false }));

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir, { index: false }));

// Assets referenced by EJS views as /public/* (bot.js, snow.js, etc.)
const webPublicDir = path.join(__dirname, "web", "public");
app.use("/public", express.static(webPublicDir, { index: false }));

// Some browsers still request /favicon.ico even when an SVG favicon is set.
app.get("/favicon.ico", (req, res) => res.redirect(302, "/icons/panel.svg"));


app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.get("/", (req, res) => {
  return res.sendFile(path.join(publicDir, "index.html"));
});

// Sessions DB lives in ./data
const sessionsDir = path.join(__dirname, "..", "data");

app.use(
  session({
    store: new SQLiteStore({ db: "sessions.db", dir: sessionsDir }),
    secret: (() => {
      const s = process.env.SESSION_SECRET;
      if (!s || s === "CHANGE_THIS_IN_PROD") {
        console.warn("[SECURITY-001] SESSION_SECRET is not set or uses the default value. Set a strong random string in .env");
      }
      return s || "CHANGE_THIS_IN_PROD";
    })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE,
    },
  })
);

// Request tracing + structured HTTP logging (panel + APIs)
app.use((req, res, next) => {
  const traceId = newTraceId();
  req.traceId = traceId;
  res.setHeader("X-Trace-Id", traceId);

  const started = Date.now();
  const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
  const ua = (req.headers["user-agent"] || "").toString().slice(0, 220);
  const user = req.session?.user?.username || null;

  // avoid logging extremely noisy long URLs (but keep enough for debugging)
  const pathSafe = String(req.originalUrl || req.url || "").slice(0, 2048);

  const isStaticAsset =
    req.method === "GET" &&
    (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map)(\?|$)/i.test(pathSafe) ||
      pathSafe.startsWith("/icons/") ||
      pathSafe.startsWith("/public/") ||
      pathSafe.startsWith("/shared.css"));

  const logReq = isStaticAsset ? panelHttpLogger.debug : panelHttpLogger.info;
  const logRes = isStaticAsset ? panelHttpLogger.debug : panelHttpLogger.info;

  logReq("HTTP request", {
    traceId,
    method: req.method,
    path: pathSafe,
    ip,
    user,
    ua,
  });

  res.on("finish", () => {
    const durationMs = Date.now() - started;
    logRes("HTTP response", {
      traceId,
      method: req.method,
      path: pathSafe,
      status: res.statusCode,
      durationMs,
      ip,
      user,
    });
  });

  next();
});

// Rate limits
const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const apiLimiter = rateLimit({ windowMs: 10_000, max: 40 });


// Multi-bot registry (future-proof). Today: one bot.
const bots = [{ key: "samprp", name: "JepsenCloud Bot", kind: "discord", client, guild_id: "537187880842559499" }];

// =========================================
// ROUTE MODULES
// =========================================
const { createDebugRouter } = require("./web/routes/debug");
const { createAuthRouter } = require("./web/routes/auth");
const { createMessagesRouter } = require("./web/routes/messages");
const { createStatsRouter } = require("./web/routes/stats");
const { createAnalyticsRouter } = require("./web/routes/analytics");
const { createBotPagesRouter } = require("./web/routes/bot-pages");
const { createCommandsRouter } = require("./web/routes/commands");
const { createAccuracyRouter } = require("./web/routes/accuracy");
const { createHolidaysRouter } = require("./web/routes/holidays");
const { createAIEngagementRouter } = require("./web/routes/ai-engagement");
const { createRateLimitsRouter } = require("./web/routes/rate-limits");
const { createCountdownRouter } = require("./web/routes/countdown");
const { createWhitelistRouter } = require("./web/routes/whitelist");
const { createAutomodRouter } = require("./web/routes/automod");
const { createHistoryRouter } = require("./web/routes/history");
const { createChannelsRouter } = require("./web/routes/channels");
const { createSampServersRouter } = require("./web/routes/samp-servers");

const routeCtx = {
  PANEL_BASE, db, client, bots,
  requireAuth, requireAdmin,
  apiLimiter, loginLimiter,
  dbRun, dbGet, dbAll,
  panelHttpLogger,
  // Panel helpers
  escapeHtml, parseHexColor, validateLength,
  validateLogin, createPanelUser, getPanelUser, getAllPanelUsers,
  updatePanelUserPassword, deletePanelUser, updatePanelUserRole,
  getAllSendableChannels, isAllowedChannel,
  // Bot helpers
  recordOperation, performUndo, getUserMessageCount, ruPlural,
  getDisabledCommands, enableCommand, disableCommand,
};

app.use(createDebugRouter(routeCtx));
app.use(createAuthRouter(routeCtx));
app.use(createMessagesRouter(routeCtx));
app.use(createStatsRouter(routeCtx));
app.use(createAnalyticsRouter(routeCtx));
app.use(createBotPagesRouter(routeCtx));
app.use(createCommandsRouter(routeCtx));
app.use(createAccuracyRouter(routeCtx));
app.use(createHolidaysRouter(routeCtx));
app.use(createAIEngagementRouter(routeCtx));
app.use(createRateLimitsRouter(routeCtx));
app.use(createCountdownRouter(routeCtx));
app.use(createWhitelistRouter(routeCtx));
app.use(createAutomodRouter(routeCtx));
app.use(createHistoryRouter(routeCtx));
app.use(createChannelsRouter(routeCtx));
app.use(createSampServersRouter(routeCtx));

// -------------------------
// Start web server
// -------------------------
// Final error handler (keeps traceId context in logs)
app.use((err, req, res, next) => {
  try {
    panelHttpLogger.error("Unhandled server error", {
      traceId: req?.traceId || null,
      method: req?.method,
      path: req?.originalUrl,
      status: res?.statusCode,
      error: err?.message || String(err),
      stack: err?.stack,
    });
  } catch (_) {
    // ignore logging failures
  }

  if (res.headersSent) return next(err);
  return res.status(500).json({ error: "Internal server error", traceId: req?.traceId || null });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`JepsenCloud running on http://localhost:${PORT}`);
  console.log(`Landing: http://localhost:${PORT}/`);
  console.log(`Panel:   http://localhost:${PORT}${PANEL_BASE}/login`);
});

// -------------------------
// DISCORD LOGIN (with retry on session exhaustion)
// -------------------------
(async function loginWithRetry() {
  const MAX_RETRIES = 10;
  const BASE_DELAY = 30_000; // 30 seconds

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await client.login(TOKEN);
      return; // success
    } catch (err) {
      const msg = err?.message || '';
      // Discord session limit: "Not enough sessions remaining … resets at <ISO>"
      const resetMatch = msg.match(/resets at (.+)/);
      if (resetMatch) {
        const resetAt = new Date(resetMatch[1]);
        const waitMs = Math.max(resetAt - Date.now(), 0) + 5_000; // +5 s buffer
        const waitMin = (waitMs / 60_000).toFixed(1);
        console.error(`[Login] Session limit hit (attempt ${attempt}/${MAX_RETRIES}). Waiting ${waitMin} min until ${resetAt.toISOString()}…`);
        await new Promise(r => setTimeout(r, waitMs));
      } else {
        // Generic error — exponential backoff
        const delay = Math.min(BASE_DELAY * 2 ** (attempt - 1), 10 * 60_000);
        console.error(`[Login] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}. Retrying in ${(delay / 1000).toFixed(0)}s…`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error('[Login] All retry attempts exhausted. The web panel is still running. Restart the process later to reconnect Discord.');
})();