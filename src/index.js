// Bot that counts messages and provides statistics for users in a Discord server

// Load environment variables from .env file
require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ChannelType,
  ActivityType,
  PermissionsBitField,
} = require("discord.js");

const {
  ensureHolidayTable,
  getHolidayCommandBuilders,
  handleHolidayCommand,
  startDailyHolidayPosts,
  panelList: holidaysPanelList,
  panelAdd: holidaysPanelAdd,
  panelRemove: holidaysPanelRemove,
} = require("./features/holidays");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const express = require("express");
const { generateMessagesPage } = require("./web/messages-page");
const { generateStatsPage } = require("./web/stats-page");
const { generateAIEngagementPage } = require("./web/ai-engagement-page");
const { generateRateLimiterPage } = require("./web/rate-limiter-page");
const { generateConsecutiveLimiterPage } = require("./web/consecutive-limiter-page");
const { generateCommandsPage } = require("./web/commands-page");
const { generateAccuracyMonitorPage } = require("./web/accuracy-monitor-page");
require("dotenv").config();

// Panel security deps
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcryptjs");

// New feature modules
const { dbRun: dbRunHelper, dbGet: dbGetHelper, dbAll: dbAllHelper } = require("./utils/db-helpers");
const { getUserAnalytics, getServerAnalytics, getFunFact, exportStatsToCSV } = require("./features/analytics");
const { ensureStreakTable, updateStreak, getStreak, getTopStreaks } = require("./features/streaks");
const { ensureMilestoneTable, checkMilestone, getUserMilestones, MILESTONES } = require("./features/milestones");
const { ensureReactionsTable, incrementReactionsGiven, incrementReactionsReceived, getUserReactionStats, getTopReactionsGiven, getTopReactionsReceived } = require("./features/reactions");

const { ensureWeeklyStatsTable, incrementWeeklyCount, decrementWeeklyCount, getWeeklyTopUsers, getUserWeeklyStats } = require("./features/weekly-stats");
const { ensureAIEngagementTables, getEngagementSettings, updateEngagementSettings, tryEngageWithMessage, getEngagementStats } = require("./features/ai-engagement");
const { initializeML, getMLStatus } = require("./features/ml-engine");
const { ensureUserPreferencesTables, getTrainingStats } = require("./features/user-preferences");

// Robust message counting
const {
  incrementMessageCountRobust,
  decrementMessageCountRobust,
  bulkDecrementRobust,
  processErrorQueue,
  cleanupEventLog,
} = require("./features/robust-message-counting");

// Reconciliation
const {
  reconcileAllGuilds,
  selfHealingReconcile,
} = require("./features/reconciliation");

// Message index cleanup
const { cleanupOldMessageIndex } = require("./features/message-index-cleanup");

const {
  ensureRateLimitTables,
  checkRateLimit,
  trackMessage,
  recordViolation,
  getRateLimitConfig,
  setRateLimitConfig,
  getRateLimitStats,
  // Consecutive tracking
  checkConsecutiveLimit,
  trackConsecutiveMessage,
  getLastMessageAuthor,
  resetConsecutiveCount,
  cleanupOldConsecutiveRecords,
  // Strikes & Timeouts
  getViolationStrikes,
  getUserViolationData,
  calculateTimeoutDuration,
  formatTimeoutDuration,
  recordViolationWithStrikes,
  getUsersWithStrikes,
  clearUserStrikes,
  autoResetExpiredStrikes,
  // Countdown
  getCountdownConfig,
  setCountdownConfig,
  updateCountdownLastPosted,
} = require("./features/rate-limiter");

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
function dbRun(sql, params = []) {
  return dbRunHelper(db, sql, params);
}
function dbGet(sql, params = []) {
  return dbGetHelper(db, sql, params);
}
function dbAll(sql, params = []) {
  return dbAllHelper(db, sql, params);
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
  // Stats table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // KV store
  await dbRun(`
    CREATE TABLE IF NOT EXISTS bot_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // User cache for storing Discord usernames (not IDs) for display
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_cache (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar_url TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // Index for efficient username lookups
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_user_cache_guild_user 
    ON user_cache(guild_id, user_id)
  `);

  // message_index for robust decrement on delete events (partial messages)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS message_index (
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, message_id)
    )
  `);

  // Best-effort add channel_id to existing message_index
  try {
    await dbRun(`ALTER TABLE message_index ADD COLUMN channel_id TEXT`);
  } catch (_) {
    // ignore if column already exists
  }

  // Manual adjustments table (preserve admin edits across backfills)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_adjustments (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      adjustment INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // Panel sent items (messages + embeds)
  await dbRun(`
    CREATE TABLE IF NOT EXISTS panel_sent_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_key TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('message', 'embed')),
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      content TEXT,
      title TEXT,
      description TEXT,
      color TEXT,
      footer TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE (bot_key, channel_id, message_id)
    )
  `);

  // Helpful indexes for listing/searching
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_panel_sent_items_updated ON panel_sent_items(updated_at)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_panel_sent_items_channel ON panel_sent_items(channel_id)`);

  // Holidays manual table
  await ensureHolidayTable(db);

  // New feature tables
  await ensureStreakTable(db);
  await ensureMilestoneTable(db);
  await ensureReactionsTable(db);
  await ensureWeeklyStatsTable(db);
  await ensureAIEngagementTables(db);
  await ensureUserPreferencesTables(db);
  await ensureRateLimitTables(db);

  // Panel messages table for new message/embed management
  await dbRun(`
    CREATE TABLE IF NOT EXISTS panel_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_key TEXT NOT NULL,
      channel_id TEXT,
      content TEXT,
      embed TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
      discord_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ===== ROBUST MESSAGE COUNTING TABLES =====
  
  // Enable WAL mode for better concurrency
  await dbRun(`PRAGMA journal_mode = WAL`);
  
  // Event log for admin monitoring
  await dbRun(`
    CREATE TABLE IF NOT EXISTS message_count_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      guild_id TEXT,
      user_id TEXT,
      message_id TEXT,
      details TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
  
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_events_timestamp 
    ON message_count_events(timestamp DESC)
  `);
  
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_events_type 
    ON message_count_events(event_type, timestamp DESC)
  `);
  
  // Error queue for failed operations
  await dbRun(`
    CREATE TABLE IF NOT EXISTS message_count_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_id TEXT,
      operation TEXT NOT NULL CHECK (operation IN ('increment', 'decrement')),
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_errors_retry 
    ON message_count_errors(retry_count, created_at)
  `);
  
  // Add index for message_index cleanup
  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_message_index_created 
    ON message_index(created_at)
  `);

  console.log("DB ready:", dbPath);
}

initDb().catch((e) => {
  console.error("DB init failed:", e);
  process.exit(1);
});

// -------------------------
// STATS: increment/decrement + helpers
// -------------------------
function incrementMessageCount(guildId, userId) {
  db.run(
    `
    INSERT INTO user_stats (guild_id, user_id, message_count)
    VALUES (?, ?, 1)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET message_count = message_count + 1
  `,
    [guildId, userId],
    (err) => {
      if (err) console.error("Error incrementing message count:", err);
    }
  );
}

// Decrement (clamp at 0)
function decrementMessageCount(guildId, userId, by = 1) {
  const n = Number.isFinite(by) && by > 0 ? Math.floor(by) : 1;
  db.run(
    `
    UPDATE user_stats
    SET message_count = CASE
      WHEN message_count - ? < 0 THEN 0
      ELSE message_count - ?
    END
    WHERE guild_id = ? AND user_id = ?
  `,
    [n, n, guildId, userId],
    (err) => {
      if (err) console.error("Error decrementing message count:", err);
    }
  );
}

function getUserMessageCount(guildId, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT message_count
      FROM user_stats
      WHERE guild_id = ? AND user_id = ?
    `,
      [guildId, userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.message_count : 0);
      }
    );
  });
}

function resetStats() {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM user_stats`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// -------------------------
// LEADERBOARD CACHING
// -------------------------
const leaderboardCache = new Map(); // guildId:limit -> { data, timestamp }
const CACHE_TTL = 60000; // 60 seconds

function getCachedLeaderboard(guildId, limit) {
  const key = `${guildId}:${limit}`;
  const cached = leaderboardCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedLeaderboard(guildId, limit, data) {
  const key = `${guildId}:${limit}`;
  leaderboardCache.set(key, { data, timestamp: Date.now() });

  // Cleanup old entries (simple LRU)
  if (leaderboardCache.size > 100) {
    const firstKey = leaderboardCache.keys().next().value;
    leaderboardCache.delete(firstKey);
  }
}

function getTopUsers(guildId, limit) {
  // Optimized: fetch slightly more than needed instead of 3x
  const fetchLimit = limit + 10;
  return new Promise((resolve, reject) => {
    db.all(
      `
      SELECT user_id, message_count
      FROM user_stats
      WHERE guild_id = ?
      ORDER BY message_count DESC
      LIMIT ?
    `,
      [guildId, fetchLimit],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -------------------------
// SMALL UTILITIES
// -------------------------
function ruPlural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// Returns tenure as "X лет Y месяцев" (calendar-like, not just days)
function formatTimeOnServer(joinedAt, now = new Date()) {
  if (!(joinedAt instanceof Date) || Number.isNaN(joinedAt.getTime())) return "Unknown";

  let years = now.getFullYear() - joinedAt.getFullYear();
  let months = now.getMonth() - joinedAt.getMonth();

  // If we haven't reached the join "day" yet this month, subtract one month
  if (now.getDate() < joinedAt.getDate()) months -= 1;

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  years = Math.max(0, years);
  months = Math.max(0, months);

  const parts = [];
  if (years > 0) parts.push(`${years} ${ruPlural(years, "год", "года", "лет")}`);
  parts.push(`${months} ${ruPlural(months, "месяц", "месяца", "месяцев")}`);

  return parts.join(" ");
}

// Presence rotation (optional, safe)
const STATUS_ROTATION_ENABLED = (process.env.STATUS_ROTATION_ENABLED || "true").toLowerCase() === "true";
const STATUS_ROTATION_INTERVAL_MINUTES = Number.parseInt(process.env.STATUS_ROTATION_INTERVAL_MINUTES || "35", 10);

const STATUS_POOL = [
  { type: ActivityType.Playing, name: "GTA: San Andreas" },
  { type: ActivityType.Playing, name: "SAMP-RP: выживание в чате" },
  { type: ActivityType.Playing, name: "рольплей на максимум" },
  { type: ActivityType.Playing, name: "с /top10" },
  { type: ActivityType.Competing, name: "за топ активности" },
  { type: ActivityType.Watching, name: "за движем на сервере" },
  { type: ActivityType.Watching, name: "за заявками и тикетами" },
  { type: ActivityType.Watching, name: "за порядком в каналах" },
  { type: ActivityType.Listening, name: "радио в Discord" },
  { type: ActivityType.Listening, name: "Radio Samp-Rp" },
  { type: ActivityType.Listening, name: "ваши голосовые истории" },

  { type: ActivityType.Watching, name: "статистику сообщений" },
  { type: ActivityType.Playing, name: "в поиске спама" },
  { type: ActivityType.Competing, name: "кто заберёт топ-1 сегодня" },
  { type: ActivityType.Playing, name: "с /top5" },
  { type: ActivityType.Playing, name: "с /userstats" },
  { type: ActivityType.Watching, name: "как растёт активность" },

  { type: ActivityType.Watching, name: "кто опять пингует @everyone" },
  { type: ActivityType.Playing, name: "в «кто последний — тот валидатор»" },
  { type: ActivityType.Listening, name: "тишину перед бурей" },
  { type: ActivityType.Watching, name: "как вы набиваете сообщения" },
  { type: ActivityType.Playing, name: "в «+1 к активности»" },

  { type: ActivityType.Listening, name: "новогодние хиты" },
  { type: ActivityType.Watching, name: "как падает снег за окном" },
  { type: ActivityType.Playing, name: "в «найди мандаринку»" },
  { type: ActivityType.Playing, name: "с горячим какао" },
  { type: ActivityType.Listening, name: "Jingle Bells (тихо)" },
  { type: ActivityType.Watching, name: "как вы готовитесь к праздникам" },
  { type: ActivityType.Playing, name: "в «елка или сосна?»" },
  { type: ActivityType.Competing, name: "за звание Гринча" },

  { type: ActivityType.Watching, name: "за вашим настроением" },
  { type: ActivityType.Playing, name: "в «ещё 5 минут…»" },
  { type: ActivityType.Listening, name: "ваши идеи для ивентов" },
];

async function setRandomPresence(client) {
  if (!client?.user) return;
  const pick = STATUS_POOL[Math.floor(Math.random() * STATUS_POOL.length)];
  try {
    client.user.setPresence({
      status: "online",
      activities: [pick],
    });
  } catch (e) {
    console.warn("Presence update failed:", e?.message || e);
  }
}

// message_index: store message_id -> user_id (so deletes can decrement even if partial)
async function indexMessage(guildId, messageId, userId, channelId) {
  try {
    await dbRun(
      `
      INSERT OR IGNORE INTO message_index (guild_id, message_id, user_id, channel_id)
      VALUES (?, ?, ?, ?)
    `,
      [guildId, messageId, userId, channelId]
    );
  } catch {}
}

// Cache user's Discord username for panel display
async function cacheUserUsername(guildId, userId, username, avatarUrl = null) {
  try {
    await dbRun(
      `
      INSERT INTO user_cache (guild_id, user_id, username, avatar_url, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(guild_id, user_id)
      DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url, updated_at = datetime('now')
    `,
      [guildId, userId, username, avatarUrl]
    );
  } catch (err) {
    // Non-fatal - if caching fails, counting still works
    console.warn(`[Cache] Failed to cache username for user ${userId}:`, err.message);
  }
}
async function lookupIndexedAuthor(guildId, messageId) {
  try {
    const row = await dbGet(
      `SELECT user_id FROM message_index WHERE guild_id = ? AND message_id = ?`,
      [guildId, messageId]
    );
    return row ? row.user_id : null;
  } catch {
    return null;
  }
}

async function removeIndexedMessage(guildId, messageId) {
  try {
    await dbRun(`DELETE FROM message_index WHERE guild_id = ? AND message_id = ?`, [guildId, messageId]);
  } catch {}
}

async function lookupIndexedAuthorsBulk(guildId, messageIds) {
  const out = new Map(); // user_id -> count
  const chunkSize = 400;

  for (let i = 0; i < messageIds.length; i += chunkSize) {
    const chunk = messageIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await dbAll(
      `
      SELECT user_id, COUNT(*) as c
      FROM message_index
      WHERE guild_id = ? AND message_id IN (${placeholders})
      GROUP BY user_id
    `,
      [guildId, ...chunk]
    );
    for (const r of rows) out.set(r.user_id, (out.get(r.user_id) || 0) + (r.c || 0));
  }

  return out;
}

async function removeIndexedBulk(guildId, messageIds) {
  const chunkSize = 400;
  for (let i = 0; i < messageIds.length; i += chunkSize) {
    const chunk = messageIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    await dbRun(
      `
      DELETE FROM message_index
      WHERE guild_id = ? AND message_id IN (${placeholders})
    `,
      [guildId, ...chunk]
    );
  }
}

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


// -------------------------
// SLASH COMMANDS
// -------------------------
const commands = [
  new SlashCommandBuilder().setName("mystats").setDescription("Show your message stats in this server."),
  new SlashCommandBuilder()
    .setName("userstats")
    .setDescription("Show message stats for another user.")
    .addUserOption((option) => option.setName("user").setDescription("User to view").setRequired(true)),
  new SlashCommandBuilder().setName("top5").setDescription("Show top 5 users by message count in this server."),
  new SlashCommandBuilder().setName("top10").setDescription("Show top 10 users by message count in this server."),
  new SlashCommandBuilder()
    .setName("backfill")
    .setDescription("Backfill message history for this server (owner only, may take a long time)."),
  new SlashCommandBuilder().setName("demoembed").setDescription("Send an example embed and edit it after 10 seconds."),
  new SlashCommandBuilder()
    .setName("synccommands")
    .setDescription("Re-register slash commands for this server (owner only)."),

  // New commands
  new SlashCommandBuilder().setName("weekly").setDescription("Show weekly leaderboard (resets every Monday)."),
  new SlashCommandBuilder()
    .setName("streak")
    .setDescription("View message streak for you or another user.")
    .addUserOption((option) => option.setName("user").setDescription("User to check (optional)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("reactions")
    .setDescription("View reaction leaderboard.")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Type of reactions")
        .setRequired(false)
        .addChoices({ name: "Given", value: "given" }, { name: "Received", value: "received" })
    ),
  new SlashCommandBuilder()
    .setName("export")
    .setDescription("Export server stats to CSV (owner only)."),
  new SlashCommandBuilder()
    .setName("countdown")
    .setDescription("Обратный отсчёт до Нового Года 2026!"),
  new SlashCommandBuilder()
    .setName("mystrikes")
    .setDescription("Просмотреть ваши текущие нарушения и страйки"),


  // Holidays
  ...getHolidayCommandBuilders(),
].map((cmd) => cmd.toJSON());

async function registerGuildCommands(guildId) {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    console.log(`Registering slash commands for guild ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
    console.log(`Slash commands registered for guild ${guildId}.`);
  } catch (error) {
    console.error(`Error registering slash commands for guild ${guildId}:`, error);
  }
}

