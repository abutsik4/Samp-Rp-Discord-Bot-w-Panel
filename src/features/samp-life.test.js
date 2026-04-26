"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet, dbRun } = require("../utils/db-helpers");
const { ensureSampLifeTables, handleSampLifeCommand } = require("./samp-life");

function makeDb() {
  return new sqlite3.Database(":memory:");
}

// The above factory uses a closure variable; wrap it properly.
function makeInteractionSafe(args) {
  const base = { ...args };
  let replied = false;
  let deferred = false;
  let lastReply = null;
  let lastEditReply = null;
  let lastFollowUp = null;
  let raceFollowUpCount = 0;

  function extractCustomIds(payload) {
    return (payload?.components || [])
      .flatMap((row) => row?.components || [])
      .map((component) => component?.data?.custom_id || component?.custom_id)
      .filter(Boolean);
  }

  function buildMockComponentMessage({ userId, customId, onUpdate }) {
    return {
      awaitMessageComponent: async ({ filter } = {}) => {
        const componentInteraction = {
          user: { id: userId },
          customId,
          update: async (payload) => {
            if (typeof onUpdate === "function") {
              await onUpdate(payload);
            }
            return null;
          },
          reply: async () => null,
        };
        if (typeof filter === "function" && !filter(componentInteraction)) {
          throw new Error("component filtered");
        }
        return componentInteraction;
      },
      createMessageComponentCollector: () => ({
        on: () => {},
        stop: () => {},
      }),
      edit: async () => null,
    };
  }

  const interaction = {
    commandName: base.commandName,
    user: { id: base.userId || "u1", username: base.username || "User1", bot: false },
    options: {
      getString: (name, required) => {
        const o = base.options || {};
        if (!(name in o)) {
          if (required) throw new Error(`missing option ${name}`);
          return null;
        }
        return o[name];
      },
      getInteger: (name, required) => {
        const o = base.options || {};
        if (!(name in o)) {
          if (required) throw new Error(`missing option ${name}`);
          return null;
        }
        return o[name];
      },
      getUser: (name, required) => {
        const o = base.options || {};
        if (!(name in o)) {
          if (required) throw new Error(`missing option ${name}`);
          return null;
        }
        return o[name];
      },
    },
    deferred: false,
    replied: false,
    deferReply: async () => {
      if (typeof base.onDeferReply === "function") {
        await base.onDeferReply();
      }
      deferred = true;
      interaction.deferred = true;
      return null;
    },
    reply: async (payload) => {
      replied = true;
      lastReply = payload;
      interaction.replied = true;
      const customIds = extractCustomIds(payload);
      if (base.commandName === "race" && customIds.some((id) => id.includes(":accept"))) {
        interaction.__challengeMessage = buildMockComponentMessage({
          userId: base.options?.user?.id || "u2",
          customId: customIds.find((id) => id.includes(":accept")) || customIds[0],
          onUpdate: async () => {
            interaction.__raceAccepted = true;
            if (typeof base.onRaceAccepted === "function") {
              await base.onRaceAccepted();
            }
          },
        });
      }
      return null;
    },
    editReply: async (payload) => {
      lastEditReply = payload;
      return null;
    },
    followUp: async (payload) => {
      lastFollowUp = payload;
      const customIds = extractCustomIds(payload);
      if (base.commandName === "race" && customIds.some((id) => id.includes(":pick:"))) {
        if (!interaction.__racePromptHookRun && typeof base.onRacePrompt === "function") {
          interaction.__racePromptHookRun = true;
          await base.onRacePrompt();
        }
        const promptIndex = raceFollowUpCount;
        raceFollowUpCount += 1;
        const isChallengerPrompt = promptIndex % 2 === 0;
        const pickPlan = base.racePickPlan || {
          challenger: ["outside", "outside", "outside"],
          opponent: ["shortcut", "shortcut", "shortcut"],
        };
        const userId = isChallengerPrompt ? (base.userId || "u1") : (base.options?.user?.id || "u2");
        const sequence = isChallengerPrompt ? pickPlan.challenger : pickPlan.opponent;
        const desiredTactic = sequence[Math.floor(promptIndex / 2)] || sequence[sequence.length - 1] || "outside";
        const customId = customIds.find((id) => id.endsWith(`:${desiredTactic}`)) || customIds[0];
        return buildMockComponentMessage({ userId, customId });
      }
      return null;
    },
    fetchReply: async () => {
      if (interaction.__raceAccepted) {
        return buildMockComponentMessage({ userId: base.options?.user?.id || "u2", customId: "noop" });
      }
      return interaction.__challengeMessage || buildMockComponentMessage({ userId: base.options?.user?.id || "u2", customId: "noop" });
    },
    __getState: () => ({ replied, deferred, lastReply, lastEditReply, lastFollowUp }),
  };

  return interaction;
}

