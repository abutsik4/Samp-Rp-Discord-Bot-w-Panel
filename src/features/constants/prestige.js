"use strict";

/**
 * Whale-tier money sink catalogs.
 *
 * All entries are price-tagged for the $20M-$100M whale cohort so that
 * single purchases bite into a player's balance and recurring drains
 * (crew salary, stock commissions) shrink long-term hoards.
 */

// -------------------------
// Mansions (one-time, prestige only)
// -------------------------
const MANSIONS = {
  beach_house: {
    id: "beach_house",
    name: "Пляжный домик в Verona Beach",
    district: "Verona Beach",
    price: 2_000_000,
    flexScore: 5,
    emoji: "🏖️",
    description: "Скромная начальная резиденция на берегу.",
    dailyRent: 1_600,
    bonuses: { workMultiplier: 0.02, cooldownMultiplier: 0.98, robLossMitigation: 0.05, stashCapMultiplier: 1.2 },
  },
  east_ls_pad: {
    id: "east_ls_pad",
    name: "Лофт в East Los Santos",
    district: "East Los Santos",
    price: 4_000_000,
    flexScore: 12,
    emoji: "🏙️",
    description: "Тихая хата с видом на район.",
    dailyRent: 3_200,
    bonuses: { workMultiplier: 0.04, cooldownMultiplier: 0.96, robLossMitigation: 0.10, stashCapMultiplier: 1.4 },
  },
  vinewood_villa: {
    id: "vinewood_villa",
    name: "Вилла Vinewood Hills",
    district: "Vinewood Hills",
    price: 8_000_000,
    flexScore: 25,
    emoji: "🌴",
    description: "С бассейном и охраной 24/7.",
    dailyRent: 6_400,
    bonuses: { workMultiplier: 0.06, cooldownMultiplier: 0.94, robLossMitigation: 0.15, stashCapMultiplier: 1.6 },
  },
  madd_dogg_mansion: {
    id: "madd_dogg_mansion",
    name: "Особняк Madd Dogg",
    district: "Mulholland",
    price: 15_000_000,
    flexScore: 50,
    emoji: "🎤",
    description: "Легендарный дом с золотыми пластинками на стенах.",
    dailyRent: 12_000,
    bonuses: { workMultiplier: 0.08, cooldownMultiplier: 0.92, robLossMitigation: 0.20, stashCapMultiplier: 1.8 },
  },
  cj_estate: {
    id: "cj_estate",
    name: "Поместье CJ Empire",
    district: "Vinewood Hills",
    price: 25_000_000,
    flexScore: 100,
    emoji: "👑",
    description: "Высшая точка прайда. Когда-то это был просто дом на Grove Street.",
    dailyRent: 20_000,
    bonuses: { workMultiplier: 0.10, cooldownMultiplier: 0.90, robLossMitigation: 0.25, stashCapMultiplier: 2.0 },
  },
};

