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
  } catch (err) {
    console.error("[BADGE-001] Failed to create badges table:", err);
    throw err;
  }
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
    const existingBadges = await dbAll(
      db,
      `SELECT badge_id FROM user_badges WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    const existingSet = new Set(existingBadges.map((r) => r.badge_id));

    for (const badge of BADGE_DEFINITIONS) {
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
  awardBadge,
  checkAndAwardBadges,
  getUserBadges,
  getUserBadgeCount,
  formatBadgesDisplay,
  getHighestRankBadge,
};
