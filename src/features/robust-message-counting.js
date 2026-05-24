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
const { withSerializedTransaction } = require("../utils/sqlite-transaction");

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

async function withTransaction(db, fn) {
  return withSerializedTransaction(db, fn);
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

    const { skipped, newCount } = await withTransaction(db, async () => {
      const createdAt = messageTimestamp || new Date().toISOString();
      const messageDate = new Date(createdAt).toISOString().slice(0, 10);
      const idxResult = await dbRun(
        db,
        `INSERT OR IGNORE INTO message_index (guild_id, message_id, user_id, channel_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, messageId, userId, channelId, createdAt]
      );

      if (!idxResult || idxResult.changes === 0) {
        const currentCount = await dbGet(db, `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);
        return { skipped: true, newCount: currentCount?.message_count || 0 };
      }

      await dbRun(
        db,
        `INSERT INTO user_stats (guild_id, user_id, message_count)
         VALUES (?, ?, 1)
         ON CONFLICT(guild_id, user_id)
         DO UPDATE SET message_count = message_count + 1`,
        [guildId, userId]
      );

      await dbRun(
        db,
        `INSERT INTO daily_channel_stats (guild_id, user_id, channel_id, message_date, count)
         VALUES (?, ?, ?, ?, 1)
         ON CONFLICT(guild_id, user_id, channel_id, message_date)
         DO UPDATE SET count = count + 1`,
        [guildId, userId, channelId, messageDate]
      );

      const nextCount = await dbGet(
        db,
        `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
        [guildId, userId]
      );
      return { skipped: false, newCount: nextCount?.message_count || 0 };
    });

    // Log successful event
    await logEvent(db, "increment", guildId, userId, messageId, {
      newCount,
      attempt,
      dailyStats: !skipped,
      skipped,
      reason: skipped ? "duplicate messageId" : undefined,
      opId,
      ms: Date.now() - startMs,
    });

    if (!skipped) {
      updateLeaderboard(guildId, userId, 1).catch(() => {});
    }

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

    const result = await withTransaction(db, async () => {
      const indexedMessage = await dbGet(
        db,
        `SELECT user_id, channel_id, created_at FROM message_index WHERE guild_id = ? AND message_id = ?`,
        [guildId, messageId]
      );

      const effectiveUserId = indexedMessage?.user_id || userId;
      const delResult = await dbRun(
        db,
        `DELETE FROM message_index WHERE guild_id = ? AND message_id = ?`,
        [guildId, messageId]
      );

      if (!delResult || delResult.changes === 0) {
        const currentCount = await dbGet(
          db,
          `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
          [guildId, effectiveUserId]
        );
        return { skipped: true, indexedMessage, effectiveUserId, newCount: currentCount?.message_count || 0 };
      }

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

      const nextCount = await dbGet(
        db,
        `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
        [guildId, effectiveUserId]
      );
      return { skipped: false, indexedMessage, effectiveUserId, newCount: nextCount?.message_count || 0 };
    });

    // Log successful event
    await logEvent(db, "decrement", guildId, result.effectiveUserId, messageId, {
      newCount: result.newCount,
      attempt,
      dailyStats: !!result.indexedMessage,
      skipped: result.skipped,
      reason: result.skipped ? "messageId not in index" : undefined,
      opId,
      ms: Date.now() - startMs,
    });

    if (!result.skipped) {
      updateLeaderboard(guildId, result.effectiveUserId, -1).catch(() => {});
    }

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
    const actualUserCounts = new Map();
    const dailyCounts = new Map();
    const indexedMessageIds = [];
    const chunkSize = 400;

    await withTransaction(db, async () => {
      for (let i = 0; i < messageIds.length; i += chunkSize) {
        const chunk = messageIds.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        const rows = await dbAll(
          db,
          `SELECT message_id, user_id, channel_id, created_at
           FROM message_index
           WHERE guild_id = ? AND message_id IN (${placeholders})`,
          [guildId, ...chunk]
        );

        for (const row of rows) {
          indexedMessageIds.push(row.message_id);
          actualUserCounts.set(row.user_id, (actualUserCounts.get(row.user_id) || 0) + 1);
          if (row.channel_id && row.created_at) {
            const messageDate = new Date(row.created_at).toISOString().slice(0, 10);
            const dailyKey = `${row.user_id}:${row.channel_id}:${messageDate}`;
            dailyCounts.set(dailyKey, (dailyCounts.get(dailyKey) || 0) + 1);
          }
        }
      }

      for (const [userId, count] of actualUserCounts.entries()) {
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

      for (const [dailyKey, count] of dailyCounts.entries()) {
        const [userId, channelId, messageDate] = dailyKey.split(":");
        await dbRun(
          db,
          `UPDATE daily_channel_stats
           SET count = CASE
             WHEN count - ? < 0 THEN 0
             ELSE count - ?
           END
           WHERE guild_id = ? AND user_id = ? AND channel_id = ? AND message_date = ?`,
          [count, count, guildId, userId, channelId, messageDate]
        );
      }

      for (let i = 0; i < indexedMessageIds.length; i += chunkSize) {
        const chunk = indexedMessageIds.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(",");
        await dbRun(
          db,
          `DELETE FROM message_index
           WHERE guild_id = ? AND message_id IN (${placeholders})`,
          [guildId, ...chunk]
        );
      }
    });

    // Log successful event
    await logEvent(db, "bulk_decrement", guildId, null, null, {
      userCount: actualUserCounts.size || userCounts.size,
      messageCount: indexedMessageIds.length,
      attempt,
    });

    for (const [userId, count] of actualUserCounts.entries()) {
      updateLeaderboard(guildId, userId, -count).catch(() => {});
    }

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
          await logEvent(db, "skip", error.guild_id, error.user_id, error.message_id, {
            reason: "missing_channel_id_for_replay",
            operation: "increment",
            errorId: error.id,
            source: "error_queue",
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
         LIMIT 5000
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
