"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3").verbose();

const { dbGet, dbRun } = require("../utils/db-helpers");
const { ensureSampLifeTables, handleSampLifeCommand } = require("./samp-life");
const {
  ensureSampExtendedTables,
  handleSampExtendedCommand,
  getSampLiveOpsConfig,
  listSampLiveOpsPresets,
  upsertSampLiveOpsPreset,
  applySampLiveOpsPreset,
  PROPERTIES,
} = require("./samp-extended");

function makeDb() {
  return new sqlite3.Database(":memory:");
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