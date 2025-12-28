#!/usr/bin/env node
"use strict";

/**
 * Verify Message Counts Using Discord Search Bar
 * 
 * Usage:
 *   1. In Discord, use search: from:userID in:serverName
 *   2. Discord shows "X results" - that's the TRUE count
 *   3. Run: node scripts/verify-counts-from-search.js
 *   4. Enter user ID and Discord's count
 *   5. Script compares with bot's count and stores reference
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

async function getBotCount(db, userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count FROM message_index WHERE user_id = ?`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      }
    );
  });
}

async function storeReference(db, userId, discordCount, botCount, notes = '') {
  return new Promise((resolve, reject) => {
    const difference = discordCount - botCount;
    db.run(
      `INSERT OR REPLACE INTO message_count_reference 
       (user_id, discord_search_count, bot_count, difference, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, discordCount, botCount, difference, notes],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

async function showAllReferences(db) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
        r.*,
        COALESCE(uc.username, r.user_id) as username
       FROM message_count_reference r
       LEFT JOIN user_cache uc ON r.user_id = uc.user_id
       ORDER BY ABS(r.difference) DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  
  try {
    await ensureReferenceTable(db);
    
    console.log("\n╔════════════════════════════════════════════════════════════════╗");
    console.log("║   Discord Search Count Verification Tool                      ║");
    console.log("╚════════════════════════════════════════════════════════════════╝\n");
    
    console.log("How to use Discord search:");
    console.log("  1. Open Discord server");
    console.log("  2. Click search bar (top-right)");
    console.log("  3. Type: from:userID in:serverName");
    console.log("  4. Discord shows 'X results' - that's the true count\n");
    
    const action = await question("Enter 'add' to add new verification, 'list' to show all, or 'quit': ");
    
    if (action.toLowerCase() === 'quit') {
      console.log("Exiting...");
      rl.close();
      db.close();
      return;
    }
    
    if (action.toLowerCase() === 'list') {
      const refs = await showAllReferences(db);
      
      if (refs.length === 0) {
        console.log("\n❌ No reference counts stored yet.\n");
      } else {
        console.log("\n📊 Stored Reference Counts:\n");
        console.log("User ID              | Username         | Discord | Bot  | Diff | Verified At");
        console.log("─────────────────────┼──────────────────┼─────────┼──────┼──────┼──────────────────");
        
        refs.forEach(r => {
          const username = (r.username || 'Unknown').padEnd(16).substring(0, 16);
          const userId = r.user_id.substring(0, 18).padEnd(20);
          const discord = String(r.discord_search_count).padStart(7);
          const bot = String(r.bot_count).padStart(5);
          const diff = (r.difference >= 0 ? '+' : '') + r.difference;
          const diffPadded = diff.padStart(6);
          const verified = r.verified_at.substring(0, 16);
          
          const indicator = r.difference === 0 ? '✓' : (Math.abs(r.difference) <= 10 ? '⚠' : '✗');
          console.log(`${indicator} ${userId}│ ${username} │ ${discord} │ ${bot} │${diffPadded} │ ${verified}`);
        });
        
        const totalDiscrepancies = refs.filter(r => r.difference !== 0).length;
        const avgDifference = refs.reduce((sum, r) => sum + Math.abs(r.difference), 0) / refs.length;
        
        console.log("\n📈 Summary:");
        console.log(`   Total verified users: ${refs.length}`);
        console.log(`   Perfect matches: ${refs.length - totalDiscrepancies}`);
        console.log(`   With discrepancies: ${totalDiscrepancies}`);
        console.log(`   Average difference: ${avgDifference.toFixed(1)} messages\n`);
      }
      
      rl.close();
      db.close();
      return;
    }
    
    if (action.toLowerCase() === 'add') {
      const userId = await question("\nEnter Discord User ID: ");
      
      if (!userId || userId.length < 10) {
        console.log("❌ Invalid user ID");
        rl.close();
        db.close();
        return;
      }
      
      const botCount = await getBotCount(db, userId);
      console.log(`\n🤖 Bot's current count for this user: ${botCount}`);
      
      const discordCountStr = await question("\nEnter count from Discord search (the 'X results' number): ");
      const discordCount = parseInt(discordCountStr);
      
      if (isNaN(discordCount) || discordCount < 0) {
        console.log("❌ Invalid count");
        rl.close();
        db.close();
        return;
      }
      
      const notes = await question("\nOptional notes (press Enter to skip): ");
      
      await storeReference(db, userId, discordCount, botCount, notes);
      
      const difference = discordCount - botCount;
      const accuracy = botCount > 0 ? ((botCount / discordCount) * 100).toFixed(2) : 0;
      
      console.log("\n✅ Reference count stored!");
      console.log(`   Discord search count: ${discordCount}`);
      console.log(`   Bot count: ${botCount}`);
      console.log(`   Difference: ${difference >= 0 ? '+' : ''}${difference}`);
      console.log(`   Accuracy: ${accuracy}%\n`);
      
      if (difference > 0) {
        console.log(`ℹ️  Bot is missing ${difference} messages. Possible reasons:`);
        console.log(`   • Messages in private/archived threads`);
        console.log(`   • Deleted messages (Discord counts them, bot can't fetch)`);
        console.log(`   • Messages before bot had Read Message History permission`);
        console.log(`\n💡 Try running /backfill again to collect any new messages.\n`);
      } else if (difference < 0) {
        console.log(`⚠️  Bot has ${Math.abs(difference)} MORE messages than Discord search.`);
        console.log(`   This could indicate duplicate entries. Run audit-user.js to check.\n`);
      } else {
        console.log(`🎉 Perfect match! Bot count matches Discord search.\n`);
      }
    }
    
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    rl.close();
    db.close();
  }
}

main();
