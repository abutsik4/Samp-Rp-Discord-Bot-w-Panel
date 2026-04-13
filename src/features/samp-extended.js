"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const {
  CARS,
  ITEMS,
  getCarVehicleProfile,
  getInstalledCarUpgradeRows,
  getOrCreateCarTuningProgress,
  getUserRaceStats,
} = require("./samp-life");
const { getUserBadges } = require("./badges");
const { addWantedStar } = require("./wanted-stars");
const {
  COSMETICS,
  getUserCosmetics,
  applyUserCosmeticsToEmbed,
  getCosmeticBenefitText,
} = require("./samp-cosmetics");
const {
  CAR_TUNING_PARTS,
  TUNE_LEVEL_MAX,
  TUNE_REMOVE_REFUND_RATIO,
  formatTuningPartStatSummary,
  formatTuningRequirementStatus,
  getNextTuningLevelProgress,
  getTuningPart,
  getTuningRequirementStatus,
  listTuningParts,
} = require("./constants/car-tuning");

// Helpers
function fmtMoney(n) { return `${Number(n || 0).toLocaleString("ru-RU")} $`; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function nowMs() { return Date.now(); }
function clampInt(n, min, max) { const x = Math.floor(Number(n)); return Number.isFinite(x) && x >= min && x <= max ? x : null; }
function makeInteractionOpKey(interaction, suffix = "") {
  const base = String(interaction?.id || interaction?.token || "").trim();
  if (!base) return null;
  return suffix ? `${base}:${suffix}` : base;
}

async function withTx(db, fn) {
  return withSerializedTransaction(db, fn);
}

async function tableHasColumn(db, tableName, columnName) {
  const rows = await dbAll(db, `PRAGMA table_info(${tableName})`);
  return (rows || []).some((row) => String(row?.name || "") === String(columnName));
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const PROPERTIES = {
  carwash: { name: "Автомойка", district: "ganton", price: 50_000, income: 1_500, upkeep: 200, maintainBase: 3_000, conditionLoss: 1.0, supplyLoss: 1.8, activeBonus: 0.05 },
  gas_station: { name: "Заправка", district: "commerce", price: 100_000, income: 3_000, upkeep: 400, maintainBase: 5_000, conditionLoss: 1.1, supplyLoss: 1.7, activeBonus: 0.08 },
  taxi_depot: { name: "Таксопарк", district: "commerce", price: 120_000, income: 3_600, upkeep: 450, maintainBase: 6_000, conditionLoss: 1.4, supplyLoss: 1.8, activeBonus: 0.12 },
  bar_24_7: { name: "24/7", district: "market", price: 150_000, income: 4_500, upkeep: 650, maintainBase: 7_000, conditionLoss: 1.2, supplyLoss: 1.9, activeBonus: 0.08 },
  clothing_store: { name: "Магазин одежды", district: "market", price: 200_000, income: 6_000, upkeep: 900, maintainBase: 9_000, conditionLoss: 1.0, supplyLoss: 1.6, activeBonus: 0.10 },
  mechanic_shop: { name: "Мастерская", district: "commerce", price: 280_000, income: 8_200, upkeep: 1_200, maintainBase: 12_000, conditionLoss: 0.9, supplyLoss: 1.7, activeBonus: 0.12 },
  gym: { name: "Спортзал Ganton", district: "ganton", price: 300_000, income: 9_000, upkeep: 1_300, maintainBase: 14_000, conditionLoss: 1.1, supplyLoss: 1.4, activeBonus: 0.10 },
  scrapyard: { name: "Свалка / Разборка", district: "docks", price: 425_000, income: 12_500, upkeep: 1_800, maintainBase: 18_000, conditionLoss: 1.3, supplyLoss: 2.1, activeBonus: 0.13 },
  nightclub: { name: "Ночной клуб", district: "vinewood", price: 500_000, income: 15_000, upkeep: 2_500, maintainBase: 22_000, conditionLoss: 1.5, supplyLoss: 2.4, activeBonus: 0.15 },
  car_dealership: { name: "Автосалон Otto's", district: "docks", price: 750_000, income: 22_500, upkeep: 3_800, maintainBase: 32_000, conditionLoss: 1.2, supplyLoss: 2.0, activeBonus: 0.14 },
  record_label: { name: "Лейбл звукозаписи", district: "vinewood", price: 900_000, income: 27_000, upkeep: 4_500, maintainBase: 38_000, conditionLoss: 1.4, supplyLoss: 2.2, activeBonus: 0.16 },
  casino: { name: "Казино Four Dragons", district: "vinewood", price: 1_500_000, income: 45_000, upkeep: 7_000, maintainBase: 60_000, conditionLoss: 1.6, supplyLoss: 2.6, activeBonus: 0.18 },
};

const TERRITORY_DISTRICTS = {
  ganton: { name: "Ganton", claimCost: 18_000, takeoverCost: 24_000, businessBuff: 0.08 },
  commerce: { name: "Commerce", claimCost: 24_000, takeoverCost: 32_000, businessBuff: 0.10 },
  market: { name: "Market", claimCost: 22_000, takeoverCost: 30_000, businessBuff: 0.09 },
  docks: { name: "Docks", claimCost: 26_000, takeoverCost: 34_000, businessBuff: 0.10 },
  vinewood: { name: "Vinewood", claimCost: 32_000, takeoverCost: 42_000, businessBuff: 0.12 },
};

const CAR_UPGRADES = CAR_TUNING_PARTS;

const GARAGE_SWITCH_BUTTON_PREFIX = "garage_switch:";
const GARAGE_SWITCH_BUTTON_LIMIT = 5;

const HEIST_TIERS = {
  store: { name: "24/7", minPlayers: 2, maxPlayers: 3, payout: [5_000, 15_000], failChance: 0.25, jailMs: 3 * 60_000 },
  bank: { name: "Банк Лос-Сантоса", minPlayers: 2, maxPlayers: 4, payout: [20_000, 50_000], failChance: 0.35, jailMs: 5 * 60_000 },
  casino_heist: { name: "Казино Caligula's", minPlayers: 3, maxPlayers: 4, payout: [50_000, 120_000], failChance: 0.45, jailMs: 8 * 60_000 },
  military: { name: "Area 69", minPlayers: 4, maxPlayers: 4, payout: [100_000, 300_000], failChance: 0.55, jailMs: 10 * 60_000 },
};

const HEIST_LOBBY_LOCK_MS = 60 * 1000;
const HEIST_COOLDOWN_MS = 15 * 60_000;
const HEIST_MIN_COOLDOWN_MS = 10 * 60_000;
const HEIST_ACTIVE_ACTION = "heist:active";
const HEIST_COOLDOWN_ACTION = "heist";
const HEIST_COOLDOWN_BADGE_TIERS = [
  { badgeId: "msg_5000", cooldownMs: 10 * 60_000 },
  { badgeId: "msg_2500", cooldownMs: 11 * 60_000 },
  { badgeId: "msg_1000", cooldownMs: 12 * 60_000 },
  { badgeId: "msg_500", cooldownMs: 13 * 60_000 },
  { badgeId: "msg_100", cooldownMs: 14 * 60_000 },
];

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

const BLACK_MARKET_ITEMS = [
  { name: "Золотой Desert Eagle", type: "weapon_skin", basePrice: [40_000, 80_000] },
  { name: "Бронежилет", type: "armor", basePrice: [10_000, 25_000] },
  { name: "Секретная карта", type: "map", basePrice: [5_000, 15_000] },
  { name: "Нитро (x3)", type: "nos_boost", basePrice: [8_000, 20_000] },
  { name: "Фальшивые документы", type: "jail_pass", basePrice: [15_000, 40_000] },
  { name: "Аптечка", type: "medkit", basePrice: [3_000, 10_000] },
  { name: "Подслушка", type: "wiretap", basePrice: [12_000, 30_000] },
  { name: "Подрыв", type: "sabotage", basePrice: [15_000, 35_000] },
  { name: "Отмывка", type: "laundering", basePrice: [20_000, 50_000] },
  { name: "Чёрный ящик", type: "mystery_crate", basePrice: [10_000, 25_000] },
  { name: "Набор для ремонта", type: "repair_kit", basePrice: [8_000, 20_000] },
  { name: "Маскировка", type: "disguise", basePrice: [10_000, 25_000] },
  { name: "Наводка", type: "hot_tip", basePrice: [5_000, 15_000] },
  { name: "Контракт на убийство", type: "hit_contract", basePrice: [25_000, 60_000] },
];

const BLACK_MARKET_GRANTS = {
  weapon_skin: {
    inventoryItemId: "deagle",
    inventoryQty: 1,
    cosmeticType: "weapon_skin_deagle",
    cosmeticValue: "gold",
    autoEquipWeaponId: "deagle",
    summary: "Скин на Desert Eagle выдан навсегда и пушка поставлена активной.",
  },
  armor: {
    inventoryItemId: "bm_armor",
    inventoryQty: 1,
    summary: "Бронежилет добавлен в тайник.",
  },
  map: {
    inventoryItemId: "bm_map",
    inventoryQty: 1,
    summary: "Секретная карта добавлена в тайник.",
  },
  nos_boost: {
    inventoryItemId: "bm_nos_boost",
    inventoryQty: 3,
    summary: "Три баллона нитро добавлены в тайник.",
  },
  jail_pass: {
    inventoryItemId: "bm_jail_pass",
    inventoryQty: 1,
    summary: "Фальшивые документы добавлены в тайник.",
  },
  medkit: {
    inventoryItemId: "bm_medkit",
    inventoryQty: 1,
    summary: "Аптечка добавлена в тайник.",
  },
  wiretap: {
    inventoryItemId: "bm_wiretap",
    inventoryQty: 1,
    summary: "Подслушка добавлена в тайник. Используй /wiretap @цель.",
  },
  sabotage: {
    inventoryItemId: "bm_sabotage",
    inventoryQty: 1,
    summary: "Подрыв добавлен в тайник. Используй /sabotage @цель.",
  },
  laundering: {
    inventoryItemId: "bm_laundering",
    inventoryQty: 1,
    summary: "Отмывка активна — штрафы за /rob снижены на 40% пока есть в тайнике.",
  },
  mystery_crate: {
    inventoryItemId: null,
    inventoryQty: 0,
    isInstant: true,
    summary: "Открываем ящик...",
  },
  repair_kit: {
    inventoryItemId: "bm_repair_kit",
    inventoryQty: 1,
    summary: "Набор для ремонта добавлен в тайник. Используй /userepairkit.",
  },
  disguise: {
    inventoryItemId: "bm_disguise",
    inventoryQty: 1,
    summary: "Маскировка добавлена в тайник. Используй /disguise.",
  },
  hot_tip: {
    inventoryItemId: "bm_hot_tip",
    inventoryQty: 1,
    summary: "Наводка добавлена в тайник. Используй /hottip.",
  },
  hit_contract: {
    inventoryItemId: null,
    inventoryQty: 0,
    isInstant: true,
    summary: "Контракт оформлен...",
  },
};

// --- Black Market Atmosphere & Mechanics ---
const BM_DEALER_NAMES = [
  "Толстый Борис", "Одноглазый Серёга", "Тётя Зина", "Хромой Аслан",
  "Немой Валера", "Крыса", "MadDog", "Шнырь", "Профессор",
  "Рыжий Миша", "Батя", "Тень", "Фокстрот", "Гвоздь",
];
const BM_DEALER_LINES = [
  "Тихо... У меня есть кое-что для тебя.",
  "Не спрашивай откуда это. Берёшь?",
  "Сегодня хороший товар, успей пока менты не пронюхали.",
  "Подходи, не стесняйся. Всё чистое... почти.",
  "Только для своих, понял? Чужим ни слова.",
  "Один раз живём. Хочешь — бери, нет — вали.",
  "У меня всё есть. Вопрос — есть ли у тебя бабки.",
  "Ты знаешь правила: без гарантий, без возвратов.",
  "Уникальный товар. Завтра такого не будет.",
  "Шёпотом: у меня есть кое-что... особенное.",
  "Копы? Какие копы? Тут нет никаких копов.",
  "Скидка сегодня? Щас, ага. Иди к ОБС скидки.",
  "Слышал, ты ищешь кое-что... необычное?",
  "Товар свежий, прямиком из... ну, не важно откуда.",
  "Бери два — третий... нет, шучу. Полная цена.",
];

const BM_STING_CHANCE = 0.08;
const BM_STING_STARS = 2;
const BM_REP_TIERS = [
  { minPurchases: 0, name: "Новичок", discount: 0 },
  { minPurchases: 5, name: "Постоянный клиент", discount: 0 },
  { minPurchases: 15, name: "VIP покупатель", discount: 0.10 },
  { minPurchases: 30, name: "Криминальный авторитет", discount: 0.15 },
];
const BM_DAILY_DEAL_COUNT = 4;
const BM_MYSTERY_CRATE_LOOT = [
  { weight: 30, type: "money_back", label: "Двойная выручка" },
  { weight: 25, type: "random_weapon", label: "Случайное оружие" },
  { weight: 20, type: "nos_charges", label: "Три баллона нитро" },
  { weight: 15, type: "empty", label: "Пустая коробка..." },
  { weight: 10, type: "jackpot", label: "Джекпот" },
];
const BM_SECRET_HEIST = {
  name: "Секретный бункер",
  payout: [30_000, 80_000],
  failChance: 0.50,
  jailMs: 10 * 60_000,
};

const BUSINESS_OPERATIONS = {
  carwash: { label: "открыл экспресс-мойку", reward: [1_600, 3_000], conditionGain: 7, suppliesGain: 12, repGain: 1, cooldownMs: 30 * 60_000 },
  gas_station: { label: "закрыл смену на заправке", reward: [2_400, 4_600], conditionGain: 5, suppliesGain: 10, repGain: 1, cooldownMs: 45 * 60_000 },
  taxi_depot: { label: "поймал час пик и развёз клиентов", reward: [3_200, 6_500], conditionGain: 6, suppliesGain: 14, repGain: 2, cooldownMs: 45 * 60_000 },
  bar_24_7: { label: "разгрузил свежую поставку", reward: [3_400, 6_000], conditionGain: 4, suppliesGain: 16, repGain: 1, cooldownMs: 50 * 60_000 },
  clothing_store: { label: "устроил распродажу коллекции", reward: [4_200, 7_500], conditionGain: 5, suppliesGain: 13, repGain: 2, cooldownMs: 55 * 60_000 },
  mechanic_shop: { label: "взял срочный VIP-ремонт", reward: [5_400, 9_500], conditionGain: 10, suppliesGain: 12, repGain: 2, cooldownMs: 60 * 60_000 },
  gym: { label: "провёл набор новых клиентов", reward: [4_500, 8_200], conditionGain: 6, suppliesGain: 9, repGain: 2, cooldownMs: 55 * 60_000 },
  scrapyard: { label: "разобрал жирный заказ на детали", reward: [6_500, 11_500], conditionGain: 7, suppliesGain: 18, repGain: 2, cooldownMs: 70 * 60_000 },
  nightclub: { label: "раскрутил вечернюю тусовку", reward: [7_500, 13_500], conditionGain: 5, suppliesGain: 17, repGain: 3, cooldownMs: 75 * 60_000 },
  car_dealership: { label: "продал премиум-тачку с наценкой", reward: [10_000, 18_000], conditionGain: 6, suppliesGain: 14, repGain: 3, cooldownMs: 90 * 60_000 },
  record_label: { label: "запустил промо нового трека", reward: [11_000, 19_500], conditionGain: 4, suppliesGain: 15, repGain: 3, cooldownMs: 95 * 60_000 },
  casino: { label: "собрал VIP-турнир", reward: [16_000, 28_000], conditionGain: 5, suppliesGain: 20, repGain: 4, cooldownMs: 120 * 60_000 },
};

const GANG_BUSINESS_SUPPORT_MS = 12 * 60 * 60_000;
const GANG_BUSINESS_SUPPORT_MULTIPLIER = 1.12;
const TERRITORY_CAPTURE_PRESSURE = 60;
const TERRITORY_ATTACK_PRESSURE = 45;
const TERRITORY_REINFORCE_PRESSURE = 25;
const GANG_TERRITORY_COOLDOWN_MS = 45 * 60_000;
const DEFAULT_SAMP_LIVE_OPS_CONFIG = {
  active_event_name: "",
  active_event_message: "",
  business_income_multiplier: 1,
  business_run_multiplier: 1,
  gang_support_cost_multiplier: 1,
  rep_multiplier: 1,
};
const DEFAULT_SAMP_LIVE_OPS_PRESETS = [
  {
    name: "Weekend Rush",
    preset_type: "weekend",
    is_default: 1,
    config: {
      active_event_name: "Weekend Rush",
      active_event_message: "Больше трафика, выше выплаты и дешевле поддержка районов.",
      business_income_multiplier: 1.15,
      business_run_multiplier: 1.2,
      gang_support_cost_multiplier: 0.9,
      rep_multiplier: 1.1,
    },
  },
  {
    name: "Holiday Boost",
    preset_type: "holiday",
    is_default: 1,
    config: {
      active_event_name: "Holiday Boost",
      active_event_message: "Праздничный трафик поднимает выручку и репутацию по всему штату.",
      business_income_multiplier: 1.25,
      business_run_multiplier: 1.25,
      gang_support_cost_multiplier: 1,
      rep_multiplier: 1.25,
    },
  },
  {
    name: "Turf Wars",
    preset_type: "special",
    is_default: 1,
    config: {
      active_event_name: "Turf Wars",
      active_event_message: "Банды давят на районы, а ручные операции бизнесов становятся выгоднее.",
      business_income_multiplier: 1,
      business_run_multiplier: 1.35,
      gang_support_cost_multiplier: 0.85,
      rep_multiplier: 1.4,
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════

async function ensureSampExtendedTables(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_properties (
    user_id TEXT NOT NULL, property_id TEXT NOT NULL,
    bought_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_collected TEXT NOT NULL DEFAULT (datetime('now')),
    condition INTEGER NOT NULL DEFAULT 100,
    supplies INTEGER NOT NULL DEFAULT 100,
    last_maintained TEXT NOT NULL DEFAULT (datetime('now')),
    last_state_tick TEXT NOT NULL DEFAULT (datetime('now')),
    total_collected INTEGER NOT NULL DEFAULT 0,
    gang_boost_until TEXT,
    gang_boosted_by INTEGER,
    PRIMARY KEY (user_id, property_id)
  )`);
  try { await dbRun(db, `ALTER TABLE samp_properties ADD COLUMN condition INTEGER NOT NULL DEFAULT 100`); } catch (_) {}
  try { await dbRun(db, `ALTER TABLE samp_properties ADD COLUMN supplies INTEGER NOT NULL DEFAULT 100`); } catch (_) {}
  try { await dbRun(db, `ALTER TABLE samp_properties ADD COLUMN last_maintained TEXT`); } catch (_) {}
  try { await dbRun(db, `ALTER TABLE samp_properties ADD COLUMN last_state_tick TEXT`); } catch (_) {}
  try { await dbRun(db, `ALTER TABLE samp_properties ADD COLUMN total_collected INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
  try { await dbRun(db, `ALTER TABLE samp_properties ADD COLUMN gang_boost_until TEXT`); } catch (_) {}
  try { await dbRun(db, `ALTER TABLE samp_properties ADD COLUMN gang_boosted_by INTEGER`); } catch (_) {}
  await dbRun(
    db,
    `UPDATE samp_properties
     SET condition = COALESCE(condition, 100),
         supplies = COALESCE(supplies, 100),
         last_maintained = COALESCE(NULLIF(last_maintained, ''), last_collected),
         last_state_tick = COALESCE(NULLIF(last_state_tick, ''), last_collected),
         total_collected = COALESCE(total_collected, 0)`
  );

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_live_ops (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  for (const [key, value] of Object.entries(DEFAULT_SAMP_LIVE_OPS_CONFIG)) {
    await dbRun(
      db,
      `INSERT OR IGNORE INTO samp_live_ops(key, value) VALUES(?, ?)`,
      [key, String(value)]
    );
  }

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_live_ops_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    preset_type TEXT NOT NULL,
    config_json TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  for (const preset of DEFAULT_SAMP_LIVE_OPS_PRESETS) {
    await dbRun(
      db,
      `INSERT OR IGNORE INTO samp_live_ops_presets(name, preset_type, config_json, is_default)
       VALUES(?, ?, ?, ?)`,
      [preset.name, preset.preset_type, JSON.stringify(normalizeSampLiveOpsConfig(preset.config)), preset.is_default]
    );
  }

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_gang_territories (
    district_id TEXT PRIMARY KEY,
    gang_id INTEGER NOT NULL,
    pressure INTEGER NOT NULL DEFAULT 0,
    claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (gang_id) REFERENCES samp_gangs(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_car_upgrades (
    user_id TEXT NOT NULL, car_id TEXT NOT NULL, upgrade_id TEXT NOT NULL,
    durability INTEGER NOT NULL DEFAULT 100,
    installed_at TEXT NOT NULL DEFAULT (datetime('now')),
    cosmetic_variant TEXT,
    PRIMARY KEY (user_id, car_id, upgrade_id)
  )`);
  try { await dbRun(db, `ALTER TABLE samp_car_upgrades ADD COLUMN durability INTEGER NOT NULL DEFAULT 100`); } catch (_) {}
  if (!(await tableHasColumn(db, "samp_car_upgrades", "installed_at"))) {
    try { await dbRun(db, `ALTER TABLE samp_car_upgrades ADD COLUMN installed_at TEXT`); } catch (_) {}
  }
  try { await dbRun(db, `ALTER TABLE samp_car_upgrades ADD COLUMN cosmetic_variant TEXT`); } catch (_) {}
  const hasCarUpgradeDurability = await tableHasColumn(db, "samp_car_upgrades", "durability");
  const hasCarUpgradeInstalledAt = await tableHasColumn(db, "samp_car_upgrades", "installed_at");
  if (hasCarUpgradeDurability && hasCarUpgradeInstalledAt) {
    await dbRun(
      db,
      `UPDATE samp_car_upgrades
       SET durability = COALESCE(durability, 100),
           installed_at = COALESCE(NULLIF(installed_at, ''), datetime('now'))`
    );
  } else if (hasCarUpgradeDurability) {
    await dbRun(
      db,
      `UPDATE samp_car_upgrades
       SET durability = COALESCE(durability, 100)`
    );
  }

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_car_tuning_level (
    user_id TEXT NOT NULL,
    car_id TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    exp INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, car_id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_race_stats (
    user_id TEXT PRIMARY KEY,
    races_total INTEGER NOT NULL DEFAULT 0,
    races_won INTEGER NOT NULL DEFAULT 0,
    max_speed_reached INTEGER NOT NULL DEFAULT 0,
    total_winnings INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

function formatDuration(ms) {
  const totalSeconds = Math.max(1, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}с`;
  if (seconds === 0) return `${minutes}м`;
  return `${minutes}м ${seconds}с`;
}

async function getCooldownReadyAt(db, userId, action) {
  const row = await dbGet(
    db,
    "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?",
    [String(userId), String(action)]
  );
  return row ? Number(row.ready_at || 0) : 0;
}

async function setCooldownReadyAt(db, userId, action, readyAt) {
  await dbRun(
    db,
    `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)
     ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`,
    [String(userId), String(action), Number(readyAt)]
  );
}

async function clearCooldownAction(db, userId, action) {
  await dbRun(db, "DELETE FROM samp_cooldowns WHERE user_id = ? AND action = ?", [String(userId), String(action)]);
}

function getHeistCooldownMsForBadges(badges) {
  const badgeIds = new Set((badges || []).map((badge) => String(badge.badge_id || badge.id || "")).filter(Boolean));
  for (const tier of HEIST_COOLDOWN_BADGE_TIERS) {
    if (badgeIds.has(tier.badgeId)) return tier.cooldownMs;
  }
  return HEIST_COOLDOWN_MS;
}

async function getUserHeistCooldownMs(db, guildId, userId) {
  if (!guildId) return HEIST_COOLDOWN_MS;
  try {
    const badges = await getUserBadges(db, guildId, userId);
    return Math.max(HEIST_MIN_COOLDOWN_MS, getHeistCooldownMsForBadges(badges));
  } catch (_) {
    return HEIST_COOLDOWN_MS;
  }
}

async function buildHeistCooldownEntries(db, guildId, participantIds) {
  const uniqueIds = Array.from(new Set((participantIds || []).map((participantId) => String(participantId)).filter(Boolean)));
  const entries = [];
  for (const participantId of uniqueIds) {
    const cooldownMs = await getUserHeistCooldownMs(db, guildId, participantId);
    entries.push({
      userId: participantId,
      cooldownMs,
      readyAt: nowMs() + cooldownMs,
    });
  }
  return entries;
}

function formatHeistCooldownSummary(entries) {
  const cooldowns = (entries || []).map((entry) => Number(entry.cooldownMs || 0)).filter((value) => value > 0);
  if (!cooldowns.length) return formatDuration(HEIST_COOLDOWN_MS);
  const minCooldown = Math.min(...cooldowns);
  const maxCooldown = Math.max(...cooldowns);
  if (minCooldown === maxCooldown) return formatDuration(minCooldown);
  return `${formatDuration(minCooldown)} — ${formatDuration(maxCooldown)}`;
}

async function tryReserveHeistParticipant(db, userId, lockMs = HEIST_LOBBY_LOCK_MS) {
  return withTx(db, async () => {
    const now = nowMs();
    const activeReadyAt = await getCooldownReadyAt(db, userId, HEIST_ACTIVE_ACTION);
    if (activeReadyAt > now) {
      return { ok: false, reason: "active", remainingMs: activeReadyAt - now };
    }

    const cooldownReadyAt = await getCooldownReadyAt(db, userId, HEIST_COOLDOWN_ACTION);
    if (cooldownReadyAt > now) {
      return { ok: false, reason: "cooldown", remainingMs: cooldownReadyAt - now };
    }

    await setCooldownReadyAt(db, userId, HEIST_ACTIVE_ACTION, now + lockMs);
    return { ok: true };
  });
}

async function releaseHeistParticipants(db, participantIds) {
  for (const participantId of participantIds || []) {
    await clearCooldownAction(db, participantId, HEIST_ACTIVE_ACTION);
  }
}

async function applyHeistCooldown(db, participantIds, options = {}) {
  const entries = Array.isArray(options?.entries)
    ? options.entries
    : options?.guildId
      ? await buildHeistCooldownEntries(db, options.guildId, participantIds)
      : (participantIds || []).map((participantId) => ({ userId: participantId, readyAt: options?.readyAt || (nowMs() + HEIST_COOLDOWN_MS), cooldownMs: HEIST_COOLDOWN_MS }));

  for (const entry of entries) {
    await setCooldownReadyAt(db, entry.userId, HEIST_COOLDOWN_ACTION, entry.readyAt);
  }

  return entries;
}

function getHeistLockMessage(result) {
  if (!result || result.ok) return null;
  if (result.reason === "active") {
    return `Ты уже числишься в другом ограблении. Дождись завершения или распада лобби (**${formatDuration(result.remainingMs)}**).`;
  }
  return `⏳ После ограбления нужен откат. Следующий заход через **${formatDuration(result.remainingMs)}**.`;
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

function parseSqliteDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value);
  if (str.includes("T")) return new Date(str);
  return new Date(str.replace(" ", "T") + "Z");
}

function toSqliteDate(date) {
  return new Date(date).toISOString().slice(0, 19).replace("T", " ");
}

function joinLines(lines) {
  return (lines || []).filter(Boolean).join("\n");
}

function chunkArray(items, size) {
  const chunkSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function formatPagedTitle(title, pageIndex, totalPages) {
  return totalPages > 1 ? `${title} • ${pageIndex + 1}/${totalPages}` : title;
}

function buildPagedFieldEmbeds({ title, description, color, fields, fieldsPerPage = 6, footer }) {
  const chunks = chunkArray(fields, fieldsPerPage);
  return chunks.map((chunk, pageIndex) => {
    const embed = new EmbedBuilder()
      .setTitle(formatPagedTitle(title, pageIndex, chunks.length))
      .setColor(color)
      .setTimestamp();
    if (description) embed.setDescription(description);
    if (footer) embed.setFooter({ text: footer });
    embed.addFields(chunk);
    return embed;
  });
}

function buildPagedLineEmbeds({ title, description, color, lines, linesPerPage = 10, footer }) {
  const chunks = chunkArray(lines, linesPerPage);
  return chunks.map((chunk, pageIndex) => {
    const embed = new EmbedBuilder()
      .setTitle(formatPagedTitle(title, pageIndex, chunks.length))
      .setDescription(joinLines([description, chunk.join("\n")].filter(Boolean)))
      .setColor(color)
      .setTimestamp();
    if (footer) embed.setFooter({ text: footer });
    return embed;
  });
}

function createGangAliasInteraction(interaction, subcommand) {
  const aliasInteraction = Object.create(interaction);
  const aliasOptions = Object.create(interaction.options);
  aliasOptions.getSubcommand = () => subcommand;
  aliasInteraction.commandName = "gang";
  aliasInteraction.options = aliasOptions;
  return aliasInteraction;
}

function normalizeSampLiveOpsConfig(input = {}) {
  const merged = {
    ...DEFAULT_SAMP_LIVE_OPS_CONFIG,
    ...(input || {}),
  };

  const numericOrDefault = (value, fallback, min = 0, max = 5) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  };

  return {
    active_event_name: String(merged.active_event_name || "").trim().slice(0, 80),
    active_event_message: String(merged.active_event_message || "").trim().slice(0, 240),
    business_income_multiplier: numericOrDefault(merged.business_income_multiplier, 1),
    business_run_multiplier: numericOrDefault(merged.business_run_multiplier, 1),
    gang_support_cost_multiplier: numericOrDefault(merged.gang_support_cost_multiplier, 1),
    rep_multiplier: numericOrDefault(merged.rep_multiplier, 1, 0, 10),
  };
}

async function getSampLiveOpsConfig(db) {
  const rows = await dbAll(db, "SELECT key, value FROM samp_live_ops", []);
  const current = {};
  for (const row of rows || []) {
    current[row.key] = row.value;
  }
  return normalizeSampLiveOpsConfig(current);
}

async function updateSampLiveOpsConfig(db, patch = {}) {
  const next = normalizeSampLiveOpsConfig({ ...(await getSampLiveOpsConfig(db)), ...(patch || {}) });
  await withTx(db, async () => {
    for (const [key, value] of Object.entries(next)) {
      await dbRun(
        db,
        `INSERT INTO samp_live_ops(key, value, updated_at) VALUES(?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, String(value)]
      );
    }
  });
  return next;
}

function normalizeSampLiveOpsPreset(input = {}) {
  const name = String(input.name || "").trim().slice(0, 80);
  if (!name) throw new Error("Preset name required");

  const presetType = String(input.preset_type || input.presetType || "custom").trim().toLowerCase();
  const allowedTypes = new Set(["weekend", "holiday", "special", "custom"]);

  return {
    id: input.id != null ? Number(input.id) : null,
    name,
    preset_type: allowedTypes.has(presetType) ? presetType : "custom",
    is_default: input.is_default ? 1 : 0,
    config: normalizeSampLiveOpsConfig(input.config || {}),
  };
}

async function listSampLiveOpsPresets(db) {
  const rows = await dbAll(
    db,
    `SELECT id, name, preset_type, config_json, is_default, created_at, updated_at
     FROM samp_live_ops_presets
     ORDER BY is_default DESC, preset_type ASC, name ASC`,
    []
  );

  return (rows || []).map((row) => ({
    ...row,
    is_default: !!Number(row.is_default || 0),
    config: normalizeSampLiveOpsConfig(JSON.parse(row.config_json || "{}")),
  }));
}

async function upsertSampLiveOpsPreset(db, presetInput) {
  const preset = normalizeSampLiveOpsPreset(presetInput);
  if (preset.id) {
    await dbRun(
      db,
      `UPDATE samp_live_ops_presets
       SET name = ?, preset_type = ?, config_json = ?, is_default = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [preset.name, preset.preset_type, JSON.stringify(preset.config), preset.is_default, preset.id]
    );
  } else {
    await dbRun(
      db,
      `INSERT INTO samp_live_ops_presets(name, preset_type, config_json, is_default)
       VALUES(?, ?, ?, ?)`,
      [preset.name, preset.preset_type, JSON.stringify(preset.config), preset.is_default]
    );
  }
  return listSampLiveOpsPresets(db);
}

async function deleteSampLiveOpsPreset(db, presetId) {
  await dbRun(db, `DELETE FROM samp_live_ops_presets WHERE id = ?`, [presetId]);
  return listSampLiveOpsPresets(db);
}

async function applySampLiveOpsPreset(db, presetId) {
  const preset = await dbGet(
    db,
    `SELECT id, name, preset_type, config_json, is_default FROM samp_live_ops_presets WHERE id = ?`,
    [presetId]
  );
  if (!preset) throw new Error("Preset not found");
  const config = normalizeSampLiveOpsConfig(JSON.parse(preset.config_json || "{}"));
  const applied = await updateSampLiveOpsConfig(db, config);
  return {
    preset: {
      ...preset,
      is_default: !!Number(preset.is_default || 0),
      config,
    },
    config: applied,
  };
}

async function getUserGangMembership(db, userId) {
  return dbGet(db, "SELECT gang_id, role FROM samp_gang_members WHERE user_id = ?", [userId]);
}

async function getTerritoryControlMap(db) {
  const rows = await dbAll(db, "SELECT district_id, gang_id, pressure, claimed_at, updated_at FROM samp_gang_territories", []);
  return new Map((rows || []).map((row) => [row.district_id, row]));
}

function getTerritoryBoost(prop, territoryControlMap, gangId) {
  const districtId = prop?.district;
  if (!districtId || !gangId) {
    return { districtId, districtName: districtId ? TERRITORY_DISTRICTS[districtId]?.name || districtId : null, multiplier: 1, isControlled: false, control: null };
  }

  const control = territoryControlMap?.get(districtId) || null;
  const isControlled = !!(control && Number(control.gang_id) === Number(gangId));
  const district = TERRITORY_DISTRICTS[districtId];
  return {
    districtId,
    districtName: district?.name || districtId,
    multiplier: isControlled ? 1 + (district?.businessBuff || 0) : 1,
    isControlled,
    control,
  };
}

async function listGangTerritories(db) {
  const controls = await dbAll(
    db,
    `SELECT t.district_id, t.gang_id, t.pressure, t.claimed_at, t.updated_at, g.name AS gang_name, g.tag AS gang_tag
     FROM samp_gang_territories t
     LEFT JOIN samp_gangs g ON g.id = t.gang_id`,
    []
  );
  const memberships = await dbAll(db, "SELECT gang_id, user_id FROM samp_gang_members", []);
  const properties = await dbAll(db, "SELECT user_id, property_id, total_collected FROM samp_properties", []);

  const memberGangMap = new Map((memberships || []).map((row) => [row.user_id, row.gang_id]));
  const controlMap = new Map((controls || []).map((row) => [row.district_id, row]));

  return Object.entries(TERRITORY_DISTRICTS).map(([districtId, district]) => {
    const relatedBusinessIds = Object.entries(PROPERTIES)
      .filter(([, property]) => property.district === districtId)
      .map(([propertyId]) => propertyId);
    const ownedBusinesses = (properties || []).filter((row) => relatedBusinessIds.includes(row.property_id));
    const control = controlMap.get(districtId) || null;
    const controlledBusinesses = control
      ? ownedBusinesses.filter((row) => Number(memberGangMap.get(row.user_id)) === Number(control.gang_id)).length
      : 0;

    return {
      district_id: districtId,
      district_name: district.name,
      business_buff_pct: Math.round((district.businessBuff || 0) * 100),
      claim_cost: district.claimCost,
      takeover_cost: district.takeoverCost,
      businesses: relatedBusinessIds,
      business_count: relatedBusinessIds.length,
      owned_businesses: ownedBusinesses.length,
      controlled_businesses: controlledBusinesses,
      total_collected: ownedBusinesses.reduce((sum, row) => sum + Number(row.total_collected || 0), 0),
      gang_id: control?.gang_id || null,
      gang_name: control?.gang_name || null,
      gang_tag: control?.gang_tag || null,
      pressure: control?.pressure || 0,
      claimed_at: control?.claimed_at || null,
      updated_at: control?.updated_at || null,
    };
  });
}

function getBusinessState(prop, row, now = new Date()) {
  const currentCondition = Number.isFinite(Number(row?.condition)) ? Number(row.condition) : 100;
  const currentSupplies = Number.isFinite(Number(row?.supplies)) ? Number(row.supplies) : 100;
  const lastCollected = parseSqliteDate(row?.last_collected) || now;
  const lastStateTick = parseSqliteDate(row?.last_state_tick) || lastCollected;
  const lastMaintained = parseSqliteDate(row?.last_maintained) || lastCollected;
  const hoursElapsed = Math.max(0, Math.min(24, (now - lastCollected) / 3600000));
  const stateHoursElapsed = Math.max(0, Math.min(24, (now - lastStateTick) / 3600000));
  const maintenanceAgeHours = Math.max(0, (now - lastMaintained) / 3600000);
  const gangBoostUntil = parseSqliteDate(row?.gang_boost_until);
  const isGangBoosted = !!(gangBoostUntil && gangBoostUntil > now);

  const projectedCondition = Math.max(15, Math.round(currentCondition - stateHoursElapsed * (prop.conditionLoss || 1)));
  const projectedSupplies = Math.max(0, Math.round(currentSupplies - stateHoursElapsed * (prop.supplyLoss || 1.5)));
  const lowestMetric = Math.min(projectedCondition, projectedSupplies);
  const baseEfficiency = lowestMetric <= 0 ? 0 : Math.max(0.25, lowestMetric / 100);
  const hasActiveBonus = maintenanceAgeHours <= 12 && projectedCondition >= 70 && projectedSupplies >= 60;
  const activeMultiplier = 1 + (hasActiveBonus ? (prop.activeBonus || 0) : 0);
  const gangMultiplier = isGangBoosted ? GANG_BUSINESS_SUPPORT_MULTIPLIER : 1;
  const efficiency = Math.min(1.5, baseEfficiency * activeMultiplier * gangMultiplier);

  return {
    hoursElapsed,
    stateHoursElapsed,
    projectedCondition,
    projectedSupplies,
    maintenanceAgeHours,
    hasActiveBonus,
    isGangBoosted,
    gangBoostUntil,
    efficiency,
  };
}

function getBusinessIncomeBreakdown(prop, state, liveOps = DEFAULT_SAMP_LIVE_OPS_CONFIG, territoryMultiplier = 1) {
  const incomeMultiplier = Number(liveOps?.business_income_multiplier || 1);
  const gross = Math.max(0, Math.floor(prop.income * state.hoursElapsed * state.efficiency * incomeMultiplier * territoryMultiplier));
  const upkeep = Math.max(0, Math.floor((prop.upkeep || 0) * state.hoursElapsed));
  const net = Math.max(0, gross - upkeep);
  const hourlyNet = Math.max(0, Math.floor(prop.income * state.efficiency * incomeMultiplier * territoryMultiplier - (prop.upkeep || 0)));
  return { gross, upkeep, net, hourlyNet, incomeMultiplier, territoryMultiplier };
}

function getBusinessMaintenanceCost(prop, state) {
  const conditionGap = Math.max(0, 100 - state.projectedCondition);
  const suppliesGap = Math.max(0, 100 - state.projectedSupplies);
  if (conditionGap === 0 && suppliesGap === 0) return 0;
  return Math.max(500, Math.round((prop.maintainBase || 5_000) * ((conditionGap + suppliesGap) / 100)));
}

function getBusinessOperation(bizId) {
  return BUSINESS_OPERATIONS[bizId] || { label: "занялся бизнесом", reward: [2_000, 4_000], conditionGain: 5, suppliesGain: 8, repGain: 1, cooldownMs: 45 * 60_000 };
}

async function getBusinessRow(db, userId, bizId) {
  return dbGet(
    db,
    `SELECT property_id, bought_at, last_collected, condition, supplies, last_maintained, last_state_tick, total_collected, gang_boost_until, gang_boosted_by
     FROM samp_properties
     WHERE user_id = ? AND property_id = ?`,
    [userId, bizId]
  );
}

async function handleBizStats(interaction, db) {
  const userId = interaction.user.id;
  const bizId = String(interaction.options.getString("id", true)).toLowerCase();
  const prop = PROPERTIES[bizId];
  if (!prop) {
    await interaction.reply({ content: "Такого бизнеса нет.", ephemeral: true });
    return;
  }

  const property = await getBusinessRow(db, userId, bizId);
  if (!property) {
    await interaction.reply({ content: "У тебя нет этого бизнеса.", ephemeral: true });
    return;
  }

  const now = new Date();
  const liveOps = await getSampLiveOpsConfig(db);
  const membership = await getUserGangMembership(db, userId);
  const territoryControlMap = await getTerritoryControlMap(db);
  const cosmetics = await getUserCosmetics(db, userId);
  const state = getBusinessState(prop, property, now);
  const territory = getTerritoryBoost(prop, territoryControlMap, membership?.gang_id);
  const income = getBusinessIncomeBreakdown(prop, state, liveOps, territory.multiplier);
  const maintenanceCost = getBusinessMaintenanceCost(prop, state);
  const operation = getBusinessOperation(bizId);
  const activeBonusPct = Math.round((prop.activeBonus || 0) * 100);
  const territoryBonusPct = Math.max(0, Math.round((territory.multiplier - 1) * 100));
  const boughtAt = property.bought_at || "—";
  const lastCollected = property.last_collected || "—";
  const lastMaintained = property.last_maintained || "—";
  const gangBoostUntil = state.gangBoostUntil ? `${toSqliteDate(state.gangBoostUntil)} UTC` : "Нет";
  const liveOpsLabel = liveOps.active_event_name || "Нет";

  const embed = new EmbedBuilder()
    .setTitle(`🏢 ${prop.name}`)
    .setDescription(`ID: **${bizId}**`)
    .addFields(
      {
        name: "📍 Профиль",
        value:
          `Район: **${territory.districtName || "—"}**\n` +
          `Цена покупки: **${fmtMoney(prop.price)}**\n` +
          `Куплен: **${boughtAt} UTC**`,
        inline: true,
      },
      {
        name: "💸 Доход",
        value:
          `База: **${fmtMoney(prop.income)}/час**\n` +
          `Upkeep: **${fmtMoney(prop.upkeep || 0)}/час**\n` +
          `Сейчас чистыми: **${fmtMoney(income.hourlyNet)}/час**`,
        inline: true,
      },
      {
        name: "🛠️ Состояние",
        value:
          `Сост.: **${state.projectedCondition}%**\n` +
          `Запасы: **${state.projectedSupplies}%**\n` +
          `Обслуживание: **${maintenanceCost > 0 ? fmtMoney(maintenanceCost) : "не требуется"}**`,
        inline: true,
      },
      {
        name: "📈 Эффективность",
        value:
          `Эфф.: **${Math.round(state.efficiency * 100)}%**\n` +
          `Доход за цикл: **${fmtMoney(income.net)}**\n` +
          `Всего собрано: **${fmtMoney(property.total_collected || 0)}**`,
        inline: true,
      },
      {
        name: "🚀 Бонусы",
        value:
          `Активный бонус: **${state.hasActiveBonus ? `+${activeBonusPct}%` : "нет"}**\n` +
          `Поддержка банды: **${state.isGangBoosted ? gangBoostUntil : "нет"}**\n` +
          `Контроль района: **${territory.isControlled ? `+${territoryBonusPct}%` : "нет"}**`,
        inline: true,
      },
      {
        name: "🧾 История",
        value:
          `Последний сбор: **${lastCollected} UTC**\n` +
          `Последний сервис: **${lastMaintained} UTC**\n` +
          `Активная работа: **${operation.label}**`,
        inline: true,
      }
    )
    .setFooter({
      text: `Ивент: ${liveOpsLabel} • /bizrun id:${bizId} • /maintainbiz id:${bizId}`,
    })
    .setTimestamp();

  applyUserCosmeticsToEmbed(embed, cosmetics, interaction.user.username, 0x16a34a);

  await interaction.reply({ embeds: [embed] });
}

function getDailyJobs() {
  const rng = seededRandom(getDailySeed());
  const shuffled = [...JOB_TEMPLATES].sort(() => rng() - 0.5);
  return shuffled.slice(0, 3);
}

function getDailyBlackMarketDeals() {
  const rng = seededRandom(getDailySeed() + 42);
  const shuffled = [...BLACK_MARKET_ITEMS].sort(() => rng() - 0.5);
  return shuffled.slice(0, BM_DAILY_DEAL_COUNT).map((item, i) => {
    const price = Math.floor(item.basePrice[0] + rng() * (item.basePrice[1] - item.basePrice[0]));
    return { ...item, price, slot: i + 1 };
  });
}

function getDailyDealer() {
  const rng = seededRandom(getDailySeed() + 99);
  const name = BM_DEALER_NAMES[Math.floor(rng() * BM_DEALER_NAMES.length)];
  const line = BM_DEALER_LINES[Math.floor(rng() * BM_DEALER_LINES.length)];
  return { name, line };
}

function getBmRepTier(purchases) {
  let tier = BM_REP_TIERS[0];
  for (const t of BM_REP_TIERS) {
    if (purchases >= t.minPurchases) tier = t;
  }
  return tier;
}

async function getBmPurchaseCount(db, userId) {
  const row = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'bm_purchases'", [String(userId)]);
  return Number(row?.value || 0);
}

async function incrementBmPurchaseCount(db, userId) {
  const current = await getBmPurchaseCount(db, userId);
  await setUserSetting(db, userId, "bm_purchases", String(current + 1));
  return current + 1;
}

async function getInventoryQty(db, userId, itemId) {
  const row = await dbGet(db, "SELECT qty FROM samp_inventory WHERE user_id = ? AND item_id = ?", [String(userId), String(itemId)]);
  return Number(row?.qty || 0);
}

async function consumeInventoryItem(db, userId, itemId, amount = 1) {
  const qty = await getInventoryQty(db, userId, itemId);
  if (qty < amount) return false;
  await dbRun(db, "UPDATE samp_inventory SET qty = qty - ? WHERE user_id = ? AND item_id = ?", [amount, String(userId), String(itemId)]);
  return true;
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

async function addLedgerUnique(db, type, from, to, amount, idempotencyKey, meta = {}) {
  const key = String(idempotencyKey || "").trim();
  if (!key) {
    await addLedger(db, type, from, to, amount, meta);
    return true;
  }

  const payload = { ...(meta || {}), idempotencyKey: key };
  const result = await dbRun(
    db,
    `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json)
     SELECT ?, ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1
       FROM samp_ledger
       WHERE type = ?
         AND COALESCE(from_user, '') = COALESCE(?, '')
         AND COALESCE(to_user, '') = COALESCE(?, '')
         AND json_extract(meta_json, '$.idempotencyKey') = ?
     )`,
    [
      type,
      from ? String(from) : null,
      to ? String(to) : null,
      Number(amount || 0),
      JSON.stringify(payload),
      type,
      from ? String(from) : null,
      to ? String(to) : null,
      key,
    ]
  );
  return Number(result?.changes || 0) > 0;
}

async function addInventoryItem(db, userId, itemId, qty) {
  await dbRun(
    db,
    `INSERT INTO samp_inventory(user_id, item_id, qty)
     VALUES(?, ?, ?)
     ON CONFLICT(user_id, item_id) DO UPDATE SET qty = MAX(0, qty + excluded.qty)`,
    [String(userId), String(itemId), Number(qty || 0)]
  );
}

async function setUserSetting(db, userId, key, value) {
  await dbRun(
    db,
    `INSERT INTO samp_user_settings(user_id, key, value)
     VALUES(?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    [String(userId), String(key), String(value)]
  );
}

async function getUserSetting(db, userId, key) {
  const row = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = ?", [String(userId), String(key)]);
  return row ? row.value : null;
}

async function alreadyOwnsBlackMarketDeal(db, userId, deal) {
  const grant = BLACK_MARKET_GRANTS[deal?.type];
  if (!grant?.cosmeticType) return false;
  const row = await dbGet(
    db,
    "SELECT 1 FROM samp_cosmetics WHERE user_id = ? AND cosmetic_type = ? AND cosmetic_value = ?",
    [String(userId), grant.cosmeticType, grant.cosmeticValue]
  );
  return Boolean(row);
}

async function grantBlackMarketDeal(db, userId, deal) {
  const grant = BLACK_MARKET_GRANTS[deal?.type];
  if (!grant) {
    return { summary: "Покупка записана в лог, но для этого товара пока нет отдельного хранилища." };
  }

  if (grant.inventoryItemId && grant.inventoryQty) {
    await addInventoryItem(db, userId, grant.inventoryItemId, grant.inventoryQty);
  }
  if (grant.cosmeticType) {
    await dbRun(
      db,
      `INSERT OR REPLACE INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value)
       VALUES(?, ?, ?)`,
      [String(userId), grant.cosmeticType, grant.cosmeticValue]
    );
  }
  if (grant.autoEquipWeaponId) {
    await setUserSetting(db, userId, "weapon", grant.autoEquipWeaponId);
  }

  return { summary: grant.summary };
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

// --- Properties ---
async function handleBusinesses(interaction, db) {
  const userId = interaction.user.id;
  const owned = await dbAll(
    db,
    "SELECT property_id, last_collected, condition, supplies, last_maintained, last_state_tick, gang_boost_until, total_collected FROM samp_properties WHERE user_id = ?",
    [userId]
  );
  const ownedMap = new Map((owned || []).map((row) => [row.property_id, row]));
  const now = new Date();
  const liveOps = await getSampLiveOpsConfig(db);
  const membership = await getUserGangMembership(db, userId);
  const territoryControlMap = await getTerritoryControlMap(db);
  const ownedFields = [];
  const marketFields = [];

  for (const [id, p] of Object.entries(PROPERTIES)) {
    const ownedRow = ownedMap.get(id);
    if (!ownedRow) {
      marketFields.push({
        name: `🏪 ${p.name}`,
        value: joinLines([
          `ID: **${id}**`,
          `Цена: **${fmtMoney(p.price)}**`,
          `Доход: **${fmtMoney(p.income)}/час**`,
          `Расходы: **${fmtMoney(p.upkeep || 0)}/час**`,
          `Район: **${TERRITORY_DISTRICTS[p.district]?.name || p.district || "—"}**`,
        ]),
        inline: false,
      });
      continue;
    }

    const state = getBusinessState(p, ownedRow, now);
    const territory = getTerritoryBoost(p, territoryControlMap, membership?.gang_id);
    const income = getBusinessIncomeBreakdown(p, state, liveOps, territory.multiplier);
    const modifiers = [];
    if (state.hasActiveBonus) modifiers.push(`актив +${Math.round((p.activeBonus || 0) * 100)}%`);
    if (state.isGangBoosted) modifiers.push("поддержка банды");
    if (territory.isControlled) modifiers.push(`район +${Math.round((territory.multiplier - 1) * 100)}%`);
    ownedFields.push({
      name: `✅ ${p.name}`,
      value: joinLines([
        `ID: **${id}**`,
        `Чистыми: **${fmtMoney(income.hourlyNet)}/час**`,
        `Сост. / Запасы: **${state.projectedCondition}% / ${state.projectedSupplies}%**`,
        `Район: **${territory.districtName || "—"}**`,
        `Эффективность: **${Math.round(state.efficiency * 100)}%**`,
        `Модификаторы: ${modifiers.length ? modifiers.join(" • ") : "без бонусов"}`,
        `Собрано всего: **${fmtMoney(ownedRow.total_collected || 0)}**`,
      ]),
      inline: false,
    });
  }

  const overview = new EmbedBuilder()
    .setTitle("🏢 Бизнесы San Andreas")
    .setDescription(joinLines([
      `У тебя бизнесов: **${ownedFields.length}** из **${Object.keys(PROPERTIES).length}**.`,
      liveOps.active_event_name ? `Ивент: **${liveOps.active_event_name}**` : null,
      liveOps.active_event_message || null,
    ]))
    .addFields(
      { name: "Твои бизнесы", value: `${ownedFields.length}`, inline: true },
      { name: "Свободно на рынке", value: `${marketFields.length}`, inline: true },
      { name: "Полезно", value: "/bizstats • /mbizstats • /bizrun", inline: true }
    )
    .setColor(0x2ecc71)
    .setFooter({ text: "Покупка: /buybiz id:<business> • Работа: /bizrun id:<business> • Сбор: /collectincome • Обслуживание: /maintainbiz [id]" })
    .setTimestamp();

  const embeds = [overview];
  if (ownedFields.length) {
    embeds.push(
      ...buildPagedFieldEmbeds({
        title: "🏦 Твои бизнесы",
        description: "Подробная сводка по доходности, состоянию и бонусам.",
        color: 0x16a34a,
        fields: ownedFields,
        fieldsPerPage: 4,
        footer: "Детали по одному бизнесу: /mbizstats id:<business>",
      })
    );
  }
  if (marketFields.length) {
    embeds.push(
      ...buildPagedFieldEmbeds({
        title: "🛍️ Рынок бизнесов",
        description: "Доступные точки для покупки.",
        color: 0x22c55e,
        fields: marketFields,
        fieldsPerPage: 4,
        footer: "Покупка: /buybiz id:<business>",
      })
    );
  }

  await interaction.reply({ embeds: embeds.slice(0, 10) });
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

  const opKey = makeInteractionOpKey(interaction, "buy_property");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "buy_property", userId, null, prop.price, opKey, { property_id: bizId });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, -prop.price);
    await dbRun(
      db,
      `INSERT INTO samp_properties(user_id, property_id, last_maintained, last_state_tick) VALUES(?, ?, datetime('now'), datetime('now'))`,
      [userId, bizId]
    );
  });

  const after = await getSampUser(db, userId);
  await interaction.reply(
    `🏢 Ты купил **${prop.name}** за **${fmtMoney(prop.price)}**!\n` +
    `База: **${fmtMoney(prop.income)}/час** | Расходы: **${fmtMoney(prop.upkeep || 0)}/час**\n` +
    `Для максимума держи бизнес в порядке через **/maintainbiz**.\n` +
    `Баланс: **${fmtMoney(after.money)}**`
  );
}

async function handleCollectIncome(interaction, db) {
  const userId = interaction.user.id;
  const props = await dbAll(
    db,
    "SELECT property_id, last_collected, condition, supplies, last_maintained, last_state_tick, total_collected, gang_boost_until FROM samp_properties WHERE user_id = ?",
    [userId]
  );
  if (!props || props.length === 0) { await interaction.reply({ content: "У тебя нет бизнесов. Смотри /businesses.", ephemeral: true }); return; }

  await interaction.deferReply();
  const now = new Date();
  const liveOps = await getSampLiveOpsConfig(db);
  const membership = await getUserGangMembership(db, userId);
  const territoryControlMap = await getTerritoryControlMap(db);
  const summaryLines = [];
  const plannedCollections = [];
  let totalGross = 0;
  let totalUpkeep = 0;
  let totalNet = 0;

  for (const row of props) {
    const prop = PROPERTIES[row.property_id];
    if (!prop) continue;

    const state = getBusinessState(prop, row, now);
    if (state.hoursElapsed < 0.1) continue;

    const territory = getTerritoryBoost(prop, territoryControlMap, membership?.gang_id);
    const income = getBusinessIncomeBreakdown(prop, state, liveOps, territory.multiplier);
    totalGross += income.gross;
    totalUpkeep += income.upkeep;
    totalNet += income.net;

    summaryLines.push(
      `• **${prop.name}**: ${fmtMoney(income.net)} чистыми (${Math.round(state.efficiency * 100)}% эфф.${territory.isControlled ? `, ${territory.districtName} +${Math.round((territory.multiplier - 1) * 100)}%` : ""})`
    );
    plannedCollections.push({
      propertyId: row.property_id,
      projectedCondition: state.projectedCondition,
      projectedSupplies: state.projectedSupplies,
      net: income.net,
    });
  }

  if (summaryLines.length === 0) { await interaction.editReply("⏳ Ещё рано. Подожди хотя бы несколько минут."); return; }

  await withTx(db, async () => {
    if (totalNet > 0) {
      const insertedIncome = await addLedgerUnique(db, "property_income", null, userId, totalNet, makeInteractionOpKey(interaction, "property_income"), {
        gross: totalGross,
        upkeep: totalUpkeep,
        properties: summaryLines.length,
      });
      if (!insertedIncome) throw new Error("DUPLICATE_OPERATION");
    }
    if (totalUpkeep > 0) {
      const insertedUpkeep = await addLedgerUnique(db, "property_upkeep", userId, null, totalUpkeep, makeInteractionOpKey(interaction, "property_upkeep"), { properties: summaryLines.length });
      if (!insertedUpkeep) throw new Error("DUPLICATE_OPERATION");
    }

    for (const item of plannedCollections) {
      await dbRun(
        db,
        `UPDATE samp_properties
         SET last_collected = datetime('now'),
             condition = ?,
             supplies = ?,
             last_state_tick = datetime('now'),
             total_collected = COALESCE(total_collected, 0) + ?
         WHERE user_id = ? AND property_id = ?`,
        [item.projectedCondition, item.projectedSupplies, item.net, userId, item.propertyId]
      );
    }

    if (totalNet > 0) {
      await adjustMoney(db, userId, totalNet);
    }
  });

  const after = await getSampUser(db, userId);
  const lines = summaryLines.slice(0, 6).join("\n");
  const moreLine = summaryLines.length > 6 ? `\n…и ещё ${summaryLines.length - 6}` : "";
  const eventLine = liveOps.active_event_name ? `\nИвент: **${liveOps.active_event_name}**` : "";
  await interaction.editReply(
    `💰 Доход с бизнесов собран.\n${lines}${moreLine}\n\n` +
    `Валовая выручка: **${fmtMoney(totalGross)}**\n` +
    `Расходы и обслуживание: **-${fmtMoney(totalUpkeep)}**\n` +
    `Начислено: **+${fmtMoney(totalNet)}**\n` +
    `Баланс: **${fmtMoney(after.money)}**${eventLine}`
  );
}

async function handleMaintainBiz(interaction, db) {
  const userId = interaction.user.id;
  const targetBizId = String(interaction.options.getString("id", false) || "").toLowerCase();
  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }

  const allProps = await dbAll(
    db,
    "SELECT property_id, last_collected, condition, supplies, last_maintained, last_state_tick, gang_boost_until FROM samp_properties WHERE user_id = ?",
    [userId]
  );
  if (!allProps || allProps.length === 0) { await interaction.reply({ content: "У тебя нет бизнесов. Смотри /businesses.", ephemeral: true }); return; }

  const props = targetBizId ? allProps.filter((row) => row.property_id === targetBizId) : allProps;
  if (props.length === 0) { await interaction.reply({ content: "Такого бизнеса у тебя нет.", ephemeral: true }); return; }

  const now = new Date();
  let totalCost = 0;
  const updates = [];
  for (const row of props) {
    const prop = PROPERTIES[row.property_id];
    if (!prop) continue;
    const state = getBusinessState(prop, row, now);
    const cost = getBusinessMaintenanceCost(prop, state);
    if (cost <= 0) continue;
    totalCost += cost;
    updates.push({ propertyId: row.property_id, prop, cost });
  }

  if (updates.length === 0) { await interaction.reply({ content: "Все выбранные бизнесы уже в порядке.", ephemeral: true }); return; }
  if (Number(user.money) < totalCost) { await interaction.reply({ content: `Нужно **${fmtMoney(totalCost)}**, а у тебя **${fmtMoney(user.money)}**.`, ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "property_maintenance");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "property_maintenance", userId, null, totalCost, opKey, {
      properties: updates.map((item) => item.propertyId),
      count: updates.length,
    });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, -totalCost);
    for (const update of updates) {
      await dbRun(
        db,
        `UPDATE samp_properties
         SET condition = 100,
             supplies = 100,
             last_maintained = datetime('now'),
             last_state_tick = datetime('now')
         WHERE user_id = ? AND property_id = ?`,
        [userId, update.propertyId]
      );
    }
  });

  const after = await getSampUser(db, userId);
  const restored = updates.slice(0, 6).map((item) => item.prop.name).join(", ");
  const more = updates.length > 6 ? ` и ещё ${updates.length - 6}` : "";
  await interaction.reply(
    `🧰 Обслуживание завершено: **${restored}${more}**\n` +
    `Потрачено: **-${fmtMoney(totalCost)}**\n` +
    `Все выбранные бизнесы восстановлены до **100% состояния** и **100% запасов**.\n` +
    `Баланс: **${fmtMoney(after.money)}**`
  );
}

async function handleBizRun(interaction, db) {
  const userId = interaction.user.id;
  const bizId = String(interaction.options.getString("id", true)).toLowerCase();
  const prop = PROPERTIES[bizId];
  if (!prop) { await interaction.reply({ content: "Такого бизнеса нет.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }

  const property = await getBusinessRow(db, userId, bizId);
  if (!property) { await interaction.reply({ content: "У тебя нет этого бизнеса.", ephemeral: true }); return; }

  const cooldownAction = `bizrun:${bizId}`;
  const cooldown = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?", [userId, cooldownAction]);
  if (cooldown && Number(cooldown.ready_at) > nowMs()) {
    const leftMin = Math.ceil((Number(cooldown.ready_at) - nowMs()) / 60000);
    await interaction.reply({ content: `⏳ Повторить работу по бизнесу можно через **${leftMin} мин**.`, ephemeral: true });
    return;
  }

  const operation = getBusinessOperation(bizId);
  const liveOps = await getSampLiveOpsConfig(db);
  const membership = await getUserGangMembership(db, userId);
  const territoryControlMap = await getTerritoryControlMap(db);
  const now = new Date();
  const state = getBusinessState(prop, property, now);
  const territory = getTerritoryBoost(prop, territoryControlMap, membership?.gang_id);
  const rewardBase = randInt(operation.reward[0], operation.reward[1]);
  const payout = Math.max(500, Math.floor(rewardBase * Math.max(0.65, state.efficiency) * Number(liveOps.business_run_multiplier || 1) * territory.multiplier));
  const repGain = Math.max(0, Math.floor((operation.repGain || 0) * Number(liveOps.rep_multiplier || 1)));
  const nextCondition = Math.min(100, state.projectedCondition + operation.conditionGain + (state.isGangBoosted ? 3 : 0));
  const nextSupplies = Math.min(100, state.projectedSupplies + operation.suppliesGain + (state.isGangBoosted ? 5 : 0));

  const opKey = makeInteractionOpKey(interaction, "business_run");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "business_run", null, userId, payout, opKey, { business_id: bizId, label: operation.label, rep_gain: repGain });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, payout);
    if (repGain > 0) {
      await dbRun(db, `UPDATE samp_users SET rep = rep + ?, updated_at = datetime('now') WHERE user_id = ?`, [repGain, userId]);
    }
    await dbRun(
      db,
      `UPDATE samp_properties
       SET condition = ?,
           supplies = ?,
           last_state_tick = datetime('now')
       WHERE user_id = ? AND property_id = ?`,
      [nextCondition, nextSupplies, userId, bizId]
    );
    await dbRun(
      db,
      `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)
       ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`,
      [userId, cooldownAction, nowMs() + operation.cooldownMs]
    );
  });

  const after = await getSampUser(db, userId);
  const boostText = state.isGangBoosted ? "\nПоддержка банды усилила операцию." : "";
  const territoryText = territory.isControlled ? `\nКонтроль района ${territory.districtName} дал бонус +${Math.round((territory.multiplier - 1) * 100)}%.` : "";
  const eventText = liveOps.active_event_name ? `\nИвент: **${liveOps.active_event_name}**` : "";
  await interaction.reply(
    `🏢 Ты **${operation.label}** у бизнеса **${prop.name}**.\n` +
    `Выручка: **+${fmtMoney(payout)}** | Репутация: **+${repGain}**\n` +
    `Состояние: **${nextCondition}%** | Запасы: **${nextSupplies}%**${boostText}${territoryText}\n` +
    `Баланс: **${fmtMoney(after.money)}**${eventText}`
  );
}

// --- Car Tuning ---
function formatTuningProgressLine(progress) {
  const next = progress?.next || getNextTuningLevelProgress(progress?.exp || 0);
  if (!next || next.level >= TUNE_LEVEL_MAX) {
    return `Тюнинг-уровень: **${progress?.level || TUNE_LEVEL_MAX}/${TUNE_LEVEL_MAX}** (макс.)`;
  }
  return `Тюнинг-уровень: **${progress?.level || 1}/${TUNE_LEVEL_MAX}** • XP: **${next.currentExp}/${next.nextLevelExp}**`;
}

function formatInstalledPartLabel(part) {
  return `${part.name} • ${part.durability}% • ${formatTuningPartStatSummary(part)}`;
}

async function handleTuneInspect(interaction, db) {
  const userId = interaction.user.id;
  const carId = String(interaction.options.getString("car", true)).toLowerCase();
  const car = CARS[carId];
  if (!car) { await interaction.reply({ content: "Такой тачки нет.", ephemeral: true }); return; }

  const owned = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", [userId, carId]);
  if (!owned) { await interaction.reply({ content: "У тебя нет этой тачки.", ephemeral: true }); return; }

  const [profile, progress, raceStats, cosmetics] = await Promise.all([
    getCarVehicleProfile(db, userId, carId),
    getOrCreateCarTuningProgress(db, userId, carId),
    getUserRaceStats(db, userId),
    getUserCosmetics(db, userId),
  ]);

  const installedNames = profile.installedParts.length
    ? profile.installedParts.map((part) => `• ${formatInstalledPartLabel(part)}`).join("\n")
    : "—";
  const lockedParts = listTuningParts()
    .filter((part) => !profile.installedParts.some((installed) => installed.id === part.id))
    .map((part) => ({ part, status: getTuningRequirementStatus(part, progress, raceStats) }))
    .filter(({ status }) => !status.ok)
    .slice(0, 4)
    .map(({ part, status }) => `• ${part.name} — ${formatTuningRequirementStatus(part, status)}`)
    .join("\n") || "—";

  const embed = new EmbedBuilder()
    .setTitle(`🔧 Tune Bay — ${profile.name}`)
    .setDescription(joinLines([
      `ID: **${carId}** • Сборка: **${profile.buildType}**`,
      formatTuningProgressLine(progress),
    ]))
    .addFields(
      {
        name: "📊 Статы",
        value: joinLines([
          `Скорость: **${profile.topSpeed}**${profile.topSpeedBonus > 0 ? ` (база ${profile.baseTopSpeed} + ${profile.topSpeedBonus})` : ""}`,
          `Старт: **${profile.launch}** | Зацеп: **${profile.grip}**`,
          `Стабильность: **${profile.stability}** | Ресурс: **${profile.durability}**`,
          `Износ сборки: **${profile.averageDurability}%** | Race score: **${profile.raceScore}**`,
        ]),
        inline: false,
      },
      {
        name: "🧩 Установлено",
        value: installedNames,
        inline: false,
      },
      {
        name: "🔒 Следующие анлоки",
        value: lockedParts,
        inline: false,
      }
    )
    .setFooter({ text: "Установка: /tune install car:<id> part:<id> • Сервис: /tune maintain car:<id>" })
    .setTimestamp();

  applyUserCosmeticsToEmbed(embed, cosmetics, interaction.user.username, 0x2563eb);
  await interaction.reply({ embeds: [embed] });
}

async function handleTuneInstall(interaction, db, { partOptionName = "part" } = {}) {
  const userId = interaction.user.id;
  const carId = String(interaction.options.getString("car", true)).toLowerCase();
  const upgradeId = String(interaction.options.getString(partOptionName, true)).toLowerCase();
  const car = CARS[carId]; const upgrade = getTuningPart(upgradeId);
  if (!car) { await interaction.reply({ content: "Такой тачки нет.", ephemeral: true }); return; }
  if (!upgrade) { await interaction.reply({ content: "Такого тюнинга нет.", ephemeral: true }); return; }

  const owned = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", [userId, carId]);
  if (!owned) { await interaction.reply({ content: "У тебя нет этой тачки.", ephemeral: true }); return; }

  const installedRows = await getInstalledCarUpgradeRows(db, userId, carId);
  const alreadyTuned = installedRows.find((row) => row.upgrade_id === upgradeId);
  if (alreadyTuned) { await interaction.reply({ content: "Этот тюнинг уже установлен.", ephemeral: true }); return; }

  const conflictingPart = installedRows
    .map((row) => getTuningPart(row.upgrade_id))
    .find((part) => part && part.slot === upgrade.slot);
  if (conflictingPart) {
    await interaction.reply({
      content: `Слот уже занят деталью **${conflictingPart.name}**. Сними её через /tune remove car:${carId} part:${conflictingPart.id}.`,
      ephemeral: true,
    });
    return;
  }

  const [progress, raceStats] = await Promise.all([
    getOrCreateCarTuningProgress(db, userId, carId),
    getUserRaceStats(db, userId),
  ]);
  const requirementStatus = getTuningRequirementStatus(upgrade, progress, raceStats);
  if (!requirementStatus.ok) {
    await interaction.reply({ content: formatTuningRequirementStatus(upgrade, requirementStatus), ephemeral: true });
    return;
  }

  const user = await getSampUser(db, userId);
  if (!user || Number(user.money) < upgrade.price) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "tune_install");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "tune_install", userId, null, upgrade.price, opKey, { car_id: carId, upgrade_id: upgradeId, slot: upgrade.slot });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, -upgrade.price);
    await dbRun(
      db,
      `INSERT INTO samp_car_upgrades(user_id, car_id, upgrade_id, durability, installed_at)
       VALUES(?, ?, ?, 100, datetime('now'))`,
      [userId, carId, upgradeId]
    );
  });

  const [after, profile] = await Promise.all([
    getSampUser(db, userId),
    getCarVehicleProfile(db, userId, carId),
  ]);
  await interaction.reply(
    `🔧 Установлен **${upgrade.name}** на **${car.name}**.\n` +
    `${formatTuningPartStatSummary(upgrade)}\n` +
    `Сборка: **${profile.buildType}** • Скорость: **${profile.topSpeed}** • Старт: **${profile.launch}** • Зацеп: **${profile.grip}**\n` +
    `Цена: **${fmtMoney(upgrade.price)}** | Баланс: **${fmtMoney(after.money)}**`
  );
}

async function handleTuneRemove(interaction, db) {
  const userId = interaction.user.id;
  const carId = String(interaction.options.getString("car", true)).toLowerCase();
  const partId = String(interaction.options.getString("part", true)).toLowerCase();
  const part = getTuningPart(partId);
  if (!part) { await interaction.reply({ content: "Такой детали нет.", ephemeral: true }); return; }

  const installedRows = await getInstalledCarUpgradeRows(db, userId, carId);
  const installed = installedRows.find((row) => row.upgrade_id === partId);
  if (!installed) { await interaction.reply({ content: "Эта деталь не установлена на выбранную тачку.", ephemeral: true }); return; }

  const durability = Math.max(0, Math.floor(Number(installed.durability || 100)));
  const refund = Math.max(0, Math.round(part.price * TUNE_REMOVE_REFUND_RATIO * (durability / 100)));
  const opKey = makeInteractionOpKey(interaction, "tune_remove");
  await withTx(db, async () => {
    await dbRun(db, "DELETE FROM samp_car_upgrades WHERE user_id = ? AND car_id = ? AND upgrade_id = ?", [userId, carId, partId]);
    if (refund > 0) {
      const inserted = await addLedgerUnique(db, "tune_remove", null, userId, refund, opKey, { car_id: carId, upgrade_id: partId, durability });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await adjustMoney(db, userId, refund);
    }
  });

  const after = await getSampUser(db, userId);
  await interaction.reply(
    `🧰 Деталь **${part.name}** снята с **${carId}**.\n` +
    `Возврат: **${fmtMoney(refund)}** | Баланс: **${fmtMoney(after.money)}**`
  );
}

async function handleTuneMaintain(interaction, db) {
  const userId = interaction.user.id;
  const carId = String(interaction.options.getString("car", true)).toLowerCase();
  const partId = String(interaction.options.getString("part", false) || "").toLowerCase();
  const installedRows = await getInstalledCarUpgradeRows(db, userId, carId);
  if (!installedRows.length) { await interaction.reply({ content: "На этой тачке пока нет деталей для обслуживания.", ephemeral: true }); return; }

  const targetRows = partId
    ? installedRows.filter((row) => row.upgrade_id === partId)
    : installedRows;
  if (!targetRows.length) { await interaction.reply({ content: "Эта деталь не установлена на выбранную тачку.", ephemeral: true }); return; }

  const costBreakdown = targetRows
    .map((row) => {
      const part = getTuningPart(row.upgrade_id);
      if (!part) return null;
      const durability = Math.max(0, Math.floor(Number(row.durability || 100)));
      return {
        part,
        durability,
        cost: Math.max(0, Math.round(part.price * 0.35 * ((100 - durability) / 100))),
      };
    })
    .filter(Boolean);

  const totalCost = costBreakdown.reduce((sum, item) => sum + item.cost, 0);
  if (totalCost <= 0) {
    await interaction.reply({ content: "Все выбранные детали уже в идеальном состоянии.", ephemeral: true });
    return;
  }

  const user = await getSampUser(db, userId);
  if (!user || Number(user.money) < totalCost) { await interaction.reply({ content: "Не хватает виртов на обслуживание.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "tune_maintain");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "tune_maintain", userId, null, totalCost, opKey, {
      car_id: carId,
      upgrade_ids: costBreakdown.map((item) => item.part.id),
    });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, -totalCost);
    for (const item of costBreakdown) {
      await dbRun(
        db,
        `UPDATE samp_car_upgrades SET durability = 100 WHERE user_id = ? AND car_id = ? AND upgrade_id = ?`,
        [userId, carId, item.part.id]
      );
    }
  });

  const after = await getSampUser(db, userId);
  await interaction.reply(
    `🛠️ Обслуживание **${carId}** завершено.\n` +
    `Деталей восстановлено: **${costBreakdown.length}** | Списано: **${fmtMoney(totalCost)}**\n` +
    `Баланс: **${fmtMoney(after.money)}**`
  );
}

async function handleTuneCommand(interaction, db) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "install") return handleTuneInstall(interaction, db, { partOptionName: "part" });
  if (subcommand === "inspect") return handleTuneInspect(interaction, db);
  if (subcommand === "remove") return handleTuneRemove(interaction, db);
  if (subcommand === "maintain") return handleTuneMaintain(interaction, db);
  await interaction.reply({ content: "Неизвестная команда тюнинга.", ephemeral: true });
}

async function handleTuneCar(interaction, db) {
  return handleTuneInstall(interaction, db, { partOptionName: "upgrade" });
}

function buildGarageSwitchCustomId(carId) {
  return `${GARAGE_SWITCH_BUTTON_PREFIX}${String(carId)}`;
}

function getGarageSwitchCarId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(GARAGE_SWITCH_BUTTON_PREFIX)) return null;
  return raw.slice(GARAGE_SWITCH_BUTTON_PREFIX.length).trim().toLowerCase() || null;
}

function getSwitchCarErrorMessage(code) {
  if (code === "NO_PROFILE") return "Сначала зарегистрируйся через /reg.";
  if (code === "UNKNOWN_CAR") return "Такой тачки нет.";
  if (code === "NOT_OWNED") return "У тебя нет этой тачки в гараже.";
  return "Не удалось сменить активную тачку.";
}

async function setActiveGarageCar(db, userId, carId) {
  const normalizedCarId = String(carId || "").toLowerCase();
  const car = CARS[normalizedCarId];
  if (!car) return { ok: false, code: "UNKNOWN_CAR" };

  return withTx(db, async () => {
    const user = await getSampUser(db, userId);
    if (!user) return { ok: false, code: "NO_PROFILE" };

    const owned = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", [String(userId), normalizedCarId]);
    if (!owned) return { ok: false, code: "NOT_OWNED" };

    if (String(user.car_id || "") === normalizedCarId) {
      return { ok: true, changed: false, carId: normalizedCarId, car };
    }

    await dbRun(
      db,
      "UPDATE samp_users SET car_id = ?, updated_at = datetime('now') WHERE user_id = ?",
      [normalizedCarId, String(userId)]
    );

    return { ok: true, changed: true, carId: normalizedCarId, car };
  });
}

function buildGarageSwitchRows(orderedCars, activeCarId) {
  const switchableCars = (orderedCars || [])
    .filter((row) => row.car_id !== activeCarId && CARS[row.car_id])
    .slice(0, GARAGE_SWITCH_BUTTON_LIMIT);

  if (!switchableCars.length) return [];

  return [
    new ActionRowBuilder().addComponents(
      switchableCars.map((row) =>
        new ButtonBuilder()
          .setCustomId(buildGarageSwitchCustomId(row.car_id))
          .setLabel(CARS[row.car_id].name.slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      )
    ),
  ];
}

async function buildGarageReplyPayload(db, userId, username) {
  const cars = await dbAll(db, "SELECT car_id FROM samp_garage WHERE user_id = ?", [userId]);
  if (!cars || cars.length === 0) return null;

  const user = await getSampUser(db, userId);
  const cosmetics = await getUserCosmetics(db, userId);
  const carFields = [];
  let tunedCount = 0;
  const orderedCars = [...cars].sort((left, right) => {
    if (left.car_id === user?.car_id) return -1;
    if (right.car_id === user?.car_id) return 1;
    return 0;
  });

  for (const row of orderedCars) {
    const car = CARS[row.car_id];
    if (!car) continue;
    const [profile, progress] = await Promise.all([
      getCarVehicleProfile(db, userId, row.car_id),
      getOrCreateCarTuningProgress(db, userId, row.car_id),
    ]);
    const upgradeNames = profile.installedParts.length
      ? profile.installedParts.map((part) => `${part.name} (${part.durability}%)`).join(", ")
      : "—";
    if (profile.installedParts.length > 0) tunedCount += 1;
    carFields.push({
      name: `${row.car_id === user?.car_id ? "🟢 Активная" : "🚘"} ${car.name}`,
      value: joinLines([
        `ID: **${row.car_id}**`,
        `Сборка: **${profile.buildType}** • Скорость: **${profile.topSpeed}** (${profile.topSpeedBonus > 0 ? `база ${profile.baseTopSpeed} + ${profile.topSpeedBonus}` : `база ${profile.baseTopSpeed}`})`,
        `Старт/зацеп/стабильность: **${profile.launch} / ${profile.grip} / ${profile.stability}**`,
        `Тюнинг-уровень: **${progress.level}/${TUNE_LEVEL_MAX}** • Износ: **${profile.averageDurability}%**`,
        `Тюнинг: ${upgradeNames}`,
      ]),
      inline: false,
    });
  }

  const switchRows = buildGarageSwitchRows(orderedCars, user?.car_id);
  const hasSwitchShortcuts = switchRows.length > 0;
  const shortcutHint = hasSwitchShortcuts
    ? " Быстрый выбор доступен на кнопках ниже, остальные машины переключай через /switchcar."
    : "";

  const overview = new EmbedBuilder()
    .setTitle("🏎️ Твой гараж")
    .setDescription(`Машины отсортированы с активной тачкой сверху.${shortcutHint}`)
    .addFields(
      { name: "Всего машин", value: `${carFields.length}`, inline: true },
      { name: "С тюнингом", value: `${tunedCount}`, inline: true },
      { name: "Активная", value: user?.car_id ? `**${user.car_id}**` : "—", inline: true }
    )
    .setTimestamp();

  applyUserCosmeticsToEmbed(overview, cosmetics, username, 0x3498db);

  const detailEmbeds = buildPagedFieldEmbeds({
    title: "🚗 Машины в гараже",
    description: "Гараж показывает готовую сборку машины: скорость, старт, зацеп, стабильность и износ деталей.",
    color: 0x2563eb,
    fields: carFields,
    fieldsPerPage: 4,
    footer: "Тюнинг: /tune inspect car:<id> | Установка: /tune install car:<id> part:<id> | Смена активной: /switchcar car:<id>",
  }).map((embed) => applyUserCosmeticsToEmbed(embed, cosmetics, username, 0x2563eb));

  return {
    embeds: [overview, ...detailEmbeds].slice(0, 10),
    components: switchRows,
  };
}

async function handleSwitchCar(interaction, db) {
  const userId = interaction.user.id;
  const carId = String(interaction.options.getString("car", true)).toLowerCase();
  const result = await setActiveGarageCar(db, userId, carId);

  if (!result.ok) {
    await interaction.reply({ content: getSwitchCarErrorMessage(result.code), ephemeral: true });
    return;
  }

  if (!result.changed) {
    await interaction.reply(`🚘 **${result.car.name}** уже активна.`);
    return;
  }

  await interaction.reply(`🚘 Активная тачка изменена: **${result.car.name}**.\nID: **${result.carId}**`);
}

async function handleGarage(interaction, db) {
  const userId = interaction.user.id;
  const payload = await buildGarageReplyPayload(db, userId, interaction.user.username);
  if (!payload) { await interaction.reply({ content: "Твой гараж пуст.", ephemeral: true }); return; }

  const shouldCollectButtons = payload.components.length > 0;
  const reply = await interaction.reply({
    embeds: payload.embeds,
    components: payload.components,
    fetchReply: shouldCollectButtons,
  });

  if (!shouldCollectButtons || !reply || typeof reply.createMessageComponentCollector !== "function") return;

  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

  collector.on("collect", async (btnInt) => {
    if (btnInt.user.id !== userId) {
      await btnInt.reply({ content: "Эта панель не для тебя. Используй /garage или /switchcar у себя.", ephemeral: true });
      return;
    }

    const carId = getGarageSwitchCarId(btnInt.customId);
    if (!carId) {
      await btnInt.reply({ content: "Эта кнопка больше неактуальна.", ephemeral: true });
      return;
    }

    const result = await setActiveGarageCar(db, userId, carId);
    if (!result.ok) {
      await btnInt.reply({ content: getSwitchCarErrorMessage(result.code), ephemeral: true });
      return;
    }

    const refreshedPayload = await buildGarageReplyPayload(db, userId, interaction.user.username);
    if (!refreshedPayload) {
      await btnInt.update({ content: "Твой гараж пуст.", embeds: [], components: [] });
      return;
    }

    const content = result.changed
      ? `🚘 Активная тачка: **${result.car.name}**.`
      : `🚘 **${result.car.name}** уже активна.`;

    await btnInt.update({ content, embeds: refreshedPayload.embeds, components: refreshedPayload.components });
  });

  collector.on("end", async () => {
    await interaction.editReply({ components: [] }).catch(() => {});
  });
}

// --- Bounty ---
async function handleBounty(interaction, db) {
  const userId = interaction.user.id;
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);
  if (target.bot || target.id === userId) { await interaction.reply({ content: "Некорректная цель.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user || Number(user.money) < amount) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "bounty_place");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "bounty_place", userId, null, amount, opKey, { target: target.id });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, -amount);
    await dbRun(db, `INSERT INTO samp_bounties(target_user_id, placed_by, amount) VALUES(?, ?, ?)`, [target.id, userId, amount]);
  });

  await interaction.reply(`🎯 Награда **${fmtMoney(amount)}** за голову <@${target.id}>!\nКто победит в дуэли — заберёт всё.`);
}

async function handleBountyList(interaction, db) {
  const bounties = await dbAll(db, "SELECT target_user_id, SUM(amount) as total FROM samp_bounties WHERE status = 'active' GROUP BY target_user_id ORDER BY total DESC LIMIT 10", []);
  if (!bounties || bounties.length === 0) { await interaction.reply("Нет активных наград. Стало скучно? /bounty!"); return; }

  const lines = bounties.map((b, i) => `${i < 3 ? ["🥇", "🥈", "🥉"][i] : `\`${i+1}.\``} <@${b.target_user_id}> — **${fmtMoney(b.total)}**`);
  const embeds = buildPagedLineEmbeds({
    title: "🎯 Разыскиваются",
    description: "Актуальные награды за головы на сервере.",
    color: 0xe74c3c,
    lines,
    linesPerPage: 10,
    footer: "Назначить награду: /bounty user:@игрок amount:<$>",
  });
  await interaction.reply({ embeds });
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
  const guildId = interaction.guild?.id || interaction.guildId || null;
  const tierKey = interaction.options.getString("tier", true);
  const tier = HEIST_TIERS[tierKey];
  if (!tier) { await interaction.reply({ content: "Неизвестный тип ограбления.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  if (Number(user.jail_until || 0) > nowMs()) { await interaction.reply({ content: "Ты в тюрьме!", ephemeral: true }); return; }

  const organizerReservation = await tryReserveHeistParticipant(db, userId);
  if (!organizerReservation.ok) {
    await interaction.reply({ content: getHeistLockMessage(organizerReservation), ephemeral: true });
    return;
  }

  const participants = new Set([userId]);

  const organizerCooldownMs = await getUserHeistCooldownMs(db, guildId, userId);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("heist_join").setLabel(`Присоединиться (${participants.size}/${tier.maxPlayers})`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("heist_start").setLabel("Начать!").setStyle(ButtonStyle.Primary)
  );

  const embed = new EmbedBuilder()
    .setTitle(`🏦 Ограбление: ${tier.name}`)
    .setDescription(`Организатор: <@${userId}>\nНужно: **${tier.minPlayers}-${tier.maxPlayers}** игроков\nВыплата: **${fmtMoney(tier.payout[0])} — ${fmtMoney(tier.payout[1])}**\nРиск: **${Math.round(tier.failChance * 100)}%**\nКулдаун после запуска: **${formatDuration(organizerCooldownMs)}** для тебя, у опытных игроков может снизиться до **${formatDuration(HEIST_MIN_COOLDOWN_MS)}**\n\nУчастники: <@${userId}>`)
    .setColor(0x9b59b6).setFooter({ text: "60 секунд на сбор команды" });

  const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

  const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

  collector.on("collect", async (btnInt) => {
    if (btnInt.customId === "heist_join") {
      if (participants.has(btnInt.user.id)) { await btnInt.reply({ content: "Ты уже в команде.", ephemeral: true }); return; }
      if (participants.size >= tier.maxPlayers) { await btnInt.reply({ content: "Команда полная.", ephemeral: true }); return; }
      const joinUser = await getSampUser(db, btnInt.user.id);
      if (!joinUser) { await btnInt.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
      if (Number(joinUser.jail_until || 0) > nowMs()) { await btnInt.reply({ content: "Ты сейчас в тюрьме и не можешь идти на дело.", ephemeral: true }); return; }
      const joinReservation = await tryReserveHeistParticipant(db, btnInt.user.id);
      if (!joinReservation.ok) { await btnInt.reply({ content: getHeistLockMessage(joinReservation), ephemeral: true }); return; }
      participants.add(btnInt.user.id);
      const joiningCooldownMs = await getUserHeistCooldownMs(db, guildId, btnInt.user.id);
      const updRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("heist_join").setLabel(`Присоединиться (${participants.size}/${tier.maxPlayers})`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("heist_start").setLabel("Начать!").setStyle(ButtonStyle.Primary)
      );
      embed.setDescription(`Организатор: <@${userId}>\nНужно: **${tier.minPlayers}-${tier.maxPlayers}** игроков\nВыплата: **${fmtMoney(tier.payout[0])} — ${fmtMoney(tier.payout[1])}**\nРиск: **${Math.round(tier.failChance * 100)}%**\nКулдаун после запуска: **${formatDuration(Math.min(organizerCooldownMs, joiningCooldownMs))} — ${formatDuration(Math.max(organizerCooldownMs, joiningCooldownMs))}** с учётом ачивок\n\nУчастники: ${[...participants].map(p => `<@${p}>`).join(", ")}`);
      await btnInt.update({ embeds: [embed], components: [updRow] });
    } else if (btnInt.customId === "heist_start") {
      if (btnInt.user.id !== userId) { await btnInt.reply({ content: "Только организатор может начать.", ephemeral: true }); return; }
      if (participants.size < tier.minPlayers) { await btnInt.reply({ content: `Нужно минимум ${tier.minPlayers} игроков.`, ephemeral: true }); return; }
      collector.stop("started");

      const participantIds = [...participants];
      const cooldownEntries = await buildHeistCooldownEntries(db, guildId, participantIds);
      const cooldownText = formatHeistCooldownSummary(cooldownEntries);

      const failed = Math.random() < tier.failChance;
      if (failed) {
        await withTx(db, async () => {
          await releaseHeistParticipants(db, participantIds);
          await applyHeistCooldown(db, participantIds, { entries: cooldownEntries });
          for (const pid of participantIds) {
            await dbRun(db, `UPDATE samp_users SET jail_until = ? WHERE user_id = ?`, [nowMs() + tier.jailMs, pid]);
          }
        });
        const jailMin = Math.ceil(tier.jailMs / 60_000);
        const failEmbed = new EmbedBuilder().setTitle(`🚔 Провал: ${tier.name}`).setDescription(`Полиция перехватила команду!\nВсе участники в тюрьме на **${jailMin} мин**.\nСледующая попытка через **${cooldownText}**.`).setColor(0xe74c3c);
        await btnInt.update({ embeds: [failEmbed], components: [] });
      } else {
        const totalPayout = randInt(tier.payout[0], tier.payout[1]);
        const share = Math.floor(totalPayout / participants.size);
        await withTx(db, async () => {
          await releaseHeistParticipants(db, participantIds);
          await applyHeistCooldown(db, participantIds, { entries: cooldownEntries });
          for (const pid of participantIds) {
            await adjustMoney(db, pid, share);
            await addLedger(db, "heist", null, pid, share, { tier: tierKey, crew_size: participantIds.length });
          }
        });
        const winEmbed = new EmbedBuilder().setTitle(`🎉 Успех: ${tier.name}`).setDescription(`Команда взяла **${fmtMoney(totalPayout)}**!\nКаждый получил: **${fmtMoney(share)}**\nСледующий заход через **${cooldownText}**.`).setColor(0x2ecc71);
        await btnInt.update({ embeds: [winEmbed], components: [] });
      }
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason !== "started") {
      await releaseHeistParticipants(db, [...participants]).catch(() => {});
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
      const profile = await getCarVehicleProfile(db, userId, user.car_id);
      if ((profile?.topSpeed || 0) < needed) {
        await interaction.editReply(`Нужна тачка со скоростью ${needed}+. Твоя сборка даёт: ${profile?.topSpeed || 0}.`);
        return;
      }
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
      let lvl = null;
      try {
        lvl = await dbGet(db, "SELECT level FROM user_levels WHERE guild_id = ? AND user_id = ?", [interaction.guild?.id, userId]);
      } catch (_) {
        lvl = null;
      }
      if (!lvl || lvl.level < 20) { await interaction.editReply("Нужен 20+ уровень."); return; }
    }
  }

  const pay = randInt(job.basePay[0], job.basePay[1]);
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "job", null, userId, pay, makeInteractionOpKey(interaction, "job"), { job: job.name });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, pay);
    await dbRun(db, `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, 'job', ?)
      ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`, [userId, nowMs() + 30 * 60_000]);
  });

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

    const opKey = makeInteractionOpKey(interaction, "gang_create");
    await withTx(db, async () => {
      const inserted = await addLedgerUnique(db, "gang_create", userId, null, 50_000, opKey, { name, tag });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await adjustMoney(db, userId, -50_000);
      await dbRun(db, "INSERT INTO samp_gangs(name, tag, leader_id) VALUES(?, ?, ?)", [name, tag, userId]);
      const gang = await dbGet(db, "SELECT id FROM samp_gangs WHERE leader_id = ? ORDER BY id DESC LIMIT 1", [userId]);
      await dbRun(db, "INSERT INTO samp_gang_members(gang_id, user_id, role) VALUES(?, ?, 'leader')", [gang.id, userId]);
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
    const opKey = makeInteractionOpKey(interaction, "gang_deposit");
    await withTx(db, async () => {
      const inserted = await addLedgerUnique(db, "gang_deposit", userId, null, amount, opKey, { gang_id: member.gang_id });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await adjustMoney(db, userId, -amount);
      await dbRun(db, "UPDATE samp_gangs SET treasury = treasury + ? WHERE id = ?", [amount, member.gang_id]);
    });
    await interaction.reply(`💰 Внесено **${fmtMoney(amount)}** в казну банды.`);

  } else if (sub === "supportbiz") {
    const userId = interaction.user.id;
    const target = interaction.options.getUser("user", true);
    const businessId = String(interaction.options.getString("business", true)).toLowerCase();
    const prop = PROPERTIES[businessId];
    if (!prop) { await interaction.reply({ content: "Такого бизнеса нет.", ephemeral: true }); return; }

    const member = await dbGet(db, "SELECT gm.gang_id, gm.role, g.name, g.tag, g.treasury FROM samp_gang_members gm JOIN samp_gangs g ON g.id = gm.gang_id WHERE gm.user_id = ?", [userId]);
    if (!member || member.role !== "leader") { await interaction.reply({ content: "Только лидер банды может поддерживать бизнесы.", ephemeral: true }); return; }

    const targetMember = await dbGet(db, "SELECT 1 FROM samp_gang_members WHERE gang_id = ? AND user_id = ?", [member.gang_id, target.id]);
    if (!targetMember) { await interaction.reply({ content: "Поддерживать можно только бизнес участника твоей банды.", ephemeral: true }); return; }

    const property = await getBusinessRow(db, target.id, businessId);
    if (!property) { await interaction.reply({ content: "У этого игрока нет такого бизнеса.", ephemeral: true }); return; }

  const liveOps = await getSampLiveOpsConfig(db);
  const cost = Math.max(5_000, Math.round((prop.maintainBase || 5_000) * 0.45 * Number(liveOps.gang_support_cost_multiplier || 1)));
    if (Number(member.treasury || 0) < cost) { await interaction.reply({ content: `В казне нужно минимум **${fmtMoney(cost)}**.`, ephemeral: true }); return; }

    const now = new Date();
    const state = getBusinessState(prop, property, now);
    const currentBoostUntil = parseSqliteDate(property.gang_boost_until);
    const startFrom = currentBoostUntil && currentBoostUntil > now ? currentBoostUntil : now;
    const boostUntil = new Date(startFrom.getTime() + GANG_BUSINESS_SUPPORT_MS);
    const nextCondition = Math.min(100, state.projectedCondition + 12);
    const nextSupplies = Math.min(100, state.projectedSupplies + 18);

    const opKey = makeInteractionOpKey(interaction, "gang_business_support");
    await withTx(db, async () => {
      const inserted = await addLedgerUnique(db, "gang_business_support", userId, target.id, cost, opKey, {
        gang_id: member.gang_id,
        property_id: businessId,
        boost_until: toSqliteDate(boostUntil),
      });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await dbRun(db, "UPDATE samp_gangs SET treasury = treasury - ? WHERE id = ?", [cost, member.gang_id]);
      await dbRun(
        db,
        `UPDATE samp_properties
         SET condition = ?,
             supplies = ?,
             last_state_tick = datetime('now'),
             gang_boost_until = ?,
             gang_boosted_by = ?
         WHERE user_id = ? AND property_id = ?`,
        [nextCondition, nextSupplies, toSqliteDate(boostUntil), member.gang_id, target.id, businessId]
      );
    });

    await interaction.reply(
      `🛡️ Банда **[${member.tag}] ${member.name}** поддержала бизнес **${prop.name}** у <@${target.id}>.\n` +
      `Из казны списано: **-${fmtMoney(cost)}**\n` +
      `Бонус активен до: **${toSqliteDate(boostUntil)} UTC**\n` +
      `Состояние: **${nextCondition}%** | Запасы: **${nextSupplies}%**` +
      (liveOps.active_event_name ? `\nИвент: **${liveOps.active_event_name}**` : "")
    );

  } else if (sub === "territories") {
    const territories = await listGangTerritories(db);
    const fields = territories.map((territory) => {
      const owner = territory.gang_name ? `**[${territory.gang_tag}] ${territory.gang_name}**` : "нейтрально";
      return {
        name: `🗺️ ${territory.district_name}`,
        value: joinLines([
          `Владелец: ${owner}`,
          `Давление: **${territory.pressure}%**`,
          `Бонус бизнесам: **+${territory.business_buff_pct}%**`,
          `Бизнесов в районе: **${territory.business_count}**`,
        ]),
        inline: false,
      };
    });
    const embeds = buildPagedFieldEmbeds({
      title: "🗺️ Районы San Andreas",
      description: "Контроль района усиливает бизнесы банды в этой зоне.",
      color: 0xf39c12,
      fields,
      fieldsPerPage: 5,
      footer: "Захват и укрепление: /gcapture district:<район>",
    });
    await interaction.reply({ embeds });

  } else if (sub === "claimterritory") {
    const userId = interaction.user.id;
    const districtId = String(interaction.options.getString("district", true)).toLowerCase();
    const district = TERRITORY_DISTRICTS[districtId];
    if (!district) { await interaction.reply({ content: "Такого района нет.", ephemeral: true }); return; }

    const member = await dbGet(db, "SELECT gm.gang_id, gm.role, g.name, g.tag, g.treasury FROM samp_gang_members gm JOIN samp_gangs g ON g.id = gm.gang_id WHERE gm.user_id = ?", [userId]);
    if (!member || member.role !== "leader") { await interaction.reply({ content: "Только лидер банды может управлять районами.", ephemeral: true }); return; }

    const cooldownAction = `gangterritory:${districtId}`;
    const cooldown = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?", [userId, cooldownAction]);
    if (cooldown && Number(cooldown.ready_at) > nowMs()) {
      const leftMin = Math.ceil((Number(cooldown.ready_at) - nowMs()) / 60000);
      await interaction.reply({ content: `⏳ Следующий ход за район **${district.name}** будет доступен через **${leftMin} мин**.`, ephemeral: true });
      return;
    }

    const current = await dbGet(
      db,
      `SELECT t.district_id, t.gang_id, t.pressure, g.name AS gang_name, g.tag AS gang_tag
       FROM samp_gang_territories t
       LEFT JOIN samp_gangs g ON g.id = t.gang_id
       WHERE t.district_id = ?`,
      [districtId]
    );
    const isOwn = current && Number(current.gang_id) === Number(member.gang_id);
    const isNeutral = !current;
    const actionCost = isNeutral ? district.claimCost : isOwn ? Math.max(8_000, Math.round(district.claimCost * 0.5)) : district.takeoverCost;
    if (Number(member.treasury || 0) < actionCost) {
      await interaction.reply({ content: `В казне нужно минимум **${fmtMoney(actionCost)}**.`, ephemeral: true });
      return;
    }

    let summary = "";
    const territoryAction = isNeutral
      ? "gang_territory_claim"
      : isOwn
        ? "gang_territory_reinforce"
        : (Number(current?.pressure || 0) - TERRITORY_ATTACK_PRESSURE <= 0 ? "gang_territory_takeover" : "gang_territory_attack");
    await withTx(db, async () => {
      const inserted = await addLedgerUnique(db, territoryAction, userId, null, actionCost, makeInteractionOpKey(interaction, territoryAction), {
        gang_id: member.gang_id,
        district_id: districtId,
      });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await dbRun(db, "UPDATE samp_gangs SET treasury = treasury - ? WHERE id = ?", [actionCost, member.gang_id]);

      if (isNeutral) {
        await dbRun(
          db,
          `INSERT INTO samp_gang_territories(district_id, gang_id, pressure, claimed_at, updated_at)
           VALUES(?, ?, ?, datetime('now'), datetime('now'))
           ON CONFLICT(district_id) DO UPDATE SET gang_id = excluded.gang_id, pressure = excluded.pressure, claimed_at = excluded.claimed_at, updated_at = excluded.updated_at`,
          [districtId, member.gang_id, TERRITORY_CAPTURE_PRESSURE]
        );
        summary = `🗺️ Банда **[${member.tag}] ${member.name}** взяла район **${district.name}** под контроль.\nДавление: **${TERRITORY_CAPTURE_PRESSURE}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;
      } else if (isOwn) {
        const nextPressure = Math.min(100, Number(current.pressure || 0) + TERRITORY_REINFORCE_PRESSURE);
        await dbRun(
          db,
          `UPDATE samp_gang_territories SET pressure = ?, updated_at = datetime('now') WHERE district_id = ?`,
          [nextPressure, districtId]
        );
        summary = `🛡️ Банда **[${member.tag}] ${member.name}** укрепила район **${district.name}**.\nДавление: **${nextPressure}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;
      } else {
        const nextPressure = Number(current.pressure || 0) - TERRITORY_ATTACK_PRESSURE;
        if (nextPressure <= 0) {
          await dbRun(
            db,
            `UPDATE samp_gang_territories
             SET gang_id = ?, pressure = ?, claimed_at = datetime('now'), updated_at = datetime('now')
             WHERE district_id = ?`,
            [member.gang_id, TERRITORY_CAPTURE_PRESSURE, districtId]
          );
          summary = `🔥 Банда **[${member.tag}] ${member.name}** перехватила район **${district.name}**.\nНовый контроль: **${TERRITORY_CAPTURE_PRESSURE}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;
        } else {
          await dbRun(
            db,
            `UPDATE samp_gang_territories SET pressure = ?, updated_at = datetime('now') WHERE district_id = ?`,
            [nextPressure, districtId]
          );
          const defender = current?.gang_name && current?.gang_tag
            ? `**[${current.gang_tag}] ${current.gang_name}**`
            : "соперников";
          summary = `⚔️ Банда **[${member.tag}] ${member.name}** продавила защиту района **${district.name}**.\nКонтроль ${defender} упал до **${nextPressure}%**. Район ещё не захвачен.`;
        }
      }

      await dbRun(
        db,
        `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)
         ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`,
        [userId, cooldownAction, nowMs() + GANG_TERRITORY_COOLDOWN_MS]
      );
    });

    await interaction.reply(`${summary}\nКазна: **-${fmtMoney(actionCost)}**`);

  } else if (sub === "info") {
    const userId = interaction.user.id;
    const member = await dbGet(db, "SELECT gang_id FROM samp_gang_members WHERE user_id = ?", [userId]);
    if (!member) { await interaction.reply({ content: "Ты не в банде.", ephemeral: true }); return; }
    const gang = await dbGet(db, "SELECT * FROM samp_gangs WHERE id = ?", [member.gang_id]);
    const members = await dbAll(db, "SELECT user_id, role FROM samp_gang_members WHERE gang_id = ?", [member.gang_id]);
    const support = await dbGet(db, "SELECT COUNT(*) as c FROM samp_properties WHERE gang_boosted_by = ? AND gang_boost_until > datetime('now')", [member.gang_id]);
    const territories = await dbGet(db, "SELECT COUNT(*) as c FROM samp_gang_territories WHERE gang_id = ?", [member.gang_id]);
    const memberList = (members || []).map(m => `• <@${m.user_id}> — ${m.role}`).join("\n");
    const embed = new EmbedBuilder()
      .setTitle(`[${gang.tag}] ${gang.name}`)
      .setDescription("Сводка по казне, районам и составу банды.")
      .addFields(
        { name: "Лидер", value: `<@${gang.leader_id}>`, inline: true },
        { name: "Казна", value: fmtMoney(gang.treasury), inline: true },
        { name: "Поддержка бизнесов", value: `${support?.c || 0} актив.`, inline: true },
        { name: "Районы", value: `${territories?.c || 0} под контролем`, inline: true },
        { name: `Участники (${members.length})`, value: memberList || "—" }
      ).setColor(0x2ecc71).setTimestamp();
    const cosmetics = await getUserCosmetics(db, userId);
    applyUserCosmeticsToEmbed(embed, cosmetics, interaction.user.username, 0x2ecc71);
    await interaction.reply({ embeds: [embed] });

  } else if (sub === "top") {
    const gangs = await dbAll(
      db,
      `SELECT g.*, COUNT(DISTINCT gm.user_id) as members, COUNT(DISTINCT t.district_id) as territories
       FROM samp_gangs g
       LEFT JOIN samp_gang_members gm ON gm.gang_id = g.id
       LEFT JOIN samp_gang_territories t ON t.gang_id = g.id
       GROUP BY g.id
       ORDER BY g.treasury DESC, territories DESC, members DESC, g.id ASC
       LIMIT 10`,
      []
    );
    if (!gangs || gangs.length === 0) { await interaction.reply("Пока нет банд."); return; }
    const lines = gangs.map((g, i) => `${i < 3 ? ["🥇", "🥈", "🥉"][i] : `\`${i+1}.\``} **[${g.tag}] ${g.name}** — ${fmtMoney(g.treasury)} • ${g.members} чел. • ${g.territories || 0} район.`);
    const embeds = buildPagedLineEmbeds({
      title: "🔫 Топ банд San Andreas",
      description: "Рейтинг по размеру казны.",
      color: 0xe74c3c,
      lines,
      linesPerPage: 10,
      footer: "Детали по своей банде: /gang info",
    });
    await interaction.reply({ embeds });
  }
}

// --- Cosmetics ---
async function handleShopCosmetics(interaction) {
  const fields = Object.entries(COSMETICS).map(([id, c]) => ({
    name: `${c.type === "title" ? "🏷️" : "🎨"} ${c.name}`,
    value: joinLines([
      `ID: **${id}**`,
      `Тип: **${c.type}**`,
      `Цена: **${fmtMoney(c.price)}**`,
      `Эффект: ${getCosmeticBenefitText(c)}`,
    ]),
    inline: false,
  }));
  const embeds = buildPagedFieldEmbeds({
    title: "🎨 Магазин косметики",
    description: "Титулы попадают в author-строку, а цвета перекрашивают профильные embed'ы вроде /balance, /bizstats, /garage и /gang info.",
    color: 0x9b59b6,
    fields,
    fieldsPerPage: 4,
    footer: "Покупка: /buycosmetic id:<id>",
  });
  await interaction.reply({ embeds });
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

  const opKey = makeInteractionOpKey(interaction, "buy_cosmetic");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "buy_cosmetic", userId, null, cos.price, opKey, { cosmetic_id: cosId });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, -cos.price);
    await dbRun(db, `INSERT OR REPLACE INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`, [userId, cos.type, cos.value]);
  });
  await interaction.reply(
    `🎨 Ты купил **${cos.name}** за **${fmtMoney(cos.price)}**!\n` +
    `${getCosmeticBenefitText(cos)}`
  );
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

  const opKey = makeInteractionOpKey(interaction, "repair");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "repair", userId, null, cost, opKey, { weapon: wRow.value });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, -cost);
    await dbRun(db, "UPDATE samp_inventory SET durability = 100 WHERE user_id = ? AND item_id = ?", [userId, wRow.value]);
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

    const opKey = makeInteractionOpKey(interaction, "lottery_buy");
    await withTx(db, async () => {
      const inserted = await addLedgerUnique(db, "lottery_buy", userId, null, cost, opKey, { tickets: qty });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await adjustMoney(db, userId, -cost);
      await dbRun(db, `INSERT INTO samp_lottery(week_start, user_id, tickets) VALUES(?, ?, ?)`, [week, userId, qty]);
    });
    await interaction.reply(`🎫 Куплено **${qty}** билетов за **${fmtMoney(cost)}**! Удачи!`);

  } else if (sub === "info") {
    const pot = await dbGet(db, "SELECT SUM(tickets) * 1000 as total FROM samp_lottery WHERE week_start = ?", [week]);
    const mine = await dbGet(db, "SELECT SUM(tickets) as t FROM samp_lottery WHERE week_start = ? AND user_id = ?", [week, userId]);
    const totalTickets = await dbGet(db, "SELECT SUM(tickets) as t FROM samp_lottery WHERE week_start = ?", [week]);
    const embed = new EmbedBuilder()
      .setTitle("🎰 Лотерея San Andreas")
      .setDescription("Недельный розыгрыш с лимитом 10 билетов на игрока.")
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
  return withTx(db, async () => {
    const already = await dbGet(db, "SELECT 1 FROM samp_lottery_history WHERE week_start = ?", [week]);
    if (already) return null;

    const allTickets = await dbAll(db, "SELECT user_id, tickets FROM samp_lottery WHERE week_start = ?", [week]);
    if (!allTickets || allTickets.length === 0) return null;

    const pool = [];
    let pot = 0;
    for (const row of allTickets) {
      for (let i = 0; i < row.tickets; i += 1) pool.push(row.user_id);
      pot += row.tickets * 1000;
    }

    const houseCut = Math.floor(pot * 0.1);
    const winnings = pot - houseCut;
    const winner = pick(pool);

    await adjustMoney(db, winner, winnings);
    await addLedger(db, "lottery_win", null, winner, winnings, { week, pot });
    await dbRun(db, "INSERT INTO samp_lottery_history(week_start, winner_id, pot) VALUES(?, ?, ?)", [week, winner, pot]);
    return { winner, winnings, pot };
  });
}

// --- Black Market ---
async function handleBlackMarket(interaction, db) {
  const sub = interaction.options.getSubcommand?.() || "browse";

  if (sub === "browse" || !interaction.options.getSubcommand) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const deals = getDailyBlackMarketDeals();
    const dealer = getDailyDealer();
    const purchases = await getBmPurchaseCount(db, userId);
    const tier = getBmRepTier(purchases);

    const fields = deals.map((d, i) => {
      const discountedPrice = tier.discount > 0 ? Math.floor(d.price * (1 - tier.discount)) : d.price;
      const priceText = tier.discount > 0
        ? `~~${fmtMoney(d.price)}~~ → **${fmtMoney(discountedPrice)}** (-${Math.round(tier.discount * 100)}%)`
        : `**${fmtMoney(d.price)}**`;
      return {
        name: `#${i+1} ${d.name}`,
        value: joinLines([`Цена: ${priceText}`, `Тип: **${d.type}**`]),
        inline: false,
      };
    });
    const embeds = buildPagedFieldEmbeds({
      title: `🕶️ Чёрный рынок — ${dealer.name}`,
      description: `_"${dealer.line}"_\n\nТвой статус: **${tier.name}** (${purchases} покупок)`,
      color: 0x2c3e50,
      fields,
      fieldsPerPage: 4,
      footer: `Покупка: /blackmarket buy slot:<1-${BM_DAILY_DEAL_COUNT}> • ⚠️ 8% шанс облавы`,
    });
    await interaction.editReply({ embeds });

  } else if (sub === "buy") {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const guildId = interaction.guild?.id || interaction.guildId || null;
    const slot = interaction.options.getInteger("slot", true);
    const deals = getDailyBlackMarketDeals();
    const deal = deals[slot - 1];
    if (!deal) { await interaction.editReply({ content: `Слот 1-${BM_DAILY_DEAL_COUNT}.` }); return; }

    const user = await getSampUser(db, userId);
    if (!user) { await interaction.editReply({ content: "Сначала /reg." }); return; }

    const purchases = await getBmPurchaseCount(db, userId);
    const tier = getBmRepTier(purchases);
    const finalPrice = tier.discount > 0 ? Math.floor(deal.price * (1 - tier.discount)) : deal.price;

    if (Number(user.money) < finalPrice) { await interaction.editReply({ content: "Не хватает виртов." }); return; }
    if (await alreadyOwnsBlackMarketDeal(db, userId, deal)) {
      await interaction.editReply({ content: "Этот товар у тебя уже есть. Повторно списывать деньги не буду." });
      return;
    }

    const opKey = makeInteractionOpKey(interaction, "black_market");
    let grantResult = { summary: "" };
    let stingTriggered = false;
    let instantResult = "";

    await withTx(db, async () => {
      const inserted = await addLedgerUnique(db, "black_market", userId, null, finalPrice, opKey, { item: deal.name, type: deal.type, discount: tier.discount });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await adjustMoney(db, userId, -finalPrice);
      grantResult = await grantBlackMarketDeal(db, userId, deal);
      await incrementBmPurchaseCount(db, userId);
    });

    if (deal.type === "mystery_crate") {
      instantResult = await resolveMysteryCrate(db, userId, finalPrice);
    } else if (deal.type === "hit_contract") {
      instantResult = await resolveHitContract(db, userId);
    }

    if (Math.random() < BM_STING_CHANCE && guildId) {
      stingTriggered = true;
      for (let i = 0; i < BM_STING_STARS; i++) {
        await addWantedStar(db, guildId, userId);
      }
    }

    let reply = `🕶️ Куплено: **${deal.name}** за **${fmtMoney(finalPrice)}**!\n${grantResult.summary}`;
    if (instantResult) reply += `\n${instantResult}`;
    if (stingTriggered) reply += `\n\n⚠️ **Полиция засекла сделку!** +${BM_STING_STARS} ⭐ розыска!`;
    await interaction.editReply(reply);
  }
}