// -------------------------
// Aircraft (one-time, prestige only)
// -------------------------
const AIRCRAFT = {
  maverick: {
    id: "maverick",
    name: "Maverick (вертолёт)",
    type: "helicopter",
    price: 3_000_000,
    flexScore: 8,
    emoji: "🚁",
    description: "Первый вертолёт. Уже не такси.",
    job: {
      cooldownMs: 10 * 60 * 1000,
      payMin: 3_000,
      payMax: 6_000,
      incidentChance: 0.04,
      incidentPenaltyMin: 500,
      incidentPenaltyMax: 1_500,
      jobLines: [
        "отработал облёт для отчёта о пробках на магистрали",
        "выполнил медэвак-вызов в Mount Chiliad",
        "подвозил папарацци над Vinewood",
        "снимал репортаж для WCTR с воздуха",
      ],
      incidentLines: [
        "попал в вихревой поток, повреждён ротор",
        "жёсткая посадка в LS — ремонт из своего кармана",
      ],
    },
  },
  shamal: {
    id: "shamal",
    name: "Shamal (частный джет)",
    type: "jet",
    price: 8_000_000,
    flexScore: 20,
    emoji: "🛩️",
    description: "Свой джет — это уже не сервис, это образ жизни.",
    job: {
      cooldownMs: 20 * 60 * 1000,
      payMin: 8_000,
      payMax: 15_000,
      incidentChance: 0.05,
      incidentPenaltyMin: 2_000,
      incidentPenaltyMax: 4_000,
      jobLines: [
        "выполнил чартерный рейс LS → LV",
        "подвозил звезду на вручение в SF",
        "выполнил VIP-шаттл для бизнесмена",
        "перегнал борт через штат для нового владельца",
      ],
      incidentLines: [
        "попал в турбулентность — повреждён фюзеляж",
        "срыв рейса из-за погоды, компенсация пассажирам",
      ],
    },
  },
  hydra: {
    id: "hydra",
    name: "Hydra (военный истребитель)",
    type: "fighter",
    price: 15_000_000,
    flexScore: 60,
    emoji: "✈️",
    description: "Военный истребитель. Никаких бумаг, никаких вопросов.",
    job: {
      cooldownMs: 30 * 60 * 1000,
      payMin: 22_000,
      payMax: 42_000,
      incidentChance: 0,
      incidentPenaltyMin: 0,
      incidentPenaltyMax: 0,
      jailChance: 0.15,
      jailMs: 10 * 60 * 1000,
      jailFineMin: 5_000,
      jailFineMax: 10_000,
      jobLines: [
        "выполнил военный контракт по перехвату",
        "интерсептировал бандитский рейс",
        "доставил груз без бумаг",
        "провёл неформальный воздушный парад",
      ],
      jailLines: [
        "Нацгвардия засекла полёт без разрешения — посадка в СИЗО",
        "FBI перехватило радиосвязь — арест при посадке",
      ],
    },
  },
  at400: {
    id: "at400",
    name: "AT-400 (пассажирский лайнер)",
    type: "airliner",
    price: 20_000_000,
    flexScore: 80,
    emoji: "🛬",
    description: "Свой лайнер на 400 мест — для тех, кто возит толпу.",
    job: {
      cooldownMs: 45 * 60 * 1000,
      payMin: 28_000,
      payMax: 55_000,
      incidentChance: 0.06,
      incidentPenaltyMin: 5_000,
      incidentPenaltyMax: 12_000,
      jobLines: [
        "выполнил чартер для туристической группы",
        "перевёз фрахт из LS в LV",
        "подвозил игроков на большой турнир Four Dragons",
        "выполнил групповой чартер для корпоратива",
      ],
      incidentLines: [
        "задержка рейса — выплатил компенсации пассажирам",
        "поломка шасси на взлёте — дорогой ремонт",
      ],
    },
  },
};

