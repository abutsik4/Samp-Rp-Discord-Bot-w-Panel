#!/usr/bin/env node
"use strict";

// Cleans up legacy Spam Limits DB artifacts from the old frequency-based limiter.
// - Drops rate_limit_messages + its index (no longer used)
// - NULLs time_window_minutes (no longer used)
// - VACUUM to shrink the DB file (may take a moment and requires an exclusive lock)

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "../data/stats.db");

function run(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
}

async function main() {
  console.log(`[cleanup-spam-limits-db] Opening ${dbPath}`);
  const db = new sqlite3.Database(dbPath);

  try {
    await run(db, "BEGIN IMMEDIATE;");

    console.log("[cleanup-spam-limits-db] Dropping legacy rate_limit_messages...");
    await run(db, "DROP INDEX IF EXISTS idx_rate_messages;");
    await run(db, "DROP TABLE IF EXISTS rate_limit_messages;");

    console.log("[cleanup-spam-limits-db] Clearing legacy time_window_minutes...");
    await run(db, "UPDATE rate_limit_config SET time_window_minutes = NULL WHERE time_window_minutes IS NOT NULL;");

    await run(db, "COMMIT;");

    console.log("[cleanup-spam-limits-db] VACUUM (may take a moment)...");
    await run(db, "VACUUM;");

    console.log("[cleanup-spam-limits-db] Done.");
  } catch (e) {
    try { await run(db, "ROLLBACK;"); } catch (_) {}
    throw e;
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error("FAILED:", e && e.stack ? e.stack : e);
  process.exit(1);
});