// --- Black Market Instant Items ---
async function resolveMysteryCrate(db, userId, pricePaid) {
  const roll = randInt(1, 100);
  let cumulative = 0;
  let outcome = BM_MYSTERY_CRATE_LOOT[BM_MYSTERY_CRATE_LOOT.length - 1];
  for (const entry of BM_MYSTERY_CRATE_LOOT) {
    cumulative += entry.weight;
    if (roll <= cumulative) { outcome = entry; break; }
  }

  if (outcome.type === "money_back") {
    const bonus = pricePaid * 2;
    await adjustMoney(db, userId, bonus);
    await addLedger(db, "bm_mystery_crate", null, userId, bonus, { outcome: "money_back" });
    return `🎁 **${outcome.label}**! Ты получил **${fmtMoney(bonus)}** обратно!`;
  }
  if (outcome.type === "random_weapon") {
    const weaponKeys = Object.keys(ITEMS).filter(k => ITEMS[k].price <= 90_000);
    const weaponId = pick(weaponKeys);
    const weapon = ITEMS[weaponId];
    await addInventoryItem(db, userId, weaponId, 1);
    return `🎁 **${outcome.label}**: **${weapon.name}**!`;
  }
  if (outcome.type === "nos_charges") {
    await addInventoryItem(db, userId, "bm_nos_boost", 3);
    return `🎁 **${outcome.label}**! +3 заряда нитро.`;
  }
  if (outcome.type === "empty") {
    return `📦 **${outcome.label}** Тебя развели. Ящик пустой.`;
  }
  if (outcome.type === "jackpot") {
    const jackpotMoney = 100_000;
    await adjustMoney(db, userId, jackpotMoney);
    await addLedger(db, "bm_mystery_crate", null, userId, jackpotMoney, { outcome: "jackpot" });
    await dbRun(db, `INSERT OR REPLACE INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value) VALUES(?, ?, ?)`,
      [String(userId), "title_lucky", "🎰 Удачливый"]);
    return `🎁🎰 **ДЖЕКПОТ!** Ты получил **${fmtMoney(jackpotMoney)}** и уникальный титул **🎰 Удачливый**!`;
  }
  return "";
}