// -------------------------
// Stock market — fictional GTA-themed tickers
// -------------------------
const STOCKS = {
  CLCK: {
    ticker: "CLCK",
    name: "Cluckin' Bell Corp.",
    basePrice: 120,
    volatility: 0.04,
    emoji: "🍗",
    news: [
      { delta: -0.15, text: "🍗 Cluckin' Bell: массовый отзыв продукции. Акции −15%." },
      { delta: 0.10, text: "🍗 Cluckin' Bell: новый «Mega Crispy Bucket» бьёт рекорды. Акции +10%." },
      { delta: -0.08, text: "🍗 Cluckin' Bell: проверка санэпидемстанции. Акции −8%." },
      { delta: 0.07, text: "🍗 Cluckin' Bell: открытие 50 новых точек в SA. Акции +7%." },
      { delta: 0.05, text: "🍗 Cluckin' Bell: квартальный отчёт лучше прогноза. Акции +5%." },
    ],
  },
  SPRK: {
    ticker: "SPRK",
    name: "Sprunk Beverages",
    basePrice: 85,
    volatility: 0.05,
    emoji: "🥤",
    news: [
      { delta: 0.12, text: "🥤 Sprunk: новый вкус «Tropical Fury» — продажи взлетели. +12%." },
      { delta: -0.10, text: "🥤 Sprunk: судебный иск из-за состава. −10%." },
      { delta: -0.06, text: "🥤 Sprunk: завод в Las Venturas остановлен. −6%." },
      { delta: 0.08, text: "🥤 Sprunk: контракт на снабжение всех казино. +8%." },
    ],
  },
  ZIP: {
    ticker: "ZIP",
    name: "ZIP Mall Holdings",
    basePrice: 220,
    volatility: 0.03,
    emoji: "🛍️",
    news: [
      { delta: 0.06, text: "🛍️ ZIP Mall: новый ТЦ в Vinewood. Акции +6%." },
      { delta: -0.07, text: "🛍️ ZIP Mall: обвал офлайн-продаж. −7%." },
      { delta: 0.04, text: "🛍️ ZIP Mall: партнёрство с Binco. +4%." },
      { delta: -0.05, text: "🛍️ ZIP Mall: ограбление магазина — паника инвесторов. −5%." },
    ],
  },
  AMNU: {
    ticker: "AMNU",
    name: "Ammu-Nation Inc.",
    basePrice: 380,
    volatility: 0.06,
    emoji: "🔫",
    news: [
      { delta: 0.15, text: "🔫 Ammu-Nation: бандитские разборки в Ganton — спрос на пушки взлетел. +15%." },
      { delta: -0.12, text: "🔫 Ammu-Nation: новые ограничения на продажу. −12%." },
      { delta: 0.08, text: "🔫 Ammu-Nation: контракт с частной охраной. +8%." },
      { delta: -0.05, text: "🔫 Ammu-Nation: иск от мэрии. −5%." },
    ],
  },
  RSGT: {
    ticker: "RSGT",
    name: "Rockstar Games (мета)",
    basePrice: 1_200,
    volatility: 0.07,
    emoji: "🎮",
    news: [
      { delta: 0.20, text: "🎮 Rockstar: слухи о GTA VII. +20%." },
      { delta: -0.15, text: "🎮 Rockstar: задержка релиза — инвесторы недовольны. −15%." },
      { delta: 0.10, text: "🎮 Rockstar: рекордные продажи DLC. +10%." },
      { delta: -0.08, text: "🎮 Rockstar: утечка кода. −8%." },
    ],
  },
  "4DRG": {
    ticker: "4DRG",
    name: "Four Dragons Casino",
    basePrice: 540,
    volatility: 0.08,
    emoji: "🎰",
    news: [
      { delta: 0.12, text: "🎰 Four Dragons: рекордный уикенд в казино. +12%." },
      { delta: -0.14, text: "🎰 Four Dragons: ограбление казино — инвесторы в шоке. −14%." },
      { delta: 0.06, text: "🎰 Four Dragons: новая VIP-зона. +6%." },
      { delta: -0.07, text: "🎰 Four Dragons: проверка комиссии по азартным играм. −7%." },
    ],
  },
};

// 2% commission on every buy/sell — the actual money sink
const STOCK_COMMISSION_PCT = 0.02;
// Hard caps to prevent pump-and-dump
const STOCK_MAX_TRADE_AMOUNT = 25_000_000;
const STOCK_MAX_DAILY_VOLUME = 100_000_000;
// Price-tick scheduler interval (minutes)
const STOCK_TICK_MINUTES = 15;
// Chance per tick that a news event fires for ANY ticker
const STOCK_NEWS_CHANCE_PER_TICK = 0.05;
// Snapshots to keep in samp_stock_history (24h at 15-min ticks = 96)
const STOCK_HISTORY_LIMIT = 96;

// -------------------------
// Crew & staff (recurring drain)
// -------------------------
const CREW_SALARY_PERIOD_DAYS = 30;

const CREW_ROLES = {
  bodyguard: {
    id: "bodyguard",
    name: "Телохранитель",
    hireCost: 500_000,
    monthlySalary: 1_000_000,
    emoji: "🛡️",
    description: "Блокирует одну попытку /rob против тебя в сутки.",
  },
  lawyer: {
    id: "lawyer",
    name: "Адвокат",
    hireCost: 750_000,
    monthlySalary: 1_500_000,
    emoji: "⚖️",
    description: "−50% к времени тюрьмы при провале /rob и ограбления.",
  },
  driver: {
    id: "driver",
    name: "Личный водитель",
    hireCost: 400_000,
    monthlySalary: 800_000,
    emoji: "🚗",
    description: "−20% к кулдауну /work.",
  },
  butler: {
    id: "butler",
    name: "Дворецкий",
    hireCost: 300_000,
    monthlySalary: 600_000,
    emoji: "🎩",
    description: "Напоминает о /daily — будет в подсказках в /balance.",
  },
  accountant: {
    id: "accountant",
    name: "Бухгалтер",
    hireCost: 1_000_000,
    monthlySalary: 2_000_000,
    emoji: "💼",
    description: "−1% к комиссии биржи. Стакается с VIP.",
  },
  private_security: {
    id: "private_security",
    name: "Частная охрана",
    hireCost: 2_000_000,
    monthlySalary: 4_000_000,
    emoji: "🪖",
    description: "Усиленная защита: блокирует до 3 попыток /rob в сутки и режет добычу пополам, если интерсепт не сработал.",
  },
};

