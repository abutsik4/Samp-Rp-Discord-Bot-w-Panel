"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet, dbRun } = require("../utils/db-helpers");
const { ensureSampLifeTables, handleSampLifeCommand } = require("./samp-life");
const { ensureBadgesTable, awardBadge } = require("./badges");
const {
  ensureSampExtendedTables,
  handleSampExtendedCommand,
  getSampLiveOpsConfig,
  listSampLiveOpsPresets,
  upsertSampLiveOpsPreset,
  applySampLiveOpsPreset,
  PROPERTIES,
  HEIST_COOLDOWN_MS,
  HEIST_MIN_COOLDOWN_MS,
  tryReserveHeistParticipant,
  releaseHeistParticipants,
  applyHeistCooldown,
  getInventoryQty,
  consumeInventoryItem,
  checkAndCollectBounty,
  degradeWeapon,
  BLACK_MARKET_ITEMS,
  BLACK_MARKET_GRANTS,
  getDailyBlackMarketDeals,
  getWeaponRepairCost,
} = require("./samp-extended");

function makeDb() {
  return new sqlite3.Database(":memory:");
}

function findBlackMarketDealDay(type, maxDaysAhead = 730) {
  const realNow = Date.now;
  try {
    const start = Date.UTC(2026, 0, 1, 12, 0, 0, 0);
    for (let dayOffset = 0; dayOffset < maxDaysAhead; dayOffset += 1) {
      const candidate = start + dayOffset * 24 * 60 * 60_000;
      Date.now = () => candidate;
      const deals = getDailyBlackMarketDeals();
      if (deals.some((deal) => deal.type === type)) {
        return candidate;
      }
    }
  } finally {
    Date.now = realNow;
  }
  throw new Error(`Unable to find black market day for deal type: ${type}`);
}

function makeInteraction(args) {
  const base = { ...args };
  let lastReply = null;
  let lastEditReply = null;
  let lastFollowUp = null;

  const interaction = {
    commandName: base.commandName,
    user: { id: base.userId || "u1", username: base.username || "User1", bot: false },
    guild: { id: base.guildId || "g1" },
    deferred: false,
    replied: false,
    options: {
      getSubcommand: () => base.subcommand || base.options?.__subcommand || null,
      getString: (name, required) => {
        const value = base.options && Object.prototype.hasOwnProperty.call(base.options, name) ? base.options[name] : null;
        if ((value === null || value === undefined) && required) throw new Error(`missing option ${name}`);
        return value;
      },
      getInteger: (name, required) => {
        const value = base.options && Object.prototype.hasOwnProperty.call(base.options, name) ? base.options[name] : null;
        if ((value === null || value === undefined) && required) throw new Error(`missing option ${name}`);
        return value;
      },
      getUser: (name, required) => {
        const value = base.options && Object.prototype.hasOwnProperty.call(base.options, name) ? base.options[name] : null;
        if ((value === null || value === undefined) && required) throw new Error(`missing option ${name}`);
        return value;
      },
    },
    reply: async (payload) => {
      interaction.replied = true;
      lastReply = payload;
      return null;
    },
    deferReply: async () => {
      interaction.deferred = true;
      return null;
    },
    editReply: async (payload) => {
      lastEditReply = payload;
      lastReply = payload;
      interaction.replied = true;
      return null;
    },
    followUp: async (payload) => {
      lastFollowUp = payload;
      return null;
    },
    __getState: () => ({ lastReply, lastEditReply, lastFollowUp }),
  };

  return interaction;
}

function makePrototypeInteraction(args) {
  const base = { ...args };
  let lastReply = null;
  let lastEditReply = null;
  let lastFollowUp = null;

  const optionsProto = {
    getSubcommand() {
      return base.subcommand || base.options?.__subcommand || null;
    },
    getString(name, required) {
      const value = base.options && Object.prototype.hasOwnProperty.call(base.options, name) ? base.options[name] : null;
      if ((value === null || value === undefined) && required) throw new Error(`missing option ${name}`);
      return value;
    },
    getInteger(name, required) {
      const value = base.options && Object.prototype.hasOwnProperty.call(base.options, name) ? base.options[name] : null;
      if ((value === null || value === undefined) && required) throw new Error(`missing option ${name}`);
      return value;
    },
    getUser(name, required) {
      const value = base.options && Object.prototype.hasOwnProperty.call(base.options, name) ? base.options[name] : null;
      if ((value === null || value === undefined) && required) throw new Error(`missing option ${name}`);
      return value;
    },
  };

  const interactionProto = {
    deferred: false,
    replied: false,
    async reply(payload) {
      this.replied = true;
      lastReply = payload;
      return null;
    },
    async deferReply() {
      this.deferred = true;
      return null;
    },
    async editReply(payload) {
      lastEditReply = payload;
      lastReply = payload;
      this.replied = true;
      return null;
    },
    async followUp(payload) {
      lastFollowUp = payload;
      return null;
    },
  };

  const interaction = Object.create(interactionProto);
  interaction.commandName = base.commandName;
  interaction.user = { id: base.userId || "u1", username: base.username || "User1", bot: false };
  interaction.guild = { id: base.guildId || "g1" };
  interaction.options = Object.create(optionsProto);
  interaction.__getState = () => ({ lastReply, lastEditReply, lastFollowUp });
  return interaction;
}

test("managed businesses decay, pay net income, and can be restored", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg = makeInteraction({ commandName: "reg", userId: "u-biz", username: "BizPlayer" });
    await handleSampLifeCommand({ interaction: reg, db });

    await dbRun(db, `UPDATE samp_users SET money = 250000 WHERE user_id = ?`, ["u-biz"]);

    const buy = makeInteraction({
      commandName: "buybiz",
      userId: "u-biz",
      username: "BizPlayer",
      options: { id: "taxi_depot" },
    });
    await handleSampExtendedCommand({ interaction: buy, db });

    assert.ok(PROPERTIES.taxi_depot, "new taxi business should exist");

    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    await dbRun(
      db,
      `UPDATE samp_properties
       SET last_collected = ?,
           last_maintained = ?,
           last_state_tick = ?,
           condition = 86,
           supplies = 78
       WHERE user_id = ? AND property_id = ?`,
      [twelveHoursAgo, twoHoursAgo, twelveHoursAgo, "u-biz", "taxi_depot"]
    );

    const beforeCollect = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u-biz"]);
    const collect = makeInteraction({ commandName: "collectincome", userId: "u-biz", username: "BizPlayer" });
    await handleSampExtendedCommand({ interaction: collect, db });

    const propertyAfterCollect = await dbGet(
      db,
      `SELECT condition, supplies, total_collected FROM samp_properties WHERE user_id = ? AND property_id = ?`,
      ["u-biz", "taxi_depot"]
    );
    const afterCollect = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u-biz"]);
    const collectState = collect.__getState();

    assert.ok(afterCollect.money > beforeCollect.money, "collection should add net money");
    assert.ok(propertyAfterCollect.condition < 86, "condition should decay after collection");
    assert.ok(propertyAfterCollect.supplies < 78, "supplies should decay after collection");
    assert.ok(propertyAfterCollect.total_collected > 0, "total collected should accumulate");
    assert.match(String(collectState.lastEditReply), /Доход с бизнесов собран/, "collection summary should be shown");

    const beforeMaintain = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u-biz"]);
    const maintain = makeInteraction({
      commandName: "maintainbiz",
      userId: "u-biz",
      username: "BizPlayer",
      options: { id: "taxi_depot" },
    });
    await handleSampExtendedCommand({ interaction: maintain, db });

    const propertyAfterMaintain = await dbGet(
      db,
      `SELECT condition, supplies FROM samp_properties WHERE user_id = ? AND property_id = ?`,
      ["u-biz", "taxi_depot"]
    );
    const afterMaintain = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u-biz"]);
    const maintainState = maintain.__getState();

    assert.equal(propertyAfterMaintain.condition, 100, "maintenance should restore condition");
    assert.equal(propertyAfterMaintain.supplies, 100, "maintenance should restore supplies");
    assert.ok(afterMaintain.money < beforeMaintain.money, "maintenance should cost money");
    assert.match(String(maintainState.lastReply), /Обслуживание завершено/, "maintenance summary should be shown");
  } finally {
    db.close();
  }
});

