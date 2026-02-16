"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

// -------------------------
// Game constants (MVP)
// -------------------------
const START_MONEY = 500;
const DEFAULT_CAR_ID = "bicycle";

const CARS = {
  bicycle: { name: "Велосипед", price: 0, speed: 5 },
  sultan: { name: "Sultan RS", price: 50_000, speed: 80 },
  elegy: { name: "Elegy", price: 100_000, speed: 95 },
  infernus: { name: "Infernus", price: 500_000, speed: 120 },
};

const ITEMS = {
  pistol: { name: "Пистолет", price: 15_000, dmg: [10, 18] },
  shotgun: { name: "Дробовик", price: 70_000, dmg: [18, 30] },
  ak47: { name: "AK-47", price: 160_000, dmg: [22, 36] },
};

const COOLDOWNS_MS = {
  work: 60_000,
  truck: 15 * 60_000,
  rob: 10 * 60_000,
};

// -------------------------
// Helpers
// -------------------------
function nowMs() {
  return Date.now();
}

function fmtMoney(n) {
  const v = Number(n || 0);
  return `${v.toLocaleString("ru-RU")} $`;
}

function clampInt(n, min, max) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return null;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function carInfo(carId) {
  return CARS[carId] || CARS[DEFAULT_CAR_ID];
}

function itemInfo(itemId) {
  return ITEMS[itemId] || null;
}

function msToHuman(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}с`;
  return `${m}м ${r}с`;
}

async function withTransaction(db, fn) {
  await dbRun(db, "BEGIN IMMEDIATE");
  try {
    const res = await fn();
    await dbRun(db, "COMMIT");
    return res;
  } catch (e) {
    try {
      await dbRun(db, "ROLLBACK");
    } catch (_) {
      // ignore rollback errors
    }
    throw e;
  }
}

async function getUserRow(db, userId) {
  return dbGet(db, "SELECT user_id, money, car_id, rep, jail_until FROM samp_users WHERE user_id = ?", [String(userId)]);
}

async function getOrCreateUser(db, userId) {
  const uid = String(userId);
  const existing = await getUserRow(db, uid);
  if (existing) return existing;

  await dbRun(
    db,
    `INSERT INTO samp_users(user_id, money, car_id, rep, jail_until)
     VALUES(?, ?, ?, 0, 0)` ,
    [uid, START_MONEY, DEFAULT_CAR_ID]
  );
  await dbRun(db, `INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)`, [uid, DEFAULT_CAR_ID]);
  return getUserRow(db, uid);
}

async function ensureNotJailed(interaction, userRow) {
  const until = Number(userRow?.jail_until || 0);
  if (until > nowMs()) {
    const left = msToHuman(until - nowMs());
    await interaction.reply({
      content: `🚔 Ты в тюрьме ещё **${left}**. Вирты и тачки подождут.\n(Команда /balance доступна всегда.)`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

async function getCooldown(db, userId, action) {
  const row = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?", [String(userId), String(action)]);
  return row ? Number(row.ready_at || 0) : 0;
}

async function setCooldown(db, userId, action, readyAt) {
  await dbRun(
    db,
    `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)
     ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`,
    [String(userId), String(action), Number(readyAt)]
  );
}

async function checkAndConsumeCooldown(interaction, db, userId, action) {
  const cd = await getCooldown(db, userId, action);
  if (cd > nowMs()) {
    await interaction.reply({ content: `⏳ Рано. Подожди **${msToHuman(cd - nowMs())}**.`, ephemeral: true });
    return false;
  }
  const readyAt = nowMs() + (COOLDOWNS_MS[action] || 60_000);
  await setCooldown(db, userId, action, readyAt);
  return true;
}

async function addLedger(db, type, fromUser, toUser, amount, meta = {}) {
  await dbRun(
    db,
    `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json)
     VALUES(?, ?, ?, ?, ?)`,
    [type, fromUser ? String(fromUser) : null, toUser ? String(toUser) : null, Number(amount || 0), JSON.stringify(meta || {})]
  );
}

async function adjustMoney(db, userId, delta) {
  const uid = String(userId);
  await dbRun(db, `UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`, [Number(delta), uid]);
}

async function transferMoney(db, fromUserId, toUserId, amount, ledgerType, meta = {}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");

  await withTransaction(db, async () => {
    const from = await getOrCreateUser(db, fromUserId);
    const to = await getOrCreateUser(db, toUserId);

    if (Number(from.money) < amt) throw new Error("INSUFFICIENT");

    await adjustMoney(db, fromUserId, -amt);
    await adjustMoney(db, toUserId, amt);
    await addLedger(db, ledgerType, fromUserId, toUserId, amt, meta);

    // sanity: prevent negative balances
    const check = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", [String(fromUserId)]);
    if (Number(check?.money) < 0) throw new Error("NEGATIVE_BALANCE");
  });
}

async function getActiveWeapon(db, userId) {
  const row = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'weapon'", [String(userId)]);
  const weaponId = row?.value || null;
  return weaponId && ITEMS[weaponId] ? weaponId : null;
}

async function setActiveWeapon(db, userId, weaponId) {
  await dbRun(
    db,
    `INSERT INTO samp_user_settings(user_id, key, value) VALUES(?, 'weapon', ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    [String(userId), String(weaponId)]
  );
}

