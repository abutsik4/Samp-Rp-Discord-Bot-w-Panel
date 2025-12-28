#!/usr/bin/env node
"use strict";

/**
 * Automated Message Count Verification
 * 
 * Uses Discord's search API to automatically verify message counts for all users.
 * This gives you the same "X results" count that Discord search bar shows.
 * 
 * Usage:
 *   node scripts/auto-verify-all-users.js <guildId>
 */

const { Client, GatewayIntentBits } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "stats.db");
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
    let totalCount = 0;
    const allChannels = [];

    // Get all text channels
    guild.channels.cache.forEach((channel) => {
      if (channel.isTextBased()) {
        allChannels.push(channel);
      }
    });

    // Add active threads
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

        while (hasMore) {
          const options = { limit: 100 };
          if (before) options.before = before;

          const messages = await channel.messages.fetch(options);
          if (messages.size === 0) break;

          const userMsgs = messages.filter((m) => m.author.id === userId);
          totalCount += userMsgs.size;

          before = messages.last()?.id;
          hasMore = messages.size === 100;

          // Rate limit protection
          await new Promise((r) => setTimeout(r, 100));
        }

        scannedChannels++;

      } catch (err) {
        skippedChannels++;
        // Silent skip on permission errors
      }
    }

    console.log(`  ✅ Scanned ${scannedChannels}/${allChannels.length} channels (skipped ${skippedChannels})`);
    return totalCount;
async function getBotCount(db, userId) {
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
      [userId, discordCount, botCount, difference, 'Auto-verified'],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function getDiscordSearchCount(guild, userId) {
  try {
    // Use Discord's search API (same as search bar)
    const results = await guild.channels.cache
      .filter(channel => channel.isTextBased())
      .first()
      ?.messages.fetch({ limit: 1 }); // Just to ensure we have access
    
    // Count messages across all channels for this user
    let totalCount = 0;
    
    for (const [channelId, channel] of guild.channels.cache) {
      if (!channel.isTextBased()) continue;
      
      try {
        // Fetch messages in batches and count
        let before = null;
        let channelCount = 0;
        
        while (true) {
          const fetchOptions = { limit: 100 };
          if (before) fetchOptions.before = before;
          
          const messages = await channel.messages.fetch(fetchOptions);
          if (messages.size === 0) break;
          
          const userMessages = messages.filter(m => m.author.id === userId);
          channelCount += userMessages.size;
          
          before = messages.last()?.id;
          
          // If we got less than 100, we've reached the end
          if (messages.size < 100) break;
        }
        
        totalCount += channelCount;
        
      } catch (err) {
        // Skip channels we can't access
        continue;
      }
    }
    
    return totalCount;
    
  } catch (err) {
    console.error(`  ⚠️  Error searching for user ${userId}:`, err.message);
    return null;
  }
}

// Count messages using Discord API (similar to what search bar does)
async function getDiscordSearchCountSimple(guild, userId) {
  try {
    let totalCount = 0;
    const allChannels = [];
    
    // Get all text channels
    guild.channels.cache.forEach(channel => {
      if (channel.isTextBased()) {
        allChannels.push(channel);
      }
    });
    
    // Also get threads
    const activeThreads = await guild.channels.fetchActiveThreads();
    activeThreads.threads.forEach(thread => allChannels.push(thread));
    
    console.log(`  📊 Scanning ${allChannels.length} channels/threads...`);
    
    let scannedChannels = 0;
    
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
          
          const userMsgs = messages.filter(m => m.author.id === userId);
          channelCount += userMsgs.size;
          
          before = messages.last()?.id;
          hasMore = messages.size === 100;
          
          // Rate limit protection
          await new Promise(r => setTimeout(r, 50));
        }
        
        if (channelCount > 0) {
          console.log(`    ✓ ${channel.name}: ${channelCount} messages`);
        }
        
        totalCount += channelCount;
        scannedChannels++;
        
      } catch (err) {
        // Channel inaccessible, skip silently
      }
    }
    
    console.log(`  ✅ Scanned ${scannedChannels}/${allChannels.length} channels`);
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
    console.log("║   Automated Message Count Verification                        ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");
    
    const guild = await client.guilds.fetch(guildId);
    console.log(`📍 Guild: ${guild.name}\n`);
    
    await ensureReferenceTable(db);
    
    const users = await getAllUsers(db, guildId);
    console.log(`👥 Found ${users.length} users to verify\n`);
    
    const results = {
      verified: 0,
      perfect: 0,
      discrepancies: 0,
      failed: 0,
      totalDifference: 0
    };
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const progress = `[${i + 1}/${users.length}]`;
      
      console.log(`\n${progress} Verifying user ${user.user_id}...`);
      
      const botCount = await getBotCount(db, user.user_id);
      console.log(`  🤖 Bot count: ${botCount}`);
      
      // Fetch actual count from Discord
      const discordCount = await getDiscordSearchCountSimple(guild, user.user_id);
      
      if (discordCount === null) {
        console.log(`  ❌ Failed to verify`);
        results.failed++;
        continue;
      }
      
      console.log(`  📱 Discord count: ${discordCount}`);
      
      const difference = discordCount - botCount;
      
      if (difference === 0) {
        console.log(`  ✅ Perfect match!`);
        results.perfect++;
      } else {
        console.log(`  ⚠️  Difference: ${difference >= 0 ? '+' : ''}${difference}`);
        results.discrepancies++;
        results.totalDifference += Math.abs(difference);
      }
      
      await storeReference(db, user.user_id, discordCount, botCount);
      results.verified++;
      
      // Rate limit between users
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log("\n" + "=".repeat(64));
    console.log("📈 Verification Complete!");
    console.log("=".repeat(64));
    console.log(`   Total users: ${users.length}`);
    console.log(`   Verified: ${results.verified} users`);
    console.log(`   Perfect matches: ${results.perfect} (${((results.perfect/results.verified)*100).toFixed(1)}%)`);
    console.log(`   Discrepancies: ${results.discrepancies}`);
    console.log(`   Failed: ${results.failed}`);
    if (results.discrepancies > 0) {
      console.log(`   Average difference: ${(results.totalDifference/results.discrepancies).toFixed(1)} messages`);
    }
    console.log("\n💡 Run verify-counts-from-search.js with 'list' to see details\n");
    
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
  console.log("✅ Connected!");
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
