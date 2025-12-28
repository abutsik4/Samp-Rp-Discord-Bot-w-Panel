"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Message Streak Tracking Module
 * Tracks consecutive days users have sent messages
 */

/**
 * Ensure streak table exists
 */
async function ensureStreakTable(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS user_streaks (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_message_date TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `
  );
}

/**
 * Update user streak when they send a message
 */
async function updateStreak(db, guildId, userId) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const existing = await dbGet(
    db,
    `SELECT current_streak, longest_streak, last_message_date FROM user_streaks WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId]
  );

  if (!existing) {
    // First message ever
    await dbRun(
      db,
      `INSERT INTO user_streaks (guild_id, user_id, current_streak, longest_streak, last_message_date) VALUES (?, ?, 1, 1, ?)`,
      [guildId, userId, today]
    );
    return { currentStreak: 1, longestStreak: 1 };
  }

  const lastDate = existing.last_message_date;
  if (lastDate === today) {
    // Already counted today
    return { currentStreak: existing.current_streak, longestStreak: existing.longest_streak };
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  let newStreak = existing.current_streak;

  if (lastDate === yesterdayStr) {
    // Consecutive day
    newStreak += 1;
  } else {
    // Streak broken, restart
    newStreak = 1;
  }

  const newLongest = Math.max(newStreak, existing.longest_streak);

  await dbRun(
    db,
    `UPDATE user_streaks SET current_streak = ?, longest_streak = ?, last_message_date = ? WHERE guild_id = ? AND user_id = ?`,
    [newStreak, newLongest, today, guildId, userId]
  );

  return { currentStreak: newStreak, longestStreak: newLongest };
}

/**
 * Get user's streak info
 */
async function getStreak(db, guildId, userId) {
  const row = await dbGet(
    db,
    `SELECT current_streak, longest_streak, last_message_date FROM user_streaks WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId]
  );

  if (!row) return { currentStreak: 0, longestStreak: 0 };

  // Check if streak is still valid (was active yesterday or today)
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const isActive = row.last_message_date === today || row.last_message_date === yesterdayStr;

  return {
    currentStreak: isActive ? row.current_streak : 0,
    longestStreak: row.longest_streak,
    lastMessageDate: row.last_message_date,
  };
}

/**
 * Get top streaks on server
 */
async function getTopStreaks(db, guildId, limit = 10) {
  const rows = await dbAll(
    db,
    `
    SELECT user_id, current_streak, longest_streak 
    FROM user_streaks 
    WHERE guild_id = ? AND current_streak > 0
    ORDER BY current_streak DESC 
    LIMIT ?
  `,
    [guildId, limit]
  );

  return rows;
}

module.exports = {
  ensureStreakTable,
  updateStreak,
  getStreak,
  getTopStreaks,
};