// -------------------------
// BACKFILL
// -------------------------
async function backfillGuild(guild) {
  console.log(`Starting backfill for guild: ${guild.name} (${guild.id})`);

  await resetStats();
  console.log("Existing stats cleared.");

  const channels = await guild.channels.fetch();

  for (const [, channel] of channels) {
    if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;
    if (channel.isThread && channel.isThread()) continue;

    console.log(`Backfilling channel: #${channel.name} (${channel.id})`);

    let lastId = null;
    let processedInChannel = 0;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      let messages;
      try {
        messages = await channel.messages.fetch(options);
      } catch (err) {
        console.error(`Error fetching messages in #${channel.name} (${channel.id}):`, err.message);
        break;
      }

      if (messages.size === 0) break;

      for (const message of messages.values()) {
        if (!message.guild) continue;
        if (!message.author) continue;
        if (message.author.bot) continue;

        incrementMessageCount(message.guild.id, message.author.id);
        await indexMessage(message.guild.id, message.id, message.author.id, message.channelId);

        processedInChannel++;
      }

      lastId = messages.last().id;
      await sleep(500);
    }

    console.log(`Finished channel #${channel.name} (${channel.id}). Messages counted: ${processedInChannel}`);
    await sleep(1000);
  }

  console.log("Backfill complete.");
}

