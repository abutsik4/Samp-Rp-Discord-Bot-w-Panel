"use strict";

const assert = require("assert/strict");
const { test } = require("node:test");
const sqlite3 = require("sqlite3").verbose();
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

// Modules under test
const {
  ensureBadgesTable,
  checkAndAwardBadges,
  getUserBadges,
  getUserBadgeCount,
  getHighestRankBadge,
  BADGE_DEFINITIONS,
} = require("./badges");

const {
  TRIVIA_QUESTIONS,
  ensureTriviaTable,
  updateTriviaScore,
  getTriviaStats,
  getTriviaLeaderboard,
  prepareTriviaQuestion,
  startTriviaSession,
  finishTriviaSession,
  resetTriviaSessionState,
} = require("./trivia");

const {
  ensureLevelsTable,
  awardMessageXP,
  getUserLevel,
  getLevelsLeaderboard,
  handleLevelCommand,
  RANK_TIERS,
} = require("./levels");

const {
  ensureWantedTable,
  addWantedStar,
  getWantedLevel,
  processStarDecay,
  getMostWanted,
  clearWantedStars,
  MAX_STARS,
} = require("./wanted-stars");

const {
  ensureRadioTable,
} = require("./radio-vote");

const {
  ensureWeeklyAwardsTable,
} = require("./weekly-awards");

// ─── Helpers ─────────────────────────────────────────────

function createDb() {
  return new sqlite3.Database(":memory:");
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });
}

const GUILD = "g1";
const USER1 = "u1";
const USER2 = "u2";

// ─── BADGES ─────────────────────────────────────────────

test("badges: table creation and empty badges", async () => {
  const db = createDb();
  await ensureBadgesTable(db);

  const badges = await getUserBadges(db, GUILD, USER1);
  assert.deepStrictEqual(badges, []);

  const count = await getUserBadgeCount(db, GUILD, USER1);
  assert.strictEqual(count, 0);

  await closeDb(db);
});

test("badges: award msg_100 badge at 100 messages", async () => {
  const db = createDb();
  await ensureBadgesTable(db);

  const awarded = await checkAndAwardBadges(db, GUILD, USER1, {
    messageCount: 100,
    currentStreak: 0,
    reactionsGiven: 0,
    reactionsReceived: 0,
  });

  assert.ok(awarded.length > 0, "Should award at least one badge for 100 messages");
  const badge = awarded.find((b) => b.id === "msg_100");
  assert.ok(badge, "Should award 'msg_100' badge at 100 messages");

  // Don't duplicate
  const again = await checkAndAwardBadges(db, GUILD, USER1, {
    messageCount: 100,
    currentStreak: 0,
    reactionsGiven: 0,
    reactionsReceived: 0,
  });
  assert.strictEqual(again.length, 0, "Should not re-award same badge");

  await closeDb(db);
});

test("badges: highest rank badge", async () => {
  const db = createDb();
  await ensureBadgesTable(db);

  // Award the 100 and 500 message badges manually
  await checkAndAwardBadges(db, GUILD, USER1, {
    messageCount: 500,
    currentStreak: 0,
    reactionsGiven: 0,
    reactionsReceived: 0,
  });

  const badges = await getUserBadges(db, GUILD, USER1);
  const highest = getHighestRankBadge(badges);
  assert.ok(highest, "Should have a highest badge");

  await closeDb(db);
});

// ─── TRIVIA ─────────────────────────────────────────────

test("trivia: table creation and empty stats", async () => {
  const db = createDb();
  await ensureTriviaTable(db);

  const stats = await getTriviaStats(db, GUILD, USER1);
  assert.ok(!stats || stats.correct === undefined || stats.correct === 0);

  await closeDb(db);
});

