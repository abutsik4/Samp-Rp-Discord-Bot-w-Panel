"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet, dbRun } = require("../utils/db-helpers");
const { ensureSampLifeTables } = require("./samp-life");
const {
  ensureCrateTables,
  CRATES,
  REWARD_KINDS,
  PITY_THRESHOLD,
  rollCrate,
} = require("./samp-crates");

function makeDb() { return new sqlite3.Database(":memory:"); }

test("ensureCrateTables creates samp_crate_history", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureCrateTables(db);
  const row = await dbGet(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='samp_crate_history'");
  assert.ok(row);
});

test("CRATES exposes standard / premium / apocalypse", () => {
  assert.ok(CRATES.standard);
  assert.ok(CRATES.premium);
  assert.ok(CRATES.apocalypse);
});

test("each crate odds table sums to ~1.0", () => {
  for (const c of Object.values(CRATES)) {
    const sum = c.odds.reduce((s, o) => s + o.p, 0);
    assert.ok(Math.abs(sum - 1.0) < 1e-9, `${c.id} odds sum = ${sum}`);
  }
});

test("each crate has a jackpot entry at exactly 1% or less", () => {
  for (const c of Object.values(CRATES)) {
    const jp = c.odds.find((o) => o.kind === "jackpot");
    assert.ok(jp, `${c.id} should have jackpot`);
    assert.ok(jp.p <= 0.01 + 1e-9, `${c.id} jackpot ${jp.p} should be ≤ 0.01`);
  }
});

test("REWARD_KINDS maps kinds to rarity tiers", () => {
  for (const c of Object.values(CRATES)) {
    for (const o of c.odds) {
      assert.ok(REWARD_KINDS[o.kind], `${o.kind} should have rarity meta`);
    }
  }
});

test("rollCrate with random=0 picks the first odds bucket", () => {
  const orig = Math.random;
  Math.random = () => 0;
  try {
    const res = rollCrate(CRATES.standard);
    assert.equal(res.kind, CRATES.standard.odds[0].kind);
    assert.ok(res.payout > 0);
  } finally { Math.random = orig; }
});

test("rollCrate jackpotBlocked never returns jackpot", () => {
  const orig = Math.random;
  // Force the last bucket (highest random)
  Math.random = () => 0.999999;
  try {
    const res = rollCrate(CRATES.apocalypse, { jackpotBlocked: true });
    assert.notEqual(res.kind, "jackpot");
  } finally { Math.random = orig; }
});

test("rollCrate forceRarePlus returns rare or legendary", () => {
  const orig = Math.random;
  // Run a small sample under force-rare
  try {
    for (let i = 0; i < 50; i += 1) {
      Math.random = () => i / 50;
      const res = rollCrate(CRATES.standard, { forceRarePlus: true });
      const rarity = REWARD_KINDS[res.kind]?.rarity;
      assert.ok(rarity === "rare" || rarity === "legendary", `got ${rarity}`);
    }
  } finally { Math.random = orig; }
});

test("PITY_THRESHOLD is 10", () => {
  assert.equal(PITY_THRESHOLD, 10);
});

test("apocalypse crate has highest expected value floor", () => {
  // The biggest crate must offer some rare/legendary payouts.
  let hasRarePlus = false;
  for (const o of CRATES.apocalypse.odds) {
    const r = REWARD_KINDS[o.kind]?.rarity;
    if (r === "rare" || r === "legendary") hasRarePlus = true;
  }
  assert.ok(hasRarePlus);
});