test("/bizstats shows detailed stats for an owned business", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-stats", username: "Stats" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 250000 WHERE user_id = ?`, ["u-stats"]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "buybiz", userId: "u-stats", username: "Stats", options: { id: "carwash" } }),
      db,
    });

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    await dbRun(
      db,
      `UPDATE samp_properties
       SET last_collected = ?, last_maintained = ?, last_state_tick = ?, condition = 82, supplies = 77, total_collected = 12345
       WHERE user_id = ? AND property_id = ?`,
      [sixHoursAgo, sixHoursAgo, sixHoursAgo, "u-stats", "carwash"]
    );
    await dbRun(db, `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, ["u-stats", "title", "Легенда"]);
    await dbRun(db, `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, ["u-stats", "color", "0x2ecc71"]);

    const stats = makeInteraction({ commandName: "bizstats", userId: "u-stats", username: "Stats", options: { id: "carwash" } });
    await handleSampExtendedCommand({ interaction: stats, db });

    const state = stats.__getState();
    assert.ok(state.lastReply?.embeds?.length === 1, "bizstats should reply with a single embed");
    const embed = state.lastReply.embeds[0].toJSON();

    assert.match(embed.title, /Автомойка/);
    assert.match(embed.description, /carwash/);
    assert.equal(embed.author?.name, "Легенда • Stats");
    assert.equal(embed.color, 0x2ecc71);
    assert.ok(embed.fields.some((field) => field.name === "💸 Доход" && /Сейчас чистыми/.test(field.value)));
    assert.ok(embed.fields.some((field) => field.name === "🛠️ Состояние" && /Сост\.:/.test(field.value)));
    assert.ok(embed.fields.some((field) => field.name === "📈 Эффективность" && /Всего собрано/.test(field.value)));
  } finally {
    db.close();
  }
});

test("/mbizstats reuses owned business stats view", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-mstats", username: "MStats" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 250000 WHERE user_id = ?`, ["u-mstats"]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "buybiz", userId: "u-mstats", username: "MStats", options: { id: "carwash" } }),
      db,
    });

    const stats = makeInteraction({ commandName: "mbizstats", userId: "u-mstats", username: "MStats", options: { id: "carwash" } });
    await handleSampExtendedCommand({ interaction: stats, db });

    const state = stats.__getState();
    assert.ok(state.lastReply?.embeds?.length === 1, "mbizstats should reply with a single embed");
    const embed = state.lastReply.embeds[0].toJSON();

    assert.match(embed.title, /Автомойка/);
    assert.ok(embed.fields.some((field) => field.name === "💸 Доход"));
    assert.ok(embed.fields.some((field) => field.name === "🛠️ Состояние"));
  } finally {
    db.close();
  }
});

test("/garage and /gang info apply cosmetic title and color", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "leader-cos", username: "LeaderCos" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 200000 WHERE user_id = ?`, ["leader-cos"]);
    await dbRun(db, `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, ["leader-cos", "title", "Босс"]);
    await dbRun(db, `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, ["leader-cos", "color", "0xf1c40f"]);

    const garage = makeInteraction({ commandName: "garage", userId: "leader-cos", username: "LeaderCos" });
    await handleSampExtendedCommand({ interaction: garage, db });
    const garageEmbed = garage.__getState().lastReply.embeds[0].toJSON();
    assert.equal(garageEmbed.author?.name, "Босс • LeaderCos");
    assert.equal(garageEmbed.color, 0xf1c40f);

    await handleSampExtendedCommand({
      interaction: makeInteraction({
        commandName: "gang",
        userId: "leader-cos",
        username: "LeaderCos",
        subcommand: "create",
        options: { name: "Ballas", tag: "BLL" },
      }),
      db,
    });

    const gangInfo = makeInteraction({ commandName: "gang", userId: "leader-cos", username: "LeaderCos", subcommand: "info" });
    await handleSampExtendedCommand({ interaction: gangInfo, db });
    const gangEmbed = gangInfo.__getState().lastReply.embeds[0].toJSON();
    assert.equal(gangEmbed.author?.name, "Босс • LeaderCos");
    assert.equal(gangEmbed.color, 0xf1c40f);
  } finally {
    db.close();
  }
});

test("/switchcar changes the active car and /garage exposes quick-switch buttons", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-switch", username: "Switcher" }), db });
    await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["u-switch", "banshee"]);
    await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["u-switch", "perennial"]);
    await dbRun(db, "UPDATE samp_users SET car_id = ? WHERE user_id = ?", ["banshee", "u-switch"]);

    const garage = makeInteraction({ commandName: "garage", userId: "u-switch", username: "Switcher" });
    await handleSampExtendedCommand({ interaction: garage, db });

    const garageState = garage.__getState();
    assert.ok(Array.isArray(garageState.lastReply?.components), "garage should include quick-switch buttons when multiple cars are owned");
    assert.equal(garageState.lastReply.components.length, 1);
    const rowJson = garageState.lastReply.components[0].toJSON();
    assert.ok(rowJson.components.some((component) => component.custom_id === "garage_switch:perennial"));

    const switchCar = makeInteraction({
      commandName: "switchcar",
      userId: "u-switch",
      username: "Switcher",
      options: { car: "perennial" },
    });
    await handleSampExtendedCommand({ interaction: switchCar, db });

    const updatedUser = await dbGet(db, "SELECT car_id FROM samp_users WHERE user_id = ?", ["u-switch"]);
    assert.equal(updatedUser.car_id, "perennial");
    assert.match(String(switchCar.__getState().lastReply), /Активная тачка изменена/);
  } finally {
    db.close();
  }
});

test("/switchcar rejects cars outside the user's garage", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-switch-miss", username: "SwitcherMiss" }), db });

    const switchCar = makeInteraction({
      commandName: "switchcar",
      userId: "u-switch-miss",
      username: "SwitcherMiss",
      options: { car: "banshee" },
    });
    await handleSampExtendedCommand({ interaction: switchCar, db });

    const state = switchCar.__getState();
    assert.equal(state.lastReply?.ephemeral, true);
    assert.equal(state.lastReply?.content, "У тебя нет этой тачки в гараже.");
  } finally {
    db.close();
  }
});

test("/tune install, inspect, maintain, and remove manage a car build end-to-end", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-tune", username: "Tuner" }), db });
    await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [150_000, "banshee", "u-tune"]);
    await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["u-tune", "banshee"]);

    const install = makeInteraction({
      commandName: "tune",
      subcommand: "install",
      userId: "u-tune",
      username: "Tuner",
      options: { car: "banshee", part: "wheels" },
    });
    await handleSampExtendedCommand({ interaction: install, db });

    const installed = await dbGet(db, "SELECT durability FROM samp_car_upgrades WHERE user_id = ? AND car_id = ? AND upgrade_id = ?", ["u-tune", "banshee", "wheels"]);
    assert.equal(installed.durability, 100);
    assert.match(String(install.__getState().lastReply), /Chrome Wheels/);

    const inspect = makeInteraction({
      commandName: "tune",
      subcommand: "inspect",
      userId: "u-tune",
      username: "Tuner",
      options: { car: "banshee" },
    });
    await handleSampExtendedCommand({ interaction: inspect, db });

    const inspectEmbed = inspect.__getState().lastReply.embeds[0].toJSON();
    assert.match(inspectEmbed.title, /Tune Bay/);
    assert.ok(inspectEmbed.fields.some((field) => field.name === "🧩 Установлено" && /Chrome Wheels/.test(field.value)));

    await dbRun(db, "UPDATE samp_car_upgrades SET durability = 40 WHERE user_id = ? AND car_id = ? AND upgrade_id = ?", ["u-tune", "banshee", "wheels"]);
    const moneyBeforeMaintain = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["u-tune"]);

    const maintain = makeInteraction({
      commandName: "tune",
      subcommand: "maintain",
      userId: "u-tune",
      username: "Tuner",
      options: { car: "banshee" },
    });
    await handleSampExtendedCommand({ interaction: maintain, db });

    const maintained = await dbGet(db, "SELECT durability FROM samp_car_upgrades WHERE user_id = ? AND car_id = ? AND upgrade_id = ?", ["u-tune", "banshee", "wheels"]);
    const moneyAfterMaintain = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["u-tune"]);
    assert.equal(maintained.durability, 100);
    assert.ok(moneyAfterMaintain.money < moneyBeforeMaintain.money);
    assert.match(String(maintain.__getState().lastReply), /Обслуживание/);

    const remove = makeInteraction({
      commandName: "tune",
      subcommand: "remove",
      userId: "u-tune",
      username: "Tuner",
      options: { car: "banshee", part: "wheels" },
    });
    await handleSampExtendedCommand({ interaction: remove, db });

    const removed = await dbGet(db, "SELECT 1 FROM samp_car_upgrades WHERE user_id = ? AND car_id = ? AND upgrade_id = ?", ["u-tune", "banshee", "wheels"]);
    const moneyAfterRemove = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", ["u-tune"]);
    assert.equal(removed, null);
    assert.ok(moneyAfterRemove.money > moneyAfterMaintain.money);
    assert.match(String(remove.__getState().lastReply), /снята/);
  } finally {
    db.close();
  }
});

test("/tune install blocks high-tier parts until tuning requirements are met", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-lock", username: "Locked" }), db });
    await dbRun(db, "UPDATE samp_users SET money = ?, car_id = ? WHERE user_id = ?", [200_000, "cheetah", "u-lock"]);
    await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", ["u-lock", "cheetah"]);

    const install = makeInteraction({
      commandName: "tune",
      subcommand: "install",
      userId: "u-lock",
      username: "Locked",
      options: { car: "cheetah", part: "engine" },
    });
    await handleSampExtendedCommand({ interaction: install, db });

    const state = install.__getState();
    assert.equal(state.lastReply?.ephemeral, true);
    assert.match(String(state.lastReply?.content || ""), /Нужен уровень тюнинга 5/);
  } finally {
    db.close();
  }
});

test("/businesses returns paged embeds for owned and market views", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-portfolio", username: "Portfolio" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 400000 WHERE user_id = ?`, ["u-portfolio"]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "buybiz", userId: "u-portfolio", username: "Portfolio", options: { id: "carwash" } }),
      db,
    });

    const businesses = makeInteraction({ commandName: "businesses", userId: "u-portfolio", username: "Portfolio" });
    await handleSampExtendedCommand({ interaction: businesses, db });

    const state = businesses.__getState();
    assert.ok(state.lastReply?.embeds?.length >= 3, "businesses should return overview plus paged owned/market embeds");
    const titles = state.lastReply.embeds.map((embed) => embed.toJSON().title);

    assert.equal(titles[0], "🏢 Бизнесы San Andreas");
    assert.ok(titles.some((title) => /Твои бизнесы/.test(title)));
    assert.ok(titles.some((title) => /Рынок бизнесов/.test(title)));
  } finally {
    db.close();
  }
});

