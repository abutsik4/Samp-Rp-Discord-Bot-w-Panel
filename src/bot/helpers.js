"use strict";
/**
 * Bot helper functions — extracted from index.js
 *
 * Call `init({ db, dbRun, dbGet, dbAll })` once at startup before using
 * any DB-dependent helpers.
 */

const { ActivityType } = require("discord.js");

// ── Module-level DB references (set via init) ──────────────────────────
let _db = null;
let _dbRun = null;
let _dbGet = null;
let _dbAll = null;

function init({ db, dbRun, dbGet, dbAll }) {
  _db = db;
  _dbRun = dbRun;
  _dbGet = dbGet;
  _dbAll = dbAll;
}

// ── Pure utilities ─────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ruPlural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Returns tenure as "X лет Y месяцев" (calendar-like, not just days)
 */
function formatTimeOnServer(joinedAt, now = new Date()) {
  if (!(joinedAt instanceof Date) || Number.isNaN(joinedAt.getTime())) return "Unknown";

  let years = now.getFullYear() - joinedAt.getFullYear();
  let months = now.getMonth() - joinedAt.getMonth();

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

// ── Disabled-commands helpers ──────────────────────────────────────────

async function disableCommand(guildId, commandName, disabledBy = null) {
  const now = Date.now();
  await _dbRun(
    `INSERT OR REPLACE INTO disabled_commands (guild_id, command_name, disabled_at, disabled_by) VALUES (?, ?, ?, ?)`,
    [guildId, commandName, now, disabledBy]
  );
}

async function enableCommand(guildId, commandName) {
  await _dbRun(
    `DELETE FROM disabled_commands WHERE guild_id = ? AND command_name = ?`,
    [guildId, commandName]
  );
}

async function isCommandDisabled(guildId, commandName) {
  const row = await _dbGet(
    `SELECT 1 FROM disabled_commands WHERE guild_id = ? AND command_name = ?`,
    [guildId, commandName]
  );
  return !!row;
}

async function getDisabledCommands(guildId) {
  return await _dbAll(
    `SELECT command_name, disabled_at, disabled_by FROM disabled_commands WHERE guild_id = ? ORDER BY command_name`,
    [guildId]
  );
}

async function setCommandCategoryChannel(guildId, commandCategory, channelId, updatedBy = null) {
  await _dbRun(
    `INSERT INTO command_channel_restrictions (guild_id, command_category, channel_id, updated_at, updated_by)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(guild_id, command_category)
     DO UPDATE SET channel_id = excluded.channel_id, updated_at = datetime('now'), updated_by = excluded.updated_by`,
    [guildId, commandCategory, channelId, updatedBy]
  );
}

async function clearCommandCategoryChannel(guildId, commandCategory) {
  await _dbRun(
    `DELETE FROM command_channel_restrictions WHERE guild_id = ? AND command_category = ?`,
    [guildId, commandCategory]
  );
}

async function getCommandCategoryChannel(guildId, commandCategory) {
  const row = await _dbGet(
    `SELECT channel_id, updated_at, updated_by
     FROM command_channel_restrictions
     WHERE guild_id = ? AND command_category = ?`,
    [guildId, commandCategory]
  );
  return row || null;
}

async function listCommandCategoryChannels(guildId) {
  return await _dbAll(
    `SELECT command_category, channel_id, updated_at, updated_by
     FROM command_channel_restrictions
     WHERE guild_id = ?
     ORDER BY command_category`,
    [guildId]
  );
}

async function isCommandCategoryAllowedInChannel(guildId, commandCategory, channelId) {
  const row = await getCommandCategoryChannel(guildId, commandCategory);
  if (!row?.channel_id) return true;
  return row.channel_id === channelId;
}

// ── Stats: increment / decrement / query ───────────────────────────────

async function incrementMessageCount(guildId, userId) {
  try {
    await _dbRun(
      `INSERT INTO user_stats (guild_id, user_id, message_count)
       VALUES (?, ?, 1)
       ON CONFLICT(guild_id, user_id)
       DO UPDATE SET message_count = message_count + 1`,
      [guildId, userId]
    );
  } catch (err) {
    console.error("Error incrementing message count:", err);
  }
}

async function decrementMessageCount(guildId, userId, by = 1) {
  const n = Number.isFinite(by) && by > 0 ? Math.floor(by) : 1;
  try {
    await _dbRun(
      `UPDATE user_stats
       SET message_count = CASE
         WHEN message_count - ? < 0 THEN 0
         ELSE message_count - ?
       END
       WHERE guild_id = ? AND user_id = ?`,
      [n, n, guildId, userId]
    );
  } catch (err) {
    console.error("Error decrementing message count:", err);
  }
}

async function getUserMessageCount(guildId, userId) {
  try {
    const row = await _dbGet(
      `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    return row ? row.message_count : 0;
  } catch (err) {
    console.error("Error getting message count:", err);
    return 0;
  }
}

async function resetStats() {
  await _dbRun(`DELETE FROM user_stats`);
}

// ── Leaderboard caching ────────────────────────────────────────────────

const leaderboardCache = new Map(); // guildId:limit -> { data, timestamp }
const CACHE_TTL = 60000; // 60 seconds

function getCachedLeaderboard(guildId, limit) {
  const key = `${guildId}:${limit}`;
  const cached = leaderboardCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
  return null;
}

function setCachedLeaderboard(guildId, limit, data) {
  const key = `${guildId}:${limit}`;
  leaderboardCache.set(key, { data, timestamp: Date.now() });
  if (leaderboardCache.size > 100) {
    const firstKey = leaderboardCache.keys().next().value;
    leaderboardCache.delete(firstKey);
  }
}

async function getTopUsers(guildId, limit) {
  const fetchLimit = limit + 10;
  try {
    return await _dbAll(
      `SELECT user_id, message_count
       FROM user_stats
       WHERE guild_id = ?
       ORDER BY message_count DESC
       LIMIT ?`,
      [guildId, fetchLimit]
    ) || [];
  } catch (err) {
    console.error("Error getting top users:", err);
    return [];
  }
}

// ── Presence rotation ──────────────────────────────────────────────────

const STATUS_ROTATION_ENABLED = (process.env.STATUS_ROTATION_ENABLED || "true").toLowerCase() === "true";
const STATUS_ROTATION_INTERVAL_MINUTES = Number.parseInt(process.env.STATUS_ROTATION_INTERVAL_MINUTES || "35", 10);
const STATUS_EMOJI_POOL = ["🚗", "🌴", "💨", "🎮", "⭐", "🔥", "🏁", "🎧", "🚓", "💚"];

const STATUS_POOL = [
  // Playing — GTA SA миссии, локации, геймплей
  { type: ActivityType.Playing, name: "GTA: San Andreas" },
  { type: ActivityType.Playing, name: "за CJ'я на Grove Street" },
  { type: ActivityType.Playing, name: "в SAMP-RP" },
  { type: ActivityType.Playing, name: "миссию за Big Smoke" },
  { type: ActivityType.Playing, name: "за Sweet'а на раёне" },
  { type: ActivityType.Playing, name: "в казино Лас-Вентурас" },
  { type: ActivityType.Playing, name: "в гонку по Лос-Сантосу" },
  { type: ActivityType.Playing, name: "в стрелку за территорию" },
  { type: ActivityType.Playing, name: "в автошколу Сан-Фиерро" },
  { type: ActivityType.Playing, name: "за Ryder'а на районе" },
  { type: ActivityType.Playing, name: "в войну банд" },
  { type: ActivityType.Playing, name: "миссию «Поезд, CJ!»" },
  { type: ActivityType.Playing, name: "в спортзале Ganton" },
  { type: ActivityType.Playing, name: "в угон тачки с парковки" },

  // Watching — наблюдение за миром SA
  { type: ActivityType.Watching, name: "за порядком в Grove Street" },
  { type: ActivityType.Watching, name: "за территориями банд" },
  { type: ActivityType.Watching, name: "за движем в Лос-Сантосе" },
  { type: ActivityType.Watching, name: "как CJ качается в зале" },
  { type: ActivityType.Watching, name: "за трафиком на трассе" },
  { type: ActivityType.Watching, name: "за закатом в Лас-Вентурас" },
  { type: ActivityType.Watching, name: "за wanted-уровнем игроков" },

  // Listening — радиостанции GTA SA
  { type: ActivityType.Listening, name: "Radio Los Santos" },
  { type: ActivityType.Listening, name: "K-DST в машине" },
  { type: ActivityType.Listening, name: "San Andreas Soundtrack" },
  { type: ActivityType.Listening, name: "Radio X на полную" },
  { type: ActivityType.Listening, name: "Master Sounds 98.3" },
  { type: ActivityType.Listening, name: "West Coast Classics" },
  { type: ActivityType.Listening, name: "Bounce FM в Саваннe" },

  // Competing — соревнования в стиле SA
  { type: ActivityType.Competing, name: "за контроль Grove Street" },
  { type: ActivityType.Competing, name: "кто быстрее на BMX" },
  { type: ActivityType.Competing, name: "за топ по wanted-уровню" },
  { type: ActivityType.Competing, name: "в гонке по шоссе" },
];

function pickRandomStatusEmoji() {
  return STATUS_EMOJI_POOL[Math.floor(Math.random() * STATUS_EMOJI_POOL.length)];
}

function decoratePresenceName(name) {
  const prefixEmoji = pickRandomStatusEmoji();
  const suffixEmoji = pickRandomStatusEmoji();
  return `${prefixEmoji} ${name} ${suffixEmoji}`;
}

async function setRandomPresence(client) {
  if (!client?.user) return;
  const pick = STATUS_POOL[Math.floor(Math.random() * STATUS_POOL.length)];
  const activity = { ...pick, name: decoratePresenceName(pick.name) };
  try {
    client.user.setPresence({ status: "online", activities: [activity] });
  } catch (e) {
    console.warn("Presence update failed:", e?.message || e);
  }
}

// ── Message-index helpers ──────────────────────────────────────────────

async function indexMessage(guildId, messageId, userId, channelId) {
  try {
    await _dbRun(
      `INSERT OR IGNORE INTO message_index (guild_id, message_id, user_id, channel_id) VALUES (?, ?, ?, ?)`,
      [guildId, messageId, userId, channelId]
    );
  } catch {}
}

async function cacheUserUsername(guildId, userId, username, avatarUrl = null) {
  try {
    await _dbRun(
      `INSERT INTO user_cache (guild_id, user_id, username, avatar_url, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id, user_id)
       DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url, updated_at = datetime('now')`,
      [guildId, userId, username, avatarUrl]
    );
  } catch (err) {
    console.warn(`[Cache] Failed to cache username for user ${userId}:`, err.message);
  }
}

async function lookupIndexedAuthor(guildId, messageId) {
  try {
    const row = await _dbGet(
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
    await _dbRun(`DELETE FROM message_index WHERE guild_id = ? AND message_id = ?`, [guildId, messageId]);
  } catch {}
}

async function lookupIndexedAuthorsBulk(guildId, messageIds) {
  const out = new Map();
  const chunkSize = 400;
  for (let i = 0; i < messageIds.length; i += chunkSize) {
    const chunk = messageIds.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => "?").join(",");
    const rows = await _dbAll(
      `SELECT user_id, COUNT(*) as c
       FROM message_index
       WHERE guild_id = ? AND message_id IN (${placeholders})
       GROUP BY user_id`,
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
    await _dbRun(
      `DELETE FROM message_index WHERE guild_id = ? AND message_id IN (${placeholders})`,
      [guildId, ...chunk]
    );
  }
}

// ── Operation history ──────────────────────────────────────────────────

async function recordOperation(guildId, actorId, operation, scope, targetId, before, after) {
  const timestamp = Math.floor(Date.now() / 1000);
  const result = await _dbRun(
    `INSERT INTO operation_history (guild_id, actor_id, operation, scope, target_id, payload_before, payload_after, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [guildId, actorId, operation, scope, targetId, JSON.stringify(before), JSON.stringify(after), timestamp]
  );
  return result.lastID;
}

async function performUndo(historyRow) {
  const before = JSON.parse(historyRow.payload_before);
  const guildId = historyRow.guild_id;

  if (historyRow.scope === "user" && historyRow.target_id) {
    const userId = historyRow.target_id;
    await _dbRun(
      `INSERT OR REPLACE INTO user_stats (guild_id, user_id, message_count) VALUES (?, ?, ?)`,
      [guildId, userId, before.message_count || 0]
    );
  } else if (historyRow.scope === "server") {
    await _dbRun(`DELETE FROM user_stats WHERE guild_id = ?`, [guildId]);
    for (const [userId, data] of Object.entries(before)) {
      await _dbRun(
        `INSERT INTO user_stats (guild_id, user_id, message_count) VALUES (?, ?, ?)`,
        [guildId, userId, data.message_count || 0]
      );
    }
  }
}

// ── Exports ────────────────────────────────────────────────────────────

module.exports = {
  init,
  // Pure utilities
  sleep,
  ruPlural,
  formatTimeOnServer,
  // Disabled-commands
  disableCommand,
  enableCommand,
  isCommandDisabled,
  getDisabledCommands,
  setCommandCategoryChannel,
  clearCommandCategoryChannel,
  getCommandCategoryChannel,
  listCommandCategoryChannels,
  isCommandCategoryAllowedInChannel,
  // Stats
  incrementMessageCount,
  decrementMessageCount,
  getUserMessageCount,
  resetStats,
  // Leaderboard cache
  getCachedLeaderboard,
  setCachedLeaderboard,
  getTopUsers,
  // Presence
  STATUS_POOL,
  STATUS_ROTATION_ENABLED,
  STATUS_ROTATION_INTERVAL_MINUTES,
  setRandomPresence,
  // Message index
  indexMessage,
  cacheUserUsername,
  lookupIndexedAuthor,
  removeIndexedMessage,
  lookupIndexedAuthorsBulk,
  removeIndexedBulk,
  // Operation history
  recordOperation,
  performUndo,
};
