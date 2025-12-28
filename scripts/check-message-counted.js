#!/usr/bin/env node
"use strict";

/**
 * Check if messages are counted in the database
 * 
 * Usage:
 *   node scripts/check-message-counted.js <userId> [channelId]
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const readline = require("readline");

const DB_PATH = path.join(__dirname, "..", "data", "stats.db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  
  try {
    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║   Message Counter Checker                                     ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");
    
    const action = await question("Enter 'user' to check user's messages, 'message' to check specific message, or 'quit': ");
    
    if (action.toLowerCase() === 'quit') {
      rl.close();
      db.close();
      return;
    }
    
    if (action.toLowerCase() === 'user') {
      const userId = await question("\nEnter User ID: ");
      const guildId = await question("Enter Guild ID (press Enter for all guilds): ");
      
      let query = "SELECT COUNT(*) as count, COUNT(DISTINCT guild_id) as guilds FROM message_index WHERE user_id = ?";
      let params = [userId];
      
      if (guildId) {
        query = "SELECT COUNT(*) as count FROM message_index WHERE user_id = ? AND guild_id = ?";
        params = [userId, guildId];
      }
      
      db.get(query, params, (err, row) => {
        if (err) {
          console.error("Error:", err.message);
        } else {
          if (guildId) {
            console.log(`\n✓ Messages from user ${userId} in guild ${guildId}: ${row.count}`);
          } else {
            console.log(`\n✓ Total messages from user ${userId} across ${row.guilds} guilds: ${row.count}`);
          }
          
          // Show breakdown by guild if no guild specified
          if (!guildId) {
            db.all(
              "SELECT guild_id, COUNT(*) as count FROM message_index WHERE user_id = ? GROUP BY guild_id ORDER BY count DESC",
              [userId],
              (err, rows) => {
                if (rows) {
                  console.log("\nBreakdown by guild:");
                  rows.forEach(r => console.log(`  ${r.guild_id}: ${r.count}`));
                }
                cleanup();
              }
            );
          } else {
            cleanup();
          }
        }
      });
    }
    
    if (action.toLowerCase() === 'message') {
      const messageId = await question("\nEnter Message ID: ");
      
      db.get(
        "SELECT * FROM message_index WHERE message_id = ?",
        [messageId],
        (err, row) => {
          if (err) {
            console.error("Error:", err.message);
            cleanup();
          } else if (!row) {
            console.log(`\n❌ Message ${messageId} NOT found in database`);
            cleanup();
          } else {
            console.log(`\n✅ Message ${messageId} IS counted!`);
            console.log(`   Guild ID: ${row.guild_id}`);
            console.log(`   User ID: ${row.user_id}`);
            console.log(`   Created: ${row.created_at}`);
            cleanup();
          }
        }
      );
    }
    
  } catch (err) {
    console.error("Error:", err.message);
    rl.close();
    db.close();
  }
  
  function cleanup() {
    rl.close();
    db.close();
  }
}

main();
