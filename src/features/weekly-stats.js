"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Weekly Stats Module
 * Tracks weekly message counts and provides weekly leaderboard
 */

/**
 * Ensure weekly stats table exists
 */
async function ensureWeeklyStatsTable(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS weekly_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, week_start)
    )
  `
  );

  await dbRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_weekly_stats_week ON weekly_stats(guild_id, week_start)`
  );
}

/**
 * Get current week start (Monday)
 */
function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split("T")[0];
}

/**
 * Increment weekly message count
 */
async function incrementWeeklyCount(db, guildId, userId) {
  const weekStart = getCurrentWeekStart();

  await dbRun(
    db,
    `
    INSERT INTO weekly_stats (guild_id, user_id, week_start, message_count) 
    VALUES (?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id, week_start) 
    DO UPDATE SET message_count = message_count + 1
  `,
    [guildId, userId, weekStart]
  );
}

/**
 * Get top users for current week
 */
async function getWeeklyTopUsers(db, guildId, limit = 10) {
  const weekStart = getCurrentWeekStart();

  return dbAll(
    db,
    `
    SELECT user_id, message_count 
    FROM weekly_stats 
    WHERE guild_id = ? AND week_start = ? 
    ORDER BY message_count DESC 
    LIMIT ?
  `,
    [guildId, weekStart, limit]
  );
}

/**
 * Get user's weekly stats
 */
async function getUserWeeklyStats(db, guildId, userId) {
  const weekStart = getCurrentWeekStart();

  const row = await dbGet(
    db,
    `SELECT message_count FROM weekly_stats WHERE guild_id = ? AND user_id = ? AND week_start = ?`,
    [guildId, userId, weekStart]
  );

  return row?.message_count || 0;
}

/**
 * Decrement weekly message count
 */
async function decrementWeeklyCount(db, guildId, userId) {
  const weekStart = getCurrentWeekStart();

  await dbRun(
    db,
    `UPDATE weekly_stats 
     SET message_count = CASE 
       WHEN message_count - 1 < 0 THEN 0 
       ELSE message_count - 1 
     END
     WHERE guild_id = ? AND user_id = ? AND week_start = ?`,
    [guildId, userId, weekStart]
  );
}

/**
 * Reset weekly stats (call at start of new week)
 */
async function resetWeeklyStats(db, guildId) {
  // We don't delete, we just start tracking new week
  // Old weeks remain for historical data
  return { reset: true, newWeek: getCurrentWeekStart() };
}

module.exports = {
  ensureWeeklyStatsTable,
  getCurrentWeekStart,
  incrementWeeklyCount,
  decrementWeeklyCount,
  getWeeklyTopUsers,
  getUserWeeklyStats,
  resetWeeklyStats,
};
