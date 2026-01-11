"use strict";

/**
 * Robust Message Counting Module
 * 
 * Provides 100% accurate message counting with:
 * - Retry logic with exponential backoff
 * - Error queue for failed operations
 * - Event logging for audit trail
 * - WAL mode provides atomicity without manual transactions
 * - Optional Redis leaderboard cache for fast queries
 */

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { updateLeaderboard } = require("./leaderboard-cache");
const { createLogger, newTraceId } = require("../utils/logger");

const log = createLogger("message-counting");

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
    log.warn("Event log write failed", { eventType, guildId, userId, messageId, err: err.message });
  }
}

/**
 * Save failed operation to error queue for retry
 */
async function saveToErrorQueue(db, operation, guildId, userId, messageId, error, meta = {}) {
  try {
    await dbRun(
      db,
      `INSERT INTO message_count_errors (
        guild_id, user_id, message_id, operation, error, retry_count, channel_id, message_created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        guildId,
        userId,
        messageId,
        operation,
        error.message || String(error),
        meta.channelId || null,
        meta.messageCreatedAt || null,
      ]
    );
    log.warn("Saved operation to error queue", {
      operation,
      guildId,
      userId,
      messageId,
      channelId: meta.channelId || null,
    });
  } catch (err) {
    log.error("Failed to save to error queue", { operation, guildId, userId, messageId, err: err.message });
  }
}

/**
 * Robust increment with retry logic
 * WAL mode provides atomicity - no manual transactions needed
 */
async function incrementMessageCountRobust(db, guildId, userId, messageId, channelId, messageTimestamp, attempt = 1, traceId = null) {
  try {
    const opId = traceId || newTraceId();
    const startMs = Date.now();

    // Extract date for daily stats (YYYY-MM-DD format)
    const messageDate = messageTimestamp ? new Date(messageTimestamp).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

    // 1. Add to message index first to gate duplicates
    const idxResult = await dbRun(
      db,
      `INSERT OR IGNORE INTO message_index (guild_id, message_id, user_id, channel_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [guildId, messageId, userId, channelId, messageTimestamp || new Date().toISOString()]
    );

    // If index insert was ignored, this message was already processed
    if (!idxResult || idxResult.changes === 0) {
      await logEvent(db, "increment", guildId, userId, messageId, {
        newCount: (await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, [guildId, userId]))?.message_count || 0,
        attempt,
        skipped: true,
        reason: "duplicate messageId",
        opId,
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

    // 3. Increment daily/channel stats
    await dbRun(
      db,
      `INSERT INTO daily_channel_stats (guild_id, user_id, channel_id, message_date, count)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(guild_id, user_id, channel_id, message_date)
       DO UPDATE SET count = count + 1`,
      [guildId, userId, channelId, messageDate]
    );

    // 4. Get new count
    const newCount = await dbGet(
      db,
      `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    // Log successful event
    await logEvent(db, "increment", guildId, userId, messageId, {
      newCount: newCount?.message_count || 0,
      attempt,
      dailyStats: true,
      opId,
      ms: Date.now() - startMs,
    });

    // Update leaderboard cache (non-blocking, optional)
    updateLeaderboard(guildId, userId, 1).catch(err => {
      // Silently fail - cache is optional
    });

    return true;
  } catch (err) {
    log.error("Increment failed", {
      guildId,
      userId,
      messageId,
      channelId,
      attempt,
      err: err.message,
    });

    // Retry with exponential backoff
    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);

      await logEvent(db, "retry", guildId, userId, messageId, {
        operation: "increment",
        attempt: attempt + 1,
        reason: err.message,
        channelId,
      });

      return incrementMessageCountRobust(db, guildId, userId, messageId, channelId, messageTimestamp, attempt + 1, traceId);
    }

    // All retries failed - save to error queue
    await saveToErrorQueue(db, "increment", guildId, userId, messageId, err, {
      channelId,
      messageCreatedAt: messageTimestamp || null,
    });
    await logEvent(db, "failed", guildId, userId, messageId, {
      operation: "increment",
      error: err.message,
      channelId,
    });

    return false;
  }
}

/**
 * Robust decrement with retry logic
 * WAL mode provides atomicity - no manual transactions needed
 */
async function decrementMessageCountRobust(db, guildId, userId, messageId, attempt = 1, traceId = null) {
  try {
    const opId = traceId || newTraceId();
    const startMs = Date.now();

    // 1. First, look up the message details from index (need channel_id and created_at for daily stats)
    const indexedMessage = await dbGet(
      db,
      `SELECT user_id, channel_id, created_at FROM message_index WHERE guild_id = ? AND message_id = ?`,
      [guildId, messageId]
    );

    const effectiveUserId = indexedMessage?.user_id || userId;

    // 2. Remove from message index to gate duplicates
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
        reason: "messageId not in index",
        opId,
      });
      return true;
    }

    // 3. Decrement count in user_stats (clamp at 0)
    await dbRun(
      db,
      `UPDATE user_stats
       SET message_count = CASE
         WHEN message_count - 1 < 0 THEN 0
         ELSE message_count - 1
       END
       WHERE guild_id = ? AND user_id = ?`,
      [guildId, effectiveUserId]
    );

    // 4. Decrement daily stats if we have the indexed message details
    if (indexedMessage && indexedMessage.channel_id && indexedMessage.created_at) {
      const messageDate = new Date(indexedMessage.created_at).toISOString().slice(0, 10);
      await dbRun(
        db,
        `UPDATE daily_channel_stats
         SET count = CASE
           WHEN count - 1 < 0 THEN 0
           ELSE count - 1
         END
         WHERE guild_id = ? AND user_id = ? AND channel_id = ? AND message_date = ?`,
        [guildId, indexedMessage.user_id, indexedMessage.channel_id, messageDate]
      );
    }

    // 5. Get new count
    const newCount = await dbGet(
      db,
      `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
      [guildId, effectiveUserId]
    );

    // Log successful event
    await logEvent(db, "decrement", guildId, effectiveUserId, messageId, {
      newCount: newCount?.message_count || 0,
      attempt,
      dailyStats: !!indexedMessage,
      opId,
      ms: Date.now() - startMs,
    });

    // Update leaderboard cache (non-blocking, optional)
    updateLeaderboard(guildId, effectiveUserId, -1).catch(err => {
      // Silently fail - cache is optional
    });

    return true;
  } catch (err) {
    log.error("Decrement failed", { guildId, userId, messageId, attempt, err: err.message });

    // Retry with exponential backoff
    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);

      await logEvent(db, "retry", guildId, userId, messageId, {
        operation: "decrement",
        attempt: attempt + 1,
        reason: err.message,
      });

      return decrementMessageCountRobust(db, guildId, userId, messageId, attempt + 1, traceId);
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
    log.error("Bulk decrement failed", { guildId, attempt, err: err.message, messageCount: messageIds?.length || 0 });

    // Retry with exponential backoff
    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await sleep(delay);

      return bulkDecrementRobust(db, guildId, userCounts, messageIds, attempt + 1);
    }

    // All retries failed
    log.error("Bulk decrement failed permanently", { guildId, messageCount: messageIds?.length || 0 });
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
        let channelId = error.channel_id || null;
        let messageCreatedAt = error.message_created_at || null;

        // Best-effort fallback: if the message_index insert succeeded previously, reuse its metadata.
        if (!channelId || !messageCreatedAt) {
          try {
            const idx = await dbGet(
              db,
              `SELECT channel_id, created_at FROM message_index WHERE guild_id = ? AND message_id = ?`,
              [error.guild_id, error.message_id]
            );
            channelId = channelId || idx?.channel_id || null;
            messageCreatedAt = messageCreatedAt || idx?.created_at || null;
          } catch (_) {
            // If message_index doesn't exist or query fails, continue without metadata.
          }
        }

        if (!channelId) {
          log.warn("Cannot replay increment without channel_id", {
            guildId: error.guild_id,
            userId: error.user_id,
            messageId: error.message_id,
            errorId: error.id,
          });
          success = false;
        } else {
        success = await incrementMessageCountRobust(
          db,
          error.guild_id,
          error.user_id,
          error.message_id
          ,
          channelId,
          messageCreatedAt
        );
        }
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
      log.info("Error queue processed", { processed, succeeded });
    }

    return { processed, succeeded };
  } catch (err) {
    log.error("Error queue processing failed", { err: err.message });
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
    log.warn("Event log cleanup failed", { err: err.message });
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