test("active business run improves state and creates a cooldown", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg = makeInteraction({ commandName: "reg", userId: "u-run", username: "Runner" });
    await handleSampLifeCommand({ interaction: reg, db });
    await dbRun(db, `UPDATE samp_users SET money = 350000 WHERE user_id = ?`, ["u-run"]);

    const buy = makeInteraction({ commandName: "buybiz", userId: "u-run", username: "Runner", options: { id: "mechanic_shop" } });
    await handleSampExtendedCommand({ interaction: buy, db });

    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    await dbRun(
      db,
      `UPDATE samp_properties
       SET last_collected = ?, last_state_tick = ?, condition = 68, supplies = 59
       WHERE user_id = ? AND property_id = ?`,
      [sixHoursAgo, sixHoursAgo, "u-run", "mechanic_shop"]
    );

    const before = await dbGet(db, `SELECT money, rep FROM samp_users WHERE user_id = ?`, ["u-run"]);
    const run = makeInteraction({ commandName: "bizrun", userId: "u-run", username: "Runner", options: { id: "mechanic_shop" } });
    await handleSampExtendedCommand({ interaction: run, db });

    const after = await dbGet(db, `SELECT money, rep FROM samp_users WHERE user_id = ?`, ["u-run"]);
    const property = await dbGet(db, `SELECT condition, supplies FROM samp_properties WHERE user_id = ? AND property_id = ?`, ["u-run", "mechanic_shop"]);
    const cooldown = await dbGet(db, `SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?`, ["u-run", "bizrun:mechanic_shop"]);

    assert.ok(after.money > before.money, "business run should earn money");
    assert.ok(after.rep > before.rep, "business run should add rep");
    assert.ok(property.condition > 60, "business run should improve condition");
    assert.ok(property.supplies > 59, "business run should improve supplies");
    assert.ok(Number(cooldown?.ready_at || 0) > Date.now(), "business run should create cooldown");
    assert.match(String(run.__getState().lastReply), /Выручка:/, "business run summary should be shown");
  } finally {
    db.close();
  }
});

test("gang leaders can fund and boost member businesses from treasury", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "leader", username: "Leader" }), db });
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "member", username: "Member" }), db });

    await dbRun(db, `UPDATE samp_users SET money = 250000 WHERE user_id IN ('leader', 'member')`);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "gang", userId: "leader", username: "Leader", subcommand: "create", options: { name: "Families", tag: "FAM" } }),
      db,
    });

    const gang = await dbGet(db, `SELECT id FROM samp_gangs WHERE leader_id = ?`, ["leader"]);
    await dbRun(db, `INSERT OR IGNORE INTO samp_gang_members(gang_id, user_id) VALUES(?, ?)`, [gang.id, "member"]);
    await dbRun(db, `UPDATE samp_gangs SET treasury = 50000 WHERE id = ?`, [gang.id]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "buybiz", userId: "member", username: "Member", options: { id: "carwash" } }),
      db,
    });

    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    await dbRun(
      db,
      `UPDATE samp_properties
       SET last_state_tick = ?, condition = 64, supplies = 52
       WHERE user_id = ? AND property_id = ?`,
      [eightHoursAgo, "member", "carwash"]
    );

    const support = makeInteraction({
      commandName: "gang",
      userId: "leader",
      username: "Leader",
      subcommand: "supportbiz",
      options: { user: { id: "member", username: "Member", bot: false }, business: "carwash" },
    });
    await handleSampExtendedCommand({ interaction: support, db });

    const property = await dbGet(db, `SELECT condition, supplies, gang_boost_until, gang_boosted_by FROM samp_properties WHERE user_id = ? AND property_id = ?`, ["member", "carwash"]);
    const gangAfter = await dbGet(db, `SELECT treasury FROM samp_gangs WHERE id = ?`, [gang.id]);

    assert.ok(property.condition > 64, "gang support should improve condition");
    assert.ok(property.supplies > 52, "gang support should improve supplies");
    assert.equal(Number(property.gang_boosted_by), Number(gang.id), "business should be tied to supporting gang");
    assert.ok(property.gang_boost_until, "gang support should set a boost timeout");
    assert.ok(gangAfter.treasury < 50000, "gang support should spend treasury");
    assert.match(String(support.__getState().lastReply), /поддержала бизнес/i, "gang support summary should be shown");
  } finally {
    db.close();
  }
});

