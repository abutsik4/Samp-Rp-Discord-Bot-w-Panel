"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Reaction Leaderboard Module
 * Tracks reactions given and received by users
 */

/**
 * Ensure reactions table exists
 */
async function ensureReactionsTable(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS user_reactions (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      reactions_given INTEGER NOT NULL DEFAULT 0,
      reactions_received INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `
  );
}

/**
 * Increment reactions given
 */
async function incrementReactionsGiven(db, guildId, userId) {
  await dbRun(
    db,
    `
    INSERT INTO user_reactions (guild_id, user_id, reactions_given, reactions_received, reactions_given_weekly, reactions_received_weekly)
    VALUES (?, ?, 1, 0, 1, 0)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET reactions_given = reactions_given + 1, reactions_given_weekly = reactions_given_weekly + 1
  `,
    [guildId, userId]
  );
}

/**
 * Increment reactions received
 */
async function incrementReactionsReceived(db, guildId, userId) {
  await dbRun(
    db,
    `
    INSERT INTO user_reactions (guild_id, user_id, reactions_given, reactions_received, reactions_given_weekly, reactions_received_weekly)
    VALUES (?, ?, 0, 1, 0, 1)
    ON CONFLICT(guild_id, user_id)
    DO UPDATE SET reactions_received = reactions_received + 1, reactions_received_weekly = reactions_received_weekly + 1
  `,
    [guildId, userId]
  );
}

/**
 * Get user's reaction stats
 */
async function getUserReactionStats(db, guildId, userId) {
  const row = await dbGet(
    db,
    `SELECT reactions_given, reactions_received FROM user_reactions WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId]
  );

  return {
    given: row?.reactions_given || 0,
    received: row?.reactions_received || 0,
  };
}

/**
 * Get top by reactions given
 */
async function getTopReactionsGiven(db, guildId, limit = 10) {
  return dbAll(
    db,
    `SELECT user_id, reactions_given FROM user_reactions WHERE guild_id = ? ORDER BY reactions_given DESC LIMIT ?`,
    [guildId, limit]
  );
}

/**
 * Get top by reactions received
 */
async function getTopReactionsReceived(db, guildId, limit = 10) {
  return dbAll(
    db,
    `SELECT user_id, reactions_received FROM user_reactions WHERE guild_id = ? ORDER BY reactions_received DESC LIMIT ?`,
    [guildId, limit]
  );
}

module.exports = {
  ensureReactionsTable,
  incrementReactionsGiven,
  incrementReactionsReceived,
  getUserReactionStats,
  getTopReactionsGiven,
  getTopReactionsReceived,
};
