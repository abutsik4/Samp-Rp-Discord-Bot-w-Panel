#!/usr/bin/env node
"use strict";

/**
 * Migration script to create analytics tables
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "stats.db");
const db = new sqlite3.Database(dbPath);

const migrations = [
  {
    name: "Create daily_channel_stats table",
    sql: `
      CREATE TABLE IF NOT EXISTS daily_channel_stats (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_date TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, channel_id, message_date)
      )
    `
  },
  {
    name: "Create index on daily_channel_stats (date)",
    sql: `CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_channel_stats(guild_id, message_date)`
  },
  {
    name: "Create index on daily_channel_stats (channel)",
    sql: `CREATE INDEX IF NOT EXISTS idx_daily_stats_channel ON daily_channel_stats(guild_id, channel_id, message_date)`
  },
  {
    name: "Create index on daily_channel_stats (user)",
    sql: `CREATE INDEX IF NOT EXISTS idx_daily_stats_user ON daily_channel_stats(guild_id, user_id, message_date)`
  },
  {
    name: "Create backfill_watermarks table",
    sql: `
      CREATE TABLE IF NOT EXISTS backfill_watermarks (
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        last_message_id TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        PRIMARY KEY (guild_id, channel_id)
      )
    `
  }
];

async function runMigration() {
  console.log("Running analytics schema migrations...\n");

  for (const migration of migrations) {
    await new Promise((resolve, reject) => {
      db.run(migration.sql, (err) => {
        if (err) {
          console.error(`✗ ${migration.name}:`, err.message);
          reject(err);
        } else {
          console.log(`✓ ${migration.name}`);
          resolve();
        }
      });
    });
  }

  console.log("\n✓ All migrations completed successfully!");
  db.close();
}

runMigration().catch(err => {
  console.error("\n✗ Migration failed:", err);
  db.close();
  process.exit(1);
});