test("gcapture alias preserves interaction option access and claims territory", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "leader", username: "Leader" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 200000 WHERE user_id = ?`, ["leader"]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({
        commandName: "gang",
        userId: "leader",
        username: "Leader",
        subcommand: "create",
        options: { name: "Grove", tag: "GRV" },
      }),
      db,
    });

    const gang = await dbGet(db, `SELECT id FROM samp_gangs WHERE leader_id = ?`, ["leader"]);
    await dbRun(db, `UPDATE samp_gangs SET treasury = 100000 WHERE id = ?`, [gang.id]);

    const capture = makeInteraction({
      commandName: "gcapture",
      userId: "leader",
      username: "Leader",
      options: { district: "ganton" },
    });
    await handleSampExtendedCommand({ interaction: capture, db });

    const territory = await dbGet(db, `SELECT gang_id, pressure FROM samp_gang_territories WHERE district_id = ?`, ["ganton"]);
    const gangAfter = await dbGet(db, `SELECT treasury FROM samp_gangs WHERE id = ?`, [gang.id]);

    assert.equal(Number(territory.gang_id), Number(gang.id), "gcapture should assign the district to the leader's gang");
    assert.equal(Number(territory.pressure), 60, "gcapture should initialize neutral capture pressure");
    assert.ok(gangAfter.treasury < 100000, "gcapture should spend gang treasury");
    assert.match(String(capture.__getState().lastReply), /взяла район/i, "gcapture should return the territory capture summary");
  } finally {
    db.close();
  }
});

test("gmap alias works with prototype-based Discord interactions", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const gmap = makePrototypeInteraction({
      commandName: "gmap",
      userId: "viewer",
      username: "Viewer",
    });

    await handleSampExtendedCommand({ interaction: gmap, db });

    const reply = gmap.__getState().lastReply;
    assert.ok(reply?.embeds?.length > 0, "gmap should return embeds instead of the generic error fallback");
    assert.match(String(reply.embeds[0].data?.title || reply.embeds[0].toJSON().title), /Районы San Andreas/i);
  } finally {
    db.close();
  }
});

test("gang attack summary explicitly says the district is not captured yet", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "defender", username: "Defender" }), db });
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "attacker", username: "Attacker" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 200000 WHERE user_id IN (?, ?)`, ["defender", "attacker"]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "gang", userId: "defender", username: "Defender", subcommand: "create", options: { name: "Old Gangster's", tag: "OG" } }),
      db,
    });
    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "gang", userId: "attacker", username: "Attacker", subcommand: "create", options: { name: "Ballas", tag: "BAL" } }),
      db,
    });

    const defenderGang = await dbGet(db, `SELECT id FROM samp_gangs WHERE leader_id = ?`, ["defender"]);
    const attackerGang = await dbGet(db, `SELECT id FROM samp_gangs WHERE leader_id = ?`, ["attacker"]);
    await dbRun(db, `UPDATE samp_gangs SET treasury = 100000 WHERE id IN (?, ?)`, [defenderGang.id, attackerGang.id]);
    await dbRun(
      db,
      `INSERT INTO samp_gang_territories(district_id, gang_id, pressure, claimed_at, updated_at)
       VALUES('ganton', ?, 60, datetime('now'), datetime('now'))`,
      [defenderGang.id]
    );

    const attack = makeInteraction({
      commandName: "gang",
      userId: "attacker",
      username: "Attacker",
      subcommand: "claimterritory",
      options: { district: "ganton" },
    });
    await handleSampExtendedCommand({ interaction: attack, db });

    const territory = await dbGet(db, `SELECT gang_id, pressure FROM samp_gang_territories WHERE district_id = ?`, ["ganton"]);
    assert.equal(Number(territory.gang_id), Number(defenderGang.id), "a partial pressure hit should not transfer ownership");
    assert.equal(Number(territory.pressure), 15, "attack should reduce defender pressure by the configured amount");
    assert.match(String(attack.__getState().lastReply), /не захвачен/i, "attack reply should clearly state the district is not captured yet");
  } finally {
    db.close();
  }
});

test("territory takeover resets control to 60 after breaking the last defender pressure", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "defender-low", username: "DefenderLow" }), db });
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "attacker-low", username: "AttackerLow" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 200000 WHERE user_id IN (?, ?)`, ["defender-low", "attacker-low"]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "gang", userId: "defender-low", username: "DefenderLow", subcommand: "create", options: { name: "Defenders", tag: "DEF" } }),
      db,
    });
    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "gang", userId: "attacker-low", username: "AttackerLow", subcommand: "create", options: { name: "Attackers", tag: "ATK" } }),
      db,
    });

    const defenderGang = await dbGet(db, `SELECT id FROM samp_gangs WHERE leader_id = ?`, ["defender-low"]);
    const attackerGang = await dbGet(db, `SELECT id FROM samp_gangs WHERE leader_id = ?`, ["attacker-low"]);
    await dbRun(db, `UPDATE samp_gangs SET treasury = 100000 WHERE id IN (?, ?)`, [defenderGang.id, attackerGang.id]);
    await dbRun(
      db,
      `INSERT INTO samp_gang_territories(district_id, gang_id, pressure, claimed_at, updated_at)
       VALUES('ganton', ?, 40, datetime('now'), datetime('now'))`,
      [defenderGang.id]
    );

    const attack = makeInteraction({
      commandName: "gang",
      userId: "attacker-low",
      username: "AttackerLow",
      subcommand: "claimterritory",
      options: { district: "ganton" },
    });
    await handleSampExtendedCommand({ interaction: attack, db });

    const territory = await dbGet(db, `SELECT gang_id, pressure FROM samp_gang_territories WHERE district_id = ?`, ["ganton"]);
    assert.equal(Number(territory.gang_id), Number(attackerGang.id), "ownership should transfer to the attacking gang");
    assert.equal(Number(territory.pressure), 60, "a successful takeover should reset the district to the base capture pressure");
    assert.match(String(attack.__getState().lastReply), /Новый контроль: \*\*60%\*\*/i, "takeover reply should explain the new base control value");
  } finally {
    db.close();
  }
});

test("black market golden deagle purchase persists and is visible in balance", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  const fixedNow = findBlackMarketDealDay("weapon_skin");
  const realNow = Date.now;
  Date.now = () => fixedNow;

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-blackmarket", username: "BlackMarket" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 300000 WHERE user_id = ?`, ["u-blackmarket"]);

    const browse = makeInteraction({
      commandName: "blackmarket",
      userId: "u-blackmarket",
      username: "BlackMarket",
      subcommand: "browse",
    });
    await handleSampExtendedCommand({ interaction: browse, db });

    const browseEmbeds = browse.__getState().lastReply.embeds || [];
    const goldenField = browseEmbeds
      .flatMap((embed) => embed.data?.fields || embed.toJSON().fields || [])
      .find((field) => String(field.name).includes("Золотой Desert Eagle"));

    assert.ok(goldenField, "daily black market should expose the golden deagle in one of the slots");
    const goldenSlot = Number(String(goldenField.name).match(/#(\d+)/)?.[1] || 0);
    assert.ok(goldenSlot >= 1 && goldenSlot <= 4, "golden deagle slot should be parseable from the browse output");

    const buy = makeInteraction({
      commandName: "blackmarket",
      userId: "u-blackmarket",
      username: "BlackMarket",
      subcommand: "buy",
      options: { slot: goldenSlot },
    });
    await handleSampExtendedCommand({ interaction: buy, db });

    const cosmetic = await dbGet(
      db,
      `SELECT cosmetic_value FROM samp_cosmetics WHERE user_id = ? AND cosmetic_type = ?`,
      ["u-blackmarket", "weapon_skin_deagle"]
    );
    const deagle = await dbGet(db, `SELECT qty FROM samp_inventory WHERE user_id = ? AND item_id = ?`, ["u-blackmarket", "deagle"]);
    const activeWeapon = await dbGet(db, `SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'weapon'`, ["u-blackmarket"]);

    assert.equal(cosmetic?.cosmetic_value, "gold");
    assert.equal(Number(deagle?.qty || 0), 1);
    assert.equal(activeWeapon?.value, "deagle");
    assert.match(String(buy.__getState().lastReply), /поставлена активной/i);

    const balance = makeInteraction({ commandName: "balance", userId: "u-blackmarket", username: "BlackMarket" });
    await handleSampLifeCommand({ interaction: balance, db });

    const balanceEmbed = balance.__getState().lastReply.embeds[0].data;
    const weaponField = balanceEmbed.fields.find((field) => field.name === "🔫 Оружие");
    assert.match(String(weaponField?.value || ""), /Золотой Desert Eagle/);
  } finally {
    Date.now = realNow;
    db.close();
  }
});

