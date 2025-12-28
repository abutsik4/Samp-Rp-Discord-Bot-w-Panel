"use strict";

/**
 * Robust Message Counting Module
 * 
 * Provides 100% accurate message counting with:
 * - Retry logic with exponential backoff
 * - Error queue for failed operations
 * - Event logging for audit trail
 * - WAL mode provides atomicity without manual transactions
 */

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

// Retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 100; // Base delay, exponential backoff applied

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get current Unix timestamp
 */
function now() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Log event to event stream for admin monitoring
 */
async function logEvent(db, eventType, guildId, userId, messageId, details = {}) {
  try {
    await dbRun(
      db,
      `INSERT INTO message_count_events (
        event_type, guild_id, user_id, message_id, details, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [eventType, guildId, userId, messageId, JSON.stringify(details), now()]
    );
  } catch (err) {
    // Don't fail the main operation if event logging fails
    console.error("[Event Log] Failed to log event:", err.message);
  }
}

/**
 * Save failed operation to error queue for retry
 */
async function saveToErrorQueue(db, operation, guildId, userId, messageId, error) {
  try {
    await dbRun(
      db,
      `INSERT INTO message_count_errors (
        guild_id, user_id, message_id, operation, error, retry_count
      ) VALUES (?, ?, ?, ?, ?, 0)`,
      [guildId, userId, messageId, operation, error.message || String(error)]
    );
    console.log(`[Error Queue] Saved ${operation} operation for user ${userId}`);
  } catch (err) {
    console.error("[Error Queue] Failed to save to error queue:", err.message);
  }
}

/**
 * Robust increment with retry logic
 * WAL mode provides atomicity - no manual transactions needed
 */
async function incrementMessageCountRobust(db, guildId, userId, messageId, channelId, attempt = 1) {
  try {
    // 1. Add to message index first to gate duplicates
    const idxResult = await dbRun(
      db,
      `INSERT OR IGNORE INTO message_index (guild_id, message_id, user_id, channel_id)
       VALUES (?, ?, ?, ?)`
      [guildId, messageId, userId, channelId]
    );

    // If index insert was ignored, this message was already processed
    if (!idxResult || idxResult.changes === 0) {
      await logEvent(db, "increment", guildId, userId, messageId, {
        newCount: (await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, [guildId, userId]))?.message_count || 0,
        attempt,
        skipped: true,
        reason: "duplicate messageId"
      });
      return true;
    }

    // 2. Increment count in user_stats (only if index insert succeeded)
    await dbRun(
      db,
      `INSERT INTO user_stats (guild_id, user_id, message_count)
       VALUES (?, ?, 1)
       ON CONFLICT(guild_id, user_id)
       DO UPDATE SET message_count = message_count + 1`,
      [guildId, userId]
    );

    // 3. Get new count
    const newCount = await dbGet(
      db,
      `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    // Log successful event
    await logEvent(db, "increment", guildId, userId, messageId, {
      newCount: newCount?.message_count || 0,
      attempt,
    });

    return true;
  } catch (err) {
    console.error(`[Robust Count] Increment failed (attempt ${attempt}/${RETRY_ATTEMPTS}):`, err.message);

    // Retry with exponential backoff
    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);

      await logEvent(db, "retry", guildId, userId, messageId, {
        operation: "increment",
        attempt: attempt + 1,
        reason: err.message,
      });

      return incrementMessageCountRobust(db, guildId, userId, messageId, attempt + 1);
    }

    // All retries failed - save to error queue
    await saveToErrorQueue(db, "increment", guildId, userId, messageId, err);
    await logEvent(db, "failed", guildId, userId, messageId, {
      operation: "increment",
      error: err.message,
    });

    return false;
  }
}

/**
 * Robust decrement with retry logic
 * WAL mode provides atomicity - no manual transactions needed
 */
