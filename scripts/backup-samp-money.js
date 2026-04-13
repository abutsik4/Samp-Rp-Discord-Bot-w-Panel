"use strict";

require("dotenv").config();

const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const { backupSampMoney } = require("../src/features/samp-money-backups");

const dbPath = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, "..", "data", "stats.db");

async function main() {
  const db = new sqlite3.Database(dbPath);
  try {
    const result = await backupSampMoney(db);
    console.log(`Backup saved to ${result.filePath}`);
    console.log(`Users: ${result.userCount}, total money: ${result.totalMoney}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});