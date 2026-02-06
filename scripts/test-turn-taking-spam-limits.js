#!/usr/bin/env node
"use strict";

// Minimal sanity test for turn-taking/consecutive spam limits.
// This does NOT require Discord; it validates limiter behavior at the module level.

const sqlite3 = require("sqlite3").verbose();
const {
  ensureRateLimitTables,
  setRateLimitConfig,
  checkRateLimit,
  pruneConsecutiveState,
} = require("../src/features/rate-limiter");

function assert(cond, msg) {
  if (!cond) {
    const err = new Error(msg || "Assertion failed");
    err.name = "AssertionError";
    throw err;
  }
}

async function main() {
  const db = new sqlite3.Database(":memory:");

  const guildId = "g1";
  const channelId = "c1";
  const userA = "uA";
  const userB = "uB";

  await ensureRateLimitTables(db);

  // Enable spam limits: max 3 consecutive messages.
  await setRateLimitConfig(db, guildId, channelId, {
    enabled: true,
    default_limit: 3,
    warning_message: "Stop spamming",
    action: "delete",
  });

  // A: 1..3 allowed, 4th blocked
  for (let i = 1; i <= 3; i++) {
    const r = await checkRateLimit(db, guildId, channelId, userA, []);
    assert(r.allowed === true, `Expected allowed on A msg ${i}, got blocked (current=${r.current}, limit=${r.limit})`);
  }
  {
    const r = await checkRateLimit(db, guildId, channelId, userA, []);
    assert(r.allowed === false, `Expected blocked on A msg 4 (current=${r.current}, limit=${r.limit})`);
  }

  // B speaks -> A resets
  {
    const rB = await checkRateLimit(db, guildId, channelId, userB, []);
    assert(rB.allowed === true, "Expected B allowed");
  }
  {
    const rA = await checkRateLimit(db, guildId, channelId, userA, []);
    assert(rA.allowed === true && rA.current === 1, `Expected A reset to 1 after B speaks, got current=${rA.current}`);
  }

  // Prune should not throw
  pruneConsecutiveState(Date.now() + 99999999);

  console.log("OK: turn-taking spam limits sanity test passed");
}

main().catch((e) => {
  console.error("FAILED:", e && e.stack ? e.stack : e);
  process.exit(1);
});
