"use strict";

/**
 * Incremental Sync Module
 * 
 * Efficiently sync messages missed during bot downtime
 * by tracking watermarks and fetching only new messages
 */

const { dbRun, dbGet, dbAll } = require('../utils/db-helpers');
const { incrementMessageCountRobust } = require('./robust-message-counting');

/**
 * Get the last synced message ID for a guild
 */
async function getWatermark(db, guildId) {
  const row = await dbGet(
    db,
    `SELECT last_message_id, last_synced_at, messages_synced 
     FROM backfill_watermarks 
     WHERE guild_id = ?`,
    [guildId]
  );
  return row || null;
}

/**
 * Update watermark after successful sync
 */
async function updateWatermark(db, guildId, messageId, messagesSynced = 0) {
  const existing = await getWatermark(db, guildId);
  const totalSynced = (existing?.messages_synced || 0) + messagesSynced;

  await dbRun(
    db,
    `INSERT INTO backfill_watermarks (guild_id, last_message_id, messages_synced, last_synced_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(guild_id)
     DO UPDATE SET 
       last_message_id = ?,
       messages_synced = ?,
       last_synced_at = datetime('now')`,
    [guildId, messageId, totalSynced, messageId, totalSynced]
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
  const stats = await dbAll(
    db,
    `SELECT guild_id, last_message_id, last_synced_at, messages_synced 
     FROM backfill_watermarks 
     ORDER BY last_synced_at DESC`
  );
  return stats || [];
}

module.exports = {
  syncMissingMessages,
  initializeWatermark,
  getWatermark,
  updateWatermark,
  getSyncStats,
};
