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
      deferred = true;
      interaction.deferred = true;
      return null;
    },
    reply: async (payload) => {
      replied = true;
      lastReply = payload;
      interaction.replied = true;
      return null;
    },
    editReply: async (payload) => {
      lastEditReply = payload;
      return null;
    },
    followUp: async (payload) => {
      lastFollowUp = payload;
      return null;
    },
    __getState: () => ({ replied, deferred, lastReply, lastEditReply, lastFollowUp }),
  };

  return interaction;
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
    assert.ok(uAfter.money >= 610 && uAfter.money <= 1050);

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
    assert.equal(userAfter.money, 830);
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
  assert.equal(state.deferred, true);
  assert.match(state.lastEditReply, /билд/);
  assert.match(state.lastEditReply, /старт/);
  assert.match(state.lastEditReply, /износ/);
  assert.match(state.lastEditReply, /Победитель: <@u1>/);

  const winner = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["u1"]);
  const loser = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["u2"]);
  assert.equal(winner.money, 576_000);
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
