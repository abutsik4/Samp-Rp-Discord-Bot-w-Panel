"use strict";

/**
 * Message Index Cleanup
 * 
 * Removes old entries from message_index to prevent unbounded growth
 * Default: Keep last 90 days of messages
 */

const { dbRun, dbGet } = require("../utils/db-helpers");

/**
 * Cleanup old message index entries
 * 
 * @param {object} db - Database connection
 * @param {number} retentionDays - Number of days to keep (default: 90)
 * @returns {Promise<number>} Number of entries deleted
 */
async function cleanupOldMessageIndex(db, retentionDays = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffISO = cutoffDate.toISOString();

    // Count how many will be deleted
    const countResult = await dbGet(
      db,
      `SELECT COUNT(*) as count FROM message_index WHERE created_at < ?`,
      [cutoffISO]
    );

    const toDelete = countResult?.count || 0;

    if (toDelete === 0) {
      console.log("[Index Cleanup] No old entries to clean up");
      return 0;
    }

    // Delete old entries
    await dbRun(
      db,
      `DELETE FROM message_index WHERE created_at < ?`,
      [cutoffISO]
    );

    console.log(`[Index Cleanup] Deleted ${toDelete} entries older than ${retentionDays} days`);
    return toDelete;
  } catch (err) {
    console.error("[Index Cleanup] Error:", err);
    return 0;
  }
}

/**
 * Get message index statistics
 */
async function getIndexStats(db) {
  try {
    const total = await dbGet(db, `SELECT COUNT(*) as count FROM message_index`);
    
    const oldest = await dbGet(
      db,
      `SELECT created_at FROM message_index ORDER BY created_at ASC LIMIT 1`
    );

    const newest = await dbGet(
      db,
      `SELECT created_at FROM message_index ORDER BY created_at DESC LIMIT 1`
    );

    return {
      total: total?.count || 0,
      oldest: oldest?.created_at || null,
      newest: newest?.created_at || null,
    };
  } catch (err) {
    console.error("[Index Stats] Error:", err);
    return { total: 0, oldest: null, newest: null };
  }
}

module.exports = {
  cleanupOldMessageIndex,
  getIndexStats,
};
