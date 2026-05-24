"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");
const {
  getUserCosmetics,
  applyUserCosmeticsToEmbed,
  getUserBoostEffects,
  ensureCosmeticsTables,
} = require("./samp-cosmetics");
const {
  ensureOnboardingTables,
  startOnboarding,
  triggerOnboardingEvent,
} = require("./samp-onboarding");
const {
  CAR_TUNING_PARTS,
  TUNE_LEVEL_MAX,
  TUNE_LEVEL_XP_STEP,
  buildCarTuningProfile,
  getNextTuningLevelProgress,
  getTuningLevelFromExp,
  getTuningPart,
} = require("./constants/car-tuning");

// -------------------------
// Game constants (MVP)
// -------------------------
const START_MONEY = 500;
const DEFAULT_CAR_ID = "bicycle";

const CARS = {
  // --- Бесплатный старт ---
  bicycle: { name: "Велосипед", price: 0, speed: 5 },

  // --- Эконом ($5k–$25k) ---
  perennial: { name: "Perennial", price: 5_000, speed: 35 },
  glendale: { name: "Glendale", price: 6_000, speed: 40 },
  manana: { name: "Manana", price: 7_000, speed: 42 },
  tampa: { name: "Tampa", price: 8_000, speed: 45 },
  greenwood: { name: "Greenwood", price: 9_000, speed: 46 },
  willard: { name: "Willard", price: 10_000, speed: 48 },
  previon: { name: "Previon", price: 11_000, speed: 50 },
  bravura: { name: "Bravura", price: 12_000, speed: 50 },
  esperanto: { name: "Esperanto", price: 13_000, speed: 52 },
  majestic: { name: "Majestic", price: 14_000, speed: 53 },
  buccaneer: { name: "Buccaneer", price: 15_000, speed: 55 },
  clover: { name: "Clover", price: 16_000, speed: 56 },
  sabre: { name: "Sabre", price: 18_000, speed: 58 },
  virgo: { name: "Virgo", price: 19_000, speed: 55 },
  picador: { name: "Picador", price: 20_000, speed: 54 },
  broadway: { name: "Broadway", price: 22_000, speed: 52 },
  remington: { name: "Remington", price: 23_000, speed: 57 },
  blade: { name: "Blade", price: 25_000, speed: 60 },

  // --- Средний ($30k–$75k) ---
  premier: { name: "Premier", price: 30_000, speed: 62 },
  sentinel: { name: "Sentinel", price: 32_000, speed: 63 },
  nebula: { name: "Nebula", price: 33_000, speed: 60 },
  cadrona: { name: "Cadrona", price: 35_000, speed: 61 },
  washington: { name: "Washington", price: 38_000, speed: 62 },
  intruder: { name: "Intruder", price: 40_000, speed: 64 },
  merit: { name: "Merit", price: 42_000, speed: 65 },
  elegant: { name: "Elegant", price: 45_000, speed: 68 },
  sultan: { name: "Sultan RS", price: 50_000, speed: 80 },
  flash: { name: "Flash", price: 52_000, speed: 78 },
  stratum: { name: "Stratum", price: 55_000, speed: 75 },
  jester: { name: "Jester", price: 60_000, speed: 82 },
  uranus: { name: "Uranus", price: 62_000, speed: 80 },
  zr350: { name: "ZR-350", price: 68_000, speed: 85 },
  alpha: { name: "Alpha", price: 70_000, speed: 84 },
  euros: { name: "Euros", price: 75_000, speed: 86 },

  // --- Спорт ($80k–$200k) ---
  elegy: { name: "Elegy", price: 100_000, speed: 95 },
  sultan_klass: { name: "Sultan (Klass)", price: 110_000, speed: 92 },
  comet: { name: "Comet", price: 120_000, speed: 100 },
  buffalo: { name: "Buffalo", price: 130_000, speed: 98 },
  phoenix: { name: "Phoenix", price: 140_000, speed: 96 },
  banshee: { name: "Banshee", price: 160_000, speed: 105 },
  hotknife: { name: "Hotknife", price: 180_000, speed: 102 },
  super_gt: { name: "Super GT", price: 190_000, speed: 108 },
  cheetah: { name: "Cheetah", price: 200_000, speed: 110 },

  // --- Суперкары ($250k–$600k) ---
  turismo: { name: "Turismo", price: 250_000, speed: 112 },
  bullet: { name: "Bullet", price: 300_000, speed: 115 },
  hotring: { name: "Hotring Racer", price: 350_000, speed: 118 },
  infernus: { name: "Infernus", price: 500_000, speed: 120 },

  // --- Люкс / Особые ($600k–$2M) ---
  stretch: { name: "Stretch (Лимузин)", price: 600_000, speed: 65 },
  stafford: { name: "Stafford", price: 650_000, speed: 68 },
  huntley: { name: "Huntley", price: 700_000, speed: 72 },
  nrg500: { name: "NRG-500", price: 800_000, speed: 125 },
  fcr900: { name: "FCR-900", price: 400_000, speed: 110 },
  pcj600: { name: "PCJ-600", price: 200_000, speed: 100 },
  sanchez: { name: "Sanchez", price: 80_000, speed: 85 },

  // --- Внедорожники / Грузовики ---
  rancher: { name: "Rancher", price: 45_000, speed: 55 },
  landstalker: { name: "Landstalker", price: 55_000, speed: 58 },
  bobcat: { name: "Bobcat", price: 28_000, speed: 52 },
  sadler: { name: "Sadler", price: 30_000, speed: 50 },
  yosemite: { name: "Yosemite", price: 35_000, speed: 53 },
  mesa: { name: "Mesa", price: 42_000, speed: 58 },
  bf_injection: { name: "BF Injection", price: 38_000, speed: 55 },
  bandito: { name: "Bandito", price: 85_000, speed: 78 },
  monster: { name: "Monster Truck", price: 1_000_000, speed: 60 },
};

const ITEMS = {
  // --- Холодное оружие ---
  knife: { name: "Нож", price: 2_000, dmg: [8, 14] },
  bat: { name: "Бита", price: 3_000, dmg: [10, 16] },
  shovel: { name: "Лопата", price: 2_500, dmg: [9, 15] },
  katana: { name: "Катана", price: 8_000, dmg: [14, 22] },
  chainsaw: { name: "Бензопила", price: 15_000, dmg: [18, 28] },

  // --- Пистолеты ---
  pistol: { name: "Colt 45", price: 15_000, dmg: [10, 18] },
  silenced: { name: "Silenced Pistol", price: 22_000, dmg: [12, 20] },
  deagle: { name: "Desert Eagle", price: 50_000, dmg: [24, 36] },

  // --- Дробовики ---
  shotgun: { name: "Дробовик", price: 35_000, dmg: [18, 30] },
  sawnoff: { name: "Обрез", price: 55_000, dmg: [22, 34] },
  combat_shotgun: { name: "SPAS-12", price: 90_000, dmg: [26, 38] },

  // --- Пистолеты-пулемёты ---
  tec9: { name: "Tec-9", price: 25_000, dmg: [12, 20] },
  micro_smg: { name: "Micro SMG (Uzi)", price: 30_000, dmg: [14, 22] },
  smg: { name: "SMG (MP5)", price: 65_000, dmg: [18, 28] },

  // --- Автоматы ---
  ak47: { name: "AK-47", price: 120_000, dmg: [22, 36] },
  m4: { name: "M4", price: 150_000, dmg: [24, 38] },

  // --- Винтовки ---
  rifle: { name: "Country Rifle", price: 70_000, dmg: [30, 42] },
  sniper: { name: "Sniper Rifle", price: 200_000, dmg: [40, 55] },

  // --- Тяжёлое вооружение ---
  rpg: { name: "RPG", price: 500_000, dmg: [50, 70] },
  heatseeker: { name: "Heat-Seeking RPG", price: 650_000, dmg: [55, 75] },
  minigun: { name: "Minigun", price: 1_000_000, dmg: [35, 50] },
  flamethrower: { name: "Огнемёт", price: 400_000, dmg: [28, 45] },

  // --- Взрывчатка ---
  grenade: { name: "Граната", price: 10_000, dmg: [30, 50] },
  molotov: { name: "Коктейль Молотова", price: 5_000, dmg: [20, 35] },
};

const BLACK_MARKET_INVENTORY_LABELS = {
  bm_armor: "Бронежилет",
  bm_map: "Секретная карта",
  bm_nos_boost: "Нитро",
  bm_jail_pass: "Фальшивые документы",
  bm_medkit: "Аптечка",
  bm_wiretap: "Прослушка",
  bm_sabotage: "Саботаж",
  bm_laundering: "Отмывание",
  bm_repair_kit: "Набор для ремонта",
  bm_disguise: "Маскировка",
  bm_hot_tip: "Наводка",
};

const COOLDOWNS_MS = {
  work: 60_000,
  truck: 15 * 60_000,
  rob: 15 * 60_000,
  race: 5 * 60_000,
  duel: 5 * 60_000,
};

const CHALLENGE_PAIR_COOLDOWNS_MS = {
  rob: 60 * 60_000,
  race: 30 * 60_000,
  duel: 30 * 60_000,
};

const TRUCK_ROUTE_TIERS = [
  {
    id: "local",
    name: "Локальный рейс",
    minSpeed: 0,
    rewardMin: 2_400,
    rewardMax: 4_600,
    crashChance: 0.13,
    fineMin: 700,
    fineMax: 1_900,
  },
  {
    id: "county",
    name: "Окружной рейс",
    minSpeed: 35,
    rewardMin: 3_800,
    rewardMax: 6_900,
    crashChance: 0.16,
    fineMin: 1_000,
    fineMax: 2_500,
  },
  {
    id: "express",
    name: "Экспресс-рейс",
    minSpeed: 70,
    rewardMin: 5_800,
    rewardMax: 9_800,
    crashChance: 0.18,
    fineMin: 1_500,
    fineMax: 3_400,
  },
  {
    id: "intercity",
    name: "Межгород",
    minSpeed: 95,
    rewardMin: 8_800,
    rewardMax: 14_500,
    crashChance: 0.21,
    fineMin: 2_500,
    fineMax: 5_500,
  },
];

const TRUCK_CARGO_TYPES = [
  {
    id: "produce",
    name: "продукты для маркета",
    minSpeed: 0,
    rewardBonusMin: 0,
    rewardBonusMax: 500,
    riskDelta: -0.01,
    fineMultiplier: 0.95,
  },
  {
    id: "furniture",
    name: "мебельный заказ",
    minSpeed: 0,
    rewardBonusMin: 300,
    rewardBonusMax: 900,
    riskDelta: 0,
    fineMultiplier: 1,
  },
  {
    id: "electronics",
    name: "электронику",
    minSpeed: 35,
    rewardBonusMin: 600,
    rewardBonusMax: 1_600,
    riskDelta: 0.01,
    fineMultiplier: 1.08,
  },
  {
    id: "fragile",
    name: "хрупкий груз",
    minSpeed: 70,
    rewardBonusMin: 900,
    rewardBonusMax: 2_200,
    riskDelta: 0.02,
    fineMultiplier: 1.12,
  },
  {
    id: "fuel",
    name: "топливо",
    minSpeed: 70,
    rewardBonusMin: 1_300,
    rewardBonusMax: 2_800,
    riskDelta: 0.03,
    fineMultiplier: 1.18,
  },
  {
    id: "contraband",
    name: "серый груз без бумаг",
    minSpeed: 95,
    rewardBonusMin: 2_500,
    rewardBonusMax: 4_200,
    riskDelta: 0.05,
    fineMultiplier: 1.35,
  },
];

const TRUCK_INCIDENTS = [
  {
    id: "clear_road",
    name: "свободная трасса",
    rewardBonusMin: 250,
    rewardBonusMax: 800,
    riskDelta: -0.02,
    fineMultiplier: 0.9,
    successText: "Трасса была пустая, и ты пришёл раньше срока.",
    crashText: "Даже на пустой трассе можно переоценить себя.",
  },
  {
    id: "traffic_jam",
    name: "пробка у развязки",
    rewardBonusMin: -200,
    rewardBonusMax: 300,
    riskDelta: 0.01,
    fineMultiplier: 1,
    successText: "Ты не психанул в пробке и всё равно закрыл заказ.",
    crashText: "Ты полез объезжать пробку и словил жёсткий контакт.",
  },
  {
    id: "client_tip",
    name: "нервный VIP-клиент",
    rewardBonusMin: 700,
    rewardBonusMax: 1_800,
    riskDelta: 0.02,
    fineMultiplier: 1.05,
    successText: "Клиент доплатил сверху за срочность.",
    crashText: "Ты гнал ради VIP-клиента и не удержал машину.",
  },
  {
    id: "storm",
    name: "ливень и скользкая дорога",
    rewardBonusMin: 500,
    rewardBonusMax: 1_400,
    riskDelta: 0.04,
    fineMultiplier: 1.2,
    successText: "Погода была ужасная, но рейс ты всё-таки дотащил.",
    crashText: "Мокрый асфальт отправил тебя в кювет.",
  },
  {
    id: "checkpoint",
    name: "весовой контроль",
    rewardBonusMin: 200,
    rewardBonusMax: 1_000,
    riskDelta: 0.03,
    fineMultiplier: 1.25,
    successText: "Ты не запаниковал на посту и аккуратно вывез рейс.",
    crashText: "После контроля ты дёрнулся слишком резко и разбил рейс.",
  },
];

function getPositiveEnvInt(name, fallback) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

const DEFAULT_PVP_BET_MAX = getPositiveEnvInt("SAMP_PVP_BET_MAX", 100_000);
const PVP_AMOUNT_LIMITS = {
  raceBetMax: getPositiveEnvInt("SAMP_RACE_MAX_BET", DEFAULT_PVP_BET_MAX),
  duelBetMax: getPositiveEnvInt("SAMP_DUEL_MAX_BET", DEFAULT_PVP_BET_MAX),
  pvpRobberyMinLoot: 500,
  pvpRobberyMaxLoot: getPositiveEnvInt("SAMP_PVP_ROB_MAX_LOOT", 50_000),
};

const AUTOCOMPLETE_PAGE_SIZE = 25;

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

function buildPagedLineEmbeds({ title, description, color, lines, linesPerPage = 10, footer }) {
  const chunks = chunkArray(lines, linesPerPage);
  return chunks.map((chunk, pageIndex) => {
    const embed = new EmbedBuilder()
      .setTitle(formatPagedTitle(title, pageIndex, chunks.length))
      .setDescription(joinLines([description, chunk.join("\n")].filter(Boolean)))
      .setColor(color)
      .setTimestamp(new Date());
    if (footer) embed.setFooter({ text: footer });
    return embed;
  });
}