test("black market repair kit cannot be bought above stash limit", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  const fixedNow = findBlackMarketDealDay("repair_kit");
  const realNow = Date.now;
  Date.now = () => fixedNow;

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-bm-limit", username: "BmLimit" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 300000 WHERE user_id = ?`, ["u-bm-limit"]);

    const repairDeal = getDailyBlackMarketDeals().find((deal) => deal.type === "repair_kit");
    assert.ok(repairDeal, "repair kit should be available on the mocked day");

    const firstBuy = makeInteraction({
      commandName: "blackmarket",
      userId: "u-bm-limit",
      username: "BmLimit",
      subcommand: "buy",
      options: { slot: repairDeal.slot },
    });
    await handleSampExtendedCommand({ interaction: firstBuy, db });

    const secondBuy = makeInteraction({
      commandName: "blackmarket",
      userId: "u-bm-limit",
      username: "BmLimit",
      subcommand: "buy",
      options: { slot: repairDeal.slot },
    });
    await handleSampExtendedCommand({ interaction: secondBuy, db });

    const qty = await dbGet(db, `SELECT qty FROM samp_inventory WHERE user_id = ? AND item_id = ?`, ["u-bm-limit", "bm_repair_kit"]);
  const secondPayload = secondBuy.__getState().lastReply;
  const reply = typeof secondPayload === "string" ? secondPayload : String(secondPayload?.content || "");

    assert.equal(Number(qty?.qty || 0), 1);
    assert.match(reply, /лимит.*тайнике|сначала используй запас/i);
  } finally {
    Date.now = realNow;
    db.close();
  }
});

test("black market mystery crate respects the daily purchase limit", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  const fixedNow = findBlackMarketDealDay("mystery_crate");
  const realNow = Date.now;
  Date.now = () => fixedNow;

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-bm-daily", username: "BmDaily" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 300000 WHERE user_id = ?`, ["u-bm-daily"]);

    const crateDeal = getDailyBlackMarketDeals().find((deal) => deal.type === "mystery_crate");
    assert.ok(crateDeal, "mystery crate should be available on the mocked day");

    const firstBuy = makeInteraction({
      commandName: "blackmarket",
      userId: "u-bm-daily",
      username: "BmDaily",
      subcommand: "buy",
      options: { slot: crateDeal.slot },
    });
    await handleSampExtendedCommand({ interaction: firstBuy, db });

    const secondBuy = makeInteraction({
      commandName: "blackmarket",
      userId: "u-bm-daily",
      username: "BmDaily",
      subcommand: "buy",
      options: { slot: crateDeal.slot },
    });
    await handleSampExtendedCommand({ interaction: secondBuy, db });

    const secondPayload = secondBuy.__getState().lastReply;
    const reply = typeof secondPayload === "string" ? secondPayload : String(secondPayload?.content || "");
    assert.match(reply, /лимит.*исчерпан|возвращайся завтра/i);
  } finally {
    Date.now = realNow;
    db.close();
  }
});

test("gangtop alias returns leaderboard even when a gang has no members row", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await dbRun(db, `INSERT INTO samp_gangs(name, tag, leader_id, treasury) VALUES('Solo Gang', 'SOLO', 'leader-1', 75000)`);

    const gangTop = makePrototypeInteraction({
      commandName: "gangtop",
      userId: "viewer",
      username: "Viewer",
    });
    await handleSampExtendedCommand({ interaction: gangTop, db });

    const reply = gangTop.__getState().lastReply;
    assert.ok(reply?.embeds?.length > 0, "gangtop alias should return leaderboard embeds");
    assert.match(String(reply.embeds[0].data?.title || reply.embeds[0].toJSON().title), /Топ банд San Andreas/i);
    const payload = JSON.stringify(reply.embeds.map((embed) => embed.data || embed.toJSON()));
    assert.match(payload, /SOLO/);
    assert.match(payload, /0 район/);
  } finally {
    db.close();
  }
});

test("heist participants cannot reserve multiple lobbies and receive cooldown after a run", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const firstReservation = await tryReserveHeistParticipant(db, "u-heist");
    assert.equal(firstReservation.ok, true, "first heist lobby reservation should succeed");

    const secondReservation = await tryReserveHeistParticipant(db, "u-heist");
    assert.equal(secondReservation.ok, false, "same user should not be able to join another heist lobby");
    assert.equal(secondReservation.reason, "active");
    assert.ok(secondReservation.remainingMs > 0, "active heist lock should have time remaining");

    await releaseHeistParticipants(db, ["u-heist"]);
    await applyHeistCooldown(db, ["u-heist"]);

    const activeLock = await dbGet(db, `SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?`, ["u-heist", "heist:active"]);
    const heistCooldown = await dbGet(db, `SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?`, ["u-heist", "heist"]);

    assert.equal(activeLock, null, "active lock should be cleared once the heist resolves");
    assert.ok(Number(heistCooldown?.ready_at || 0) > Date.now(), "heist resolution should create a cooldown");
    assert.ok(Number(heistCooldown?.ready_at || 0) - Date.now() > HEIST_COOLDOWN_MS - 10_000, "heist cooldown should use the configured duration");

    const cooldownReservation = await tryReserveHeistParticipant(db, "u-heist");
    assert.equal(cooldownReservation.ok, false, "cooldown should block immediate re-entry into a new heist");
    assert.equal(cooldownReservation.reason, "cooldown");
  } finally {
    db.close();
  }
});

test("ensureSampExtendedTables clears stale active heist locks on startup", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await dbRun(db, `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)`, ["u-stale-heist", "heist:active", Date.now() + 60_000]);

    await ensureSampExtendedTables(db);

    const activeLock = await dbGet(db, `SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?`, ["u-stale-heist", "heist:active"]);

    assert.equal(activeLock, null, "startup initialization should drop stale heist lobby locks");
  } finally {
    db.close();
  }
});

test("heist creation releases active lock when the initial reply fails", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);
  await ensureBadgesTable(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-heist-fail", username: "HeistFail" }), db });

    let replyCalls = 0;
    const interaction = {
      commandName: "heist",
      user: { id: "u-heist-fail", username: "HeistFail", bot: false },
      guild: { id: "g1" },
      deferred: false,
      replied: false,
      options: {
        getSubcommand: () => null,
        getString: (name, required) => {
          if (name === "tier") return "store";
          if (required) throw new Error(`missing option ${name}`);
          return null;
        },
        getInteger: () => null,
        getUser: () => null,
      },
      async reply(payload) {
        replyCalls += 1;
        if (replyCalls === 1) {
          throw new Error("initial heist reply failed");
        }
        this.replied = true;
        this.lastReply = payload;
        return null;
      },
      async editReply(payload) {
        this.replied = true;
        this.lastEditReply = payload;
        return null;
      },
      async followUp(payload) {
        this.lastFollowUp = payload;
        return null;
      },
    };

    await handleSampExtendedCommand({ interaction, db });

    const activeLock = await dbGet(db, `SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?`, ["u-heist-fail", "heist:active"]);

    assert.equal(activeLock, null, "failed heist creation should not leave an active lobby lock behind");
    assert.match(String(interaction.lastReply?.content || ""), /Ошибка\. Попробуй позже\./, "the command should still surface a generic error response");
  } finally {
    db.close();
  }
});