// -------------------------
// Social flex thresholds
// -------------------------
const FLEX_BURN_MIN = 100_000;
const FLEX_BURN_MAX = 100_000_000;
const FLEX_CHAMPAGNE_MIN = 250_000;
const FLEX_CHAMPAGNE_MAX = 50_000_000;
const FLEX_DONATE_MIN = 500_000;
const FLEX_DONATE_MAX = 25_000_000;
const FLEX_DONATE_RECIPIENTS = 10;
const FLEX_DONATE_MIN_RECIPIENTS = 3; // refuse if fewer eligible — anti-1:1 transfer abuse
const FLEX_DONATE_ACTIVE_WINDOW_HOURS = 24;
// Recipients must have this many real chat messages in the guild (anti-alt).
const FLEX_DONATE_MIN_GUILD_MESSAGES = 100;

// Per-action cooldowns (ms). Anti-spam, also prevents farming flexboard.
const FLEX_BURN_COOLDOWN_MS = 60 * 1000;
const FLEX_CHAMPAGNE_COOLDOWN_MS = 60 * 1000;
const FLEX_DONATE_COOLDOWN_MS = 5 * 60 * 1000;
const STOCK_TRADE_COOLDOWN_MS = 3 * 1000;

// Mansion daily rent collection cooldown (~daily, slightly under 24h).
const MANSION_RENT_COOLDOWN_MS = 23 * 60 * 60 * 1000;
// /work aviation flavor: chance per /work for aircraft owners to roll a bonus job.
const AIRCRAFT_WORK_FLAVOR_CHANCE = 0.10;
const AIRCRAFT_WORK_FLAVOR_BONUS_MIN = 1_500;
const AIRCRAFT_WORK_FLAVOR_BONUS_MAX = 4_500;
const AIRCRAFT_WORK_FLAVOR_LINES = [
  "сдавал вертушку в аренду фотографам",
  "подрабатывал инструктором в аэроклубе",
  "подвозил VIP по знакомству",
  "перегонял частный борт через штат",
];

// Champagne tiers (color + emoji vary by amount).
const CHAMPAGNE_TIERS = [
  { min: 5_000_000, name: "Gold", color: 0xf1c40f, emoji: "🥂✨", xpAward: 50 },
  { min: 1_000_000, name: "Silver", color: 0xbdc3c7, emoji: "🥂", xpAward: 25 },
  { min: 250_000, name: "Bronze", color: 0xb87333, emoji: "🍾", xpAward: 10 },
];

function getChampagneTier(amount) {
  return CHAMPAGNE_TIERS.find((tier) => amount >= tier.min) || CHAMPAGNE_TIERS[CHAMPAGNE_TIERS.length - 1];
}

module.exports = {
  MANSIONS,
  AIRCRAFT,
  STOCKS,
  STOCK_COMMISSION_PCT,
  STOCK_MAX_TRADE_AMOUNT,
  STOCK_MAX_DAILY_VOLUME,
  STOCK_TICK_MINUTES,
  STOCK_NEWS_CHANCE_PER_TICK,
  STOCK_HISTORY_LIMIT,
  CREW_ROLES,
  CREW_SALARY_PERIOD_DAYS,
  FLEX_BURN_MIN,
  FLEX_BURN_MAX,
  FLEX_CHAMPAGNE_MIN,
  FLEX_CHAMPAGNE_MAX,
  FLEX_DONATE_MIN,
  FLEX_DONATE_MAX,
  FLEX_DONATE_RECIPIENTS,
  FLEX_DONATE_MIN_RECIPIENTS,
  FLEX_DONATE_ACTIVE_WINDOW_HOURS,
  FLEX_DONATE_MIN_GUILD_MESSAGES,
  FLEX_BURN_COOLDOWN_MS,
  FLEX_CHAMPAGNE_COOLDOWN_MS,
  FLEX_DONATE_COOLDOWN_MS,
  STOCK_TRADE_COOLDOWN_MS,
  MANSION_RENT_COOLDOWN_MS,
  AIRCRAFT_WORK_FLAVOR_CHANCE,
  AIRCRAFT_WORK_FLAVOR_BONUS_MIN,
  AIRCRAFT_WORK_FLAVOR_BONUS_MAX,
  AIRCRAFT_WORK_FLAVOR_LINES,
  CHAMPAGNE_TIERS,
  getChampagneTier,
};
