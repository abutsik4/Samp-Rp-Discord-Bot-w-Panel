"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet } = require("../utils/db-helpers");
const { ensureSampLifeTables, handleSampLifeCommand } = require("./samp-life");

function makeDb() {
  return new sqlite3.Database(":memory:");
}

// The above factory uses a closure variable; wrap it properly.
function makeInteractionSafe(args) {
  const base = { ...args };
  let replied = false;
  let lastReply = null;
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
    reply: async (payload) => {
      replied = true;
      lastReply = payload;
      interaction.replied = true;
      return null;
    },
    followUp: async (payload) => {
      lastFollowUp = payload;
      return null;
    },
    __getState: () => ({ replied, lastReply, lastFollowUp }),
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
    assert.ok(uAfter.money >= 600 && uAfter.money <= 1000);

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