function toSqliteUtcDateTime(value = Date.now()) {
  return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

test("ensureSampLifeTables creates tables", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const row = await dbGet(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='samp_users'");
  assert.equal(row.name, "samp_users");

  db.close();
});

test("/reg creates a profile once", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const i1 = makeInteractionSafe({ commandName: "reg", userId: "u1", username: "Alice" });
  await handleSampLifeCommand({ interaction: i1, db });

  const u = await dbGet(db, "SELECT money, car_id FROM samp_users WHERE user_id = 'u1'");
  assert.equal(u.car_id, "bicycle");
  assert.equal(u.money, 500);

  const i2 = makeInteractionSafe({ commandName: "reg", userId: "u1", username: "Alice" });
  await handleSampLifeCommand({ interaction: i2, db });
  const st = i2.__getState();
  assert.ok(st.lastReply);
  // second reg should be ephemeral object payload
  assert.equal(typeof st.lastReply, "object");
  assert.equal(st.lastReply.ephemeral, true);

  db.close();
});

test("/balance returns a structured profile embed", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "u-balance", username: "Balance" }), db });
    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS samp_cosmetics (
        user_id TEXT NOT NULL,
        cosmetic_type TEXT NOT NULL,
        cosmetic_value TEXT NOT NULL,
        PRIMARY KEY (user_id, cosmetic_type)
      )`
    );
    await dbRun(db, `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, ["u-balance", "title", "OG"]);
    await dbRun(db, `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, ["u-balance", "color", "0xe74c3c"]);

    const balance = makeInteractionSafe({ commandName: "balance", userId: "u-balance", username: "Balance" });
    await handleSampLifeCommand({ interaction: balance, db });

    const state = balance.__getState();
    assert.ok(state.lastReply?.embeds?.length === 1, "balance should reply with a single embed");
    const embed = state.lastReply.embeds[0].toJSON();
    const fieldNames = embed.fields.map((field) => field.name);

    assert.equal(embed.title, "SAMP Life — Профиль");
    assert.equal(embed.author?.name, "OG • Balance");
    assert.equal(embed.color, 0xe74c3c);
    assert.ok(fieldNames.includes("💵 Финансы"));
    assert.ok(fieldNames.includes("🚘 Активная тачка"));
    assert.ok(fieldNames.includes("🔫 Оружие"));
    assert.ok(fieldNames.includes("⚖️ Статус"));
  } finally {
    db.close();
  }
});

test("/balance summarizes robberies since last SAMP activity and refreshes last seen", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "victim-balance", username: "Victim" }), db });

    const oldSeenAt = toSqliteUtcDateTime(Date.now() - 24 * 60 * 60_000);
    await dbRun(db, "UPDATE samp_users SET last_samp_seen_at = ? WHERE user_id = ?", [oldSeenAt, "victim-balance"]);
    await dbRun(
      db,
      `INSERT INTO samp_ledger(ts, type, from_user, to_user, amount, meta_json)
       VALUES(?, 'rob_pvp', ?, ?, ?, '{}')`,
      [toSqliteUtcDateTime(Date.now() - 3 * 60 * 60_000), "robber-1", "victim-balance", 12_500]
    );
    await dbRun(
      db,
      `INSERT INTO samp_ledger(ts, type, from_user, to_user, amount, meta_json)
       VALUES(?, 'rob_pvp', ?, ?, ?, '{}')`,
      [toSqliteUtcDateTime(Date.now() - 90 * 60_000), "robber-2", "victim-balance", 4_000]
    );

    const balance = makeInteractionSafe({ commandName: "balance", userId: "victim-balance", username: "Victim" });
    await handleSampLifeCommand({ interaction: balance, db });

    const state = balance.__getState();
    const embed = state.lastReply.embeds[0].toJSON();
    const awayField = embed.fields.find((field) => field.name === "🕵️ Пока тебя не было");
    const refreshed = await dbGet(db, "SELECT last_samp_seen_at FROM samp_users WHERE user_id = ?", ["victim-balance"]);

    assert.ok(awayField, "balance should include an away-summary field when robberies happened since last seen");
    assert.match(awayField.value, /2/);
    assert.match(awayField.value, /16(?:\s|\u00a0)500 \$/);
    assert.match(awayField.value, /<@robber-1>/);
    assert.match(awayField.value, /<@robber-2>/);
    assert.notEqual(refreshed.last_samp_seen_at, oldSeenAt, "balance should refresh last_samp_seen_at after showing the summary");
  } finally {
    db.close();
  }
});

test("/moneylog shows mixed PvP loss history for the player", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "victim-log", username: "VictimLog" }), db });

    await dbRun(
      db,
      `INSERT INTO samp_ledger(ts, type, from_user, to_user, amount, meta_json)
       VALUES(?, 'rob_pvp', ?, ?, ?, '{}')`,
      [toSqliteUtcDateTime(Date.now() - 2 * 60 * 60_000), "recent-robber", "victim-log", 8_500]
    );
    await dbRun(
      db,
      `INSERT INTO samp_ledger(ts, type, from_user, to_user, amount, meta_json)
       VALUES(?, 'race', ?, ?, ?, '{}')`,
      [toSqliteUtcDateTime(Date.now() - 110 * 60_000), "victim-log", "race-winner", 5_000]
    );
    await dbRun(
      db,
      `INSERT INTO samp_ledger(ts, type, from_user, to_user, amount, meta_json)
       VALUES(?, 'duel', ?, ?, ?, '{}')`,
      [toSqliteUtcDateTime(Date.now() - 95 * 60_000), "victim-log", "duel-winner", 4_000]
    );
    await dbRun(
      db,
      `INSERT INTO samp_ledger(ts, type, from_user, to_user, amount, meta_json)
       VALUES(?, 'transfer', ?, ?, ?, '{}')`,
      [toSqliteUtcDateTime(Date.now() - 70 * 60_000), "victim-log", "friend-user", 3_000]
    );
    await dbRun(
      db,
      `INSERT INTO samp_ledger(ts, type, from_user, to_user, amount, meta_json)
       VALUES(?, 'rob_pvp', ?, ?, ?, '{}')`,
      [toSqliteUtcDateTime(Date.now() - 30 * 60 * 60_000), "old-robber", "victim-log", 20_000]
    );

    const moneyLog = makeInteractionSafe({
      commandName: "moneylog",
      userId: "victim-log",
      username: "VictimLog",
      options: { hours: 24, limit: 10 },
    });
    await handleSampLifeCommand({ interaction: moneyLog, db });

    const state = moneyLog.__getState();
    const payload = state.lastReply;
    const description = payload.embeds[0].toJSON().description;
    const body = payload.embeds.map((embed) => embed.toJSON().description || "").join("\n");

    assert.equal(payload.ephemeral, true);
    assert.match(description, /20(?:\s|\u00a0)500 \$/);
    assert.match(body, /Ограбление/);
    assert.match(body, /Гонка/);
    assert.match(body, /Дуэль/);
    assert.match(body, /Перевод/);
    assert.match(body, /<@recent-robber>/);
    assert.match(body, /<@race-winner>/);
    assert.match(body, /<@duel-winner>/);
    assert.match(body, /<@friend-user>/);
    assert.doesNotMatch(body, /<@old-robber>/);
  } finally {
    db.close();
  }
});

test("/race pair cooldown blocks repeat targeting after base cooldown but does not block duel", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const realNow = Date.now;
  try {
    let t = 1_700_000_000_000;
    Date.now = () => t;

    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "racer-a", username: "RacerA" }), db });
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "racer-b", username: "RacerB" }), db });
    await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [500_000, "cheetah", "racer-a"]);
    await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [500_000, "bicycle", "racer-b"]);
    await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["racer-a", "cheetah"]);

    const firstRace = makeInteractionSafe({
      commandName: "race",
      userId: "racer-a",
      username: "RacerA",
      options: { user: { id: "racer-b", username: "RacerB", bot: false }, bet: 10_000 },
    });
    await handleSampLifeCommand({ interaction: firstRace, db });
    assert.ok(firstRace.__getState().lastEditReply?.embeds?.length === 1);

    t += 6 * 60_000;
    const repeatRace = makeInteractionSafe({
      commandName: "race",
      userId: "racer-a",
      username: "RacerA",
      options: { user: { id: "racer-b", username: "RacerB", bot: false }, bet: 10_000 },
    });
    await handleSampLifeCommand({ interaction: repeatRace, db });
    const repeatRaceState = repeatRace.__getState();
    assert.equal(repeatRaceState.lastReply?.ephemeral, true);
    assert.match(repeatRaceState.lastReply?.content || "", /недавно вызывал <@racer-b> на гонку/i);

    const duel = makeInteractionSafe({
      commandName: "duel",
      userId: "racer-a",
      username: "RacerA",
      options: { user: { id: "racer-b", username: "RacerB", bot: false }, bet: 1_000 },
    });
    await handleSampLifeCommand({ interaction: duel, db });
    assert.equal(duel.__getState().deferred, true);
  } finally {
    Date.now = realNow;
    db.close();
  }
});

test("/duel pair cooldown blocks repeat targeting after base cooldown window", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const realNow = Date.now;
  try {
    let t = 1_700_000_000_000;
    Date.now = () => t;

    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "dueler-a", username: "DuelerA" }), db });
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "dueler-b", username: "DuelerB" }), db });
    await dbRun(db, "UPDATE samp_users SET money = ? WHERE user_id IN (?, ?)", [300_000, "dueler-a", "dueler-b"]);

    const firstDuel = makeInteractionSafe({
      commandName: "duel",
      userId: "dueler-a",
      username: "DuelerA",
      options: { user: { id: "dueler-b", username: "DuelerB", bot: false }, bet: 2_000 },
    });
    await handleSampLifeCommand({ interaction: firstDuel, db });
    assert.equal(firstDuel.__getState().deferred, true);

    t += 6 * 60_000;
    const repeatDuel = makeInteractionSafe({
      commandName: "duel",
      userId: "dueler-a",
      username: "DuelerA",
      options: { user: { id: "dueler-b", username: "DuelerB", bot: false }, bet: 2_000 },
    });
    await handleSampLifeCommand({ interaction: repeatDuel, db });
    const repeatDuelState = repeatDuel.__getState();
    assert.equal(repeatDuelState.lastReply?.ephemeral, true);
    assert.match(repeatDuelState.lastReply?.content || "", /недавно вызывал <@dueler-b> на дуэль/i);
  } finally {
    Date.now = realNow;
    db.close();
  }
});

test("/race rejects bets above the configured PvP cap", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    const race = makeInteractionSafe({
      commandName: "race",
      userId: "cap-racer-a",
      username: "CapRacerA",
      options: { user: { id: "cap-racer-b", username: "CapRacerB", bot: false }, bet: 100_001 },
    });
    await handleSampLifeCommand({ interaction: race, db });

    const state = race.__getState();
    assert.equal(state.deferred, false);
    assert.equal(state.lastReply?.ephemeral, true);
    assert.match(state.lastReply?.content || "", /Максимальная ставка/i);
    assert.match(state.lastReply?.content || "", /100(?:\s|\u00a0)000 \$/);
  } finally {
    db.close();
  }
});

test("/duel rejects bets above the configured PvP cap", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    const duel = makeInteractionSafe({
      commandName: "duel",
      userId: "cap-dueler-a",
      username: "CapDuelerA",
      options: { user: { id: "cap-dueler-b", username: "CapDuelerB", bot: false }, bet: 100_001 },
    });
    await handleSampLifeCommand({ interaction: duel, db });

    const state = duel.__getState();
    assert.equal(state.deferred, false);
    assert.equal(state.lastReply?.ephemeral, true);
    assert.match(state.lastReply?.content || "", /Максимальная ставка/i);
    assert.match(state.lastReply?.content || "", /100(?:\s|\u00a0)000 \$/);
  } finally {
    db.close();
  }
});

test("/rob PvP caps loot at the configured maximum", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const realRandom = Math.random;
  try {
    Math.random = () => 0.99;

    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "rob-cap-attacker", username: "RobCapAttacker" }), db });
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "rob-cap-victim", username: "RobCapVictim" }), db });
    await dbRun(db, "UPDATE samp_users SET money = ? WHERE user_id = ?", [10_000_000, "rob-cap-victim"]);

    const robbery = makeInteractionSafe({
      commandName: "rob",
      userId: "rob-cap-attacker",
      username: "RobCapAttacker",
      options: { user: { id: "rob-cap-victim", username: "RobCapVictim", bot: false } },
    });
    await handleSampLifeCommand({ interaction: robbery, db });

    const attacker = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["rob-cap-attacker"]);
    const victim = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["rob-cap-victim"]);
    const ledger = await dbGet(db, "SELECT amount FROM samp_ledger WHERE type = 'rob_pvp' AND from_user = ? AND to_user = ? ORDER BY id DESC LIMIT 1", ["rob-cap-attacker", "rob-cap-victim"]);
    const state = robbery.__getState();

    assert.equal(ledger.amount, 50_000);
    assert.equal(attacker.money, 50_500);
    assert.equal(victim.money, 9_950_000);
    assert.match(String(state.lastEditReply || ""), /50(?:\s|\u00a0)000 \$/);
  } finally {
    Math.random = realRandom;
    db.close();
  }
});

test("/rob pair cooldown blocks repeat targeting after base cooldown window", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const realNow = Date.now;
  const realRandom = Math.random;
  try {
    let t = 1_700_000_000_000;
    Date.now = () => t;
    Math.random = () => 0.99;

    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "robber-a", username: "RobberA" }), db });
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "robber-b", username: "RobberB" }), db });
    await dbRun(db, "UPDATE samp_users SET money = ? WHERE user_id = ?", [1_000_000, "robber-b"]);

    const firstRob = makeInteractionSafe({
      commandName: "rob",
      userId: "robber-a",
      username: "RobberA",
      options: { user: { id: "robber-b", username: "RobberB", bot: false } },
    });
    await handleSampLifeCommand({ interaction: firstRob, db });
    assert.match(String(firstRob.__getState().lastEditReply || ""), /обчистил/i);

    t += 16 * 60_000;
    const repeatRob = makeInteractionSafe({
      commandName: "rob",
      userId: "robber-a",
      username: "RobberA",
      options: { user: { id: "robber-b", username: "RobberB", bot: false } },
    });
    await handleSampLifeCommand({ interaction: repeatRob, db });

    const state = repeatRob.__getState();
    assert.equal(state.deferred, true);
    assert.match(String(state.lastEditReply || ""), /недавно пытался ограбить/i);
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
    db.close();
  }
});

test("/race reduces settlement when loser balance changes before payout", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "settle-a", username: "SettleA" }), db });
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "settle-b", username: "SettleB" }), db });

    await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [500_000, "cheetah", "settle-a"]);
    await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [500_000, "bicycle", "settle-b"]);
    await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["settle-a", "cheetah"]);

    const race = makeInteractionSafe({
      commandName: "race",
      userId: "settle-a",
      username: "SettleA",
      options: {
        user: { id: "settle-b", username: "SettleB", bot: false },
        bet: 76_000,
      },
      onRacePrompt: async () => {
        await dbRun(db, "UPDATE samp_users SET money = ? WHERE user_id = ?", [9_000, "settle-b"]);
      },
    });
    await handleSampLifeCommand({ interaction: race, db });

    const winner = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["settle-a"]);
    const loser = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["settle-b"]);
    const ledger = await dbGet(db, "SELECT amount, meta_json FROM samp_ledger WHERE type = 'race' AND from_user = ? AND to_user = ? ORDER BY id DESC LIMIT 1", ["settle-b", "settle-a"]);
    const state = race.__getState();

    assert.equal(winner.money, 519_000);
    assert.equal(loser.money, 0);
    assert.equal(ledger.amount, 9_000);
    assert.match(String(ledger.meta_json || ""), /requested_amount/);
    assert.match(JSON.stringify(state.lastEditReply || {}), /выплата уменьшена/i);
    assert.match(JSON.stringify(state.lastEditReply || {}), /забирает/);
  } finally {
    db.close();
  }
});

test("/work pays and enforces cooldown", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const realNow = Date.now;
  try {
    let t = 1_700_000_000_000;
    Date.now = () => t;

    // Ensure user exists
    const reg = makeInteractionSafe({ commandName: "reg", userId: "u2", username: "Bob" });
    await handleSampLifeCommand({ interaction: reg, db });

    const w1 = makeInteractionSafe({ commandName: "work", userId: "u2", username: "Bob" });
    await handleSampLifeCommand({ interaction: w1, db });

    const uAfter = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = 'u2'");
    assert.ok(uAfter.money >= 2610 && uAfter.money <= 3050);

    // Same time => cooldown
    const w2 = makeInteractionSafe({ commandName: "work", userId: "u2", username: "Bob" });
    await handleSampLifeCommand({ interaction: w2, db });
    const st2 = w2.__getState();
    assert.ok(st2.lastReply);
    assert.equal(st2.lastReply.ephemeral, true);

    // Advance time beyond cooldown
    t += 61_000;
    const w3 = makeInteractionSafe({ commandName: "work", userId: "u2", username: "Bob" });
    await handleSampLifeCommand({ interaction: w3, db });

    const uAfter2 = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = 'u2'");
    assert.ok(uAfter2.money > uAfter.money);
  } finally {
    Date.now = realNow;
    db.close();
  }
});

test("concurrent /work commands keep one payout and one cooldown reply", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const realNow = Date.now;
  const realRandom = Math.random;
  try {
    Date.now = () => 1_700_000_000_000;
    Math.random = () => 0.5;

    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "u-concurrent", username: "Concurrent" }), db });

    const workA = makeInteractionSafe({ commandName: "work", userId: "u-concurrent", username: "Concurrent" });
    const workB = makeInteractionSafe({ commandName: "work", userId: "u-concurrent", username: "Concurrent" });

    await Promise.all([
      handleSampLifeCommand({ interaction: workA, db }),
      handleSampLifeCommand({ interaction: workB, db }),
    ]);

    const interactionStates = [workA, workB].map((interaction) => interaction.__getState());
    const cooldownReplyCount = interactionStates.filter((state) => {
      const payload = state.lastReply || state.lastEditReply;
      return typeof payload === "object" && payload?.ephemeral;
    }).length;
    const successReplyCount = interactionStates.filter(
      (state) => typeof state.lastEditReply === "string" && state.lastEditReply.includes("Баланс")
    ).length;
    const userAfter = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["u-concurrent"]);
    const workLedgerRows = await dbGet(
      db,
      "SELECT COUNT(*) AS count FROM samp_ledger WHERE type = ? AND to_user = ?",
      ["work", "u-concurrent"]
    );

    assert.equal(cooldownReplyCount, 1);
    assert.equal(successReplyCount, 1);
    assert.equal(workLedgerRows.count, 1);
    assert.equal(userAfter.money, 2830);
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
    db.close();
  }
});

test("/truck crash applies fine without throwing and still returns cooldown on immediate retry", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const realNow = Date.now;
  const realRandom = Math.random;
  try {
    let t = 1_700_000_000_000;
    Date.now = () => t;
    Math.random = () => 0;

    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "truck-user", username: "TruckUser" }), db });
    await dbRun(db, "UPDATE samp_users SET money = ? WHERE user_id = ?", [10_000, "truck-user"]);

    const truck = makeInteractionSafe({ commandName: "truck", userId: "truck-user", username: "TruckUser" });
    await handleSampLifeCommand({ interaction: truck, db });

    const state = truck.__getState();
    assert.ok(String(state.lastEditReply).includes("Ты улетел в кювет"));

    const userAfter = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["truck-user"]);
    assert.ok(userAfter.money < 10_000);

    const crashRow = await dbGet(db, "SELECT type, amount FROM samp_ledger WHERE from_user = ? ORDER BY id DESC LIMIT 1", ["truck-user"]);
    assert.equal(crashRow.type, "truck_crash");
    assert.ok(crashRow.amount > 0);

    const truckRun = await dbGet(
      db,
      "SELECT crashed, actual_amount, net_amount, route_name, cargo_name, incident_name FROM samp_truck_runs WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      ["truck-user"]
    );
    assert.equal(truckRun.crashed, 1);
    assert.ok(truckRun.actual_amount > 0);
    assert.ok(truckRun.net_amount < 0);
    assert.ok(truckRun.route_name);
    assert.ok(truckRun.cargo_name);
    assert.ok(truckRun.incident_name);

    const retry = makeInteractionSafe({ commandName: "truck", userId: "truck-user", username: "TruckUser" });
    await handleSampLifeCommand({ interaction: retry, db });
    const retryState = retry.__getState();
    assert.equal(retryState.lastReply.ephemeral, true);
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
    db.close();
  }
});

test("/truck does not consume cooldown when deferReply fails", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "truck-expire", username: "TruckExpire" }), db });

    const interaction = {
      commandName: "truck",
      user: { id: "truck-expire", username: "TruckExpire", bot: false },
      options: { getString: () => null, getInteger: () => null, getUser: () => null },
      deferred: false,
      replied: false,
      deferReply: async () => {
        const error = new Error("Unknown interaction");
        error.code = 10062;
        throw error;
      },
      reply: async () => null,
      editReply: async () => null,
      followUp: async () => null,
    };

    await handleSampLifeCommand({ interaction, db });

    const cooldown = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?", ["truck-expire", "truck"]);
    assert.equal(cooldown, null, "truck cooldown should not be consumed when the interaction already expired");
  } finally {
    db.close();
  }
});

test("/truck success stores contract metadata for higher-tier deliveries", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  const realRandom = Math.random;
  try {
    const sequence = [0.99, 0.99, 0, 0.99, 0.5, 0.5, 0.5];
    Math.random = () => (sequence.length ? sequence.shift() : 0.5);

    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "truck-rich", username: "TruckRich" }), db });
    await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["truck-rich", "infernus"]);
    await dbRun(db, "UPDATE samp_users SET car_id = ?, money = ? WHERE user_id = ?", ["infernus", 25_000, "truck-rich"]);

    const truck = makeInteractionSafe({ commandName: "truck", userId: "truck-rich", username: "TruckRich" });
    await handleSampLifeCommand({ interaction: truck, db });

    const state = truck.__getState();
    assert.ok(String(state.lastEditReply).includes("Контракт закрыт"));
    assert.ok(String(state.lastEditReply).includes("серый груз без бумаг"));

    const ledgerRow = await dbGet(
      db,
      "SELECT type, amount, meta_json FROM samp_ledger WHERE to_user = ? AND type = 'truck' ORDER BY id DESC LIMIT 1",
      ["truck-rich"]
    );
    assert.equal(ledgerRow.type, "truck");
    assert.ok(ledgerRow.amount > 10_000);

    const meta = JSON.parse(ledgerRow.meta_json);
    assert.equal(meta.routeId, "intercity");
    assert.equal(meta.cargoId, "contraband");
    assert.equal(meta.incidentId, "clear_road");
    assert.equal(meta.carId, "infernus");
    assert.equal(meta.carSpeed, 120);
    assert.ok(meta.crashChance > 0);

    const truckRun = await dbGet(
      db,
      "SELECT crashed, route_id, cargo_id, incident_id, actual_amount, boost_amount, net_amount FROM samp_truck_runs WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      ["truck-rich"]
    );
    assert.equal(truckRun.crashed, 0);
    assert.equal(truckRun.route_id, "intercity");
    assert.equal(truckRun.cargo_id, "contraband");
    assert.equal(truckRun.incident_id, "clear_road");
    assert.ok(truckRun.actual_amount > 10_000);
    assert.ok(truckRun.net_amount > 0);
  } finally {
    Math.random = realRandom;
    db.close();
  }
});

test("/rob does not consume cooldown when deferReply fails", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "rob-expire", username: "RobExpire" }), db });

    const interaction = {
      commandName: "rob",
      user: { id: "rob-expire", username: "RobExpire", bot: false },
      options: { getString: () => null, getInteger: () => null, getUser: () => null },
      deferred: false,
      replied: false,
      deferReply: async () => {
        const error = new Error("Unknown interaction");
        error.code = 10062;
        throw error;
      },
      reply: async () => null,
      editReply: async () => null,
      followUp: async () => null,
    };

    await handleSampLifeCommand({ interaction, db });

    const cooldown = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?", ["rob-expire", "rob"]);
    assert.equal(cooldown, null, "rob cooldown should not be consumed when the interaction already expired");
  } finally {
    db.close();
  }
});

test("/race uses installed car upgrades when resolving winner", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_car_upgrades (
      user_id TEXT NOT NULL,
      car_id TEXT NOT NULL,
      upgrade_id TEXT NOT NULL,
      PRIMARY KEY (user_id, car_id, upgrade_id)
    )`
  );

  await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "u1", username: "Alice" }), db });
  await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "u2", username: "Bob" }), db });

  await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [500_000, "cheetah", "u1"]);
  await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [500_000, "banshee", "u2"]);
  await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["u1", "cheetah"]);
  await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["u2", "banshee"]);
  await dbRun(db, "INSERT INTO samp_car_upgrades(user_id, car_id, upgrade_id) VALUES(?, ?, ?)", ["u1", "cheetah", "engine"]);
  await dbRun(db, "INSERT INTO samp_car_upgrades(user_id, car_id, upgrade_id) VALUES(?, ?, ?)", ["u1", "cheetah", "nos"]);
  await dbRun(db, "INSERT INTO samp_car_upgrades(user_id, car_id, upgrade_id) VALUES(?, ?, ?)", ["u1", "cheetah", "turbo"]);

  const race = makeInteractionSafe({
    commandName: "race",
    userId: "u1",
    username: "Alice",
    options: {
      user: { id: "u2", username: "Bob", bot: false },
      bet: 76_000,
    },
  });
  await handleSampLifeCommand({ interaction: race, db });

  const state = race.__getState();
  const finalRacePayload = JSON.stringify(state.lastEditReply || {});
  assert.ok(state.lastEditReply?.embeds?.length === 1);
  assert.match(finalRacePayload, /Повороты/);
  assert.match(finalRacePayload, /Итог/);
  assert.match(finalRacePayload, /<@u1>/);

  const winner = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["u1"]);
  const loser = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["u2"]);
  assert.equal(winner.money, 586_000);
  assert.equal(loser.money, 424_000);

  db.close();
});