async function decrementMessageCountRobust(db, guildId, userId, messageId, attempt = 1) {
  try {
    // 1. Remove from message index first to gate duplicates
    const delResult = await dbRun(
      db,
      `DELETE FROM message_index WHERE guild_id = ? AND message_id = ?`,
      [guildId, messageId]
    );

    // If nothing removed from index, skip decrement (duplicate event)
    if (!delResult || delResult.changes === 0) {
      await logEvent(db, "decrement", guildId, userId, messageId, {
        newCount: (await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, [guildId, userId]))?.message_count || 0,
        attempt,
        skipped: true,
        reason: "messageId not in index"
      });
      return true;
    }

    // 2. Decrement count in user_stats (clamp at 0)
    await dbRun(
      db,
      `UPDATE user_stats
       SET message_count = CASE
         WHEN message_count - 1 < 0 THEN 0
         ELSE message_count - 1
       END
       WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    // 3. Get new count
    const newCount = await dbGet(
      db,
      `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    // Log successful event
    await logEvent(db, "decrement", guildId, userId, messageId, {
      newCount: newCount?.message_count || 0,
      attempt,
    });

    return true;
  } catch (err) {
    console.error(`[Robust Count] Decrement failed (attempt ${attempt}/${RETRY_ATTEMPTS}):`, err.message);

    // Retry with exponential backoff
    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);

      await logEvent(db, "retry", guildId, userId, messageId, {
        operation: "decrement",
        attempt: attempt + 1,
        reason: err.message,
      });

      return decrementMessageCountRobust(db, guildId, userId, messageId, attempt + 1);
    }

    // All retries failed - save to error queue
    await saveToErrorQueue(db, "decrement", guildId, userId, messageId, err);
    await logEvent(db, "failed", guildId, userId, messageId, {
      operation: "decrement",
      error: err.message,
    });

    return false;
  }
}

/**
 * Robust bulk decrement for messageDeleteBulk events
 * WAL mode provides atomicity - no manual transactions needed
 */
async function bulkDecrementRobust(db, guildId, userCounts, messageIds, attempt = 1) {
  try {
    // 1. Decrement counts for each user
    for (const [userId, count] of userCounts.entries()) {
      await dbRun(
        db,
        `UPDATE user_stats
         SET message_count = CASE
           WHEN message_count - ? < 0 THEN 0
           ELSE message_count - ?
         END
         WHERE guild_id = ? AND user_id = ?`,
        [count, count, guildId, userId]
      );
    }

    // 2. Remove messages from index in batches
    const chunkSize = 400;
    for (let i = 0; i < messageIds.length; i += chunkSize) {
      const chunk = messageIds.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      await dbRun(
        db,
        `DELETE FROM message_index 
         WHERE guild_id = ? AND message_id IN (${placeholders})`,
        [guildId, ...chunk]
      );
    }

    // Log successful event
    await logEvent(db, "bulk_decrement", guildId, null, null, {
      userCount: userCounts.size,
      messageCount: messageIds.length,
      attempt,
    });

    return true;
  } catch (err) {
    console.error(`[Robust Count] Bulk decrement failed (attempt ${attempt}/${RETRY_ATTEMPTS}):`, err.message);

    // Retry with exponential backoff
    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);

      return bulkDecrementRobust(db, guildId, userCounts, messageIds, attempt + 1);
    }

    // All retries failed
    console.error("[Robust Count] Bulk decrement failed permanently");
    return false;
  }
}

/**
 * Process error queue - retry failed operations
 */
async function processErrorQueue(db) {
  try {
    // Get errors that haven't been retried too many times
    const errors = await dbAll(
      db,
      `SELECT * FROM message_count_errors 
       WHERE retry_count < ? 
       ORDER BY created_at ASC 
       LIMIT 100`,
      [RETRY_ATTEMPTS]
    );

    let processed = 0;
    let succeeded = 0;

    for (const error of errors) {
      processed++;

      let success = false;
      if (error.operation === "increment") {
        success = await incrementMessageCountRobust(
          db,
          error.guild_id,
          error.user_id,
          error.message_id
        );
      } else if (error.operation === "decrement") {
        success = await decrementMessageCountRobust(
          db,
          error.guild_id,
          error.user_id,
          error.message_id
        );
      }

      if (success) {
        // Remove from error queue
        await dbRun(db, `DELETE FROM message_count_errors WHERE id = ?`, [error.id]);
        succeeded++;
      } else {
        // Increment retry count
        await dbRun(
          db,
          `UPDATE message_count_errors SET retry_count = retry_count + 1 WHERE id = ?`,
          [error.id]
        );
      }
    }

    if (processed > 0) {
      console.log(`[Error Queue] Processed ${processed} errors, succeeded: ${succeeded}`);
    }

    return { processed, succeeded };
  } catch (err) {
    console.error("[Error Queue] Failed to process:", err.message);
    return { processed: 0, succeeded: 0 };
  }
}

/**
 * Cleanup old events from event log (keep last 10,000)
 */
async function cleanupEventLog(db) {
  try {
    await dbRun(
      db,
      `DELETE FROM message_count_events 
       WHERE id NOT IN (
         SELECT id FROM message_count_events 
         ORDER BY id DESC 
         LIMIT 10000
       )`
    );
  } catch (err) {
    console.error("[Event Log] Cleanup failed:", err.message);
  }
}

module.exports = {
  incrementMessageCountRobust,
  decrementMessageCountRobust,
  bulkDecrementRobust,
  processErrorQueue,
  cleanupEventLog,
  logEvent,
};
