"use strict";

/**
 * Reconciliation Module
 * 
 * Provides automated reconciliation of message counts:
 * - Daily full reconciliation (compares DB with message_index)
 * - 15-minute lightweight self-healing (active users only)
 * - One-time manual reconciliation functions
 */

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Reconcile a single guild's message counts
 * Compares user_stats with actual counts from message_index
 */
async function reconcileGuild(db, guildId) {
  const startTime = Date.now();
  let scanned = 0;
  let fixed = 0;

  try {
    // Load manual adjustments for this guild
    const adjustments = new Map();
    const adjRows = await dbAll(
      db,
      `SELECT user_id, adjustment FROM user_adjustments WHERE guild_id = ?`,
      [guildId]
    );
    for (const row of adjRows) {
      adjustments.set(row.user_id, row.adjustment || 0);
    }

    // Load channel-level adjustments (sum to user totals)
    const channelAdjustments = new Map();
    const chAdjRows = await dbAll(
      db,
      `SELECT user_id, SUM(adjustment) as adjustment
       FROM channel_user_adjustments
       WHERE guild_id = ?
       GROUP BY user_id`,
      [guildId]
    );
    for (const row of chAdjRows) {
      channelAdjustments.set(row.user_id, row.adjustment || 0);
    }

    // Get actual counts from message_index
    const actualCounts = await dbAll(
      db,
      `SELECT user_id, COUNT(*) as actual_count
       FROM message_index
       WHERE guild_id = ?
       GROUP BY user_id`,
      [guildId]
    );

    for (const { user_id, actual_count } of actualCounts) {
      scanned++;

      // Get current count from user_stats
      const statsRow = await dbGet(
        db,
        `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
        [guildId, user_id]
      );

      const storedCount = statsRow?.message_count || 0;
      
      // Calculate expected count: actual messages + user adjustment + channel adjustments
      const adjustment = adjustments.get(user_id) || 0;
      const channelAdj = channelAdjustments.get(user_id) || 0;
      const expectedCount = Math.max(0, actual_count + adjustment + channelAdj);

      // Fix if mismatch (accounting for adjustments)
      if (storedCount !== expectedCount) {
        await dbRun(
          db,
          `INSERT INTO user_stats (guild_id, user_id, message_count)
           VALUES (?, ?, ?)
           ON CONFLICT(guild_id, user_id)
           DO UPDATE SET message_count = excluded.message_count`,
          [guildId, user_id, expectedCount]
        );
        fixed++;
        console.log(`[Reconcile] Fixed ${user_id}: ${storedCount} → ${expectedCount} (actual: ${actual_count}, userAdj: ${adjustment}, channelAdj: ${channelAdj})`);
      }
    }

    // Check for orphaned entries (users in stats but no messages in index)
    const allStats = await dbAll(
      db,
      `SELECT user_id, message_count FROM user_stats WHERE guild_id = ?`,
      [guildId]
    );

    for (const stat of allStats) {
      const hasMessages = actualCounts.find((a) => a.user_id === stat.user_id);
      const adjustment = adjustments.get(stat.user_id) || 0;
      const channelAdj = channelAdjustments.get(stat.user_id) || 0;
      const expectedCount = Math.max(0, adjustment + channelAdj); // No messages, but might have adjustments

      if (!hasMessages && stat.message_count !== expectedCount) {
        // Orphaned entry - set to adjustment value (or 0 if no adjustment)
        await dbRun(
          db,
          `UPDATE user_stats SET message_count = ? WHERE guild_id = ? AND user_id = ?`,
          [expectedCount, guildId, stat.user_id]
        );
        fixed++;
        console.log(`[Reconcile] Fixed orphaned entry for ${stat.user_id}: ${stat.message_count} → ${expectedCount} (userAdj: ${adjustment}, channelAdj: ${channelAdj})`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Reconcile] Guild ${guildId}: scanned ${scanned}, fixed ${fixed} in ${duration}ms`);

    return { scanned, fixed, duration };
  } catch (err) {
    console.error(`[Reconcile] Error for guild ${guildId}:`, err);
    return { scanned, fixed: 0, duration: Date.now() - startTime, error: err.message };
  }
}

/**
 * Reconcile all guilds
 */
async function reconcileAllGuilds(db, client) {
  console.log(`[Reconcile] Starting full reconciliation...`);
  const startTime = Date.now();

  let totalScanned = 0;
  let totalFixed = 0;

  for (const guild of client.guilds.cache.values()) {
    const result = await reconcileGuild(db, guild.id);
    totalScanned += result.scanned;
    totalFixed += result.fixed;
  }

  const duration = Date.now() - startTime;
  console.log(
    `[Reconcile] Complete: ${totalScanned} users scanned, ${totalFixed} fixed in ${(duration / 1000).toFixed(1)}s`
  );

  return { totalScanned, totalFixed, duration };
}

/**
 * Lightweight self-healing reconciliation
 * Only checks users who had activity in the last hour
 */
async function selfHealingReconcile(db, guildId) {
  try {
    // Load manual adjustments for this guild
    const adjustments = new Map();
    const adjRows = await dbAll(
      db,
      `SELECT user_id, adjustment FROM user_adjustments WHERE guild_id = ?`,
      [guildId]
    );
    for (const row of adjRows) {
      adjustments.set(row.user_id, row.adjustment || 0);
    }

    // Get users with recent activity (messages in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const recentUsers = await dbAll(
      db,
      `SELECT DISTINCT user_id
       FROM message_index
       WHERE guild_id = ? AND created_at > ?
       LIMIT 100`,
      [guildId, oneHourAgo]
    );

    let fixed = 0;

    for (const { user_id } of recentUsers) {
      const actualCount = await dbGet(
        db,
        `SELECT COUNT(*) as cnt FROM message_index WHERE guild_id = ? AND user_id = ?`,
        [guildId, user_id]
      );

      const statsRow = await dbGet(
        db,
        `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
        [guildId, user_id]
      );

      const actual = actualCount?.cnt || 0;
      const adjustment = adjustments.get(user_id) || 0;
      const expected = Math.max(0, actual + adjustment);
      const stored = statsRow?.message_count || 0;
      const diff = Math.abs(expected - stored);

      // Only auto-fix small discrepancies (<5)
      if (diff > 0 && diff < 5) {
        await dbRun(
          db,
          `UPDATE user_stats SET message_count = ? WHERE guild_id = ? AND user_id = ?`,
          [expected, guildId, user_id]
        );
        fixed++;
      }
    }

    if (fixed > 0) {
      console.log(`[Self-Heal] Fixed ${fixed} small discrepancies`);
    }

    return { checked: recentUsers.length, fixed };
  } catch (err) {
    console.error(`[Self-Heal] Error:`, err);
    return { checked: 0, fixed: 0 };
  }
}

module.exports = {
  reconcileGuild,
  reconcileAllGuilds,
  selfHealingReconcile,
};
