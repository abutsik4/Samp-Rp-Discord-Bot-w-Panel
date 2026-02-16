"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Wanted Stars System — GTA SA Style Spam Indicator
 * Maps rate-limiter strikes to GTA-style wanted stars (1-6).
 * Stars decay over time (configurable).
 *
 * Error codes:
 *   WANTED-001: Table creation failed
 *   WANTED-002: Star update failed
 *   WANTED-003: Star lookup failed
 *   WANTED-004: Decay processing failed
 */

const MAX_STARS = 6;
const DEFAULT_DECAY_HOURS = 2; // One star decays every 2 hours

// Wanted star display
const STAR_DISPLAY = {
  0: "☆☆☆☆☆☆",
  1: "★☆☆☆☆☆",
  2: "★★☆☆☆☆",
  3: "★★★☆☆☆",
  4: "★★★★☆☆",
  5: "★★★★★☆",
  6: "★★★★★★",
};

// Descriptions per wanted level
const WANTED_DESCRIPTIONS = {
  0: "Чист как CJ после парикмахерской",
  1: "Полиция заметила подозрительную активность",
  2: "Патруль вызван на ваше местоположение",
  3: "В погоню отправлены полицейские машины",
  4: "Подключён вертолёт полиции! 🚁",
  5: "Вызван спецназ SWAT! 🚔",
  6: "Армия на подходе! Разыскивается по всему San Andreas! 🪖",
};

/**
 * Ensure wanted stars table exists
 */
async function ensureWantedTable(db) {
  try {
    await dbRun(
      db,
      `
      CREATE TABLE IF NOT EXISTS wanted_stars (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        stars INTEGER NOT NULL DEFAULT 0,
        last_infraction_at INTEGER NOT NULL DEFAULT 0,
        last_decay_at INTEGER NOT NULL DEFAULT 0,
        total_infractions INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `
    );
  } catch (err) {
    console.error("[WANTED-001] Failed to create wanted_stars table:", err);
    throw err;
  }
}

/**
 * Add a wanted star for a violation
 */
async function addWantedStar(db, guildId, userId) {
  const now = Math.floor(Date.now() / 1000);

  try {
    const existing = await dbGet(
      db,
      `SELECT stars, total_infractions FROM wanted_stars WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    if (!existing) {
      await dbRun(
        db,
        `INSERT INTO wanted_stars (guild_id, user_id, stars, last_infraction_at, last_decay_at, total_infractions)
         VALUES (?, ?, 1, ?, ?, 1)`,
        [guildId, userId, now, now]
      );
      return 1;
    }

    const newStars = Math.min(existing.stars + 1, MAX_STARS);
    await dbRun(
      db,
      `UPDATE wanted_stars SET stars = ?, last_infraction_at = ?, total_infractions = total_infractions + 1
       WHERE guild_id = ? AND user_id = ?`,
      [newStars, now, guildId, userId]
    );
    return newStars;
  } catch (err) {
    console.error(`[WANTED-002] Star update failed for user ${userId}:`, err);
    return 0;
  }
}

/**
 * Get user's wanted level
 */
async function getWantedLevel(db, guildId, userId) {
  try {
    const row = await dbGet(
      db,
      `SELECT stars, last_infraction_at, total_infractions FROM wanted_stars WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    return {
      stars: row?.stars || 0,
      lastInfractionAt: row?.last_infraction_at || 0,
      totalInfractions: row?.total_infractions || 0,
      display: STAR_DISPLAY[row?.stars || 0] || STAR_DISPLAY[0],
      description: WANTED_DESCRIPTIONS[row?.stars || 0] || WANTED_DESCRIPTIONS[0],
    };
  } catch (err) {
    console.error(`[WANTED-003] Star lookup failed for user ${userId}:`, err);
    return { stars: 0, lastInfractionAt: 0, totalInfractions: 0, display: STAR_DISPLAY[0], description: WANTED_DESCRIPTIONS[0] };
  }
}

/**
 * Process star decay for all users (run periodically)
 * Removes 1 star per decay_hours elapsed since last decay/infraction
 */
async function processStarDecay(db, decayHours = DEFAULT_DECAY_HOURS) {
  const now = Math.floor(Date.now() / 1000);
  const decayThreshold = now - (decayHours * 3600);

  try {
    // Get all users with active stars where enough time has passed
    const users = await dbAll(
      db,
      `SELECT guild_id, user_id, stars, last_infraction_at, last_decay_at
       FROM wanted_stars
       WHERE stars > 0 AND (last_decay_at < ? OR last_infraction_at < ?)`,
      [decayThreshold, decayThreshold]
    );

    let decayed = 0;
    for (const user of users) {
      const lastActivity = Math.max(user.last_infraction_at, user.last_decay_at);
      const elapsed = now - lastActivity;
      const starsToRemove = Math.floor(elapsed / (decayHours * 3600));

      if (starsToRemove > 0) {
        const newStars = Math.max(0, user.stars - starsToRemove);
        await dbRun(
          db,
          `UPDATE wanted_stars SET stars = ?, last_decay_at = ? WHERE guild_id = ? AND user_id = ?`,
          [newStars, now, user.guild_id, user.user_id]
        );
        decayed++;
      }
    }

    return { processed: users.length, decayed };
  } catch (err) {
    console.error("[WANTED-004] Decay processing failed:", err);
    return { processed: 0, decayed: 0 };
  }
}

/**
 * Get most wanted users on a server
 */
async function getMostWanted(db, guildId, limit = 10) {
  try {
    return await dbAll(
      db,
      `SELECT user_id, stars, total_infractions, last_infraction_at
       FROM wanted_stars WHERE guild_id = ? AND stars > 0
       ORDER BY stars DESC, total_infractions DESC LIMIT ?`,
      [guildId, limit]
    );
  } catch (err) {
    console.error("[WANTED-003] Most wanted lookup failed:", err);
    return [];
  }
}

/**
 * Clear wanted stars for a user
 */
async function clearWantedStars(db, guildId, userId) {
  try {
    await dbRun(
      db,
      `UPDATE wanted_stars SET stars = 0, last_decay_at = ? WHERE guild_id = ? AND user_id = ?`,
      [Math.floor(Date.now() / 1000), guildId, userId]
    );
  } catch (err) {
    console.error(`[WANTED-002] Clear stars failed for user ${userId}:`, err);
  }
}

/**
 * Format wanted level for embed display
 */
function formatWantedDisplay(wantedInfo) {
  return `${wantedInfo.display}\n_${wantedInfo.description}_`;
}

module.exports = {
  MAX_STARS,
  STAR_DISPLAY,
  WANTED_DESCRIPTIONS,
  ensureWantedTable,
  addWantedStar,
  getWantedLevel,
  processStarDecay,
  getMostWanted,
  clearWantedStars,
  formatWantedDisplay,
};