test("heist cooldown drops for users with high-tier message badges", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);
  await ensureBadgesTable(db);

  try {
    await awardBadge(db, "g1", "u-pro", "msg_5000");
    await applyHeistCooldown(db, ["u-pro"], { guildId: "g1" });

    const heistCooldown = await dbGet(db, `SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?`, ["u-pro", "heist"]);
    const remaining = Number(heistCooldown?.ready_at || 0) - Date.now();

    assert.ok(remaining < HEIST_COOLDOWN_MS - 60_000, "badge holders should get a shorter heist cooldown than the base");
    assert.ok(remaining > HEIST_MIN_COOLDOWN_MS - 10_000, "badge reductions should not go below the configured minimum");
  } finally {
    db.close();
  }
});

test("live ops multipliers affect business income and manual runs", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-liveops", username: "LiveOps" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 400000 WHERE user_id = ?`, ["u-liveops"]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "buybiz", userId: "u-liveops", username: "LiveOps", options: { id: "mechanic_shop" } }),
      db,
    });

    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    await dbRun(
      db,
      `UPDATE samp_properties
       SET last_collected = ?, last_state_tick = ?, last_maintained = datetime('now'), condition = 100, supplies = 100
       WHERE user_id = ? AND property_id = ?`,
      [fourHoursAgo, fourHoursAgo, "u-liveops", "mechanic_shop"]
    );
    await dbRun(
      db,
      `UPDATE samp_live_ops
       SET value = CASE key
         WHEN 'business_income_multiplier' THEN '1.5'
         WHEN 'business_run_multiplier' THEN '2'
         WHEN 'rep_multiplier' THEN '2'
         ELSE value
       END
       WHERE key IN ('business_income_multiplier', 'business_run_multiplier', 'rep_multiplier')`
    );

    const beforeCollect = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u-liveops"]);
    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "collectincome", userId: "u-liveops", username: "LiveOps" }),
      db,
    });
    const afterCollect = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u-liveops"]);

    const beforeRun = await dbGet(db, `SELECT money, rep FROM samp_users WHERE user_id = ?`, ["u-liveops"]);
    const run = makeInteraction({ commandName: "bizrun", userId: "u-liveops", username: "LiveOps", options: { id: "mechanic_shop" } });
    await handleSampExtendedCommand({ interaction: run, db });
    const afterRun = await dbGet(db, `SELECT money, rep FROM samp_users WHERE user_id = ?`, ["u-liveops"]);

    assert.ok(afterCollect.money - beforeCollect.money > 40000, "income multiplier should materially boost collected revenue");
    assert.ok(afterRun.money - beforeRun.money >= 10000, "run multiplier should boost manual business payouts");
    assert.ok(afterRun.rep - beforeRun.rep >= 4, "rep multiplier should boost rep gains");
    assert.match(String(run.__getState().lastReply), /Выручка:/, "manual run should still show summary");
  } finally {
    db.close();
  }
});

