#!/usr/bin/env node
"use strict";

/**
 * Backfill script to populate daily_channel_stats from existing message_index
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
require("dotenv").config();

const dbPath = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, "..", "data", "stats.db");
const db = new sqlite3.Database(dbPath);

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
};

async function backfillDailyStats() {
  console.log(`${colors.bright}${colors.cyan}Rebuilding daily_channel_stats from message_index...${colors.reset}\n`);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN IMMEDIATE", (beginErr) => {
        if (beginErr) {
          reject(beginErr);
          return;
        }

        db.run(`DELETE FROM daily_channel_stats`, (deleteErr) => {
          if (deleteErr) {
            db.run("ROLLBACK", () => reject(deleteErr));
            return;
          }

          const sql = `
            INSERT INTO daily_channel_stats (guild_id, user_id, channel_id, message_date, count)
            SELECT 
              guild_id,
              user_id,
              channel_id,
              DATE(created_at) as message_date,
              COUNT(*) as count
            FROM message_index
            WHERE channel_id IS NOT NULL
            GROUP BY guild_id, user_id, channel_id, DATE(created_at)
          `;

          db.run(sql, function(insertErr) {
            if (insertErr) {
              db.run("ROLLBACK", () => reject(insertErr));
              return;
            }

            const inserted = this.changes;
            db.run("COMMIT", (commitErr) => {
              if (commitErr) {
                db.run("ROLLBACK", () => reject(commitErr));
                return;
              }

              console.log(`${colors.green}✓ Rebuild complete: ${inserted} rows inserted${colors.reset}`);
              resolve(inserted);
            });
          });
        });
      });
    });
  });
}

async function verifyBackfill() {
  console.log(`\n${colors.cyan}Verifying backfill accuracy...${colors.reset}\n`);

  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        mi.guild_id,
        COUNT(*) as message_count,
        (SELECT SUM(count) FROM daily_channel_stats dcs WHERE dcs.guild_id = mi.guild_id) as daily_count
      FROM message_index mi
      GROUP BY mi.guild_id
    `, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        rows.forEach(row => {
          const accuracy = row.message_count > 0 ? ((row.daily_count / row.message_count) * 100).toFixed(2) : 0;
          console.log(`  Guild ${row.guild_id.slice(0, 10)}... - ${row.message_count} messages, ${row.daily_count} in daily_stats (${accuracy}%)`);
        });
        console.log(`\n${colors.green}✓ Verification complete${colors.reset}`);
        resolve(rows);
      }
    });
  });
}

async function run() {
  try {
    await backfillDailyStats();
    await verifyBackfill();
    db.close();
  } catch (err) {
    console.error(`\nBackfill failed:`, err);
    db.close();
    process.exit(1);
  }
}

run();