// -------------------------
// DISCORD EVENTS
// -------------------------
let holidaysScheduler = null;

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag} (JepsenCloud bot ready).`);

  // Initialize ML models
  console.log("[Bot] Initializing ML engine...");
  await initializeML();
  const mlStatus = getMLStatus();
  console.log(`[Bot] ML Status:`, mlStatus);

  // Start periodic cleanup tasks
  console.log("[Bot] Starting cleanup schedulers...");
  
  // Cleanup old consecutive message tracking records (every hour)
  setInterval(async () => {
    try {
      const deleted = await cleanupOldConsecutiveRecords(db);
      if (deleted > 0) {
        console.log(`[Cleanup] Removed ${deleted} old consecutive tracking records`);
      }
    } catch (err) {
      console.error("[Cleanup] Error cleaning consecutive records:", err);
    }
  }, 60 * 60 * 1000); // Every hour

  // Auto-reset expired strikes (every hour)
  setInterval(async () => {
    try {
      const reset = await autoResetExpiredStrikes(db);
      if (reset > 0) {
        console.log(`[Cleanup] Auto-reset ${reset} expired strike records`);
      }
    } catch (err) {
      console.error("[Cleanup] Error resetting strikes:", err);
    }
  }, 60 * 60 * 1000); // Every hour

  // ===== ROBUST COUNTING MAINTENANCE =====
  
  // Process error queue (every 5 minutes)
  setInterval(async () => {
    try {
      const result = await processErrorQueue(db);
      if (result.processed > 0) {
        console.log(`[Error Queue] Processed ${result.processed}, succeeded: ${result.succeeded}`);
      }
    } catch (err) {
      console.error("[Error Queue] Processing failed:", err);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // Cleanup old event logs (daily at 2 AM)
  const scheduleEventCleanup = () => {
    const now = new Date();
    const next2AM = new Date(now);
    next2AM.setHours(2, 0, 0, 0);
    if (next2AM <= now) {
      next2AM.setDate(next2AM.getDate() + 1);
    }
    const msUntil2AM = next2AM.getTime() - now.getTime();

    setTimeout(async () => {
      try {
        await cleanupEventLog(db);
        console.log("[Event Log] Daily cleanup complete");
      } catch (err) {
        console.error("[Event Log] Cleanup failed:", err);
      }
      // Schedule next cleanup
      setInterval(async () => {
        try {
          await cleanupEventLog(db);
          console.log("[Event Log] Daily cleanup complete");
        } catch (err) {
          console.error("[Event Log] Cleanup failed:", err);
        }
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntil2AM);
  };
  scheduleEventCleanup();

  // Self-healing reconciliation (every 15 minutes)
  setInterval(async () => {
    try {
      for (const guild of client.guilds.cache.values()) {
        await selfHealingReconcile(db, guild.id);
      }
    } catch (err) {
      console.error("[Self-Heal] Error:", err);
    }
  }, 15 * 60 * 1000); // Every 15 minutes

  // Daily full reconciliation (3 AM)
  const scheduleReconciliation = () => {
    const now = new Date();
    const next3AM = new Date(now);
    next3AM.setHours(3, 0, 0, 0);
    if (next3AM <= now) {
      next3AM.setDate(next3AM.getDate() + 1);
    }
    const msUntil3AM = next3AM.getTime() - now.getTime();

    console.log(`[Reconcile] Next full reconciliation scheduled for ${next3AM.toLocaleString()}`);

    setTimeout(async () => {
      try {
        await reconcileAllGuilds(db, client);
      } catch (err) {
        console.error("[Reconcile] Failed:", err);
      }
      // Schedule daily reconciliation
      setInterval(async () => {
        try {
          await reconcileAllGuilds(db, client);
        } catch (err) {
          console.error("[Reconcile] Failed:", err);
        }
      }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntil3AM);
  };
  scheduleReconciliation();

  // Weekly message index cleanup (Sundays at 4 AM)
  const scheduleIndexCleanup = () => {
    const now = new Date();
    const nextSunday4AM = new Date(now);
    
    // Set to next Sunday
    const daysUntilSunday = (7 - now.getDay()) % 7;
    nextSunday4AM.setDate(now.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday));
    nextSunday4AM.setHours(4, 0, 0, 0);
    
    if (nextSunday4AM <= now) {
      nextSunday4AM.setDate(nextSunday4AM.getDate() + 7);
    }
    
    const msUntilSunday = nextSunday4AM.getTime() - now.getTime();

    console.log(`[Index Cleanup] Next cleanup scheduled for ${nextSunday4AM.toLocaleString()}`);

    setTimeout(async () => {
      try {
        await cleanupOldMessageIndex(db, 90); // Keep 90 days
      } catch (err) {
        console.error("[Index Cleanup] Failed:", err);
      }
      // Schedule weekly cleanup
      setInterval(async () => {
        try {
          await cleanupOldMessageIndex(db, 90);
        } catch (err) {
          console.error("[Index Cleanup] Failed:", err);
        }
      }, 7 * 24 * 60 * 60 * 1000); // Every 7 days
    }, msUntilSunday);
  };
  scheduleIndexCleanup();

  console.log("[Bot] Robust counting schedulers started ✓");

  // Start holidays scheduler (09:00 MSK to HOLIDAYS_CHANNEL_ID)
holidaysScheduler = startDailyHolidayPosts({
  client,
  db,
  channelId: process.env.HOLIDAYS_CHANNEL_ID || "",
  hour: Number.parseInt(process.env.HOLIDAYS_POST_HOUR || "9", 10),
  minute: Number.parseInt(process.env.HOLIDAYS_POST_MINUTE || "0", 10),
  // MSK is UTC+3 (180). Override if needed.
  tzOffsetMinutes: Number.parseInt(process.env.HOLIDAYS_TZ_OFFSET_MINUTES || "180", 10),
});

  // Start countdown auto-posting scheduler
  console.log("[Bot] Starting coun tdown scheduler...");
  setInterval(async () => {
    try {
      // Check all guilds for countdown configuration
      for (const guild of client.guilds.cache.values()) {
        const config = await getCountdownConfig(db, guild.id);
        
        if (!config.enabled || !config.channel_id) continue;

        // Calculate current time in configured timezone
        const now = new Date();
        const offsetMs = config.timezone_offset * 60 * 1000;
        const localTime = new Date(now.getTime() + offsetMs);
 
        const currentHour = localTime.getUTCHours();
        const currentMinute = localTime.getUTCMinutes();

        // Check if it's time to post (within the current minute)
        if (currentHour === config.hour && currentMinute === config.minute) {
          // Check if we haven't posted today already
          const lastPosted = config.last_posted || 0;
          const lastPostedDate = new Date(lastPosted * 1000);
          const todayStart = new Date(localTime);
          todayStart.setUTCHours(0, 0, 0, 0);

          if (lastPostedDate < todayStart) {
            // Time to post!
            console.log(`[Countdown] Posting to guild ${guild.id} at ${currentHour}:${currentMinute}`);

            try {
              const channel = await client.channels.fetch(config.channel_id);
              if (channel && channel.isTextBased()) {
                const newYear = new Date("2026-01-01T00:00:00+03:00");
                const diff = newYear.getTime() - now.getTime();

                let description;
                if (diff <= 0) {
                  description = "С Новым Годом! 🎉";
                } else {
                  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                  description = `**${days}** ${ruPlural(days, "день", "дня", "дней")}, **${hours}** ${ruPlural(hours, "час", "часа", "часов")}, **${minutes}** ${ruPlural(minutes, "минута", "минуты", "минут")}, **${seconds}** ${ruPlural(seconds, "секунда", "секунды", "секунд")}`;
                }

                const embed = new EmbedBuilder()
                  .setTitle("🎆 Обратный отсчёт до Нового Года 2026!")
                  .setDescription(description)
                  .setColor(0xfbbf24)
                  .setTimestamp();

                await channel.send({ embeds: [embed] });
                await updateCountdownLastPosted(db, guild.id);
                console.log(`[Countdown] Successfully posted to guild ${guild.id}`);
              }
            } catch (err) {
              console.error(`[Countdown] Failed to post to guild ${guild.id}:`, err.message);
            }
          }
        }
      }
    } catch (err) {
      console.error("[Countdown] Scheduler error:", err);
    }
  }, 60 * 1000); // Check every minute

  for (const guild of client.guilds.cache.values()) {
    await registerGuildCommands(guild.id);
  }

  if (STATUS_ROTATION_ENABLED) {
    await setRandomPresence(client);
    const intervalMs = Math.max(5, STATUS_ROTATION_INTERVAL_MINUTES) * 60 * 1000;
    setInterval(() => void setRandomPresence(client), intervalMs);
  }
});

client.on("guildCreate", async (guild) => {
  console.log(`Joined new guild: ${guild.name} (${guild.id})`);
  await registerGuildCommands(guild.id);
});

// Count new messages + index them + new features
client.on("messageCreate", async (message) => {
  try {
    if (!message.guild) return;
    if (!message.author || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const channelId = message.channel.id;

    // ========================================
    // CONSECUTIVE MESSAGE LIMITING
    // ========================================
    // Ensure we have member data so role-based limits apply
    let member = message.member;
    if (!member) {
      try {
        member = await message.guild.members.fetch(userId);
      } catch {
        // If fetch fails, continue with empty roles
      }
    }
    const userRoles = member?.roles?.cache?.map(r => r.id) || [];
    
    // Check if different user sent last message (to reset consecutive count)
    const lastAuthor = await getLastMessageAuthor(db, guildId, channelId);
    if (lastAuthor && lastAuthor !== userId) {
      await resetConsecutiveCount(db, guildId, channelId, lastAuthor);
    }

    // Check consecutive message limit
    const consecutiveCheck = await checkConsecutiveLimit(db, guildId, channelId, userId, userRoles);
    
    if (!consecutiveCheck.allowed) {
      // Check if admins should be ignored
      if (consecutiveCheck.config?.ignore_admins !== false) {
        const member = message.member;
        if (member && (member.permissions.has('Administrator') || member.permissions.has('ManageGuild'))) {
          // Admin is exempt - allow message
          await trackConsecutiveMessage(db, guildId, channelId, userId, message.id, Math.floor(Date.now() / 1000));
          return;
        }
      }
      
      console.log(`[Consecutive Limit] User ${userId} exceeded consecutive limit in ${channelId}: ${consecutiveCheck.current + 1}/${consecutiveCheck.limit}`);
      
      try {
        // Delete message
        await message.delete();
      } catch (err) {
        console.warn(`[Consecutive Limit] Could not delete message:`, err.message);
      }

      try {
        // DM warning to user
        await message.author.send(`⚠️ Не флудите! Вы отправили ${consecutiveCheck.current + 1} сообщений подряд. Лимит: ${consecutiveCheck.limit}. Подождите, пока другие пользователи ответят.`);
      } catch (err) {
        console.warn(`[Consecutive Limit] Could not DM user ${userId}:`, err.message);
      }

      // Record violation with strikes
      await recordViolationWithStrikes(db, guildId, channelId, userId, userRoles, consecutiveCheck.config);

      // Check total strikes and apply progressive timeout
      const totalStrikes = await getViolationStrikes(db, guildId, userId);
      
      if (consecutiveCheck.config?.timeouts_enabled !== false && totalStrikes >= 5) {
        const timeoutDurationPerStrike = consecutiveCheck.config?.timeout_duration_per_strike || 1;
        const timeoutMinutes = calculateTimeoutDuration(totalStrikes, consecutiveCheck.config || {});
        const customTimeoutMinutes = totalStrikes * timeoutDurationPerStrike;
        const cappedMinutes = Math.min(customTimeoutMinutes, 120); // Cap at 2 hours
        const timeoutMs = cappedMinutes * 60 * 1000;
        
        try {
          await message.member.timeout(timeoutMs, `Rate limit violation: ${totalStrikes} strikes`);
          const formattedTime = formatTimeoutDuration(cappedMinutes);
          await message.author.send(`⏱️ Вы получили тайм-аут на ${formattedTime} за ${totalStrikes} нарушений лимита сообщений.`);
          console.log(`[Timeout] Applied ${cappedMinutes} min timeout to user ${userId} (${totalStrikes} strikes)`);
        } catch (err) {
          console.warn(`[Timeout] Could not timeout user ${userId}:`, err.message);
        }
      }

      return; // Stop processing this message
    }

    // Track this message in consecutive sequence
    await trackConsecutiveMessage(db, guildId, channelId, userId, message.id, Math.floor(Date.now() / 1000));

    // ========================================
    // TIME-WINDOW RATE LIMITING
    // ========================================
    const rateLimitCheck = await checkRateLimit(db, guildId, channelId, userId, userRoles);
    
    if (!rateLimitCheck.allowed) {
      console.log(`[Rate Limit] User ${userId} exceeded limit in ${channelId}`);
      
      // Get config to determine action
      const config = rateLimitCheck.config;
      
      try {
        // DM warning to user
        const warningMsg = config.warning_message || "You have exceeded the message limit for this channel.";
        await message.author.send(`⚠️ ${warningMsg}\n\nLimit: ${rateLimitCheck.limit} messages per ${config.time_window_minutes} minutes.\nYour count: ${rateLimitCheck.current + 1}`);
      } catch (err) {
        console.warn(`[Rate Limit] Could not DM user ${userId}:`, err.message);
      }

      // Delete message if action is 'delete'
      if (config.action === 'delete') {
        try {
          await message.delete();
        } catch (err) {
          console.warn(`[Rate Limit] Could not delete message:`, err.message);
        }
      }

      // Record violation
      await recordViolation(db, guildId, channelId, userId);
      return; // Stop processing this message
    }

    // Track message for rate limiting
    if (rateLimitCheck.config) {
      await trackMessage(db, guildId, channelId, userId, message.id);
    }

    // Cache user's Discord username for panel display (async, non-blocking)
    cacheUserUsername(guildId, userId, message.author.username, message.author.avatarURL()).catch(err => {
      // Non-fatal error - continue with message counting
    });
    // Core stats tracking - ROBUST VERSION with transaction + retry
    await incrementMessageCountRobust(db, guildId, userId, message.id, message.channelId);


    // New features: streak, weekly, milestones
    await updateStreak(db, guildId, userId);
    await incrementWeeklyCount(db, guildId, userId);

    // Check for milestone celebrations
    const currentCount = await getUserMessageCount(guildId, userId);
    const milestone = await checkMilestone(db, guildId, userId, currentCount);

    if (milestone) {
      // Celebrate milestone!
      const embed = new EmbedBuilder()
        .setTitle("🎉 Milestone Achieved!")
        .setDescription(`<@${userId}> has reached **${milestone.toLocaleString()}** messages!`)
        .setColor(0xffd700)
        .setTimestamp();

      try {
        await message.channel.send({ embeds: [embed] });
      } catch {}
    }



    // AI engagement
    const aiSettings = await getEngagementSettings(db, guildId);
    if (aiSettings.enabled) {
      await tryEngageWithMessage(db, message, aiSettings);
    }
  } catch (e) {
    console.error("messageCreate handler error:", e);
  }
});

// Robust: subtract if a counted message gets deleted
client.on("messageDelete", async (message) => {
  try {
    if (!message) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const msgId = message.id;

    // Try to get author from message object first
    if (message.author && !message.author.bot) {
      await decrementMessageCountRobust(db, guildId, message.author.id, msgId);
      await decrementWeeklyCount(db, guildId, message.author.id); // Also decrement weekly
      return;
    }

    // If author not available (partial message), lookup from index
    const userId = await lookupIndexedAuthor(guildId, msgId);
    if (userId) {
      await decrementMessageCountRobust(db, guildId, userId, msgId);
      await decrementWeeklyCount(db, guildId, userId); // Also decrement weekly
    }
  } catch (err) {
    console.error("messageDelete handler error:", err);
  }
});

// Track reactions given and received
client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;

    // Fetch partial reaction if needed
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    if (!reaction.message.guild) return;

    const guildId = reaction.message.guild.id;
    const reactorId = user.id;

    // Track reaction given
    await incrementReactionsGiven(db, guildId, reactorId);

    // Track reaction received (if message author exists)
    if (reaction.message.author && !reaction.message.author.bot) {
      await incrementReactionsReceived(db, guildId, reaction.message.author.id);
    }
  } catch (err) {
    console.error("messageReactionAdd handler error:", err);
  }
});

// Robust: bulk delete
client.on("messageDeleteBulk", async (messages) => {
  try {
    if (!messages || messages.size === 0) return;

    const first = messages.first();
    const guildId = first?.guild?.id;
    if (!guildId) return;

    const userCounts = new Map(); // userId -> count
    const allMessageIds = [];

    // Count messages per user
    for (const msg of messages.values()) {
      if (!msg?.id) continue;
      allMessageIds.push(msg.id);

      if (msg.author && !msg.author.bot) {
        userCounts.set(msg.author.id, (userCounts.get(msg.author.id) || 0) + 1);
      }
    }

    // For messages without author (partial), lookup from index
    const unknownIds = [];
    for (const msg of messages.values()) {
      if (!msg?.id) continue;
      if (!msg.author || msg.author.bot) {
        unknownIds.push(msg.id);
      }
    }

    if (unknownIds.length > 0) {
      const indexed = await lookupIndexedAuthorsBulk(guildId, unknownIds);
      for (const [userId, count] of indexed.entries()) {
        userCounts.set(userId, (userCounts.get(userId) || 0) + count);
      }
    }

    // Use robust bulk decrement (atomic transaction)
    if (userCounts.size > 0 || allMessageIds.length > 0) {
      await bulkDecrementRobust(db, guildId, userCounts, allMessageIds);
    }
  } catch (err) {
    console.error("messageDeleteBulk handler error:", err);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Holidays commands
  if (
    commandName === "holidays" ||
    commandName === "holidays-test" ||
    commandName === "holidays-next" ||
    commandName === "holiday"
  ) {
    await handleHolidayCommand(interaction, {
      ownerId: OWNER_ID,
      db,
      scheduler: holidaysScheduler,
    });
    return;
  }

  if (commandName === "mystats") {
    const member = interaction.member;
    const user = interaction.user;

    const analytics = await getUserAnalytics(db, interaction.guild.id, user.id);
    const streak = await getStreak(db, interaction.guild.id, user.id);
    const weeklyCount = await getUserWeeklyStats(db, interaction.guild.id, user.id);
    const reactions = await getUserReactionStats(db, interaction.guild.id, user.id);
    const funFact = getFunFact(analytics.count);

    const joinedAt = member.joinedAt;
    let joinedText = "Unknown";
    let timeOnServer = "Unknown";

    if (joinedAt) {
      joinedText = joinedAt.toISOString().split("T")[0];
      timeOnServer = formatTimeOnServer(joinedAt, new Date());
    }

    const embed = new EmbedBuilder()
      .setTitle("📊 Статистика Сообщений")
      .setDescription(`Статистика для ${user.tag}`)
      .addFields(
        { name: "💬 Всего сообщений", value: `${analytics.count.toLocaleString()}`, inline: true },
        { name: "📅 Эта неделя", value: `${weeklyCount}`, inline: true },
        { name: "🏆 Ранг", value: `#${analytics.rank} из ${analytics.totalUsers}`, inline: true },
        { name: "📈 Percentile", value: `Top ${100 - analytics.percentile}%`, inline: true },
        { name: "🔥 Current Streak", value: `${streak.currentStreak} ${ruPlural(streak.currentStreak, "день", "дня", "дней")}`, inline: true },
        { name: "⭐ Best Streak", value: `${streak.longestStreak} ${ruPlural(streak.longestStreak, "день", "дня", "дней")}`, inline: true },
        { name: "👍 Reactions Given", value: `${reactions.given}`, inline: true },
        { name: "❤️ Reactions Received", value: `${reactions.received}`, inline: true },
        { name: "📆 На сервере", value: `${timeOnServer}`, inline: true },
        { name: "🎯 Fun Fact", value: funFact, inline: false }
      )
      .setColor(0x00aeff)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else if (commandName === "userstats") {
    const targetUser = interaction.options.getUser("user");
    const targetMember =
      interaction.guild.members.cache.get(targetUser.id) ||
      (await interaction.guild.members.fetch(targetUser.id).catch(() => null));

    if (!targetMember) {
      return interaction.reply({ content: "Не удалось найти этого пользователя на сервере.", flags: 64 });
    }

    const count = await getUserMessageCount(interaction.guild.id, targetUser.id);

    const joinedAt = targetMember.joinedAt;
    let joinedText = "Unknown";
    let timeOnServer = "Unknown";

    if (joinedAt) {
      joinedText = joinedAt.toISOString().split("T")[0];
      timeOnServer = formatTimeOnServer(joinedAt, new Date());
    }

    const embed = new EmbedBuilder()
      .setTitle("Статистика пользователя")
      .setDescription(`Статистика для ${targetUser.tag}`)
      .addFields(
        { name: "Сообщений", value: `${count}`, inline: true },
        { name: "Дата входа на сервер", value: `${joinedText}`, inline: true },
        { name: "На сервере", value: `${timeOnServer}`, inline: true }
      )
      .setColor(0xffc300)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else if (commandName === "top5" || commandName === "top10") {
    const desiredLimit = commandName === "top5" ? 5 : 10;

    await interaction.deferReply();

    const rows = await getTopUsers(interaction.guild.id, desiredLimit);
    const visible = [];

    for (const row of rows) {
      if (visible.length >= desiredLimit) break;

      let member;
      try {
        member = await interaction.guild.members.fetch(row.user_id);
      } catch {
        continue;
      }

      visible.push({ member, count: row.message_count });
    }

    if (!visible.length) {
      await interaction.editReply({
        content: "Пока нет подходящих пользователей для отображения (все из топа покинули сервер или нет данных).",
      });
      return;
    }

    const lines = visible.map((entry, index) => {
      const label = entry.member.user.tag;
      return `\`${index + 1}.\` **${label}** — ${entry.count} сообщений`;
    });

    const desc =
      lines.join("\n") +
      "\n\n*Учтены все сообщения. Показаны только пользователи, которые всё ещё находятся на сервере.*" +
      "\n*Подсчёт может быть неточным: для проверки используй поиск по пользователю.*";

    const embed = new EmbedBuilder()
      .setTitle(desiredLimit === 5 ? "Топ 5 по количеству сообщений" : "Топ 10 по количеству сообщений")
      .setDescription(desc)
      .setColor(0x8b5cf6)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else if (commandName === "backfill") {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: "Эта команда доступна только владельцу бота.", flags: 64 });
    }

    await interaction.reply({
      content: "Запускаю сбор истории сообщений. Это может занять продолжительное время. Прогресс смотри в логах бота.",
      flags: 64,
    });

    await backfillGuild(interaction.guild);

    await interaction.followUp({ content: "История сообщений собрана.", flags: 64 });
  } else if (commandName === "demoembed") {
    const initialEmbed = new EmbedBuilder()
      .setTitle("Пример Embed от Samp-Rp")
      .setDescription("Это первоначальное сообщение. Через 10000 миллисекунд оно изменится.")
      .setColor(0x2ecc71)
      .setTimestamp();

    const editedEmbed = new EmbedBuilder()
      .setTitle("Обновлённый Embed Samp-Rp")
      .setDescription("Сообщение было отредактировано через 10000 миллисекунд.")
      .setColor(0xe74c3c)
      .setTimestamp();

    await interaction.reply({ embeds: [initialEmbed], fetchReply: true });

    setTimeout(async () => {
      try {
        await interaction.editReply({ embeds: [editedEmbed] });
      } catch (err) {
        console.error("Error editing embed:", err);
      }
    }, 10000);
  } else if (commandName === "synccommands") {
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: "Эта команда доступна только владельцу бота.", flags: 64 });
  }

  // Registering commands can take >3s, so defer to avoid "Unknown interaction".
  await interaction.deferReply({ flags: 64 });

  try {
    await registerGuildCommands(interaction.guild.id);
    await interaction.editReply({ content: "Slash-команды перераегистрированы для этого сервера." });
  } catch (err) {
    console.error("synccommands error:", err);
    await interaction.editReply({ content: "Ошибка при регистрации slash-команд. Проверь логи." });
  }
} else if (commandName === "weekly") {
    await interaction.deferReply();

    const rows = await getWeeklyTopUsers(db, interaction.guild.id, 10);
    const visible = [];

    for (const row of rows) {
      if (visible.length >= 10) break;

      let member;
      try {
        member = await interaction.guild.members.fetch(row.user_id);
      } catch {
        continue;
      }

      visible.push({ member, count: row.message_count });
    }

    if (!visible.length) {
      await interaction.editReply({
        content: "Пока нет активных пользователей на этой неделе.",
      });
      return;
    }

    const lines = visible.map((entry, index) => {
      const label = entry.member.user.tag;
      return `\`${index + 1}.\` **${label}** — ${entry.count} сообщений`;
    });

    const desc = lines.join("\n") + "\n\n*Обнуляется каждый понедельник.*";

    const embed = new EmbedBuilder()
      .setTitle("📅 Топ 10 на этой неделе")
      .setDescription(desc)
      .setColor(0x10b981)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else if (commandName === "streak") {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const streak = await getStreak(db, interaction.guild.id, targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle("🔥 Message Streak")
      .setDescription(`Streak stats for ${targetUser.tag}`)
      .addFields(
        { name: "Current Streak", value: `${streak.currentStreak} ${ruPlural(streak.currentStreak, "день", "дня", "дней")}`, inline: true },
        { name: "Longest Streak", value: `${streak.longestStreak} ${ruPlural(streak.longestStreak, "день", "дня", "дней")}`, inline: true }
      )
      .setColor(0xf59e0b)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else if (commandName === "reactions") {
    const type = interaction.options.getString("type") || "given";

    await interaction.deferReply();

    const rows = type === "given"
      ? await getTopReactionsGiven(db, interaction.guild.id, 10)
      : await getTopReactionsReceived(db, interaction.guild.id, 10);

    const visible = [];

    for (const row of rows) {
      if (visible.length >= 10) break;

      let member;
      try {
        member = await interaction.guild.members.fetch(row.user_id);
      } catch {
        continue;
      }

      const count = type === "given" ? row.reactions_given : row.reactions_received;
      visible.push({ member, count });
    }

    if (!visible.length) {
      await interaction.editReply({
        content: "Пока нет данных по реакциям.",
      });
      return;
    }

    const lines = visible.map((entry, index) => {
      const label = entry.member.user.tag;
      return `\`${index + 1}.\` **${label}** — ${entry.count} reactions`;
    });

    const title = type === "given" ? "👍 Топ по реакциям (отправлено)" : "❤️ Топ по реакциям (получено)";
    const desc = lines.join("\n");

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(desc)
      .setColor(0xec4899)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else if (commandName === "export") {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: "Эта команда доступна только владельцу бота.", flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });

    try {
      const csv = await exportStatsToCSV(db, interaction.guild.id);
      const buffer = Buffer.from(csv, "utf-8");

      await interaction.editReply({
        content: "Экспорт готов!",
        files: [{ attachment: buffer, name: `stats_${interaction.guild.id}_${Date.now()}.csv` }],
      });
    } catch (err) {
      console.error("export error:", err);
      await interaction.editReply({ content: "Ошибка при экспорте данных." });
    }
  } else if (commandName === "countdown") {
    const now = new Date();
    const newYear = new Date("2026-01-01T00:00:00+03:00"); // Moscow timezone (MSK = UTC+3)

    const diff = newYear.getTime() - now.getTime();

    if (diff <= 0) {
      return interaction.reply({ content: "С Новым Годом! 🎉", flags: 64 });
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const embed = new EmbedBuilder()
      .setTitle("🎆 Обратный отсчёт до Нового Года 2026!")
      .setDescription(`**${days}** ${ruPlural(days, "день", "дня", "дней")}, **${hours}** ${ruPlural(hours, "час", "часа", "часов")}, **${minutes}** ${ruPlural(minutes, "минута", "минуты", "минут")}, **${seconds}** ${ruPlural(seconds, "секунда", "секунды", "секунд")}`)
      .setColor(0xfbbf24)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else if (commandName === "mystrikes") {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    
    const strikes = await getViolationStrikes(db, guildId, userId);
    const violationData = await getUserViolationData(db, guildId, userId);
    
    if (strikes === 0) {
      return interaction.reply({ 
        content: "✅ У вас нет активных страйков!", 
        flags: 64 
      });
    }
    
    const resetDate = new Date(violationData.will_reset_at * 1000);
    const daysUntilReset = Math.ceil((resetDate - Date.now()) / (1000 * 60 * 60 * 24));
    
    const embed = new EmbedBuilder()
      .setTitle("⚠️ Ваши Страйки")
      .setDescription(`У вас **${strikes}** ${ruPlural(strikes, "страйк", "страйка", "страйков")}`)  
      .addFields(
        { name: "Сброс через", value: `${daysUntilReset} ${ruPlural(daysUntilReset, "день", "дня", "дней")}`, inline: true },
        { name: "Дата сброса", value: resetDate.toLocaleDateString('ru-RU'), inline: true },
        { name: "ℹ️ Информация", value: "Страйки автоматически сбрасываются через настроенный период времени." }
      )
      .setColor(0xfbbf24)
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed], flags: 64 });
  }
});