test("trivia: question bank integrity", () => {
  assert.ok(TRIVIA_QUESTIONS.length >= 180, "Trivia bank should be large enough to reduce repeats");

  const seenQuestions = new Set();
  for (const entry of TRIVIA_QUESTIONS) {
    assert.equal(typeof entry.q, "string");
    assert.ok(entry.q.trim().length > 0, "Question text must not be empty");
    assert.ok(Array.isArray(entry.answers), "Answers must be an array");
    assert.equal(entry.answers.length, 4, `Question must have exactly 4 answers: ${entry.q}`);
    assert.equal(typeof entry.correct, "number");
    assert.ok(entry.correct >= 0 && entry.correct < entry.answers.length, `Correct answer index out of range: ${entry.q}`);

    for (const answer of entry.answers) {
      assert.equal(typeof answer, "string");
      assert.ok(answer.trim().length > 0, `Answer must not be empty: ${entry.q}`);
    }

    assert.ok(!seenQuestions.has(entry.q), `Duplicate question found: ${entry.q}`);
    seenQuestions.add(entry.q);
  }
});

test("trivia: shuffled answers keep the correct option aligned", () => {
  const prepared = prepareTriviaQuestion(
    {
      q: "Test question",
      answers: ["A", "B", "C", "D"],
      correct: 2,
    },
    () => 0
  );

  assert.deepStrictEqual(prepared.answers, ["B", "C", "D", "A"]);
  assert.strictEqual(prepared.correct, 1);
  assert.strictEqual(prepared.answers[prepared.correct], "C");
});

test("trivia: start session enforces channel and user throttling", () => {
  resetTriviaSessionState();

  const first = startTriviaSession(
    { guildId: GUILD, channelId: "c1", userId: USER1 },
    { now: 1_000, timeoutMs: 30_000, cooldownMs: 45_000 }
  );
  const sameUser = startTriviaSession(
    { guildId: GUILD, channelId: "c2", userId: USER1 },
    { now: 2_000, timeoutMs: 30_000, cooldownMs: 45_000 }
  );
  const sameChannel = startTriviaSession(
    { guildId: GUILD, channelId: "c1", userId: USER2 },
    { now: 2_000, timeoutMs: 30_000, cooldownMs: 45_000 }
  );

  assert.equal(first.ok, true);
  assert.equal(sameUser.ok, false);
  assert.equal(sameUser.reason, "user-active");
  assert.equal(sameChannel.ok, false);
  assert.equal(sameChannel.reason, "channel-active");

  finishTriviaSession({ guildId: GUILD, channelId: "c1", userId: USER1 });

  const cooldownBlocked = startTriviaSession(
    { guildId: GUILD, channelId: "c1", userId: USER1 },
    { now: 20_000, timeoutMs: 30_000, cooldownMs: 45_000 }
  );
  const afterCooldown = startTriviaSession(
    { guildId: GUILD, channelId: "c1", userId: USER1 },
    { now: 50_000, timeoutMs: 30_000, cooldownMs: 45_000 }
  );

  assert.equal(cooldownBlocked.ok, false);
  assert.equal(cooldownBlocked.reason, "cooldown");
  assert.equal(afterCooldown.ok, true);

  resetTriviaSessionState();
});

test("trivia: score updates and streaks", async () => {
  const db = createDb();
  await ensureTriviaTable(db);

  // Correct answer
  await updateTriviaScore(db, GUILD, USER1, true, 10);
  let stats = await getTriviaStats(db, GUILD, USER1);
  assert.strictEqual(stats.correct, 1);
  assert.strictEqual(stats.total, 1);
  assert.strictEqual(stats.current_streak, 1);

  // Another correct
  await updateTriviaScore(db, GUILD, USER1, true, 15);
  stats = await getTriviaStats(db, GUILD, USER1);
  assert.strictEqual(stats.correct, 2);
  assert.strictEqual(stats.current_streak, 2);

  // Wrong answer resets streak
  await updateTriviaScore(db, GUILD, USER1, false, 0);
  stats = await getTriviaStats(db, GUILD, USER1);
  assert.strictEqual(stats.correct, 2);
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.current_streak, 0);
  assert.strictEqual(stats.best_streak, 2);

  await closeDb(db);
});