async function resolveHitContract(db, userId) {
  const targets = await dbAll(db,
    `SELECT user_id, money FROM samp_users WHERE user_id != ? AND money > 5000 ORDER BY RANDOM() LIMIT 5`,
    [String(userId)]);
  if (!targets || targets.length === 0) return "Подходящих целей не нашлось. Контракт аннулирован.";
  const target = pick(targets);
  const bountyAmount = randInt(15_000, 40_000);
  await dbRun(db,
    `INSERT INTO samp_bounties(target_user_id, placed_by, amount, status) VALUES(?, ?, ?, 'active')`,
    [target.user_id, String(userId), bountyAmount]);
  return `💀 Контракт оформлен: награда **${fmtMoney(bountyAmount)}** за голову <@${target.user_id}>. Победи его в дуэли, чтобы забрать.`;
}

// --- Black Market Item Commands ---
async function handleUseJailPass(interaction, db) {
  const userId = interaction.user.id;
  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  const until = Number(user.jail_until || 0);
  if (until <= nowMs()) { await interaction.reply({ content: "✅ Ты и так на свободе.", ephemeral: true }); return; }
  const qty = await getInventoryQty(db, userId, "bm_jail_pass");
  if (qty < 1) { await interaction.reply({ content: "У тебя нет фальшивых документов. Купи на /blackmarket.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "use_jail_pass");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "use_jail_pass", userId, null, 0, opKey, {});
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    const consumed = await consumeInventoryItem(db, userId, "bm_jail_pass");
    if (!consumed) throw new Error("INSUFFICIENT");
    await dbRun(db, `UPDATE samp_users SET jail_until = 0 WHERE user_id = ?`, [String(userId)]);
  });
  await interaction.reply("📄 Фальшивые документы сработали! Ты на свободе. Охранник даже не моргнул.");
}

async function handleWiretap(interaction, db) {
  const userId = interaction.user.id;
  const target = interaction.options.getUser("user", true);
  if (target.bot) { await interaction.reply({ content: "Ботов нельзя прослушивать.", ephemeral: true }); return; }
  if (target.id === userId) { await interaction.reply({ content: "Сам себя подслушивать?", ephemeral: true }); return; }
  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  const qty = await getInventoryQty(db, userId, "bm_wiretap");
  if (qty < 1) { await interaction.reply({ content: "У тебя нет подслушки. Купи на /blackmarket.", ephemeral: true }); return; }
  const targetUser = await getSampUser(db, target.id);
  if (!targetUser) { await interaction.reply({ content: "Цель не зарегистрирована.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "wiretap");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "wiretap", userId, target.id, 0, opKey, {});
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await consumeInventoryItem(db, userId, "bm_wiretap");
  });

  const wRow = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'weapon'", [target.id]);
  const weaponName = wRow?.value ? (ITEMS[wRow.value]?.name || wRow.value) : "нет";
  const carName = targetUser.car_id ? (CARS[targetUser.car_id]?.name || targetUser.car_id) : "нет";
  const gangRow = await dbGet(db, `SELECT g.name FROM samp_gang_members m JOIN samp_gangs g ON m.gang_id = g.id WHERE m.user_id = ?`, [target.id]);

  await interaction.reply({ content:
    `📡 **Разведка по <@${target.id}>:**\n` +
    `💰 Баланс: **${fmtMoney(targetUser.money)}**\n` +
    `🔫 Оружие: **${weaponName}**\n` +
    `🚗 Тачка: **${carName}**\n` +
    `🏴 Банда: **${gangRow?.name || "нет"}**`, ephemeral: true });
}

async function handleSabotage(interaction, db) {
  const userId = interaction.user.id;
  const target = interaction.options.getUser("user", true);
  if (target.bot) { await interaction.reply({ content: "Ботов нельзя.", ephemeral: true }); return; }
  if (target.id === userId) { await interaction.reply({ content: "Нельзя саботировать самого себя.", ephemeral: true }); return; }
  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  const qty = await getInventoryQty(db, userId, "bm_sabotage");
  if (qty < 1) { await interaction.reply({ content: "У тебя нет подрыва. Купи на /blackmarket.", ephemeral: true }); return; }
  const targetUser = await getSampUser(db, target.id);
  if (!targetUser) { await interaction.reply({ content: "Цель не зарегистрирована.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "sabotage");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "sabotage", userId, target.id, 0, opKey, {});
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await consumeInventoryItem(db, userId, "bm_sabotage");
    await setUserSetting(db, target.id, "sabotaged_until", String(nowMs() + 24 * 60 * 60_000));
  });
  await interaction.reply({ content: `🔧 Машина <@${target.id}> повреждена! При следующей гонке он получит -15 к скорости.`, ephemeral: true });
}

async function handleUseRepairKit(interaction, db) {
  const userId = interaction.user.id;
  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  const wRow = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'weapon'", [userId]);
  if (!wRow?.value) { await interaction.reply({ content: "У тебя нет активного оружия.", ephemeral: true }); return; }
  const weapon = ITEMS[wRow.value];
  if (!weapon) { await interaction.reply({ content: "Оружие не найдено.", ephemeral: true }); return; }
  const inv = await dbGet(db, "SELECT durability FROM samp_inventory WHERE user_id = ? AND item_id = ?", [userId, wRow.value]);
  if (!inv) { await interaction.reply({ content: "Оружие не в инвентаре.", ephemeral: true }); return; }
  if (inv.durability >= 100) { await interaction.reply({ content: "Оружие уже в идеальном состоянии.", ephemeral: true }); return; }
  const qty = await getInventoryQty(db, userId, "bm_repair_kit");
  if (qty < 1) { await interaction.reply({ content: "У тебя нет набора для ремонта. Купи на /blackmarket.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "use_repair_kit");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "use_repair_kit", userId, null, 0, opKey, { weapon: wRow.value });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await consumeInventoryItem(db, userId, "bm_repair_kit");
    await dbRun(db, "UPDATE samp_inventory SET durability = 100 WHERE user_id = ? AND item_id = ?", [userId, wRow.value]);
  });
  await interaction.reply(`🔧 **${weapon.name}** починен набором для ремонта! Прочность: 100%.`);
}

async function handleDisguise(interaction, db) {
  const userId = interaction.user.id;
  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  const qty = await getInventoryQty(db, userId, "bm_disguise");
  if (qty < 1) { await interaction.reply({ content: "У тебя нет маскировки. Купи на /blackmarket.", ephemeral: true }); return; }
  const existing = await dbGet(db, "SELECT value FROM samp_user_settings WHERE user_id = ? AND key = 'disguised_until'", [userId]);
  if (existing && Number(existing.value) > nowMs()) {
    const left = Math.ceil((Number(existing.value) - nowMs()) / 60_000);
    await interaction.reply({ content: `Маскировка уже активна. Осталось **${left} мин**.`, ephemeral: true }); return;
  }

  const opKey = makeInteractionOpKey(interaction, "disguise");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "disguise", userId, null, 0, opKey, {});
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await consumeInventoryItem(db, userId, "bm_disguise");
    await setUserSetting(db, userId, "disguised_until", String(nowMs() + 4 * 60 * 60_000));
  });
  await interaction.reply("🎭 Маскировка активирована на **4 часа**. Тебя нельзя ограбить через /rob.");
}

async function handleHotTip(interaction, db) {
  const userId = interaction.user.id;
  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  const qty = await getInventoryQty(db, userId, "bm_hot_tip");
  if (qty < 1) { await interaction.reply({ content: "У тебя нет наводки. Купи на /blackmarket.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "hot_tip");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "hot_tip", userId, null, 0, opKey, {});
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await consumeInventoryItem(db, userId, "bm_hot_tip");
  });

  const richest = await dbAll(db,
    `SELECT u.user_id, u.money FROM samp_users u
     LEFT JOIN samp_user_settings s ON u.user_id = s.user_id AND s.key = 'disguised_until'
     WHERE u.user_id != ? AND u.money > 1000
       AND (s.value IS NULL OR CAST(s.value AS INTEGER) <= ?)
     ORDER BY u.money DESC LIMIT 3`,
    [String(userId), nowMs()]);

  if (!richest || richest.length === 0) {
    await interaction.reply({ content: "🔍 Наводка пуста — нет подходящих целей.", ephemeral: true }); return;
  }
  const lines = richest.map((r, i) => {
    const approx = Math.round(Number(r.money) / 10_000) * 10_000;
    return `${i + 1}. <@${r.user_id}> — ~**${fmtMoney(approx)}**`;
  });
  await interaction.reply({ content: `🔍 **Наводка на самых богатых:**\n${lines.join("\n")}`, ephemeral: true });
}

async function handleSecretHeist(interaction, db) {
  const userId = interaction.user.id;
  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала /reg.", ephemeral: true }); return; }
  if (Number(user.jail_until || 0) > nowMs()) { await interaction.reply({ content: "Ты в тюрьме!", ephemeral: true }); return; }
  const qty = await getInventoryQty(db, userId, "bm_map");
  if (qty < 1) { await interaction.reply({ content: "Нужна секретная карта с чёрного рынка для доступа к бункеру.", ephemeral: true }); return; }
  const cd = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = 'secret_heist'", [userId]);
  if (cd && Number(cd.ready_at) > nowMs()) {
    const left = Math.ceil((Number(cd.ready_at) - nowMs()) / 60_000);
    await interaction.reply({ content: `⏳ Бункер на замке. Подожди **${left} мин**.`, ephemeral: true }); return;
  }

  const opKey = makeInteractionOpKey(interaction, "secret_heist");
  const heist = BM_SECRET_HEIST;
  const failed = Math.random() < heist.failChance;
  const cooldownMs = 20 * 60_000;

  await interaction.deferReply();

  if (failed) {
    await withTx(db, async () => {
      const inserted = await addLedgerUnique(db, "secret_heist_fail", userId, null, 0, opKey, {});
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await consumeInventoryItem(db, userId, "bm_map");
      await dbRun(db, `UPDATE samp_users SET jail_until = ? WHERE user_id = ?`, [nowMs() + heist.jailMs, String(userId)]);
      await setCooldownReadyAt(db, userId, "secret_heist", nowMs() + cooldownMs);
    });
    await interaction.editReply(`🗺️ **${heist.name}**\n\n🚔 Ловушка! Охрана бункера схватила тебя. Тюрьма: **${Math.ceil(heist.jailMs / 60_000)} мин**.\nКарта уничтожена.`);
  } else {
    const payout = randInt(heist.payout[0], heist.payout[1]);
    await withTx(db, async () => {
      const inserted = await addLedgerUnique(db, "secret_heist", null, userId, payout, opKey, {});
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await consumeInventoryItem(db, userId, "bm_map");
      await adjustMoney(db, userId, payout);
      await setCooldownReadyAt(db, userId, "secret_heist", nowMs() + cooldownMs);
    });
    await interaction.editReply(`🗺️ **${heist.name}**\n\n🎉 Ты проник внутрь и вынес: **${fmtMoney(payout)}**!\nКарта использована.`);
  }
}

async function handleGangBmOrder(interaction, db) {
  const userId = interaction.user.id;
  const gangMember = await dbGet(db, `SELECT gang_id, role FROM samp_gang_members WHERE user_id = ?`, [userId]);
  if (!gangMember) { await interaction.reply({ content: "Ты не состоишь в банде.", ephemeral: true }); return; }
  const gang = await dbGet(db, `SELECT * FROM samp_gangs WHERE id = ?`, [gangMember.gang_id]);
  if (!gang || String(gang.leader_id) !== String(userId)) {
    await interaction.reply({ content: "Только лидер банды может заказывать.", ephemeral: true }); return;
  }

  const itemType = interaction.options.getString("item", true);
  const count = Math.min(5, Math.max(1, interaction.options.getInteger("count", true)));
  const bmItem = BLACK_MARKET_ITEMS.find(i => i.type === itemType);
  if (!bmItem) { await interaction.reply({ content: "Неизвестный товар.", ephemeral: true }); return; }
  const grant = BLACK_MARKET_GRANTS[itemType];
  if (!grant?.inventoryItemId) { await interaction.reply({ content: "Этот товар нельзя купить оптом.", ephemeral: true }); return; }

  const avgPrice = Math.floor((bmItem.basePrice[0] + bmItem.basePrice[1]) / 2);
  const totalPrice = Math.floor(avgPrice * count * 0.85);
  if (Number(gang.treasury) < totalPrice) {
    await interaction.reply({ content: `Нужно **${fmtMoney(totalPrice)}** в казне. Сейчас: **${fmtMoney(gang.treasury)}**.`, ephemeral: true }); return;
  }

  const members = await dbAll(db, `SELECT user_id FROM samp_gang_members WHERE gang_id = ?`, [gangMember.gang_id]);
  if (!members || members.length === 0) { await interaction.reply({ content: "В банде нет участников.", ephemeral: true }); return; }

  const opKey = makeInteractionOpKey(interaction, "gang_bm_order");
  await withTx(db, async () => {
    const inserted = await addLedgerUnique(db, "gang_bm_order", userId, null, totalPrice, opKey, { item: itemType, count });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await dbRun(db, `UPDATE samp_gangs SET treasury = treasury - ? WHERE id = ?`, [totalPrice, gang.id]);
    const perMember = Math.floor(count / members.length);
    let remaining = count;
    for (const m of members) {
      const qty = Math.min(perMember || 1, remaining);
      if (qty > 0) {
        await addInventoryItem(db, m.user_id, grant.inventoryItemId, grant.inventoryQty * qty);
        remaining -= qty;
      }
    }
    if (remaining > 0) {
      await addInventoryItem(db, userId, grant.inventoryItemId, grant.inventoryQty * remaining);
    }
  });
  await interaction.reply(`🏴 Оптовый заказ: **${count}x ${bmItem.name}** за **${fmtMoney(totalPrice)}** из казны (скидка 15%).\nРаспределено по ${members.length} участникам.`);
}

// ═══════════════════════════════════════════════════════════════
// SLASH COMMAND BUILDERS
// ═══════════════════════════════════════════════════════════════

function getSampExtendedCommandBuilders() {
  return [
    new SlashCommandBuilder().setName("businesses").setDescription("SAMP Life: список бизнесов"),
    new SlashCommandBuilder().setName("bizstats").setDescription("SAMP Life: подробная статистика по бизнесу")
      .addStringOption(o => o.setName("id").setDescription("ID бизнеса").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("mbizstats").setDescription("SAMP Life: статы твоего бизнеса")
      .addStringOption(o => o.setName("id").setDescription("ID твоего бизнеса").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("buybiz").setDescription("SAMP Life: купить бизнес")
      .addStringOption(o => o.setName("id").setDescription("ID бизнеса").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("collectincome").setDescription("SAMP Life: собрать доход с бизнесов"),
    new SlashCommandBuilder().setName("maintainbiz").setDescription("SAMP Life: обслужить бизнесы")
      .addStringOption(o => o.setName("id").setDescription("ID бизнеса (если пусто — обслужить все)").setRequired(false).setAutocomplete(true)),
    new SlashCommandBuilder().setName("bizrun").setDescription("SAMP Life: вручную поработать на бизнесе")
      .addStringOption(o => o.setName("id").setDescription("ID бизнеса").setRequired(true).setAutocomplete(true)),

    new SlashCommandBuilder().setName("tune").setDescription("SAMP Life: глубокий тюнинг машины")
      .addSubcommand((subcommand) =>
        subcommand.setName("install").setDescription("Установить деталь")
          .addStringOption((option) => option.setName("car").setDescription("ID тачки").setRequired(true).setAutocomplete(true))
          .addStringOption((option) => option.setName("part").setDescription("ID детали").setRequired(true).setAutocomplete(true))
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("inspect").setDescription("Посмотреть сборку и статы")
          .addStringOption((option) => option.setName("car").setDescription("ID тачки").setRequired(true).setAutocomplete(true))
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("remove").setDescription("Снять деталь и вернуть часть цены")
          .addStringOption((option) => option.setName("car").setDescription("ID тачки").setRequired(true).setAutocomplete(true))
          .addStringOption((option) => option.setName("part").setDescription("ID детали").setRequired(true).setAutocomplete(true))
      )
      .addSubcommand((subcommand) =>
        subcommand.setName("maintain").setDescription("Обслужить детали")
          .addStringOption((option) => option.setName("car").setDescription("ID тачки").setRequired(true).setAutocomplete(true))
          .addStringOption((option) => option.setName("part").setDescription("ID детали (если пусто — все)").setRequired(false).setAutocomplete(true))
      ),
    new SlashCommandBuilder().setName("tunecar").setDescription("SAMP Life: legacy-алиас для /tune install")
      .addStringOption(o => o.setName("car").setDescription("ID тачки").setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName("upgrade").setDescription("ID тюнинга").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("switchcar").setDescription("SAMP Life: сменить активную тачку")
      .addStringOption(o => o.setName("car").setDescription("ID тачки из гаража").setRequired(true).setAutocomplete(true)),
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
      .addSubcommand(s => s.setName("territories").setDescription("Список районов и контролирующих банд"))
      .addSubcommand(s => s.setName("claimterritory").setDescription("Атаковать или укрепить район")
        .addStringOption(o => o.setName("district").setDescription("Район").setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName("supportbiz").setDescription("Поддержать бизнес участника из казны")
        .addUserOption(o => o.setName("user").setDescription("Участник банды").setRequired(true))
        .addStringOption(o => o.setName("business").setDescription("ID бизнеса").setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName("info").setDescription("Инфо о банде"))
      .addSubcommand(s => s.setName("top").setDescription("Топ банд")),

    new SlashCommandBuilder().setName("gmap").setDescription("SAMP Life: карта районов и контролирующих банд"),
    new SlashCommandBuilder().setName("gcapture").setDescription("SAMP Life: атаковать или укрепить район")
      .addStringOption(o => o.setName("district").setDescription("Район").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("gsupportbiz").setDescription("SAMP Life: поддержать бизнес участника из казны")
      .addUserOption(o => o.setName("user").setDescription("Участник банды").setRequired(true))
      .addStringOption(o => o.setName("business").setDescription("ID бизнеса").setRequired(true).setAutocomplete(true)),
    new SlashCommandBuilder().setName("gangtop").setDescription("SAMP Life: топ банд"),

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
        .addIntegerOption(o => o.setName("slot").setDescription(`Номер слота (1-${BM_DAILY_DEAL_COUNT})`).setRequired(true).setMinValue(1).setMaxValue(BM_DAILY_DEAL_COUNT))),

    new SlashCommandBuilder().setName("usejailpass").setDescription("SAMP Life: использовать фальшивые документы (выйти из тюрьмы)"),
    new SlashCommandBuilder().setName("userepairkit").setDescription("SAMP Life: починить оружие набором для ремонта"),
    new SlashCommandBuilder().setName("disguise").setDescription("SAMP Life: активировать маскировку (защита от /rob 4 часа)"),
    new SlashCommandBuilder().setName("hottip").setDescription("SAMP Life: наводка на самых богатых"),
    new SlashCommandBuilder().setName("secretheist").setDescription("SAMP Life: ограбление секретного бункера (нужна карта)"),
    new SlashCommandBuilder().setName("wiretap").setDescription("SAMP Life: прослушать игрока")
      .addUserOption(o => o.setName("user").setDescription("Кого прослушать").setRequired(true)),
    new SlashCommandBuilder().setName("sabotage").setDescription("SAMP Life: саботировать машину игрока")
      .addUserOption(o => o.setName("user").setDescription("Кого саботировать").setRequired(true)),
    new SlashCommandBuilder().setName("gangbmorder").setDescription("SAMP Life: оптовый заказ с чёрного рынка для банды")
      .addStringOption(o => o.setName("item").setDescription("Тип товара").setRequired(true).addChoices(
        { name: "Бронежилет", value: "armor" },
        { name: "Нитро (x3)", value: "nos_boost" },
        { name: "Фальшивые документы", value: "jail_pass" },
        { name: "Аптечка", value: "medkit" },
        { name: "Набор для ремонта", value: "repair_kit" },
        { name: "Маскировка", value: "disguise" },
      ))
      .addIntegerOption(o => o.setName("count").setDescription("Количество (1-5)").setRequired(true).setMinValue(1).setMaxValue(5)),
  ];
}

// ═══════════════════════════════════════════════════════════════
// DISPATCH
// ═══════════════════════════════════════════════════════════════

async function handleSampExtendedCommand({ interaction, db }) {
  const name = interaction.commandName;
  const gangAliasMap = {
    gmap: "territories",
    gcapture: "claimterritory",
    gsupportbiz: "supportbiz",
    gangtop: "top",
  };
  try {
    if (name === "businesses") return await handleBusinesses(interaction, db);
    if (name === "bizstats") return await handleBizStats(interaction, db);
    if (name === "mbizstats") return await handleBizStats(interaction, db);
    if (name === "buybiz") return await handleBuyBiz(interaction, db);
    if (name === "collectincome") return await handleCollectIncome(interaction, db);
    if (name === "maintainbiz") return await handleMaintainBiz(interaction, db);
    if (name === "bizrun") return await handleBizRun(interaction, db);
    if (name === "tune") return await handleTuneCommand(interaction, db);
    if (name === "tunecar") return await handleTuneCar(interaction, db);
    if (name === "switchcar") return await handleSwitchCar(interaction, db);
    if (name === "garage") return await handleGarage(interaction, db);
    if (name === "bounty") return await handleBounty(interaction, db);
    if (name === "bountylist") return await handleBountyList(interaction, db);
    if (name === "heist") return await handleHeist(interaction, db);
    if (name === "jobs") return await handleJobs(interaction, db);
    if (name === "dojob") return await handleDoJob(interaction, db);
    if (name === "gang") return await handleGangCommand(interaction, db);
    if (gangAliasMap[name]) {
      const aliasInteraction = createGangAliasInteraction(interaction, gangAliasMap[name]);
      return await handleGangCommand(aliasInteraction, db);
    }
    if (name === "shopcosmetics") return await handleShopCosmetics(interaction);
    if (name === "buycosmetic") return await handleBuyCosmetic(interaction, db);
    if (name === "repair") return await handleRepair(interaction, db);
    if (name === "lottery") return await handleLottery(interaction, db);
    if (name === "blackmarket") return await handleBlackMarket(interaction, db);
    if (name === "usejailpass") return await handleUseJailPass(interaction, db);
    if (name === "userepairkit") return await handleUseRepairKit(interaction, db);
    if (name === "disguise") return await handleDisguise(interaction, db);
    if (name === "hottip") return await handleHotTip(interaction, db);
    if (name === "secretheist") return await handleSecretHeist(interaction, db);
    if (name === "wiretap") return await handleWiretap(interaction, db);
    if (name === "sabotage") return await handleSabotage(interaction, db);
    if (name === "gangbmorder") return await handleGangBmOrder(interaction, db);
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
  let subcommand = null;
  try { subcommand = interaction.options.getSubcommand(); } catch (_) { subcommand = null; }
  let choices = [];

  if (name === "mbizstats") {
    const userId = interaction.user.id;
    const owned = await dbAll(db, "SELECT property_id FROM samp_properties WHERE user_id = ?", [userId]);
    choices = (owned || [])
      .map((row) => row.property_id)
      .filter((propertyId) => PROPERTIES[propertyId])
      .map((propertyId) => ({ name: `${PROPERTIES[propertyId].name} — ${propertyId}`, value: propertyId }));
  } else if (name === "buybiz" || name === "bizstats" || name === "maintainbiz" || name === "bizrun") {
    choices = Object.entries(PROPERTIES).map(([id, p]) => ({ name: `${p.name} — ${fmtMoney(p.price)}`, value: id }));
  } else if ((name === "gang" || name === "gsupportbiz") && focused.name === "business") {
    choices = Object.entries(PROPERTIES).map(([id, p]) => ({ name: `${p.name} — ${id}`, value: id }));
  } else if ((name === "gang" || name === "gcapture") && focused.name === "district") {
    choices = Object.entries(TERRITORY_DISTRICTS).map(([id, district]) => ({
      name: `${district.name} — бонус +${Math.round((district.businessBuff || 0) * 100)}%`,
      value: id,
    }));
  } else if ((name === "tunecar" && focused.name === "car") || (name === "tune" && focused.name === "car")) {
    const userId = interaction.user.id;
    const cars = await dbAll(db, "SELECT car_id FROM samp_garage WHERE user_id = ?", [userId]);
    choices = (cars || []).filter(r => CARS[r.car_id]).map(r => ({ name: CARS[r.car_id].name, value: r.car_id }));
  } else if (name === "switchcar" && focused.name === "car") {
    const userId = interaction.user.id;
    const user = await getSampUser(db, userId);
    const cars = await dbAll(db, "SELECT car_id FROM samp_garage WHERE user_id = ?", [userId]);
    choices = (cars || [])
      .filter((row) => CARS[row.car_id])
      .sort((left, right) => {
        if (left.car_id === user?.car_id) return -1;
        if (right.car_id === user?.car_id) return 1;
        return 0;
      })
      .map((row) => ({
        name: `${row.car_id === user?.car_id ? "🟢 " : ""}${CARS[row.car_id].name} — ${row.car_id}`,
        value: row.car_id,
      }));
  } else if ((name === "tunecar" && focused.name === "upgrade") || (name === "tune" && subcommand === "install" && focused.name === "part")) {
    const userId = interaction.user.id;
    const selectedCarId = String(interaction.options.getString("car") || "").toLowerCase();
    const [installedRows, progress, raceStats] = selectedCarId
      ? await Promise.all([
          getInstalledCarUpgradeRows(db, userId, selectedCarId),
          getOrCreateCarTuningProgress(db, userId, selectedCarId),
          getUserRaceStats(db, userId),
        ])
      : [[], { level: 1, exp: 0 }, { races_total: 0, races_won: 0, max_speed_reached: 0 }];
    const occupiedSlots = new Set(
      installedRows
        .map((row) => getTuningPart(row.upgrade_id))
        .filter(Boolean)
        .map((part) => part.slot)
    );
    const installedIds = new Set(installedRows.map((row) => row.upgrade_id));
    choices = listTuningParts()
      .filter((part) => !installedIds.has(part.id) && !occupiedSlots.has(part.slot))
      .map((part) => {
        const status = getTuningRequirementStatus(part, progress, raceStats);
        const suffix = status.ok ? formatTuningPartStatSummary(part) : `LOCKED • ${formatTuningRequirementStatus(part, status)}`;
        return { name: `${part.name} — ${fmtMoney(part.price)} • ${suffix}`.slice(0, 100), value: part.id };
      });
  } else if (name === "tune" && ["remove", "maintain"].includes(subcommand) && focused.name === "part") {
    const userId = interaction.user.id;
    const selectedCarId = String(interaction.options.getString("car") || "").toLowerCase();
    const installedRows = selectedCarId ? await getInstalledCarUpgradeRows(db, userId, selectedCarId) : [];
    choices = installedRows
      .map((row) => {
        const part = getTuningPart(row.upgrade_id);
        if (!part) return null;
        const durability = Math.max(0, Math.floor(Number(row.durability || 100)));
        return { name: `${part.name} — ${durability}% • ${formatTuningPartStatSummary(part)}`.slice(0, 100), value: part.id };
      })
      .filter(Boolean);
  } else if (name === "buycosmetic") {
    choices = Object.entries(COSMETICS).map(([id, c]) => ({ name: `${c.name} — ${fmtMoney(c.price)}`, value: id }));
  }

  if (query) choices = choices.filter(c => c.name.toLowerCase().includes(query) || c.value.includes(query));
  await interaction.respond(choices.slice(0, 25));
}

// ═══════════════════════════════════════════════════════════════

module.exports = {
  ensureSampExtendedTables,
  getSampLiveOpsConfig,
  updateSampLiveOpsConfig,
  listSampLiveOpsPresets,
  upsertSampLiveOpsPreset,
  deleteSampLiveOpsPreset,
  applySampLiveOpsPreset,
  listGangTerritories,
  getSampExtendedCommandBuilders,
  handleSampExtendedCommand,
  handleSampExtendedAutocomplete,
  checkAndCollectBounty,
  degradeWeapon,
  drawLottery,
  PROPERTIES,
  TERRITORY_DISTRICTS,
  CAR_UPGRADES,
  HEIST_TIERS,
  HEIST_COOLDOWN_MS,
  HEIST_MIN_COOLDOWN_MS,
  tryReserveHeistParticipant,
  releaseHeistParticipants,
  applyHeistCooldown,
  getUserHeistCooldownMs,
  getInventoryQty,
  consumeInventoryItem,
  BLACK_MARKET_ITEMS,
  BLACK_MARKET_GRANTS,
  getUserSetting,
  setUserSetting,
};
