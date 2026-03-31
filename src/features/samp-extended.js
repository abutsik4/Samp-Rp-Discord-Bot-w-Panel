"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { CARS, ITEMS } = require("./samp-life");

// Helpers
function fmtMoney(n) { return `${Number(n || 0).toLocaleString("ru-RU")} $`; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function nowMs() { return Date.now(); }
function clampInt(n, min, max) { const x = Math.floor(Number(n)); return Number.isFinite(x) && x >= min && x <= max ? x : null; }

async function withTx(db, fn) {
  await dbRun(db, "BEGIN IMMEDIATE");
  try { const r = await fn(); await dbRun(db, "COMMIT"); return r; }
  catch (e) { try { await dbRun(db, "ROLLBACK"); } catch (_) {} throw e; }
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PROPERTIES = {
  carwash: { name: "Автомойка", price: 50_000, income: 1_500 },
  gas_station: { name: "Заправка", price: 100_000, income: 3_000 },
  bar_24_7: { name: "24/7", price: 150_000, income: 4_500 },
  clothing_store: { name: "Магазин одежды", price: 200_000, income: 6_000 },
  gym: { name: "Спортзал Ganton", price: 300_000, income: 9_000 },
  nightclub: { name: "Ночной клуб", price: 500_000, income: 15_000 },
  car_dealership: { name: "Автосалон Otto's", price: 750_000, income: 22_500 },
  casino: { name: "Казино Four Dragons", price: 1_500_000, income: 45_000 },
};

const CAR_UPGRADES = {
  nos: { name: "NOS", price: 15_000, speedBonus: 10 },
  turbo: { name: "Турбо", price: 30_000, speedBonus: 15 },
  hydraulics: { name: "Гидравлика", price: 10_000, speedBonus: 0 },
  wheels: { name: "Диски Chrome", price: 8_000, speedBonus: 3 },
  bodykit: { name: "Обвес", price: 20_000, speedBonus: 5 },
  engine: { name: "Двигатель V8", price: 50_000, speedBonus: 20 },
};

const HEIST_TIERS = {
  store: { name: "24/7", minPlayers: 2, maxPlayers: 3, payout: [5_000, 15_000], failChance: 0.25, jailMs: 3 * 60_000 },
  bank: { name: "Банк Лос-Сантоса", minPlayers: 2, maxPlayers: 4, payout: [20_000, 50_000], failChance: 0.35, jailMs: 5 * 60_000 },
  casino_heist: { name: "Казино Caligula's", minPlayers: 3, maxPlayers: 4, payout: [50_000, 120_000], failChance: 0.45, jailMs: 8 * 60_000 },
  military: { name: "Area 69", minPlayers: 4, maxPlayers: 4, payout: [100_000, 300_000], failChance: 0.55, jailMs: 10 * 60_000 },
};

const JOB_TEMPLATES = [
  { name: "Доставка пиццы", basePay: [500, 1500], requirement: null },
  { name: "Перегон тачки", basePay: [2000, 5000], requirement: "car_speed_50" },
  { name: "Охрана груза", basePay: [3000, 8000], requirement: "weapon" },
  { name: "Гонка по шоссе", basePay: [5000, 12000], requirement: "car_speed_80" },
  { name: "Зачистка района", basePay: [8000, 20000], requirement: "weapon_dmg_20" },
  { name: "Перевоз VIP", basePay: [10000, 25000], requirement: "car_speed_100" },
  { name: "Снос здания", basePay: [15000, 35000], requirement: "weapon_heavy" },
  { name: "Рейд на склад", basePay: [20000, 50000], requirement: "level_20" },
];

const COSMETICS = {
  title_og: { name: "Титул: OG", type: "title", price: 25_000, value: "OG" },
  title_boss: { name: "Титул: Босс", type: "title", price: 50_000, value: "Босс" },
  title_legend: { name: "Титул: Легенда", type: "title", price: 100_000, value: "Легенда" },
  title_king: { name: "Титул: Король SA", type: "title", price: 250_000, value: "Король SA" },
  color_gold: { name: "Цвет: Золотой", type: "color", price: 30_000, value: "0xf1c40f" },
  color_red: { name: "Цвет: Красный", type: "color", price: 30_000, value: "0xe74c3c" },
  color_purple: { name: "Цвет: Фиолетовый", type: "color", price: 30_000, value: "0x9b59b6" },
  color_green: { name: "Цвет: Зелёный", type: "color", price: 30_000, value: "0x2ecc71" },
};

const BLACK_MARKET_ITEMS = [
  { name: "Золотой Desert Eagle", type: "weapon_skin", basePrice: [40_000, 80_000] },
  { name: "Бронежилет", type: "armor", basePrice: [10_000, 25_000] },
  { name: "Секретная карта", type: "map", basePrice: [5_000, 15_000] },
  { name: "Нитро (x3)", type: "nos_boost", basePrice: [8_000, 20_000] },
  { name: "Фальшивые документы", type: "jail_pass", basePrice: [15_000, 40_000] },
  { name: "Аптечка", type: "medkit", basePrice: [3_000, 10_000] },
];

// ═══════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════

async function ensureSampExtendedTables(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_properties (
    user_id TEXT NOT NULL, property_id TEXT NOT NULL,
    bought_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_collected TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, property_id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_car_upgrades (
    user_id TEXT NOT NULL, car_id TEXT NOT NULL, upgrade_id TEXT NOT NULL,
    PRIMARY KEY (user_id, car_id, upgrade_id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_bounties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_user_id TEXT NOT NULL, placed_by TEXT NOT NULL,
    amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  try { await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_bounties_target ON samp_bounties(target_user_id, status)`); } catch (_) {}

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_gangs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, tag TEXT NOT NULL, leader_id TEXT NOT NULL,
    treasury INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_gang_members (
    gang_id INTEGER NOT NULL, user_id TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (gang_id) REFERENCES samp_gangs(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_cosmetics (
    user_id TEXT NOT NULL, cosmetic_type TEXT NOT NULL, cosmetic_value TEXT NOT NULL,
    PRIMARY KEY (user_id, cosmetic_type)
  )`);

  try { await dbRun(db, `ALTER TABLE samp_inventory ADD COLUMN durability INTEGER NOT NULL DEFAULT 100`); } catch (_) {}

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_lottery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL, user_id TEXT NOT NULL, tickets INTEGER NOT NULL DEFAULT 1
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_lottery_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL, winner_id TEXT, pot INTEGER NOT NULL DEFAULT 0,
    drawn_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getWeekStart() {
  const d = new Date(); const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toISOString().split("T")[0];
}

function getDailySeed() {
  const d = new Date().toISOString().split("T")[0];
  let h = 0; for (let i = 0; i < d.length; i++) h = ((h << 5) - h + d.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function getDailyJobs() {
  const rng = seededRandom(getDailySeed());
  const shuffled = [...JOB_TEMPLATES].sort(() => rng() - 0.5);
  return shuffled.slice(0, 3);
}

function getDailyBlackMarketDeals() {
  const rng = seededRandom(getDailySeed() + 42);
  const shuffled = [...BLACK_MARKET_ITEMS].sort(() => rng() - 0.5);
  return shuffled.slice(0, 3).map((item, i) => {
    const price = Math.floor(item.basePrice[0] + rng() * (item.basePrice[1] - item.basePrice[0]));
    return { ...item, price, slot: i + 1 };
  });
}

async function getSampUser(db, uid) {
  return dbGet(db, "SELECT * FROM samp_users WHERE user_id = ?", [String(uid)]);
}

async function adjustMoney(db, uid, delta) {
  await dbRun(db, `UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`, [Number(delta), String(uid)]);
}

async function addLedger(db, type, from, to, amount, meta = {}) {
  await dbRun(db, `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json) VALUES(?, ?, ?, ?, ?)`,
    [type, from ? String(from) : null, to ? String(to) : null, Number(amount), JSON.stringify(meta)]);
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

// --- Properties ---
async function handleBusinesses(interaction, db) {
  const userId = interaction.user.id;
  const owned = await dbAll(db, "SELECT property_id FROM samp_properties WHERE user_id = ?", [userId]);
  const ownedSet = new Set((owned || []).map(r => r.property_id));

  const embed = new EmbedBuilder().setTitle("🏢 Бизнесы San Andreas").setColor(0x2ecc71).setTimestamp();
  for (const [id, p] of Object.entries(PROPERTIES)) {
    const status = ownedSet.has(id) ? "✅ Куплен" : `${fmtMoney(p.price)}`;
    embed.addFields({ name: `${p.name} (${id})`, value: `Цена: ${status} | Доход: ${fmtMoney(p.income)}/час`, inline: true });
  }
  embed.setFooter({ text: "Покупка: /buybiz id:<business>" });
  await interaction.reply({ embeds: [embed] });
}

async function handleBuyBiz(interaction, db) {
  const userId = interaction.user.id;
  const bizId = String(interaction.options.getString("id", true)).toLowerCase();
  const prop = PROPERTIES[bizId];
  if (!prop) { await interaction.reply({ content: "Такого бизнеса нет.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true }); return; }

  const existing = await dbGet(db, "SELECT 1 FROM samp_properties WHERE user_id = ? AND property_id = ?", [userId, bizId]);
  if (existing) { await interaction.reply({ content: "У тебя уже есть этот бизнес.", ephemeral: true }); return; }
  if (Number(user.money) < prop.price) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }

  await withTx(db, async () => {
    await adjustMoney(db, userId, -prop.price);
    await dbRun(db, `INSERT INTO samp_properties(user_id, property_id) VALUES(?, ?)`, [userId, bizId]);
    await addLedger(db, "buy_property", userId, null, prop.price, { property_id: bizId });
  });

  const after = await getSampUser(db, userId);
  await interaction.reply(`🏢 Ты купил **${prop.name}** за **${fmtMoney(prop.price)}**!\nДоход: **${fmtMoney(prop.income)}/час**\nБаланс: **${fmtMoney(after.money)}**`);
}

async function handleCollectIncome(interaction, db) {
  const userId = interaction.user.id;
  const props = await dbAll(db, "SELECT property_id, last_collected FROM samp_properties WHERE user_id = ?", [userId]);
  if (!props || props.length === 0) { await interaction.reply({ content: "У тебя нет бизнесов. Смотри /businesses.", ephemeral: true }); return; }

  await interaction.deferReply();
  let totalIncome = 0;
  const now = new Date();

  for (const row of props) {
    const prop = PROPERTIES[row.property_id];
    if (!prop) continue;
    const lastCollected = new Date(row.last_collected);
    const hoursElapsed = Math.min(24, (now - lastCollected) / 3600000);
    if (hoursElapsed < 0.1) continue;
    const income = Math.floor(prop.income * hoursElapsed);
    totalIncome += income;
    await dbRun(db, `UPDATE samp_properties SET last_collected = datetime('now') WHERE user_id = ? AND property_id = ?`, [userId, row.property_id]);
  }

  if (totalIncome <= 0) { await interaction.editReply("⏳ Ещё рано. Подожди хотя бы несколько минут."); return; }
  await adjustMoney(db, userId, totalIncome);
  await addLedger(db, "property_income", null, userId, totalIncome, {});
  const after = await getSampUser(db, userId);
  await interaction.editReply(`💰 Собрал доход с бизнесов: **+${fmtMoney(totalIncome)}**\nБаланс: **${fmtMoney(after.money)}**`);
}

// --- Car Tuning ---
async function handleTuneCar(interaction, db) {
  const userId = interaction.user.id;
  const carId = String(interaction.options.getString("car", true)).toLowerCase();
  const upgradeId = String(interaction.options.getString("upgrade", true)).toLowerCase();
  const car = CARS[carId]; const upgrade = CAR_UPGRADES[upgradeId];
  if (!car) { await interaction.reply({ content: "Такой тачки нет.", ephemeral: true }); return; }
  if (!upgrade) { await interaction.reply({ content: "Такого тюнинга нет.", ephemeral: true }); return; }

  const owned = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", [userId, carId]);
  if (!owned) { await interaction.reply({ content: "У тебя нет этой тачки.", ephemeral: true }); return; }

  const alreadyTuned = await dbGet(db, "SELECT 1 FROM samp_car_upgrades WHERE user_id = ? AND car_id = ? AND upgrade_id = ?", [userId, carId, upgradeId]);
  if (alreadyTuned) { await interaction.reply({ content: "Этот тюнинг уже установлен.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user || Number(user.money) < upgrade.price) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }

  await withTx(db, async () => {
    await adjustMoney(db, userId, -upgrade.price);
    await dbRun(db, `INSERT INTO samp_car_upgrades(user_id, car_id, upgrade_id) VALUES(?, ?, ?)`, [userId, carId, upgradeId]);
    await addLedger(db, "car_tune", userId, null, upgrade.price, { car_id: carId, upgrade_id: upgradeId });
  });

  const after = await getSampUser(db, userId);
  await interaction.reply(`🔧 Установлен **${upgrade.name}** на **${car.name}** (+${upgrade.speedBonus} скорость)!\nЦена: **${fmtMoney(upgrade.price)}** | Баланс: **${fmtMoney(after.money)}**`);
}

async function handleGarage(interaction, db) {
  const userId = interaction.user.id;
  const cars = await dbAll(db, "SELECT car_id FROM samp_garage WHERE user_id = ?", [userId]);
  if (!cars || cars.length === 0) { await interaction.reply({ content: "Твой гараж пуст.", ephemeral: true }); return; }

  const embed = new EmbedBuilder().setTitle("🏎️ Твой гараж").setColor(0x3498db).setTimestamp();
  for (const row of cars) {
    const car = CARS[row.car_id];
    if (!car) continue;
    const upgrades = await dbAll(db, "SELECT upgrade_id FROM samp_car_upgrades WHERE user_id = ? AND car_id = ?", [userId, row.car_id]);
    const speedBonus = (upgrades || []).reduce((s, u) => s + (CAR_UPGRADES[u.upgrade_id]?.speedBonus || 0), 0);
    const upgradeNames = (upgrades || []).map(u => CAR_UPGRADES[u.upgrade_id]?.name || u.upgrade_id).join(", ") || "—";
    embed.addFields({ name: `${car.name}`, value: `Скорость: **${car.speed + speedBonus}** (${speedBonus > 0 ? `+${speedBonus}` : "без тюнинга"})\nТюнинг: ${upgradeNames}`, inline: true });
  }
  await interaction.reply({ embeds: [embed] });
}

// --- Bounty ---
async function handleBounty(interaction, db) {
  const userId = interaction.user.id;
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  if (target.bot || target.id === userId) { await interaction.reply({ content: "Некорректная цель.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user || Number(user.money) < amount) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }

  await withTx(db, async () => {
    await adjustMoney(db, userId, -amount);
    await dbRun(db, `INSERT INTO samp_bounties(target_user_id, placed_by, amount) VALUES(?, ?, ?)`, [target.id, userId, amount]);
    await addLedger(db, "bounty_place", userId, null, amount, { target: target.id });
  });

  await interaction.reply(`🎯 Награда **${fmtMoney(amount)}** за голову <@${target.id}>!\nКто победит в дуэли — заберёт всё.`);
}

async function handleBountyList(interaction, db) {
  const bounties = await dbAll(db, "SELECT target_user_id, SUM(amount) as total FROM samp_bounties WHERE status = 'active' GROUP BY target_user_id ORDER BY total DESC LIMIT 10", []);
  if (!bounties || bounties.length === 0) { await interaction.reply("Нет активных наград. Стало скучно? /bounty!"); return; }

  const lines = bounties.map((b, i) => `\`${i+1}.\` <@${b.target_user_id}> — **${fmtMoney(b.total)}**`);
  const embed = new EmbedBuilder().setTitle("🎯 Разыскиваются").setDescription(lines.join("\n")).setColor(0xe74c3c).setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

async function checkAndCollectBounty(db, winnerId, loserId) {
  const bounties = await dbAll(db, "SELECT id, amount FROM samp_bounties WHERE target_user_id = ? AND status = 'active'", [loserId]);
  if (!bounties || bounties.length === 0) return 0;
  let total = 0;
  for (const b of bounties) {
    total += b.amount;
    await dbRun(db, "UPDATE samp_bounties SET status = 'collected' WHERE id = ?", [b.id]);
  }
  if (total > 0) {
    await adjustMoney(db, winnerId, total);
    await addLedger(db, "bounty_collect", null, winnerId, total, { target: loserId });
  }
  return total;
}

// --- Heists ---
async function handleHeist(interaction, db) {
  const userId = interaction.user.id;
  const tierKey = interaction.options.getString("tier", true);
  const tier = HEIST_TIERS[tierKey];
  if (!tier) { await interaction.reply({ content: "Неизвестный тип ограбления.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  if (Number(user.jail_until || 0) > nowMs()) { await interaction.reply({ content: "Ты в тюрьме!", ephemeral: true }); return; }

  const participants = new Set([userId]);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("heist_join").setLabel(`Присоединиться (${participants.size}/${tier.maxPlayers})`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("heist_start").setLabel("Начать!").setStyle(ButtonStyle.Primary)
  );

  const embed = new EmbedBuilder()
    .setTitle(`🏦 Ограбление: ${tier.name}`)
    .setDescription(`Организатор: <@${userId}>\nНужно: **${tier.minPlayers}-${tier.maxPlayers}** игроков\nВыплата: **${fmtMoney(tier.payout[0])} — ${fmtMoney(tier.payout[1])}**\nРиск: **${Math.round(tier.failChance * 100)}%**\n\nУчастники: <@${userId}>`)
    .setColor(0x9b59b6).setFooter({ text: "60 секунд на сбор команды" });

  const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

  collector.on("collect", async (btnInt) => {
    if (btnInt.customId === "heist_join") {
      if (participants.has(btnInt.user.id)) { await btnInt.reply({ content: "Ты уже в команде.", ephemeral: true }); return; }
      if (participants.size >= tier.maxPlayers) { await btnInt.reply({ content: "Команда полная.", ephemeral: true }); return; }
      const joinUser = await getSampUser(db, btnInt.user.id);
      if (!joinUser) { await btnInt.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
      participants.add(btnInt.user.id);
      const updRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("heist_join").setLabel(`Присоединиться (${participants.size}/${tier.maxPlayers})`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("heist_start").setLabel("Начать!").setStyle(ButtonStyle.Primary)
      );
      embed.setDescription(`Организатор: <@${userId}>\nНужно: **${tier.minPlayers}-${tier.maxPlayers}** игроков\n\nУчастники: ${[...participants].map(p => `<@${p}>`).join(", ")}`);
      await btnInt.update({ embeds: [embed], components: [updRow] });
    } else if (btnInt.customId === "heist_start") {
      if (btnInt.user.id !== userId) { await btnInt.reply({ content: "Только организатор может начать.", ephemeral: true }); return; }
      if (participants.size < tier.minPlayers) { await btnInt.reply({ content: `Нужно минимум ${tier.minPlayers} игроков.`, ephemeral: true }); return; }
      collector.stop("started");

      const failed = Math.random() < tier.failChance;
      if (failed) {
        for (const pid of participants) {
          try {
            await dbRun(db, `UPDATE samp_users SET jail_until = ? WHERE user_id = ?`, [nowMs() + tier.jailMs, pid]);
          } catch (_) {}
        }
        const jailMin = Math.ceil(tier.jailMs / 60_000);
        const failEmbed = new EmbedBuilder().setTitle(`🚔 Провал: ${tier.name}`).setDescription(`Полиция перехватила команду!\nВсе участники в тюрьме на **${jailMin} мин**.`).setColor(0xe74c3c);
        await btnInt.update({ embeds: [failEmbed], components: [] });
      } else {
        const totalPayout = randInt(tier.payout[0], tier.payout[1]);
        const share = Math.floor(totalPayout / participants.size);
        for (const pid of participants) {
          try {
            await adjustMoney(db, pid, share);
            await addLedger(db, "heist", null, pid, share, { tier: tierKey });
          } catch (_) {}
        }
        const winEmbed = new EmbedBuilder().setTitle(`🎉 Успех: ${tier.name}`).setDescription(`Команда взяла **${fmtMoney(totalPayout)}**!\nКаждый получил: **${fmtMoney(share)}**`).setColor(0x2ecc71);
        await btnInt.update({ embeds: [winEmbed], components: [] });
      }
    }
  });

  collector.on("end", (_, reason) => {
    if (reason !== "started") {
      const timeoutEmbed = new EmbedBuilder().setTitle(`⏱️ Время вышло`).setDescription("Не удалось собрать команду.").setColor(0x95a5a6);
      interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
    }
  });
}

// --- Jobs ---
async function handleJobs(interaction, db) {
  const jobs = getDailyJobs();
  const embed = new EmbedBuilder().setTitle("📋 Доска объявлений").setDescription("Сегодняшние задания:").setColor(0xf39c12).setTimestamp();
  jobs.forEach((job, i) => {
    const req = job.requirement ? `Требование: ${job.requirement}` : "Без требований";
    embed.addFields({ name: `${i+1}. ${job.name}`, value: `Оплата: **${fmtMoney(job.basePay[0])} — ${fmtMoney(job.basePay[1])}**\n${req}`, inline: false });
  });
  embed.setFooter({ text: "Выполнить: /dojob number:<номер>" });
  await interaction.reply({ embeds: [embed] });
}

async function handleDoJob(interaction, db) {
  const userId = interaction.user.id;
  const jobNum = interaction.options.getInteger("number", true);
  if (jobNum < 1 || jobNum > 3) { await interaction.reply({ content: "Номер задания: 1, 2 или 3.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  if (Number(user.jail_until || 0) > nowMs()) { await interaction.reply({ content: "Ты в тюрьме!", ephemeral: true }); return; }

  // Cooldown check
  const cd = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = 'job'", [userId]);
  if (cd && Number(cd.ready_at) > nowMs()) {
    const left = Math.ceil((Number(cd.ready_at) - nowMs()) / 60000);
    await interaction.reply({ content: `⏳ Следующее задание через **${left} мин**.`, ephemeral: true }); return;
  }

  await interaction.deferReply();
  const jobs = getDailyJobs();
  const job = jobs[jobNum - 1];
  if (!job) { await interaction.editReply("Задание не найдено."); return; }

  // Check requirements
  if (job.requirement) {
    if (job.requirement.startsWith("car_speed_")) {
      const needed = parseInt(job.requirement.split("_")[2]);
      const car = CARS[user.car_id];
      const upgrades = await dbAll(db, "SELECT upgrade_id FROM samp_car_upgrades WHERE user_id = ? AND car_id = ?", [userId, user.car_id]);
      const bonus = (upgrades || []).reduce((s, u) => s + (CAR_UPGRADES[u.upgrade_id]?.speedBonus || 0), 0);
      if ((car?.speed || 0) + bonus < needed) { await interaction.editReply(`Нужна тачка со скоростью ${needed}+. Твоя: ${(car?.speed || 0) + bonus}`); return; }
    } else if (job.requirement === "weapon") {
      const wRow = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'weapon'", [userId]);
      if (!wRow?.value) { await interaction.editReply("Нужно оружие. Купи в /weaponshop."); return; }
    } else if (job.requirement === "weapon_dmg_20") {
      const wRow = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'weapon'", [userId]);
      const w = wRow?.value ? ITEMS[wRow.value] : null;
      if (!w || w.dmg[0] < 20) { await interaction.editReply("Нужно оружие с уроном 20+."); return; }
    } else if (job.requirement === "weapon_heavy") {
      const wRow = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'weapon'", [userId]);
      const w = wRow?.value ? ITEMS[wRow.value] : null;
      if (!w || w.dmg[0] < 30) { await interaction.editReply("Нужно тяжёлое оружие (урон 30+)."); return; }
    } else if (job.requirement === "level_20") {
      const lvl = await dbGet(db, "SELECT level FROM user_levels WHERE guild_id = ? AND user_id = ?", [interaction.guild?.id, userId]);
      if (!lvl || lvl.level < 20) { await interaction.editReply("Нужен 20+ уровень."); return; }
    }
  }

  const pay = randInt(job.basePay[0], job.basePay[1]);
  await adjustMoney(db, userId, pay);
  await addLedger(db, "job", null, userId, pay, { job: job.name });
  await dbRun(db, `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, 'job', ?)
    ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`, [userId, nowMs() + 30 * 60_000]);

  const after = await getSampUser(db, userId);
  await interaction.editReply(`✅ Задание «${job.name}» выполнено!\nОплата: **+${fmtMoney(pay)}** | Баланс: **${fmtMoney(after.money)}**`);
}

// --- Gangs ---
async function handleGangCommand(interaction, db) {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") {
    const userId = interaction.user.id;
    const name = interaction.options.getString("name", true).trim();
    const tag = interaction.options.getString("tag", true).trim().toUpperCase();
    if (tag.length > 4) { await interaction.reply({ content: "Тег максимум 4 символа.", ephemeral: true }); return; }
    const user = await getSampUser(db, userId);
    if (!user || Number(user.money) < 50_000) { await interaction.reply({ content: "Создание банды стоит 50,000$.", ephemeral: true }); return; }
    const existing = await dbGet(db, "SELECT 1 FROM samp_gang_members WHERE user_id = ?", [userId]);
    if (existing) { await interaction.reply({ content: "Ты уже в банде. Сначала /gang leave.", ephemeral: true }); return; }

    await withTx(db, async () => {
      await adjustMoney(db, userId, -50_000);
      await dbRun(db, "INSERT INTO samp_gangs(name, tag, leader_id) VALUES(?, ?, ?)", [name, tag, userId]);
      const gang = await dbGet(db, "SELECT id FROM samp_gangs WHERE leader_id = ? ORDER BY id DESC LIMIT 1", [userId]);
      await dbRun(db, "INSERT INTO samp_gang_members(gang_id, user_id, role) VALUES(?, ?, 'leader')", [gang.id, userId]);
      await addLedger(db, "gang_create", userId, null, 50_000, { name, tag });
    });
    await interaction.reply(`🔫 Банда **[${tag}] ${name}** создана! Стоимость: **${fmtMoney(50_000)}**`);

  } else if (sub === "invite") {
    const userId = interaction.user.id;
    const target = interaction.options.getUser("user", true);
    const member = await dbGet(db, "SELECT gm.gang_id, gm.role, g.name, g.tag FROM samp_gang_members gm JOIN samp_gangs g ON g.id = gm.gang_id WHERE gm.user_id = ?", [userId]);
    if (!member || member.role !== "leader") { await interaction.reply({ content: "Только лидер банды может приглашать.", ephemeral: true }); return; }
    const targetInGang = await dbGet(db, "SELECT 1 FROM samp_gang_members WHERE user_id = ?", [target.id]);
    if (targetInGang) { await interaction.reply({ content: "Этот игрок уже в банде.", ephemeral: true }); return; }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gang_accept_${member.gang_id}`).setLabel("Принять").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("gang_decline").setLabel("Отклонить").setStyle(ButtonStyle.Danger)
    );
    const reply = await interaction.reply({ content: `<@${target.id}>, тебя приглашают в банду **[${member.tag}] ${member.name}**!`, components: [row], fetchReply: true });

    try {
      const btn = await reply.awaitMessageComponent({ filter: i => i.user.id === target.id, time: 60_000 });
      if (btn.customId.startsWith("gang_accept")) {
        await dbRun(db, "INSERT OR IGNORE INTO samp_gang_members(gang_id, user_id) VALUES(?, ?)", [member.gang_id, target.id]);
        await btn.update({ content: `✅ <@${target.id}> вступил в **[${member.tag}] ${member.name}**!`, components: [] });
      } else {
        await btn.update({ content: `❌ <@${target.id}> отклонил приглашение.`, components: [] });
      }
    } catch { await interaction.editReply({ content: "⏱️ Время истекло.", components: [] }); }

  } else if (sub === "leave") {
    const userId = interaction.user.id;
    const member = await dbGet(db, "SELECT gm.gang_id, gm.role FROM samp_gang_members gm WHERE gm.user_id = ?", [userId]);
    if (!member) { await interaction.reply({ content: "Ты не в банде.", ephemeral: true }); return; }
    if (member.role === "leader") {
      const count = await dbGet(db, "SELECT COUNT(*) as c FROM samp_gang_members WHERE gang_id = ?", [member.gang_id]);
      if (count.c > 1) { await interaction.reply({ content: "Лидер не может покинуть банду пока есть участники. Передай лидерство или распусти банду.", ephemeral: true }); return; }
      await dbRun(db, "DELETE FROM samp_gang_members WHERE gang_id = ?", [member.gang_id]);
      await dbRun(db, "DELETE FROM samp_gangs WHERE id = ?", [member.gang_id]);
      await interaction.reply("🔫 Банда распущена."); return;
    }
    await dbRun(db, "DELETE FROM samp_gang_members WHERE user_id = ?", [userId]);
    await interaction.reply("Ты покинул банду.");

  } else if (sub === "deposit") {
    const userId = interaction.user.id;
    const amount = interaction.options.getInteger("amount", true);
    const member = await dbGet(db, "SELECT gang_id FROM samp_gang_members WHERE user_id = ?", [userId]);
    if (!member) { await interaction.reply({ content: "Ты не в банде.", ephemeral: true }); return; }
    const user = await getSampUser(db, userId);
    if (!user || Number(user.money) < amount) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }
    await withTx(db, async () => {
      await adjustMoney(db, userId, -amount);
      await dbRun(db, "UPDATE samp_gangs SET treasury = treasury + ? WHERE id = ?", [amount, member.gang_id]);
      await addLedger(db, "gang_deposit", userId, null, amount, { gang_id: member.gang_id });
    });
    await interaction.reply(`💰 Внесено **${fmtMoney(amount)}** в казну банды.`);

  } else if (sub === "info") {
    const userId = interaction.user.id;
    const member = await dbGet(db, "SELECT gang_id FROM samp_gang_members WHERE user_id = ?", [userId]);
    if (!member) { await interaction.reply({ content: "Ты не в банде.", ephemeral: true }); return; }
    const gang = await dbGet(db, "SELECT * FROM samp_gangs WHERE id = ?", [member.gang_id]);
    const members = await dbAll(db, "SELECT user_id, role FROM samp_gang_members WHERE gang_id = ?", [member.gang_id]);
    const memberList = (members || []).map(m => `<@${m.user_id}> (${m.role})`).join("\n");
    const embed = new EmbedBuilder()
      .setTitle(`[${gang.tag}] ${gang.name}`)
      .addFields(
        { name: "Лидер", value: `<@${gang.leader_id}>`, inline: true },
        { name: "Казна", value: fmtMoney(gang.treasury), inline: true },
        { name: `Участники (${members.length})`, value: memberList || "—" }
      ).setColor(0x2ecc71).setTimestamp();
    await interaction.reply({ embeds: [embed] });

  } else if (sub === "top") {
    const gangs = await dbAll(db, "SELECT g.*, COUNT(gm.user_id) as members FROM samp_gangs g JOIN samp_gang_members gm ON gm.gang_id = g.id GROUP BY g.id ORDER BY g.treasury DESC LIMIT 10", []);
    if (!gangs || gangs.length === 0) { await interaction.reply("Пока нет банд."); return; }
    const lines = gangs.map((g, i) => `\`${i+1}.\` **[${g.tag}] ${g.name}** — ${fmtMoney(g.treasury)} (${g.members} чел.)`);
    const embed = new EmbedBuilder().setTitle("🔫 Топ банд San Andreas").setDescription(lines.join("\n")).setColor(0xe74c3c).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
}

// --- Cosmetics ---
async function handleShopCosmetics(interaction) {
  const embed = new EmbedBuilder().setTitle("🎨 Магазин косметики").setColor(0x9b59b6).setTimestamp();
  for (const [id, c] of Object.entries(COSMETICS)) {
    embed.addFields({ name: `${c.name} (${id})`, value: `Тип: ${c.type} | Цена: **${fmtMoney(c.price)}**`, inline: true });
  }
  embed.setFooter({ text: "Покупка: /buycosmetic id:<id>" });
  await interaction.reply({ embeds: [embed] });
}

async function handleBuyCosmetic(interaction, db) {
  const userId = interaction.user.id;
  const cosId = String(interaction.options.getString("id", true)).toLowerCase();
  const cos = COSMETICS[cosId];
  if (!cos) { await interaction.reply({ content: "Нет такого товара.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user || Number(user.money) < cos.price) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }

  const existing = await dbGet(db, "SELECT 1 FROM samp_cosmetics WHERE user_id = ? AND cosmetic_type = ? AND cosmetic_value = ?", [userId, cos.type, cos.value]);
  if (existing) { await interaction.reply({ content: "У тебя уже есть этот предмет.", ephemeral: true }); return; }

  await withTx(db, async () => {
    await adjustMoney(db, userId, -cos.price);
    await dbRun(db, `INSERT OR REPLACE INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, [userId, cos.type, cos.value]);
    await addLedger(db, "buy_cosmetic", userId, null, cos.price, { cosmetic_id: cosId });
  });
  await interaction.reply(`🎨 Ты купил **${cos.name}** за **${fmtMoney(cos.price)}**!`);
}

// --- Weapon Durability ---
async function degradeWeapon(db, userId, weaponId) {
  const loss = randInt(5, 10);
  await dbRun(db, `UPDATE samp_inventory SET durability = MAX(0, durability - ?) WHERE user_id = ? AND item_id = ?`, [loss, userId, weaponId]);
  const row = await dbGet(db, "SELECT durability FROM samp_inventory WHERE user_id = ? AND item_id = ?", [userId, weaponId]);
  return row?.durability ?? 0;
}

async function handleRepair(interaction, db) {
  const userId = interaction.user.id;
  const wRow = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'weapon'", [userId]);
  if (!wRow?.value) { await interaction.reply({ content: "У тебя нет активного оружия.", ephemeral: true }); return; }
  const weapon = ITEMS[wRow.value];
  if (!weapon) { await interaction.reply({ content: "Оружие не найдено.", ephemeral: true }); return; }

  const inv = await dbGet(db, "SELECT durability FROM samp_inventory WHERE user_id = ? AND item_id = ?", [userId, wRow.value]);
  if (!inv) { await interaction.reply({ content: "Оружие не в инвентаре.", ephemeral: true }); return; }
  if (inv.durability >= 100) { await interaction.reply({ content: "Оружие в идеальном состоянии.", ephemeral: true }); return; }

  const cost = Math.floor(weapon.price * 0.2);
  const user = await getSampUser(db, userId);
  if (!user || Number(user.money) < cost) { await interaction.reply({ content: `Ремонт стоит **${fmtMoney(cost)}**. Не хватает.`, ephemeral: true }); return; }

  await withTx(db, async () => {
    await adjustMoney(db, userId, -cost);
    await dbRun(db, "UPDATE samp_inventory SET durability = 100 WHERE user_id = ? AND item_id = ?", [userId, wRow.value]);
    await addLedger(db, "repair", userId, null, cost, { weapon: wRow.value });
  });
  await interaction.reply(`🔧 **${weapon.name}** починен! Стоимость: **${fmtMoney(cost)}**`);
}

// --- Lottery ---
async function handleLottery(interaction, db) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const week = getWeekStart();

  if (sub === "buy") {
    const count = interaction.options.getInteger("count") || 1;
    const qty = clampInt(count, 1, 10);
    if (!qty) { await interaction.reply({ content: "От 1 до 10 билетов.", ephemeral: true }); return; }

    const existing = await dbGet(db, "SELECT SUM(tickets) as t FROM samp_lottery WHERE week_start = ? AND user_id = ?", [week, userId]);
    const have = existing?.t || 0;
    if (have + qty > 10) { await interaction.reply({ content: `Лимит 10 билетов/неделю. У тебя уже ${have}.`, ephemeral: true }); return; }

    const cost = qty * 1000;
    const user = await getSampUser(db, userId);
    if (!user || Number(user.money) < cost) { await interaction.reply({ content: `Нужно **${fmtMoney(cost)}**.`, ephemeral: true }); return; }

    await withTx(db, async () => {
      await adjustMoney(db, userId, -cost);
      await dbRun(db, `INSERT INTO samp_lottery(week_start, user_id, tickets) VALUES(?, ?, ?)`, [week, userId, qty]);
      await addLedger(db, "lottery_buy", userId, null, cost, { tickets: qty });
    });
    await interaction.reply(`🎫 Куплено **${qty}** билетов за **${fmtMoney(cost)}**! Удачи!`);

  } else if (sub === "info") {
    const pot = await dbGet(db, "SELECT SUM(tickets) * 1000 as total FROM samp_lottery WHERE week_start = ?", [week]);
    const mine = await dbGet(db, "SELECT SUM(tickets) as t FROM samp_lottery WHERE week_start = ? AND user_id = ?", [week, userId]);
    const totalTickets = await dbGet(db, "SELECT SUM(tickets) as t FROM samp_lottery WHERE week_start = ?", [week]);
    const embed = new EmbedBuilder()
      .setTitle("🎰 Лотерея San Andreas")
      .addFields(
        { name: "Джекпот", value: fmtMoney(pot?.total || 0), inline: true },
        { name: "Твои билеты", value: `${mine?.t || 0}/10`, inline: true },
        { name: "Всего билетов", value: `${totalTickets?.t || 0}`, inline: true }
      ).setColor(0xf1c40f).setFooter({ text: "Розыгрыш каждый понедельник" }).setTimestamp();
    await interaction.reply({ embeds: [embed] });
  }
}

async function drawLottery(db) {
  const week = getWeekStart();
  const already = await dbGet(db, "SELECT 1 FROM samp_lottery_history WHERE week_start = ?", [week]);
  if (already) return null;

  const allTickets = await dbAll(db, "SELECT user_id, tickets FROM samp_lottery WHERE week_start = ?", [week]);
  if (!allTickets || allTickets.length === 0) return null;

  const pool = [];
  let pot = 0;
  for (const row of allTickets) { for (let i = 0; i < row.tickets; i++) pool.push(row.user_id); pot += row.tickets * 1000; }

  const houseCut = Math.floor(pot * 0.1);
  const winnings = pot - houseCut;
  const winner = pick(pool);

  await adjustMoney(db, winner, winnings);
  await addLedger(db, "lottery_win", null, winner, winnings, { week, pot });
  await dbRun(db, "INSERT INTO samp_lottery_history(week_start, winner_id, pot) VALUES(?, ?, ?)", [week, winner, pot]);
  return { winner, winnings, pot };
}

// --- Black Market ---
async function handleBlackMarket(interaction, db) {
  const sub = interaction.options.getSubcommand?.() || "browse";

  if (sub === "browse" || !interaction.options.getSubcommand) {
    const deals = getDailyBlackMarketDeals();
    const embed = new EmbedBuilder().setTitle("🕶️ Чёрный рынок").setDescription("Сегодняшние предложения:").setColor(0x2c3e50).setTimestamp();
    deals.forEach((d, i) => {
      embed.addFields({ name: `#${i+1} ${d.name}`, value: `Цена: **${fmtMoney(d.price)}**\nТип: ${d.type}`, inline: true });
    });
    embed.setFooter({ text: "Покупка: /blackmarket buy slot:<номер>" });
    await interaction.reply({ embeds: [embed] });

  } else if (sub === "buy") {
    const userId = interaction.user.id;
    const slot = interaction.options.getInteger("slot", true);
    const deals = getDailyBlackMarketDeals();
    const deal = deals[slot - 1];
    if (!deal) { await interaction.reply({ content: "Слот 1-3.", ephemeral: true }); return; }

    const user = await getSampUser(db, userId);
    if (!user || Number(user.money) < deal.price) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }

    await withTx(db, async () => {
      await adjustMoney(db, userId, -deal.price);
      await addLedger(db, "black_market", userId, null, deal.price, { item: deal.name, type: deal.type });
    });
    await interaction.reply(`🕶️ Куплено: **${deal.name}** за **${fmtMoney(deal.price)}**!`);
  }
}

// ═══════════════════════════════════════════════════════════════
// SLASH COMMAND BUILDERS
// ═══════════════════════════════════════════════════════════════

function getSampExtendedCommandBuilders() {
  return [
    new SlashCommandBuilder().setName("businesses").setDescription("SAMP Life: список бизнесов"),
    new SlashCommandBuilder().setName("buybiz").setDescription("SAMP Life: купить бизнес")
      .addStringOption(o => o.setName("id").setDescription("ID бизнеса").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("collectincome").setDescription("SAMP Life: собрать доход с бизнесов"),

    new SlashCommandBuilder().setName("tunecar").setDescription("SAMP Life: тюнинг тачки")
      .addStringOption(o => o.setName("car").setDescription("ID тачки").setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName("upgrade").setDescription("ID тюнинга").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("garage").setDescription("SAMP Life: твой гараж (тачки + тюнинг)"),

    new SlashCommandBuilder().setName("bounty").setDescription("SAMP Life: назначить награду")
      .addUserOption(o => o.setName("user").setDescription("Цель").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Сумма").setRequired(true).setMinValue(1000)),
    new SlashCommandBuilder().setName("bountylist").setDescription("SAMP Life: список разыскиваемых"),

    new SlashCommandBuilder().setName("heist").setDescription("SAMP Life: ограбление (кооп)")
      .addStringOption(o => o.setName("tier").setDescription("Цель").setRequired(true).addChoices(
        { name: "24/7 (2-3 чел.)", value: "store" },
        { name: "Банк (2-4 чел.)", value: "bank" },
        { name: "Казино (3-4 чел.)", value: "casino_heist" },
        { name: "Area 69 (4 чел.)", value: "military" }
      )),

    new SlashCommandBuilder().setName("jobs").setDescription("SAMP Life: доска объявлений (ежедневные задания)"),
    new SlashCommandBuilder().setName("dojob").setDescription("SAMP Life: выполнить задание")
      .addIntegerOption(o => o.setName("number").setDescription("Номер задания (1-3)").setRequired(true).setMinValue(1).setMaxValue(3)),

    new SlashCommandBuilder().setName("gang").setDescription("SAMP Life: банды")
      .addSubcommand(s => s.setName("create").setDescription("Создать банду ($50,000)")
        .addStringOption(o => o.setName("name").setDescription("Название").setRequired(true))
        .addStringOption(o => o.setName("tag").setDescription("Тег (макс 4 символа)").setRequired(true)))
      .addSubcommand(s => s.setName("invite").setDescription("Пригласить в банду")
        .addUserOption(o => o.setName("user").setDescription("Кого").setRequired(true)))
      .addSubcommand(s => s.setName("leave").setDescription("Покинуть банду"))
      .addSubcommand(s => s.setName("deposit").setDescription("Пополнить казну")
        .addIntegerOption(o => o.setName("amount").setDescription("Сумма").setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName("info").setDescription("Инфо о банде"))
      .addSubcommand(s => s.setName("top").setDescription("Топ банд")),

    new SlashCommandBuilder().setName("shopcosmetics").setDescription("SAMP Life: магазин косметики"),
    new SlashCommandBuilder().setName("buycosmetic").setDescription("SAMP Life: купить косметику")
      .addStringOption(o => o.setName("id").setDescription("ID товара").setRequired(true).setAutocomplete(true)),

    new SlashCommandBuilder().setName("repair").setDescription("SAMP Life: починить оружие"),

    new SlashCommandBuilder().setName("lottery").setDescription("SAMP Life: лотерея")
      .addSubcommand(s => s.setName("buy").setDescription("Купить билеты ($1,000 каждый)")
        .addIntegerOption(o => o.setName("count").setDescription("Количество (1-10)").setMinValue(1).setMaxValue(10)))
      .addSubcommand(s => s.setName("info").setDescription("Информация о лотерее")),

    new SlashCommandBuilder().setName("blackmarket").setDescription("SAMP Life: чёрный рынок")
      .addSubcommand(s => s.setName("browse").setDescription("Посмотреть товары"))
      .addSubcommand(s => s.setName("buy").setDescription("Купить товар")
        .addIntegerOption(o => o.setName("slot").setDescription("Номер слота (1-3)").setRequired(true).setMinValue(1).setMaxValue(3))),
  ];
}

// ═══════════════════════════════════════════════════════════════
// DISPATCH
// ═══════════════════════════════════════════════════════════════

async function handleSampExtendedCommand({ interaction, db }) {
  const name = interaction.commandName;
  try {
    if (name === "businesses") return await handleBusinesses(interaction, db);
    if (name === "buybiz") return await handleBuyBiz(interaction, db);
    if (name === "collectincome") return await handleCollectIncome(interaction, db);
    if (name === "tunecar") return await handleTuneCar(interaction, db);
    if (name === "garage") return await handleGarage(interaction, db);
    if (name === "bounty") return await handleBounty(interaction, db);
    if (name === "bountylist") return await handleBountyList(interaction, db);
    if (name === "heist") return await handleHeist(interaction, db);
    if (name === "jobs") return await handleJobs(interaction, db);
    if (name === "dojob") return await handleDoJob(interaction, db);
    if (name === "gang") return await handleGangCommand(interaction, db);
    if (name === "shopcosmetics") return await handleShopCosmetics(interaction);
    if (name === "buycosmetic") return await handleBuyCosmetic(interaction, db);
    if (name === "repair") return await handleRepair(interaction, db);
    if (name === "lottery") return await handleLottery(interaction, db);
    if (name === "blackmarket") return await handleBlackMarket(interaction, db);
  } catch (e) {
    console.error("[samp-extended] error", e);
    const msg = "Ошибка. Попробуй позже.";
    if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }
}

async function handleSampExtendedAutocomplete(interaction, db) {
  const name = interaction.commandName;
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value || "").toLowerCase();
  let choices = [];

  if (name === "buybiz") {
    choices = Object.entries(PROPERTIES).map(([id, p]) => ({ name: `${p.name} — ${fmtMoney(p.price)}`, value: id }));
  } else if (name === "tunecar" && focused.name === "car") {
    const userId = interaction.user.id;
    const cars = await dbAll(db, "SELECT car_id FROM samp_garage WHERE user_id = ?", [userId]);
    choices = (cars || []).filter(r => CARS[r.car_id]).map(r => ({ name: CARS[r.car_id].name, value: r.car_id }));
  } else if (name === "tunecar" && focused.name === "upgrade") {
    choices = Object.entries(CAR_UPGRADES).map(([id, u]) => ({ name: `${u.name} — ${fmtMoney(u.price)} (+${u.speedBonus})`, value: id }));
  } else if (name === "buycosmetic") {
    choices = Object.entries(COSMETICS).map(([id, c]) => ({ name: `${c.name} — ${fmtMoney(c.price)}`, value: id }));
  }

  if (query) choices = choices.filter(c => c.name.toLowerCase().includes(query) || c.value.includes(query));
  await interaction.respond(choices.slice(0, 25));
}

// ═══════════════════════════════════════════════════════════════

module.exports = {
  ensureSampExtendedTables,
  getSampExtendedCommandBuilders,
  handleSampExtendedCommand,
  handleSampExtendedAutocomplete,
  checkAndCollectBounty,
  degradeWeapon,
  drawLottery,
  PROPERTIES,
  CAR_UPGRADES,
  HEIST_TIERS,
};
