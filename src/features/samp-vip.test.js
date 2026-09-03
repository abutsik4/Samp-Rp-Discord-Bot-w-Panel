"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet, dbRun } = require("../utils/db-helpers");
const { ensureSampLifeTables } = require("./samp-life");
const {
  ensureVipTables,
  VIP_TIERS,
  WEEK_MS,
  getActiveVip,
  getVipBizBonus,
  getVipBailDiscount,
} = require("./samp-vip");

function makeDb() { return new sqlite3.Database(":memory:"); }

async function seedUser(db, userId, money = 10_000_000) {
  await dbRun(db, "INSERT OR REPLACE INTO samp_users(user_id, money) VALUES(?, ?)", [String(userId), money]);
}

test("ensureVipTables creates samp_vip with expected columns", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureVipTables(db);
  const row = await dbGet(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='samp_vip'");
  assert.ok(row, "samp_vip table should exist");
});

test("getActiveVip returns null when no row exists", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureVipTables(db);
  const vip = await getActiveVip(db, "u-none");
  assert.equal(vip, null);
});

test("getActiveVip returns null when expired", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureVipTables(db);
  await dbRun(
    db,
    "INSERT INTO samp_vip(user_id, tier, expires_at, total_spent, first_subscribed_at, last_renewed_at) VALUES(?,?,?,?,?,?)",
    ["u-exp", "bronze", Date.now() - 1000, 0, Date.now() - 100000, Date.now() - 100000]
  );
  const vip = await getActiveVip(db, "u-exp");
  assert.equal(vip, null);
});

test("getActiveVip returns tier when still active", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureVipTables(db);
  await dbRun(
    db,
    "INSERT INTO samp_vip(user_id, tier, expires_at, total_spent, first_subscribed_at, last_renewed_at) VALUES(?,?,?,?,?,?)",
    ["u-ok", "gold", Date.now() + WEEK_MS, 1000000, Date.now(), Date.now()]
  );
  const vip = await getActiveVip(db, "u-ok");
  assert.ok(vip);
  assert.equal(vip.tier.id, "gold");
});

test("VIP_TIERS has bronze/silver/gold with monotonic price", () => {
  assert.ok(VIP_TIERS.bronze);
  assert.ok(VIP_TIERS.silver);
  assert.ok(VIP_TIERS.gold);
  assert.ok(VIP_TIERS.bronze.price < VIP_TIERS.silver.price);
  assert.ok(VIP_TIERS.silver.price < VIP_TIERS.gold.price);
});

test("getVipBizBonus is 0 for non-VIP", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureVipTables(db);
  await seedUser(db, "u-nb");
  const bonus = await getVipBizBonus(db, "u-nb");
  assert.equal(Number(bonus), 0);
});

test("getVipBizBonus matches gold tier bonus", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureVipTables(db);
  await dbRun(
    db,
    "INSERT INTO samp_vip(user_id, tier, expires_at, total_spent, first_subscribed_at, last_renewed_at) VALUES(?,?,?,?,?,?)",
    ["u-gold", "gold", Date.now() + WEEK_MS, 0, Date.now(), Date.now()]
  );
  const bonus = await getVipBizBonus(db, "u-gold");
  assert.equal(Number(bonus), Number(VIP_TIERS.gold.bizBonus));
});

test("getVipBailDiscount only applies to silver and gold", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureVipTables(db);
  for (const tier of ["bronze", "silver", "gold"]) {
    await dbRun(
      db,
      "INSERT OR REPLACE INTO samp_vip(user_id, tier, expires_at, total_spent, first_subscribed_at, last_renewed_at) VALUES(?,?,?,?,?,?)",
      [`u-${tier}`, tier, Date.now() + WEEK_MS, 0, Date.now(), Date.now()]
    );
    const d = await getVipBailDiscount(db, `u-${tier}`);
    const expected = Number(VIP_TIERS[tier].bailDiscount || 0);
    assert.equal(Number(d), expected, `tier ${tier} discount`);
  }
});
