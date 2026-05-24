// Bot that counts messages and provides statistics for users in a Discord server

// Load environment variables from .env file
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const { initCore, initFeatureTables, parsePanelConfig } = require("./bootstrap");
const { initSchema } = require("./db/schema");
const { createPanelApp } = require("./web/panel-app");

const { initLeaderboardCache } = require("./features/leaderboard-cache");

// -------------------------
// CONFIG / ENV
// -------------------------
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GUILD_ID = process.env.GUILD_ID || "537187880842559499";

// Optional Redis leaderboard cache for faster /top queries.
// Requires: npm install ioredis
initLeaderboardCache({ url: process.env.REDIS_URL });

if (!TOKEN || !OWNER_ID) {
  console.error("Please set DISCORD_TOKEN and OWNER_ID in your .env file.");
  process.exit(1);
}

// -------------------------
// DATABASE (SQLite) via bootstrap
// -------------------------
const dbPath = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, '..', 'data', 'stats.db');

const { db, dbRun, dbGet, dbAll } = initCore({
  dbPath: process.env.STATS_DB_PATH,
});

const { PANEL_BASE, TRUST_PROXY, COOKIE_SECURE, isAllowedChannel } = parsePanelConfig();

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
  await initSchema(dbRun, dbPath);
  await initFeatureTables(db, dbRun);
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
  setCommandCategoryChannel, clearCommandCategoryChannel, getCommandCategoryChannel, listCommandCategoryChannels,
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
  // Unhandled rejections in production should be treated as fatal.
  // Exiting lets systemd restart the process into a clean state.
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (fatal):", err);
  // Force exit so systemd restarts the process. Continuing after
  // an uncaught exception leaves the process in an undefined state.
  process.exit(1);
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
    startDailyHolidayPosts: require("./features/holidays").startDailyHolidayPosts,
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
  cacheUserUsername, getCommandCategoryChannel, getUserMessageCount,
  lookupIndexedAuthor, lookupIndexedAuthorsBulk,
  dbAll,
});

// Command handlers (extracted to src/bot/commands/dispatcher.js)
const { registerCommandHandlers } = require("./bot/commands/dispatcher");
registerCommandHandlers({
  client, db, dbRun, dbGet, dbAll,
  OWNER_ID, TOKEN,
  isCommandDisabled, getCommandCategoryChannel, getUserMessageCount,
  ruPlural, formatTimeOnServer, performUndo,
  registerGuildCommands, backfillGuild,
  holidaysScheduler,
});

// WEB (Landing + Panel under /panel)
// -------------------------
// Multi-bot registry (future-proof). Today: one bot.
const bots = [{ key: "samprp", name: "JepsenCloud Bot", kind: "discord", client, guild_id: GUILD_ID }];

