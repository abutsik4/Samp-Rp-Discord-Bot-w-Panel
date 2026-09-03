"use strict";

/**
 * /play — the game hub. Phase 2 of REVIVAL_PLAN.md, see PHASE2_PLAN.md.
 *
 * The bot registered 98 slash commands against Discord's cap of 100; three
 * commits were spent shaving commands to fit. A Russian-speaking player opening
 * the autocomplete list saw 98 English identifiers (`bizrun`, `gcapture`,
 * `mansion-collect`) and had to read every description to find anything.
 *
 * This module replaces ~66 of those with one command and seven Russian
 * categories, each rendering a panel of buttons. Nothing is deleted: every
 * existing handler is reused unchanged, reached through a shimmed interaction
 * rather than a registered command.
 *
 * Interaction flow:
 *   /play <категория>              -> panel of action buttons
 *   button  play:a:<cat>:<action>  -> direct run, or opens a select / modal
 *   select  play:s:<cat>:<action>  -> runs with the chosen value
 *   modal   play:m:<cat>:<action>  -> runs with typed values
 *   user    play:u:<cat>:<action>  -> runs against the chosen member
 *
 * Adding an action means adding one entry to CATEGORIES — no dispatcher edits.
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const { dbAll } = require("../utils/db-helpers");
const { CARS, ITEMS, getInstalledCarUpgradeRows } = require("./samp-life");
const {
  PROPERTIES,
  TERRITORY_DISTRICTS,
  HEIST_TIERS,
  BLACK_MARKET_ITEMS,
  BLACK_MARKET_GRANTS,
  getDailyBlackMarketDeals,
  getDailyJobs,
} = require("./samp-extended");
const { MANSIONS, AIRCRAFT, CREW_ROLES, STOCKS } = require("./constants/prestige");
const { listTuningParts, getTuningPart } = require("./constants/car-tuning");
const { COSMETICS, CATEGORIES: COSMETIC_CATEGORIES } = require("./samp-cosmetics");
const { CRATES } = require("./samp-crates");
const { VIP_TIERS } = require("./samp-vip");

const PREFIX = "play";

// Sentinel for "apply to everything I own". The /tune and /maintainbiz handlers
// both express that as an absent option, so build() maps it back to null.
const ALL_OPTION = "__all__";

// Discord hard limits we have to respect when building components.
const SELECT_MAX_OPTIONS = 25;
const BUTTONS_PER_ROW = 5;
const MAX_BUTTON_ROWS = 5;

// -- Command routing ----------------------------------------------------------

// Which module owns which command name. Used to reach the existing handlers.
const MODULE_OF = {
  samplife: [
    "reg", "balance", "moneylog", "work", "truck", "rob", "dealership",
    "weaponshop", "buy", "race", "duel", "sellcar", "buycar", "weapon",
    "bail", "richest", "daily", "pay", "slots", "blackjack", "roulette", "insure",
  ],
  extended: [
    "businesses", "bizstats", "mbizstats", "buybiz", "collectincome",
    "maintainbiz", "bizrun", "tune", "switchcar", "garage", "bounty",
    "bountylist", "heist", "jobs", "dojob", "gang", "gmap", "gcapture",
    "gsupportbiz", "gangtop", "shopcosmetics", "buycosmetic", "repair",
    "lottery", "blackmarket", "usejailpass", "userepairkit", "disguise",
    "hottip", "secretheist", "wiretap", "sabotage", "gangbmorder",
  ],
  prestige: [
    "prestige", "burnmoney", "champagne", "donatechat", "flexboard",
    "realestate", "buymansion", "buyaircraft", "airjob", "mansion-collect",
    "estate", "stocks", "buystock", "sellstock", "hire", "fire", "crew",
  ],
  vip: ["vip"],
  upgrade: ["upgrade"],
  crate: ["crate"],
  cosmetics: ["shop", "mycollection", "equip", "unequip"],
};

const COMMAND_MODULE = new Map();
for (const [mod, names] of Object.entries(MODULE_OF)) {
  for (const n of names) COMMAND_MODULE.set(n, mod);
}

/**
 * Build an interaction that looks like the slash command `commandName` with
 * `opts` supplied, delegating everything else to the real interaction.
 *
 * Uses the same prototype-delegation trick as createGangAliasInteraction() in
 * samp-extended.js, so discord.js instance methods keep working.
 */
function shimInteraction(interaction, commandName, opts = {}, subcommand = null) {
  const shim = Object.create(interaction);
  const options = Object.create(interaction.options || Object.prototype);

  const val = (name) => (Object.prototype.hasOwnProperty.call(opts, name) ? opts[name] : null);

  options.getString = (name) => {
    const v = val(name);
    return v === null || v === undefined ? null : String(v);
  };
  options.getInteger = (name) => {
    const v = val(name);
    return v === null || v === undefined || v === "" ? null : Math.trunc(Number(v));
  };
  options.getNumber = (name) => {
    const v = val(name);
    return v === null || v === undefined || v === "" ? null : Number(v);
  };
  options.getBoolean = (name) => {
    const v = val(name);
    return v === null || v === undefined ? null : Boolean(v);
  };
  options.getUser = (name) => val(name);
  options.getMember = (name) => val(`${name}__member`);
  options.getChannel = (name) => val(name);
  options.getSubcommand = () => subcommand;
  options.getSubcommandGroup = () => null;

  shim.commandName = commandName;
  shim.options = options;
  return shim;
}

/**
 * Run an existing command handler with synthesised options.
 */
async function runCommand(interaction, db, commandName, opts = {}, subcommand = null) {
  const mod = COMMAND_MODULE.get(commandName);
  const shim = shimInteraction(interaction, commandName, opts, subcommand);

  // Required lazily: several of these modules import samp-life, and samp-life
  // must not end up importing this file at load time.
  switch (mod) {
    case "samplife":
      return require("./samp-life").handleSampLifeCommand({ interaction: shim, db });
    case "extended":
      return require("./samp-extended").handleSampExtendedCommand({ interaction: shim, db });
    case "prestige":
      return require("./samp-prestige").handleSampPrestigeCommand({ interaction: shim, db });
    case "vip":
      return require("./samp-vip").handleSampVipCommand({ interaction: shim, db });
    case "upgrade":
      return require("./samp-property-upgrades").handleSampUpgradeCommand({ interaction: shim, db });
    case "crate":
      return require("./samp-crates").handleSampCrateCommand({ interaction: shim, db });
    case "cosmetics": {
      const c = require("./samp-cosmetics");
      if (commandName === "shop") return c.handleShopCommand(shim, db);
      if (commandName === "mycollection") return c.handleMyCollectionCommand(shim, db);
      if (commandName === "equip") return c.handleEquipCommand(shim, db, { equip: true });
      if (commandName === "unequip") return c.handleEquipCommand(shim, db, { equip: false });
      return null;
    }
    default:
      throw new Error(`play-hub: no module for command "${commandName}"`);
  }
}

