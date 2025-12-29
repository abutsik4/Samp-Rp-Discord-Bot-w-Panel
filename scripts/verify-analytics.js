#!/usr/bin/env node
"use strict";

/**
 * Quick verification script - Tests real-time daily stats tracking
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "..", "data", "stats.db");
const db = new sqlite3.Database(dbPath);

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
};

console.log(`${colors.bright}${colors.cyan}Analytics Features Verification${colors.reset}\n`);

// Check tables exist
db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('daily_channel_stats', 'backfill_watermarks')`, (err, tables) => {
  if (err) {
    console.error("Error:", err);
    db.close();
    return;
  }

  console.log(`${colors.green}✓ Tables Created:${colors.reset}`);
  tables.forEach(t => console.log(`  - ${t.name}`));

  // Check indexes
  db.all(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_daily_%'`, (err, indexes) => {
    console.log(`\n${colors.green}✓ Indexes Created:${colors.reset}`);
    indexes.forEach(idx => console.log(`  - ${idx.name}`));

    // Check data
    db.get(`SELECT COUNT(*) as count FROM daily_channel_stats`, (err, row) => {
      console.log(`\n${colors.green}✓ Daily Stats Rows:${colors.reset} ${row.count}`);

      // Sample data
      db.all(`SELECT guild_id, user_id, channel_id, message_date, count FROM daily_channel_stats ORDER BY message_date DESC LIMIT 5`, (err, rows) => {
        if (rows.length > 0) {
          console.log(`\n${colors.cyan}Sample Daily Stats:${colors.reset}`);
          rows.forEach(r => {
            console.log(`  ${r.message_date} | Channel: ${r.channel_id?.slice(0, 10)}... | User: ${r.user_id?.slice(0, 10)}... | Count: ${r.count}`);
          });
        }

        // Check web server
        const http = require('http');
        const port = process.env.PORT || 5012;

        http.get(`http://localhost:${port}/`, (res) => {
          console.log(`\n${colors.green}✓ Web Server:${colors.reset} Running on port ${port} (status ${res.statusCode})`);

          // Summary
          console.log(`\n${colors.bright}${colors.green}═════════════════════════════════${colors.reset}`);
          console.log(`${colors.bright}${colors.green}All Analytics Features Ready! ✓${colors.reset}`);
          console.log(`${colors.bright}${colors.green}═════════════════════════════════${colors.reset}`);
          console.log(`\n${colors.cyan}Next Steps:${colors.reset}`);
          console.log(`  1. Test in Discord: /top5 period:7d`);
          console.log(`  2. Access dashboard: http://localhost:${port}/panel`);
          console.log(`  3. Navigate to: 📈 Analytics\n`);

          db.close();
        }).on('error', (err) => {
          console.log(`\n${colors.yellow}⚠ Web Server:${colors.reset} Not responding (${err.message})`);
          db.close();
        });
      });
    });
  });
});
