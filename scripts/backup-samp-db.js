"use strict";

require("dotenv").config();

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const { createSqliteSnapshot } = require("../src/features/samp-money-backups");

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
    const result = await createSqliteSnapshot(db, {
      backupDir: options.backupDir || undefined,
      retentionDays: options.retentionDays,
    });
    console.log(`SQLite snapshot saved to ${result.filePath}`);
    console.log(`Metadata saved to ${result.metadataPath}`);
    console.log(`Total SAMP money: ${result.stats.totalSampMoney}`);
    console.log(`Ledger max id: ${result.stats.ledgerMaxId}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});