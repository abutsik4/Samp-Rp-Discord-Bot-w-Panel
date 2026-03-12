"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Achievement Badges System — GTA SA Themed
 * Tracks and awards themed badges based on message counts, streaks, and reactions.
 *
 * Error codes:
 *   BADGE-001: Table creation failed
 *   BADGE-002: Badge award failed
 *   BADGE-003: Badge lookup failed
 *   BADGE-004: Badge check failed
 */

// Badge definitions: { id, threshold, type, name, emoji, description }
const BADGE_DEFINITIONS = [
  // Message count badges
  { id: "msg_100",   threshold: 100,    type: "messages", name: "Бродяга",              emoji: "🚶", description: "Отправить 100 сообщений" },
  { id: "msg_500",   threshold: 500,    type: "messages", name: "Уличный солдат",       emoji: "🔫", description: "Отправить 500 сообщений" },
  { id: "msg_1000",  threshold: 1000,   type: "messages", name: "Бандит Grove Street",  emoji: "💚", description: "Отправить 1,000 сообщений" },
  { id: "msg_2500",  threshold: 2500,   type: "messages", name: "OG Лос-Сантоса",       emoji: "🏅", description: "Отправить 2,500 сообщений" },
  { id: "msg_5000",  threshold: 5000,   type: "messages", name: "Авторитет района",     emoji: "👑", description: "Отправить 5,000 сообщений" },
  { id: "msg_10000", threshold: 10000,  type: "messages", name: "Дон Лос-Сантоса",      emoji: "🎩", description: "Отправить 10,000 сообщений" },
  { id: "msg_25000", threshold: 25000,  type: "messages", name: "Легенда San Andreas",  emoji: "🌟", description: "Отправить 25,000 сообщений" },
  { id: "msg_50000", threshold: 50000,  type: "messages", name: "Бессмертный CJ",       emoji: "🏆", description: "Отправить 50,000 сообщений" },
  { id: "msg_100k",  threshold: 100000, type: "messages", name: "Бог San Andreas",      emoji: "⭐", description: "Отправить 100,000 сообщений" },

  // Streak badges
  { id: "streak_7",   threshold: 7,   type: "streak", name: "Недельный марафон",   emoji: "🔥", description: "7-дневный стрик" },
  { id: "streak_14",  threshold: 14,  type: "streak", name: "Двухнедельный солдат", emoji: "🔥", description: "14-дневный стрик" },
  { id: "streak_30",  threshold: 30,  type: "streak", name: "Месяц на районе",     emoji: "💎", description: "30-дневный стрик" },
  { id: "streak_90",  threshold: 90,  type: "streak", name: "Квартальный ветеран",  emoji: "💎", description: "90-дневный стрик" },
  { id: "streak_365", threshold: 365, type: "streak", name: "Годовой бог",         emoji: "🏅", description: "365-дневный стрик" },

  // Reaction badges
  { id: "react_50",   threshold: 50,   type: "reactions_given", name: "Щедрый реактор",    emoji: "👍", description: "Поставить 50 реакций" },
  { id: "react_200",  threshold: 200,  type: "reactions_given", name: "Мастер реакций",    emoji: "💖", description: "Поставить 200 реакций" },
  { id: "react_500",  threshold: 500,  type: "reactions_given", name: "Реакционный маньяк", emoji: "🎭", description: "Поставить 500 реакций" },
  { id: "recv_50",    threshold: 50,   type: "reactions_received", name: "Народный любимец",  emoji: "❤️", description: "Получить 50 реакций" },
  { id: "recv_200",   threshold: 200,  type: "reactions_received", name: "Звезда сервера",    emoji: "🌟", description: "Получить 200 реакций" },
  { id: "recv_500",   threshold: 500,  type: "reactions_received", name: "Легенда реакций",   emoji: "🏆", description: "Получить 500 реакций" },
];

// In-memory seed guard so we only seed defaults once per guild *per DB instance*.
// Tests create fresh in-memory DBs, so a process-global guard would prevent seeding.
const _seededGuildsByDb = new WeakMap();

function _getSeededGuildSet(db) {
  if (!db || (typeof db !== "object" && typeof db !== "function")) return null;
  const existing = _seededGuildsByDb.get(db);
  if (existing) return existing;
  const created = new Set();
  _seededGuildsByDb.set(db, created);
  return created;
}

/**
 * Ensure badges table exists
 */
