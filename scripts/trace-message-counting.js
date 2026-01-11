#!/usr/bin/env node
"use strict";

/**
 * Message Counting Trace Tool
 *
 * Prints message/user traces using local SQLite state.
 *
 * Usage:
 *   node scripts/trace-message-counting.js message <messageId> [--guild <guildId>] [--limit 50]
 *   node scripts/trace-message-counting.js user <userId> [--guild <guildId>] [--limit 50]
 *
 * Env:
 *   STATS_DB_PATH (optional) – defaults to data/stats.db
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const { getMessageTrace, getUserTrace } = require("../src/features/message-counting-debug");
const { createLogger } = require("../src/utils/logger");

const log = createLogger("trace-tool");

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--guild") out.guildId = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else out._.push(a);
  }
  return out;
}

function usage(exitCode = 0) {
  console.log(`\nMessage Counting Trace Tool\n\n` +
    `Usage:\n` +
    `  node scripts/trace-message-counting.js message <messageId> [--guild <guildId>] [--limit 50]\n` +
    `  node scripts/trace-message-counting.js user <userId> [--guild <guildId>] [--limit 50]\n\n` +
    `Tips:\n` +
    `  - Set LOG_LEVEL=debug for more internal logs\n` +
    `  - Set STATS_DB_PATH to point at your stats.db\n`
  );
  process.exit(exitCode);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [cmd, id] = args._;
  if (!cmd || !id || !["message", "user"].includes(cmd)) usage(1);

  const dbPath = process.env.STATS_DB_PATH
    ? path.resolve(process.env.STATS_DB_PATH)
    : path.join(__dirname, "..", "data", "stats.db");

  const db = new sqlite3.Database(dbPath);

  try {
    const limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.floor(args.limit) : 50;

    let result;
    if (cmd === "message") {
      result = await getMessageTrace(db, args.guildId || null, id, limit);
    } else {
      result = await getUserTrace(db, args.guildId || null, id, limit);
    }

    process.stdout.write(JSON.stringify({ ok: true, cmd, trace: result }, null, 2) + "\n");
  } catch (err) {
    log.error("Trace failed", { cmd, id, err: err.message });
    process.stderr.write(JSON.stringify({ ok: false, error: err.message || String(err) }, null, 2) + "\n");
    process.exitCode = 1;
  } finally {
    db.close(() => {});
  }
}

main();