test("/buycar reassigns the seller's active car when the sold car was active", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "seller", username: "Seller" }), db });
    await handleSampLifeCommand({ interaction: makeInteractionSafe({ commandName: "reg", userId: "buyer", username: "Buyer" }), db });

    await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [200_000, "manana", "seller"]);
    await dbRun(db, "UPDATE samp_users SET money = ? WHERE user_id = ?", [200_000, "buyer"]);
    await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["seller", "manana"]);
    await dbRun(
      db,
      `INSERT INTO samp_car_offers(seller_user_id, buyer_user_id, car_id, price, status)
       VALUES(?, ?, ?, ?, 'open')`,
      ["seller", "buyer", "manana", 25_000]
    );

    const buyCar = makeInteractionSafe({
      commandName: "buycar",
      userId: "buyer",
      username: "Buyer",
      options: { offer: 1 },
    });
    await handleSampLifeCommand({ interaction: buyCar, db });

    const seller = await dbGet(db, "SELECT car_id FROM samp_users WHERE user_id = ?", ["seller"]);
    const buyer = await dbGet(db, "SELECT car_id FROM samp_users WHERE user_id = ?", ["buyer"]);
    const sellerOwnsManana = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", ["seller", "manana"]);
    const buyerOwnsManana = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", ["buyer", "manana"]);

    assert.equal(seller.car_id, "bicycle");
    assert.equal(buyer.car_id, "manana");
    assert.equal(sellerOwnsManana, null);
    assert.ok(buyerOwnsManana);
  } finally {
    db.close();
  }
});