async function getInventoryQty(db, userId, itemId) {
  const row = await dbGet(db, "SELECT qty FROM samp_inventory WHERE user_id = ? AND item_id = ?", [String(userId), String(itemId)]);
  return row ? Number(row.qty || 0) : 0;
}

async function addInventory(db, userId, itemId, deltaQty) {
  const uid = String(userId);
  const item = String(itemId);
  const dq = Number(deltaQty);

  await dbRun(
    db,
    `INSERT INTO samp_inventory(user_id, item_id, qty)
     VALUES(?, ?, ?)
     ON CONFLICT(user_id, item_id) DO UPDATE SET qty = MAX(0, qty + excluded.qty)`,
    [uid, item, dq]
  );
}

// -------------------------
// DB schema
// -------------------------
async function ensureSampLifeTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_users (
      user_id TEXT PRIMARY KEY,
      money INTEGER NOT NULL DEFAULT 0,
      car_id TEXT NOT NULL DEFAULT 'bicycle',
      rep INTEGER NOT NULL DEFAULT 0,
      jail_until INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_garage (
      user_id TEXT NOT NULL,
      car_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, car_id)
    )`
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_inventory (
      user_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, item_id)
    )`
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_cooldowns (
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      ready_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, action)
    )`
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      type TEXT NOT NULL,
      from_user TEXT,
      to_user TEXT,
      amount INTEGER NOT NULL,
      meta_json TEXT
    )`
  );

  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_from ON samp_ledger(from_user)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_to ON samp_ledger(to_user)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_ledger_ts ON samp_ledger(ts)`);

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_car_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_user_id TEXT NOT NULL,
      buyer_user_id TEXT NOT NULL,
      car_id TEXT NOT NULL,
      price INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_car_offers_buyer_status ON samp_car_offers(buyer_user_id, status)`);

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_user_settings (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    )`
  );
}

// -------------------------
// Slash builders
// -------------------------
function getSampLifeCommandBuilders() {
  return [
    new SlashCommandBuilder().setName("reg").setDescription("SAMP Life: регистрация (паспорт гражданина SA)"),

    new SlashCommandBuilder().setName("balance").setDescription("SAMP Life: показать баланс и профиль"),

    new SlashCommandBuilder().setName("work").setDescription("SAMP Life: подзаработать по-мелочи (короткий кулдаун)"),

    new SlashCommandBuilder().setName("truck").setDescription("SAMP Life: дальнобой (длинный кулдаун, риск аварии)"),

    new SlashCommandBuilder().setName("rob").setDescription("SAMP Life: ограбление 24/7 (быстро, но можно присесть)"),

    new SlashCommandBuilder().setName("dealership").setDescription("SAMP Life: автосалон (цены/скорость)"),

    new SlashCommandBuilder()
      .setName("buy")
      .setDescription("SAMP Life: купить тачку или оружие")
      .addStringOption((o) =>
        o
          .setName("type")
          .setDescription("Что покупаем")
          .setRequired(true)
          .addChoices(
            { name: "Тачка", value: "car" },
            { name: "Оружие", value: "weapon" }
          )
      )
      .addStringOption((o) => o.setName("id").setDescription("ID (например sultan / shotgun)").setRequired(true)),

    new SlashCommandBuilder()
      .setName("race")
      .setDescription("SAMP Life: гонка на вирты")
      .addUserOption((o) => o.setName("user").setDescription("С кем гонка").setRequired(true))
      .addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
      .setName("duel")
      .setDescription("SAMP Life: дуэль на вирты")
      .addUserOption((o) => o.setName("user").setDescription("С кем дуэль").setRequired(true))
      .addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
      .setName("sellcar")
      .setDescription("SAMP Life: продать тачку игроку")
      .addUserOption((o) => o.setName("user").setDescription("Покупатель").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("car")
          .setDescription("ID тачки")
          .setRequired(true)
      )
      .addIntegerOption((o) => o.setName("price").setDescription("Цена").setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
      .setName("buycar")
      .setDescription("SAMP Life: купить тачку по офферу")
      .addIntegerOption((o) => o.setName("offer").setDescription("ID оффера").setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
      .setName("weapon")
      .setDescription("SAMP Life: выбрать активное оружие")
      .addStringOption((o) => o.setName("id").setDescription("ID оружия").setRequired(true)),
  ];
}

// -------------------------
// Commands
// -------------------------
async function handleReg(interaction, db) {
  const userId = interaction.user.id;
  const existing = await getUserRow(db, userId);
  if (existing) {
    await interaction.reply({ content: "У тебя уже есть паспорт гражданина SA.", ephemeral: true });
    return;
  }

  await getOrCreateUser(db, userId);
  await addLedger(db, "reg", null, userId, START_MONEY, {});

  await interaction.reply(
    `Добро пожаловать в San Andreas, **${interaction.user.username}**!\n` +
      `Старт: **${fmtMoney(START_MONEY)}** и **${CARS[DEFAULT_CAR_ID].name}**.\n` +
      `Пиши /work чтобы подняться.`
  );
}

async function handleBalance(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);
  const car = carInfo(user.car_id);
  const weaponId = await getActiveWeapon(db, userId);
  const weapon = weaponId ? itemInfo(weaponId) : null;

  const jailUntil = Number(user.jail_until || 0);
  const jailText = jailUntil > nowMs() ? `🚔 Тюрьма: ещё **${msToHuman(jailUntil - nowMs())}**` : "✅ На свободе";

  const embed = new EmbedBuilder()
    .setTitle("SAMP Life — Профиль")
    .setDescription(
      [
        `Игрок: <@${userId}>`,
        `Баланс: **${fmtMoney(user.money)}**`,
        `Тачка: **${car.name}** (скорость: ${car.speed})`,
        weapon ? `Оружие: **${weapon.name}**` : "Оружие: —",
        jailText,
      ].join("\n")
    )
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

async function handleWork(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);

  if (!(await ensureNotJailed(interaction, user))) return;
  if (!(await checkAndConsumeCooldown(interaction, db, userId, "work"))) return;

  const jobs = ["разносил пиццу", "мыл тачку босса", "грузил ящики в порту", "таскал колёса на шинке"]; 
  const job = pick(jobs);
  const earnings = randInt(100, 500);

  await adjustMoney(db, userId, earnings);
  await addLedger(db, "work", null, userId, earnings, { job });

  const after = await getUserRow(db, userId);
  await interaction.reply(`🛠 Ты ${job} и поднял **${fmtMoney(earnings)}**. Баланс: **${fmtMoney(after.money)}**`);
}

async function handleTruck(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);

  if (!(await ensureNotJailed(interaction, user))) return;
  if (!(await checkAndConsumeCooldown(interaction, db, userId, "truck"))) return;

  // Risk model: 18% crash
  const crash = Math.random() < 0.18;
  if (crash) {
    const fine = randInt(800, 2500);
    await adjustMoney(db, userId, -fine);
    await addLedger(db, "truck_crash", userId, null, fine, {});
    const after = await getUserRow(db, userId);
    await interaction.reply(`🚚💥 Ты улетел в кювет. Штраф/ремонт: **-${fmtMoney(fine)}**. Баланс: **${fmtMoney(after.money)}**`);
    return;
  }

  const earnings = randInt(2500, 6500);
  await adjustMoney(db, userId, earnings);
  await addLedger(db, "truck", null, userId, earnings, {});
  const after = await getUserRow(db, userId);
  await interaction.reply(`🚚 Ты отработал дальнобой и привёз бабки: **${fmtMoney(earnings)}**. Баланс: **${fmtMoney(after.money)}**`);
}

async function handleRob(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);

  if (!(await ensureNotJailed(interaction, user))) return;
  if (!(await checkAndConsumeCooldown(interaction, db, userId, "rob"))) return;

  // 35% jail chance. On success: win 2k-10k. On fail: jail 5 min + fine 1k-4k.
  const caught = Math.random() < 0.35;
  if (caught) {
    const jailMs = 5 * 60_000;
    const fine = randInt(1000, 4000);
    await withTransaction(db, async () => {
      await adjustMoney(db, userId, -fine);
      await dbRun(db, `UPDATE samp_users SET jail_until = ? WHERE user_id = ?`, [nowMs() + jailMs, String(userId)]);
      await addLedger(db, "rob_caught", userId, null, fine, { jail_ms: jailMs });
    });

    const after = await getUserRow(db, userId);
    await interaction.reply(
      `🚔 Тебя приняли у 24/7. Тюрьма: **5 минут**. Штраф: **-${fmtMoney(fine)}**.\n` +
        `Баланс: **${fmtMoney(after.money)}**`
    );
    return;
  }

  const loot = randInt(2000, 10_000);
  await adjustMoney(db, userId, loot);
  await addLedger(db, "rob", null, userId, loot, {});
  const after = await getUserRow(db, userId);
  await interaction.reply(`🕶️ Ты вынес кассу 24/7: **${fmtMoney(loot)}**. Баланс: **${fmtMoney(after.money)}**`);
}

async function handleDealership(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("🚗 Автосалон Otto's Autos")
    .setDescription("Тачки, которые поднимут твой статус в SA")
    .setTimestamp(new Date());

  for (const [id, car] of Object.entries(CARS)) {
    embed.addFields({
      name: `${car.name}  (${id})`,
      value: `Цена: **${fmtMoney(car.price)}**\nСкорость: **${car.speed}**`,
      inline: false,
    });
  }

  embed.setFooter({ text: "Покупка: /buy type:car id:<carId>" });
  await interaction.reply({ embeds: [embed] });
}

async function handleBuy(interaction, db) {
  const userId = interaction.user.id;
  const type = interaction.options.getString("type", true);
  const idRaw = interaction.options.getString("id", true);
  const id = String(idRaw).toLowerCase();

  const user = await getOrCreateUser(db, userId);
  if (!(await ensureNotJailed(interaction, user))) return;

  if (type === "car") {
    const car = CARS[id];
    if (!car) {
      await interaction.reply({ content: "Такой тачки нет в салоне.", ephemeral: true });
      return;
    }

    await withTransaction(db, async () => {
      const fresh = await getOrCreateUser(db, userId);
      if (Number(fresh.money) < car.price) throw new Error("INSUFFICIENT");

      await adjustMoney(db, userId, -car.price);
      await dbRun(db, `INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)`, [String(userId), id]);
      await dbRun(db, `UPDATE samp_users SET car_id = ?, updated_at = datetime('now') WHERE user_id = ?`, [id, String(userId)]);
      await addLedger(db, "buy_car", userId, null, car.price, { car_id: id });
    });

    const after = await getUserRow(db, userId);
    await interaction.reply(`✅ Ты купил **${car.name}** за **${fmtMoney(car.price)}**. Баланс: **${fmtMoney(after.money)}**`);
    return;
  }

  if (type === "weapon") {
    const weapon = ITEMS[id];
    if (!weapon) {
      await interaction.reply({ content: "Такого оружия нет. Доступно: pistol, shotgun, ak47", ephemeral: true });
      return;
    }

    await withTransaction(db, async () => {
      const fresh = await getOrCreateUser(db, userId);
      if (Number(fresh.money) < weapon.price) throw new Error("INSUFFICIENT");

      await adjustMoney(db, userId, -weapon.price);
      await addInventory(db, userId, id, 1);
      // auto-equip
      await setActiveWeapon(db, userId, id);
      await addLedger(db, "buy_weapon", userId, null, weapon.price, { item_id: id });
    });

    const after = await getUserRow(db, userId);
    await interaction.reply(`🔫 Ты купил **${weapon.name}** и поставил его активным. Цена: **${fmtMoney(weapon.price)}**. Баланс: **${fmtMoney(after.money)}**`);
    return;
  }

  await interaction.reply({ content: "Неизвестный тип покупки.", ephemeral: true });
}

async function handleWeapon(interaction, db) {
  const userId = interaction.user.id;
  const weaponId = String(interaction.options.getString("id", true)).toLowerCase();
  const weapon = ITEMS[weaponId];
  if (!weapon) {
    await interaction.reply({ content: "Такого оружия нет. Доступно: pistol, shotgun, ak47", ephemeral: true });
    return;
  }

  const user = await getOrCreateUser(db, userId);
  if (!(await ensureNotJailed(interaction, user))) return;

  const qty = await getInventoryQty(db, userId, weaponId);
  if (qty <= 0) {
    await interaction.reply({ content: "Сначала купи оружие: /buy type:weapon id:<оружие>", ephemeral: true });
    return;
  }

  await setActiveWeapon(db, userId, weaponId);
  await interaction.reply(`✅ Активное оружие: **${weapon.name}**`);
}

async function handleRace(interaction, db) {
  const userId = interaction.user.id;
  const opponent = interaction.options.getUser("user", true);
  const betRaw = interaction.options.getInteger("bet", true);

  if (opponent.bot) {
    await interaction.reply({ content: "С ботами не гоняемся.", ephemeral: true });
    return;
  }
  if (opponent.id === userId) {
    await interaction.reply({ content: "Сам с собой? Не, так не считается.", ephemeral: true });
    return;
  }

  const bet = clampInt(betRaw, 1, 2_000_000);
  if (!bet) {
    await interaction.reply({ content: "Некорректная ставка.", ephemeral: true });
    return;
  }

  const p1 = await getOrCreateUser(db, userId);
  const p2 = await getOrCreateUser(db, opponent.id);
  if (!(await ensureNotJailed(interaction, p1))) return;
  if (Number(p1.money) < bet || Number(p2.money) < bet) {
    await interaction.reply({ content: "У кого-то нет денег на ставку.", ephemeral: true });
    return;
  }

  const p1Car = carInfo(p1.car_id);
  const p2Car = carInfo(p2.car_id);

  const p1Total = randInt(1, 50) + p1Car.speed;
  const p2Total = randInt(1, 50) + p2Car.speed;

  let winner = null;
  let text = `🏁 **Гонка!**\n<@${userId}> (**${p1Car.name}**) VS <@${opponent.id}> (**${p2Car.name}**)\nСтавка: **${fmtMoney(bet)}**\n\n`;

  if (p1Total > p2Total) {
    winner = userId;
    text += `🚗 **${p1Car.name}** рвёт вперёд и финиширует первым! Победитель: <@${userId}>`;
  } else if (p2Total > p1Total) {
    winner = opponent.id;
    text += `🚙 **${p2Car.name}** дожимает на финише! Победитель: <@${opponent.id}>`;
  } else {
    text += "🤝 Ничья! Разъехались без потерь.";
  }

  if (winner === userId) {
    await transferMoney(db, opponent.id, userId, bet, "race", { loser: opponent.id });
    await interaction.reply(text + `\n\n💰 Ты поднял **${fmtMoney(bet)}**.`);
    return;
  }
  if (winner === opponent.id) {
    await transferMoney(db, userId, opponent.id, bet, "race", { loser: userId });
    await interaction.reply(text + `\n\n💸 Ты отдал **${fmtMoney(bet)}**.`);
    return;
  }

  await addLedger(db, "race_draw", userId, opponent.id, 0, { bet });
  await interaction.reply(text);
}

async function handleDuel(interaction, db) {
  const userId = interaction.user.id;
  const opponent = interaction.options.getUser("user", true);
  const betRaw = interaction.options.getInteger("bet", true);

  if (opponent.bot) {
    await interaction.reply({ content: "С ботами дуэли не делаем.", ephemeral: true });
    return;
  }
  if (opponent.id === userId) {
    await interaction.reply({ content: "Сам с собой? Не, так не считается.", ephemeral: true });
    return;
  }

  const bet = clampInt(betRaw, 1, 2_000_000);
  if (!bet) {
    await interaction.reply({ content: "Некорректная ставка.", ephemeral: true });
    return;
  }

  const p1 = await getOrCreateUser(db, userId);
  const p2 = await getOrCreateUser(db, opponent.id);
  if (!(await ensureNotJailed(interaction, p1))) return;

  if (Number(p1.money) < bet || Number(p2.money) < bet) {
    await interaction.reply({ content: "У кого-то нет денег на ставку.", ephemeral: true });
    return;
  }

  const p1WeaponId = await getActiveWeapon(db, userId);
  const p2WeaponId = await getActiveWeapon(db, opponent.id);

  const p1Weapon = p1WeaponId ? itemInfo(p1WeaponId) : null;
  const p2Weapon = p2WeaponId ? itemInfo(p2WeaponId) : null;

  let p1Hp = 100;
  let p2Hp = 100;

  const rounds = [];
  for (let i = 1; i <= 6; i++) {
    const p1Dmg = p1Weapon ? randInt(p1Weapon.dmg[0], p1Weapon.dmg[1]) : randInt(6, 12);
    const p2Dmg = p2Weapon ? randInt(p2Weapon.dmg[0], p2Weapon.dmg[1]) : randInt(6, 12);

    // Simultaneous exchange
    p2Hp -= p1Dmg;
    p1Hp -= p2Dmg;
    rounds.push(`Раунд ${i}: <@${userId}> -${p2Dmg}HP, <@${opponent.id}> -${p1Dmg}HP`);

    if (p1Hp <= 0 || p2Hp <= 0) break;
  }

  let winner = null;
  if (p1Hp > p2Hp) winner = userId;
  else if (p2Hp > p1Hp) winner = opponent.id;

  let text = `🔫 **Дуэль!**\n<@${userId}> (${p1Weapon?.name || "кулаки"}) VS <@${opponent.id}> (${p2Weapon?.name || "кулаки"})\nСтавка: **${fmtMoney(bet)}**\n\n`;
  text += rounds.slice(0, 6).join("\n");
  text += `\n\nФинал: <@${userId}> HP=${Math.max(0, p1Hp)} | <@${opponent.id}> HP=${Math.max(0, p2Hp)}`;

  if (!winner) {
    await addLedger(db, "duel_draw", userId, opponent.id, 0, { bet, p1Hp, p2Hp });
    await interaction.reply(text + "\n\n🤝 Ничья. Разошлись живыми.");
    return;
  }

  if (winner === userId) {
    await transferMoney(db, opponent.id, userId, bet, "duel", { p1Hp, p2Hp });
    await interaction.reply(text + `\n\n🏆 Победил <@${userId}> и поднял **${fmtMoney(bet)}**.`);
    return;
  }

  await transferMoney(db, userId, opponent.id, bet, "duel", { p1Hp, p2Hp });
  await interaction.reply(text + `\n\n💀 Победил <@${opponent.id}>. Ты потерял **${fmtMoney(bet)}**.`);
}

async function handleSellCar(interaction, db) {
  const sellerId = interaction.user.id;
  const buyer = interaction.options.getUser("user", true);
  const carId = String(interaction.options.getString("car", true)).toLowerCase();
  const priceRaw = interaction.options.getInteger("price", true);

  if (buyer.bot) {
    await interaction.reply({ content: "Боту тачку не впаришь.", ephemeral: true });
    return;
  }
  if (buyer.id === sellerId) {
    await interaction.reply({ content: "Самому себе продавать нельзя.", ephemeral: true });
    return;
  }

  const price = clampInt(priceRaw, 1, 5_000_000);
  if (!price) {
    await interaction.reply({ content: "Некорректная цена.", ephemeral: true });
    return;
  }

  const seller = await getOrCreateUser(db, sellerId);
  if (!(await ensureNotJailed(interaction, seller))) return;

  const car = CARS[carId];
  if (!car) {
    await interaction.reply({ content: "Такой тачки нет в игре.", ephemeral: true });
    return;
  }

  const owned = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", [String(sellerId), carId]);
  if (!owned) {
    await interaction.reply({ content: "У тебя нет этой тачки в гараже.", ephemeral: true });
    return;
  }

  const offerId = await withTransaction(db, async () => {
    const res = await dbRun(
      db,
      `INSERT INTO samp_car_offers(seller_user_id, buyer_user_id, car_id, price, status)
       VALUES(?, ?, ?, ?, 'open')`,
      [String(sellerId), String(buyer.id), carId, price]
    );
    await addLedger(db, "sellcar_offer", sellerId, buyer.id, price, { car_id: carId, offer_id: res.lastID });
    return res.lastID;
  });

  await interaction.reply(
    `📝 Оффер создан (#${offerId}).\n` +
      `Продавец: <@${sellerId}> | Покупатель: <@${buyer.id}>\n` +
      `Тачка: **${car.name}** | Цена: **${fmtMoney(price)}**\n\n` +
      `Покупатель подтверждает: **/buycar offer:${offerId}**`
  );
}

