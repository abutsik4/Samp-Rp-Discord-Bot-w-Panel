"use strict";

require("dotenv").config();

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const { restoreSampState } = require("../src/features/samp-money-backups");

function parseArgs(argv) {
  const options = {
    dbPath: process.env.STATS_DB_PATH
      ? path.resolve(process.env.STATS_DB_PATH)
      : path.join(__dirname, "..", "data", "stats.db"),
    exportPath: "",
    apply: false,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg.startsWith("--db=")) {
      options.dbPath = path.resolve(arg.slice("--db=".length));
      continue;
    }
    if (arg.startsWith("--file=")) {
      options.exportPath = path.resolve(arg.slice("--file=".length));
    }
  }

  if (!options.exportPath) {
    throw new Error("--file=/path/to/export.json is required");
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = new sqlite3.Database(options.dbPath);

  try {
    const result = await restoreSampState(db, options.exportPath, { dryRun: !options.apply });
    console.log(`Export: ${result.summary.exportPath}`);
    console.log(`Created at: ${result.summary.createdAt || "unknown"}`);
    console.log(`Before total SAMP money: ${result.summary.before.totalSampMoney}`);
    if (result.summary.after) {
      console.log(`After total SAMP money: ${result.summary.after.totalSampMoney}`);
    }
    console.log(options.apply ? "Restore applied." : "Dry run only. Re-run with --apply to restore the exported SAMP state.");
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});