// -- Option providers ---------------------------------------------------------
// Each returns [{ label, value, description? }], capped to Discord's 25.

function cap(list) {
  return list.slice(0, SELECT_MAX_OPTIONS);
}

function money(n) {
  return `${Number(n || 0).toLocaleString("ru-RU")}$`;
}

const provide = {
  heistTiers: () =>
    cap(Object.entries(HEIST_TIERS).map(([id, t]) => ({
      label: t.name,
      value: id,
      description: `${t.minPlayers}-${t.maxPlayers} игроков • ${money(t.payout[0])}–${money(t.payout[1])}`,
    }))),

  businesses: () =>
    cap(Object.entries(PROPERTIES).map(([id, p]) => ({
      label: p.name,
      value: id,
      description: `${money(p.price)} • доход ${money(p.income)}`,
    }))),

  districts: () =>
    cap(Object.entries(TERRITORY_DISTRICTS).map(([id, d]) => ({
      label: d.name,
      value: id,
      description: `захват ${money(d.claimCost)}`,
    }))),

  // Slots are the shuffled deals of the day, not the static catalogue order:
  // labelling them from BLACK_MARKET_ITEMS pointed players at the wrong goods.
  blackMarketSlots: () =>
    cap(getDailyBlackMarketDeals().map((deal) => ({
      label: deal.name,
      value: String(deal.slot),
      description: money(deal.price),
    }))),

  // 63 buyable cars against a 25-option select cap, so they are banded by
  // price. The bands are sized to keep every band under the cap AND to cover
  // the full catalogue — dropping the overflow would quietly make the
  // expensive half of the dealership unbuyable.
  carsByPrice: (min, max) =>
    cap(Object.entries(CARS)
      .filter(([, c]) => c.price >= min && c.price < max)
      .sort((a, b) => a[1].price - b[1].price)
      .map(([id, c]) => ({ label: c.name, value: id, description: `${money(c.price)} • скорость ${c.speed}` }))),

  weaponsToBuy: () =>
    cap(Object.entries(ITEMS)
      .sort((a, b) => a[1].price - b[1].price)
      .map(([id, w]) => ({ label: w.name, value: id, description: `${money(w.price)} • урон ${w.dmg[0]}-${w.dmg[1]}` }))),

  // User-specific: only the cars this player actually owns.
  ownedCars: async (db, userId) => {
    const rows = await dbAll(db, `SELECT car_id FROM samp_garage WHERE user_id = ?`, [String(userId)]).catch(() => []);
    const opts = (rows || [])
      .map((r) => ({ id: r.car_id, car: CARS[r.car_id] }))
      .filter((x) => x.car)
      .map((x) => ({ label: x.car.name, value: x.id, description: `скорость ${x.car.speed}` }));
    return cap(opts);
  },

  ownedBusinesses: async (db, userId) => {
    const rows = await dbAll(db, `SELECT property_id FROM samp_properties WHERE user_id = ?`, [String(userId)]).catch(() => []);
    const opts = (rows || [])
      .map((r) => ({ id: r.property_id, p: PROPERTIES[r.property_id] }))
      .filter((x) => x.p)
      .map((x) => ({ label: x.p.name, value: x.id, description: `доход ${money(x.p.income)}` }));
    return cap(opts);
  },

  mansions: () =>
    cap(Object.entries(MANSIONS).map(([id, m]) => ({
      label: m.name, value: id, description: `${money(m.price)} • рента ${money(m.dailyRent)}`,
    }))),

  aircraft: () =>
    cap(Object.entries(AIRCRAFT).map(([id, a]) => ({
      label: a.name, value: id, description: money(a.price),
    }))),

  ownedAircraft: async (db, userId) => {
    const rows = await dbAll(db, `SELECT aircraft_id FROM samp_aircraft WHERE user_id = ?`, [String(userId)]).catch(() => []);
    const opts = (rows || [])
      .map((r) => ({ id: r.aircraft_id, a: AIRCRAFT[r.aircraft_id] }))
      .filter((x) => x.a)
      .map((x) => ({ label: x.a.name, value: x.id, description: x.a.type || "" }));
    return cap(opts);
  },

  crewRoles: () =>
    cap(Object.entries(CREW_ROLES).map(([id, r]) => ({
      label: r.name, value: id, description: `найм ${money(r.hireCost)}`,
    }))),

  ownedWeapons: async (db, userId) => {
    const rows = await dbAll(
      db,
      `SELECT item_id FROM samp_inventory WHERE user_id = ? AND qty > 0`,
      [String(userId)]
    ).catch(() => []);
    const opts = (rows || [])
      .map((r) => ({ id: r.item_id, w: ITEMS[r.item_id] }))
      .filter((x) => x.w)
      .map((x) => ({ label: x.w.name, value: x.id, description: `урон ${x.w.dmg[0]}-${x.w.dmg[1]}` }));
    return cap(opts);
  },

  ownedCosmetics: async (db, userId) => {
    const rows = await dbAll(
      db,
      `SELECT cosmetic_id FROM samp_cosmetics_inventory WHERE user_id = ?`,
      [String(userId)]
    ).catch(() => []);
    return cap((rows || []).map((r) => {
      const c = COSMETICS[r.cosmetic_id];
      return {
        label: c ? `${c.emoji || ""} ${c.name}`.trim() : String(r.cosmetic_id),
        value: String(r.cosmetic_id),
      };
    }));
  },

  crates: () =>
    cap(Object.values(CRATES).map((c) => ({
      label: `${c.emoji} ${c.name}`, value: c.id, description: money(c.price),
    }))),

  vipTiers: () =>
    cap(Object.values(VIP_TIERS).map((t) => ({
      label: `${t.emoji} ${t.name}`, value: t.id, description: `${money(t.price)} / неделя`,
    }))),

  stocks: () =>
    cap(Object.values(STOCKS).map((s) => ({
      label: `${s.emoji} ${s.ticker} — ${s.name}`, value: s.ticker, description: `старт ${money(s.basePrice)}`,
    }))),

  ownedStocks: async (db, userId) => {
    const rows = await dbAll(
      db,
      "SELECT ticker, shares FROM samp_stocks WHERE user_id = ? AND shares > 0 ORDER BY ticker",
      [String(userId)]
    ).catch(() => []);
    return cap((rows || []).map((r) => ({
      label: `${STOCKS[r.ticker]?.emoji || "📈"} ${r.ticker}`,
      value: String(r.ticker),
      description: `в портфеле: ${r.shares}`,
    })));
  },

  dailyJobs: () =>
    cap(getDailyJobs().map((job, i) => ({
      label: `${i + 1}. ${job.name}`,
      value: String(i + 1),
      description: `${money(job.basePay[0])}–${money(job.basePay[1])}`,
    }))),

  rouletteColors: () => [
    { label: "🔴 Красное", value: "red", description: "выплата ×2" },
    { label: "⚫ Чёрное", value: "black", description: "выплата ×2" },
    { label: "🟢 Зелёное (зеро)", value: "green", description: "выплата ×14" },
  ],

  // Only the goods the gang order handler can actually grant in bulk.
  bulkBlackMarketItems: () =>
    cap(BLACK_MARKET_ITEMS
      .filter((item) => BLACK_MARKET_GRANTS[item.type]?.inventoryItemId)
      .map((item) => ({
        label: item.name,
        value: item.type,
        description: `≈${money(Math.floor((item.basePrice[0] + item.basePrice[1]) / 2))} за штуку`,
      }))),

  cosmeticCategories: () =>
    cap(Object.entries(COSMETIC_CATEGORIES).map(([id, c]) => ({
      label: `${c.emoji} ${c.name}`,
      value: id,
      description: `${Object.values(COSMETICS).filter((x) => x.category === id).length} шт.`,
    }))),

  cosmeticsInCategory: (categoryId) =>
    cap(Object.entries(COSMETICS)
      .filter(([, c]) => c.category === categoryId)
      .sort((a, b) => a[1].price - b[1].price)
      .map(([id, c]) => ({
        label: `${c.emoji || ""} ${c.name}`.trim(),
        value: id,
        description: money(c.price),
      }))),

  openCarOffers: async (db, userId) => {
    const rows = await dbAll(
      db,
      `SELECT id, car_id, price FROM samp_car_offers
        WHERE buyer_user_id = ? AND status = 'open' ORDER BY id DESC`,
      [String(userId)]
    ).catch(() => []);
    return cap((rows || []).map((r) => ({
      label: `#${r.id} • ${CARS[r.car_id]?.name || r.car_id}`,
      value: String(r.id),
      description: money(r.price),
    })));
  },

  tuningInstallable: async (db, userId, carId) => {
    const rows = await getInstalledCarUpgradeRows(db, userId, carId).catch(() => []);
    const installed = new Set((rows || []).map((r) => r.upgrade_id));
    const busySlots = new Set((rows || []).map((r) => getTuningPart(r.upgrade_id)?.slot).filter(Boolean));
    return cap(listTuningParts()
      .filter((part) => !installed.has(part.id) && !busySlots.has(part.slot))
      .map((part) => ({ label: part.name, value: part.id, description: money(part.price) })));
  },

  tuningInstalled: async (db, userId, carId) => {
    const rows = await getInstalledCarUpgradeRows(db, userId, carId).catch(() => []);
    return cap((rows || [])
      .map((row) => {
        const part = getTuningPart(row.upgrade_id);
        if (!part) return null;
        return {
          label: part.name,
          value: part.id,
          description: `состояние ${Math.max(0, Math.floor(Number(row.durability ?? 100)))}%`,
        };
      })
      .filter(Boolean));
  },
};