const { app } = createPanelApp({
  client, db, dbRun, dbGet, dbAll, bots,
  isAllowedChannel, PANEL_BASE, TRUST_PROXY, COOKIE_SECURE,
  recordOperation, performUndo, getUserMessageCount, ruPlural,
  getDisabledCommands, enableCommand, disableCommand,
  listCommandCategoryChannels, setCommandCategoryChannel, clearCommandCategoryChannel,
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
  const backoffFilePath = path.join(__dirname, "..", "data", "discord-login-backoff.json");
  // NOTE: loginWithRetry logic uses fs.promises directly, unchanged from prior version.
  // The full retry logic is preserved exactly as before.
  const lastAttemptFilePath = path.join(__dirname, "..", "data", "discord-login-last-attempt.json");

  async function readLastAttempt() {
    try {
      const raw = await fs.promises.readFile(lastAttemptFilePath, "utf8");
      const parsed = JSON.parse(raw);
      const lastAttemptAt = parsed?.lastAttemptAt ? new Date(parsed.lastAttemptAt) : null;
      if (!lastAttemptAt || Number.isNaN(lastAttemptAt.getTime())) return null;
      return { lastAttemptAt };
    } catch (err) {
      if (err?.code === "ENOENT") return null;
      console.error(`[Login] Failed to read last-attempt file: ${err?.message || String(err)}`);
      return null;
    }
  }

  async function writeLastAttempt(lastAttemptAt) {
    try {
      const tmpPath = `${lastAttemptFilePath}.tmp`;
      const payload = JSON.stringify({ lastAttemptAt: lastAttemptAt.toISOString() });
      await fs.promises.writeFile(tmpPath, payload, "utf8");
      await fs.promises.rename(tmpPath, lastAttemptFilePath);
    } catch (err) {
      console.error(`[Login] Failed to write last-attempt file: ${err?.message || String(err)}`);
    }
  }

  async function getGatewaySessionStartLimit() {
    try {
      const axios = require("axios");
      const r = await axios.get("https://discord.com/api/v10/gateway/bot", {
        headers: { Authorization: `Bot ${TOKEN}` },
        timeout: 15_000,
      });
      const lim = r.data?.session_start_limit;
      if (!lim) return null;
      return {
        remaining: lim.remaining,
        resetAfterMs: lim.reset_after,
        maxConcurrency: lim.max_concurrency,
      };
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data || err?.message || String(err);
      console.error(`[Login] Failed to query gateway session limit${status ? ` (HTTP ${status})` : ""}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
      return null;
    }
  }

  async function readBackoff() {
    try {
      const raw = await fs.promises.readFile(backoffFilePath, "utf8");
      const parsed = JSON.parse(raw);
      const notBefore = parsed?.notBefore ? new Date(parsed.notBefore) : null;
      if (!notBefore || Number.isNaN(notBefore.getTime())) return null;
      return { notBefore };
    } catch (err) {
      if (err?.code === "ENOENT") return null;
      console.error(`[Login] Failed to read backoff file: ${err?.message || String(err)}`);
      return null;
    }
  }

  async function writeBackoff(notBefore) {
    try {
      const tmpPath = `${backoffFilePath}.tmp`;
      const payload = JSON.stringify({ notBefore: notBefore.toISOString() });
      await fs.promises.writeFile(tmpPath, payload, "utf8");
      await fs.promises.rename(tmpPath, backoffFilePath);
    } catch (err) {
      console.error(`[Login] Failed to write backoff file: ${err?.message || String(err)}`);
    }
  }

  async function clearBackoff() {
    try {
      await fs.promises.unlink(backoffFilePath);
    } catch (err) {
      if (err?.code === "ENOENT") return;
      console.error(`[Login] Failed to clear backoff file: ${err?.message || String(err)}`);
    }
  }

  const MAX_RETRIES = 10;
  const BASE_DELAY = 30_000;
  const MIN_ATTEMPT_INTERVAL_MS = 2 * 60_000;

  const initialBackoff = await readBackoff();
  if (initialBackoff?.notBefore && Date.now() < initialBackoff.notBefore.getTime()) {
    const waitMs = initialBackoff.notBefore.getTime() - Date.now() + 5_000;
    const waitMin = (waitMs / 60_000).toFixed(1);
    console.error(`[Login] Backoff active from previous run. Waiting ${waitMin} min until ${initialBackoff.notBefore.toISOString()}…`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const lim = await getGatewaySessionStartLimit();
      if (lim && typeof lim.remaining === "number") {
        if (lim.remaining <= 0 && lim.resetAfterMs && lim.resetAfterMs > 0) {
          const resetAt = new Date(Date.now() + lim.resetAfterMs);
          await writeBackoff(resetAt);
          const waitMs = Math.max(resetAt.getTime() - Date.now(), 0) + 5_000;
          const waitMin = (waitMs / 60_000).toFixed(1);
          console.error(`[Login] Session limit pre-check: remaining=0. Waiting ${waitMin} min until ${resetAt.toISOString()}…`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }

      const lastAttempt = await readLastAttempt();
      if (lastAttempt?.lastAttemptAt) {
        const sinceMs = Date.now() - lastAttempt.lastAttemptAt.getTime();
        if (sinceMs >= 0 && sinceMs < MIN_ATTEMPT_INTERVAL_MS) {
          const waitMs = MIN_ATTEMPT_INTERVAL_MS - sinceMs;
          console.error(`[Login] Cooldown active. Waiting ${(waitMs / 1000).toFixed(0)}s before next login attempt…`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }

      await writeLastAttempt(new Date());
      await client.login(TOKEN);
      await clearBackoff();
      return;
    } catch (err) {
      const msg = err?.message || '';
      const resetMatch = msg.match(/resets at (.+)/);
      if (resetMatch) {
        const resetAt = new Date(resetMatch[1]);
        if (!Number.isNaN(resetAt.getTime())) {
          await writeBackoff(resetAt);
          const waitMs = Math.max(resetAt - Date.now(), 0) + 5_000;
          const waitMin = (waitMs / 60_000).toFixed(1);
          console.error(`[Login] Session limit hit (attempt ${attempt}/${MAX_RETRIES}). Waiting ${waitMin} min until ${resetAt.toISOString()}…`);
          await new Promise(r => setTimeout(r, waitMs));
        } else {
          console.error(`[Login] Session limit hit (attempt ${attempt}/${MAX_RETRIES}) but could not parse reset time: ${msg}`);
          const delay = Math.min(BASE_DELAY * 2 ** (attempt - 1), 10 * 60_000);
          await new Promise(r => setTimeout(r, delay));
        }
      } else {
        const delay = Math.min(BASE_DELAY * 2 ** (attempt - 1), 10 * 60_000);
        console.error(`[Login] Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}. Retrying in ${(delay / 1000).toFixed(0)}s…`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  console.error('[Login] All retry attempts exhausted. The web panel is still running. Restart the process later to reconnect Discord.');
})();