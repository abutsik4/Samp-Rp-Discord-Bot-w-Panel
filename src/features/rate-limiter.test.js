"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const {
  ensureRateLimitTables,
  setRateLimitConfig,
  checkRateLimit,
} = require("./rate-limiter");

function openMemoryDb() {
  return new sqlite3.Database(":memory:");
}

test("rate limiter user overrides take precedence over role and default limits", async () => {
  const db = openMemoryDb();

  try {
    await ensureRateLimitTables(db);
    await setRateLimitConfig(db, "guild-1", "channel-1", {
      enabled: true,
      default_limit: 5,
      role_limits: [{ role_id: "role-1", limit: 9 }],
      user_limits: [{ user_id: "user-1", limit: 2 }],
    });

    const first = await checkRateLimit(db, "guild-1", "channel-1", "user-1", ["role-1"]);
    const second = await checkRateLimit(db, "guild-1", "channel-1", "user-1", ["role-1"]);
    const third = await checkRateLimit(db, "guild-1", "channel-1", "user-1", ["role-1"]);

    assert.equal(first.limit, 2);
    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
  } finally {
    db.close();
  }
});

test("rate limiter falls back to role limit when user override is absent", async () => {
  const db = openMemoryDb();

  try {
    await ensureRateLimitTables(db);
    await setRateLimitConfig(db, "guild-2", "channel-2", {
      enabled: true,
      default_limit: 3,
      role_limits: [{ role_id: "role-2", limit: 6 }],
      user_limits: [],
    });

    const result = await checkRateLimit(db, "guild-2", "channel-2", "user-2", ["role-2"]);

    assert.equal(result.limit, 6);
    assert.equal(result.allowed, true);
  } finally {
    db.close();
  }
});