// -- Categories ---------------------------------------------------------------
//
// kind: "direct" | "select" | "modal" | "chain" | "user"
//   direct — run immediately
//   select — string select menu, then run
//   modal  — text inputs, then run
//   chain  — several steps (selects, optionally ending in a modal), then run
//   user   — member picker, then run (Discord modals cannot pick users)

const CATEGORIES = [
  {
    id: "работа",
    emoji: "💼",
    title: "Работа",
    description: "Легальные способы поднять деньги.",
    actions: [
      { id: "truck", label: "Дальнобой", emoji: "🚚", kind: "direct", command: "truck" },
      { id: "jobs", label: "Список подработок", emoji: "📋", kind: "direct", command: "jobs" },
      {
        id: "dojob", label: "Взять подработку", emoji: "🔧", kind: "select", command: "dojob",
        placeholder: "Какое задание берём?",
        options: () => provide.dailyJobs(),
        emptyText: "Сегодня заданий нет.",
        build: (values) => ({ opts: { number: Number(values[0]) } }),
      },
      { id: "collect", label: "Собрать доход", emoji: "💰", kind: "direct", command: "collectincome" },
      {
        id: "bizrun", label: "Рейс бизнеса", emoji: "📦", kind: "select", command: "bizrun",
        placeholder: "Какой бизнес отправляет груз?",
        options: (db, userId) => provide.ownedBusinesses(db, userId),
        emptyText: "У тебя нет бизнеса. Загляни в `/play бизнес`.",
        build: (values) => ({ opts: { id: values[0] } }),
      },
      {
        id: "airjob", label: "Авиарейс", emoji: "✈️", kind: "select", command: "airjob",
        placeholder: "На каком борту летим?",
        options: (db, userId) => provide.ownedAircraft(db, userId),
        emptyText: "У тебя нет самолётов. Купи борт в `/play бизнес` → «Купить самолёт».",
        build: (values) => ({ opts: { aircraft: values[0] } }),
      },
    ],
  },

  {
    id: "транспорт",
    emoji: "🚗",
    title: "Транспорт",
    description: "Гараж, покупка, тюнинг и ремонт.",
    actions: [
      { id: "garage", label: "Гараж", emoji: "🏠", kind: "direct", command: "garage", subcommand: "view" },
      { id: "dealership", label: "Автосалон", emoji: "🏪", kind: "direct", command: "dealership" },
      {
        id: "careco", label: "Тачки: эконом", emoji: "🚘", kind: "select", command: "buy",
        placeholder: "До 25 000$",
        options: () => provide.carsByPrice(0, 25_000),
        build: (values) => ({ opts: { type: "car", id: values[0] } }),
      },
      {
        id: "carmid", label: "Тачки: средний", emoji: "🚙", kind: "select", command: "buy",
        placeholder: "25 000$ – 70 000$",
        options: () => provide.carsByPrice(25_000, 70_000),
        build: (values) => ({ opts: { type: "car", id: values[0] } }),
      },
      {
        id: "carsport", label: "Тачки: спорт", emoji: "🏎", kind: "select", command: "buy",
        placeholder: "70 000$ – 200 000$",
        options: () => provide.carsByPrice(70_000, 200_000),
        build: (values) => ({ opts: { type: "car", id: values[0] } }),
      },
      {
        id: "carlux", label: "Тачки: премиум", emoji: "💎", kind: "select", command: "buy",
        placeholder: "От 200 000$",
        options: () => provide.carsByPrice(200_000, Infinity),
        build: (values) => ({ opts: { type: "car", id: values[0] } }),
      },
      {
        id: "switch", label: "Сменить активную", emoji: "🔑", kind: "select", command: "switchcar",
        placeholder: "Какую машину сделать активной?",
        options: (db, userId) => provide.ownedCars(db, userId),
        emptyText: "В гараже пусто.",
        build: (values) => ({ opts: { car: values[0] } }),
      },
      {
        id: "tuneinspect", label: "Осмотр тюнинга", emoji: "🔍", kind: "select", command: "tune",
        subcommand: "inspect",
        placeholder: "Какую машину осмотреть?",
        options: (db, userId) => provide.ownedCars(db, userId),
        emptyText: "В гараже пусто.",
        build: (values) => ({ opts: { car: values[0] } }),
      },
      { id: "repair", label: "Ремонт оружия", emoji: "🛠", kind: "direct", command: "repair" },
      { id: "expand", label: "Расширить гараж", emoji: "➕", kind: "direct", command: "garage", subcommand: "expand" },
      { id: "insure", label: "Страховка", emoji: "🛡", kind: "direct", command: "insure", subcommand: "check" },
      {
        id: "buyoffer", label: "Принять предложение", emoji: "🤝", kind: "select", command: "buycar",
        placeholder: "Какое предложение принять?",
        options: (db, userId) => provide.openCarOffers(db, userId),
        emptyText: "Тебе никто не предлагал машину.",
        build: (values) => ({ opts: { offer: Number(values[0]) } }),
      },
      {
        id: "insbuy", label: "Оформить страховку", emoji: "📄", kind: "select", command: "insure",
        subcommand: "buy",
        placeholder: "Какую машину страхуем?",
        options: (db, userId) => provide.ownedCars(db, userId),
        emptyText: "В гараже пусто.",
        build: (values) => ({ opts: { car_id: values[0] } }),
      },
      {
        id: "insrenew", label: "Продлить страховку", emoji: "🔁", kind: "select", command: "insure",
        subcommand: "renew",
        placeholder: "Какую страховку продлить?",
        options: (db, userId) => provide.ownedCars(db, userId),
        emptyText: "В гараже пусто.",
        build: (values) => ({ opts: { car_id: values[0] } }),
      },
      {
        id: "tuneinstall", label: "Поставить деталь", emoji: "🔩", kind: "chain", command: "tune",
        subcommand: "install",
        steps: [
          {
            kind: "select", placeholder: "На какую машину ставим?",
            options: (db, userId) => provide.ownedCars(db, userId),
            emptyText: "В гараже пусто.",
          },
          {
            kind: "select", placeholder: "Какую деталь ставим?",
            options: (db, userId, picks) => provide.tuningInstallable(db, userId, picks[0]),
            emptyText: "Для этой машины свободных деталей нет.",
          },
        ],
        build: (picks) => ({ opts: { car: picks[0], part: picks[1] } }),
      },
      {
        id: "tuneremove", label: "Снять деталь", emoji: "🪛", kind: "chain", command: "tune",
        subcommand: "remove",
        steps: [
          {
            kind: "select", placeholder: "С какой машины снимаем?",
            options: (db, userId) => provide.ownedCars(db, userId),
            emptyText: "В гараже пусто.",
          },
          {
            kind: "select", placeholder: "Какую деталь снять?",
            options: (db, userId, picks) => provide.tuningInstalled(db, userId, picks[0]),
            emptyText: "На этой машине нет деталей.",
          },
        ],
        build: (picks) => ({ opts: { car: picks[0], part: picks[1] } }),
      },
      {
        id: "tunemaintain", label: "Сервис детали", emoji: "🧽", kind: "chain", command: "tune",
        subcommand: "maintain",
        steps: [
          {
            kind: "select", placeholder: "Какую машину обслуживаем?",
            options: (db, userId) => provide.ownedCars(db, userId),
            emptyText: "В гараже пусто.",
          },
          {
            kind: "select", placeholder: "Что обслуживаем?",
            options: async (db, userId, picks) => {
              const parts = await provide.tuningInstalled(db, userId, picks[0]);
              if (!parts.length) return parts;
              return cap([
                { label: "🔧 Все детали", value: ALL_OPTION, description: "обслужить всё сразу" },
                ...parts,
              ]);
            },
            emptyText: "На этой машине нет деталей.",
          },
        ],
        build: (picks) => ({ opts: { car: picks[0], part: picks[1] === ALL_OPTION ? null : picks[1] } }),
      },
    ],
  },

  {
    id: "бизнес",
    emoji: "🏢",
    title: "Бизнес и активы",
    description: "Бизнесы, недвижимость, биржа — деньги, которые работают сами.",
    actions: [
      { id: "list", label: "Мои бизнесы", emoji: "📊", kind: "direct", command: "businesses" },
      {
        id: "buybiz", label: "Купить бизнес", emoji: "🏬", kind: "select", command: "buybiz",
        placeholder: "Выбери бизнес",
        options: () => provide.businesses(),
        build: (values) => ({ opts: { id: values[0] } }),
      },
      {
        id: "maintain", label: "Обслужить", emoji: "🧰", kind: "select", command: "maintainbiz",
        placeholder: "Какой бизнес обслужить?",
        options: async (db, userId) => {
          const owned = await provide.ownedBusinesses(db, userId);
          if (!owned.length) return owned;
          return cap([
            { label: "🧰 Все бизнесы", value: ALL_OPTION, description: "обслужить всё сразу" },
            ...owned,
          ]);
        },
        emptyText: "У тебя нет бизнеса.",
        build: (values) => ({ opts: { id: values[0] === ALL_OPTION ? null : values[0] } }),
      },
      { id: "realestate", label: "Недвижимость", emoji: "🏘", kind: "direct", command: "realestate" },
      { id: "mansioncollect", label: "Собрать с особняка", emoji: "🏛", kind: "direct", command: "mansion-collect" },
      { id: "estate", label: "Моё имущество", emoji: "📜", kind: "direct", command: "estate" },
      { id: "stocks", label: "Биржа", emoji: "📈", kind: "direct", command: "stocks" },
      {
        id: "buystock", label: "Купить акции", emoji: "🟢", kind: "chain", command: "buystock",
        steps: [
          { kind: "select", placeholder: "Какие акции берём?", options: () => provide.stocks() },
          {
            kind: "modal", modalTitle: "Покупка акций",
            fields: [{ id: "shares", label: "Количество", style: "short", required: true }],
          },
        ],
        build: (picks, v) => ({ opts: { ticker: picks[0], shares: Number(v.shares) } }),
      },
      {
        id: "sellstock", label: "Продать акции", emoji: "🔴", kind: "chain", command: "sellstock",
        steps: [
          {
            kind: "select", placeholder: "Что продаём?",
            options: (db, userId) => provide.ownedStocks(db, userId),
            emptyText: "У тебя нет акций.",
          },
          {
            kind: "modal", modalTitle: "Продажа акций",
            fields: [{ id: "shares", label: "Количество", style: "short", required: true }],
          },
        ],
        build: (picks, v) => ({ opts: { ticker: picks[0], shares: Number(v.shares) } }),
      },
      { id: "crew", label: "Персонал", emoji: "👥", kind: "direct", command: "crew" },
      { id: "upgrades", label: "Улучшения", emoji: "⬆️", kind: "direct", command: "upgrade", subcommand: "list" },
      {
        id: "bizstats", label: "Статистика бизнеса", emoji: "📉", kind: "select", command: "bizstats",
        placeholder: "Какой бизнес посмотреть?",
        options: (db, userId) => provide.ownedBusinesses(db, userId),
        emptyText: "У тебя нет бизнеса.",
        build: (values) => ({ opts: { id: values[0] } }),
      },
      {
        id: "mbizstats", label: "Рынок бизнесов", emoji: "🧮", kind: "select", command: "mbizstats",
        placeholder: "Какой тип бизнеса изучить?",
        options: () => provide.businesses(),
        build: (values) => ({ opts: { id: values[0] } }),
      },
      {
        id: "buymansion", label: "Купить особняк", emoji: "🏛", kind: "select", command: "buymansion",
        placeholder: "Выбери особняк",
        options: () => provide.mansions(),
        build: (values) => ({ opts: { mansion: values[0] } }),
      },
      {
        id: "buyaircraft", label: "Купить самолёт", emoji: "🛩", kind: "select", command: "buyaircraft",
        placeholder: "Выбери борт",
        options: () => provide.aircraft(),
        build: (values) => ({ opts: { aircraft: values[0] } }),
      },
      {
        id: "hire", label: "Нанять", emoji: "🤵", kind: "select", command: "hire",
        placeholder: "Кого нанять?",
        options: () => provide.crewRoles(),
        build: (values) => ({ opts: { role: values[0] } }),
      },
      {
        id: "fire", label: "Уволить", emoji: "🚪", kind: "select", command: "fire",
        placeholder: "Кого уволить?",
        options: () => provide.crewRoles(),
        build: (values) => ({ opts: { role: values[0] } }),
      },
      {
        id: "upgbiz", label: "Улучшить бизнес", emoji: "🏗", kind: "select", command: "upgrade",
        subcommand: "business",
        placeholder: "Какой бизнес улучшить?",
        options: (db, userId) => provide.ownedBusinesses(db, userId),
        emptyText: "У тебя нет бизнеса.",
        build: (values) => ({ opts: { id: values[0] } }),
      },
      { id: "upgmansion", label: "Улучшить особняк", emoji: "🏰", kind: "direct", command: "upgrade", subcommand: "mansion" },
      {
        id: "upgair", label: "Улучшить борт", emoji: "🛫", kind: "select", command: "upgrade",
        subcommand: "aircraft",
        placeholder: "Какой борт улучшить?",
        options: (db, userId) => provide.ownedAircraft(db, userId),
        emptyText: "У тебя нет самолётов.",
        build: (values) => ({ opts: { id: values[0] } }),
      },
    ],
  },

  {
    id: "криминал",
    emoji: "🔫",
    title: "Криминал",
    description: "Быстрые деньги и высокий риск.",
    actions: [
      {
        id: "heist", label: "Ограбление", emoji: "💣", kind: "select", command: "heist",
        placeholder: "Выбери цель",
        options: () => provide.heistTiers(),
        build: (values) => ({ opts: { tier: values[0] } }),
      },
      { id: "secretheist", label: "Тайное дело", emoji: "🕵️", kind: "direct", command: "secretheist" },
      { id: "bmbrowse", label: "Чёрный рынок", emoji: "🖤", kind: "direct", command: "blackmarket", subcommand: "browse" },
      {
        id: "bmbuy", label: "Купить с рынка", emoji: "🛒", kind: "select", command: "blackmarket",
        subcommand: "buy",
        placeholder: "Выбери слот",
        options: () => provide.blackMarketSlots(),
        build: (values) => ({ opts: { slot: Number(values[0]) } }),
      },
      { id: "hottip", label: "Наводка", emoji: "📞", kind: "direct", command: "hottip" },
      { id: "disguise", label: "Маскировка", emoji: "🎭", kind: "direct", command: "disguise" },
      { id: "jailpass", label: "Использовать аусвайс", emoji: "🎟", kind: "direct", command: "usejailpass" },
      { id: "repairkit", label: "Ремкомплект", emoji: "🧯", kind: "direct", command: "userepairkit" },
      {
        id: "wiretap", label: "Прослушка", emoji: "🎧", kind: "user", command: "wiretap",
        placeholder: "Кого прослушать?",
        build: (user) => ({ opts: { user } }),
      },
      {
        id: "sabotage", label: "Саботаж", emoji: "🧨", kind: "user", command: "sabotage",
        placeholder: "Кому подложить свинью?",
        build: (user) => ({ opts: { user } }),
      },
      { id: "bountylist", label: "Список наград", emoji: "🎯", kind: "direct", command: "bountylist" },
      {
        id: "bmorder", label: "Заказ банды", emoji: "📮", kind: "chain", command: "gangbmorder",
        steps: [
          { kind: "select", placeholder: "Что заказываем?", options: () => provide.bulkBlackMarketItems() },
          {
            kind: "modal", modalTitle: "Заказ на чёрном рынке",
            fields: [{ id: "count", label: "Количество (1–5)", style: "short", required: true }],
          },
        ],
        build: (picks, v) => ({ opts: { item: picks[0], count: Number(v.count) } }),
      },
    ],
  },

  {
    id: "казино",
    emoji: "🎰",
    title: "Казино",
    description: "Las Venturas ждёт. Играй на то, что не жалко.",
    actions: [
      {
        id: "slots", label: "Слоты", emoji: "🎰", kind: "modal", command: "slots",
        modalTitle: "Слоты",
        fields: [{ id: "bet", label: "Ставка", style: "short", required: true }],
        build: (v) => ({ opts: { bet: Number(v.bet) } }),
      },
      {
        id: "blackjack", label: "Блэкджек", emoji: "🃏", kind: "modal", command: "blackjack",
        modalTitle: "Блэкджек",
        fields: [{ id: "bet", label: "Ставка", style: "short", required: true }],
        build: (v) => ({ opts: { bet: Number(v.bet) } }),
      },
      {
        id: "roulette", label: "Рулетка", emoji: "🔴", kind: "chain", command: "roulette",
        steps: [
          { kind: "select", placeholder: "На что ставим?", options: () => provide.rouletteColors() },
          {
            kind: "modal", modalTitle: "Рулетка",
            fields: [{ id: "bet", label: "Ставка", style: "short", required: true }],
          },
        ],
        build: (picks, v) => ({ opts: { color: picks[0], bet: Number(v.bet) } }),
      },
      { id: "lotteryinfo", label: "Лотерея", emoji: "🎫", kind: "direct", command: "lottery", subcommand: "info" },
      {
        id: "lotterybuy", label: "Купить билеты", emoji: "🎟", kind: "modal", command: "lottery",
        subcommand: "buy",
        modalTitle: "Лотерейные билеты",
        fields: [{ id: "count", label: "Сколько билетов", style: "short", required: true }],
        build: (v) => ({ opts: { count: Number(v.count) } }),
      },
    ],
  },

  {
    id: "банда",
    emoji: "🩸",
    title: "Банда",
    description: "Территории, казна и войны. Полное управление — в /gang.",
    actions: [
      { id: "info", label: "Моя банда", emoji: "ℹ️", kind: "direct", command: "gang", subcommand: "info" },
      { id: "top", label: "Топ банд", emoji: "🏆", kind: "direct", command: "gang", subcommand: "top" },
      { id: "map", label: "Карта районов", emoji: "🗺", kind: "direct", command: "gang", subcommand: "territories" },
      {
        id: "capture", label: "Захватить район", emoji: "⚔️", kind: "select", command: "gang",
        subcommand: "claimterritory",
        placeholder: "Какой район берём?",
        options: () => provide.districts(),
        build: (values) => ({ opts: { district: values[0] } }),
      },
      {
        id: "deposit", label: "Внести в казну", emoji: "💵", kind: "modal", command: "gang",
        subcommand: "deposit",
        modalTitle: "Взнос в казну",
        fields: [{ id: "amount", label: "Сумма", style: "short", required: true }],
        build: (v) => ({ opts: { amount: Number(v.amount) } }),
      },
    ],
  },

  {
    id: "магазин",
    emoji: "🛍",
    title: "Магазин",
    description: "Косметика, оружие, кейсы, VIP и понты.",
    actions: [
      { id: "cosmetics", label: "Косметика", emoji: "✨", kind: "direct", command: "shopcosmetics" },
      { id: "collection", label: "Моя коллекция", emoji: "🎒", kind: "direct", command: "mycollection" },
      { id: "weaponshop", label: "Оружейный", emoji: "🔫", kind: "direct", command: "weaponshop" },
      {
        id: "buyweapon", label: "Купить оружие", emoji: "🛒", kind: "select", command: "buy",
        placeholder: "Выбери оружие",
        options: () => provide.weaponsToBuy(),
        build: (values) => ({ opts: { type: "weapon", id: values[0] } }),
      },
      { id: "crateodds", label: "Кейсы: шансы", emoji: "🎲", kind: "direct", command: "crate", subcommand: "odds" },
      {
        id: "cratebuy", label: "Открыть кейс", emoji: "📦", kind: "select", command: "crate",
        subcommand: "buy",
        placeholder: "Какой кейс открываем?",
        options: () => provide.crates(),
        build: (values) => ({ opts: { type: values[0] } }),
      },
      { id: "vipstatus", label: "VIP статус", emoji: "👑", kind: "direct", command: "vip", subcommand: "status" },
      { id: "vipperks", label: "VIP привилегии", emoji: "💎", kind: "direct", command: "vip", subcommand: "perks" },
      {
        id: "vipsub", label: "Оформить VIP", emoji: "🌟", kind: "select", command: "vip",
        subcommand: "subscribe",
        placeholder: "Какой тариф?",
        options: () => provide.vipTiers(),
        build: (values) => ({ opts: { tier: values[0] } }),
      },
      { id: "cratehistory", label: "История кейсов", emoji: "📜", kind: "direct", command: "crate", subcommand: "history" },
      { id: "flexboard", label: "Доска понтов", emoji: "🥂", kind: "direct", command: "flexboard" },
      {
        id: "burn", label: "Сжечь деньги", emoji: "🔥", kind: "modal", command: "burnmoney",
        modalTitle: "Сжечь деньги",
        fields: [{ id: "amount", label: "Сумма", style: "short", required: true }],
        build: (v) => ({ opts: { amount: Number(v.amount) } }),
      },
      {
        id: "champagne", label: "Шампанское", emoji: "🍾", kind: "modal", command: "champagne",
        modalTitle: "Заказать шампанское",
        fields: [{ id: "amount", label: "Сумма", style: "short", required: true }],
        build: (v) => ({ opts: { amount: Number(v.amount) } }),
      },
      {
        id: "donate", label: "Раздать чату", emoji: "💸", kind: "modal", command: "donatechat",
        modalTitle: "Раздача в чат",
        fields: [{ id: "amount", label: "Сумма", style: "short", required: true }],
        build: (v) => ({ opts: { amount: Number(v.amount) } }),
      },
      { id: "portfolio", label: "Портфолио понтов", emoji: "🧾", kind: "direct", command: "prestige", subcommand: "portfolio" },
      { id: "cosmeticshop", label: "Витрина", emoji: "🖼", kind: "direct", command: "shop" },
      {
        id: "buycosmetic", label: "Купить косметику", emoji: "🛍", kind: "chain", command: "buycosmetic",
        steps: [
          { kind: "select", placeholder: "Какая категория?", options: () => provide.cosmeticCategories() },
          {
            kind: "select", placeholder: "Что покупаем?",
            options: (db, userId, picks) => provide.cosmeticsInCategory(picks[0]),
            emptyText: "В этой категории пусто.",
          },
        ],
        build: (picks) => ({ opts: { id: picks[1] } }),
      },
      {
        id: "equip", label: "Надеть", emoji: "🎽", kind: "select", command: "equip",
        placeholder: "Что надеть?",
        options: (db, userId) => provide.ownedCosmetics(db, userId),
        emptyText: "У тебя пока нет косметики.",
        build: (values) => ({ opts: { id: values[0] } }),
      },
      {
        id: "unequip", label: "Снять", emoji: "🧺", kind: "select", command: "unequip",
        placeholder: "Что снять?",
        options: (db, userId) => provide.ownedCosmetics(db, userId),
        emptyText: "Ничего не надето.",
        build: (values) => ({ opts: { id: values[0] } }),
      },
      {
        id: "equipweapon", label: "Взять оружие", emoji: "🗡", kind: "select", command: "weapon",
        placeholder: "Какое оружие взять?",
        options: (db, userId) => provide.ownedWeapons(db, userId),
        emptyText: "В инвентаре нет оружия. Купи в оружейном.",
        build: (values) => ({ opts: { id: values[0] } }),
      },
    ],
  },
];