function clampInt(n, min, max) {
  const x = Math.floor(Number(n));
  if (!Number.isFinite(x)) return null;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function normalizeWagerAmount(rawAmount, maxAmount) {
  const value = Math.floor(Number(rawAmount));
  if (!Number.isFinite(value) || value < 1) {
    return { ok: false, message: "Некорректная ставка.", amount: null };
  }
  if (value > maxAmount) {
    return { ok: false, message: `Максимальная ставка — **${fmtMoney(maxAmount)}**.`, amount: null };
  }
  return { ok: true, amount: value, message: null };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clampNumber(n, min, max) {
  return Math.min(max, Math.max(min, Number(n)));
}

function carInfo(carId) {
  return CARS[carId] || CARS[DEFAULT_CAR_ID];
}

function itemInfo(itemId) {
  return ITEMS[itemId] || null;
}

function getEligibleTruckRouteTiers(car) {
  const tiers = TRUCK_ROUTE_TIERS.filter((tier) => Number(car?.speed || 0) >= tier.minSpeed);
  return tiers.length ? tiers : [TRUCK_ROUTE_TIERS[0]];
}

function getEligibleTruckCargoTypes(car, route) {
  const cargos = TRUCK_CARGO_TYPES.filter((cargo) => {
    if (Number(car?.speed || 0) < cargo.minSpeed) return false;
    if (route.id === "local" && (cargo.id === "fuel" || cargo.id === "contraband")) return false;
    if (route.id !== "intercity" && cargo.id === "contraband") return false;
    return true;
  });
  return cargos.length ? cargos : [TRUCK_CARGO_TYPES[0]];
}

function rollTruckContract(user) {
  const car = carInfo(user?.car_id);
  const route = pick(getEligibleTruckRouteTiers(car));
  const cargo = pick(getEligibleTruckCargoTypes(car, route));
  const incident = pick(TRUCK_INCIDENTS);

  const speedBuffer = Math.max(0, Number(car?.speed || 0) - Number(route.minSpeed || 0));
  const safetyDelta = Math.min(0.04, speedBuffer / 500);
  const crashChance = clampNumber(route.crashChance + cargo.riskDelta + incident.riskDelta - safetyDelta, 0.08, 0.35);

  const baseReward = randInt(route.rewardMin, route.rewardMax);
  const cargoBonus = randInt(cargo.rewardBonusMin, cargo.rewardBonusMax);
  const incidentBonus = randInt(incident.rewardBonusMin, incident.rewardBonusMax);
  const rawReward = Math.max(1_500, baseReward + cargoBonus + incidentBonus);

  const rawFine = Math.floor(
    randInt(route.fineMin, route.fineMax) * cargo.fineMultiplier * incident.fineMultiplier
  );

  return {
    route,
    cargo,
    incident,
    car,
    crashChance,
    rawReward,
    rawFine,
    meta: {
      routeId: route.id,
      routeName: route.name,
      cargoId: cargo.id,
      cargoName: cargo.name,
      incidentId: incident.id,
      incidentName: incident.name,
      carId: user?.car_id || DEFAULT_CAR_ID,
      carName: car.name,
      carSpeed: Number(car?.speed || 0),
      crashChance,
      baseReward,
      cargoBonus,
      incidentBonus,
    },
  };
}

function isIgnorableInteractionError(error) {
  const code = Number(error?.code || error?.rawError?.code || 0);
  return code === 10062 || code === 40060;
}

async function sendInteractionResponse(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

async function tryDeferReply(interaction) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferReply();
    return true;
  } catch (error) {
    if (isIgnorableInteractionError(error)) return false;
    throw error;
  }
}

function isMissingTableError(error, tableName = "") {
  const message = String(error?.message || error || "");
  return message.includes("no such table") && (!tableName || message.includes(tableName));
}

async function getInstalledCarUpgradeRows(db, userId, carId) {
  try {
    return await dbAll(
      db,
      `SELECT upgrade_id, durability, installed_at, cosmetic_variant
       FROM samp_car_upgrades
       WHERE user_id = ? AND car_id = ?
       ORDER BY installed_at ASC, upgrade_id ASC`,
      [String(userId), String(carId)]
    );
  } catch (error) {
    if (String(error?.message || error || "").includes("no such column")) {
      const fallbackRows = await dbAll(
        db,
        `SELECT upgrade_id
         FROM samp_car_upgrades
         WHERE user_id = ? AND car_id = ?
         ORDER BY upgrade_id ASC`,
        [String(userId), String(carId)]
      );
      return (fallbackRows || []).map((row) => ({
        ...row,
        durability: 100,
        installed_at: null,
        cosmetic_variant: null,
      }));
    }
    if (isMissingTableError(error, "samp_car_upgrades")) {
      return [];
    }
    throw error;
  }
}

async function getUserRaceStats(db, userId) {
  try {
    await dbRun(
      db,
      `INSERT OR IGNORE INTO samp_race_stats(user_id, races_total, races_won, max_speed_reached, total_winnings)
       VALUES(?, 0, 0, 0, 0)`,
      [String(userId)]
    );
    const row = await dbGet(
      db,
      `SELECT user_id, races_total, races_won, max_speed_reached, total_winnings
       FROM samp_race_stats WHERE user_id = ?`,
      [String(userId)]
    );
    return row || {
      user_id: String(userId),
      races_total: 0,
      races_won: 0,
      max_speed_reached: 0,
      total_winnings: 0,
    };
  } catch (error) {
    if (isMissingTableError(error, "samp_race_stats")) {
      return {
        user_id: String(userId),
        races_total: 0,
        races_won: 0,
        max_speed_reached: 0,
        total_winnings: 0,
      };
    }
    throw error;
  }
}

async function getOrCreateCarTuningProgress(db, userId, carId) {
  const defaults = {
    user_id: String(userId),
    car_id: String(carId),
    level: 1,
    exp: 0,
    next: getNextTuningLevelProgress(0),
  };

  try {
    await dbRun(
      db,
      `INSERT OR IGNORE INTO samp_car_tuning_level(user_id, car_id, level, exp)
       VALUES(?, ?, 1, 0)`,
      [String(userId), String(carId)]
    );
    const row = await dbGet(
      db,
      `SELECT user_id, car_id, level, exp, updated_at
       FROM samp_car_tuning_level
       WHERE user_id = ? AND car_id = ?`,
      [String(userId), String(carId)]
    );
    if (!row) return defaults;
    const exp = Math.max(0, Math.floor(Number(row.exp) || 0));
    const level = Math.min(TUNE_LEVEL_MAX, Math.max(1, Math.floor(Number(row.level) || getTuningLevelFromExp(exp))));
    return {
      ...row,
      level,
      exp,
      next: getNextTuningLevelProgress(exp),
    };
  } catch (error) {
    if (isMissingTableError(error, "samp_car_tuning_level")) {
      return defaults;
    }
    throw error;
  }
}

async function awardCarTuningProgress(db, userId, carId, expDelta) {
  const delta = Math.max(0, Math.floor(Number(expDelta) || 0));
  const current = await getOrCreateCarTuningProgress(db, userId, carId);
  if (delta <= 0 || !current) return current;

  try {
    const exp = Math.max(0, current.exp + delta);
    const level = getTuningLevelFromExp(exp);
    await dbRun(
      db,
      `INSERT INTO samp_car_tuning_level(user_id, car_id, level, exp, updated_at)
       VALUES(?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, car_id) DO UPDATE SET
         level = excluded.level,
         exp = excluded.exp,
         updated_at = excluded.updated_at`,
      [String(userId), String(carId), level, exp]
    );
    return {
      ...current,
      level,
      exp,
      next: getNextTuningLevelProgress(exp),
    };
  } catch (error) {
    if (isMissingTableError(error, "samp_car_tuning_level")) {
      return current;
    }
    throw error;
  }
}

async function getCarVehicleProfile(db, userId, carId) {
  const car = carInfo(carId);
  const [installedParts, tuningProgress] = await Promise.all([
    getInstalledCarUpgradeRows(db, userId, carId),
    getOrCreateCarTuningProgress(db, userId, carId),
  ]);

  const profile = buildCarTuningProfile(car, installedParts, tuningProgress.level);
  return {
    ...car,
    ...profile,
    tuningExp: tuningProgress.exp,
    tuningProgress: tuningProgress.next,
  };
}

async function getCarUpgradeSpeedBonus(db, userId, carId) {
  const profile = await getCarVehicleProfile(db, userId, carId);
  return Math.max(0, profile.topSpeed - profile.baseTopSpeed);
}

async function getRaceCarProfile(db, userId, carId) {
  return getCarVehicleProfile(db, userId, carId);
}

function formatRaceCarLabel(carProfile) {
  return `${carProfile.name}, билд ${carProfile.buildType}, скорость ${carProfile.topSpeed}, старт ${carProfile.launch}, зацеп ${carProfile.grip}, стабильность ${carProfile.stability}, состояние ${carProfile.averageDurability}%`;
}

async function applyCarWearFromRace(db, userId, carId, carProfile, { result = "loss" } = {}) {
  if (!carProfile?.installedParts?.length) return [];
  const perOutcomeBonus = result === "win" ? 0 : result === "draw" ? 1 : 2;

  try {
    const updates = [];
    for (const part of carProfile.installedParts) {
      const wearLoss = Math.max(1, Math.floor(Number(part.wearLoss || 2)) + perOutcomeBonus);
      const nextDurability = Math.max(0, Math.floor(Number(part.durability || 100)) - wearLoss);
      await dbRun(
        db,
        `UPDATE samp_car_upgrades
         SET durability = ?, installed_at = COALESCE(installed_at, datetime('now'))
         WHERE user_id = ? AND car_id = ? AND upgrade_id = ?`,
        [nextDurability, String(userId), String(carId), String(part.id)]
      );
      updates.push({ id: part.id, durability: nextDurability });
    }
    return updates;
  } catch (error) {
    if (String(error?.message || error || "").includes("no such column")) {
      return [];
    }
    if (isMissingTableError(error, "samp_car_upgrades")) {
      return [];
    }
    throw error;
  }
}

async function recordRaceOutcomeStats(db, userId, carProfile, { result = "loss", winnings = 0 } = {}) {
  try {
    await dbRun(
      db,
      `INSERT INTO samp_race_stats(user_id, races_total, races_won, max_speed_reached, total_winnings, updated_at)
       VALUES(?, 1, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         races_total = races_total + 1,
         races_won = races_won + excluded.races_won,
         max_speed_reached = MAX(max_speed_reached, excluded.max_speed_reached),
         total_winnings = total_winnings + excluded.total_winnings,
         updated_at = excluded.updated_at`,
      [
        String(userId),
        result === "win" ? 1 : 0,
        Math.max(0, Math.floor(Number(carProfile?.topSpeed || 0))),
        Math.max(0, Math.floor(Number(winnings || 0))),
      ]
    );
  } catch (error) {
    if (!isMissingTableError(error, "samp_race_stats")) {
      throw error;
    }
  }
}

async function finalizeRaceVehicleProgress(db, userId, carId, carProfile, { result = "loss", winnings = 0 } = {}) {
  const expAward = result === "win" ? 3 : result === "draw" ? 2 : 1;
  await Promise.all([
    awardCarTuningProgress(db, userId, carId, expAward),
    recordRaceOutcomeStats(db, userId, carProfile, { result, winnings }),
    applyCarWearFromRace(db, userId, carId, carProfile, { result }),
  ]);
}

function msToHuman(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}ч ${m}м ${r}с`;
}

function toSqliteUtcDateTime(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function parseSqliteUtcDateTime(value) {
  if (!value) return null;
  const normalized = `${String(value).replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelativeLedgerTime(value) {
  const date = parseSqliteUtcDateTime(value);
  if (!date) return "неизвестно когда";
  return msToHuman(Math.max(0, Date.now() - date.getTime()));
}

function makeInteractionOpKey(interaction, suffix = "") {
  const base = String(interaction?.id || interaction?.token || "").trim();
  if (!base) return null;
  return suffix ? `${base}:${suffix}` : base;
}

function getAutocompletePage(interaction) {
  const rawPage = interaction.options.getInteger("page");
  if (!Number.isInteger(rawPage) || rawPage < 1) return 1;
  return rawPage;
}

function sliceAutocompleteChoices(choices, page) {
  if (!choices.length) return [];

  const totalPages = Math.max(1, Math.ceil(choices.length / AUTOCOMPLETE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * AUTOCOMPLETE_PAGE_SIZE;
  return choices.slice(start, start + AUTOCOMPLETE_PAGE_SIZE);
}

async function withTransaction(db, fn) {
  return withSerializedTransaction(db, fn);
}

async function getUserRow(db, userId) {
  return dbGet(db, "SELECT user_id, money, car_id, rep, jail_until, last_samp_seen_at FROM samp_users WHERE user_id = ?", [String(userId)]);
}

async function getOrCreateUser(db, userId) {
  const uid = String(userId);
  const existing = await getUserRow(db, uid);
  if (existing) return existing;

  await dbRun(
    db,
    `INSERT INTO samp_users(user_id, money, car_id, rep, jail_until, last_samp_seen_at)
     VALUES(?, ?, ?, 0, 0, datetime('now'))` ,
    [uid, START_MONEY, DEFAULT_CAR_ID]
  );
  await dbRun(db, `INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)`, [uid, DEFAULT_CAR_ID]);
  return getUserRow(db, uid);
}

async function touchSampUserSeenAt(db, userId) {
  if (!userId) return;
  await dbRun(db, `UPDATE samp_users SET last_samp_seen_at = datetime('now') WHERE user_id = ?`, [String(userId)]);
}

async function summarizeRobberyLosses(db, userId, { since = null, limit = 5 } = {}) {
  const where = ["type = 'rob_pvp'", "to_user = ?"];
  const params = [String(userId)];
  const normalizedSince = since ? String(since) : null;
  if (normalizedSince) {
    where.push("ts > ?");
    params.push(normalizedSince);
  }

  const whereClause = where.join(" AND ");
  const aggregate = await dbGet(
    db,
    `SELECT COUNT(*) AS total_count, COALESCE(SUM(amount), 0) AS total_amount
     FROM samp_ledger
     WHERE ${whereClause}`,
    params
  );
  const rows = await dbAll(
    db,
    `SELECT id, ts, from_user, to_user, amount
     FROM samp_ledger
     WHERE ${whereClause}
     ORDER BY ts DESC, id DESC
     LIMIT ?`,
    [...params, Math.max(1, Number(limit) || 1)]
  );

  return {
    totalCount: Number(aggregate?.total_count || 0),
    totalAmount: Number(aggregate?.total_amount || 0),
    rows: rows || [],
  };
}

async function summarizePvpMoneyLosses(db, userId, { since = null, limit = 10 } = {}) {
  const uid = String(userId);
  const where = [
    `(
      (type = 'rob_pvp' AND to_user = ?)
      OR (type IN ('race', 'duel', 'transfer') AND from_user = ?)
    )`,
  ];
  const params = [uid, uid];
  const normalizedSince = since ? String(since) : null;
  if (normalizedSince) {
    where.push("ts > ?");
    params.push(normalizedSince);
  }

  const whereClause = where.join(" AND ");
  const aggregate = await dbGet(
    db,
    `SELECT COUNT(*) AS total_count, COALESCE(SUM(amount), 0) AS total_amount
     FROM samp_ledger
     WHERE ${whereClause}`,
    params
  );
  const rows = await dbAll(
    db,
    `SELECT id, ts, type, from_user, to_user, amount, meta_json
     FROM samp_ledger
     WHERE ${whereClause}
     ORDER BY ts DESC, id DESC
     LIMIT ?`,
    [...params, Math.max(1, Number(limit) || 1)]
  );

  return {
    totalCount: Number(aggregate?.total_count || 0),
    totalAmount: Number(aggregate?.total_amount || 0),
    rows: rows || [],
  };
}

function formatRobberyLossLine(row) {
  const robber = row?.from_user ? `<@${row.from_user}>` : "Неизвестный";
  return `• ${robber} украл **${fmtMoney(row?.amount || 0)}** • ${formatRelativeLedgerTime(row?.ts)} назад`;
}

function formatPvpMoneyLossLine(row) {
  const amount = fmtMoney(row?.amount || 0);
  const ago = formatRelativeLedgerTime(row?.ts);
  if (row?.type === "rob_pvp") {
    const robber = row?.from_user ? `<@${row.from_user}>` : "Неизвестный";
    return `• Ограбление: ${robber} украл **${amount}** • ${ago} назад`;
  }
  if (row?.type === "race") {
    const winner = row?.to_user ? `<@${row.to_user}>` : "соперник";
    return `• Гонка: ${winner} забрал **${amount}** • ${ago} назад`;
  }
  if (row?.type === "duel") {
    const winner = row?.to_user ? `<@${row.to_user}>` : "соперник";
    return `• Дуэль: ${winner} забрал **${amount}** • ${ago} назад`;
  }
  if (row?.type === "transfer") {
    const target = row?.to_user ? `<@${row.to_user}>` : "игроку";
    return `• Перевод: ты отправил ${target} **${amount}** • ${ago} назад`;
  }
  return `• Потеря виртов: **${amount}** • ${ago} назад`;
}

function formatRobberyOccurrenceCount(count) {
  const value = Math.abs(Number(count) || 0) % 100;
  const lastDigit = value % 10;
  if (value >= 11 && value <= 14) return "раз";
  if (lastDigit === 1) return "раз";
  if (lastDigit >= 2 && lastDigit <= 4) return "раза";
  return "раз";
}

async function pickOwnedFallbackCarId(db, userId, preferredCarId = DEFAULT_CAR_ID) {
  const rows = await dbAll(
    db,
    `SELECT car_id
     FROM samp_garage
     WHERE user_id = ?
     ORDER BY CASE WHEN car_id = ? THEN 0 ELSE 1 END, acquired_at ASC, car_id ASC`,
    [String(userId), String(preferredCarId)]
  );
  return rows?.[0]?.car_id || null;
}

async function ensureFallbackActiveCar(db, userId, preferredCarId = DEFAULT_CAR_ID) {
  const fallbackCarId = await pickOwnedFallbackCarId(db, userId, preferredCarId);
  if (fallbackCarId) {
    await dbRun(
      db,
      `UPDATE samp_users SET car_id = ?, updated_at = datetime('now') WHERE user_id = ?`,
      [String(fallbackCarId), String(userId)]
    );
    return fallbackCarId;
  }

  await dbRun(db, `INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)`, [String(userId), String(preferredCarId)]);
  await dbRun(
    db,
    `UPDATE samp_users SET car_id = ?, updated_at = datetime('now') WHERE user_id = ?`,
    [String(preferredCarId), String(userId)]
  );
  return preferredCarId;
}

async function ensureNotJailed(interaction, userRow) {
  const until = Number(userRow?.jail_until || 0);
  if (until > nowMs()) {
    const left = msToHuman(until - nowMs());
    await sendInteractionResponse(interaction, {
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

async function getChallengePairCooldown(db, challengerUserId, targetUserId, action) {
  const row = await dbGet(
    db,
    `SELECT ready_at
     FROM samp_challenge_pair_cooldowns
     WHERE challenger_user_id = ?
       AND target_user_id = ?
       AND action = ?`,
    [String(challengerUserId), String(targetUserId), String(action)]
  );
  return row ? Number(row.ready_at || 0) : 0;
}

async function setChallengePairCooldown(db, challengerUserId, targetUserId, action, readyAt) {
  await dbRun(
    db,
    `INSERT INTO samp_challenge_pair_cooldowns(challenger_user_id, target_user_id, action, ready_at)
     VALUES(?, ?, ?, ?)
     ON CONFLICT(challenger_user_id, target_user_id, action)
     DO UPDATE SET ready_at = excluded.ready_at`,
    [String(challengerUserId), String(targetUserId), String(action), Number(readyAt)]
  );
}

function formatChallengePairCooldownMessage(action, targetUserId, remainingMs) {
  if (action === "rob") {
    return `⏳ Ты уже недавно пытался ограбить <@${targetUserId}>. Повтори через **${msToHuman(remainingMs)}**.`;
  }
  const label = action === "duel" ? "дуэль" : "гонку";
  return `⏳ Ты уже недавно вызывал <@${targetUserId}> на ${label}. Повтори через **${msToHuman(remainingMs)}**.`;
}

async function checkAndConsumeCooldown(interaction, db, userId, action) {
  const result = await consumeCooldownAtomic(db, userId, action);
  if (!result.ok) {
    await sendInteractionResponse(interaction, { content: `⏳ Рано. Подожди **${msToHuman(result.remainingMs)}**.`, ephemeral: true });
    return false;
  }
  return true;
}

async function checkCooldownWithoutConsuming(interaction, db, userId, action) {
  const readyAt = await getCooldown(db, userId, action);
  if (readyAt > nowMs()) {
    await sendInteractionResponse(interaction, {
      content: `⏳ Рано. Подожди **${msToHuman(readyAt - nowMs())}**.`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

async function consumeCooldownAtomic(db, userId, action, readyAt = nowMs() + (COOLDOWNS_MS[action] || 60_000)) {
  return withTransaction(db, async () => {
    const now = nowMs();
    // a1: UPSERT via INSERT ON CONFLICT guarantees atomicity
    try {
      const result = await dbRun(
        db,
        `INSERT INTO samp_cooldowns(user_id, action, ready_at)
         VALUES(?, ?, ?)
         ON CONFLICT(user_id, action)
         DO UPDATE SET ready_at = excluded.ready_at
         WHERE ready_at <= ?`,
        [String(userId), String(action), readyAt, now]
      );
      if (result?.changes > 0) return { ok: true, readyAt };
    } catch (err) {
      // unexpected
    }
    const existing = await dbGet(
      db,
      "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?",
      [String(userId), String(action)]
    );
    const currentReadyAt = Number(existing?.ready_at || 0);
    return { ok: false, remainingMs: Math.max(0, currentReadyAt - now), readyAt: currentReadyAt };
  });
}

async function addLedger(db, type, fromUser, toUser, amount, meta = {}) {
  await dbRun(
    db,
    `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json)
     VALUES(?, ?, ?, ?, ?)`,
    [type, fromUser ? String(fromUser) : null, toUser ? String(toUser) : null, Number(amount || 0), JSON.stringify(meta || {})]
  );
}

async function addLedgerUnique(db, type, fromUser, toUser, amount, idempotencyKey, meta = {}) {
  const key = String(idempotencyKey || "").trim();
  if (!key) {
    await addLedger(db, type, fromUser, toUser, amount, meta);
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
      fromUser ? String(fromUser) : null,
      toUser ? String(toUser) : null,
      Number(amount || 0),
      JSON.stringify(payload),
      type,
      fromUser ? String(fromUser) : null,
      toUser ? String(toUser) : null,
      key,
    ]
  );
  return Number(result?.changes || 0) > 0;
}

async function adjustMoney(db, userId, delta) {
  const uid = String(userId);
  const d = Number(delta);
  if (d >= 0) {
    await dbRun(db, `UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`, [d, uid]);
  } else {
    // Clamp at zero to prevent negative balances
    await dbRun(db, `UPDATE samp_users SET money = MAX(0, money + ?), updated_at = datetime('now') WHERE user_id = ?`, [d, uid]);
  }
}

async function recordTruckRun(db, userId, opKey, contract, outcome = {}) {
  await dbRun(
    db,
    `INSERT OR IGNORE INTO samp_truck_runs (
      op_key,
      user_id,
      route_id,
      route_name,
      cargo_id,
      cargo_name,
      incident_id,
      incident_name,
      car_id,
      car_name,
      car_speed,
      crash_chance,
      base_reward,
      cargo_bonus,
      incident_bonus,
      contract_amount,
      actual_amount,
      boost_amount,
      net_amount,
      crashed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(opKey),
      String(userId),
      String(contract?.route?.id || contract?.meta?.routeId || "unknown"),
      String(contract?.route?.name || contract?.meta?.routeName || "Неизвестный рейс"),
      String(contract?.cargo?.id || contract?.meta?.cargoId || "unknown"),
      String(contract?.cargo?.name || contract?.meta?.cargoName || "Неизвестный груз"),
      String(contract?.incident?.id || contract?.meta?.incidentId || "unknown"),
      String(contract?.incident?.name || contract?.meta?.incidentName || "Неизвестная ситуация"),
      String(contract?.meta?.carId || DEFAULT_CAR_ID),
      String(contract?.meta?.carName || contract?.car?.name || carInfo(DEFAULT_CAR_ID).name),
      Number(contract?.meta?.carSpeed || contract?.car?.speed || 0),
      Number(contract?.meta?.crashChance || contract?.crashChance || 0),
      Number(contract?.meta?.baseReward || 0),
      Number(contract?.meta?.cargoBonus || 0),
      Number(contract?.meta?.incidentBonus || 0),
      Number(outcome.contractAmount ?? 0),
      Number(outcome.actualAmount ?? 0),
      Number(outcome.boostAmount ?? 0),
      Number(outcome.netAmount ?? 0),
      outcome.crashed ? 1 : 0,
    ]
  );
}

async function transferMoney(db, fromUserId, toUserId, amount, ledgerType, meta = {}, idempotencyKey = null) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");

  await withTransaction(db, async () => {
    const from = await getOrCreateUser(db, fromUserId);
    const to = await getOrCreateUser(db, toUserId);

    if (Number(from.money) < amt) throw new Error("INSUFFICIENT");

    const inserted = await addLedgerUnique(db, ledgerType, fromUserId, toUserId, amt, idempotencyKey, meta);
    if (!inserted) throw new Error("DUPLICATE_OPERATION");

    await adjustMoney(db, fromUserId, -amt);
    await adjustMoney(db, toUserId, amt);

    // sanity: prevent negative balances
    const check = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", [String(fromUserId)]);
    if (Number(check?.money) < 0) throw new Error("NEGATIVE_BALANCE");
  });
}

async function transferMoneyWithParticipants(db, fromUserId, toUserId, amount, ledgerType, participantCooldowns, meta = {}, idempotencyKey = null) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");

  await withTransaction(db, async () => {
    const from = await getOrCreateUser(db, fromUserId);
    await getOrCreateUser(db, toUserId);

    if (Number(from.money) < amt) throw new Error("INSUFFICIENT");

    const inserted = await addLedgerUnique(db, ledgerType, fromUserId, toUserId, amt, idempotencyKey, meta);
    if (!inserted) throw new Error("DUPLICATE_OPERATION");

    for (const participant of participantCooldowns || []) {
      const readyAt = Number(participant?.readyAt || 0);
      if (readyAt > 0) {
        await setCooldown(db, participant.userId, participant.action, readyAt);
      }
    }

    await adjustMoney(db, fromUserId, -amt);
    await adjustMoney(db, toUserId, amt);

    const check = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", [String(fromUserId)]);
    if (Number(check?.money) < 0) throw new Error("NEGATIVE_BALANCE");
  });
}

async function settleWagerWithParticipants(
  db,
  loserUserId,
  winnerUserId,
  requestedAmount,
  ledgerType,
  participantCooldowns,
  pairCooldown,
  meta = {},
  idempotencyKey = null
) {
  const requested = Number(requestedAmount);
  if (!Number.isFinite(requested) || requested <= 0) throw new Error("Invalid amount");

  return withTransaction(db, async () => {
    const loser = await getOrCreateUser(db, loserUserId);
    await getOrCreateUser(db, winnerUserId);

    const settledAmount = Math.max(0, Math.min(requested, Number(loser?.money || 0)));
    const ledgerMeta = {
      ...(meta || {}),
      requested_amount: requested,
      settled_amount: settledAmount,
    };
    const inserted = await addLedgerUnique(db, ledgerType, loserUserId, winnerUserId, settledAmount, idempotencyKey, ledgerMeta);
    if (!inserted) throw new Error("DUPLICATE_OPERATION");

    if (pairCooldown?.readyAt > 0) {
      await setChallengePairCooldown(db, pairCooldown.challengerUserId, pairCooldown.targetUserId, pairCooldown.action, pairCooldown.readyAt);
    }
    for (const participant of participantCooldowns || []) {
      const readyAt = Number(participant?.readyAt || 0);
      if (readyAt > 0) {
        await setCooldown(db, participant.userId, participant.action, readyAt);
      }
    }

    if (settledAmount > 0) {
      await adjustMoney(db, loserUserId, -settledAmount);
      await adjustMoney(db, winnerUserId, settledAmount);
    }

    const check = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", [String(loserUserId)]);
    if (Number(check?.money) < 0) throw new Error("NEGATIVE_BALANCE");

    return {
      requestedAmount: requested,
      settledAmount,
      wasReduced: settledAmount < requested,
    };
  });
}

function buildReducedSettlementNote(requestedAmount, settledAmount, loserUserId) {
  if (Number(settledAmount) >= Number(requestedAmount)) return "";
  if (Number(settledAmount) > 0) {
    return `\n⚠️ К моменту расчёта у <@${loserUserId}> осталось только **${fmtMoney(settledAmount)}**, поэтому выплата уменьшена с **${fmtMoney(requestedAmount)}**.`;
  }
  return `\n⚠️ К моменту расчёта у <@${loserUserId}> уже не осталось виртов, поэтому ставка не принесла выплату.`;
}

async function applyMoneyDeltaAtomic(db, userId, delta, { minBalance = null } = {}) {
  const numericDelta = Number(delta || 0);
  return withTransaction(db, async () => {
    const user = await getOrCreateUser(db, userId);
    const currentMoney = Number(user.money || 0);
    const nextMoney = currentMoney + numericDelta;
    if (minBalance != null && nextMoney < Number(minBalance)) {
      throw new Error("INSUFFICIENT");
    }
    if (nextMoney < 0) {
      throw new Error("NEGATIVE_BALANCE");
    }
    await adjustMoney(db, userId, numericDelta);
    return nextMoney;
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_samp_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
  try { await dbRun(db, `ALTER TABLE samp_users ADD COLUMN last_samp_seen_at TEXT`); } catch (_) {}
  await dbRun(
    db,
    `UPDATE samp_users
     SET last_samp_seen_at = COALESCE(NULLIF(last_samp_seen_at, ''), updated_at, created_at, datetime('now'))`
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
    `CREATE TABLE IF NOT EXISTS samp_challenge_pair_cooldowns (
      challenger_user_id TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      ready_at INTEGER NOT NULL,
      PRIMARY KEY (challenger_user_id, target_user_id, action)
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

    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS samp_truck_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        op_key TEXT NOT NULL UNIQUE,
        user_id TEXT NOT NULL,
        route_id TEXT NOT NULL,
        route_name TEXT NOT NULL,
        cargo_id TEXT NOT NULL,
        cargo_name TEXT NOT NULL,
        incident_id TEXT NOT NULL,
        incident_name TEXT NOT NULL,
        car_id TEXT NOT NULL,
        car_name TEXT NOT NULL,
        car_speed INTEGER NOT NULL DEFAULT 0,
        crash_chance REAL NOT NULL DEFAULT 0,
        base_reward INTEGER NOT NULL DEFAULT 0,
        cargo_bonus INTEGER NOT NULL DEFAULT 0,
        incident_bonus INTEGER NOT NULL DEFAULT 0,
        contract_amount INTEGER NOT NULL DEFAULT 0,
        actual_amount INTEGER NOT NULL DEFAULT 0,
        boost_amount INTEGER NOT NULL DEFAULT 0,
        net_amount INTEGER NOT NULL DEFAULT 0,
        crashed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_truck_runs_user_created ON samp_truck_runs(user_id, created_at DESC)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_truck_runs_route_created ON samp_truck_runs(route_id, created_at DESC)`);
    await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_truck_runs_incident_created ON samp_truck_runs(incident_id, created_at DESC)`);

  // Tables owned by sibling modules — create them here so samp-life can
  // safely read/write boost + onboarding state on the first call.
  try { await ensureCosmeticsTables(db); } catch (err) { console.error("[samp-life] ensureCosmeticsTables", err?.message || err); }
  try { await ensureOnboardingTables(db); } catch (err) { console.error("[samp-life] ensureOnboardingTables", err?.message || err); }
}

// -------------------------
// Slash builders
// -------------------------
function getSampLifeCommandBuilders() {
  return [
    new SlashCommandBuilder().setName("reg").setDescription("SAMP Life: регистрация (паспорт гражданина SA)"),

    new SlashCommandBuilder().setName("balance").setDescription("SAMP Life: показать баланс и профиль"),

    new SlashCommandBuilder()
      .setName("moneylog")
      .setDescription("SAMP Life: кто забирал твои вирты")
      .addIntegerOption((o) => o.setName("hours").setDescription("Окно истории в часах (по умолчанию: 24)").setRequired(false).setMinValue(1).setMaxValue(24 * 30))
      .addIntegerOption((o) => o.setName("limit").setDescription("Сколько записей показать (по умолчанию: 10)").setRequired(false).setMinValue(1).setMaxValue(20)),

    new SlashCommandBuilder().setName("work").setDescription("SAMP Life: подзаработать по-мелочи (короткий кулдаун)"),

    new SlashCommandBuilder().setName("truck").setDescription("SAMP Life: дальнобой (длинный кулдаун, риск аварии)"),

    new SlashCommandBuilder()
      .setName("rob")
      .setDescription("SAMP Life: ограбить игрока или 24/7")
      .addUserOption((o) => o.setName("user").setDescription("Кого грабим (необязательно — без цели грабим 24/7)").setRequired(false)),

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
      .addIntegerOption((o) =>
        o
          .setName("page")
          .setDescription("Страница списка для автокомплита")
          .setRequired(false)
          .setMinValue(1)
      )
      .addStringOption((o) => o.setName("id").setDescription("ID (необязательно; без него покажу полный список)").setRequired(false).setAutocomplete(true)),

    new SlashCommandBuilder()
      .setName("race")
      .setDescription("SAMP Life: гонка на вирты")
      .addUserOption((o) => o.setName("user").setDescription("С кем гонка").setRequired(true))
      .addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(1).setMaxValue(PVP_AMOUNT_LIMITS.raceBetMax)),

    new SlashCommandBuilder()
      .setName("duel")
      .setDescription("SAMP Life: дуэль на вирты")
      .addUserOption((o) => o.setName("user").setDescription("С кем дуэль").setRequired(true))
      .addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(1).setMaxValue(PVP_AMOUNT_LIMITS.duelBetMax)),

    new SlashCommandBuilder()
      .setName("sellcar")
      .setDescription("SAMP Life: продать тачку игроку")
      .addUserOption((o) => o.setName("user").setDescription("Покупатель").setRequired(true))
      .addStringOption((o) =>
        o
          .setName("car")
          .setDescription("ID тачки")
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption((o) => o.setName("price").setDescription("Цена").setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
      .setName("buycar")
      .setDescription("SAMP Life: купить тачку по офферу")
      .addIntegerOption((o) => o.setName("offer").setDescription("ID оффера").setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
      .setName("weapon")
      .setDescription("SAMP Life: выбрать активное оружие")
      .addStringOption((o) => o.setName("id").setDescription("ID оружия (для длинного списка укажи page)").setRequired(true).setAutocomplete(true))
      .addIntegerOption((o) =>
        o
          .setName("page")
          .setDescription("Страница списка для автокомплита")
          .setRequired(false)
          .setMinValue(1)
      ),

    new SlashCommandBuilder().setName("weaponshop").setDescription("SAMP Life: магазин оружия Ammu-Nation (цены/урон)"),

    new SlashCommandBuilder()
      .setName("pay")
      .setDescription("SAMP Life: перевести деньги игроку")
      .addUserOption((o) => o.setName("user").setDescription("Кому").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Сумма").setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
      .setName("slots")
      .setDescription("SAMP Life: игровые автоматы Las Venturas")
      .addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(100).setMaxValue(100000)),

    new SlashCommandBuilder()
      .setName("blackjack")
      .setDescription("SAMP Life: блэкджек в казино Four Dragons")
      .addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(500).setMaxValue(500000)),

    new SlashCommandBuilder()
      .setName("roulette")
      .setDescription("SAMP Life: рулетка Caligula's Palace")
      .addStringOption((o) => o.setName("color").setDescription("Цвет").setRequired(true).addChoices(
        { name: "🔴 Красное", value: "red" },
        { name: "⚫ Чёрное", value: "black" },
        { name: "🟢 Зелёное (x14)", value: "green" }
      ))
      .addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(100).setMaxValue(500000)),
  ];
}

// -------------------------
// Commands
// -------------------------

/**
 * Onboarding helper: after a quest step completes, silently credit the
 * reward into samp_users and return a short Russian text suffix to append
 * to the player-facing message. Returns "" if nothing happened.
 */
async function maybeCompleteOnboarding(db, userId, stepKey, extra = {}) {
  try {
    const res = await triggerOnboardingEvent(db, userId, stepKey, extra);
    if (!res?.completed) return "";
    const reward = Number(res.reward || 0);
    if (reward > 0) {
      await adjustMoney(db, userId, reward);
      await addLedger(db, "onboarding_reward", null, userId, reward, { step: res.step?.key, title: res.step?.title }).catch(() => {});
    }
    return `\n\n🎯 **Квест новичка: «${res.step.title}»** — выполнено! +${fmtMoney(reward)}. Прогресс: **/quest**.`;
  } catch (_) {
    return "";
  }
}

async function handleReg(interaction, db) {
  const userId = interaction.user.id;
  const existing = await getUserRow(db, userId);
  if (existing) {
    await interaction.reply({ content: "У тебя уже есть паспорт гражданина SA.", ephemeral: true });
    return;
  }

  await getOrCreateUser(db, userId);
  await addLedger(db, "reg", null, userId, START_MONEY, {});
  await startOnboarding(db, userId).catch(() => {});

  await interaction.reply(
    `Добро пожаловать в San Andreas, **${interaction.user.username}**!\n` +
      `Старт: **${fmtMoney(START_MONEY)}** и **${CARS[DEFAULT_CAR_ID].name}**.\n` +
      `Пиши /work чтобы подняться.\n\n` +
      `🎯 **Квест новичка** открыт! Посмотри его через **/quest** — за первые пять шагов можно поднять **+52,000$**.`
  );
}

async function handleBalance(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);
  const awayRobberies = await summarizeRobberyLosses(db, userId, { since: user.last_samp_seen_at, limit: 3 });
  const carProfile = await getCarVehicleProfile(db, userId, user.car_id);
  const weaponId = await getActiveWeapon(db, userId);
  const weapon = weaponId ? itemInfo(weaponId) : null;
  const cosmetics = await getUserCosmetics(db, userId);
  const weaponName = weapon
    ? (weaponId === "deagle" && cosmetics?.raw?.weapon_skin_deagle === "gold"
        ? "Золотой Desert Eagle"
        : weapon.name)
    : null;
  const specialItems = await dbAll(
    db,
    `SELECT item_id, qty
     FROM samp_inventory
     WHERE user_id = ?
       AND item_id IN ('bm_armor', 'bm_map', 'bm_nos_boost', 'bm_jail_pass', 'bm_medkit',
                        'bm_wiretap', 'bm_sabotage', 'bm_laundering', 'bm_repair_kit', 'bm_disguise', 'bm_hot_tip')
       AND qty > 0
     ORDER BY item_id ASC`,
    [String(userId)]
  );
  const stashLines = (specialItems || []).map((row) => {
    const label = BLACK_MARKET_INVENTORY_LABELS[row.item_id] || row.item_id;
    return `• ${label} x${Number(row.qty || 0)}`;
  });

  const jailUntil = Number(user.jail_until || 0);
  const jailText = jailUntil > nowMs() ? `🚔 Тюрьма: ещё **${msToHuman(jailUntil - nowMs())}**` : "✅ На свободе";

  const fields = [
    { name: "💵 Финансы", value: `Баланс: **${fmtMoney(user.money)}**`, inline: true },
    { name: "🚘 Активная тачка", value: joinLines([
      `**${carProfile.name}** • ${carProfile.buildType}`,
      `Скорость: **${carProfile.topSpeed}**${carProfile.topSpeedBonus > 0 ? ` (база ${carProfile.baseTopSpeed} + ${carProfile.topSpeedBonus})` : ""}`,
      `Старт/зацеп: **${carProfile.launch} / ${carProfile.grip}** | Стабильность: **${carProfile.stability}**`,
      `Тюнинг-уровень: **${carProfile.tuningLevel}/${TUNE_LEVEL_MAX}** | Состояние: **${carProfile.averageDurability}%**`,
    ]), inline: true },
    { name: "🔫 Оружие", value: weaponName ? `**${weaponName}**` : "—", inline: true },
  ];
  if (awayRobberies.totalCount > 0) {
    const robberyLines = awayRobberies.rows.map(formatRobberyLossLine);
    if (awayRobberies.totalCount > awayRobberies.rows.length) {
      robberyLines.push(`• И ещё **${awayRobberies.totalCount - awayRobberies.rows.length}** ограблений. Полный список: **/moneylog**`);
    } else {
      robberyLines.push("• Полный список можно открыть через **/moneylog**");
    }
    fields.push({
      name: "🕵️ Пока тебя не было",
      value: joinLines([
        `Тебя ограбили **${awayRobberies.totalCount}** ${formatRobberyOccurrenceCount(awayRobberies.totalCount)} на **${fmtMoney(awayRobberies.totalAmount)}**.`,
        ...robberyLines,
      ]),
      inline: false,
    });
  }
  if (stashLines.length > 0) {
    fields.push({ name: "🕶️ Тайник", value: stashLines.join("\n"), inline: false });
  }
  // Prestige (mansion / aircraft / crew) — best-effort, never blocks /balance.
  try {
    const { getUserMansion, getUserAircraft, getUserCrew } = require("./samp-prestige");
    const [mansion, aircraft, crew] = await Promise.all([
      getUserMansion(db, userId),
      getUserAircraft(db, userId),
      getUserCrew(db, userId),
    ]);
    if (mansion || (aircraft && aircraft.length) || (crew && crew.length)) {
      const prestigeLines = [];
      if (mansion) {
        const benefitParts = [];
        if (mansion.dailyRent) benefitParts.push(`+${fmtMoney(mansion.dailyRent)}/24ч`);
        if (mansion.bonuses?.robLossMitigation) benefitParts.push(`☂️ −${Math.round(mansion.bonuses.robLossMitigation * 100)}% потерь`);
        const benefitNote = benefitParts.length ? ` _(${benefitParts.join(" · ")})_` : "";
        prestigeLines.push(`${mansion.emoji} **${mansion.name}** _(${mansion.district})_${benefitNote}`);
      }
      if (aircraft && aircraft.length) prestigeLines.push(`✈️ ${aircraft.map((a) => `${a.emoji} ${a.name}`).join(", ")}`);
      if (crew && crew.length) prestigeLines.push(`👥 Команда: ${crew.map((m) => `${m.role.emoji} ${m.role.name}`).join(", ")}`);
      fields.push({ name: "🏖️ Резиденция и команда", value: prestigeLines.join("\n"), inline: false });
    }
  } catch (e) { console.error("[samp-life] prestige profile field error", e); }
  fields.push({ name: "⚖️ Статус", value: jailText, inline: false });

  const embed = new EmbedBuilder()
    .setTitle("SAMP Life — Профиль")
    .setDescription(`Игрок: <@${userId}>`)
    .addFields(fields)
    .setTimestamp(new Date());

  applyUserCosmeticsToEmbed(embed, cosmetics, interaction.user.username, 0x3b82f6);

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

async function handleMoneyLog(interaction, db) {
  const userId = interaction.user.id;
  await getOrCreateUser(db, userId);

  const hours = clampInt(interaction.options.getInteger("hours") ?? 24, 1, 24 * 30) || 24;
  const limit = clampInt(interaction.options.getInteger("limit") ?? 10, 1, 20) || 10;
  const since = toSqliteUtcDateTime(Date.now() - hours * 60 * 60_000);
  const summary = await summarizePvpMoneyLosses(db, userId, { since, limit });

  if (summary.totalCount <= 0) {
    await interaction.reply({
      content: `За последние **${hours}ч** нет потерь виртов через **/rob**, **/race**, **/duel** или **/pay**.`,
      ephemeral: true,
    });
    return;
  }

  const lines = summary.rows.map(formatPvpMoneyLossLine);
  if (summary.totalCount > summary.rows.length) {
    lines.push(`• И ещё **${summary.totalCount - summary.rows.length}** записей в этом окне.`);
  }

  const embeds = buildPagedLineEmbeds({
    title: "SAMP Life — История потерь виртов",
    description: `За последние **${hours}ч** у тебя списали или забрали **${summary.totalCount}** ${formatRobberyOccurrenceCount(summary.totalCount)} на **${fmtMoney(summary.totalAmount)}**.`,
    color: 0xef4444,
    lines,
    linesPerPage: 8,
    footer: "Показываются PvP-потери и переводы: /rob, /race, /duel, /pay",
  });

  await interaction.reply({ embeds, ephemeral: true });
}

async function handleWork(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);

  if (!(await ensureNotJailed(interaction, user))) return;
  if (!(await checkCooldownWithoutConsuming(interaction, db, userId, "work"))) return;
  if (!(await tryDeferReply(interaction))) return;
  if (!(await checkAndConsumeCooldown(interaction, db, userId, "work"))) return;

  const jobs = ["разносил пиццу", "мыл тачку босса", "грузил ящики в порту", "таскал колёса на шинке"]; 
  let job = pick(jobs);
  let aircraftFlavor = false;
  let aircraftBonus = 0;
  // Aircraft owners get a rare aviation-flavored job with a flat bonus.
  try {
    const { AIRCRAFT_WORK_FLAVOR_CHANCE, AIRCRAFT_WORK_FLAVOR_BONUS_MIN, AIRCRAFT_WORK_FLAVOR_BONUS_MAX, AIRCRAFT_WORK_FLAVOR_LINES } = require("./constants/prestige");
    const { getUserAircraft } = require("./samp-prestige");
    const owned = await getUserAircraft(db, userId).catch(() => []);
    if (owned && owned.length > 0 && Math.random() < AIRCRAFT_WORK_FLAVOR_CHANCE) {
      job = pick(AIRCRAFT_WORK_FLAVOR_LINES);
      aircraftBonus = randInt(AIRCRAFT_WORK_FLAVOR_BONUS_MIN, AIRCRAFT_WORK_FLAVOR_BONUS_MAX);
      aircraftFlavor = true;
    }
  } catch (_) { /* prestige module optional */ }
  let levelRow = null;
  try {
    levelRow = await dbGet(db, "SELECT level FROM user_levels WHERE guild_id = ? AND user_id = ?", [interaction.guild?.id, userId]);
  } catch (_) {
    levelRow = null;
  }
  const level = levelRow?.level || 1;
  const boosts = await getUserBoostEffects(db, userId).catch(() => null);
  const baseEarnings = Math.floor(randInt(100, 500) * (1 + level * 0.1));
  const earnings = Math.floor(baseEarnings * (boosts?.workMultiplier || 1)) + aircraftBonus;
  const boostDelta = earnings - baseEarnings - aircraftBonus;

  const opKey = makeInteractionOpKey(interaction, "work");
  await withTransaction(db, async () => {
    await adjustMoney(db, userId, earnings);
    const inserted = await addLedgerUnique(db, "work", null, userId, earnings, opKey, { job, base: baseEarnings, boost: boostDelta, aircraft_flavor: aircraftFlavor, aircraft_bonus: aircraftBonus });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    // Apply cooldown multiplier from boosts.
    if (boosts && boosts.cooldownMultiplier < 1) {
      const newReadyAt = nowMs() + Math.floor((COOLDOWNS_MS.work || 60_000) * boosts.cooldownMultiplier);
      await setCooldown(db, userId, "work", newReadyAt);
    }
  });

  const after = await getUserRow(db, userId);
  const boostNote = boostDelta > 0 ? ` _(бонус лицензии: +${fmtMoney(boostDelta)})_` : "";
  const aviationNote = aircraftFlavor ? ` ✈️ _(авиа-бонус: +${fmtMoney(aircraftBonus)})_` : "";
  const questNote = await maybeCompleteOnboarding(db, userId, "work");
  await interaction.editReply(`🛠 Ты ${job} и поднял **${fmtMoney(earnings)}**.${boostNote}${aviationNote} Баланс: **${fmtMoney(after.money)}**${questNote}`);
}

async function handleTruck(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);

  if (!(await ensureNotJailed(interaction, user))) return;
  if (!(await checkCooldownWithoutConsuming(interaction, db, userId, "truck"))) return;
  if (!(await tryDeferReply(interaction))) return;
  if (!(await checkAndConsumeCooldown(interaction, db, userId, "truck"))) return;

  const contract = rollTruckContract(user);
  const crash = Math.random() < contract.crashChance;
  if (crash) {
    let fine = 0;
    const opKey = makeInteractionOpKey(interaction, "truck_crash");
    await withTransaction(db, async () => {
      const latest = await getUserRow(db, userId);
      fine = Math.min(contract.rawFine, Number(latest?.money || 0));
      if (fine <= 0) return;
      const inserted = await addLedgerUnique(db, "truck_crash", userId, null, fine, opKey, {
        ...contract.meta,
        incidentText: contract.incident.crashText,
      });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      await adjustMoney(db, userId, -fine);
      await recordTruckRun(db, userId, opKey, contract, {
        crashed: true,
        contractAmount: contract.rawFine,
        actualAmount: fine,
        boostAmount: 0,
        netAmount: -fine,
      });
    });
    const after = await getUserRow(db, userId);
    await interaction.editReply(
      `🚚💥 Ты улетел в кювет на рейсе **${contract.route.name}**.\n`
      + `Груз: **${contract.cargo.name}** • Ситуация: **${contract.incident.name}**\n`
      + `${contract.incident.crashText}\n`
      + `Штраф/ремонт: **-${fmtMoney(fine)}**. Баланс: **${fmtMoney(after.money)}**`
    );
    return;
  }

  const boostsT = await getUserBoostEffects(db, userId).catch(() => null);
  const baseTruck = contract.rawReward;
  const earnings = Math.floor(baseTruck * (boostsT?.truckMultiplier || 1));
  const boostDeltaT = earnings - baseTruck;
  const opKey = makeInteractionOpKey(interaction, "truck");
  await withTransaction(db, async () => {
    await adjustMoney(db, userId, earnings);
    const inserted = await addLedgerUnique(db, "truck", null, userId, earnings, opKey, {
      ...contract.meta,
      base: baseTruck,
      boost: boostDeltaT,
      incidentText: contract.incident.successText,
    });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await recordTruckRun(db, userId, opKey, contract, {
      crashed: false,
      contractAmount: baseTruck,
      actualAmount: earnings,
      boostAmount: boostDeltaT,
      netAmount: earnings,
    });
    if (boostsT && boostsT.cooldownMultiplier < 1) {
      const newReadyAt = nowMs() + Math.floor((COOLDOWNS_MS.truck || 900_000) * boostsT.cooldownMultiplier);
      await setCooldown(db, userId, "truck", newReadyAt);
    }
  });
  const after = await getUserRow(db, userId);
  const boostNoteT = boostDeltaT > 0 ? ` _(лицензия дальнобойщика: +${fmtMoney(boostDeltaT)})_` : "";
  const questNoteT = await maybeCompleteOnboarding(db, userId, "truck");
  await interaction.editReply(
    `🚚 Контракт закрыт: **${contract.route.name}**.\n`
    + `Груз: **${contract.cargo.name}** • Ситуация: **${contract.incident.name}**\n`
    + `${contract.incident.successText}\n`
    + `Выплата: **${fmtMoney(earnings)}**.${boostNoteT} Баланс: **${fmtMoney(after.money)}**${questNoteT}`
  );
}

async function handleRob(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);

  if (!(await ensureNotJailed(interaction, user))) return;
  if (!(await checkCooldownWithoutConsuming(interaction, db, userId, "rob"))) return;
  if (!(await tryDeferReply(interaction))) return;
  if (!(await checkAndConsumeCooldown(interaction, db, userId, "rob"))) return;

  const target = interaction.options.getUser("user");

  // --- PvP robbery (target specified) ---
  if (target) {
    if (target.bot) { await interaction.editReply("Ботов грабить нельзя."); return; }
    if (target.id === userId) { await interaction.editReply("Сам себя? Серьёзно?"); return; }

    const victim = await getUserRow(db, target.id);
    if (!victim) { await interaction.editReply("Этот игрок не зарегистрирован в SAMP Life."); return; }

    const pairRobCd = await getChallengePairCooldown(db, userId, target.id, "rob");
    if (pairRobCd > nowMs()) {
      await interaction.editReply(formatChallengePairCooldownMessage("rob", target.id, pairRobCd - nowMs()));
      return;
    }

    const robPairReadyAt = nowMs() + CHALLENGE_PAIR_COOLDOWNS_MS.rob;

    // Disguise: blocks PvP robbery
    try {
      const { getUserSetting } = require("./samp-extended");
      const disguisedUntilVal = await getUserSetting(db, target.id, "disguised_until");
      if (disguisedUntilVal && Number(disguisedUntilVal) > nowMs()) {
        await interaction.editReply("🎭 Этого человека невозможно опознать — он в маскировке. Ограбление сорвалось.");
        return;
      }
    } catch (_) {}

    // Bodyguard / private security intercept (consumes daily counter on victim).
    let bgLootMitigation = 0;
    try {
      const { consumeBodyguardIntercept } = require("./samp-prestige");
      const bg = await consumeBodyguardIntercept(db, target.id);
      if (bg?.intercepted) {
        const roleName = bg.role === "private_security" ? "Частная охрана" : "Телохранитель";
        const remainingNote = bg.remaining > 0 ? ` _(остались интерсепты: ${bg.remaining})_` : "";
        await setChallengePairCooldown(db, userId, target.id, "rob", robPairReadyAt);
        await interaction.editReply(
          `🛡️ **${roleName}** жертвы перехватил тебя. Ограбление сорвано, никто никому ничего.${remainingNote}`
        );
        return;
      }
      if (bg?.mitigated) bgLootMitigation = bg.mitigated;
    } catch (e) { console.error("[samp-life] bodyguard hook error", e); }

    // 40% caught (higher risk PvP)
    const caught = Math.random() < 0.40;
    if (caught) {
      const jailMs = 5 * 60_000;
      const rawFine = randInt(1000, 4000);
      // Laundering: reduce fine by 40%
      let launderingDiscount = 0;
      try {
        const { getInventoryQty, consumeInventoryItem } = require("./samp-extended");
        const launderQty = await getInventoryQty(db, userId, "bm_laundering");
        if (launderQty > 0) { launderingDiscount = 0.40; await consumeInventoryItem(db, userId, "bm_laundering", 1); }
      } catch (_) {}
      const discountedFine = Math.floor(rawFine * (1 - launderingDiscount));
      const latest = await getUserRow(db, userId);
      const fine = Math.min(discountedFine, Number(latest?.money || 0));
      await withTransaction(db, async () => {
        if (fine > 0) await adjustMoney(db, userId, -fine);
        await dbRun(db, `UPDATE samp_users SET jail_until = ? WHERE user_id = ?`, [nowMs() + jailMs, String(userId)]);
        await setChallengePairCooldown(db, userId, target.id, "rob", robPairReadyAt);
        const inserted = await addLedgerUnique(db, "rob_pvp_caught", userId, target.id, fine, makeInteractionOpKey(interaction, "rob_pvp_caught"), { jail_ms: jailMs });
        if (!inserted) throw new Error("DUPLICATE_OPERATION");
      });

      const after = await getUserRow(db, userId);
      await interaction.editReply(
        `🚔 Тебя приняли при ограблении <@${target.id}>. Тюрьма: **5 минут**. Штраф: **-${fmtMoney(fine)}**.${launderingDiscount > 0 ? " 🧾 Отмывание: скидка 40%!" : ""}\n` +
          `Баланс: **${fmtMoney(after.money)}**`
      );
      return;
    }

    // Success: steal 5-15% of victim balance (min 500, max 50,000)
    const pct = randInt(5, 15) / 100;
    const rawSteal = Math.floor(Number(victim.money) * pct);
    let loot = Math.min(PVP_AMOUNT_LIMITS.pvpRobberyMaxLoot, Math.max(PVP_AMOUNT_LIMITS.pvpRobberyMinLoot, rawSteal));
    if (bgLootMitigation > 0) loot = Math.max(1, Math.floor(loot * (1 - bgLootMitigation)));
    // Mansion: victim's residence security reduces loot taken.
    const victimBoosts = await getUserBoostEffects(db, target.id).catch(() => null);
    const mansionMitigation = Math.max(0, Math.min(0.5, Number(victimBoosts?.robLossMitigation || 0)));
    if (mansionMitigation > 0) loot = Math.max(1, Math.floor(loot * (1 - mansionMitigation)));
    const actualLoot = Math.min(loot, Number(victim.money));

    if (actualLoot <= 0) { await interaction.editReply("У жертвы нет виртов — обчищать нечего."); return; }

    let stolenAmount = actualLoot;
    await withTransaction(db, async () => {
      const freshVictim = await getUserRow(db, target.id);
      const realLoot = Math.min(actualLoot, Number(freshVictim?.money || 0));
      if (realLoot <= 0) throw new Error("INSUFFICIENT");
      await adjustMoney(db, target.id, -realLoot);
      await adjustMoney(db, userId, realLoot);
      await setChallengePairCooldown(db, userId, target.id, "rob", robPairReadyAt);
      const inserted = await addLedgerUnique(db, "rob_pvp", userId, target.id, realLoot, makeInteractionOpKey(interaction, "rob_pvp"), {});
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      stolenAmount = realLoot;
    });

    const after = await getUserRow(db, userId);
    const psNote = bgLootMitigation > 0 ? ` _(охрана подранила добычу: −${Math.round(bgLootMitigation * 100)}%)_` : "";
    const mansionNote = mansionMitigation > 0 ? ` _(резиденция жертвы охраняется: −${Math.round(mansionMitigation * 100)}%)_` : "";
    await interaction.editReply(`🕶️ Ты обчистил <@${target.id}> на **${fmtMoney(stolenAmount)}**!${psNote}${mansionNote} Баланс: **${fmtMoney(after.money)}**`);
    return;
  }

  // --- Original 24/7 robbery (no target) ---
  // Jail chance: base 35%, adjusted by robJailBonus from boost items.
  const boostsR = await getUserBoostEffects(db, userId).catch(() => null);
  const jailChance247 = Math.max(0.05, Math.min(0.9, 0.35 + (boostsR?.robJailBonus || 0)));
  const caught = Math.random() < jailChance247;
  if (caught) {
    const jailMs = 5 * 60_000;
    const rawFine = randInt(1000, 4000);
    // Laundering: reduce fine by 40%
    let launderingDiscount247 = 0;
    try {
      const { getInventoryQty, consumeInventoryItem } = require("./samp-extended");
      const launderQty = await getInventoryQty(db, userId, "bm_laundering");
      if (launderQty > 0) { launderingDiscount247 = 0.40; await consumeInventoryItem(db, userId, "bm_laundering", 1); }
    } catch (_) {}
    const discountedFine247 = Math.floor(rawFine * (1 - launderingDiscount247) * (1 + (boostsR?.robFinePenalty || 0)));
    const latest = await getUserRow(db, userId);
    const fine = Math.min(discountedFine247, Number(latest?.money || 0));
    await withTransaction(db, async () => {
      if (fine > 0) await adjustMoney(db, userId, -fine);
      await dbRun(db, `UPDATE samp_users SET jail_until = ? WHERE user_id = ?`, [nowMs() + jailMs, String(userId)]);
      const inserted = await addLedgerUnique(db, "rob_caught", userId, null, fine, makeInteractionOpKey(interaction, "rob_caught"), { jail_ms: jailMs });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
    });

    const after = await getUserRow(db, userId);
    await interaction.editReply(
      `🚔 Тебя приняли у 24/7. Тюрьма: **5 минут**. Штраф: **-${fmtMoney(fine)}**.${launderingDiscount247 > 0 ? " 🧾 Отмывание: скидка 40%!" : ""}\n` +
        `Баланс: **${fmtMoney(after.money)}**`
    );
    return;
  }

  const loot = randInt(2000, 10_000);
  await withTransaction(db, async () => {
    await adjustMoney(db, userId, loot);
    const inserted = await addLedgerUnique(db, "rob", null, userId, loot, makeInteractionOpKey(interaction, "rob"), {});
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    if (boostsR && boostsR.cooldownMultiplier < 1) {
      const newReadyAt = nowMs() + Math.floor((COOLDOWNS_MS.rob || 900_000) * boostsR.cooldownMultiplier);
      await setCooldown(db, userId, "rob", newReadyAt);
    }
  });
  const after = await getUserRow(db, userId);
  await interaction.editReply(`🕶️ Ты вынес кассу 24/7: **${fmtMoney(loot)}**. Баланс: **${fmtMoney(after.money)}**`);
}

async function handleDealership(interaction) {
  const entries = Object.entries(CARS);
  const lines = entries.map(([id, car]) => `• **${car.name}** (ID: **${id}**) — ${fmtMoney(car.price)} • скорость **${car.speed}**`);
  const embeds = buildPagedLineEmbeds({
    title: "🚗 Автосалон Otto's Autos",
    description: "Каталог машин с ценой и базовой скоростью.",
    color: 0x2563eb,
    lines,
    linesPerPage: 10,
    footer: "Покупка: /buy type:car id:<carId>",
  });
  await interaction.reply({ embeds: embeds.slice(0, 10) });
}

async function handleWeaponShop(interaction) {
  const entries = Object.entries(ITEMS);
  const lines = entries.map(([id, item]) => `• **${item.name}** (ID: **${id}**) — ${fmtMoney(item.price)} • урон **${item.dmg[0]}–${item.dmg[1]}**`);
  const embeds = buildPagedLineEmbeds({
    title: "🔫 Ammu-Nation",
    description: "Каталог оружия с ценой и диапазоном урона.",
    color: 0xdc2626,
    lines,
    linesPerPage: 10,
    footer: "Покупка: /buy type:weapon id:<weaponId>",
  });
  await interaction.reply({ embeds: embeds.slice(0, 10) });
}

async function handleBuy(interaction, db) {
  const userId = interaction.user.id;
  const type = interaction.options.getString("type", true);
  const idRaw = interaction.options.getString("id", false);
  const id = idRaw ? String(idRaw).toLowerCase() : null;

  if (!id) {
    if (type === "car") {
      await handleDealership(interaction);
      return;
    }

    if (type === "weapon") {
      await handleWeaponShop(interaction);
      return;
    }
  }

  const user = await getOrCreateUser(db, userId);
  if (!(await ensureNotJailed(interaction, user))) return;

  if (type === "car") {
    const car = CARS[id];
    if (!car) {
      await interaction.reply({ content: "Такой тачки нет в салоне. Запусти /buy type:car без id, чтобы увидеть весь список.", ephemeral: true });
      return;
    }

    const opKey = makeInteractionOpKey(interaction, "buy_car");
    await withTransaction(db, async () => {
      const fresh = await getOrCreateUser(db, userId);
      if (Number(fresh.money) < car.price) throw new Error("INSUFFICIENT");

      const alreadyOwned = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", [String(userId), id]);
      if (alreadyOwned) throw new Error("ALREADY_OWNED");

      const inserted = await addLedgerUnique(db, "buy_car", userId, null, car.price, opKey, { car_id: id });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");

      await adjustMoney(db, userId, -car.price);
      await dbRun(db, `INSERT INTO samp_garage(user_id, car_id) VALUES(?, ?)`, [String(userId), id]);
      await dbRun(db, `UPDATE samp_users SET car_id = ?, updated_at = datetime('now') WHERE user_id = ?`, [id, String(userId)]);
    });

    const after = await getUserRow(db, userId);
    const questNoteBuyCar = await maybeCompleteOnboarding(db, userId, "buy_car");
    await interaction.reply(`✅ Ты купил **${car.name}** за **${fmtMoney(car.price)}**. Баланс: **${fmtMoney(after.money)}**${questNoteBuyCar}`);
    return;
  }

  if (type === "weapon") {
    const weapon = ITEMS[id];
    if (!weapon) {
      await interaction.reply({ content: "Такого оружия нет. Запусти /buy type:weapon без id, чтобы увидеть весь список.", ephemeral: true });
      return;
    }

    const opKey = makeInteractionOpKey(interaction, "buy_weapon");
    await withTransaction(db, async () => {
      const fresh = await getOrCreateUser(db, userId);
      if (Number(fresh.money) < weapon.price) throw new Error("INSUFFICIENT");

      const inserted = await addLedgerUnique(db, "buy_weapon", userId, null, weapon.price, opKey, { item_id: id });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");

      await adjustMoney(db, userId, -weapon.price);
      await addInventory(db, userId, id, 1);
      // auto-equip
      await setActiveWeapon(db, userId, id);
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
    await interaction.reply({ content: "Такого оружия нет. Смотри /weaponshop для списка.", ephemeral: true });
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

// ---------- Race v2: interactive tactical race ----------
// Design: challenge (accept button) -> 3 corners (simultaneous secret tactic
// picks via ephemeral buttons) -> settlement. Car stats bias corner outcomes
// via stat-vs-stat deltas; RPS (Inside beats Outside, Outside beats Shortcut,
// Shortcut beats Inside) provides player agency. NOS = peek opponent's pick on
// one corner (strategic info instead of flat +12). Sabotage = one random
// corner auto-picks for the affected player.

const RACE_TACTICS = [
  { id: "inside", emoji: "🏎", label: "Внутренний", stat: "grip", beats: "outside" },
  { id: "outside", emoji: "🛣", label: "Внешний", stat: "topSpeed", beats: "shortcut" },
  { id: "shortcut", emoji: "💥", label: "Срезка", stat: "launch", beats: "inside" },
];
const RACE_CORNER_COUNT = 3;
const RACE_ACCEPT_TIMEOUT_MS = 60_000;
const RACE_PICK_TIMEOUT_MS = 25_000;
const RACE_RPS_POINTS = 12;
const RACE_STAT_DELTA_CAP = 4;
const RACE_JITTER = 3; // per-player per-corner uniform [-RACE_JITTER, +RACE_JITTER]

const activeRaceSessions = new Set(); // pairKey: "userA|userB" sorted

function racePairKey(a, b) {
  return [String(a), String(b)].sort().join("|");
}

function pickRandomTactic() {
  return RACE_TACTICS[Math.floor(Math.random() * RACE_TACTICS.length)];
}

function getTacticById(id) {
  return RACE_TACTICS.find((t) => t.id === id) || null;
}

function resolveCornerScore(myTactic, oppTactic, myCar, oppCar) {
  // Base RPS
  let rps = 0;
  if (myTactic.id !== oppTactic.id) {
    rps = myTactic.beats === oppTactic.id ? RACE_RPS_POINTS : 0;
  }
  // Stat advantage tied to the tactic I chose
  const myStat = Number(myCar?.[myTactic.stat] || 0);
  const oppStat = Number(oppCar?.[myTactic.stat] || 0);
  const raw = Math.round((myStat - oppStat) / 10);
  const statDelta = Math.max(-RACE_STAT_DELTA_CAP, Math.min(RACE_STAT_DELTA_CAP, raw));
  // Small per-corner random jitter so identical inputs don't always tie and
  // so underdogs have a real chance when RPS goes their way.
  const jitter = randInt(-RACE_JITTER, RACE_JITTER);
  return { rps, statDelta, jitter, total: rps + statDelta + jitter };
}

function buildChallengeEmbed({ userId, opponent, bet, p1Car, p2Car }) {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle("🏁 Вызов на гонку «Три поворота»")
    .setDescription(
      `<@${userId}> вызывает <@${opponent.id}> на гонку.\nСтавка: **${fmtMoney(bet)}**\n\n` +
        `**${p1Car.name}** (билд ${p1Car.buildType}) *vs* **${p2Car.name}** (билд ${p2Car.buildType})\n\n` +
        `Формат: **3 поворота**, на каждом оба игрока тайно выбирают тактику — 🏎 Внутренний / 🛣 Внешний / 💥 Срезка. ` +
        `Внутренний бьёт Внешний, Внешний бьёт Срезку, Срезка бьёт Внутренний. Стат машины (зацеп/скорость/старт) добавляет до ±${RACE_STAT_DELTA_CAP}, плюс небольшой случайный фактор ±${RACE_JITTER} на каждый поворот. ` +
        `<@${opponent.id}>, у тебя **60 секунд** чтобы принять.`
    )
    .setFooter({ text: "Отказ не списывает кулдаун. Тайм-аут = отказ." });
}

function buildAcceptRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`race2:${sessionId}:accept`)
      .setLabel("✅ Принять")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`race2:${sessionId}:decline`)
      .setLabel("❌ Отказаться")
      .setStyle(ButtonStyle.Danger)
  );
}

function buildTacticRow(sessionId, cornerIdx, { disabled = false } = {}) {
  const row = new ActionRowBuilder();
  for (const t of RACE_TACTICS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`race2:${sessionId}:pick:${cornerIdx}:${t.id}`)
        .setLabel(`${t.emoji} ${t.label}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled)
    );
  }
  return row;
}

function buildNosRow(sessionId, cornerIdx) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`race2:${sessionId}:nos:${cornerIdx}`)
      .setLabel("🔥 NOS: заглянуть")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildRaceRunningEmbed({ userId, opponent, bet, p1Car, p2Car, corners, scores, cornerIdx }) {
  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle(`🏁 Гонка «Три поворота» — поворот ${cornerIdx + 1}/${RACE_CORNER_COUNT}`)
    .setDescription(
      `<@${userId}> (**${p1Car.name}**) *vs* <@${opponent.id}> (**${p2Car.name}**)\nСтавка: **${fmtMoney(bet)}**`
    );
  if (corners.length > 0) {
    const lines = corners.map((c, i) => {
      const t1 = getTacticById(c.p1Pick);
      const t2 = getTacticById(c.p2Pick);
      const delta1 = c.p1Corner.total >= 0 ? `+${c.p1Corner.total}` : String(c.p1Corner.total);
      const delta2 = c.p2Corner.total >= 0 ? `+${c.p2Corner.total}` : String(c.p2Corner.total);
      return `**${i + 1}.** ${t1?.emoji || "?"} ${delta1} vs ${t2?.emoji || "?"} ${delta2}`;
    });
    embed.addFields({ name: "Пройдено", value: lines.join("\n") });
  }
  embed.addFields({
    name: "Счёт",
    value: `<@${userId}>: **${scores.p1}**\n<@${opponent.id}>: **${scores.p2}**`,
  });
  return embed;
}

async function collectRacePick(message, uid, sessionId, cornerIdx) {
  try {
    const pressed = await message.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) =>
        i.user.id === uid &&
        i.customId.startsWith(`race2:${sessionId}:pick:${cornerIdx}:`),
      time: RACE_PICK_TIMEOUT_MS,
    });
    const tacticId = pressed.customId.split(":")[4];
    const tactic = getTacticById(tacticId) || pickRandomTactic();
    // Acknowledge with disabled buttons so user sees it registered.
    await pressed
      .update({
        content: `✅ Выбор принят: **${tactic.emoji} ${tactic.label}**. Ждём соперника…`,
        components: [buildTacticRow(sessionId, cornerIdx, { disabled: true })],
      })
      .catch(() => {});
    return { tactic, auto: false };
  } catch (_err) {
    const tactic = pickRandomTactic();
    try {
      await message.edit({
        content: `⏱ Тайм-аут. Авто-выбор: **${tactic.emoji} ${tactic.label}**.`,
        components: [buildTacticRow(sessionId, cornerIdx, { disabled: true })],
      });
    } catch (_) {}
    return { tactic, auto: true };
  }
}

async function sendPickPrompt(interaction, uid, sessionId, cornerIdx, extra = "") {
  return interaction.followUp({
    content: `🎯 Поворот **${cornerIdx + 1}/${RACE_CORNER_COUNT}** — выбери тактику (${Math.round(RACE_PICK_TIMEOUT_MS / 1000)} сек). ${extra}`,
    components: [buildTacticRow(sessionId, cornerIdx)],
    ephemeral: true,
  });
}

async function runRaceSession(ctx) {
  const { interaction, db, userId, opponent, bet, p1, p2, p1Car, p2Car, sessionId, raceReadyAt, racePairReadyAt } = ctx;

  const scores = { p1: 0, p2: 0 };
  const corners = [];

  // NOS peek: consume 1 charge each (if owner), grants one peek use per race.
  let p1NosLeft = 0;
  let p2NosLeft = 0;
  const notes = [];
  try {
    const { getInventoryQty, consumeInventoryItem } = require("./samp-extended");
    const [q1, q2] = await Promise.all([
      getInventoryQty(db, userId, "bm_nos_boost"),
      getInventoryQty(db, opponent.id, "bm_nos_boost"),
    ]);
    if (q1 > 0) { p1NosLeft = 1; await consumeInventoryItem(db, userId, "bm_nos_boost", 1); notes.push(`🔥 <@${userId}> активировал NOS (1 использование разведки).`); }
    if (q2 > 0) { p2NosLeft = 1; await consumeInventoryItem(db, opponent.id, "bm_nos_boost", 1); notes.push(`🔥 <@${opponent.id}> активировал NOS (1 использование разведки).`); }
  } catch (_) { /* samp-extended optional */ }

  // Sabotage: pick a forced corner for each affected player.
  let p1SabotageCorner = -1;
  let p2SabotageCorner = -1;
  try {
    const { getUserSetting, setUserSetting: clearSetting } = require("./samp-extended");
    const [p1SabVal, p2SabVal] = await Promise.all([
      getUserSetting(db, userId, "sabotaged_until"),
      getUserSetting(db, opponent.id, "sabotaged_until"),
    ]);
    if (p1SabVal && Number(p1SabVal) > nowMs()) { p1SabotageCorner = randInt(0, RACE_CORNER_COUNT - 1); await clearSetting(db, userId, "sabotaged_until", "0"); notes.push(`🔧 <@${userId}> был саботирован — один поворот пройдёт на автопилоте.`); }
    if (p2SabVal && Number(p2SabVal) > nowMs()) { p2SabotageCorner = randInt(0, RACE_CORNER_COUNT - 1); await clearSetting(db, opponent.id, "sabotaged_until", "0"); notes.push(`🔧 <@${opponent.id}> был саботирован — один поворот пройдёт на автопилоте.`); }
  } catch (_) {}

  if (notes.length) {
    try { await interaction.followUp({ content: notes.join("\n") }); } catch (_) {}
  }

  for (let cornerIdx = 0; cornerIdx < RACE_CORNER_COUNT; cornerIdx++) {
    await interaction
      .editReply({
        embeds: [buildRaceRunningEmbed({ userId, opponent: opponent, bet, p1Car, p2Car, corners, scores, cornerIdx })],
        components: p1NosLeft || p2NosLeft ? [buildNosRow(sessionId, cornerIdx)] : [],
      })
      .catch(() => {});

    // Send pick prompts (respect sabotage auto-picks)
    const p1Sabotaged = cornerIdx === p1SabotageCorner;
    const p2Sabotaged = cornerIdx === p2SabotageCorner;

    const [msg1, msg2] = await Promise.all([
      p1Sabotaged
        ? null
        : sendPickPrompt(interaction, userId, sessionId, cornerIdx),
      p2Sabotaged
        ? null
        : sendPickPrompt(interaction, opponent.id, sessionId, cornerIdx),
    ]);

    // NOS peek: set up a single collector on the public message for either player.
    const publicMsg = await interaction.fetchReply();
    let peekCollector = null;
    if (publicMsg && (p1NosLeft || p2NosLeft)) {
      peekCollector = publicMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: RACE_PICK_TIMEOUT_MS,
        filter: (i) => i.customId === `race2:${sessionId}:nos:${cornerIdx}`,
      });
    }

    // Start both pick collectors in parallel.
    const p1PickPromise = p1Sabotaged
      ? Promise.resolve({ tactic: pickRandomTactic(), auto: true })
      : collectRacePick(msg1, userId, sessionId, cornerIdx);
    const p2PickPromise = p2Sabotaged
      ? Promise.resolve({ tactic: pickRandomTactic(), auto: true })
      : collectRacePick(msg2, opponent.id, sessionId, cornerIdx);

    // Peek handler: on first click from a NOS-owner, reveal opponent's CURRENT
    // pick (if resolved) or resolve ASAP. To keep it simple, we poll: if not
    // yet picked, we reveal whatever becomes picked.
    if (peekCollector) {
      peekCollector.on("collect", async (btn) => {
        try {
          if (btn.user.id === userId && p1NosLeft > 0) {
            p1NosLeft = 0;
            const p2Pick = await p2PickPromise;
            await btn.reply({
              content: `🔍 Разведка: соперник выбрал **${p2Pick.tactic.emoji} ${p2Pick.tactic.label}**.`,
              ephemeral: true,
            });
          } else if (btn.user.id === opponent.id && p2NosLeft > 0) {
            p2NosLeft = 0;
            const p1Pick = await p1PickPromise;
            await btn.reply({
              content: `🔍 Разведка: соперник выбрал **${p1Pick.tactic.emoji} ${p1Pick.tactic.label}**.`,
              ephemeral: true,
            });
          } else {
            await btn.reply({ content: "У тебя нет заряда NOS на эту гонку.", ephemeral: true });
          }
        } catch (_) {}
      });
    }

    const [p1Pick, p2Pick] = await Promise.all([p1PickPromise, p2PickPromise]);
    if (peekCollector) peekCollector.stop();

    const p1Corner = resolveCornerScore(p1Pick.tactic, p2Pick.tactic, p1Car, p2Car);
    const p2Corner = resolveCornerScore(p2Pick.tactic, p1Pick.tactic, p2Car, p1Car);
    scores.p1 += p1Corner.total;
    scores.p2 += p2Corner.total;
    corners.push({
      p1Pick: p1Pick.tactic.id,
      p2Pick: p2Pick.tactic.id,
      p1Corner,
      p2Corner,
    });
  }

  // Apply wear-based final adjustment (single time) — half of the wear penalty
  // from car-tuning contributes to the final score, so well-maintained cars
  // keep their edge without dominating.
  const p1WearPenalty = Math.max(0, Math.round((55 - Number(p1Car.averageDurability || 100)) / 12));
  const p2WearPenalty = Math.max(0, Math.round((55 - Number(p2Car.averageDurability || 100)) / 12));
  scores.p1 -= p1WearPenalty;
  scores.p2 -= p2WearPenalty;

  // Determine winner; tiebreak = raceScore, then true draw.
  let winner = null;
  if (scores.p1 > scores.p2) winner = userId;
  else if (scores.p2 > scores.p1) winner = opponent.id;
  else {
    const r1 = Number(p1Car.raceScore || 0);
    const r2 = Number(p2Car.raceScore || 0);
    if (r1 > r2) winner = userId;
    else if (r2 > r1) winner = opponent.id;
  }

  // Build final embed summary.
  const finalEmbed = new EmbedBuilder()
    .setColor(winner ? 0x22c55e : 0x6b7280)
    .setTitle("🏁 Финиш!")
    .setDescription(
      `<@${userId}> (**${p1Car.name}**) *vs* <@${opponent.id}> (**${p2Car.name}**)\nСтавка: **${fmtMoney(bet)}**`
    );
  const recap = corners
    .map((c, i) => {
      const t1 = getTacticById(c.p1Pick);
      const t2 = getTacticById(c.p2Pick);
      return `**${i + 1}.** ${t1.emoji} ${t1.label} (**${c.p1Corner.total >= 0 ? "+" : ""}${c.p1Corner.total}**) vs ${t2.emoji} ${t2.label} (**${c.p2Corner.total >= 0 ? "+" : ""}${c.p2Corner.total}**)`;
    })
    .join("\n");
  finalEmbed.addFields(
    { name: "Повороты", value: recap },
    {
      name: "Итог",
      value: `<@${userId}>: **${scores.p1}**${p1WearPenalty ? ` (износ −${p1WearPenalty})` : ""}\n<@${opponent.id}>: **${scores.p2}**${p2WearPenalty ? ` (износ −${p2WearPenalty})` : ""}`,
    }
  );

  // Settlement (reuses existing plumbing)
  if (winner === userId) {
    const settlement = await settleWagerWithParticipants(
      db,
      opponent.id,
      userId,
      bet,
      "race",
      [
        { userId, action: "race", readyAt: raceReadyAt },
        { userId: opponent.id, action: "race", readyAt: raceReadyAt },
      ],
      {
        challengerUserId: userId,
        targetUserId: opponent.id,
        action: "race",
        readyAt: racePairReadyAt,
      },
      { loser: opponent.id },
      makeInteractionOpKey(interaction, "race")
    );
    await Promise.all([
      finalizeRaceVehicleProgress(db, userId, p1.car_id, p1Car, { result: "win", winnings: settlement.settledAmount }),
      finalizeRaceVehicleProgress(db, opponent.id, p2.car_id, p2Car, { result: "loss", winnings: 0 }),
    ]);
    finalEmbed.addFields({
      name: "💰 Выплата",
      value: `<@${userId}> забирает **${fmtMoney(settlement.settledAmount)}**.${buildReducedSettlementNote(bet, settlement.settledAmount, opponent.id)}`,
    });
  } else if (winner === opponent.id) {
    const settlement = await settleWagerWithParticipants(
      db,
      userId,
      opponent.id,
      bet,
      "race",
      [
        { userId, action: "race", readyAt: raceReadyAt },
        { userId: opponent.id, action: "race", readyAt: raceReadyAt },
      ],
      {
        challengerUserId: userId,
        targetUserId: opponent.id,
        action: "race",
        readyAt: racePairReadyAt,
      },
      { loser: userId },
      makeInteractionOpKey(interaction, "race")
    );
    await Promise.all([
      finalizeRaceVehicleProgress(db, userId, p1.car_id, p1Car, { result: "loss", winnings: 0 }),
      finalizeRaceVehicleProgress(db, opponent.id, p2.car_id, p2Car, { result: "win", winnings: settlement.settledAmount }),
    ]);
    finalEmbed.addFields({
      name: "💸 Выплата",
      value: `<@${opponent.id}> забирает **${fmtMoney(settlement.settledAmount)}**.${buildReducedSettlementNote(bet, settlement.settledAmount, userId)}`,
    });
  } else {
    await withTransaction(db, async () => {
      await setCooldown(db, userId, "race", raceReadyAt);
      await setCooldown(db, opponent.id, "race", raceReadyAt);
      await setChallengePairCooldown(db, userId, opponent.id, "race", racePairReadyAt);
      const inserted = await addLedgerUnique(
        db,
        "race_draw",
        userId,
        opponent.id,
        0,
        makeInteractionOpKey(interaction, "race_draw"),
        { bet }
      );
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
    });
    await Promise.all([
      finalizeRaceVehicleProgress(db, userId, p1.car_id, p1Car, { result: "draw", winnings: 0 }),
      finalizeRaceVehicleProgress(db, opponent.id, p2.car_id, p2Car, { result: "draw", winnings: 0 }),
    ]);
    finalEmbed.addFields({ name: "🤝 Ничья", value: "Разъехались без потерь." });
  }

  await interaction.editReply({ embeds: [finalEmbed], components: [] });
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

  const betCheck = normalizeWagerAmount(betRaw, PVP_AMOUNT_LIMITS.raceBetMax);
  if (!betCheck.ok) {
    await interaction.reply({ content: betCheck.message, ephemeral: true });
    return;
  }
  const bet = betCheck.amount;

  const pairKey = racePairKey(userId, opponent.id);
  if (activeRaceSessions.has(pairKey)) {
    await interaction.reply({
      content: "⚠️ У тебя уже идёт гонка с этим соперником. Дождись её завершения.",
      ephemeral: true,
    });
    return;
  }

  const p1 = await getOrCreateUser(db, userId);
  const p2 = await getOrCreateUser(db, opponent.id);
  if (!(await ensureNotJailed(interaction, p1))) return;

  const userRaceCd = await getCooldown(db, userId, "race");
  if (userRaceCd > nowMs()) {
    await interaction.reply({ content: `⏳ Рано. Подожди **${msToHuman(userRaceCd - nowMs())}**.`, ephemeral: true });
    return;
  }

  const opponentRaceCd = await getCooldown(db, opponent.id, "race");
  if (opponentRaceCd > nowMs()) {
    await interaction.reply({
      content: `⏳ Игрок <@${opponent.id}> недавно участвовал в гонке. Попробуй через **${msToHuman(opponentRaceCd - nowMs())}**.`,
      ephemeral: true,
    });
    return;
  }

  const pairRaceCd = await getChallengePairCooldown(db, userId, opponent.id, "race");
  if (pairRaceCd > nowMs()) {
    await interaction.reply({
      content: formatChallengePairCooldownMessage("race", opponent.id, pairRaceCd - nowMs()),
      ephemeral: true,
    });
    return;
  }

  if (Number(p1.money) < bet || Number(p2.money) < bet) {
    await interaction.reply({ content: "У кого-то нет денег на ставку.", ephemeral: true });
    return;
  }

  const [p1Car, p2Car] = await Promise.all([
    getRaceCarProfile(db, userId, p1.car_id),
    getRaceCarProfile(db, opponent.id, p2.car_id),
  ]);

  const sessionId = Math.random().toString(36).slice(2, 10);
  activeRaceSessions.add(pairKey);

  try {
    await interaction.reply({
      embeds: [buildChallengeEmbed({ userId, opponent, bet, p1Car, p2Car })],
      components: [buildAcceptRow(sessionId)],
      content: `<@${opponent.id}>, принимаешь вызов?`,
    });
    const challengeMsg = await interaction.fetchReply();

    let pressed;
    try {
      pressed = await challengeMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) =>
          i.user.id === opponent.id &&
          i.customId.startsWith(`race2:${sessionId}:`) &&
          (i.customId.endsWith(":accept") || i.customId.endsWith(":decline")),
        time: RACE_ACCEPT_TIMEOUT_MS,
      });
    } catch (_timeout) {
      await interaction
        .editReply({
          content: `⏱ <@${opponent.id}> не ответил. Гонка не состоялась (кулдаун не списан).`,
          embeds: [],
          components: [],
        })
        .catch(() => {});
      return;
    }

    if (pressed.customId.endsWith(":decline")) {
      await pressed
        .update({
          content: `❌ <@${opponent.id}> отказался от гонки. Никто ничего не теряет.`,
          embeds: [],
          components: [],
        })
        .catch(() => {});
      return;
    }

    // Accepted — re-check state (money/jail/cooldown could have changed).
    const p1Now = await getOrCreateUser(db, userId);
    const p2Now = await getOrCreateUser(db, opponent.id);
    if ((p1Now.jail_until || 0) > nowMs() || (p2Now.jail_until || 0) > nowMs()) {
      await pressed
        .update({ content: "🚔 Один из гонщиков в тюрьме — гонка отменена.", embeds: [], components: [] })
        .catch(() => {});
      return;
    }
    if (Number(p1Now.money) < bet || Number(p2Now.money) < bet) {
      await pressed
        .update({ content: "💸 У кого-то уже нет денег на ставку — гонка отменена.", embeds: [], components: [] })
        .catch(() => {});
      return;
    }

    await pressed.update({ content: "✅ Вызов принят. Поехали!", embeds: [], components: [] });
    await maybeCompleteOnboarding(db, userId, "pvp").catch(() => "");

    const raceReadyAt = nowMs() + COOLDOWNS_MS.race;
    const racePairReadyAt = nowMs() + CHALLENGE_PAIR_COOLDOWNS_MS.race;

    await runRaceSession({
      interaction,
      db,
      userId,
      opponent,
      bet,
      p1,
      p2,
      p1Car,
      p2Car,
      sessionId,
      raceReadyAt,
      racePairReadyAt,
    });
  } catch (err) {
    console.error("[race] session error", err);
    try {
      await interaction.editReply({
        content: "⚠️ Во время гонки произошла ошибка. Ставка не списана.",
        embeds: [],
        components: [],
      });
    } catch (_) {}
  } finally {
    activeRaceSessions.delete(pairKey);
  }
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

  const betCheck = normalizeWagerAmount(betRaw, PVP_AMOUNT_LIMITS.duelBetMax);
  if (!betCheck.ok) {
    await interaction.reply({ content: betCheck.message, ephemeral: true });
    return;
  }
  const bet = betCheck.amount;

  const p1 = await getOrCreateUser(db, userId);
  const p2 = await getOrCreateUser(db, opponent.id);
  if (!(await ensureNotJailed(interaction, p1))) return;

  const userDuelCd = await getCooldown(db, userId, "duel");
  if (userDuelCd > nowMs()) {
    await interaction.reply({ content: `⏳ Рано. Подожди **${msToHuman(userDuelCd - nowMs())}**.`, ephemeral: true });
    return;
  }

  const opponentDuelCd = await getCooldown(db, opponent.id, "duel");
  if (opponentDuelCd > nowMs()) {
    await interaction.reply({
      content: `⏳ Игрок <@${opponent.id}> недавно участвовал в дуэли. Попробуй через **${msToHuman(opponentDuelCd - nowMs())}**.`,
      ephemeral: true,
    });
    return;
  }

  const pairDuelCd = await getChallengePairCooldown(db, userId, opponent.id, "duel");
  if (pairDuelCd > nowMs()) {
    await interaction.reply({
      content: formatChallengePairCooldownMessage("duel", opponent.id, pairDuelCd - nowMs()),
      ephemeral: true,
    });
    return;
  }

  if (Number(p1.money) < bet || Number(p2.money) < bet) {
    await interaction.reply({ content: "У кого-то нет денег на ставку.", ephemeral: true });
    return;
  }

  const duelReadyAt = nowMs() + COOLDOWNS_MS.duel;
  const duelPairReadyAt = nowMs() + CHALLENGE_PAIR_COOLDOWNS_MS.duel;

  await interaction.deferReply();
  await maybeCompleteOnboarding(db, userId, "pvp").catch(() => "");

  const p1WeaponId = await getActiveWeapon(db, userId);
  const p2WeaponId = await getActiveWeapon(db, opponent.id);

  const p1Weapon = p1WeaponId ? itemInfo(p1WeaponId) : null;
  const p2Weapon = p2WeaponId ? itemInfo(p2WeaponId) : null;
  const [p1Cosmetics, p2Cosmetics] = await Promise.all([
    p1WeaponId === "deagle" ? getUserCosmetics(db, userId) : Promise.resolve(null),
    p2WeaponId === "deagle" ? getUserCosmetics(db, opponent.id) : Promise.resolve(null),
  ]);
  const p1GoldenDeagle = p1WeaponId === "deagle" && p1Cosmetics?.raw?.weapon_skin_deagle === "gold";
  const p2GoldenDeagle = p2WeaponId === "deagle" && p2Cosmetics?.raw?.weapon_skin_deagle === "gold";
  const p1WeaponLabel = p1Weapon ? (p1GoldenDeagle ? "Золотой Desert Eagle" : p1Weapon.name) : "кулаки";
  const p2WeaponLabel = p2Weapon ? (p2GoldenDeagle ? "Золотой Desert Eagle" : p2Weapon.name) : "кулаки";

  let p1Hp = 100;
  let p2Hp = 100;

  // --- Black market items (armor & medkit) ---
  let p1ArmorLeft = 0;
  let p2ArmorLeft = 0;
  let p1MedkitUsed = false;
  let p2MedkitUsed = false;
  let p1HasArmor = false;
  let p2HasArmor = false;
  let p1HasMedkit = false;
  let p2HasMedkit = false;
  try {
    const { getInventoryQty, consumeInventoryItem } = require("./samp-extended");
    const [p1a, p2a, p1m, p2m] = await Promise.all([
      getInventoryQty(db, userId, "bm_armor"),
      getInventoryQty(db, opponent.id, "bm_armor"),
      getInventoryQty(db, userId, "bm_medkit"),
      getInventoryQty(db, opponent.id, "bm_medkit"),
    ]);
    if (p1a > 0) { p1ArmorLeft = 25; p1HasArmor = true; await consumeInventoryItem(db, userId, "bm_armor", 1); }
    if (p2a > 0) { p2ArmorLeft = 25; p2HasArmor = true; await consumeInventoryItem(db, opponent.id, "bm_armor", 1); }
    p1HasMedkit = p1m > 0;
    p2HasMedkit = p2m > 0;
  } catch (_) { /* samp-extended not available */ }

  const rounds = [];
  if (p1HasArmor) rounds.push(`🛡️ <@${userId}> надел бронежилет (+25 поглощения)`);
  if (p2HasArmor) rounds.push(`🛡️ <@${opponent.id}> надел бронежилет (+25 поглощения)`);
  if (p1GoldenDeagle) rounds.push(`🏆 <@${userId}> вышел с Золотым Desert Eagle (+3 урон, +25% к баунти)`);
  if (p2GoldenDeagle) rounds.push(`🏆 <@${opponent.id}> вышел с Золотым Desert Eagle (+3 урон, +25% к баунти)`);

  for (let i = 1; i <= 6; i++) {
    const p1Dmg = p1Weapon ? randInt(p1Weapon.dmg[0], p1Weapon.dmg[1]) + (p1GoldenDeagle ? 3 : 0) : randInt(6, 12);
    const p2Dmg = p2Weapon ? randInt(p2Weapon.dmg[0], p2Weapon.dmg[1]) + (p2GoldenDeagle ? 3 : 0) : randInt(6, 12);

    // Armor absorbs damage
    let p1Absorbed = 0;
    let p2Absorbed = 0;
    let effectiveP2Dmg = p2Dmg;
    let effectiveP1Dmg = p1Dmg;
    if (p1ArmorLeft > 0) {
      p1Absorbed = Math.min(p1ArmorLeft, p2Dmg);
      effectiveP2Dmg = p2Dmg - p1Absorbed;
      p1ArmorLeft -= p1Absorbed;
    }
    if (p2ArmorLeft > 0) {
      p2Absorbed = Math.min(p2ArmorLeft, p1Dmg);
      effectiveP1Dmg = p1Dmg - p2Absorbed;
      p2ArmorLeft -= p2Absorbed;
    }

    // Simultaneous exchange
    p2Hp -= effectiveP1Dmg;
    p1Hp -= effectiveP2Dmg;
    let roundLine = `Раунд ${i}: <@${userId}> -${effectiveP2Dmg}HP${p1Absorbed > 0 ? ` (🛡️-${p1Absorbed})` : ""}, <@${opponent.id}> -${effectiveP1Dmg}HP${p2Absorbed > 0 ? ` (🛡️-${p2Absorbed})` : ""}`;

    // Medkit auto-trigger
    if (!p1MedkitUsed && p1HasMedkit && p1Hp > 0 && p1Hp < 20) {
      p1Hp = Math.min(100, p1Hp + 30);
      p1MedkitUsed = true;
      roundLine += `\n  💊 <@${userId}> использовал аптечку (+30HP → ${p1Hp}HP)`;
      try { const { consumeInventoryItem } = require("./samp-extended"); await consumeInventoryItem(db, userId, "bm_medkit", 1); } catch (_) {}
    }
    if (!p2MedkitUsed && p2HasMedkit && p2Hp > 0 && p2Hp < 20) {
      p2Hp = Math.min(100, p2Hp + 30);
      p2MedkitUsed = true;
      roundLine += `\n  💊 <@${opponent.id}> использовал аптечку (+30HP → ${p2Hp}HP)`;
      try { const { consumeInventoryItem } = require("./samp-extended"); await consumeInventoryItem(db, opponent.id, "bm_medkit", 1); } catch (_) {}
    }

    rounds.push(roundLine);
    if (p1Hp <= 0 || p2Hp <= 0) break;
  }

  let winner = null;
  if (p1Hp > p2Hp) winner = userId;
  else if (p2Hp > p1Hp) winner = opponent.id;

  let text = `🔫 **Дуэль!**\n<@${userId}> (${p1WeaponLabel}) VS <@${opponent.id}> (${p2WeaponLabel})\nСтавка: **${fmtMoney(bet)}**\n\n`;
  text += rounds.slice(0, 6).join("\n");
  text += `\n\nФинал: <@${userId}> HP=${Math.max(0, p1Hp)} | <@${opponent.id}> HP=${Math.max(0, p2Hp)}`;

  if (!winner) {
    await withTransaction(db, async () => {
      await setCooldown(db, userId, "duel", duelReadyAt);
      await setCooldown(db, opponent.id, "duel", duelReadyAt);
      await setChallengePairCooldown(db, userId, opponent.id, "duel", duelPairReadyAt);
      const inserted = await addLedgerUnique(db, "duel_draw", userId, opponent.id, 0, makeInteractionOpKey(interaction, "duel_draw"), { bet, p1Hp, p2Hp });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
    });
    await interaction.editReply(text + "\n\n🤝 Ничья. Разошлись живыми.");
    return;
  }

  if (winner === userId) {
    const settlement = await settleWagerWithParticipants(db, opponent.id, userId, bet, "duel", [
      { userId, action: "duel", readyAt: duelReadyAt },
      { userId: opponent.id, action: "duel", readyAt: duelReadyAt },
    ], {
      challengerUserId: userId,
      targetUserId: opponent.id,
      action: "duel",
      readyAt: duelPairReadyAt,
    }, { p1Hp, p2Hp }, makeInteractionOpKey(interaction, "duel"));
    // Bounty collection and weapon degradation (lazy require to avoid circular dep)
    try {
      const { checkAndCollectBounty, degradeWeapon } = require("./samp-extended");
      const bountyResult = await checkAndCollectBounty(db, userId, opponent.id);
      if (p1WeaponId) await degradeWeapon(db, userId, p1WeaponId);
      if (p2WeaponId) await degradeWeapon(db, opponent.id, p2WeaponId);
      const bountyText = bountyResult?.collected
        ? `\n💀 Награда за голову: **${fmtMoney(bountyResult.amount)}**${bountyResult.bonusAmount > 0 ? ` (включая **+${fmtMoney(bountyResult.bonusAmount)}** бонус Золотого Desert Eagle)` : ""}`
        : "";
      await interaction.editReply(text + `\n\n🏆 Победил <@${userId}> и поднял **${fmtMoney(settlement.settledAmount)}**.${buildReducedSettlementNote(bet, settlement.settledAmount, opponent.id)}${bountyText}`);
    } catch (_) {
      await interaction.editReply(text + `\n\n🏆 Победил <@${userId}> и поднял **${fmtMoney(settlement.settledAmount)}**.${buildReducedSettlementNote(bet, settlement.settledAmount, opponent.id)}`);
    }
    return;
  }

  const settlement = await settleWagerWithParticipants(db, userId, opponent.id, bet, "duel", [
    { userId, action: "duel", readyAt: duelReadyAt },
    { userId: opponent.id, action: "duel", readyAt: duelReadyAt },
  ], {
    challengerUserId: userId,
    targetUserId: opponent.id,
    action: "duel",
    readyAt: duelPairReadyAt,
  }, { p1Hp, p2Hp }, makeInteractionOpKey(interaction, "duel"));
  try {
    const { checkAndCollectBounty, degradeWeapon } = require("./samp-extended");
    const bountyResult = await checkAndCollectBounty(db, opponent.id, userId);
    if (p1WeaponId) await degradeWeapon(db, userId, p1WeaponId);
    if (p2WeaponId) await degradeWeapon(db, opponent.id, p2WeaponId);
    const bountyText = bountyResult?.collected
      ? `\n💀 Награда за голову: **${fmtMoney(bountyResult.amount)}**${bountyResult.bonusAmount > 0 ? ` (включая **+${fmtMoney(bountyResult.bonusAmount)}** бонус Золотого Desert Eagle)` : ""}`
      : "";
    await interaction.editReply(text + `\n\n💀 Победил <@${opponent.id}>. Ты потерял **${fmtMoney(settlement.settledAmount)}**.${buildReducedSettlementNote(bet, settlement.settledAmount, userId)}${bountyText}`);
  } catch (_) {
    await interaction.editReply(text + `\n\n💀 Победил <@${opponent.id}>. Ты потерял **${fmtMoney(settlement.settledAmount)}**.${buildReducedSettlementNote(bet, settlement.settledAmount, userId)}`);
  }
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

  await interaction.deferReply();

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

  await interaction.editReply(
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

  await interaction.deferReply();

  const opKey = makeInteractionOpKey(interaction, "sellcar_accept");

  try {
    await withTransaction(db, async () => {
      const freshOffer = await dbGet(db, "SELECT status FROM samp_car_offers WHERE id = ?", [Number(offerId)]);
      if (!freshOffer || freshOffer.status !== "open") throw new Error("CLOSED");

      const sellerOwned = await dbGet(db, "SELECT 1 FROM samp_garage WHERE user_id = ? AND car_id = ?", [String(offer.seller_user_id), String(offer.car_id)]);
      if (!sellerOwned) throw new Error("SELLER_NO_CAR");

      const freshBuyer = await getOrCreateUser(db, buyerId);
      if (Number(freshBuyer.money) < Number(offer.price)) throw new Error("INSUFFICIENT");

      const inserted = await addLedgerUnique(db, "sellcar_accept", offer.seller_user_id, buyerId, Number(offer.price), opKey, { car_id: offer.car_id, offer_id: offerId });
      if (!inserted) throw new Error("DUPLICATE_OPERATION");

      // money transfer
      await adjustMoney(db, buyerId, -Number(offer.price));
      await adjustMoney(db, offer.seller_user_id, Number(offer.price));

      // transfer car
      await dbRun(db, "DELETE FROM samp_garage WHERE user_id = ? AND car_id = ?", [String(offer.seller_user_id), String(offer.car_id)]);
      await dbRun(db, "INSERT OR IGNORE INTO samp_garage(user_id, car_id) VALUES(?, ?)", [String(buyerId), String(offer.car_id)]);

      const seller = await getUserRow(db, offer.seller_user_id);
      if (String(seller?.car_id || "") === String(offer.car_id)) {
        await ensureFallbackActiveCar(db, offer.seller_user_id);
      }

      // set buyer active car
      await dbRun(db, "UPDATE samp_users SET car_id = ?, updated_at = datetime('now') WHERE user_id = ?", [String(offer.car_id), String(buyerId)]);

      // close offer
      await dbRun(db, "UPDATE samp_car_offers SET status = 'accepted' WHERE id = ?", [Number(offerId)]);
    });
  } catch (e) {
    if (String(e.message) === "INSUFFICIENT") {
      await interaction.editReply({ content: "Не хватает виртов." });
      return;
    }
    if (String(e.message) === "SELLER_NO_CAR") {
      await interaction.editReply({ content: "Продавец уже не владеет этой тачкой." });
      return;
    }
    await interaction.editReply({ content: "Не удалось купить тачку (оффер мог закрыться)." });
    return;
  }

  await interaction.editReply(`✅ Покупка успешна. Ты получил **${car.name}** за **${fmtMoney(offer.price)}**.`);
}

async function handleBail(interaction, db) {
  const userId = interaction.user.id;
  const user = await getOrCreateUser(db, userId);

  const until = Number(user.jail_until || 0);
  if (until <= nowMs()) {
    await interaction.reply({ content: "✅ Ты и так на свободе, братан.", ephemeral: true });
    return;
  }

  const remainingMs = until - nowMs();
  // Bail cost: $1,000 per minute remaining (min $500, max $10,000)
  const bailCost = Math.min(10_000, Math.max(500, Math.ceil(remainingMs / 60_000) * 1000));

  if (user.money < bailCost) {
    await interaction.reply({
      content: `💸 Залог стоит **${fmtMoney(bailCost)}**, а у тебя **${fmtMoney(user.money)}**. Сиди.`,
      ephemeral: true,
    });
    return;
  }

  const opKey = makeInteractionOpKey(interaction, "bail");
  await withTransaction(db, async () => {
    const fresh = await getUserRow(db, userId);
    if (Number(fresh?.money || 0) < bailCost) throw new Error("INSUFFICIENT");
    const inserted = await addLedgerUnique(db, "bail", userId, null, bailCost, opKey, { remaining_ms: remainingMs });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, -bailCost);
    await dbRun(db, `UPDATE samp_users SET jail_until = 0 WHERE user_id = ?`, [String(userId)]);
  });

  const after = await getUserRow(db, userId);
  await interaction.reply(
    `🔓 Ты откупился от тюрьмы за **${fmtMoney(bailCost)}**! Добро пожаловать на волю.\n` +
      `Баланс: **${fmtMoney(after.money)}**`
  );
}

async function handleRichest(interaction, db) {
  const rows = await dbAll(
    db,
    `SELECT user_id, money FROM samp_users WHERE money > 0 ORDER BY money DESC LIMIT 10`,
    []
  );

  if (!rows || rows.length === 0) {
    await interaction.reply({ content: "Пока никто не зарегистрировался в SAMP Life.", ephemeral: true });
    return;
  }

  const lines = [];
  const medals = ["🥇", "🥈", "🥉"];
  for (let i = 0; i < rows.length; i++) {
    const prefix = medals[i] || `\`${i + 1}.\``;
    lines.push(`${prefix} <@${rows[i].user_id}> — **${fmtMoney(rows[i].money)}**`);
  }

  const embed = new EmbedBuilder()
    .setTitle("💰 Самые богатые игроки San Andreas")
    .setDescription(lines.join("\n"))
    .setColor(0xf1c40f)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// Daily bonus amounts by streak tier
const DAILY_BONUS_TIERS = [
  { minStreak: 30, bonus: 50_000, label: "30+ дней" },
  { minStreak: 14, bonus: 15_000, label: "14+ дней" },
  { minStreak: 7, bonus: 5_000, label: "7+ дней" },
  { minStreak: 3, bonus: 2_000, label: "3+ дня" },
  { minStreak: 1, bonus: 1_000, label: "1+ день" },
];

async function handleDaily(interaction, db) {
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id;

  const user = await getOrCreateUser(db, userId);
  if (!(await ensureNotJailed(interaction, user))) return;

  // Check daily cooldown (24h)
  const cd = await getCooldown(db, userId, "daily");
  if (cd > nowMs()) {
    await interaction.reply({ content: `⏳ Ежедневный бонус уже получен. Следующий через **${msToHuman(cd - nowMs())}**.`, ephemeral: true });
    return;
  }

  // Defer reply early to avoid interaction token expiry during DB work
  await interaction.deferReply();

  // Get streak from user_streaks table (if guild context available)
  let currentStreak = 0;
  if (guildId) {
    const streakRow = await dbGet(
      db,
      `SELECT current_streak FROM user_streaks WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    if (streakRow) currentStreak = streakRow.current_streak || 0;
  }

  // Find bonus tier
  const tier = DAILY_BONUS_TIERS.find((t) => currentStreak >= t.minStreak) || { bonus: 500, label: "новичок" };
  const boostsD = await getUserBoostEffects(db, userId).catch(() => null);
  const boostBonus = Math.max(0, Number(boostsD?.dailyBonus || 0));
  const totalBonus = tier.bonus + boostBonus;

  await withTransaction(db, async () => {
    const existingDaily = await getCooldown(db, userId, "daily");
    if (existingDaily > nowMs()) throw new Error("COOLDOWN_ACTIVE");
    await adjustMoney(db, userId, totalBonus);
    await setCooldown(db, userId, "daily", nowMs() + 24 * 60 * 60_000);
    const inserted = await addLedgerUnique(db, "daily_bonus", null, userId, totalBonus, makeInteractionOpKey(interaction, "daily_bonus"), { streak: currentStreak, tier: tier.label, boost: boostBonus });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
  });

  const after = await getUserRow(db, userId);
  const streakInfo = currentStreak > 0 ? `\n🔥 Стрик: **${currentStreak}** дней (бонус: ${tier.label})` : "";
  const boostNote = boostBonus > 0 ? `\n🏦 Сейф в особняке: +${fmtMoney(boostBonus)}` : "";
  const questNoteDaily = await maybeCompleteOnboarding(db, userId, "daily", { increment: 1 });

  await interaction.editReply(
    `🎁 Ежедневный бонус: **+${fmtMoney(totalBonus)}**!${streakInfo}${boostNote}\n` +
      `Баланс: **${fmtMoney(after.money)}**\n` +
      `_Чем дольше стрик — тем больше бонус!_${questNoteDaily}`
  );
}

async function handlePay(interaction, db) {
  const userId = interaction.user.id;
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  if (target.bot) { await interaction.reply({ content: "Ботам деньги не шлём.", ephemeral: true }); return; }
  if (target.id === userId) { await interaction.reply({ content: "Самому себе? Серьёзно?", ephemeral: true }); return; }

  const user = await getOrCreateUser(db, userId);
  if (!(await ensureNotJailed(interaction, user))) return;

  const amt = clampInt(amount, 1, 10_000_000);
  if (!amt) { await interaction.reply({ content: "Некорректная сумма.", ephemeral: true }); return; }

  await getOrCreateUser(db, target.id);

  try {
    await transferMoney(db, userId, target.id, amt, "transfer", { from: userId, to: target.id }, makeInteractionOpKey(interaction, "transfer"));
  } catch (e) {
    if (String(e.message) === "INSUFFICIENT") {
      await interaction.reply({ content: "Не хватает виртов для перевода.", ephemeral: true }); return;
    }
    throw e;
  }

  const after = await getUserRow(db, userId);
  await interaction.reply(`💸 Ты перевёл **${fmtMoney(amt)}** игроку <@${target.id}>.\nБаланс: **${fmtMoney(after.money)}**`);
}

async function handleSlots(interaction, db) {
  const userId = interaction.user.id;
  const betRaw = interaction.options.getInteger("bet", true);
  const user = await getOrCreateUser(db, userId);
  if (!(await ensureNotJailed(interaction, user))) return;

  const bet = clampInt(betRaw, 100, 100000);
  if (!bet || Number(user.money) < bet) {
    await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return;
  }

  await interaction.deferReply();

  const symbols = ["🍒", "🍋", "🔔", "💎", "7️⃣", "🍀"];
  const r1 = pick(symbols), r2 = pick(symbols), r3 = pick(symbols);

  let multiplier = 0;
  if (r1 === r2 && r2 === r3) {
    if (r1 === "7️⃣") multiplier = 10;
    else if (r1 === "💎") multiplier = 7;
    else multiplier = 5;
  } else if (r1 === r2 || r2 === r3 || r1 === r3) {
    multiplier = 2;
  }

  const winnings = bet * multiplier;
  const net = winnings - bet;
  const opKey = makeInteractionOpKey(interaction, "slots");

  await withTransaction(db, async () => {
    const fresh = await getUserRow(db, userId);
    if (Number(fresh?.money || 0) < bet) throw new Error("INSUFFICIENT");
    const inserted = await addLedgerUnique(db, "slots", userId, null, Math.abs(net), opKey, { r1, r2, r3, bet, multiplier });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, net);
  });

  const after = await getUserRow(db, userId);
  const result = multiplier > 0
    ? `🎰 [ ${r1} | ${r2} | ${r3} ]\n\n🎉 Выигрыш: **${fmtMoney(winnings)}** (x${multiplier})!`
    : `🎰 [ ${r1} | ${r2} | ${r3} ]\n\n💨 Мимо. Потерял **${fmtMoney(bet)}**.`;

  await interaction.editReply(`${result}\nБаланс: **${fmtMoney(after.money)}**`);
}

async function handleBlackjack(interaction, db) {
  const userId = interaction.user.id;
  const betRaw = interaction.options.getInteger("bet", true);
  const user = await getOrCreateUser(db, userId);
  if (!(await ensureNotJailed(interaction, user))) return;

  const bet = clampInt(betRaw, 500, 500000);
  if (!bet || Number(user.money) < bet) {
    await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return;
  }

  await interaction.deferReply();

  const cards = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
  const cardVal = (c) => c === "A" ? 11 : ["J","Q","K"].includes(c) ? 10 : parseInt(c);
  const drawCard = () => pick(cards);
  const handVal = (hand) => {
    let total = hand.reduce((s, c) => s + cardVal(c), 0);
    let aces = hand.filter(c => c === "A").length;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  };

  const player = [drawCard(), drawCard()];
  const dealer = [drawCard(), drawCard()];

  // Simple AI: player stands on 17+, hits below
  while (handVal(player) < 17) player.push(drawCard());
  while (handVal(dealer) < 17) dealer.push(drawCard());

  const pVal = handVal(player);
  const dVal = handVal(dealer);
  let result, net;

  if (pVal > 21) { result = "bust"; net = -bet; }
  else if (dVal > 21) { result = "win"; net = bet; }
  else if (pVal > dVal) { result = "win"; net = bet; }
  else if (pVal < dVal) { result = "lose"; net = -bet; }
  else { result = "push"; net = 0; }

  if (pVal === 21 && player.length === 2) { net = Math.floor(bet * 1.5); result = "blackjack"; }
  const opKey = makeInteractionOpKey(interaction, "blackjack");

  await withTransaction(db, async () => {
    const fresh = await getUserRow(db, userId);
    if (Number(fresh?.money || 0) < bet) throw new Error("INSUFFICIENT");
    const inserted = await addLedgerUnique(db, "blackjack", userId, null, Math.abs(net), opKey, { player, dealer, result, bet });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, net);
  });

  const after = await getUserRow(db, userId);
  const emoji = { win: "🎉", blackjack: "🃏✨", lose: "💀", bust: "💥", push: "🤝" };
  const label = { win: "Выиграл", blackjack: "БЛЭКДЖЕК", lose: "Проиграл", bust: "Перебор", push: "Ничья" };

  await interaction.editReply(
    `🃏 **Блэкджек**\n\n` +
    `Ты: [${player.join(", ")}] = **${pVal}**\n` +
    `Дилер: [${dealer.join(", ")}] = **${dVal}**\n\n` +
    `${emoji[result]} **${label[result]}!** ${net > 0 ? `+${fmtMoney(net)}` : net < 0 ? `-${fmtMoney(Math.abs(net))}` : "Ставка возвращена"}\n` +
    `Баланс: **${fmtMoney(after.money)}**`
  );
}

async function handleRoulette(interaction, db) {
  const userId = interaction.user.id;
  const color = interaction.options.getString("color", true);
  const betRaw = interaction.options.getInteger("bet", true);
  const user = await getOrCreateUser(db, userId);
  if (!(await ensureNotJailed(interaction, user))) return;

  const bet = clampInt(betRaw, 100, 500000);
  if (!bet || Number(user.money) < bet) {
    await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return;
  }

  await interaction.deferReply();

  const number = randInt(0, 36);
  const isGreen = number === 0;
  const isRed = !isGreen && number % 2 === 1;
  const isBlack = !isGreen && !isRed;
  const resultColor = isGreen ? "green" : isRed ? "red" : "black";
  const colorEmoji = { red: "🔴", black: "⚫", green: "🟢" };
  const colorName = { red: "Красное", black: "Чёрное", green: "Зелёное" };

  let net = -bet;
  if (color === resultColor) {
    const mult = color === "green" ? 14 : 2;
    net = bet * mult - bet;
  }
  const opKey = makeInteractionOpKey(interaction, "roulette");

  await withTransaction(db, async () => {
    const fresh = await getUserRow(db, userId);
    if (Number(fresh?.money || 0) < bet) throw new Error("INSUFFICIENT");
    const inserted = await addLedgerUnique(db, "roulette", userId, null, Math.abs(net), opKey, { color, resultColor, number, bet });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await adjustMoney(db, userId, net);
  });

  const after = await getUserRow(db, userId);
  const won = net > 0;
  await interaction.editReply(
    `🎰 **Рулетка Caligula's Palace**\n\n` +
    `Шарик: ${colorEmoji[resultColor]} **${number}** (${colorName[resultColor]})\n` +
    `Твоя ставка: ${colorEmoji[color]} ${colorName[color]}\n\n` +
    `${won ? `🎉 Выигрыш: **+${fmtMoney(net)}**` : net === 0 ? "🤝 Возврат ставки" : `💨 Проигрыш: **-${fmtMoney(bet)}**`}\n` +
    `Баланс: **${fmtMoney(after.money)}**`
  );
}

async function handleSampLifeCommand({ interaction, db }) {
  const name = interaction.commandName;
  let handled = true;
  let result;

  try {
    if (name === "reg") result = await handleReg(interaction, db);
    else if (name === "balance") result = await handleBalance(interaction, db);
    else if (name === "moneylog") result = await handleMoneyLog(interaction, db);
    else if (name === "work") result = await handleWork(interaction, db);
    else if (name === "truck") result = await handleTruck(interaction, db);
    else if (name === "rob") result = await handleRob(interaction, db);
    else if (name === "dealership") result = await handleDealership(interaction);
    else if (name === "weaponshop") result = await handleWeaponShop(interaction);
    else if (name === "buy") result = await handleBuy(interaction, db);
    else if (name === "race") result = await handleRace(interaction, db);
    else if (name === "duel") result = await handleDuel(interaction, db);
    else if (name === "sellcar") result = await handleSellCar(interaction, db);
    else if (name === "buycar") result = await handleBuyCar(interaction, db);
    else if (name === "weapon") result = await handleWeapon(interaction, db);
    else if (name === "bail") result = await handleBail(interaction, db);
    else if (name === "richest") result = await handleRichest(interaction, db);
    else if (name === "daily") result = await handleDaily(interaction, db);
    else if (name === "pay") result = await handlePay(interaction, db);
    else if (name === "slots") result = await handleSlots(interaction, db);
    else if (name === "blackjack") result = await handleBlackjack(interaction, db);
    else if (name === "roulette") result = await handleRoulette(interaction, db);
    else handled = false;

    if (!handled) {
      await interaction.reply({ content: "Неизвестная команда SAMP Life.", ephemeral: true });
      return;
    }

    await touchSampUserSeenAt(db, interaction.user?.id).catch(() => {});
    return result;
  } catch (e) {
    const isDeferred = Boolean(interaction.deferred || interaction.replied);

    if (isIgnorableInteractionError(e)) {
      console.error("[samp-life] interaction expired", e?.code || e?.rawError?.code || e);
      return;
    }

    if (String(e.message) === "COOLDOWN_ACTIVE") {
      if (isDeferred) {
        await interaction.followUp({ content: "⏳ Ежедневный бонус уже получен. Попробуй позже.", ephemeral: true });
      } else {
        await interaction.reply({ content: "⏳ Ежедневный бонус уже получен. Попробуй позже.", ephemeral: true });
      }
      return;
    }
    if (String(e.message) === "DUPLICATE_OPERATION") {
      if (isDeferred) {
        await interaction.followUp({ content: "Эта команда уже была обработана.", ephemeral: true });
      } else {
        await interaction.reply({ content: "Эта команда уже была обработана.", ephemeral: true });
      }
      return;
    }
    if (String(e.message) === "INSUFFICIENT") {
      if (isDeferred) {
        await interaction.followUp({ content: "Не хватает виртов.", ephemeral: true });
      } else {
        await interaction.reply({ content: "Не хватает виртов.", ephemeral: true });
      }
      return;
    }
    if (String(e.message) === "ALREADY_OWNED") {
      if (isDeferred) {
        await interaction.followUp({ content: "У тебя уже есть эта тачка в гараже.", ephemeral: true });
      } else {
        await interaction.reply({ content: "У тебя уже есть эта тачка в гараже.", ephemeral: true });
      }
      return;
    }
    // eslint-disable-next-line no-console
    console.error("[samp-life] command error", e);
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content: "Ошибка. Попробуй позже.", embeds: [] }).catch(async () => {
        await interaction.followUp({ content: "Ошибка. Попробуй позже.", ephemeral: true }).catch(() => {});
      });
    } else if (isDeferred) {
      await interaction.followUp({ content: "Ошибка. Попробуй позже.", ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: "Ошибка. Попробуй позже.", ephemeral: true }).catch(() => {});
    }
  }
}

async function handleSampLifeAutocomplete(interaction, db) {
  const commandName = interaction.commandName;
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value || "").toLowerCase();
  const page = getAutocompletePage(interaction);

  let choices = [];

  if (commandName === "buy") {
    const type = interaction.options.getString("type");
    if (focused.name === "id") {
      if (type === "car") {
        choices = Object.entries(CARS).map(([id, c]) => ({
          name: `${c.name} — ${fmtMoney(c.price)} (скор.: ${c.speed})`,
          value: id,
        }));
      } else if (type === "weapon") {
        choices = Object.entries(ITEMS).map(([id, w]) => ({
          name: `${w.name} — ${fmtMoney(w.price)} (урон: ${w.dmg[0]}–${w.dmg[1]})`,
          value: id,
        }));
      } else {
        // type not yet selected — show both
        choices = [
          ...Object.entries(CARS).map(([id, c]) => ({
            name: `🚗 ${c.name} — ${fmtMoney(c.price)}`,
            value: id,
          })),
          ...Object.entries(ITEMS).map(([id, w]) => ({
            name: `🔫 ${w.name} — ${fmtMoney(w.price)}`,
            value: id,
          })),
        ];
      }
    }
  } else if (commandName === "weapon") {
    choices = Object.entries(ITEMS).map(([id, w]) => ({
      name: `${w.name} — урон: ${w.dmg[0]}–${w.dmg[1]}`,
      value: id,
    }));
  } else if (commandName === "sellcar") {
    const userId = interaction.user.id;
    const ownedCars = await dbAll(db, "SELECT car_id FROM samp_garage WHERE user_id = ?", [String(userId)]);
    choices = (ownedCars || [])
      .filter((r) => r.car_id !== "bicycle" && CARS[r.car_id])
      .map((r) => {
        const c = CARS[r.car_id];
        return { name: `${c.name} (${r.car_id})`, value: r.car_id };
      });
  }

  if (query) {
    choices = choices.filter(
      (c) => c.name.toLowerCase().includes(query) || c.value.includes(query)
    );
  }

  await interaction.respond(sliceAutocompleteChoices(choices, page));
}

module.exports = {
  ensureSampLifeTables,
  getSampLifeCommandBuilders,
  handleSampLifeCommand,
  handleSampLifeAutocomplete,
  touchSampUserSeenAt,
  getCarVehicleProfile,
  getInstalledCarUpgradeRows,
  getOrCreateCarTuningProgress,
  getUserRaceStats,
  getCarUpgradeSpeedBonus,
  getRaceCarProfile,
  CARS,
  ITEMS,
};