// -------------------------
// PANEL: auth + utilities
// -------------------------
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseHexColor(input, fallback) {
  if (!input || typeof input !== "string") return fallback;
  const hex = input.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return parseInt(hex, 16);
}

function validateLength(value, max, label) {
  if (value == null) return { ok: true, value: "" };
  const str = String(value);
  if (str.length > max) {
    return { ok: false, error: `${label} too long (max ${max} chars)` };
  }
  return { ok: true, value: str };
}

function requireAuth(req, res, next) {
  if (req.session?.user?.ok) return next();
  return res.redirect(`${PANEL_BASE}/login`);
}

async function validateLogin(username, password) {
  const expectedUser = process.env.PANEL_USERNAME || "admin";
  const hash = process.env.PANEL_PASSWORD_HASH;

  if (!hash) return false;
  if (username !== expectedUser) return false;

  return bcrypt.compare(password, hash);
}

// -------------------------
// PANEL: sent-items library DB functions
// -------------------------
async function upsertPanelItem(item) {
  const {
    bot_key,
    kind,
    guild_id,
    channel_id,
    message_id,
    content,
    title,
    description,
    color,
    footer,
  } = item;

  await dbRun(
    `
    INSERT INTO panel_sent_items
      (bot_key, kind, guild_id, channel_id, message_id, content, title, description, color, footer, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(bot_key, channel_id, message_id) DO UPDATE SET
      kind=excluded.kind,
      guild_id=excluded.guild_id,
      content=excluded.content,
      title=excluded.title,
      description=excluded.description,
      color=excluded.color,
      footer=excluded.footer,
      updated_at=datetime('now'),
      deleted_at=NULL
  `,
    [
      bot_key,
      kind,
      guild_id || null,
      channel_id,
      message_id,
      content || null,
      title || null,
      description || null,
      color || null,
      footer || null,
    ]
  );

  const row = await dbGet(
    `SELECT * FROM panel_sent_items WHERE bot_key=? AND channel_id=? AND message_id=?`,
    [bot_key, channel_id, message_id]
  );
  return row;
}

async function markPanelItemDeleted(botKey, channelId, messageId) {
  await dbRun(
    `
    UPDATE panel_sent_items
    SET deleted_at = datetime('now'), updated_at=datetime('now')
    WHERE bot_key=? AND channel_id=? AND message_id=?
  `,
    [botKey, channelId, messageId]
  );
}

async function deletePanelItemLocalById(id) {
  await dbRun(`DELETE FROM panel_sent_items WHERE id=?`, [id]);
}

async function listPanelItems(botKey, { limit = 100, kind = "all" } = {}) {
  const safeLimit = Math.max(1, Math.min(300, Number(limit) || 100));
  const params = [botKey];

  let where = `WHERE bot_key = ?`;
  if (kind === "message" || kind === "embed") {
    where += ` AND kind = ?`;
    params.push(kind);
  }

  const rows = await dbAll(
    `
    SELECT
      id, bot_key, kind, guild_id, channel_id, message_id,
      content, title, description, color, footer,
      created_at, updated_at, deleted_at
    FROM panel_sent_items
    ${where}
    ORDER BY updated_at DESC
    LIMIT ?
  `,
    [...params, safeLimit]
  );

  return rows;
}

async function getPanelItemById(id) {
  return dbGet(`SELECT * FROM panel_sent_items WHERE id=?`, [id]);
}

// -------------------------
// DISCORD helpers for panel
// -------------------------
async function fetchChannelForBot(botClient, channelId) {
  const channel = await botClient.channels.fetch(channelId);
  return channel;
}

function isTextSendableChannel(channel) {
  if (!channel) return false;
  return typeof channel.isTextBased === "function" ? channel.isTextBased() : false;
}

function extractEmbedForStorage(embed) {
  if (!embed) return null;
  const title = embed.title || null;
  const description = embed.description || null;
  const color = embed.color != null ? "#" + embed.color.toString(16).padStart(6, "0") : null;
  const footer = embed.footer?.text || null;
  return { title, description, color, footer };
}

function buildEmbedFromFields({ title, description, color, footer }, fallbackColorInt) {
  const e = new EmbedBuilder()
    .setTitle(String(title || "").slice(0, 256))
    .setDescription(String(description || "").slice(0, 3900))
    .setColor(parseHexColor(color, fallbackColorInt))
    .setTimestamp();

  if (footer && String(footer).trim()) {
    e.setFooter({ text: String(footer).trim().slice(0, 2048) });
  }
  return e;
}

async function getAllSendableChannels(botClient) {
  const out = [];
  for (const guild of botClient.guilds.cache.values()) {
    let channels;
    try {
      channels = await guild.channels.fetch();
    } catch {
      continue;
    }

    for (const [, ch] of channels) {
      if (!ch) continue;

      const isText =
        ch.type === ChannelType.GuildText ||
        ch.type === ChannelType.GuildAnnouncement ||
        ch.type === ChannelType.PublicThread ||
        ch.type === ChannelType.PrivateThread ||
        ch.type === ChannelType.AnnouncementThread;

      if (!isText) continue;
      if (!isAllowedChannel(ch.id)) continue;

      // Skip channels where the bot cannot view/send to avoid 500s when posting from panel
      const perms = ch.permissionsFor(botClient.user?.id || botClient.application?.id);
      if (!perms) continue;
      const canView = perms.has(PermissionsBitField.Flags.ViewChannel);
      const canSend = ch.isThread()
        ? perms.has(PermissionsBitField.Flags.SendMessagesInThreads)
        : perms.has(PermissionsBitField.Flags.SendMessages);
      if (!canView || !canSend) continue;

      out.push({
        id: ch.id,
        name: ch.name || "(no-name)",
        guild_id: guild.id,
        guild_name: guild.name || "(unknown)",
      });
    }
  }

  out.sort((a, b) => {
    const g = a.guild_name.localeCompare(b.guild_name);
    if (g !== 0) return g;
    return a.name.localeCompare(b.name);
  });

  return out;
}

// -------------------------
// WEB (Landing + Panel under /panel)
// -------------------------
const app = express();
if (TRUST_PROXY) app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "300kb" }));
app.use(express.urlencoded({ extended: false }));

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir, { index: false }));


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
    secret: process.env.SESSION_SECRET || "CHANGE_THIS_IN_PROD",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE,
    },
  })
);

// Rate limits
const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const apiLimiter = rateLimit({ windowMs: 10_000, max: 40 });

app.get("/health", (req, res) => res.json({ ok: true }));

// Multi-bot registry (future-proof). Today: one bot.
const bots = [{ key: "samprp", name: "Discord Radio Samp-Rp", kind: "discord", client, guildId: "537187880842559499" }];