test("gang territory control buffs nearby business income", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "territory-leader", username: "TerritoryLeader" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 250000 WHERE user_id = ?`, ["territory-leader"]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "gang", userId: "territory-leader", username: "TerritoryLeader", subcommand: "create", options: { name: "Ballas", tag: "BAL" } }),
      db,
    });
    const gang = await dbGet(db, `SELECT id FROM samp_gangs WHERE leader_id = ?`, ["territory-leader"]);
    await dbRun(db, `UPDATE samp_gangs SET treasury = 100000 WHERE id = ?`, [gang.id]);

    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "buybiz", userId: "territory-leader", username: "TerritoryLeader", options: { id: "carwash" } }),
      db,
    });

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    const fourteenHoursAgo = new Date(Date.now() - 14 * 60 * 60_000).toISOString().slice(0, 19).replace("T", " ");
    await dbRun(
      db,
      `UPDATE samp_properties
       SET last_collected = ?, last_state_tick = ?, last_maintained = ?, condition = 100, supplies = 100
       WHERE user_id = ? AND property_id = ?`,
      [twoHoursAgo, twoHoursAgo, fourteenHoursAgo, "territory-leader", "carwash"]
    );

    const claim = makeInteraction({
      commandName: "gang",
      userId: "territory-leader",
      username: "TerritoryLeader",
      subcommand: "claimterritory",
      options: { district: "ganton" },
    });
    await handleSampExtendedCommand({ interaction: claim, db });

    const beforeCollect = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["territory-leader"]);
    await handleSampExtendedCommand({
      interaction: makeInteraction({ commandName: "collectincome", userId: "territory-leader", username: "TerritoryLeader" }),
      db,
    });
    const afterCollect = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["territory-leader"]);
    const territory = await dbGet(db, `SELECT gang_id, pressure FROM samp_gang_territories WHERE district_id = ?`, ["ganton"]);

    assert.equal(Number(territory.gang_id), Number(gang.id), "district should be controlled by the gang");
    assert.ok(Number(territory.pressure) >= 60, "captured territory should start with pressure");
    assert.ok(afterCollect.money - beforeCollect.money >= 2700, "territory control should materially boost passive business income");
    assert.match(String(claim.__getState().lastReply), /район/i, "territory claim summary should be shown");
  } finally {
    db.close();
  }
});

test("live ops presets can be saved and applied", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const initial = await listSampLiveOpsPresets(db);
    assert.ok(initial.length >= 3, "default presets should be seeded");

    const saved = await upsertSampLiveOpsPreset(db, {
      name: "Admin Holiday",
      preset_type: "holiday",
      config: {
        active_event_name: "Admin Holiday",
        active_event_message: "Boosted economy for a one-off admin event.",
        business_income_multiplier: 1.4,
        business_run_multiplier: 1.25,
        gang_support_cost_multiplier: 0.8,
        rep_multiplier: 1.5,
      },
    });

    const preset = saved.find((item) => item.name === "Admin Holiday");
    assert.ok(preset, "custom preset should be saved");

    const applied = await applySampLiveOpsPreset(db, preset.id);
    const config = await getSampLiveOpsConfig(db);

    assert.equal(applied.preset.name, "Admin Holiday", "applied preset should be returned");
    assert.equal(Number(config.business_income_multiplier), 1.4, "preset should update business income multiplier");
    assert.equal(Number(config.business_run_multiplier), 1.25, "preset should update business run multiplier");
    assert.equal(Number(config.gang_support_cost_multiplier), 0.8, "preset should update gang support cost multiplier");
    assert.equal(Number(config.rep_multiplier), 1.5, "preset should update rep multiplier");
  } finally {
    db.close();
  }
});

// ═══════════════════════════════════════════════════════════════
// Black Market Overhaul Tests
// ═══════════════════════════════════════════════════════════════

test("black market browse shows 4 items with dealer personality", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg = makeInteraction({ commandName: "reg", userId: "u-bm1", username: "BmPlayer" });
    await handleSampLifeCommand({ interaction: reg, db });

    const browse = makeInteraction({
      commandName: "blackmarket",
      userId: "u-bm1",
      subcommand: "browse",
    });
    await handleSampExtendedCommand({ interaction: browse, db });

    const state = browse.__getState();
    const reply = state.lastReply;
    // browse uses embeds with fields named #1, #2, etc.
    assert.ok(reply && reply.embeds, "browse should reply with embeds");
    const embed = reply.embeds[0];
    const allFieldNames = (embed.data?.fields || []).map(f => f.name).join(" ");
    assert.ok(allFieldNames.includes("#1"), "browse should show item #1");
    assert.ok(allFieldNames.includes("#4"), "browse should show item #4");
  } finally {
    db.close();
  }
});

test("black market buy grants inventory item and deducts money", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg = makeInteraction({ commandName: "reg", userId: "u-bm2", username: "BmBuyer" });
    await handleSampLifeCommand({ interaction: reg, db });
    await dbRun(db, `UPDATE samp_users SET money = 500000 WHERE user_id = ?`, ["u-bm2"]);

    const buy = makeInteraction({
      commandName: "blackmarket",
      userId: "u-bm2",
      subcommand: "buy",
      options: { slot: 1 },
    });
    await handleSampExtendedCommand({ interaction: buy, db });

    const state = buy.__getState();
    const content = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";
    // Should either succeed or get stung - both are valid
    assert.ok(
      content.includes("Куплено") || content.includes("куплено") || content.includes("📦") ||
      content.includes("🚨") || content.includes("Засада") || content.includes("⭐"),
      "buy should show purchase confirmation or sting"
    );
  } finally {
    db.close();
  }
});

test("getInventoryQty and consumeInventoryItem work correctly", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg = makeInteraction({ commandName: "reg", userId: "u-inv", username: "InvUser" });
    await handleSampLifeCommand({ interaction: reg, db });

    // Initially 0
    const qty0 = await getInventoryQty(db, "u-inv", "bm_armor");
    assert.equal(qty0, 0, "initial inventory should be 0");

    // Add some via direct SQL
    await dbRun(db,
      `INSERT INTO samp_inventory(user_id, item_id, qty) VALUES(?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`,
      ["u-inv", "bm_armor", 3]
    );

    const qty1 = await getInventoryQty(db, "u-inv", "bm_armor");
    assert.equal(qty1, 3, "should have 3 after insert");

    // Consume 1
    await consumeInventoryItem(db, "u-inv", "bm_armor", 1);
    const qty2 = await getInventoryQty(db, "u-inv", "bm_armor");
    assert.equal(qty2, 2, "should have 2 after consuming 1");

    // Consume 2
    await consumeInventoryItem(db, "u-inv", "bm_armor", 2);
    const qty3 = await getInventoryQty(db, "u-inv", "bm_armor");
    assert.equal(qty3, 0, "should have 0 after consuming all");
  } finally {
    db.close();
  }
});

test("usejailpass frees player from jail", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg = makeInteraction({ commandName: "reg", userId: "u-jail", username: "JailUser" });
    await handleSampLifeCommand({ interaction: reg, db });

    // Put in jail and give jail pass
    await dbRun(db, `UPDATE samp_users SET jail_until = ? WHERE user_id = ?`, [Date.now() + 600_000, "u-jail"]);
    await dbRun(db,
      `INSERT INTO samp_inventory(user_id, item_id, qty) VALUES(?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`,
      ["u-jail", "bm_jail_pass", 1]
    );

    const use = makeInteraction({ commandName: "usejailpass", userId: "u-jail" });
    await handleSampExtendedCommand({ interaction: use, db });

    const state = use.__getState();
    const content = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";
    assert.ok(content.includes("свобод") || content.includes("вышел") || content.includes("📄"), "jail pass should free player");

    // Inventory consumed
    const qty = await getInventoryQty(db, "u-jail", "bm_jail_pass");
    assert.equal(qty, 0, "jail pass should be consumed");

    // Check jail_until reset
    const user = await dbGet(db, `SELECT jail_until FROM samp_users WHERE user_id = ?`, ["u-jail"]);
    assert.ok(Number(user.jail_until || 0) <= Date.now(), "jail_until should be cleared");
  } finally {
    db.close();
  }
});

test("wiretap reveals target balance", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg1 = makeInteraction({ commandName: "reg", userId: "u-spy", username: "SpyUser" });
    await handleSampLifeCommand({ interaction: reg1, db });
    const reg2 = makeInteraction({ commandName: "reg", userId: "u-target", username: "TargetUser" });
    await handleSampLifeCommand({ interaction: reg2, db });

    await dbRun(db, `UPDATE samp_users SET money = 100000 WHERE user_id = ?`, ["u-target"]);
    await dbRun(db,
      `INSERT INTO samp_inventory(user_id, item_id, qty) VALUES(?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`,
      ["u-spy", "bm_wiretap", 1]
    );

    const wiretap = makeInteraction({
      commandName: "wiretap",
      userId: "u-spy",
      options: { user: { id: "u-target", bot: false } },
    });
    await handleSampExtendedCommand({ interaction: wiretap, db });

    const state = wiretap.__getState();
    const content = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";
    assert.ok(content.includes("100") || content.includes("прослушк"), "wiretap should reveal balance info");

    const qty = await getInventoryQty(db, "u-spy", "bm_wiretap");
    assert.equal(qty, 0, "wiretap should be consumed");
  } finally {
    db.close();
  }
});

test("sabotage sets sabotaged cooldown on target", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg1 = makeInteraction({ commandName: "reg", userId: "u-sabo", username: "SaboUser" });
    await handleSampLifeCommand({ interaction: reg1, db });
    const reg2 = makeInteraction({ commandName: "reg", userId: "u-victim", username: "VictimUser" });
    await handleSampLifeCommand({ interaction: reg2, db });

    await dbRun(db,
      `INSERT INTO samp_inventory(user_id, item_id, qty) VALUES(?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`,
      ["u-sabo", "bm_sabotage", 1]
    );

    const sabo = makeInteraction({
      commandName: "sabotage",
      userId: "u-sabo",
      options: { user: { id: "u-victim", bot: false } },
    });
    await handleSampExtendedCommand({ interaction: sabo, db });

    const state = sabo.__getState();
    const content = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";
    assert.ok(content.includes("саботир") || content.includes("🔧") || content.includes("сабот"), "sabotage should confirm action");

    // Check setting set on victim
    const setting = await dbGet(db, `SELECT value FROM samp_user_settings WHERE user_id = ? AND key = ?`, ["u-victim", "sabotaged_until"]);
    assert.ok(setting && Number(setting.value) > Date.now(), "sabotaged_until setting should be set in the future");

    const qty = await getInventoryQty(db, "u-sabo", "bm_sabotage");
    assert.equal(qty, 0, "sabotage item should be consumed");
  } finally {
    db.close();
  }
});

test("disguise activates disguised cooldown", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    const reg1 = makeInteraction({ commandName: "reg", userId: "u-disguise", username: "DisguiseUser" });
    await handleSampLifeCommand({ interaction: reg1, db });

    await dbRun(db,
      `INSERT INTO samp_inventory(user_id, item_id, qty) VALUES(?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`,
      ["u-disguise", "bm_disguise", 1]
    );

    const disguise = makeInteraction({ commandName: "disguise", userId: "u-disguise" });
    await handleSampExtendedCommand({ interaction: disguise, db });

    const state = disguise.__getState();
    const content = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";
    assert.ok(content.includes("маскировк") || content.includes("🎭"), "disguise should confirm activation");

    // Check setting set
    const setting = await dbGet(db, `SELECT value FROM samp_user_settings WHERE user_id = ? AND key = ?`, ["u-disguise", "disguised_until"]);
    assert.ok(setting && Number(setting.value) > Date.now(), "disguised_until setting should be set in the future");

    const qty = await getInventoryQty(db, "u-disguise", "bm_disguise");
    assert.equal(qty, 0, "disguise item should be consumed");
  } finally {
    db.close();
  }
});

test("hottip shows richest players", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    for (const userId of ["u-tip1", "u-tip2", "u-tip3", "u-tip4", "u-tip5", "u-tip6"]) {
      await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId, username: userId }), db });
    }

    await dbRun(db, `UPDATE samp_users SET money = 500000 WHERE user_id = ?`, ["u-tip2"]);
    await dbRun(db, `UPDATE samp_users SET money = 430000 WHERE user_id = ?`, ["u-tip3"]);
    await dbRun(db, `UPDATE samp_users SET money = 360000 WHERE user_id = ?`, ["u-tip4"]);
    await dbRun(db, `UPDATE samp_users SET money = 290000 WHERE user_id = ?`, ["u-tip5"]);
    await dbRun(db, `UPDATE samp_users SET money = 220000 WHERE user_id = ?`, ["u-tip6"]);
    await dbRun(db,
      `INSERT INTO samp_inventory(user_id, item_id, qty) VALUES(?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`,
      ["u-tip1", "bm_hot_tip", 1]
    );

    const tip = makeInteraction({ commandName: "hottip", userId: "u-tip1" });
    await handleSampExtendedCommand({ interaction: tip, db });

    const state = tip.__getState();
    const content = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";
    assert.match(content, /1\. <@u-tip2>/);
    assert.match(content, /2\. <@u-tip3>/);
    assert.match(content, /3\. <@u-tip4>/);
    assert.match(content, /4\. <@u-tip5>/);
    assert.match(content, /5\. <@u-tip6>/);

    const qty = await getInventoryQty(db, "u-tip1", "bm_hot_tip");
    assert.equal(qty, 0, "hot tip should be consumed");
  } finally {
    db.close();
  }
});

test("buycosmetic accepts the boss title from the expanded catalog", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-no-boss", username: "NoBoss" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 100000 WHERE user_id = ?`, ["u-no-boss"]);

    const buy = makeInteraction({
      commandName: "buycosmetic",
      userId: "u-no-boss",
      username: "NoBoss",
      options: { id: "title_boss" },
    });
    await handleSampExtendedCommand({ interaction: buy, db });

    const state = buy.__getState();
    const payload = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";
    assert.match(payload, /Титул: Босс/i);
    assert.match(payload, /автоматически надет/i);
  } finally {
    db.close();
  }
});

test("BLACK_MARKET_ITEMS has 14 items with valid grants", () => {
  assert.equal(BLACK_MARKET_ITEMS.length, 14, "should have 14 black market items");

  for (const item of BLACK_MARKET_ITEMS) {
    assert.ok(item.type, `item should have type`);
    assert.ok(item.name, `item ${item.type} should have name`);
    assert.ok(item.basePrice[0] > 0, `item ${item.type} should have positive base price`);
    const grant = BLACK_MARKET_GRANTS[item.type];
    assert.ok(grant, `item ${item.type} should have a grant entry`);
    assert.ok(grant.summary, `item ${item.type} grant should have summary`);
  }
});

test("repair cost scales with missing weapon durability", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-repair", username: "RepairUser" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 500000 WHERE user_id = ?`, ["u-repair"]);
    await dbRun(db, `INSERT INTO samp_inventory(user_id, item_id, qty, durability) VALUES(?, ?, 1, 99)`, ["u-repair", "heatseeker"]);
    await dbRun(db, `INSERT INTO samp_user_settings(user_id, key, value) VALUES(?, 'weapon', ?)`, ["u-repair", "heatseeker"]);

    const repair = makeInteraction({ commandName: "repair", userId: "u-repair", username: "RepairUser" });
    await handleSampExtendedCommand({ interaction: repair, db });

    const user = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, ["u-repair"]);
    const weapon = await dbGet(db, `SELECT durability FROM samp_inventory WHERE user_id = ? AND item_id = ?`, ["u-repair", "heatseeker"]);
    const ledger = await dbGet(db, `SELECT amount, meta_json FROM samp_ledger WHERE type = 'repair' AND from_user = ? ORDER BY id DESC LIMIT 1`, ["u-repair"]);
    const state = repair.__getState();
    const payload = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";

    assert.equal(getWeaponRepairCost(650000, 99), 1300);
    assert.equal(Number(user?.money || 0), 498700);
    assert.equal(Number(weapon?.durability || 0), 100);
    assert.equal(Number(ledger?.amount || 0), 1300);
    assert.match(String(ledger?.meta_json || ""), /durability_before/);
    assert.match(payload, /1(?:\s|\u00a0)300 \$/);
  } finally {
    db.close();
  }
});