async function ensureBadgesTable(db) {
  try {
    await dbRun(
      db,
      `
      CREATE TABLE IF NOT EXISTS user_badges (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        badge_id TEXT NOT NULL,
        earned_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, user_id, badge_id)
      )
    `
    );
    await dbRun(
      db,
      `CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(guild_id, user_id)`
    );

    // Editable badge definitions (per guild)
    await dbRun(
      db,
      `
      CREATE TABLE IF NOT EXISTS badge_definitions (
        guild_id TEXT NOT NULL,
        badge_id TEXT NOT NULL,
        type TEXT NOT NULL,
        threshold INTEGER NOT NULL,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        description TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY (guild_id, badge_id)
      )
    `
    );
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_badge_definitions_guild ON badge_definitions(guild_id, enabled, sort_order)`);
  } catch (err) {
    console.error("[BADGE-001] Failed to create badges table:", err);
    throw err;
  }
}

async function seedDefaultBadgeDefinitions(db, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return { ok: false, seeded: 0 };
  const seededSet = _getSeededGuildSet(db);
  if (seededSet?.has(gid)) return { ok: true, seeded: 0 };

  try {
    const existing = await dbGet(db, `SELECT COUNT(*) as c FROM badge_definitions WHERE guild_id = ?`, [gid]);
    if (Number(existing?.c || 0) > 0) {
      seededSet?.add(gid);
      return { ok: true, seeded: 0 };
    }

    let seeded = 0;
    for (let i = 0; i < BADGE_DEFINITIONS.length; i += 1) {
      const b = BADGE_DEFINITIONS[i];
      await dbRun(
        db,
        `INSERT OR IGNORE INTO badge_definitions
         (guild_id, badge_id, type, threshold, name, emoji, description, enabled, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [gid, b.id, b.type, Number(b.threshold) || 0, b.name, b.emoji, b.description, i]
      );
      seeded += 1;
    }

    seededSet?.add(gid);
    return { ok: true, seeded };
  } catch (err) {
    console.error("[BADGE-001] Failed to seed badge definitions:", err);
    return { ok: false, seeded: 0 };
  }
}

async function getBadgeDefinitions(db, guildId, { includeDisabled = true } = {}) {
  const gid = String(guildId || "").trim();
  if (!gid) return [];

  // Ensure defaults exist at least once per guild.
  await seedDefaultBadgeDefinitions(db, gid);

  const rows = await dbAll(
    db,
    `SELECT badge_id as id, threshold, type, name, emoji, description, enabled, sort_order
     FROM badge_definitions
     WHERE guild_id = ? ${includeDisabled ? "" : "AND enabled = 1"}
     ORDER BY enabled DESC, sort_order ASC, threshold ASC`,
    [gid]
  );

  return (rows || []).map((r) => ({
    id: String(r.id),
    threshold: Number(r.threshold) || 0,
    type: String(r.type),
    name: String(r.name),
    emoji: String(r.emoji),
    description: String(r.description),
    enabled: Boolean(r.enabled),
    sort_order: Number(r.sort_order) || 0,
  }));
}

async function upsertBadgeDefinition(db, guildId, def) {
  const gid = String(guildId || "").trim();
  if (!gid) throw new Error("guildId required");

  const badgeId = String(def?.id || def?.badge_id || "").trim();
  const type = String(def?.type || "").trim();
  const threshold = Number.parseInt(def?.threshold, 10);
  const name = String(def?.name || "").trim();
  const emoji = String(def?.emoji || "").trim();
  const description = String(def?.description || "").trim();
  const enabled = def?.enabled === undefined ? 1 : (def.enabled ? 1 : 0);
  const sortOrder = Number.isFinite(Number(def?.sort_order)) ? Math.floor(Number(def.sort_order)) : 0;

  if (!badgeId) throw new Error("id required");
  if (!type) throw new Error("type required");
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("threshold must be >= 0");
  if (!name) throw new Error("name required");
  if (!emoji) throw new Error("emoji required");

  await dbRun(
    db,
    `INSERT INTO badge_definitions (guild_id, badge_id, type, threshold, name, emoji, description, enabled, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(guild_id, badge_id)
     DO UPDATE SET type = excluded.type,
                   threshold = excluded.threshold,
                   name = excluded.name,
                   emoji = excluded.emoji,
                   description = excluded.description,
                   enabled = excluded.enabled,
                   sort_order = excluded.sort_order,
                   updated_at = (strftime('%s','now'))`,
    [gid, badgeId, type, threshold, name, emoji, description, enabled, sortOrder]
  );

  _getSeededGuildSet(db)?.add(gid);

  return { ok: true };
}

