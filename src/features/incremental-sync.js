"use strict";

/**
 * Incremental Sync Module
 * 
 * Efficiently sync messages missed during bot downtime
 * by tracking watermarks and fetching only new messages
 */

const { dbRun, dbGet, dbAll } = require('../utils/db-helpers');
const { incrementMessageCountRobust } = require('./robust-message-counting');

const GLOBAL_WATERMARK_CHANNEL_ID = '__guild__';

let cachedWatermarkSchema = null;

async function getWatermarkSchema(db) {
  if (cachedWatermarkSchema) return cachedWatermarkSchema;

  try {
    const columns = await dbAll(db, `PRAGMA table_info(backfill_watermarks)`);
    const names = new Set(columns.map((c) => c.name));

    cachedWatermarkSchema = {
      hasChannelId: names.has('channel_id'),
      hasLastSyncedAt: names.has('last_synced_at'),
      hasMessagesSynced: names.has('messages_synced'),
    };
  } catch (_) {
    cachedWatermarkSchema = {
      hasChannelId: false,
      hasLastSyncedAt: true,
      hasMessagesSynced: true,
    };
  }

  return cachedWatermarkSchema;
}

/**
 * Get the last synced message ID for a guild
 */
async function getWatermark(db, guildId) {
  const schema = await getWatermarkSchema(db);
  const selectParts = [
    'last_message_id',
    schema.hasLastSyncedAt ? 'last_synced_at' : 'NULL AS last_synced_at',
    schema.hasMessagesSynced ? 'messages_synced' : '0 AS messages_synced',
  ];

  const where = schema.hasChannelId
    ? 'WHERE guild_id = ? AND channel_id = ?'
    : 'WHERE guild_id = ?';
  const params = schema.hasChannelId
    ? [guildId, GLOBAL_WATERMARK_CHANNEL_ID]
    : [guildId];

  const row = await dbGet(db, `SELECT ${selectParts.join(', ')} FROM backfill_watermarks ${where}`, params);
  return row || null;
}

/**
 * Update watermark after successful sync
 */
async function updateWatermark(db, guildId, messageId, messagesSynced = 0) {
  const schema = await getWatermarkSchema(db);
  const existing = await getWatermark(db, guildId);
  const totalSynced = (existing?.messages_synced || 0) + messagesSynced;

  if (schema.hasChannelId) {
    const insertCols = ['guild_id', 'channel_id', 'last_message_id'];
    const insertValues = ['?', '?', '?'];
    const insertParams = [guildId, GLOBAL_WATERMARK_CHANNEL_ID, messageId];

    if (schema.hasMessagesSynced) {
      insertCols.push('messages_synced');
      insertValues.push('?');
      insertParams.push(totalSynced);
    }

    if (schema.hasLastSyncedAt) {
      insertCols.push('last_synced_at');
      insertValues.push("datetime('now')");
    }

    const updateSet = ['last_message_id = ?'];
    const updateParams = [messageId];

    if (schema.hasMessagesSynced) {
      updateSet.push('messages_synced = ?');
      updateParams.push(totalSynced);
    }

    if (schema.hasLastSyncedAt) {
      updateSet.push("last_synced_at = datetime('now')");
    }

    await dbRun(
      db,
      `INSERT INTO backfill_watermarks (${insertCols.join(', ')})
       VALUES (${insertValues.join(', ')})
       ON CONFLICT(guild_id, channel_id)
       DO UPDATE SET ${updateSet.join(', ')}`,
      [...insertParams, ...updateParams]
    );
    return;
  }

  // Fallback for older schemas without channel_id
  const insertCols = ['guild_id', 'last_message_id'];
  const insertValues = ['?', '?'];
  const insertParams = [guildId, messageId];

  if (schema.hasMessagesSynced) {
    insertCols.push('messages_synced');
    insertValues.push('?');
    insertParams.push(totalSynced);
  }

  if (schema.hasLastSyncedAt) {
    insertCols.push('last_synced_at');
    insertValues.push("datetime('now')");
  }

  const updateSet = ['last_message_id = ?'];
  const updateParams = [messageId];

  if (schema.hasMessagesSynced) {
    updateSet.push('messages_synced = ?');
    updateParams.push(totalSynced);
  }

  if (schema.hasLastSyncedAt) {
    updateSet.push("last_synced_at = datetime('now')");
  }

  await dbRun(
    db,
    `INSERT INTO backfill_watermarks (${insertCols.join(', ')})
     VALUES (${insertValues.join(', ')})
     ON CONFLICT(guild_id)
     DO UPDATE SET ${updateSet.join(', ')}`,
    [...insertParams, ...updateParams]
  );
}

/**
 * Sync missing messages for a guild
 * Fetches messages AFTER the watermark
 */