// -------------------------
// PANEL ROUTES
// -------------------------
app.get(`${PANEL_BASE}/login`, (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Login</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui;background:#070c14;color:#e5e7eb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:100%;max-width:420px;background:rgba(5,11,22,.88);border:1px solid rgba(31,42,58,.9);border-radius:16px;padding:16px 16px 14px;box-shadow:0 16px 40px rgba(0,0,0,.45);backdrop-filter: blur(8px)}
    h1{margin:0;font-size:16px;letter-spacing:.2px}
    .muted{color:#9ca3af;font-size:12.5px;margin-top:6px}
    label{display:block;font-size:12px;margin:12px 0 6px;color:#cbd5e1}
    input{width:100%;padding:10px 11px;border-radius:12px;border:1px solid rgba(31,42,58,.95);background:rgba(7,15,32,.85);color:#e5e7eb;outline:none}
    .row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:14px}
    button{padding:10px 14px;border-radius:999px;border:0;cursor:pointer;background:#0ea5e9;color:#06101a;font-weight:800}
    a{color:#93c5fd;text-decoration:none;font-size:12.5px}
    .error{margin:12px 0 0;padding:10px;border-radius:12px;border:1px solid #3b1520;background:#1a0b10;color:#fb7185;font-size:12.5px}
  </style>
</head>
<body>
  <div class="card">
    <h1>JepsenCloud Panel</h1>
    <div class="muted">Sign in to manage your bots.</div>
    <form method="post" action="${PANEL_BASE}/login">
      <label>Username</label>
      <input name="username" autocomplete="username" required />
      <label>Password</label>
      <input name="password" type="password" autocomplete="current-password" required />
      <div class="row">
        <button type="submit">Login</button>
        <a href="/">← Back to landing</a>
      </div>
    </form>
    ${
      !process.env.PANEL_PASSWORD_HASH
        ? `<div class="error">PANEL_PASSWORD_HASH is not set. Panel login will never succeed.</div>`
        : ""
    }
  </div>
</body>
</html>`);
});

app.post(`${PANEL_BASE}/login`, loginLimiter, async (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");

  const ok = await validateLogin(username, password);
  if (!ok) {
    return res.status(401).send(`<!doctype html>
<html><body style="font-family:system-ui;background:#070c14;color:#e5e7eb;padding:24px">
  <p>Invalid login.</p>
  <p><a style="color:#93c5fd" href="${PANEL_BASE}/login">Try again</a></p>
</body></html>`);
  }

  req.session.user = { ok: true, username };
  return res.redirect(`${PANEL_BASE}`);
});

app.post(`${PANEL_BASE}/logout`, (req, res) => {
  req.session.destroy(() => res.redirect(`${PANEL_BASE}/login`));
});

// Panel home (bot tiles)
app.get(`${PANEL_BASE}`, requireAuth, (req, res) => {
  const tiles = bots
    .map(
      (b) => `
      <a href="${PANEL_BASE}/bot/${encodeURIComponent(b.key)}" style="text-decoration:none;color:inherit">
        <div class="tile">
          <div class="tTitle">${escapeHtml(b.name)}</div>
          <div class="tMeta">Type: ${escapeHtml(b.kind)}</div>
        </div>
      </a>`
    )
    .join("");

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui;background:#070c14;color:#e5e7eb}
    .wrap{max-width:1100px;margin:0 auto;padding:18px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .title{font-weight:850;font-size:16px}
    .muted{color:#9ca3af;font-size:12.5px;margin-top:4px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
    .tile{background:rgba(5,11,22,.86);border:1px solid rgba(31,42,58,.9);border-radius:16px;padding:14px;box-shadow:0 14px 34px rgba(0,0,0,.35);backdrop-filter: blur(8px)}
    .tTitle{font-weight:850}
    .tMeta{color:#9ca3af;font-size:12.5px;margin-top:6px}
    .pill{padding:9px 12px;border-radius:999px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb;cursor:pointer}
    a{color:#93c5fd;text-decoration:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">JepsenCloud Panel</div>
        <div class="muted">Logged in as ${escapeHtml(req.session.user.username)}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <a href="/">Landing</a>
        <form method="post" action="${PANEL_BASE}/logout"><button class="pill" type="submit">Logout</button></form>
      </div>
    </div>
    <div class="grid">${tiles}</div>
  </div>
</body>
</html>`);
});

/* --- your existing Bot page + Panel API routes continue here unchanged ---
   (Everything after this in your paste can remain as-is)
*/

// -------------------------
// PANEL API
// -------------------------
app.get(`${PANEL_BASE}/api/:botKey/channels`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const items = await getAllSendableChannels(bot.client);
    return res.json({ ok: true, items });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch channels" });
  }
});

// Messages API - GET all messages
app.get(`${PANEL_BASE}/api/:botKey/messages`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const messages = await dbAll(
      `SELECT * FROM panel_messages WHERE bot_key = ? ORDER BY created_at DESC`,
      [bot.key]
    );
    return res.json({ ok: true, messages });
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Messages API - POST create/send message
app.post(`${PANEL_BASE}/api/:botKey/messages`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const { channelId, content, embed, status } = req.body;

  try {
    let messageId = null;
    let discordMessageId = null;

    // Validate lengths early to return 400 instead of Discord validation error
    const contentCheck = validateLength(content, 2000, "Content");
    if (!contentCheck.ok) return res.status(400).json({ error: contentCheck.error });
    const titleCheck = validateLength(embed?.title, 256, "Embed title");
    if (!titleCheck.ok) return res.status(400).json({ error: titleCheck.error });
    const descCheck = validateLength(embed?.description, 4096, "Embed description");
    if (!descCheck.ok) return res.status(400).json({ error: descCheck.error });
    const footerCheck = validateLength(embed?.footer, 2048, "Embed footer");
    if (!footerCheck.ok) return res.status(400).json({ error: footerCheck.error });

    // Normalize embed for storage/use after validation
    let normalizedEmbed = null;
    if (embed && (embed.title || embed.description || embed.footer || embed.imageData)) {
      normalizedEmbed = {
        title: titleCheck.value || undefined,
        description: descCheck.value || undefined,
        color: embed.color || undefined,
        footer: footerCheck.value || undefined,
        imageData: embed.imageData || undefined,
      };
    }

    // Send to Discord if status is 'sent'
    if (status === 'sent' && channelId) {
      const channel = await bot.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return res.status(400).json({ error: "Invalid channel" });
      }

      const perms = channel.permissionsFor(bot.client.user?.id || bot.client.application?.id);
      const canSend = perms?.has(channel.isThread() ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages);
      const canView = perms?.has(PermissionsBitField.Flags.ViewChannel);
      if (!canView || !canSend) {
        return res.status(403).json({ error: "Bot lacks permission to send to this channel" });
      }

      const payload = {};
      if (contentCheck.value) payload.content = contentCheck.value;
      
      if (normalizedEmbed && (normalizedEmbed.title || normalizedEmbed.description)) {
        const embedBuilder = new EmbedBuilder();
        if (normalizedEmbed.title) embedBuilder.setTitle(normalizedEmbed.title);
        if (normalizedEmbed.description) embedBuilder.setDescription(normalizedEmbed.description);
        embedBuilder.setColor(parseHexColor(normalizedEmbed.color, 0x00aeff));
        if (normalizedEmbed.footer?.trim()) embedBuilder.setFooter({ text: normalizedEmbed.footer.trim() });
        if (normalizedEmbed.imageData && normalizedEmbed.imageData.startsWith('data:image')) {
          // For now, we'll skip image upload - could use Discord CDN or attachments later
          // embedBuilder.setImage(embed.imageData);
        }
        embedBuilder.setTimestamp();
        payload.embeds = [embedBuilder];
      }

      const sentMessage = await channel.send(payload);
      discordMessageId = sentMessage.id;
    }

    // Save to database
    const result = await dbRun(
      `INSERT INTO panel_messages (bot_key, channel_id, content, embed, status, discord_message_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [bot.key, channelId || null, contentCheck.value || null, normalizedEmbed ? JSON.stringify(normalizedEmbed) : null, status || 'draft', discordMessageId]
    );

    messageId = result.lastID;

    return res.json({ ok: true, id: messageId, discordMessageId });
  } catch (e) {
    console.error('POST /messages error:', e);
    return res.status(500).json({ error: e.message || "Failed to create message" });
  }
});

// Messages API - PUT update message
app.put(`${PANEL_BASE}/api/:botKey/messages/:id`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const { id } = req.params;
  const { channelId, content, embed, status } = req.body;

  try {
    // Get existing message
    const existing = await dbGet(`SELECT * FROM panel_messages WHERE id = ? AND bot_key = ?`, [id, bot.key]);
    if (!existing) return res.status(404).json({ error: "Message not found" });

    let discordMessageId = existing.discord_message_id;

    // Validate lengths early to return 400 instead of Discord validation error
    const contentCheck = validateLength(content, 2000, "Content");
    if (!contentCheck.ok) return res.status(400).json({ error: contentCheck.error });
    const titleCheck = validateLength(embed?.title, 256, "Embed title");
    if (!titleCheck.ok) return res.status(400).json({ error: titleCheck.error });
    const descCheck = validateLength(embed?.description, 4096, "Embed description");
    if (!descCheck.ok) return res.status(400).json({ error: descCheck.error });
    const footerCheck = validateLength(embed?.footer, 2048, "Embed footer");
    if (!footerCheck.ok) return res.status(400).json({ error: footerCheck.error });

    // Normalize embed for storage/use after validation
    let normalizedEmbed = null;
    if (embed && (embed.title || embed.description || embed.footer || embed.imageData)) {
      normalizedEmbed = {
        title: titleCheck.value || undefined,
        description: descCheck.value || undefined,
        color: embed.color || undefined,
        footer: footerCheck.value || undefined,
        imageData: embed.imageData || undefined,
      };
    }

    // If sending to Discord
    if (status === 'sent' && channelId) {
      const channel = await bot.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return res.status(400).json({ error: "Invalid channel" });
      }

      const perms = channel.permissionsFor(bot.client.user?.id || bot.client.application?.id);
      const canSend = perms?.has(channel.isThread() ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages);
      const canView = perms?.has(PermissionsBitField.Flags.ViewChannel);
      if (!canView || !canSend) {
        return res.status(403).json({ error: "Bot lacks permission to send to this channel" });
      }

      const payload = {};
      if (contentCheck.value) payload.content = contentCheck.value;
      
      if (normalizedEmbed && (normalizedEmbed.title || normalizedEmbed.description)) {
        const embedBuilder = new EmbedBuilder();
        if (normalizedEmbed.title) embedBuilder.setTitle(normalizedEmbed.title);
        if (normalizedEmbed.description) embedBuilder.setDescription(normalizedEmbed.description);
        embedBuilder.setColor(parseHexColor(normalizedEmbed.color, 0xe74c3c));
        if (normalizedEmbed.footer?.trim()) embedBuilder.setFooter({ text: normalizedEmbed.footer.trim() });
        embedBuilder.setTimestamp();
        payload.embeds = [embedBuilder];
      }

      // Try to edit existing Discord message, or send new if not possible
      if (discordMessageId && channelId === existing.channel_id) {
        try {
          const existingMessage = await channel.messages.fetch(discordMessageId);
          await existingMessage.edit(payload);
        } catch {
          // If edit fails, send new message
          const sentMessage = await channel.send(payload);
          discordMessageId = sentMessage.id;
        }
      } else {
        // Send to new channel
        const sentMessage = await channel.send(payload);
        discordMessageId = sentMessage.id;
      }
    }

    // Update database
    await dbRun(
      `UPDATE panel_messages 
       SET channel_id = ?, content = ?, embed = ?, status = ?, discord_message_id = ?, updated_at = datetime('now')
       WHERE id = ? AND bot_key = ?`,
      [channelId || null, contentCheck.value || null, normalizedEmbed ? JSON.stringify(normalizedEmbed) : null, status || 'draft', discordMessageId, id, bot.key]
    );

    return res.json({ ok: true, discordMessageId });
  } catch (e) {
    console.error('PUT /messages error:', e);
    return res.status(500).json({ error: e.message || "Failed to update message" });
  }
});

// Messages API - DELETE message
app.delete(`${PANEL_BASE}/api/:botKey/messages/:id`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const { id } = req.params;

  try {
    // Get message details
    const message = await dbGet(`SELECT * FROM panel_messages WHERE id = ? AND bot_key = ?`, [id, bot.key]);
    if (!message) return res.status(404).json({ error: "Message not found" });

    // Optionally delete from Discord (currently just marking as deleted in DB)
    // If you want to delete from Discord too:
    // if (message.discord_message_id && message.channel_id) {
    //   try {
    //     const channel = await bot.client.channels.fetch(message.channel_id);
    //     const discordMsg = await channel.messages.fetch(message.discord_message_id);
    //     await discordMsg.delete();
    //   } catch { /* ignore if message already deleted */ }
    // }

    // Delete from database
    await dbRun(`DELETE FROM panel_messages WHERE id = ? AND bot_key = ?`, [id, bot.key]);

    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /messages error:', e);
    return res.status(500).json({ error: e.message || "Failed to delete message" });
  }
});
// ========================
// STATS API ENDPOINTS
// ========================

// Get user statistics with Discord usernames instead of just IDs
app.get(`${PANEL_BASE}/api/:botKey/stats/users`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const guildId = req.query.guildId || '';
    const sortBy = req.query.sortBy || 'count'; // 'count', 'username', 'recent'
    const limit = Math.min(parseInt(req.query.limit || 100), 500); // Max 500, default 100
    const offset = parseInt(req.query.offset || 0);
    const search = (req.query.search || '').trim().toLowerCase();

    let whereClause = '';
    let params = [];
    let whereParams = [];

    if (guildId) {
      whereClause = 'WHERE us.guild_id = ?';
      whereParams.push(guildId);
    }

    let orderClause = 'ORDER BY us.message_count DESC, us.user_id ASC';
    let orderParams = [];
    if (sortBy === 'username') {
      orderClause = 'ORDER BY COALESCE(uc_guild.username, uc_any.username, us.user_id) ASC';
    } else if (sortBy === 'recent') {
      orderClause = 'ORDER BY COALESCE(uc_guild.updated_at, uc_any.updated_at, ?) DESC';
      orderParams.push(new Date().toISOString());
    }

    // Join with user_cache (prefer guild-specific, else latest seen globally)
    let query = `
      SELECT 
        us.user_id,
        COALESCE(uc_guild.username, uc_any.username, us.user_id) as username,
        us.message_count,
        COALESCE(uc_guild.avatar_url, uc_any.avatar_url) as avatar_url,
        COALESCE(uc_guild.updated_at, uc_any.updated_at, ?) as updated_at
      FROM user_stats us
      LEFT JOIN user_cache uc_guild ON us.guild_id = uc_guild.guild_id AND us.user_id = uc_guild.user_id
      LEFT JOIN (
        SELECT uc1.user_id, uc1.username, uc1.avatar_url, uc1.updated_at
        FROM user_cache uc1
        JOIN (
          SELECT user_id, MAX(updated_at) AS max_updated_at
          FROM user_cache
          GROUP BY user_id
        ) ucmax ON uc1.user_id = ucmax.user_id AND uc1.updated_at = ucmax.max_updated_at
      ) uc_any ON uc_any.user_id = us.user_id
      ${whereClause}
    `;
    params.push(new Date().toISOString());
    params.push(...whereParams);

    // Apply search filter if provided
    if (search) {
      query += whereClause ? ` AND` : ` WHERE`;
      query += ` (LOWER(COALESCE(uc_guild.username, uc_any.username, us.user_id)) LIKE ? OR us.user_id LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ${orderClause} LIMIT ? OFFSET ?`;
    params.push(...orderParams);
    params.push(limit, offset);

    console.log('Stats query:', query);
    console.log('Stats params:', params);
    const users = await dbAll(query, params);
    console.log('Stats users returned:', users?.length);

    // On-demand hydration: fetch Discord usernames for entries still showing raw IDs (limit 5 per request)
    if (users?.length) {
      const missing = users.filter((u) => u.username === u.user_id).slice(0, 5);
      for (const entry of missing) {
        try {
          const fetched = await bot.client.users.fetch(entry.user_id);
          if (fetched?.username) {
            const nowIso = new Date().toISOString();
            await dbRun(
              `INSERT OR REPLACE INTO user_cache (guild_id, user_id, username, avatar_url, updated_at)
               VALUES (?, ?, ?, ?, ?)` ,
              [guildId || null, entry.user_id, fetched.username, fetched.avatarURL() || null, nowIso]
            );
            entry.username = fetched.username;
            entry.avatar_url = fetched.avatarURL() || null;
            entry.updated_at = nowIso;
          }
        } catch (_) {
          // ignore fetch failures (user missing or rate limited)
        }
      }
    }

    // Get total count for pagination
    let countQuery = `SELECT COUNT(*) as total FROM user_stats us LEFT JOIN user_cache uc ON us.guild_id = uc.guild_id AND us.user_id = uc.user_id`;
    let countParams = [];
    if (guildId) {
      countQuery += ` WHERE us.guild_id = ?`;
      countParams.push(guildId);
    }
    if (search) {
      countQuery += guildId ? ` AND` : ` WHERE`;
      countQuery += ` (LOWER(COALESCE(uc.username, us.user_id)) LIKE ? OR us.user_id LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await dbGet(countQuery, countParams);
    const total = countResult?.total || 0;

    return res.json({
      ok: true,
      users,
      pagination: { offset, limit, total }
    });
  } catch (e) {
    console.error('GET /stats/users error:', e);
    return res.status(500).json({ error: e.message || "Failed to fetch user statistics" });
  }
});

// Channel breakdown per user (best-effort; requires channel_id in message_index)
app.get(`${PANEL_BASE}/api/:botKey/stats/user-channels`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const { guildId, userId, limit = 10 } = req.query;
    if (!guildId || !userId) return res.status(400).json({ error: "guildId and userId are required" });

    const rows = await dbAll(
      `SELECT channel_id, COUNT(*) as count
       FROM message_index
       WHERE guild_id = ? AND user_id = ? AND channel_id IS NOT NULL
       GROUP BY channel_id
       ORDER BY count DESC
       LIMIT ?`,
      [guildId, userId, Math.min(parseInt(limit, 10) || 10, 25)]
    );

    return res.json({ ok: true, channels: rows });
  } catch (e) {
    console.error('GET /stats/user-channels error:', e);
    return res.status(500).json({ error: e.message || "Failed to fetch channel breakdown" });
  }
});

// Adjust a user's message count (admin tool)
app.post(`${PANEL_BASE}/api/:botKey/stats/adjust`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const { guildId, userId, delta, setTo } = req.body || {};
    if (!userId || !guildId) return res.status(400).json({ error: "guildId and userId are required" });

    const currentRow = await dbGet(`SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);
    const currentCount = currentRow?.message_count || 0;
    let newCount = currentCount;

    if (typeof setTo === 'number' && Number.isFinite(setTo) && setTo >= 0) {
      newCount = Math.floor(setTo);
    } else if (typeof delta === 'number' && Number.isFinite(delta) && delta !== 0) {
      newCount = Math.max(0, currentCount + Math.floor(delta));
    } else {
      return res.status(400).json({ error: "Provide either a non-negative setTo or a non-zero delta" });
    }

    const deltaApplied = newCount - currentCount;

    // Persist adjustment delta for backfill/reconciliation safety
    await dbRun(
      `INSERT INTO user_adjustments (guild_id, user_id, adjustment, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(guild_id, user_id)
       DO UPDATE SET adjustment = user_adjustments.adjustment + excluded.adjustment,
                     updated_at = excluded.updated_at`,
      [guildId, userId, deltaApplied, new Date().toISOString()]
    );

    // Update visible stats
    await dbRun(
      `INSERT INTO user_stats (guild_id, user_id, message_count)
       VALUES (?, ?, ?)
       ON CONFLICT(guild_id, user_id)
       DO UPDATE SET message_count = excluded.message_count`,
      [guildId, userId, newCount]
    );

    return res.json({ ok: true, guildId, userId, messageCount: newCount });
  } catch (e) {
    console.error('POST /stats/adjust error:', e);
    return res.status(500).json({ error: e.message || "Failed to adjust user stats" });
  }
});

// LIVE STATS ENDPOINT (for real-time web panel updates)
app.get(`${PANEL_BASE}/api/:botKey/stats/live`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const guildId = req.query.guildId || '';

    // Get total messages
    let totalQuery = 'SELECT COUNT(*) as total FROM message_index';
    let totalParams = [];
    if (guildId) {
      totalQuery += ' WHERE guild_id = ?';
      totalParams.push(guildId);
    }
    const totalResult = await dbGet(totalQuery, totalParams);

    // Get unique users and sum of message counts
    let usersQuery = 'SELECT COUNT(DISTINCT user_id) as unique_users, SUM(message_count) as total_messages FROM user_stats';
    let usersParams = [];
    if (guildId) {
      usersQuery += ' WHERE guild_id = ?';
      usersParams.push(guildId);
    }
    const usersResult = await dbGet(usersQuery, usersParams);

    // Get top users (limited) with best-effort username lookup
    let topUsersQuery = `
      SELECT 
        us.user_id, 
        us.message_count, 
        COALESCE(uc_guild.username, uc_any.username, us.user_id) as username
      FROM user_stats us
      LEFT JOIN user_cache uc_guild ON us.user_id = uc_guild.user_id AND us.guild_id = uc_guild.guild_id
      LEFT JOIN (
        SELECT uc1.user_id, uc1.username, uc1.avatar_url, uc1.updated_at
        FROM user_cache uc1
        JOIN (
          SELECT user_id, MAX(updated_at) AS max_updated_at
          FROM user_cache
          GROUP BY user_id
        ) ucmax ON uc1.user_id = ucmax.user_id AND uc1.updated_at = ucmax.max_updated_at
      ) uc_any ON uc_any.user_id = us.user_id
    `;
    let topUsersParams = [];
    if (guildId) {
      topUsersQuery += ' WHERE us.guild_id = ?';
      topUsersParams.push(guildId);
    }
    topUsersQuery += ' ORDER BY us.message_count DESC LIMIT 10';
    const topUsers = await dbAll(topUsersQuery, topUsersParams);

    return res.json({
      ok: true,
      stats: {
        totalMessages: usersResult?.total_messages || 0,
        uniqueUsers: usersResult?.unique_users || 0,
        topUsers: topUsers || [],
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (e) {
    console.error('GET /stats/live error:', e);
    return res.status(500).json({ error: e.message || "Failed to fetch live statistics" });
  }
});

// ============================================================================
// VERIFICATION API ENDPOINTS
// ============================================================================

// Get message count for a user
app.get(`${PANEL_BASE}/api/:botKey/verify/user-count`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const { userId, guildId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    
    let query = "SELECT COUNT(*) as count FROM message_index WHERE user_id = ?";
    let params = [userId];
    
    if (guildId) {
      query += " AND guild_id = ?";
      params.push(guildId);
    }
    
    const result = await dbGet(query, params);
    
    return res.json({
      ok: true,
      userId,
      guildId: guildId || null,
      messageCount: result?.count || 0
    });
  } catch (e) {
    console.error('GET /verify/user-count error:', e);
    return res.status(500).json({ error: e.message || "Failed to count messages" });
  }
});

// Check if a specific message is counted
app.get(`${PANEL_BASE}/api/:botKey/verify/message-counted`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const { messageId } = req.query;
    if (!messageId) return res.status(400).json({ error: "messageId required" });
    
    const message = await dbGet(
      "SELECT * FROM message_index WHERE message_id = ?",
      [messageId]
    );
    
    if (!message) {
      return res.json({
        ok: true,
        messageId,
        found: false,
        message: null
      });
    }
    
    return res.json({
      ok: true,
      messageId,
      found: true,
      message: {
        userId: message.user_id,
        guildId: message.guild_id,
        createdAt: message.created_at
      }
    });
  } catch (e) {
    console.error('GET /verify/message-counted error:', e);
    return res.status(500).json({ error: e.message || "Failed to check message" });
  }
});

// Get user stats overview
app.get(`${PANEL_BASE}/api/:botKey/verify/user-stats`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const { userId, guildId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    
    // Get stats
    let statsQuery = "SELECT message_count FROM user_stats WHERE user_id = ?";
    let statsParams = [userId];
    if (guildId) {
      statsQuery += " AND guild_id = ?";
      statsParams.push(guildId);
    }
    
    const stats = await dbGet(statsQuery, statsParams);
    
    // Get indexed count
    let indexQuery = "SELECT COUNT(*) as count FROM message_index WHERE user_id = ?";
    let indexParams = [userId];
    if (guildId) {
      indexQuery += " AND guild_id = ?";
      indexParams.push(guildId);
    }
    
    const indexed = await dbGet(indexQuery, indexParams);
    
    // Get username
    let usernameQuery = "SELECT username FROM user_cache WHERE user_id = ?";
    let usernameParams = [userId];
    if (guildId) {
      usernameQuery += " AND guild_id = ?";
      usernameParams.push(guildId);
    }
    
    const userCache = await dbGet(usernameQuery, usernameParams);
    
    return res.json({
      ok: true,
      userId,
      username: userCache?.username || "Unknown",
      storedCount: stats?.message_count || 0,
      indexedCount: indexed?.count || 0,
      discrepancy: (indexed?.count || 0) - (stats?.message_count || 0)
    });
  } catch (e) {
    console.error('GET /verify/user-stats error:', e);
    return res.status(500).json({ error: e.message || "Failed to get user stats" });
  }
});

// Get all verification results
app.get(`${PANEL_BASE}/api/:botKey/verify/results`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    
    const results = await dbAll(
      `SELECT 
        r.*,
        COALESCE(uc.username, r.user_id) as username
       FROM message_count_reference r
       LEFT JOIN user_cache uc ON r.user_id = uc.user_id
       ORDER BY ABS(r.difference) DESC
       LIMIT 100`,
      []
    );
    
    return res.json({
      ok: true,
      results: results || [],
      summary: {
        total: (results || []).length,
        perfect: (results || []).filter(r => r.difference === 0).length,
        discrepancies: (results || []).filter(r => r.difference !== 0).length
      }
    });
  } catch (e) {
    console.error('GET /verify/results error:', e);
    return res.status(500).json({ error: e.message || "Failed to fetch verification results" });
  }
});

// VERIFICATION DASHBOARD PAGE
app.get(`${PANEL_BASE}/verification-dashboard`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.query.bot);
  if (!bot) {
    // If no bot specified, show bot selection screen
    const botList = bots.map(b => `<li><a href="${PANEL_BASE}/verification-dashboard?bot=${encodeURIComponent(b.key)}">${escapeHtml(b.name)}</a></li>`).join('');
    return res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Select Bot</title>
  <style>
    body { font-family: system-ui; background: #0a0e17; color: #e5e7eb; padding: 20px; }
    .wrap { max-width: 600px; margin: 0 auto; }
    h1 { color: #a78bfa; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; }
    a { color: #22d3ee; text-decoration: none; padding: 10px; display: block; border-radius: 6px; background: rgba(34,211,238,.1); }
    a:hover { background: rgba(34,211,238,.2); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Select a Bot</h1>
    <p>Choose which bot's verification dashboard you want to access:</p>
    <ul>${botList || '<li>No bots available</li>'}</ul>
    <hr style="border-color: rgba(45,55,75,.5); margin-top: 20px;">
    <p><a href="${PANEL_BASE}" style="color: #22d3ee;">← Back to Panel</a></p>
  </div>
</body>
</html>`);
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Verification Dashboard</title>
  <style>
    :root{
      --bg-main:#0a0e17;
      --bg-card:rgba(12,17,29,.92);
      --border:rgba(45,55,75,.85);
      --text:#e5e7eb;
      --text-muted:#9ca3af;
      --accent-purple:#a78bfa;
      --accent-cyan:#22d3ee;
      --accent-emerald:#34d399;
      --accent-rose:#fb7185;
      --accent-yellow:#fbbf24;
      --input-bg:rgba(17,24,39,.9);
      color-scheme:dark;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-main);color:var(--text);line-height:1.6}
    .wrap{max-width:1400px;margin:0 auto;padding:20px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .title{font-weight:700;font-size:24px;display:flex;align-items:center;gap:8px}
    .title .emoji{font-size:28px}
    .muted{color:var(--text-muted);font-size:13px;margin-top:4px}
    .nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .nav a{color:var(--accent-cyan);text-decoration:none;font-size:14px;transition:color .2s;padding:8px 12px;border-radius:6px}
    .nav a:hover{background:rgba(34,211,238,.1);color:var(--accent-purple)}
    .btn{padding:10px 18px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:all .2s}
    .btn:hover{background:rgba(30,41,59,.9);border-color:var(--accent-purple)}
    .btn-primary{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));border:none;color:#fff;font-weight:600}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3);margin-bottom:20px}
    .card-title{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--accent-purple);display:flex;align-items:center;gap:8px}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;font-size:12px;font-weight:500;margin-bottom:6px;color:var(--text-muted)}
    .form-group input,.form-group textarea{width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-family:inherit;font-size:14px}
    .form-group input:focus,.form-group textarea:focus{outline:none;border-color:var(--accent-purple);box-shadow:0 0 0 2px rgba(167,139,250,.1)}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-bottom:16px}
    .stat-box{background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.2);border-radius:8px;padding:16px;text-align:center}
    .stat-value{font-size:28px;font-weight:700;color:var(--accent-purple)}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:6px;text-transform:uppercase;letter-spacing:.5px}
    .stat-box.success{background:rgba(52,211,153,.05);border-color:rgba(52,211,153,.2)}
    .stat-box.success .stat-value{color:var(--accent-emerald)}
    .stat-box.warning{background:rgba(251,191,36,.05);border-color:rgba(251,191,36,.2)}
    .stat-box.warning .stat-value{color:var(--accent-yellow)}
    .stat-box.danger{background:rgba(251,113,133,.05);border-color:rgba(251,113,133,.2)}
    .stat-box.danger .stat-value{color:var(--accent-rose)}
    .result{background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.2);border-radius:8px;padding:12px;margin-bottom:10px;font-size:13px}
    .result.found{background:rgba(52,211,153,.05);border-color:rgba(52,211,153,.2);color:var(--accent-emerald)}
    .result.not-found{background:rgba(251,113,133,.05);border-color:rgba(251,113,133,.2);color:var(--accent-rose)}
    .loading{text-align:center;padding:20px;color:var(--text-muted)}
    .error{background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.3);color:var(--accent-rose);padding:12px;border-radius:8px;margin-bottom:16px}
    .success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald);padding:12px;border-radius:8px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th{background:rgba(167,139,250,.05);padding:12px;text-align:left;font-size:12px;font-weight:600;color:var(--accent-purple);border-bottom:1px solid var(--border)}
    td{padding:12px;border-bottom:1px solid rgba(45,55,75,.3);font-size:13px}
    tr:hover{background:rgba(34,211,238,.03)}
    .tabs{display:flex;gap:8px;border-bottom:1px solid var(--border);margin-bottom:20px}
    .tab{padding:12px 16px;border:none;background:none;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s}
    .tab.active{color:var(--accent-purple);border-bottom-color:var(--accent-purple)}
    .tab-content{display:none}
    .tab-content.active{display:block}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">🔍</span> Verification Dashboard</div>
        <div class="muted">Check message counts and verify data accuracy</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 16px">← Back</button>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/stats">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/rate-limits">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/consecutive-limits">🚫 Consecutive</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/messages">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/ai-engagement">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/commands">📚 Commands</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/accuracy">🎯 Accuracy</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <!-- Tabs -->
    <div class="card">
      <div class="tabs">
        <button class="tab active" onclick="switchTab('user-check')">👤 Check User</button>
        <button class="tab" onclick="switchTab('message-check')">💬 Check Message</button>
        <button class="tab" onclick="switchTab('results')">📊 Results</button>
      </div>

      <!-- User Count Checker -->
      <div id="user-check" class="tab-content active">
        <div class="card-title">Check Message Count for User</div>
        <div class="form-group">
          <label>User ID</label>
          <input type="text" id="userId" placeholder="Enter Discord User ID">
        </div>
        <div class="form-group">
          <label>Guild ID (optional)</label>
          <input type="text" id="guildId" placeholder="Leave empty for all guilds">
        </div>
        <button class="btn btn-primary" onclick="checkUserCount()">Check Count</button>
        <div id="userResult" style="margin-top:16px;display:none"></div>
      </div>

      <!-- Message Checker -->
      <div id="message-check" class="tab-content">
        <div class="card-title">Check if Message is Counted</div>
        <div class="form-group">
          <label>Message ID</label>
          <input type="text" id="messageId" placeholder="Right-click message → Copy Message Link, extract ID">
        </div>
        <button class="btn btn-primary" onclick="checkMessage()">Check Message</button>
        <div id="messageResult" style="margin-top:16px;display:none"></div>
      </div>

      <!-- Results History -->
      <div id="results" class="tab-content">
        <div class="card-title">Verification Results</div>
        <div id="resultsContainer" style="margin-top:16px">
          <div class="loading">Loading...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const botKey = '${bot.key}';
    const apiBase = \`${PANEL_BASE}/api/\${botKey}\`;

    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      event.target.classList.add('active');
    }

    async function checkUserCount() {
      const userId = document.getElementById('userId').value.trim();
      const guildId = document.getElementById('guildId').value.trim();
      const resultDiv = document.getElementById('userResult');

      if (!userId) {
        resultDiv.innerHTML = '<div class="error">❌ Please enter a User ID</div>';
        resultDiv.style.display = 'block';
        return;
      }

      resultDiv.innerHTML = '<div class="loading">⏳ Checking...</div>';
      resultDiv.style.display = 'block';

      try {
        const url = \`\${apiBase}/verify/user-stats?userId=\${userId}\${guildId ? '&guildId=' + guildId : ''}\`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
          resultDiv.innerHTML = \`<div class="error">❌ \${data.error}</div>\`;
          return;
        }

        const { storedCount, indexedCount, discrepancy, username } = data;
        const status = discrepancy === 0 ? '✅ Match' : (discrepancy > 0 ? '⚠️ Missing' : '⚠️ Extra');
        
        resultDiv.innerHTML = \`
          <div class="success">
            <strong>\${username}</strong> (\${userId})
            <br>Stored: \${storedCount} | Indexed: \${indexedCount} | Difference: \${discrepancy >= 0 ? '+' : ''}\${discrepancy}
            <br>\${status}
          </div>
        \`;
      } catch (err) {
        resultDiv.innerHTML = \`<div class="error">❌ Error: \${err.message}</div>\`;
      }
    }

    async function checkMessage() {
      const messageId = document.getElementById('messageId').value.trim();
      const resultDiv = document.getElementById('messageResult');

      if (!messageId) {
        resultDiv.innerHTML = '<div class="error">❌ Please enter a Message ID</div>';
        resultDiv.style.display = 'block';
        return;
      }

      resultDiv.innerHTML = '<div class="loading">⏳ Checking...</div>';
      resultDiv.style.display = 'block';

      try {
        const response = await fetch(\`\${apiBase}/verify/message-counted?messageId=\${messageId}\`);
        const data = await response.json();

        if (!data.ok) {
          resultDiv.innerHTML = \`<div class="error">❌ \${data.error}</div>\`;
          return;
        }

        if (!data.found) {
          resultDiv.innerHTML = \`<div class="result not-found">❌ Message NOT found in database</div>\`;
        } else {
          const msg = data.message;
          resultDiv.innerHTML = \`
            <div class="result found">
              ✅ Message IS counted!
              <br>User: \${msg.userId}
              <br>Guild: \${msg.guildId}
              <br>Created: \${msg.createdAt}
            </div>
          \`;
        }
      } catch (err) {
        resultDiv.innerHTML = \`<div class="error">❌ Error: \${err.message}</div>\`;
      }
    }

    async function loadResults() {
      try {
        const response = await fetch(\`\${apiBase}/verify/results\`);
        const data = await response.json();

        if (!data.ok) {
          document.getElementById('resultsContainer').innerHTML = \`<div class="error">❌ \${data.error}</div>\`;
          return;
        }

        const { results, summary } = data;

        let html = \`
          <div class="grid">
            <div class="stat-box success">
              <div class="stat-value">\${summary.total}</div>
              <div class="stat-label">Total Verified</div>
            </div>
            <div class="stat-box success">
              <div class="stat-value">\${summary.perfect}</div>
              <div class="stat-label">Perfect Matches</div>
            </div>
            <div class="stat-box warning">
              <div class="stat-value">\${summary.discrepancies}</div>
              <div class="stat-label">Discrepancies</div>
            </div>
          </div>
        \`;

        if (results.length > 0) {
          html += \`<table>
            <thead>
              <tr>
                <th>User</th>
                <th>Discord Count</th>
                <th>Bot Count</th>
                <th>Difference</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>\`;

          results.forEach(r => {
            const diffClass = r.difference === 0 ? 'success' : 'warning';
            const diffStr = r.difference >= 0 ? '+' + r.difference : r.difference;
            html += \`
              <tr>
                <td>\${r.username}</td>
                <td>\${r.discord_search_count}</td>
                <td>\${r.bot_count}</td>
                <td class=\"\${diffClass}\">\${diffStr}</td>
                <td>\${r.verified_at.substring(0, 10)}</td>
              </tr>
            \`;
          });

          html += \`</tbody></table>\`;
        }

        document.getElementById('resultsContainer').innerHTML = html;
      } catch (err) {
        document.getElementById('resultsContainer').innerHTML = \`<div class="error">❌ Error: \${err.message}</div>\`;
      }
    }

    // Load results when page loads
    document.addEventListener('DOMContentLoaded', () => {
      loadResults();
    });
  </script>
</body>
</html>`;

  res.send(html);
});