async function deleteBadgeDefinition(db, guildId, badgeId) {
  const gid = String(guildId || "").trim();
  const bid = String(badgeId || "").trim();
  if (!gid) throw new Error("guildId required");
  if (!bid) throw new Error("badgeId required");
  await dbRun(db, `DELETE FROM badge_definitions WHERE guild_id = ? AND badge_id = ?`, [gid, bid]);
  return { ok: true };
}

/**
 * Award a badge to a user (idempotent)
 * @returns {boolean} true if newly awarded, false if already had it
 */
async function awardBadge(db, guildId, userId, badgeId) {
  try {
    const existing = await dbGet(
      db,
      `SELECT 1 FROM user_badges WHERE guild_id = ? AND user_id = ? AND badge_id = ?`,
      [guildId, userId, badgeId]
    );
    if (existing) return false;

    await dbRun(
      db,
      `INSERT OR IGNORE INTO user_badges (guild_id, user_id, badge_id) VALUES (?, ?, ?)`,
      [guildId, userId, badgeId]
    );
    return true;
  } catch (err) {
    console.error(`[BADGE-002] Failed to award badge ${badgeId} to user ${userId}:`, err);
    return false;
  }
}

/**
 * Check and award any new badges based on current stats
 * @returns {Array} Array of newly awarded badge definitions
 */
async function checkAndAwardBadges(db, guildId, userId, stats) {
  const newBadges = [];

  try {
    const defs = await getBadgeDefinitions(db, guildId, { includeDisabled: false });
    const existingBadges = await dbAll(
      db,
      `SELECT badge_id FROM user_badges WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    const existingSet = new Set(existingBadges.map((r) => r.badge_id));

    for (const badge of defs) {
      if (existingSet.has(badge.id)) continue;

      let currentValue = 0;
      switch (badge.type) {
        case "messages":
          currentValue = stats.messageCount || 0;
          break;
        case "streak":
          currentValue = stats.currentStreak || 0;
          break;
        case "reactions_given":
          currentValue = stats.reactionsGiven || 0;
          break;
        case "reactions_received":
          currentValue = stats.reactionsReceived || 0;
          break;
        default:
          continue;
      }

      if (currentValue >= badge.threshold) {
        const awarded = await awardBadge(db, guildId, userId, badge.id);
        if (awarded) {
          newBadges.push(badge);
        }
      }
    }
  } catch (err) {
    console.error(`[BADGE-004] Badge check failed for user ${userId}:`, err);
  }

  return newBadges;
}

/**
 * Get all badges for a user
 */
async function getUserBadges(db, guildId, userId) {
  try {
    const rows = await dbAll(
      db,
      `SELECT badge_id, earned_at FROM user_badges WHERE guild_id = ? AND user_id = ? ORDER BY earned_at ASC`,
      [guildId, userId]
    );

    return rows.map((row) => {
      const def = BADGE_DEFINITIONS.find((b) => b.id === row.badge_id);
      return {
        ...row,
        name: def?.name || row.badge_id,
        emoji: def?.emoji || "🏅",
        description: def?.description || "",
        type: def?.type || "unknown",
      };
    });
  } catch (err) {
    console.error(`[BADGE-003] Failed to get badges for user ${userId}:`, err);
    return [];
  }
}

/**
 * Get badge count for a user
 */
async function getUserBadgeCount(db, guildId, userId) {
  try {
    const row = await dbGet(
      db,
      `SELECT COUNT(*) as count FROM user_badges WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    return row?.count || 0;
  } catch (err) {
    console.error(`[BADGE-003] Failed to get badge count for user ${userId}:`, err);
    return 0;
  }
}

/**
 * Format badges as a display string
 */
function formatBadgesDisplay(badges) {
  if (!badges || badges.length === 0) return "Нет значков";
  return badges.map((b) => `${b.emoji} ${b.name}`).join(" • ");
}

/**
 * Get the highest rank badge by message count
 */
function getHighestRankBadge(badges) {
  const msgBadges = badges.filter((b) => b.type === "messages" || BADGE_DEFINITIONS.find(d => d.id === b.badge_id)?.type === "messages");
  if (msgBadges.length === 0) return null;
  
  // Get the last one (highest threshold) 
  const badge = msgBadges[msgBadges.length - 1];
  const def = BADGE_DEFINITIONS.find((d) => d.id === badge.badge_id);
  return def || null;
}

module.exports = {
  BADGE_DEFINITIONS,
  ensureBadgesTable,
  seedDefaultBadgeDefinitions,
  getBadgeDefinitions,
  upsertBadgeDefinition,
  deleteBadgeDefinition,
  awardBadge,
  checkAndAwardBadges,
  getUserBadges,
  getUserBadgeCount,
  formatBadgesDisplay,
  getHighestRankBadge,
};
