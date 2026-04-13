"use strict";

require("dotenv").config();

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const { exportSampState } = require("../src/features/samp-money-backups");

function parseArgs(argv) {
  const options = {
    dbPath: process.env.STATS_DB_PATH
      ? path.resolve(process.env.STATS_DB_PATH)
      : path.join(__dirname, "..", "data", "stats.db"),
    backupDir: "",
    retentionDays: undefined,
  };

  for (const arg of argv) {
    if (arg.startsWith("--db=")) {
      options.dbPath = path.resolve(arg.slice("--db=".length));
      continue;
    }
    if (arg.startsWith("--backup-dir=")) {
      options.backupDir = path.resolve(arg.slice("--backup-dir=".length));
      continue;
    }
    if (arg.startsWith("--retention-days=")) {
      options.retentionDays = Number.parseInt(arg.slice("--retention-days=".length), 10);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = new sqlite3.Database(options.dbPath);

  try {
    const result = await exportSampState(db, {
      backupDir: options.backupDir || undefined,
      retentionDays: options.retentionDays,
    });
    console.log(`SAMP state export saved to ${result.filePath}`);
    console.log(`Total SAMP money: ${result.stats.totalSampMoney}`);
    console.log(`Tables exported: ${Object.keys(result.tableCounts).length}`);
    if (result.missingTables.length > 0) {
      console.log(`Missing tables: ${result.missingTables.join(", ")}`);
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});