// BOT PAGE
app.get(`${PANEL_BASE}/bot/:botKey`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — ${escapeHtml(bot.name)}</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-top: 24px;
    }
    .feature-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      transition: all var(--transition-base);
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }
    .feature-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--gradient-primary);
      opacity: 0.7;
    }
    .feature-card:hover {
      transform: translateY(-4px);
      box-shadow: var(--shadow-lg), var(--shadow-glow);
      border-color: var(--border-hover);
    }
    .feature-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: 8px;
    }
    .feature-description {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="page-container-wide">
    <div class="topbar">
      <div class="topbar-content">
        <div class="page-title">
          <span class="emoji">🤖</span>
          <span class="gradient-text">${escapeHtml(bot.name)}</span>
        </div>
        <div class="muted">Bot Key: ${escapeHtml(bot.key)}</div>
      </div>
      <div class="topbar-actions">
        <button onclick="toggleSnow()" class="btn btn-secondary btn-icon" type="button" id="snowToggle" title="Toggle Snow Effect">❄️</button>
        <a href="${PANEL_BASE}" class="btn btn-secondary">← Dashboard</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin: 0;"><button class="btn btn-secondary" type="submit">Logout</button></form>
      </div>
    </div>

    <div class="feature-grid">
      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/holidays" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">🎉 Holidays</div>
          <div class="feature-description">Manage manual holidays by date; merged with Calend.ru in /holiday and daily posts.</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/ai-engagement" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">🤖 AI Engagement</div>
          <div class="feature-description">Configure AI chat engagement settings and view statistics.</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/rate-limits" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">🚦 Rate Limiting</div>
          <div class="feature-description">Configure message rate limits per channel with role-based controls.</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/consecutive-limits" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">🚫 Consecutive Limits</div>
          <div class="feature-description">Configure consecutive message limits with role-based controls and strikes.</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/commands" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">📚 Bot Commands</div>
          <div class="feature-description">Complete list of all available bot commands and features.</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/messages" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">📨 Messages & Embeds</div>
          <div class="feature-description">Create, schedule, and manage Discord messages and embeds.</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/stats" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">📊 Statistics</div>
          <div class="feature-description">Message leaderboard and user statistics with usernames.</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/stats?adjustMode=true${bot.guildId ? '&guildId=' + bot.guildId : ''}" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">⚙️ Adjust Counts</div>
          <div class="feature-description">Admin tool: manually adjust user message counts (+N, -N, or =N).</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/accuracy" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">🔍 Accuracy Monitor</div>
          <div class="feature-description">Real-time message counting accuracy, event logs, and system health monitoring.</div>
        </div>
      </a>

      <a href="${PANEL_BASE}/verification-dashboard?bot=${encodeURIComponent(bot.key)}" style="text-decoration:none;color:inherit">
        <div class="feature-card">
          <div class="feature-title">✅ Verification Dashboard</div>
          <div class="feature-description">Check user message counts, verify specific messages, and review verification results.</div>
        </div>
      </a>
    </div>
  </div>
  <script src="/public/snow.js"></script>
</body>
</html>`);
});

app.get(`${PANEL_BASE}/bot/:botKey/holidays`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");

  res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Holidays - ${escapeHtml(bot.name)}</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui;background:#070c14;color:#e5e7eb}
    .wrap{max-width:1100px;margin:0 auto;padding:18px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .title{font-weight:850;font-size:16px}
    .muted{color:#9ca3af;font-size:12.5px;margin-top:4px}
    .card{background:rgba(5,11,22,.86);border:1px solid rgba(31,42,58,.9);border-radius:16px;padding:14px;box-shadow:0 14px 34px rgba(0,0,0,.35);backdrop-filter: blur(8px)}
    label{display:block;font-size:12px;margin:10px 0 6px;color:#cbd5e1}
    input,textarea{width:100%;padding:10px 11px;border-radius:12px;border:1px solid rgba(31,42,58,.95);background:rgba(7,15,32,.85);color:#e5e7eb;outline:none}
    textarea{min-height:72px;resize:vertical}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    .btn{padding:9px 12px;border-radius:999px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb;cursor:pointer}
    .btnPrimary{background:#0ea5e9;color:#06101a;border:0;font-weight:800}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{padding:10px;border-bottom:1px solid rgba(31,42,58,.7);vertical-align:top;font-size:13px}
    th{color:#cbd5e1;text-align:left;font-size:12px}
    .tag{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(17,28,45,.75);border:1px solid rgba(31,42,58,.9);font-size:12px;color:#e5e7eb}
    a{color:#93c5fd;text-decoration:none}
    .err{margin-top:10px;padding:10px;border-radius:12px;border:1px solid #3b1520;background:#1a0b10;color:#fb7185;font-size:12.5px;display:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">🎉 Holidays</div>
        <div class="muted">Bot: ${escapeHtml(bot.name)} (${escapeHtml(bot.key)})</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 14px">← Back</button>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}" style="color:#93c5fd">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/stats" style="color:#93c5fd">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/rate-limits" style="color:#93c5fd">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/consecutive-limits" style="color:#93c5fd">🚫 Consecutive</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/messages" style="color:#93c5fd">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/ai-engagement" style="color:#93c5fd">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/commands" style="color:#93c5fd">📚 Commands</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/accuracy" style="color:#93c5fd">🎯 Accuracy</a>
        <a href="${PANEL_BASE}/verification-dashboard?bot=${encodeURIComponent(bot.key)}" style="color:#93c5fd">🔍 Verification</a>
        <form method="post" action="${PANEL_BASE}/logout" style="display:inline;margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <div style="flex:1;min-width:240px">
          <label>Date</label>
          <input id="date" type="date" />
        </div>
        <div style="flex:2;min-width:280px">
          <label>Title</label>
          <input id="title" placeholder="Например: День модератора" />
        </div>
        <div style="flex:2;min-width:280px">
          <label>Note (optional)</label>
          <input id="note" placeholder="Заметка для панели" />
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn btnPrimary" id="addBtn">Add holiday</button>
        <span class="tag" id="status">Ready</span>
      </div>

      <div class="err" id="err"></div>

      <table>
        <thead>
          <tr>
            <th style="width:80px">ID</th>
            <th>Title</th>
            <th style="width:220px">Note</th>
            <th style="width:170px">Created</th>
            <th style="width:120px"></th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>

<script>
(function(){
  const botKey = ${JSON.stringify(bot.key)};
  const dateEl = document.getElementById('date');
  const titleEl = document.getElementById('title');
  const noteEl = document.getElementById('note');
  const rowsEl = document.getElementById('rows');
  const statusEl = document.getElementById('status');
  const errEl = document.getElementById('err');
  const addBtn = document.getElementById('addBtn');

  function setStatus(t){ statusEl.textContent = t; }
  function showErr(t){ errEl.style.display='block'; errEl.textContent = t; }
  function clearErr(){ errEl.style.display='none'; errEl.textContent=''; }

  function todayISO(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const da = String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+da;
  }

  async function api(path, opts){
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type':'application/json' }}, opts||{}));
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = null; }
    if(!res.ok){
      throw new Error((json && (json.error || json.message)) || txt || ('HTTP '+res.status));
    }
    return json;
  }

  function render(items){
    rowsEl.innerHTML = '';
    if(!items || !items.length){
      rowsEl.innerHTML = '<tr><td colspan="5" style="color:#9ca3af">No manual holidays for this date.</td></tr>';
      return;
    }
    for(const it of items){
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td>#\${it.id}</td>
        <td>\${escapeHtml(it.title || '')}</td>
        <td style="color:#9ca3af">\${escapeHtml(it.note || '')}</td>
        <td style="color:#9ca3af">\${escapeHtml(it.created_at || '')}</td>
        <td><button class="btn" data-del="\${it.id}">Delete</button></td>
      \`;
      rowsEl.appendChild(tr);
    }
  }

  function escapeHtml(str){
    return String(str||'')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  async function load(){
    clearErr();
    setStatus('Loading...');
    const date = dateEl.value || todayISO();
    const data = await api(${JSON.stringify(PANEL_BASE)} + '/api/' + encodeURIComponent(botKey) + '/holidays?date=' + encodeURIComponent(date));
    render(data.items);
    setStatus('Loaded: ' + (data.items ? data.items.length : 0));
  }

  dateEl.value = todayISO();
  dateEl.addEventListener('change', () => load().catch(e => showErr(e.message)));

  addBtn.addEventListener('click', async () => {
    clearErr();
    const date = dateEl.value;
    const title = titleEl.value.trim();
    const note = noteEl.value.trim();
    if(!date) return showErr('Please pick a date.');
    if(!title) return showErr('Title is required.');
    try{
      setStatus('Saving...');
      const data = await api(${JSON.stringify(PANEL_BASE)} + '/api/' + encodeURIComponent(botKey) + '/holidays', {
        method:'POST',
        body: JSON.stringify({ date, title, note })
      });
      titleEl.value = '';
      noteEl.value = '';
      render(data.items);
      setStatus('Saved');
    }catch(e){
      showErr(e.message);
      setStatus('Error');
    }
  });

  rowsEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-del]');
    if(!btn) return;
    const id = btn.getAttribute('data-del');
    if(!confirm('Delete holiday #' + id + '?')) return;
    try{
      clearErr();
      setStatus('Deleting...');
      await api(${JSON.stringify(PANEL_BASE)} + '/api/' + encodeURIComponent(botKey) + '/holidays/' + encodeURIComponent(id), { method:'DELETE' });
      await load();
      setStatus('Deleted');
    }catch(e){
      showErr(e.message);
      setStatus('Error');
    }
  });

  load().catch(e => showErr(e.message));
})();
</script>
</body>
</html>`);
});

