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

const DB_PATH = path.join(__dirname, "..", "data", "stats.db");
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

async function getBotCount(db, userId, guildId) {
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

async function getDiscordCount(guild, userId) {
  try {
    let totalCount = 0;
    const allChannels = [];

    // Collect text channels
    guild.channels.cache.forEach((channel) => {
      if (channel.isTextBased()) {
        allChannels.push(channel);
      }
    });

    // Collect active threads
    try {
      const activeThreads = await guild.channels.fetchActiveThreads();
      activeThreads.threads.forEach((thread) => allChannels.push(thread));
    } catch (err) {
      console.warn("  ⚠️  Cannot fetch active threads:", err.message);
    }

    console.log(`  📊 Scanning ${allChannels.length} channels/threads (including active threads)...`);

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
    
    const botCount = await getBotCount(db, userId, guildId);
    console.log(`🤖 Bot count: ${botCount}\n`);
    
    console.log(`🔍 Fetching actual count from Discord...`);
    const discordCount = await getDiscordCount(guild, userId);
    
    if (discordCount === null) {
      console.log(`\n❌ Failed to verify`);
      process.exit(1);
    }
    
    console.log(`\n📱 Discord count: ${discordCount}`);
    
    const difference = discordCount - botCount;
    const accuracy = discordCount > 0 ? ((botCount / discordCount) * 100).toFixed(2) : 100;
    
    console.log(`\n${'='.repeat(64)}`);
    if (difference === 0) {
      console.log(`✅ Perfect match!`);
    } else {
      console.log(`⚠️  Difference: ${difference >= 0 ? '+' : ''}${difference} messages`);
    }
    console.log(`   Accuracy: ${accuracy}%`);
    console.log('='.repeat(64));
    
    await storeReference(db, userId, discordCount, botCount);
    console.log(`\n💾 Result stored in database`);
    
    if (difference > 0) {
      console.log(`\nℹ️  Bot is missing ${difference} messages. Possible reasons:`);
      console.log(`   • Messages in private/archived threads`);
      console.log(`   • Deleted messages (Discord counts, bot can't fetch)`);
      console.log(`   • Messages before bot had permissions\n`);
    } else if (difference < 0) {
      console.log(`\n⚠️  Bot has ${Math.abs(difference)} MORE messages than Discord.`);
      console.log(`   This could indicate duplicates. Check the database.\n`);
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

client.once("ready", async () => {
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