test("trivia: leaderboard", async () => {
  const db = createDb();
  await ensureTriviaTable(db);

  await updateTriviaScore(db, GUILD, USER1, true, 10);
  await updateTriviaScore(db, GUILD, USER2, true, 20);
  await updateTriviaScore(db, GUILD, USER2, true, 15);

  const lb = await getTriviaLeaderboard(db, GUILD, 10);
  assert.ok(lb.length === 2);
  assert.strictEqual(lb[0].user_id, USER2, "User2 should be first with more points");

  await closeDb(db);
});

// ─── LEVELS ─────────────────────────────────────────────

test("levels: table creation and empty level", async () => {
  const db = createDb();
  await ensureLevelsTable(db);

  const level = await getUserLevel(db, GUILD, USER1);
  assert.strictEqual(level.level, 1, "New user starts at level 1");
  assert.strictEqual(level.xp, 0);

  await closeDb(db);
});

test("levels: XP award and level up", async () => {
  const db = createDb();
  await ensureLevelsTable(db);

  // Award enough XP to reach level 2 (needs 100 XP: 50*1^2 + 50*1 = 100)
  // First, award 25 XP many times
  let leveledUp = null;
  for (let i = 0; i < 10; i++) {
    // Force last_xp_at to be old enough
    await dbRun(db, `UPDATE user_levels SET last_xp_at = 0 WHERE guild_id = ? AND user_id = ?`, [GUILD, USER1]);
    const result = await awardMessageXP(db, GUILD, USER1);
    if (result) leveledUp = result;
  }

  const level = await getUserLevel(db, GUILD, USER1);
  assert.ok(level.xp > 0, "Should have some XP");

  await closeDb(db);
});

test("levels: leaderboard", async () => {
  const db = createDb();
  await ensureLevelsTable(db);

  // Give user2 more XP
  await dbRun(
    db,
    `INSERT INTO user_levels (guild_id, user_id, xp, level) VALUES (?, ?, 500, 5)`,
    [GUILD, USER2]
  );
  await dbRun(
    db,
    `INSERT INTO user_levels (guild_id, user_id, xp, level) VALUES (?, ?, 100, 2)`,
    [GUILD, USER1]
  );

  const lb = await getLevelsLeaderboard(db, GUILD, 10);
  assert.strictEqual(lb.length, 2);
  assert.strictEqual(lb[0].user_id, USER2);

  await closeDb(db);
});

test("levels: /level handler supports dispatcher object call", async () => {
  const db = createDb();
  await ensureLevelsTable(db);

  await dbRun(
    db,
    `INSERT INTO user_levels (guild_id, user_id, xp, level) VALUES (?, ?, 250, 3)`,
    [GUILD, USER1]
  );

  const replies = [];
  const interaction = {
    commandName: "level",
    guild: { id: GUILD },
    user: { id: USER1, tag: "user1#0001" },
    options: {
      getUser: () => null,
    },
    reply: async (payload) => {
      replies.push(payload);
    },
  };

  await handleLevelCommand({ interaction, db });

  assert.strictEqual(replies.length, 1);
  assert.strictEqual(replies[0].embeds[0].data.title, "🚶 Бродяга");

  await closeDb(db);
});

test("levels: /levels-top handler supports legacy positional call", async () => {
  const db = createDb();
  await ensureLevelsTable(db);

  await dbRun(
    db,
    `INSERT INTO user_levels (guild_id, user_id, xp, level) VALUES (?, ?, 500, 5)`,
    [GUILD, USER2]
  );
  await dbRun(
    db,
    `INSERT INTO user_levels (guild_id, user_id, xp, level) VALUES (?, ?, 100, 2)`,
    [GUILD, USER1]
  );

  const edits = [];
  const interaction = {
    commandName: "levels-top",
    guild: {
      id: GUILD,
      members: {
        fetch: async (userId) => ({ user: { tag: `${userId}#0001` } }),
      },
    },
    deferReply: async () => {},
    editReply: async (payload) => {
      edits.push(payload);
    },
  };

  await handleLevelCommand(interaction, db);

  assert.strictEqual(edits.length, 1);
  assert.strictEqual(edits[0].embeds[0].data.title, "🏆 Топ по уровням");

  await closeDb(db);
});