// Messages page route
app.get(`${PANEL_BASE}/bot/:botKey/messages`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");
  res.send(generateMessagesPage(bot, PANEL_BASE));
});

// User statistics page route
app.get(`${PANEL_BASE}/bot/:botKey/stats`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");
  res.send(generateStatsPage(bot, PANEL_BASE));
});

// AI Engagement page
app.get(`${PANEL_BASE}/bot/:botKey/ai-engagement`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");
  res.send(generateAIEngagementPage(bot, PANEL_BASE));
});

// Commands documentation page
app.get(`${PANEL_BASE}/bot/:botKey/commands`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");
  res.send(generateCommandsPage(bot, PANEL_BASE));
});

// Accuracy monitor page
app.get(`${PANEL_BASE}/bot/:botKey/accuracy`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");
  
  // Set db in app.locals for the handler to access
  req.app.locals.db = db;
  await generateAccuracyMonitorPage(bot, PANEL_BASE)(req, res);
});

// Accuracy API - Reconciliation
app.post(`${PANEL_BASE}/api/accuracy/reconcile`, requireAuth, async (req, res) => {
  try {
    const { guildId } = req.body;
    if (!guildId) {
      return res.json({ success: false, error: "Missing guild ID" });
    }

    const { reconcileGuild } = require("./features/reconciliation");
    const result = await reconcileGuild(db, guildId);

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("[API Reconciliation] Error:", err);
    res.json({ success: false, error: err.message });
  }
});

