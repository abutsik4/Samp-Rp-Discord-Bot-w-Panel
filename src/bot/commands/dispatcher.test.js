"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { ensureSampLifeTables } = require("../../features/samp-life");
const { ensureStreakTable } = require("../../features/streaks");
const { registerCommandHandlers } = require("./dispatcher");

function makeDb() {
  return new sqlite3.Database(":memory:");
}

function createFakeClient() {
  return {
    interactionHandler: null,
    on(eventName, handler) {
      if (eventName === "interactionCreate") {
        this.interactionHandler = handler;
      }
    },
  };
}

function createInteraction(overrides = {}) {
  let lastReply = null;
  let lastRespond = null;

  const interaction = {
    type: 2,
    commandName: overrides.commandName || "work",
    channelId: overrides.channelId || "channel-1",
    guild: overrides.guild || { id: "guild-1" },
    user: overrides.user || { id: "user-1", username: "User1", tag: "User1#0001", bot: false },
    options: overrides.options || {
      getUser: () => null,
      getString: () => null,
    },
    member: overrides.member || null,
    isButton: () => false,
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    reply: async (payload) => {
      lastReply = payload;
      return null;
    },
    respond: async (payload) => {
      lastRespond = payload;
      return null;
    },
    __state: () => ({ lastReply, lastRespond }),
  };

  return Object.assign(interaction, overrides);
}

function registerHandler({ client, db, getCommandCategoryChannel, isCommandDisabled = async () => false }) {
  registerCommandHandlers({
    client,
    db,
    dbRun: async () => null,
    dbGet: async () => null,
    dbAll: async () => [],
    OWNER_ID: "owner-1",
    TOKEN: "token",
    isCommandDisabled,
    getCommandCategoryChannel,
    getUserMessageCount: async () => 0,
    ruPlural: (n, one, few, many) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) return one;
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
      return many;
    },
    formatTimeOnServer: () => "0 месяцев",
    performUndo: async () => null,
    registerGuildCommands: async () => null,
    backfillGuild: async () => null,
    holidaysScheduler: null,
  });

  return client.interactionHandler;
}

test("dispatcher blocks restricted Samp command outside configured channel with Russian warning", async () => {
  const client = createFakeClient();
  const handler = registerHandler({
    client,
    db: {},
    getCommandCategoryChannel: async () => ({ channel_id: "1492082119466287114" }),
  });

  const interaction = createInteraction({
    commandName: "work",
    channelId: "other-channel",
  });

  await handler(interaction);

  const { lastReply } = interaction.__state();
  assert.equal(lastReply.ephemeral, true);
  assert.match(lastReply.content, /Команды SAMP Life доступны только в канале/);
  assert.match(lastReply.content, /<#1492082119466287114>/);
});

test("dispatcher suppresses restricted Samp autocomplete outside configured channel", async () => {
  const client = createFakeClient();
  const handler = registerHandler({
    client,
    db: {},
    getCommandCategoryChannel: async () => ({ channel_id: "1492082119466287114" }),
  });

  const interaction = createInteraction({
    commandName: "buy",
    channelId: "other-channel",
    isAutocomplete: () => true,
    isChatInputCommand: () => false,
  });

  await handler(interaction);

  const { lastRespond } = interaction.__state();
  assert.deepEqual(lastRespond, []);
});

test("dispatcher allows restricted Samp command in configured channel", async () => {
  const client = createFakeClient();
  const db = makeDb();

  try {
    await ensureSampLifeTables(db);

    const handler = registerHandler({
      client,
      db,
      getCommandCategoryChannel: async () => ({ channel_id: "1492082119466287114" }),
    });

    const interaction = createInteraction({
      commandName: "reg",
      channelId: "1492082119466287114",
      user: { id: "user-allowed", username: "Allowed", tag: "Allowed#0001", bot: false },
    });

    await handler(interaction);

    const row = await require("../../utils/db-helpers").dbGet(
      db,
      "SELECT money, car_id FROM samp_users WHERE user_id = ?",
      ["user-allowed"]
    );

    assert.equal(row.money, 500);
    assert.equal(row.car_id, "bicycle");
  } finally {
    db.close();
  }
});

test("dispatcher keeps non-game streak command usable outside restricted channel", async () => {
  const client = createFakeClient();
  const db = makeDb();

  try {
    await ensureStreakTable(db);

    const handler = registerHandler({
      client,
      db,
      getCommandCategoryChannel: async () => ({ channel_id: "1492082119466287114" }),
    });

    const interaction = createInteraction({
      commandName: "streak",
      channelId: "other-channel",
      user: { id: "user-streak", username: "StreakUser", tag: "StreakUser#0001", bot: false },
      options: {
        getUser: () => null,
        getString: () => null,
      },
    });

    await handler(interaction);

    const { lastReply } = interaction.__state();
    assert.ok(lastReply?.embeds?.length === 1);
    assert.equal(lastReply.embeds[0].data.title, "🔥 Серия активности");
  } finally {
    db.close();
  }
});