async function syncMissingMessages(client, db, guildId, progressCallback = null) {
  console.log(`[Incremental Sync] Starting for guild ${guildId}`);
  
  try {
    const guild = await client.guilds.fetch(guildId);
    const watermark = await getWatermark(db, guildId);

    if (!watermark || !watermark.last_message_id) {
      return {
        success: false,
        error: 'No watermark found - run full backfill first',
        synced: 0,
      };
    }

    const lastKnownId = watermark.last_message_id;
    console.log(`[Incremental Sync] Starting from message ID: ${lastKnownId}`);

    let totalSynced = 0;
    let latestMessageId = lastKnownId;
    const channelStats = new Map();

    // Get all text-based channels
    const channels = guild.channels.cache.filter(
      ch => ch.isTextBased() && !ch.isDMBased() && ch.viewable
    );

    console.log(`[Incremental Sync] Scanning ${channels.size} channels...`);

    for (const [, channel] of channels) {
      try {
        let afterId = lastKnownId;
        let channelSynced = 0;
        let hasMore = true;

        while (hasMore) {
          // Fetch messages AFTER the watermark
          const messages = await channel.messages.fetch({
            after: afterId,
            limit: 100,
          });

          if (messages.size === 0) {
            hasMore = false;
            break;
          }

          // Process messages in chronological order (oldest first)
          const sortedMessages = Array.from(messages.values()).sort(
            (a, b) => a.createdTimestamp - b.createdTimestamp
          );

          for (const message of sortedMessages) {
            if (message.author.bot) continue;

            // Use robust counting (includes deduplication)
            await incrementMessageCountRobust(
              db,
              guildId,
              message.author.id,
              message.id,
              message.channel.id,
              message.createdAt.toISOString()
            );

            channelSynced++;

            // Track newest message
            if (message.id > latestMessageId) {
              latestMessageId = message.id;
            }
          }

          // Move to next batch (forward in time)
          afterId = sortedMessages[sortedMessages.length - 1].id;

          // Progress callback
          if (progressCallback) {
            progressCallback({
              channel: channel.name,
              channelSynced,
              totalSynced: totalSynced + channelSynced,
            });
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        totalSynced += channelSynced;
        if (channelSynced > 0) {
          channelStats.set(channel.name, channelSynced);
          console.log(`[Incremental Sync] ${channel.name}: +${channelSynced}`);
        }
      } catch (err) {
        console.error(`[Incremental Sync] Error in ${channel.name}:`, err.message);
      }
    }

    // Update watermark to latest message
    if (latestMessageId !== lastKnownId) {
      await updateWatermark(db, guildId, latestMessageId, totalSynced);
    }

    console.log(`[Incremental Sync] ✅ Complete: synced ${totalSynced} messages`);

    return {
      success: true,
      synced: totalSynced,
      latestMessageId,
      channelStats: Object.fromEntries(channelStats),
      watermark: {
        before: lastKnownId,
        after: latestMessageId,
      },
    };
  } catch (err) {
    console.error('[Incremental Sync] Fatal error:', err);
    return {
      success: false,
      error: err.message,
      synced: 0,
    };
  }
}

/**
 * Initialize watermark from current guild state
 * Call this after full backfill to set starting point
 */
async function initializeWatermark(client, db, guildId) {
  try {
    const guild = await client.guilds.fetch(guildId);
    
    // Find the most recent message across all channels
    let latestMessage = null;
    let latestTimestamp = 0;

    for (const [, channel] of guild.channels.cache) {
      if (!channel.isTextBased() || channel.isDMBased()) continue;
      
      try {
        if (channel.lastMessageId) {
          const message = await channel.messages.fetch(channel.lastMessageId);
          if (message && message.createdTimestamp > latestTimestamp) {
            latestTimestamp = message.createdTimestamp;
            latestMessage = message;
          }
        }
      } catch (err) {
        // Channel might not be accessible
      }
    }

    if (latestMessage) {
      await updateWatermark(db, guildId, latestMessage.id, 0);
      console.log(`[Incremental Sync] ✅ Initialized watermark for ${guild.name}: ${latestMessage.id}`);
      return { success: true, messageId: latestMessage.id };
    } else {
      console.log(`[Incremental Sync] ⚠️ No messages found in ${guild.name}`);
      return { success: false, error: 'No messages found' };
    }
  } catch (err) {
    console.error('[Incremental Sync] Failed to initialize watermark:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get sync statistics for all guilds
 */
async function getSyncStats(db) {
  const schema = await getWatermarkSchema(db);
  const selectParts = [
    'guild_id',
    schema.hasChannelId ? 'channel_id' : "'__guild__' AS channel_id",
    'last_message_id',
    schema.hasLastSyncedAt ? 'last_synced_at' : 'NULL AS last_synced_at',
    schema.hasMessagesSynced ? 'messages_synced' : '0 AS messages_synced',
  ];

  const where = schema.hasChannelId ? 'WHERE channel_id = ?' : '';
  const params = schema.hasChannelId ? [GLOBAL_WATERMARK_CHANNEL_ID] : [];

  const orderBy = schema.hasLastSyncedAt ? 'ORDER BY last_synced_at DESC' : 'ORDER BY guild_id';
  const stats = await dbAll(db, `SELECT ${selectParts.join(', ')} FROM backfill_watermarks ${where} ${orderBy}`, params);
  return stats || [];
}

module.exports = {
  syncMissingMessages,
  initializeWatermark,
  getWatermark,
  updateWatermark,
  getSyncStats,
};
