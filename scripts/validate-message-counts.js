#!/usr/bin/env node
/**
 * Message Database Validation Script
 * 
 * This script re-validates all message counts by:
 * 1. Counting actual messages from message_index table
 * 2. Comparing with current user_stats totals
 * 3. Reporting discrepancies
 * 4. Optionally fixing them (with --fix flag)
 * 
 * Usage:
 *   npm run validate:messages          # Report only (dry run)
 *   npm run validate:messages -- --fix # Fix discrepancies
 */

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
};

// Parse command line arguments
const args = process.argv.slice(2);
const shouldFix = args.includes("--fix");

// Database path (same as main app)
const dbPath = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, "..", "data", "stats.db");

console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
console.log(`${colors.bright}${colors.cyan}  Message Database Validation Tool  ${colors.reset}`);
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

async function validateDatabase() {
  try {
    console.log(`${colors.bright}Step 1: Counting messages in message_index...${colors.reset}`);
    
    // Count actual messages from message_index
    const actualCounts = await dbAll(`
      SELECT 
        guild_id,
        user_id,
        COUNT(*) as actual_count
      FROM message_index
      GROUP BY guild_id, user_id
    `);

    console.log(`${colors.green}✓ Found ${actualCounts.length} user/guild combinations with messages${colors.reset}`);
    console.log();

    console.log(`${colors.bright}Step 2: Comparing with user_stats table...${colors.reset}`);
    
    let totalMessages = 0;
    let correctUsers = 0;
    let incorrectUsers = 0;
    let missingUsers = 0;
    let extraUsers = 0;
    
    const discrepancies = [];

    // Check each actual count against user_stats
    for (const actual of actualCounts) {
      totalMessages += actual.actual_count;
      
      const statsRow = await dbGet(
        `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
        [actual.guild_id, actual.user_id]
      );

      if (!statsRow) {
        // User exists in message_index but not in user_stats
        missingUsers++;
        discrepancies.push({
          type: "missing",
          guild_id: actual.guild_id,
          user_id: actual.user_id,
          actual: actual.actual_count,
          stored: 0,
          diff: actual.actual_count,
        });
      } else if (statsRow.message_count !== actual.actual_count) {
        // Count mismatch
        incorrectUsers++;
        discrepancies.push({
          type: "mismatch",
          guild_id: actual.guild_id,
          user_id: actual.user_id,
          actual: actual.actual_count,
          stored: statsRow.message_count,
          diff: actual.actual_count - statsRow.message_count,
        });
      } else {
        // Correct!
        correctUsers++;
      }
    }

    // Check for users in user_stats that don't exist in message_index
    console.log(`${colors.bright}Step 3: Checking for orphaned user_stats entries...${colors.reset}`);
    
    const allStats = await dbAll(`SELECT guild_id, user_id, message_count FROM user_stats`);
    
    for (const stat of allStats) {
      const hasMessages = actualCounts.find(
        (a) => a.guild_id === stat.guild_id && a.user_id === stat.user_id
      );
      
      if (!hasMessages) {
        // User in stats but no messages in index
        extraUsers++;
        discrepancies.push({
          type: "orphaned",
          guild_id: stat.guild_id,
          user_id: stat.user_id,
          actual: 0,
          stored: stat.message_count,
          diff: -stat.message_count,
        });
      }
    }

    console.log();
    console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}         Validation Results         ${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
    console.log();
    console.log(`${colors.bright}Total Messages Indexed:${colors.reset} ${totalMessages.toLocaleString()}`);
    console.log(`${colors.bright}Total User Records:${colors.reset} ${allStats.length.toLocaleString()}`);
    console.log();
    console.log(`${colors.green}✓ Correct:${colors.reset} ${correctUsers} users`);
    console.log(`${colors.yellow}⚠ Mismatched:${colors.reset} ${incorrectUsers} users`);
    console.log(`${colors.red}✗ Missing from stats:${colors.reset} ${missingUsers} users`);
    console.log(`${colors.magenta}⚠ Orphaned in stats:${colors.reset} ${extraUsers} users`);
    console.log();

    if (discrepancies.length > 0) {
      console.log(`${colors.bright}${colors.red}Found ${discrepancies.length} discrepancies:${colors.reset}`);
      console.log();

      // Show first 20 discrepancies
      const showCount = Math.min(20, discrepancies.length);
      for (let i = 0; i < showCount; i++) {
        const d = discrepancies[i];
        const symbol = d.type === "missing" ? "✗" : d.type === "orphaned" ? "⚠" : "≠";
        const color = d.type === "missing" ? colors.red : d.type === "orphaned" ? colors.magenta : colors.yellow;
        
        console.log(
          `${color}${symbol} ${d.type.toUpperCase().padEnd(10)}${colors.reset} ` +
          `Guild: ${d.guild_id.substring(0, 8)}... User: ${d.user_id.substring(0, 8)}... ` +
          `Actual: ${d.actual.toString().padStart(6)} | Stored: ${d.stored.toString().padStart(6)} | ` +
          `Diff: ${d.diff > 0 ? "+" : ""}${d.diff}`
        );
      }

      if (discrepancies.length > showCount) {
        console.log(`${colors.yellow}... and ${discrepancies.length - showCount} more discrepancies${colors.reset}`);
      }

      console.log();

      if (shouldFix) {
        console.log(`${colors.bright}${colors.yellow}Applying fixes...${colors.reset}`);
        console.log();

        let fixed = 0;
        let errors = 0;

        for (const d of discrepancies) {
          try {
            if (d.type === "orphaned" && d.stored > 0) {
              // Remove orphaned entries
              await dbRun(
                `DELETE FROM user_stats WHERE guild_id = ? AND user_id = ?`,
                [d.guild_id, d.user_id]
              );
              console.log(`${colors.green}✓ Removed orphaned entry for user ${d.user_id.substring(0, 12)}...${colors.reset}`);
              fixed++;
            } else {
              // Insert or update with correct count
              await dbRun(
                `INSERT INTO user_stats (guild_id, user_id, message_count)
                 VALUES (?, ?, ?)
                 ON CONFLICT(guild_id, user_id)
                 DO UPDATE SET message_count = excluded.message_count`,
                [d.guild_id, d.user_id, d.actual]
              );
              console.log(`${colors.green}✓ Fixed count for user ${d.user_id.substring(0, 12)}...: ${d.stored} → ${d.actual}${colors.reset}`);
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
        console.log(`${colors.yellow}ℹ Run with --fix flag to automatically correct these discrepancies${colors.reset}`);
        console.log(`${colors.dim}  npm run validate:messages -- --fix${colors.reset}`);
      }
    } else {
      console.log(`${colors.bright}${colors.green}✓ All message counts are correct! No discrepancies found.${colors.reset}`);
    }

    console.log();
    console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}        Validation Complete         ${colors.reset}`);
    console.log(`${colors.bright}${colors.cyan}====================================${colors.reset}`);
    console.log();

  } catch (err) {
    console.error(`${colors.red}${colors.bright}Error during validation:${colors.reset}`, err);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run validation
validateDatabase().catch((err) => {
  console.error(`${colors.red}${colors.bright}Fatal error:${colors.reset}`, err);
  process.exit(1);
});
