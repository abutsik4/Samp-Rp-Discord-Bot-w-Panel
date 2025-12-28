"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Milestone Celebrations Module
 * Auto-celebrates when users hit message milestones
 */

const MILESTONES = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

/**
 * Ensure milestone table exists
 */
async function ensureMilestoneTable(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS user_milestones (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      milestone INTEGER NOT NULL,
      achieved_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, user_id, milestone)
    )
  `
  );
}

/**
 * Check if user just crossed a milestone
 * Returns the milestone value if newly crossed, null otherwise
 */
async function checkMilestone(db, guildId, userId, newCount) {
  // Get all milestones the user should have based on their count
  const crossedMilestones = MILESTONES.filter((m) => newCount >= m);

  // Check if this is the first time we're checking milestones for this user
  const existingMilestones = await dbAll(
    db,
    `SELECT milestone FROM user_milestones WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId]
  );

  // If user has no milestone records at all, they might be an existing user
  // We should initialize all milestones they've already passed (silently)
  if (existingMilestones.length === 0 && crossedMilestones.length > 0) {
    // Get their previous message count (before this message)
    const previousCount = newCount - 1;
    
    // Silently add all milestones they had already achieved before tracking started
    const alreadyAchievedMilestones = MILESTONES.filter((m) => previousCount >= m);
    
    for (const milestone of alreadyAchievedMilestones) {
      await dbRun(
        db,
        `INSERT INTO user_milestones (guild_id, user_id, milestone) VALUES (?, ?, ?)`,
        [guildId, userId, milestone]
      );
    }
    
    // Now check if they just crossed a NEW milestone with this message
    const newMilestone = MILESTONES.find((m) => newCount >= m && previousCount < m);
    return newMilestone || null;
  }

  // Normal flow: check for newly crossed milestones
  const existingSet = new Set(existingMilestones.map((r) => r.milestone));

  for (const milestone of crossedMilestones) {
    if (!existingSet.has(milestone)) {
      // New milestone!
      await dbRun(
        db,
        `INSERT INTO user_milestones (guild_id, user_id, milestone) VALUES (?, ?, ?)`,
        [guildId, userId, milestone]
      );
      return milestone; // Return first uncelebrated milestone
    }
  }

  return null;
}

/**
 * Get all milestones for a user
 */
async function getUserMilestones(db, guildId, userId) {
  const rows = await dbAll(
    db,
    `SELECT milestone, achieved_at FROM user_milestones WHERE guild_id = ? AND user_id = ? ORDER BY milestone ASC`,
    [guildId, userId]
  );
  return rows;
}

module.exports = {
  ensureMilestoneTable,
  checkMilestone,
  getUserMilestones,
  MILESTONES,
};