async function handleBuyCar(interaction, db) {
  const buyerId = interaction.user.id;
  const offerId = interaction.options.getInteger("offer", true);

  const buyer = await getOrCreateUser(db, buyerId);
  if (!(await ensureNotJailed(interaction, buyer))) return;

  const offer = await dbGet(
    db,
    `SELECT id, seller_user_id, buyer_user_id, car_id, price, status
     FROM samp_car_offers WHERE id = ?`,
    [Number(offerId)]
  );

  if (!offer) {
    await interaction.reply({ content: "Оффер не найден.", ephemeral: true });
    return;
  }
  if (offer.status !== "open") {
    await interaction.reply({ content: "Оффер уже закрыт.", ephemeral: true });
    return;
  }
  if (String(offer.buyer_user_id) !== String(buyerId)) {
    await interaction.reply({ content: "Это не твой оффер.", ephemeral: true });
    return;
  }

  const car = CARS[String(offer.car_id)];
  if (!car) {
    await interaction.reply({ content: "Эта тачка больше недоступна.", ephemeral: true });
    return;
  }

  try {
    await withTransaction(db, async () => {
      const freshOffer = await dbGet(db, "SELECT status FROM samp_car_offers WHERE id = ?", [Number(offerId)]);
      if (!freshOffer || freshOffer.status !== "open") throw new Error("CLOSED");

      const sellerOwned = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", [String(offer.seller_user_id), String(offer.car_id)]);
      if (!sellerOwned) throw new Error("SELLER_NO_CAR");

      const freshBuyer = await getOrCreateUser(db, buyerId);
      if (Number(freshBuyer.money) < Number(offer.price)) throw new Error("INSUFFICIENT");

      // money transfer
      await adjustMoney(db, buyerId, -Number(offer.price));
      await adjustMoney(db, offer.seller_user_id, Number(offer.price));

      // transfer car
      await dbRun(db, "DELETE FROM samp_garage WHERE user_id = ? AND car_id = ?", [String(offer.seller_user_id), String(offer.car_id)]);
      await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", [String(buyerId), String(offer.car_id)]);

      // set buyer active car
      await dbRun(db, "UPDATE samp_users SET car_id = ? WHERE user_id = ?", [String(offer.car_id), String(buyerId)]);

      // close offer
      await dbRun(db, "UPDATE samp_car_offers SET status = 'accepted' WHERE id = ?", [Number(offerId)]);

      await addLedger(db, "sellcar_accept", offer.seller_user_id, buyerId, Number(offer.price), { car_id: offer.car_id, offer_id: offerId });
    });
  } catch (e) {
    if (String(e.message) === "INSUFFICIENT") {
      await interaction.reply({ content: "Не хватает виртов.", ephemeral: true });
      return;
    }
    if (String(e.message) === "SELLER_NO_CAR") {
      await interaction.reply({ content: "Продавец уже не владеет этой тачкой.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: "Не удалось купить тачку (оффер мог закрыться).", ephemeral: true });
    return;
  }

  await interaction.reply(`✅ Покупка успешна. Ты получил **${car.name}** за **${fmtMoney(offer.price)}**.`);
}

async function handleSampLifeCommand({ interaction, db }) {
  const name = interaction.commandName;

  try {
    if (name === "reg") return handleReg(interaction, db);
    if (name === "balance") return handleBalance(interaction, db);
    if (name === "work") return handleWork(interaction, db);
    if (name === "truck") return handleTruck(interaction, db);
    if (name === "rob") return handleRob(interaction, db);
    if (name === "dealership") return handleDealership(interaction);
    if (name === "buy") return handleBuy(interaction, db);
    if (name === "race") return handleRace(interaction, db);
    if (name === "duel") return handleDuel(interaction, db);
    if (name === "sellcar") return handleSellCar(interaction, db);
    if (name === "buycar") return handleBuyCar(interaction, db);
    if (name === "weapon") return handleWeapon(interaction, db);

    await interaction.reply({ content: "Неизвестная команда SAMP Life.", ephemeral: true });
  } catch (e) {
    if (String(e.message) === "INSUFFICIENT") {
      await interaction.reply({ content: "Не хватает виртов.", ephemeral: true });
      return;
    }
    // eslint-disable-next-line no-console
    console.error("[samp-life] command error", e);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: "Ошибка. Попробуй позже.", ephemeral: true });
    } else {
      await interaction.reply({ content: "Ошибка. Попробуй позже.", ephemeral: true });
    }
  }
}

module.exports = {
  ensureSampLifeTables,
  getSampLifeCommandBuilders,
  handleSampLifeCommand,
  CARS,
  ITEMS,
};
