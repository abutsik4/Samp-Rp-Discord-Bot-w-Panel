"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet, dbRun } = require("../utils/db-helpers");
const { ensureSampLifeTables } = require("./samp-life");
const { ensureSampExtendedTables } = require("./samp-extended");
const { ensurePrestigeTables } = require("./samp-prestige");
const {
  ensureUpgradeColumns,
  bizIncomeMultiplier,
  mansionRentMultiplier,
  aircraftPayMultiplier,
  getBizLevel,
  getMansionLevel,
  getAircraftLevel,
  BIZ_MAX_LEVEL,
  BIZ_BONUS_PER_LEVEL,
  MANSION_MAX_LEVEL,
  AIRCRAFT_MAX_LEVEL,
} = require("./samp-property-upgrades");

function makeDb() { return new sqlite3.Database(":memory:"); }

test("bizIncomeMultiplier is 1.0 at level 0 and grows linearly", () => {
  assert.equal(bizIncomeMultiplier(0), 1);
  assert.equal(bizIncomeMultiplier(1), 1 + BIZ_BONUS_PER_LEVEL);
  assert.equal(bizIncomeMultiplier(BIZ_MAX_LEVEL), 1 + BIZ_MAX_LEVEL * BIZ_BONUS_PER_LEVEL);
});

test("mansionRentMultiplier monotonically increases", () => {
  let prev = mansionRentMultiplier(0);
  assert.equal(prev, 1);
  for (let lv = 1; lv <= MANSION_MAX_LEVEL; lv += 1) {
    const cur = mansionRentMultiplier(lv);
    assert.ok(cur > prev, `level ${lv} should be > ${lv - 1}`);
    prev = cur;
  }
});

test("aircraftPayMultiplier monotonically increases", () => {
  let prev = aircraftPayMultiplier(0);
  assert.equal(prev, 1);
  for (let lv = 1; lv <= AIRCRAFT_MAX_LEVEL; lv += 1) {
    const cur = aircraftPayMultiplier(lv);
    assert.ok(cur > prev, `level ${lv} should be > ${lv - 1}`);
    prev = cur;
  }
});

test("ensureUpgradeColumns adds upgrade_level column to samp_properties", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);
  await ensurePrestigeTables(db);
  await ensureUpgradeColumns(db);
  const cols = await new Promise((resolve, reject) => {
    db.all("PRAGMA table_info(samp_properties)", (err, rows) => err ? reject(err) : resolve(rows));
  });
  assert.ok(cols.some((c) => c.name === "upgrade_level"));
});

test("getBizLevel returns 0 when property is not owned", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);
  await ensurePrestigeTables(db);
  await ensureUpgradeColumns(db);
  const lv = await getBizLevel(db, "u-x", "mechanic_shop");
  assert.equal(lv, 0);
});

test("getMansionLevel returns 0 with no mansion", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);
  await ensurePrestigeTables(db);
  await ensureUpgradeColumns(db);
  const lv = await getMansionLevel(db, "u-x");
  assert.equal(lv, 0);
});

test("getAircraftLevel returns 0 when aircraft not owned", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);
  await ensurePrestigeTables(db);
  await ensureUpgradeColumns(db);
  const lv = await getAircraftLevel(db, "u-x", "cessna");
  assert.equal(lv, 0);
});

test("getBizLevel reads back stored upgrade_level", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);
  await ensurePrestigeTables(db);
  await ensureUpgradeColumns(db);
  await dbRun(db, "INSERT OR REPLACE INTO samp_users(user_id, money) VALUES(?, ?)", ["u-biz", 1_000_000]);
  await dbRun(
    db,
    "INSERT INTO samp_properties(user_id, property_id, condition, supplies, upgrade_level) VALUES(?, ?, ?, ?, ?)",
    ["u-biz", "mechanic_shop", 100, 100, 3]
  );
  const lv = await getBizLevel(db, "u-biz", "mechanic_shop");
  assert.equal(lv, 3);
});
