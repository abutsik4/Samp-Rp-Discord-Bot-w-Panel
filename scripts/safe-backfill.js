#!/usr/bin/env node
/**
 * Safe Backfill Script
 * 
 * This script recalculates message counts from Discord history without destroying current data:
 * 1. Fetches all messages from Discord channels
 * 2. Counts messages per user
 * 3. Compares with current database stats
 * 4. Reports discrepancies
 * 5. Optionally updates database (with --fix flag)
 * 
 * Unlike the /backfill command, this preserves your current database and only updates
 * when you explicitly use the --fix flag.
 * 
 * Usage:
 *   npm run backfill:safe          # Report only (dry run)
 *   npm run backfill:safe -- --fix # Update database with Discord counts
 */

const { Client, GatewayIntentBits, Partials } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

// Color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
};

// Parse command line arguments
const args = process.argv.slice(2);
const shouldFix = args.includes("--fix");

// Environment variables
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error(`${colors.red}Error: DISCORD_TOKEN not found in .env file${colors.reset}`);
  process.exit(1);
}

// Database path
const dbPath = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, "..", "data", "stats.db");

console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}     Safe Backfill Tool (Discord)   ${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
console.log(`Database: ${dbPath}`);
console.log(`Mode: ${shouldFix ? colors.yellow + "FIX MODE" + colors.reset : colors.green + "DRY RUN (report only)" + colors.reset}`);
console.log();

const db = new sqlite3.Database(dbPath);

// Promisified database helpers
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stats tracking
const stats = {
  totalMessages: 0,
  totalChannels: 0,
  usersFound: 0,
  errors: 0,
};

async function fetchDiscordCounts(client) {
  const discordCounts = new Map(); // "guildId:userId" -> count

  console.log(`${colors.bright}Step 1: Fetching Discord message history...${colors.reset}`);
  console.log();

  const guilds = await client.guilds.fetch();
  
  for (const [guildId, guild] of guilds) {
    const fullGuild = await guild.fetch();
    console.log(`${colors.cyan}Guild: ${fullGuild.name} (${guildId})${colors.reset}`);
    
    const channels = await fullGuild.channels.fetch();

    for (const [, channel] of channels) {
      if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;
      if (channel.isThread && channel.isThread()) continue;

      console.log(`  ${colors.dim}Fetching channel: #${channel.name} (${channel.id})${colors.reset}`);
      stats.totalChannels++;

      let lastId = null;
      let channelCount = 0;

      while (true) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;

        let messages;
        try {
          messages = await channel.messages.fetch(options);
        } catch (err) {
          console.error(`  ${colors.red}✗ Error fetching messages: ${err.message}${colors.reset}`);
          stats.errors++;
          break;
        }

        if (messages.size === 0) break;

        for (const message of messages.values()) {
          if (!message.guild) continue;
          if (!message.author) continue;
          if (message.author.bot) continue;

          const key = `${message.guild.id}:${message.author.id}`;
          discordCounts.set(key, (discordCounts.get(key) || 0) + 1);
          stats.totalMessages++;
          channelCount++;
        }

        lastId = messages.last().id;
        
        // Rate limiting (be gentle with Discord API)
        await sleep(500);
      }

      console.log(`  ${colors.green}✓ Fetched ${channelCount} messages from #${channel.name}${colors.reset}`);
      
      // Delay between channels
      await sleep(1000);
    }

    console.log();
  }

  // Count unique users
  stats.usersFound = discordCounts.size;

  return discordCounts;
}

