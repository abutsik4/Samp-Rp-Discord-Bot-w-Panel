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
  const owned = await dbAll(
    db,
    "SELECT property_id, last_collected, condition, supplies, last_maintained, last_state_tick, gang_boost_until FROM samp_properties WHERE user_id = ?",
    [userId]
  );
  const ownedMap = new Map((owned || []).map((row) => [row.property_id, row]));
  const now = new Date();
  const liveOps = await getSampLiveOpsConfig(db);
  const membership = await getUserGangMembership(db, userId);
  const territoryControlMap = await getTerritoryControlMap(db);

  const embed = new EmbedBuilder().setTitle("🏢 Бизнесы San Andreas").setColor(0x2ecc71).setTimestamp();
  for (const [id, p] of Object.entries(PROPERTIES)) {
    const ownedRow = ownedMap.get(id);
    if (!ownedRow) {
      embed.addFields({
        name: `${p.name} (${id})`,
        value: `Цена: ${fmtMoney(p.price)} | База: ${fmtMoney(p.income)}/час`,
        inline: true,
      });
      continue;
    }

    const state = getBusinessState(p, ownedRow, now);
    const territory = getTerritoryBoost(p, territoryControlMap, membership?.gang_id);
    const income = getBusinessIncomeBreakdown(p, state, liveOps, territory.multiplier);
    const bonusLabel = state.hasActiveBonus ? ` | Бонус: +${Math.round((p.activeBonus || 0) * 100)}%` : "";
    const gangLabel = state.isGangBoosted ? " | Поддержка банды" : "";
    const territoryLabel = territory.isControlled ? ` | Район: +${Math.round((territory.multiplier - 1) * 100)}%` : "";
    embed.addFields({
      name: `${p.name} (${id})`,
      value:
        `✅ Куплен | Чистыми: ${fmtMoney(income.hourlyNet)}/час\n` +
        `Сост.: ${state.projectedCondition}% | Запасы: ${state.projectedSupplies}%\n` +
        `Район: ${territory.districtName || "—"}\n` +
        `Эфф.: ${Math.round(state.efficiency * 100)}%${bonusLabel}${gangLabel}${territoryLabel}`,
      inline: true,
    });
  }
  if (liveOps.active_event_name) {
    embed.setDescription(
      `Ивент: **${liveOps.active_event_name}**` +
      (liveOps.active_event_message ? `\n${liveOps.active_event_message}` : "")
    );
  }
  embed.setFooter({ text: "Покупка: /buybiz id:<business> • Работа: /bizrun id:<business> • Сбор: /collectincome • Обслуживание: /maintainbiz [id]" });
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
    await dbRun(
      db,
      `INSERT INTO samp_properties(user_id, property_id, last_maintained, last_state_tick) VALUES(?, ?, datetime('now'), datetime('now'))`,
      [userId, bizId]
    );
    await addLedger(db, "buy_property", userId, null, prop.price, { property_id: bizId });
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
  let totalGross = 0;
  let totalUpkeep = 0;
  let totalNet = 0;

  await withTx(db, async () => {
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

      await dbRun(
        db,
        `UPDATE samp_properties
         SET last_collected = datetime('now'),
             condition = ?,
             supplies = ?,
             last_state_tick = datetime('now'),
             total_collected = COALESCE(total_collected, 0) + ?
         WHERE user_id = ? AND property_id = ?`,
        [state.projectedCondition, state.projectedSupplies, income.net, userId, row.property_id]
      );
    }

    if (totalNet > 0) {
      await adjustMoney(db, userId, totalNet);
      await addLedger(db, "property_income", null, userId, totalNet, {
        gross: totalGross,
        upkeep: totalUpkeep,
        properties: summaryLines.length,
      });
    }
    if (totalUpkeep > 0) {
      await addLedger(db, "property_upkeep", userId, null, totalUpkeep, { properties: summaryLines.length });
    }
  });

  if (summaryLines.length === 0) { await interaction.editReply("⏳ Ещё рано. Подожди хотя бы несколько минут."); return; }

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

  await withTx(db, async () => {
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
    await addLedger(db, "property_maintenance", userId, null, totalCost, {
      properties: updates.map((item) => item.propertyId),
      count: updates.length,
    });
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

  await withTx(db, async () => {
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
    await addLedger(db, "business_run", null, userId, payout, { business_id: bizId, label: operation.label, rep_gain: repGain });
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

    await withTx(db, async () => {
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
      await addLedger(db, "gang_business_support", userId, target.id, cost, {
        gang_id: member.gang_id,
        property_id: businessId,
        boost_until: toSqliteDate(boostUntil),
      });
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
    const lines = territories.map((territory) => {
      const owner = territory.gang_name ? `**[${territory.gang_tag}] ${territory.gang_name}**` : "нейтрально";
      return `• **${territory.district_name}** — ${owner} | давление ${territory.pressure}% | бонус +${territory.business_buff_pct}%`;
    });
    const embed = new EmbedBuilder()
      .setTitle("🗺️ Районы San Andreas")
      .setDescription(lines.join("\n") || "Пока нет контролируемых районов.")
      .setColor(0xf39c12)
      .setFooter({ text: "Лидеры банд могут атаковать или укреплять районы через /gang claimterritory" })
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });

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

    const current = await dbGet(db, "SELECT district_id, gang_id, pressure FROM samp_gang_territories WHERE district_id = ?", [districtId]);
    const isOwn = current && Number(current.gang_id) === Number(member.gang_id);
    const isNeutral = !current;
    const actionCost = isNeutral ? district.claimCost : isOwn ? Math.max(8_000, Math.round(district.claimCost * 0.5)) : district.takeoverCost;
    if (Number(member.treasury || 0) < actionCost) {
      await interaction.reply({ content: `В казне нужно минимум **${fmtMoney(actionCost)}**.`, ephemeral: true });
      return;
    }

    let summary = "";
    await withTx(db, async () => {
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
        await addLedger(db, "gang_territory_claim", userId, null, actionCost, { gang_id: member.gang_id, district_id: districtId, pressure: TERRITORY_CAPTURE_PRESSURE });
      } else if (isOwn) {
        const nextPressure = Math.min(100, Number(current.pressure || 0) + TERRITORY_REINFORCE_PRESSURE);
        await dbRun(
          db,
          `UPDATE samp_gang_territories SET pressure = ?, updated_at = datetime('now') WHERE district_id = ?`,
          [nextPressure, districtId]
        );
        summary = `🛡️ Банда **[${member.tag}] ${member.name}** укрепила район **${district.name}**.\nДавление: **${nextPressure}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;
        await addLedger(db, "gang_territory_reinforce", userId, null, actionCost, { gang_id: member.gang_id, district_id: districtId, pressure: nextPressure });
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
          await addLedger(db, "gang_territory_takeover", userId, null, actionCost, { gang_id: member.gang_id, district_id: districtId, pressure: TERRITORY_CAPTURE_PRESSURE });
        } else {
          await dbRun(
            db,
            `UPDATE samp_gang_territories SET pressure = ?, updated_at = datetime('now') WHERE district_id = ?`,
            [nextPressure, districtId]
          );
          summary = `⚔️ Банда **[${member.tag}] ${member.name}** продавила район **${district.name}**.\nКонтроль соперников упал до **${nextPressure}%**.`;
          await addLedger(db, "gang_territory_attack", userId, null, actionCost, { gang_id: member.gang_id, district_id: districtId, pressure: nextPressure });
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
    const memberList = (members || []).map(m => `<@${m.user_id}> (${m.role})`).join("\n");
    const embed = new EmbedBuilder()
      .setTitle(`[${gang.tag}] ${gang.name}`)
      .addFields(
        { name: "Лидер", value: `<@${gang.leader_id}>`, inline: true },
        { name: "Казна", value: fmtMoney(gang.treasury), inline: true },
        { name: "Поддержка бизнесов", value: `${support?.c || 0} актив.`, inline: true },
        { name: "Районы", value: `${territories?.c || 0} под контролем`, inline: true },
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
    new SlashCommandBuilder().setName("maintainbiz").setDescription("SAMP Life: обслужить бизнесы")
      .addStringOption(o => o.setName("id").setDescription("ID бизнеса (если пусто — обслужить все)").setRequired(false).setAutocomplete(true)),
    new SlashCommandBuilder().setName("bizrun").setDescription("SAMP Life: вручную поработать на бизнесе")
      .addStringOption(o => o.setName("id").setDescription("ID бизнеса").setRequired(true).setAutocomplete(true)),

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
  const gangAliasMap = {
    gmap: "territories",
    gcapture: "claimterritory",
    gsupportbiz: "supportbiz",
  };
  try {
    if (name === "businesses") return await handleBusinesses(interaction, db);
    if (name === "buybiz") return await handleBuyBiz(interaction, db);
    if (name === "collectincome") return await handleCollectIncome(interaction, db);
    if (name === "maintainbiz") return await handleMaintainBiz(interaction, db);
    if (name === "bizrun") return await handleBizRun(interaction, db);
    if (name === "tunecar") return await handleTuneCar(interaction, db);
    if (name === "garage") return await handleGarage(interaction, db);
    if (name === "bounty") return await handleBounty(interaction, db);
    if (name === "bountylist") return await handleBountyList(interaction, db);
    if (name === "heist") return await handleHeist(interaction, db);
    if (name === "jobs") return await handleJobs(interaction, db);
    if (name === "dojob") return await handleDoJob(interaction, db);
    if (name === "gang") return await handleGangCommand(interaction, db);
    if (gangAliasMap[name]) {
      const aliasInteraction = {
        ...interaction,
        commandName: "gang",
        options: {
          ...interaction.options,
          getSubcommand: () => gangAliasMap[name],
        },
      };
      return await handleGangCommand(aliasInteraction, db);
    }
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

  if (name === "buybiz" || name === "maintainbiz" || name === "bizrun") {
    choices = Object.entries(PROPERTIES).map(([id, p]) => ({ name: `${p.name} — ${fmtMoney(p.price)}`, value: id }));
  } else if ((name === "gang" || name === "gsupportbiz") && focused.name === "business") {
    choices = Object.entries(PROPERTIES).map(([id, p]) => ({ name: `${p.name} — ${id}`, value: id }));
  } else if ((name === "gang" || name === "gcapture") && focused.name === "district") {
    choices = Object.entries(TERRITORY_DISTRICTS).map(([id, district]) => ({
      name: `${district.name} — бонус +${Math.round((district.businessBuff || 0) * 100)}%`,
      value: id,
    }));
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
};