// Accuracy API - Full Sync
app.post(`${PANEL_BASE}/api/accuracy/fullsync`, requireAuth, async (req, res) => {
  try {
    const { guildId } = req.body;
    if (!guildId) {
      return res.json({ success: false, error: "Missing guild ID" });
    }

    const { reconcileAllGuilds } = require("./features/reconciliation");
    const result = guildId ? await reconcileGuild(db, guildId) : await reconcileAllGuilds(db, client);

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("[API Full Sync] Error:", err);
    res.json({ success: false, error: err.message });
  }
});

// Holidays API
app.get(`${PANEL_BASE}/api/:botKey/holidays`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const iso = String(req.query.date || "").trim();
  const date = iso || new Date().toISOString().slice(0, 10);

  try {
    const items = await holidaysPanelList(db, date);
    return res.json({ ok: true, date, items });
  } catch (e) {
    console.error("holidays list error:", e);
    return res.status(400).json({ error: e?.message || "Failed to list holidays" });
  }
});

app.post(`${PANEL_BASE}/api/:botKey/holidays`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const date = String(req.body?.date || "").trim();
  const title = String(req.body?.title || "").trim();
  const note = String(req.body?.note || "").trim();

  if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
  if (!title) return res.status(400).json({ error: "title is required" });

  try {
    const items = await holidaysPanelAdd(db, date, title, note);
    return res.json({ ok: true, date, items });
  } catch (e) {
    console.error("holidays add error:", e);
    return res.status(400).json({ error: e?.message || "Failed to add holiday" });
  }
});

app.delete(`${PANEL_BASE}/api/:botKey/holidays/:id`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const id = Number.parseInt(String(req.params.id || ""), 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    await holidaysPanelRemove(db, id);
    return res.json({ ok: true });
  } catch (e) {
    console.error("holidays delete error:", e);
    return res.status(400).json({ error: e?.message || "Failed to delete holiday" });
  }
});

// AI Engagement API
app.get(`${PANEL_BASE}/api/:botKey/ai-engagement/settings`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.query.guildId || "");
  if (!guildId) return res.status(400).json({ error: "guildId query parameter required" });

  try {
    const settings = await getEngagementSettings(db, guildId);
    const stats = await getEngagementStats(db, guildId);
    return res.json({ settings, stats });
  } catch (e) {
    console.error("AI engagement settings get error:", e);
    return res.status(500).json({ error: e?.message || "Failed to get settings" });
  }
});

app.post(`${PANEL_BASE}/api/:botKey/ai-engagement/settings`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.body?.guildId || "");
  const settings = req.body?.settings;

  if (!guildId) return res.status(400).json({ error: "guildId required" });
  if (!settings) return res.status(400).json({ error: "settings required" });

  try {
    await updateEngagementSettings(db, guildId, settings);
    return res.json({ ok: true });
  } catch (e) {
    console.error("AI engagement settings update error:", e);
    return res.status(500).json({ error: e?.message || "Failed to update settings" });
  }
});

// AI Engagement History
app.get(`${PANEL_BASE}/api/:botKey/ai-engagement/history`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.query.guildId || "");
  const limit = parseInt(req.query.limit || "20");

  if (!guildId) return res.status(400).json({ error: "guildId query parameter required" });

  try {
    const history = await dbAll(
      `SELECT * FROM ai_engagement_history 
       WHERE guild_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [guildId, limit]
    );
    return res.json({ history });
  } catch (e) {
    console.error("AI engagement history get error:", e);
    return res.status(500).json({ error: e?.message || "Failed to get history" });
  }
});

// AI Engagement Test
app.post(`${PANEL_BASE}/api/:botKey/ai-engagement/test`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.body?.guildId || "");
  if (!guildId) return res.status(400).json({ error: "guildId required" });

  try {
    console.log("[AI Test] Generating test response for guild:", guildId);
    const { generateContextualResponse } = require("./features/ml-engine");
    const mockContext = {
      sentiment: { score: 0.7, comparative: 0.05, label: "POSITIVE" },
      topics: ["greeting", "positive"],
      messageText: "Привет! Как дела?",
      confidence: 0.75, // Add confidence score
    };
    const result = await generateContextualResponse(mockContext, 0.2);
    console.log("[AI Test] Generated result:", result);
    
    // Extract response string from result object
    const response = result?.response || null;
    
    return res.json({ 
      response,
      confidence: result?.confidence,
      method: result?.method 
    });
  } catch (e) {
    console.error("AI engagement test error:", e);
    return res.status(500).json({ error: e?.message || "Failed to generate test response" });
  }
});

// AI Engagement Clear History
app.delete(`${PANEL_BASE}/api/:botKey/ai-engagement/history`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.body?.guildId || "");
  if (!guildId) return res.status(400).json({ error: "guildId required" });

  try {
    await dbRun(db, `DELETE FROM ai_engagement_history WHERE guild_id = ?`, [guildId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("AI engagement clear history error:", e);
    return res.status(500).json({ error: e?.message || "Failed to clear history" });
  }
});

// AI Engagement Train Model
app.post(`${PANEL_BASE}/api/:botKey/ai-engagement/train`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const channelId = String(req.body?.channelId || "");
  const messageLimit = parseInt(req.body?.messageLimit || "500");

  if (!channelId) return res.status(400).json({ error: "channelId required" });

  try {
    console.log(`[AI Train] Training model from channel ${channelId} (limit: ${messageLimit})`);
    const { trainFromDiscordChannel } = require("./features/markov-generator");
    
    const result = await trainFromDiscordChannel(bot.client, channelId, messageLimit);
    
    console.log(`[AI Train] Training complete! Processed ${result.messagesProcessed} messages`);
    return res.json({ 
      ok: true, 
      messagesProcessed: result.messagesProcessed,
      stats: result.stats
    });
  } catch (e) {
    console.error("AI engagement train error:", e);
    return res.status(500).json({ error: e?.message || "Failed to train model" });
  }
});

// AI Engagement Get Model Stats
app.get(`${PANEL_BASE}/api/:botKey/ai-engagement/model-stats`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  try {
    const { getMarkovStats } = require("./features/markov-generator");
    const stats = getMarkovStats();
    return res.json({ stats });
  } catch (e) {
    console.error("AI engagement model stats error:", e);
    return res.status(500).json({ error: e?.message || "Failed to get model stats" });
  }
});

// AI Engagement Clear History
app.delete(`${PANEL_BASE}/api/:botKey/ai-engagement/history`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.body?.guildId || "");
  if (!guildId) return res.status(400).json({ error: "guildId required" });

  try {
    await dbRun(db, `DELETE FROM ai_engagement_history WHERE guild_id = ?`, [guildId]);
    return res.json({ ok: true });
  } catch (e) {
    console.error("AI engagement clear history error:", e);
    return res.status(500).json({ error: e?.message || "Failed to clear history" });
  }
});



// Rate Limiter page
app.get(`${PANEL_BASE}/bot/:botKey/rate-limits`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");
  res.send(generateRateLimiterPage(bot, PANEL_BASE));
});

// Consecutive Limiter page
app.get(`${PANEL_BASE}/bot/:botKey/consecutive-limits`, requireAuth, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).send("Bot not found");
  res.send(generateConsecutiveLimiterPage(bot, PANEL_BASE));
});

// Rate Limiter API - Get configuration
app.get(`${PANEL_BASE}/api/:botKey/rate-limits/config`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.query.guildId || "");
  const channelId = String(req.query.channelId || "");

  if (!guildId) return res.status(400).json({ error: "guildId query parameter required" });
  if (!channelId) return res.status(400).json({ error: "channelId query parameter required" });

  try {
    const config = await getRateLimitConfig(db, guildId, channelId);
    const stats = await getRateLimitStats(db, guildId, channelId);
    return res.json({ config, stats });
  } catch (e) {
    console.error("Rate limit config get error:", e);
    return res.status(500).json({ error: e?.message || "Failed to get config" });
  }
});

// API: Get guild roles (for role name resolution in rate limiter)
app.get(`${PANEL_BASE}/api/:botKey/roles`, requireAuth, apiLimiter, async (req, res) => {
  try {
    const { guildId } = req.query;
    if (!guildId) {
      return res.status(400).json({ error: "guildId is required" });
    }

    const guild = await client.guilds.fetch(guildId);
    const roles = await guild.roles.fetch();

    const rolesList = Array.from(roles.values())
      .filter(role => role.id !== guild.id) // Exclude @everyone role
      .map(role => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
      }))
      .sort((a, b) => b.position - a.position); // Sort by position (highest first)

    return res.json({ roles: rolesList });
  } catch (e) {
    console.error("Failed to fetch roles:", e);
    return res.status(500).json({ error: "Failed to fetch roles" });
  }
});

// Rate Limiter API - Set configuration
app.post(`${PANEL_BASE}/api/:botKey/rate-limits/config`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.body?.guildId || "");
  const channelId = String(req.body?.channelId || "");
  const config = req.body?.config;

  if (!guildId) return res.status(400).json({ error: "guildId required" });
  if (!channelId) return res.status(400).json({ error: "channelId required" });
  if (!config) return res.status(400).json({ error: "config required" });

  try {
    await setRateLimitConfig(db, guildId, channelId, config);
    return res.json({ ok: true });
  } catch (e) {
    console.error("Rate limit config update error:", e);
    return res.status(500).json({ error: e?.message || "Failed to update config" });
  }
});

// Get strikes for a guild
app.get(`${PANEL_BASE}/api/:botKey/rate-limits/strikes`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.query?.guildId || "");
  if (!guildId) return res.status(400).json({ error: "guildId required" });

  try {
    const users = await getUsersWithStrikes(db, guildId);
    
    // Fetch usernames from Discord
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      for (const user of users) {
        try {
          const member = await guild.members.fetch(user.user_id).catch(() => null);
          user.username = member ? (member.user.username || member.user.tag) : null;
        } catch (e) {
          user.username = null;
        }
      }
    }
    
    return res.json({ users });
  } catch (e) {
    console.error("Get strikes error:", e);
    return res.status(500).json({ error: e?.message || "Failed to get strikes" });
  }
});

// Clear strikes for a user
app.delete(`${PANEL_BASE}/api/:botKey/rate-limits/strikes/:userId`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.query?.guildId || "");
  const userId = req.params.userId;

  if (!guildId) return res.status(400).json({ error: "guildId required" });
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    await clearUserStrikes(db, guildId, userId);
    return res.json({ ok: true });
  } catch (e) {
    console.error("Clear strikes error:", e);
    return res.status(500).json({ error: e?.message || "Failed to clear strikes" });
  }
});

// Get countdown configuration
app.get(`${PANEL_BASE}/api/:botKey/countdown/config`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.query?.guildId || "");
  if (!guildId) return res.status(400).json({ error: "guildId required" });

  try {
    const config = await getCountdownConfig(db, guildId);
    return res.json({ config });
  } catch (e) {
    console.error("Get countdown config error:", e);
    return res.status(500).json({ error: e?.message || "Failed to get config" });
  }
});

// Set countdown configuration
app.post(`${PANEL_BASE}/api/:botKey/countdown/config`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.body?.guildId || "");
  const config = req.body?.config;

  if (!guildId) return res.status(400).json({ error: "guildId required" });
  if (!config) return res.status(400).json({ error: "config required" });

  try {
    await setCountdownConfig(db, guildId, config);
    return res.json({ ok: true });
  } catch (e) {
    console.error("Set countdown config error:", e);
    return res.status(500).json({ error: e?.message || "Failed to set config" });
  }
});

// Test countdown (manually trigger post)
app.post(`${PANEL_BASE}/api/:botKey/countdown/test`, requireAuth, apiLimiter, async (req, res) => {
  const bot = bots.find((b) => b.key === req.params.botKey);
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  const guildId = String(req.body?.guildId || "");
  if (!guildId) return res.status(400).json({ error: "guildId required" });

  try {
    const config = await getCountdownConfig(db, guildId);
    if (!config.channel_id) {
      return res.status(400).json({ error: "No channel configured" });
    }

    // Generate countdown embed
    const now = new Date();
    const newYear = new Date("2026-01-01T00:00:00+03:00"); // Moscow timezone
    const diff = newYear.getTime() - now.getTime();

    let description;
    if (diff <= 0) {
      description = "С Новым Годом! 🎉";
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      description = `**${days}** ${ruPlural(days,"день", "дня", "дней")}, **${hours}** ${ruPlural(hours, "час", "часа", "часов")}, **${minutes}** ${ruPlural(minutes, "минута", "минуты", "минут")}, **${seconds}** ${ruPlural(seconds, "секунда", "секунды", "секунд")}`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🎆 Обратный отсчёт до Нового Года 2026!")
      .setDescription(description)
      .setColor(0xfbbf24)
      .setTimestamp();

    // Send to configured channel
    const channel = await client.channels.fetch(config.channel_id);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: "Invalid channel" });
    }

    await channel.send({ embeds: [embed] });
    await updateCountdownLastPosted(db, guildId);

    return res.json({ ok: true });
  } catch (e) {
    console.error("Test countdown error:", e);
    return res.status(500).json({ error: e?.message || "Failed to send countdown" });
  }
});

// -------------------------
// Start web server
// -------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`JepsenCloud running on http://localhost:${PORT}`);
  console.log(`Landing: http://localhost:${PORT}/`);
  console.log(`Panel:   http://localhost:${PORT}${PANEL_BASE}/login`);
});

// -------------------------
// DISCORD LOGIN
// -------------------------
client.login(TOKEN);

/* 
# reload unit files (only needed if you edited the .service file)
sudo systemctl daemon-reload

# restart the bot
sudo systemctl restart jepsencloud-bot.service

# check status (full, no pager)
sudo systemctl status jepsencloud-bot.service --no-pager -l
*/