async function compareWithDatabase(discordCounts) {
  console.log(`${colors.bright}Step 2: Comparing with current database...${colors.reset}`);
  console.log();

  const discrepancies = [];
  let correctUsers = 0;
  let incorrectUsers = 0;
  let missingInDb = 0;
  let extraInDb = 0;

  // Check each Discord count against database
  for (const [key, discordCount] of discordCounts) {
    const [guildId, userId] = key.split(":");
    
    const statsRow = await dbGet(
      `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    if (!statsRow) {
      // User exists in Discord but not in database
      missingInDb++;
      discrepancies.push({
        type: "missing",
        guild_id: guildId,
        user_id: userId,
        discord: discordCount,
        database: 0,
        diff: discordCount,
      });
    } else if (statsRow.message_count !== discordCount) {
      // Count mismatch
      incorrectUsers++;
      discrepancies.push({
        type: "mismatch",
        guild_id: guildId,
        user_id: userId,
        discord: discordCount,
        database: statsRow.message_count,
        diff: discordCount - statsRow.message_count,
      });
    } else {
      // Correct!
      correctUsers++;
    }
  }

  // Check for users in database that don't exist in Discord
  console.log(`${colors.bright}Step 3: Checking for users in database not found in Discord...${colors.reset}`);
  console.log();
  
  const allStats = await dbAll(`SELECT guild_id, user_id, message_count FROM user_stats`);
  
  for (const stat of allStats) {
    const key = `${stat.guild_id}:${stat.user_id}`;
    
    if (!discordCounts.has(key)) {
      // User in database but not found in Discord history
      extraInDb++;
      discrepancies.push({
        type: "extra",
        guild_id: stat.guild_id,
        user_id: stat.user_id,
        discord: 0,
        database: stat.message_count,
        diff: -stat.message_count,
      });
    }
  }

  return {
    correctUsers,
    incorrectUsers,
    missingInDb,
    extraInDb,
    discrepancies,
    totalDbRecords: allStats.length,
  };
}

async function displayResults(comparison) {
  console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}         Backfill Results           ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
  console.log();
  console.log(`${colors.bright}Discord Messages Fetched:${colors.reset} ${stats.totalMessages.toLocaleString()}`);
  console.log(`${colors.bright}Channels Processed:${colors.reset} ${stats.totalChannels}`);
  console.log(`${colors.bright}Users Found in Discord:${colors.reset} ${stats.usersFound.toLocaleString()}`);
  console.log(`${colors.bright}Database Records:${colors.reset} ${comparison.totalDbRecords.toLocaleString()}`);
  if (stats.errors > 0) {
    console.log(`${colors.red}Errors Encountered:${colors.reset} ${stats.errors}`);
  }
  console.log();
  console.log(`${colors.green}✓ Matching:${colors.reset} ${comparison.correctUsers} users`);
  console.log(`${colors.yellow}⚠ Mismatched:${colors.reset} ${comparison.incorrectUsers} users`);
  console.log(`${colors.red}✗ Missing in DB:${colors.reset} ${comparison.missingInDb} users`);
  console.log(`${colors.magenta}⚠ Extra in DB:${colors.reset} ${comparison.extraInDb} users`);
  console.log();

  if (comparison.discrepancies.length > 0) {
    console.log(`${colors.bright}${colors.red}Found ${comparison.discrepancies.length} discrepancies:${colors.reset}`);
    console.log();

    // Show first 25 discrepancies
    const showCount = Math.min(25, comparison.discrepancies.length);
    for (let i = 0; i < showCount; i++) {
      const d = comparison.discrepancies[i];
      const symbol = d.type === "missing" ? "✗" : d.type === "extra" ? "⚠" : "≠";
      const color = d.type === "missing" ? colors.red : d.type === "extra" ? colors.magenta : colors.yellow;
      
      const typeLabel = d.type.toUpperCase().padEnd(10);
      const discordStr = d.discord.toString().padStart(6);
      const databaseStr = d.database.toString().padStart(6);
      const diffStr = (d.diff > 0 ? "+" : "") + d.diff;
      
      console.log(
        `${color}${symbol} ${typeLabel}${colors.reset} ` +
        `User: ${d.user_id.substring(0, 12)}... ` +
        `Discord: ${discordStr} | DB: ${databaseStr} | Diff: ${diffStr}`
      );
    }

    if (comparison.discrepancies.length > showCount) {
      console.log(`${colors.yellow}... and ${comparison.discrepancies.length - showCount} more discrepancies${colors.reset}`);
    }

    console.log();

    if (shouldFix) {
      console.log(`${colors.bright}${colors.yellow}Applying fixes...${colors.reset}`);
      console.log();

      let fixed = 0;
      let errors = 0;

      for (const d of comparison.discrepancies) {
        try {
          if (d.type === "extra" && d.database > 0) {
            // Remove users not found in Discord
            await dbRun(
              `DELETE FROM user_stats WHERE guild_id = ? AND user_id = ?`,
              [d.guild_id, d.user_id]
            );
            console.log(`${colors.green}✓ Removed extra entry for user ${d.user_id.substring(0, 12)}...${colors.reset}`);
            fixed++;
          } else {
            // Insert or update with Discord count
            await dbRun(
              `INSERT INTO user_stats (guild_id, user_id, message_count)
               VALUES (?, ?, ?)
               ON CONFLICT(guild_id, user_id)
               DO UPDATE SET message_count = excluded.message_count`,
              [d.guild_id, d.user_id, d.discord]
            );
            const action = d.type === "missing" ? "Added" : "Updated";
            console.log(`${colors.green}✓ ${action} user ${d.user_id.substring(0, 12)}...: ${d.database} → ${d.discord}${colors.reset}`);
            fixed++;
          }
        } catch (err) {
          console.error(`${colors.red}✗ Error fixing ${d.user_id}:${colors.reset}`, err.message);
          errors++;
        }
      }

      console.log();
      console.log(`${colors.bright}${colors.green}Fixed ${fixed} discrepancies${colors.reset}`);
      if (errors > 0) {
        console.log(`${colors.bright}${colors.red}Encountered ${errors} errors${colors.reset}`);
      }
    } else {
      console.log(`${colors.yellow}ℹ Run with --fix flag to automatically update database to match Discord${colors.reset}`);
      console.log(`${colors.dim}  npm run backfill:safe -- --fix${colors.reset}`);
    }
  } else {
    console.log(`${colors.bright}${colors.green}✓ Database is perfectly in sync with Discord! No discrepancies found.${colors.reset}`);
  }

  console.log();
  console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}        Backfill Complete           ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
  console.log();
}

async function main() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  try {
    console.log(`${colors.bright}Logging into Discord...${colors.reset}`);
    await client.login(TOKEN);
    console.log(`${colors.green}✓ Connected as ${client.user.tag}${colors.reset}`);
    console.log();

    // Fetch Discord message counts
    const discordCounts = await fetchDiscordCounts(client);

    // Compare with database
    const comparison = await compareWithDatabase(discordCounts);

    // Display results
    await displayResults(comparison);

  } catch (err) {
    console.error(`${colors.red}${colors.bright}Fatal error:${colors.reset}`, err);
    process.exit(1);
  } finally {
    db.close();
    client.destroy();
  }
}

// Run main
main().catch((err) => {
  console.error(`${colors.red}${colors.bright}Unhandled error:${colors.reset}`, err);
  process.exit(1);
});