// ─── WANTED STARS ────────────────────────────────────────

test("wanted: table creation and clean record", async () => {
  const db = createDb();
  await ensureWantedTable(db);

  const level = await getWantedLevel(db, GUILD, USER1);
  assert.strictEqual(level.stars, 0);
  assert.ok(level.display.includes("☆"));

  await closeDb(db);
});

test("wanted: add stars up to max", async () => {
  const db = createDb();
  await ensureWantedTable(db);

  for (let i = 1; i <= MAX_STARS + 2; i++) {
    const stars = await addWantedStar(db, GUILD, USER1);
    assert.ok(stars <= MAX_STARS, `Stars should not exceed ${MAX_STARS}`);
  }

  const level = await getWantedLevel(db, GUILD, USER1);
  assert.strictEqual(level.stars, MAX_STARS);
  assert.ok(level.totalInfractions >= MAX_STARS + 2);

  await closeDb(db);
});

test("wanted: clear stars", async () => {
  const db = createDb();
  await ensureWantedTable(db);

  await addWantedStar(db, GUILD, USER1);
  await addWantedStar(db, GUILD, USER1);
  await clearWantedStars(db, GUILD, USER1);

  const level = await getWantedLevel(db, GUILD, USER1);
  assert.strictEqual(level.stars, 0);

  await closeDb(db);
});

test("wanted: star decay", async () => {
  const db = createDb();
  await ensureWantedTable(db);

  // Add 3 stars
  await addWantedStar(db, GUILD, USER1);
  await addWantedStar(db, GUILD, USER1);
  await addWantedStar(db, GUILD, USER1);

  // Set last infraction to 5 hours ago (enough for 2 stars to decay with 2h period)
  const fiveHoursAgo = Math.floor(Date.now() / 1000) - (5 * 3600);
  await dbRun(
    db,
    `UPDATE wanted_stars SET last_infraction_at = ?, last_decay_at = ? WHERE guild_id = ? AND user_id = ?`,
    [fiveHoursAgo, fiveHoursAgo, GUILD, USER1]
  );

  const result = await processStarDecay(db, 2); // 2 hour decay
  assert.ok(result.decayed > 0, "Should have decayed at least one user");

  const level = await getWantedLevel(db, GUILD, USER1);
  assert.strictEqual(level.stars, 1, "Should have 1 star left (3 - 2 decayed)");

  await closeDb(db);
});

test("wanted: most wanted list", async () => {
  const db = createDb();
  await ensureWantedTable(db);

  await addWantedStar(db, GUILD, USER1);
  await addWantedStar(db, GUILD, USER2);
  await addWantedStar(db, GUILD, USER2);

  const list = await getMostWanted(db, GUILD);
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].user_id, USER2, "User2 should be first (more stars)");

  await closeDb(db);
});

// ─── RADIO / WEEKLY AWARDS table creation ────────────────

test("radio: table creation succeeds", async () => {
  const db = createDb();
  await ensureRadioTable(db);
  // If no error, table was created
  await closeDb(db);
});

test("weekly awards: table creation succeeds", async () => {
  const db = createDb();
  await ensureWeeklyAwardsTable(db);
  await closeDb(db);
});

// ─── RANK TIERS sanity ─────────────────────────────────

test("levels: rank tiers are ordered", () => {
  for (let i = 1; i < RANK_TIERS.length; i++) {
    assert.ok(
      RANK_TIERS[i].minLevel > RANK_TIERS[i - 1].minLevel,
      `Tier ${i} minLevel should be greater than tier ${i - 1}`
    );
  }
});

test("badges: all definitions have required fields", () => {
  for (const badge of BADGE_DEFINITIONS) {
    assert.ok(badge.id, "Badge must have an id");
    assert.ok(badge.name, "Badge must have a name");
    assert.ok(badge.emoji, "Badge must have an emoji");
    assert.ok(badge.type, "Badge must have a type");
    assert.ok(typeof badge.threshold === "number", "Badge must have a numeric threshold");
  }
});