const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

function findAction(categoryId, actionId) {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return { category: null, action: null };
  return { category, action: category.actions.find((a) => a.id === actionId) || null };
}

// -- Rendering ----------------------------------------------------------------

function buildPanel(category) {
  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.title}`)
    .setDescription(`${category.description}\n\nВыбери действие кнопкой ниже.`)
    .setColor(0x1abc9c)
    .setFooter({ text: "/play — игровой хаб" });

  const rows = [];
  const actions = category.actions.slice(0, BUTTONS_PER_ROW * MAX_BUTTON_ROWS);
  for (let i = 0; i < actions.length; i += BUTTONS_PER_ROW) {
    const row = new ActionRowBuilder();
    for (const action of actions.slice(i, i + BUTTONS_PER_ROW)) {
      const button = new ButtonBuilder()
        .setCustomId(`${PREFIX}:a:${category.id}:${action.id}`)
        .setLabel(action.label)
        .setStyle(action.kind === "direct" ? ButtonStyle.Primary : ButtonStyle.Secondary);
      if (action.emoji) button.setEmoji(action.emoji);
      row.addComponents(button);
    }
    rows.push(row);
  }

  return { embeds: [embed], components: rows };
}

function toSelectOptions(options) {
  return options.map((o) => ({
    label: String(o.label).slice(0, 100),
    value: String(o.value).slice(0, 100),
    description: o.description ? String(o.description).slice(0, 100) : undefined,
  }));
}

function buildSelectRow(category, action, options) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:s:${category.id}:${action.id}`)
    .setPlaceholder(action.placeholder || "Выбери вариант")
    .addOptions(toSelectOptions(options));
  return new ActionRowBuilder().addComponents(menu);
}

