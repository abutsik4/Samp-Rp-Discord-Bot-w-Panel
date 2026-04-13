#!/usr/bin/env node
"use strict";

/**
 * Verify Single User Message Count
 * 
 * Usage:
 *   node scripts/verify-single-user.js <guildId> <userId>
 */

const { Client, GatewayIntentBits } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();
const { createWhitelistSet, isChannelWhitelistedForCounting } = require("../src/features/message-counting-rules");

const DB_PATH = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, "..", "data", "stats.db");
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN environment variable not set");
  process.exit(1);
}

const guildId = process.argv[2];
const userId = process.argv[3];

if (!guildId || !userId) {
  console.error("Usage: node verify-single-user.js <guildId> <userId>");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function ensureReferenceTable(db) {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS message_count_reference (
        user_id TEXT PRIMARY KEY,
        discord_search_count INTEGER NOT NULL,
        bot_count INTEGER NOT NULL,
        difference INTEGER NOT NULL,
        verified_at TEXT NOT NULL DEFAULT (datetime('now')),
        notes TEXT
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function getUserStatsCount(db, userId, guildId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT message_count as count FROM user_stats WHERE user_id = ? AND guild_id = ?`,
      [userId, guildId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });
}

async function getMessageIndexCount(db, userId, guildId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count FROM message_index WHERE user_id = ? AND guild_id = ?`,
      [userId, guildId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });
}

async function storeReference(db, userId, discordCount, botCount) {
  return new Promise((resolve, reject) => {
    const difference = discordCount - botCount;
    db.run(
      `INSERT OR REPLACE INTO message_count_reference 
       (user_id, discord_search_count, bot_count, difference, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, discordCount, botCount, difference, 'Auto-verified (single)'],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function getWhitelistSet(db, guildId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT channel_id FROM channel_whitelist WHERE guild_id = ?`,
      [guildId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(createWhitelistSet(rows || []));
      }
    );
  });
}

async function collectGuildTargets(guild, whitelistSet) {
  const targets = new Map();
  const channels = await guild.channels.fetch();

  const addTarget = (channel) => {
    if (!channel?.id) return;
    if (!channel.isTextBased || !channel.isTextBased()) return;
    if (channel.isDMBased && channel.isDMBased()) return;
    if (channel.viewable === false) return;
    if (!isChannelWhitelistedForCounting(channel, whitelistSet)) return;
    targets.set(channel.id, channel);
  };

  for (const [, channel] of channels) {
    addTarget(channel);

    if (!channel?.threads || typeof channel.threads.fetch !== "function") {
      continue;
    }

    try {
      const fetchedThreads = await channel.threads.fetch({ archived: true });
      const threadCollection = fetchedThreads?.threads || fetchedThreads;
      for (const [, thread] of threadCollection) {
        addTarget(thread);
      }
    } catch (_) {
      // Permission issues are common; keep verification best-effort.
    }
  }

  return Array.from(targets.values());
}

async function getDiscordCount(guild, userId, whitelistSet) {
  try {
    let totalCount = 0;
    const allChannels = await collectGuildTargets(guild, whitelistSet);

    console.log(`  📊 Scanning ${allChannels.length} countable channels/threads...`);

    let scannedChannels = 0;
    let skippedChannels = 0;

    for (const channel of allChannels) {
      try {
        let before = null;
        let hasMore = true;
        let channelCount = 0;

        while (hasMore) {
          const options = { limit: 100 };
          if (before) options.before = before;

          const messages = await channel.messages.fetch(options);
          if (messages.size === 0) break;

          const userMsgs = messages.filter((m) => m.author.id === userId);
          channelCount += userMsgs.size;

          before = messages.last()?.id;
          hasMore = messages.size === 100;

          // Rate limit protection
          await new Promise((r) => setTimeout(r, 100));
        }

        if (channelCount > 0) {
          console.log(`    ✓ ${channel.name}: ${channelCount} messages`);
        }

        totalCount += channelCount;
        scannedChannels++;
      } catch (err) {
        skippedChannels++;
        // Silent skip for permission issues; log minimal context
      }
    }

    console.log(`  ✅ Scanned ${scannedChannels}/${allChannels.length} channels (skipped ${skippedChannels})`);

    return totalCount;
    
  } catch (err) {
    console.error(`  Error:`, err.message);
    return null;
  }
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  
  try {
    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║   Single User Message Count Verification                      ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");
    
    const guild = await client.guilds.fetch(guildId);
    console.log(`📍 Guild: ${guild.name}`);
    console.log(`👤 User ID: ${userId}\n`);
    
    await ensureReferenceTable(db);
    
    const whitelistSet = await getWhitelistSet(db, guildId);
    const userStatsCount = await getUserStatsCount(db, userId, guildId);
    const messageIndexCount = await getMessageIndexCount(db, userId, guildId);
    console.log(`🤖 user_stats count: ${userStatsCount}`);
    console.log(`🗂️ message_index count: ${messageIndexCount}\n`);
    
    console.log(`🔍 Fetching actual count from Discord...`);
    const discordCount = await getDiscordCount(guild, userId, whitelistSet);
    
    if (discordCount === null) {
      console.log(`\n❌ Failed to verify`);
      process.exit(1);
    }
    
    console.log(`\n📱 Discord count: ${discordCount}`);
    
    const statsDifference = discordCount - userStatsCount;
    const indexDifference = discordCount - messageIndexCount;
    const statsAccuracy = discordCount > 0 ? ((userStatsCount / discordCount) * 100).toFixed(2) : 100;
    const indexAccuracy = discordCount > 0 ? ((messageIndexCount / discordCount) * 100).toFixed(2) : 100;
    
    console.log(`\n${'='.repeat(64)}`);
    if (statsDifference === 0) {
      console.log(`✅ user_stats matches Discord`);
    } else {
      console.log(`⚠️  user_stats difference: ${statsDifference >= 0 ? '+' : ''}${statsDifference} messages`);
    }
    console.log(`   user_stats accuracy: ${statsAccuracy}%`);
    console.log(`   message_index difference: ${indexDifference >= 0 ? '+' : ''}${indexDifference} messages`);
    console.log(`   message_index accuracy: ${indexAccuracy}%`);
    console.log('='.repeat(64));
    
    await storeReference(db, userId, discordCount, userStatsCount);
    console.log(`\n💾 Result stored in database`);
    
    if (statsDifference > 0) {
      console.log(`\nℹ️  user_stats is missing ${statsDifference} messages.`);
      if (indexDifference === statsDifference) {
        console.log(`   message_index is missing the same amount, so this is historical ingestion loss.`);
      } else {
        console.log(`   user_stats and message_index diverge, so only part of the loss is visible in indexed history.`);
      }
      console.log();
    } else if (statsDifference < 0) {
      console.log(`\n⚠️  user_stats has ${Math.abs(statsDifference)} MORE messages than Discord.`);
      console.log(`   This suggests duplicates or stale repaired totals.\n`);
    }
    
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    db.close();
    client.destroy();
    process.exit(0);
  }
}

console.log("🔐 Logging into Discord...");

client.once("clientReady", async () => {
  console.log("✅ Connected!\n");
  await main();
});

client.on("error", (error) => {
  console.error("❌ Discord client error:", error.message);
  process.exit(1);
});

client.login(DISCORD_TOKEN).catch(err => {
  console.error("❌ Failed to login:", err.message);
  process.exit(1);
});