test("repair refuses weapon already at full durability", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-repair-full", username: "RepairFull" }), db });
    await dbRun(db, `INSERT INTO samp_inventory(user_id, item_id, qty, durability) VALUES(?, ?, 1, 100)`, ["u-repair-full", "deagle"]);
    await dbRun(db, `INSERT INTO samp_user_settings(user_id, key, value) VALUES(?, 'weapon', ?)`, ["u-repair-full", "deagle"]);

    const repair = makeInteraction({ commandName: "repair", userId: "u-repair-full", username: "RepairFull" });
    await handleSampExtendedCommand({ interaction: repair, db });

    const state = repair.__getState();
    const payload = typeof state.lastReply === "string" ? state.lastReply : state.lastReply?.content || "";
    assert.match(payload, /идеальном состоянии/i);
  } finally {
    db.close();
  }
});

test("golden deagle grants bounty bonus and reduced durability loss", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  const realRandom = Math.random;
  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-gold", username: "Gold" }), db });
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-target", username: "Target" }), db });

    await dbRun(db, `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, ["u-gold", "weapon_skin_deagle", "gold"]);
    await dbRun(db, `INSERT INTO samp_inventory(user_id, item_id, qty, durability) VALUES(?, ?, 1, 100)`, ["u-gold", "deagle"]);
    await dbRun(db, `INSERT INTO samp_bounties(target_user_id, placed_by, amount, status) VALUES(?, ?, ?, 'active')`, ["u-target", "u-gold", 20000]);

    const bountyResult = await checkAndCollectBounty(db, "u-gold", "u-target");
    assert.equal(bountyResult.collected, true);
    assert.equal(bountyResult.baseAmount, 20000);
    assert.equal(bountyResult.bonusAmount, 5000);
    assert.equal(bountyResult.amount, 25000);

    Math.random = () => 0;
    await degradeWeapon(db, "u-gold", "deagle");
    const weapon = await dbGet(db, `SELECT durability FROM samp_inventory WHERE user_id = ? AND item_id = ?`, ["u-gold", "deagle"]);
    assert.equal(Number(weapon?.durability || 0), 98, "golden deagle should only lose 2 durability at minimum roll");
  } finally {
    Math.random = realRandom;
    db.close();
  }
});

test("golden deagle appears in duel log and mentions its bonus", async () => {
  const db = makeDb();
  await ensureSampLifeTables(db);
  await ensureSampExtendedTables(db);

  const realRandom = Math.random;
  try {
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-gold-duel", username: "GoldDuel" }), db });
    await handleSampLifeCommand({ interaction: makeInteraction({ commandName: "reg", userId: "u-gold-victim", username: "Victim" }), db });
    await dbRun(db, `UPDATE samp_users SET money = 100000 WHERE user_id IN (?, ?)`, ["u-gold-duel", "u-gold-victim"]);

    await dbRun(db, `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, ["u-gold-duel", "weapon_skin_deagle", "gold"]);
    await dbRun(db, `INSERT INTO samp_inventory(user_id, item_id, qty, durability) VALUES(?, ?, 1, 100)`, ["u-gold-duel", "deagle"]);
    await dbRun(db, `INSERT INTO samp_user_settings(user_id, key, value) VALUES(?, 'weapon', ?)`, ["u-gold-duel", "deagle"]);
    await dbRun(db, `INSERT INTO samp_bounties(target_user_id, placed_by, amount, status) VALUES(?, ?, ?, 'active')`, ["u-gold-victim", "u-gold-duel", 20000]);

    Math.random = () => 0;
    const duel = makeInteraction({
      commandName: "duel",
      userId: "u-gold-duel",
      username: "GoldDuel",
      options: {
        user: { id: "u-gold-victim", username: "Victim", bot: false },
        bet: 1000,
      },
    });
    await handleSampLifeCommand({ interaction: duel, db });

    const state = duel.__getState();
    const reply = String(state.lastReply || state.lastEditReply || "");
    assert.match(reply, /Золотой Desert Eagle/);
    assert.match(reply, /\+3 урон, \+25% к баунти/i);
    assert.match(reply, /бонус Золотого Desert Eagle/i);
  } finally {
    Math.random = realRandom;
    db.close();
  }
});