// Chain state travels in the custom id: play:c:<cat>:<action>:<step>:<a|b|c>.
// Discord rejects ids longer than 100 characters, so the picks are short
// catalogue ids rather than labels.
const CUSTOM_ID_MAX = 100;

function buildChainCustomId(category, action, stepIndex, picks) {
  const id = `${PREFIX}:c:${category.id}:${action.id}:${stepIndex}:${picks.join("|")}`;
  if (id.length > CUSTOM_ID_MAX) {
    throw new Error(`play-hub: custom id ${id.length} chars exceeds ${CUSTOM_ID_MAX}`);
  }
  return id;
}

function buildChainSelectRow(category, action, stepIndex, picks, step, options) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildChainCustomId(category, action, stepIndex, picks))
    .setPlaceholder(step.placeholder || "Выбери вариант")
    .addOptions(toSelectOptions(options));
  return new ActionRowBuilder().addComponents(menu);
}

function buildChainModal(category, action, stepIndex, picks, step) {
  const modal = new ModalBuilder()
    .setCustomId(buildChainCustomId(category, action, stepIndex, picks))
    .setTitle(step.modalTitle || action.label);

  for (const field of step.fields || []) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(String(field.label).slice(0, 45))
      .setStyle(field.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required !== false);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function buildUserRow(category, action) {
  const menu = new UserSelectMenuBuilder()
    .setCustomId(`${PREFIX}:u:${category.id}:${action.id}`)
    .setPlaceholder(action.placeholder || "Выбери игрока")
    .setMinValues(1)
    .setMaxValues(1);
  return new ActionRowBuilder().addComponents(menu);
}

function buildModal(category, action) {
  const modal = new ModalBuilder()
    .setCustomId(`${PREFIX}:m:${category.id}:${action.id}`)
    .setTitle(action.modalTitle || action.label);

  for (const field of action.fields || []) {
    const input = new TextInputBuilder()
      .setCustomId(field.id)
      .setLabel(String(field.label).slice(0, 45))
      .setStyle(field.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required !== false);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

// -- Command ------------------------------------------------------------------

function getPlayCommandBuilder() {
  const builder = new SlashCommandBuilder()
    .setName("play")
    .setDescription("SAMP Life — игровой хаб: работа, транспорт, бизнес, криминал и другое");

  for (const category of CATEGORIES) {
    builder.addSubcommand((s) =>
      s.setName(category.id).setDescription(`${category.title} — ${category.description}`.slice(0, 100))
    );
  }
  return builder;
}

async function handlePlayCommand(interaction, db) {
  const sub = interaction.options.getSubcommand(false);
  const category = CATEGORY_BY_ID.get(sub);
  if (!category) {
    await interaction.reply({ content: "Неизвестная категория.", ephemeral: true });
    return;
  }
  await interaction.reply(buildPanel(category));
}

// -- Component routing --------------------------------------------------------

function parseCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 4) return null;

  if (parts[1] === "c") {
    const step = Number(parts[4]);
    const picks = parts.slice(5).join(":");
    return {
      type: "c",
      categoryId: parts[2],
      actionId: parts[3],
      step: Number.isFinite(step) ? step : 0,
      picks: picks ? picks.split("|") : [],
    };
  }
  return { type: parts[1], categoryId: parts[2], actionId: parts.slice(3).join(":") };
}

/**
 * Render step `stepIndex` of a chain action, or run the command once the steps
 * are exhausted. `picks` carries the values chosen in the preceding steps.
 * `inPlace` updates the existing ephemeral message instead of opening a new one.
 */
async function advanceChain(interaction, db, category, action, stepIndex, picks, inPlace) {
  const step = action.steps[stepIndex];

  if (!step) {
    const { opts } = action.build(picks, {});
    await runCommand(interaction, db, action.command, opts, action.subcommand || null);
    return;
  }

  if (step.kind === "modal") {
    await interaction.showModal(buildChainModal(category, action, stepIndex, picks, step));
    return;
  }

  const options = await step.options(db, interaction.user.id, picks);
  if (!options || options.length === 0) {
    const content = step.emptyText || "Пока нечего выбирать.";
    if (inPlace) await interaction.update({ content, components: [] });
    else await interaction.reply({ content, ephemeral: true });
    return;
  }

  const content = `${action.emoji || ""} ${action.label}`.trim();
  const components = [buildChainSelectRow(category, action, stepIndex, picks, step, options)];
  if (inPlace) await interaction.update({ content, components });
  else await interaction.reply({ content, components, ephemeral: true });
}

/**
 * Handle every /play component interaction (button, select, user select, modal).
 * Returns true when the interaction belonged to this module.
 */
async function handlePlayComponent(interaction, db) {
  const isComponent =
    interaction.isButton?.()
    || interaction.isStringSelectMenu?.()
    || interaction.isUserSelectMenu?.()
    || interaction.isModalSubmit?.();
  if (!isComponent) return false;

  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;

  const { category, action } = findAction(parsed.categoryId, parsed.actionId);
  if (!category || !action) {
    await interaction.reply({ content: "Это действие больше недоступно.", ephemeral: true }).catch(() => {});
    return true;
  }

  try {
    // Step 1: a button either runs immediately or asks for input.
    if (parsed.type === "a") {
      if (action.kind === "direct") {
        await runCommand(interaction, db, action.command, {}, action.subcommand || null);
        return true;
      }

      if (action.kind === "modal") {
        await interaction.showModal(buildModal(category, action));
        return true;
      }

      if (action.kind === "chain") {
        await advanceChain(interaction, db, category, action, 0, [], false);
        return true;
      }

      if (action.kind === "user") {
        await interaction.reply({
          content: `${action.emoji || ""} ${action.label}`.trim(),
          components: [buildUserRow(category, action)],
          ephemeral: true,
        });
        return true;
      }

      if (action.kind === "select") {
        const options = await action.options(db, interaction.user.id);
        if (!options || options.length === 0) {
          await interaction.reply({
            content: action.emptyText || "Пока нечего выбирать.",
            ephemeral: true,
          });
          return true;
        }
        await interaction.reply({
          content: `${action.emoji || ""} ${action.label}`.trim(),
          components: [buildSelectRow(category, action, options)],
          ephemeral: true,
        });
        return true;
      }

      return true;
    }

    // Step 2: the player supplied the input — run the real handler.
    if (parsed.type === "s") {
      const { opts } = action.build(interaction.values);
      await runCommand(interaction, db, action.command, opts, action.subcommand || null);
      return true;
    }

    if (parsed.type === "u") {
      const user = interaction.users?.first?.() || null;
      if (!user) {
        await interaction.reply({ content: "Игрок не выбран.", ephemeral: true });
        return true;
      }
      const { opts } = action.build(user);
      await runCommand(interaction, db, action.command, opts, action.subcommand || null);
      return true;
    }

    if (parsed.type === "m") {
      const values = {};
      for (const field of action.fields || []) {
        values[field.id] = interaction.fields.getTextInputValue(field.id);
      }
      const { opts } = action.build(values);
      await runCommand(interaction, db, action.command, opts, action.subcommand || null);
      return true;
    }

    // Step 2..N of a chain: either collect the next pick or finish on a modal.
    if (parsed.type === "c") {
      const step = action.steps?.[parsed.step];
      if (!step) {
        await interaction.reply({ content: "Это действие больше недоступно.", ephemeral: true });
        return true;
      }

      if (interaction.isModalSubmit?.()) {
        const values = {};
        for (const field of step.fields || []) {
          values[field.id] = interaction.fields.getTextInputValue(field.id);
        }
        const { opts } = action.build(parsed.picks, values);
        await runCommand(interaction, db, action.command, opts, action.subcommand || null);
        return true;
      }

      const picks = [...parsed.picks, interaction.values[0]];
      await advanceChain(interaction, db, category, action, parsed.step + 1, picks, true);
      return true;
    }

    return true;
  } catch (err) {
    console.error(`[play-hub] ${parsed.categoryId}/${parsed.actionId} failed:`, err?.message || err);
    const msg = { content: "Не удалось выполнить действие. Попробуй ещё раз.", ephemeral: true };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch (_) { /* interaction already consumed */ }
    return true;
  }
}

module.exports = {
  PREFIX,
  CATEGORIES,
  getPlayCommandBuilder,
  handlePlayCommand,
  handlePlayComponent,
  shimInteraction,
  runCommand,
};
