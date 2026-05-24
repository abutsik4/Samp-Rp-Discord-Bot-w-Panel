"use strict";

/**
 * SAMP Life — Prestige & Money Sinks module.
 *
 * Adds four big money sinks for whales:
 *   1. Social flex commands  (/burnmoney, /champagne, /donatechat, /flexboard)
 *   2. Mansions & Aircraft   (/realestate, /buymansion, /buyaircraft, /estate)
 *   3. Stock market          (/stocks, /buystock, /sellstock, /portfolio)
 *   4. Crew & staff          (/hire, /fire, /crew) + bodyguard intercept hook
 *
 * All player-facing text is in Russian. Money operations use the canonical
 * samp_users / samp_ledger schema and the withSerializedTransaction helper.
 */

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");
const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");
const { touchSampUserSeenAt } = require("./samp-life");
const {
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
  getChampagneTier,
} = require("./constants/prestige");

// ═══════════════════════════════════════════════════════════════
// LOCAL HELPERS (mirror samp-extended.js patterns)
// ═══════════════════════════════════════════════════════════════

function fmtMoney(n) { return `${Number(n || 0).toLocaleString("ru-RU")} $`; }
function nowMs() { return Date.now(); }
function nowIso() { return new Date().toISOString(); }
function todayUtcDate() { return new Date().toISOString().slice(0, 10); }
function randInt(min, max) {
  const lo = Math.ceil(Number(min));
  const hi = Math.floor(Number(max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function makeInteractionOpKey(interaction, suffix = "") {
  const base = String(interaction?.id || interaction?.token || "").trim();
  if (!base) return null;
  return suffix ? `${base}:${suffix}` : base;
}

async function withTx(db, fn) { return withSerializedTransaction(db, fn); }

// --- Cooldown helpers (re-uses existing samp_cooldowns table from samp-life) ---
async function getCooldown(db, userId, action) {
  const row = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?", [String(userId), String(action)]);
  return Number(row?.ready_at || 0);
}
async function setCooldown(db, userId, action, readyAt) {
  await dbRun(
    db,
    `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)
     ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`,
    [String(userId), String(action), Number(readyAt)]
  );
}
function msToHumanShort(ms) {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} с`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  const remM = m - h * 60;
  return remM > 0 ? `${h} ч ${remM} мин` : `${h} ч`;
}
async function checkAndSetActionCooldown(interaction, db, userId, action, cooldownMs) {
  const ready = await getCooldown(db, userId, action);
  const now = nowMs();
  if (ready > now) {
    await interaction.reply({
      content: `⏳ Подожди ещё **${msToHumanShort(ready - now)}** перед следующей командой \`${action}\`.`,
      ephemeral: true,
    });
    return false;
  }
  await setCooldown(db, userId, action, now + cooldownMs);
  return true;
}

async function getSampUser(db, uid) {
  return dbGet(db, "SELECT * FROM samp_users WHERE user_id = ?", [String(uid)]);
}

async function adjustMoney(db, uid, delta) {
  await dbRun(
    db,
    `UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`,
    [Number(delta), String(uid)]
  );
}

async function addLedger(db, type, from, to, amount, meta = {}) {
  await dbRun(
    db,
    `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json) VALUES(?, ?, ?, ?, ?)`,
    [type, from ? String(from) : null, to ? String(to) : null, Number(amount), JSON.stringify(meta)]
  );
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

// ═══════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════

async function ensurePrestigeTables(db) {
  // Mansions
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_mansions (
      user_id     TEXT PRIMARY KEY,
      mansion_id  TEXT NOT NULL,
      bought_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Aircraft (one user can own multiple)
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_aircraft (
      user_id      TEXT NOT NULL,
      aircraft_id  TEXT NOT NULL,
      bought_at    TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, aircraft_id)
    )
  `);

  // Stocks: per-user holdings
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_stocks (
      user_id   TEXT NOT NULL,
      ticker    TEXT NOT NULL,
      shares    INTEGER NOT NULL DEFAULT 0,
      avg_cost  REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, ticker)
    )
  `);

  // Current price per ticker
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_stock_prices (
      ticker      TEXT PRIMARY KEY,
      price       REAL NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Tick history (for sparkline / analytics)
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_stock_history (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker  TEXT NOT NULL,
      price   REAL NOT NULL,
      ts      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_stock_history_ticker_ts ON samp_stock_history(ticker, ts DESC)`);

  // Daily trade volume cap
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_stock_daily_volume (
      user_id  TEXT NOT NULL,
      ymd      TEXT NOT NULL,
      volume   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, ymd)
    )
  `);

  // Crew / staff
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_crew (
      user_id        TEXT NOT NULL,
      role_id        TEXT NOT NULL,
      hired_at       TEXT NOT NULL DEFAULT (datetime('now')),
      paid_through   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, role_id)
    )
  `);

  // Bodyguard intercept counters (per UTC day)
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_crew_intercepts (
      user_id  TEXT NOT NULL,
      ymd      TEXT NOT NULL,
      used     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, ymd)
    )
  `);

  // Flex log (for /flexboard leaderboard)
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS samp_flex_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    TEXT NOT NULL,
      action     TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      ts         TEXT NOT NULL DEFAULT (datetime('now')),
      meta_json  TEXT
    )
  `);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_flex_log_user_ts ON samp_flex_log(user_id, ts DESC)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_flex_log_ts ON samp_flex_log(ts DESC)`);

  // Seed stock prices if missing
  for (const ticker of Object.keys(STOCKS)) {
    const row = await dbGet(db, "SELECT ticker FROM samp_stock_prices WHERE ticker = ?", [ticker]);
    if (!row) {
      await dbRun(
        db,
        "INSERT INTO samp_stock_prices(ticker, price, updated_at) VALUES(?, ?, datetime('now'))",
        [ticker, STOCKS[ticker].basePrice]
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// MANSION / AIRCRAFT HELPERS
// ═══════════════════════════════════════════════════════════════

async function getUserMansion(db, userId) {
  const row = await dbGet(db, "SELECT mansion_id FROM samp_mansions WHERE user_id = ?", [String(userId)]);
  if (!row) return null;
  return MANSIONS[row.mansion_id] || null;
}

async function getUserAircraft(db, userId) {
  const rows = await dbAll(db, "SELECT aircraft_id FROM samp_aircraft WHERE user_id = ? ORDER BY bought_at ASC", [String(userId)]);
  return (rows || []).map((r) => AIRCRAFT[r.aircraft_id]).filter(Boolean);
}

async function getUserPrestigeFlexScore(db, userId) {
  const mansion = await getUserMansion(db, userId);
  const aircraft = await getUserAircraft(db, userId);
  let score = 0;
  if (mansion) score += mansion.flexScore;
  for (const a of aircraft) score += a.flexScore;
  return score;
}

// ═══════════════════════════════════════════════════════════════
// STOCK HELPERS
// ═══════════════════════════════════════════════════════════════

async function getStockPrice(db, ticker) {
  const row = await dbGet(db, "SELECT price FROM samp_stock_prices WHERE ticker = ?", [String(ticker)]);
  if (!row) return STOCKS[ticker]?.basePrice || 0;
  return Number(row.price);
}

async function getAllStockPrices(db) {
  const rows = await dbAll(db, "SELECT ticker, price, updated_at FROM samp_stock_prices");
  const map = new Map();
  for (const r of rows || []) map.set(r.ticker, { price: Number(r.price), updated_at: r.updated_at });
  return map;
}

async function getUserPortfolio(db, userId) {
  const rows = await dbAll(
    db,
    "SELECT ticker, shares, avg_cost FROM samp_stocks WHERE user_id = ? AND shares > 0 ORDER BY ticker",
    [String(userId)]
  );
  return rows || [];
}

async function getUserDailyVolume(db, userId) {
  const row = await dbGet(
    db,
    "SELECT volume FROM samp_stock_daily_volume WHERE user_id = ? AND ymd = ?",
    [String(userId), todayUtcDate()]
  );
  return Number(row?.volume || 0);
}

async function bumpUserDailyVolume(db, userId, amount) {
  await dbRun(
    db,
    `INSERT INTO samp_stock_daily_volume(user_id, ymd, volume) VALUES(?, ?, ?)
     ON CONFLICT(user_id, ymd) DO UPDATE SET volume = volume + excluded.volume`,
    [String(userId), todayUtcDate(), Number(amount)]
  );
}

// ═══════════════════════════════════════════════════════════════
// CREW HELPERS
// ═══════════════════════════════════════════════════════════════

async function getUserCrew(db, userId) {
  const rows = await dbAll(db, "SELECT role_id, hired_at, paid_through FROM samp_crew WHERE user_id = ?", [String(userId)]);
  return (rows || []).map((r) => ({
    role: CREW_ROLES[r.role_id],
    role_id: r.role_id,
    hired_at: r.hired_at,
    paid_through: Number(r.paid_through || 0),
  })).filter((r) => r.role);
}

async function userHasCrewRole(db, userId, roleId) {
  const row = await dbGet(
    db,
    "SELECT role_id, paid_through FROM samp_crew WHERE user_id = ? AND role_id = ?",
    [String(userId), String(roleId)]
  );
  if (!row) return false;
  // Active if paid_through > now (we leave dismissed/lapsed entries deleted)
  return Number(row.paid_through || 0) > nowMs();
}

/**
 * Try to consume a bodyguard / private_security intercept for `victimId`.
 * Returns { intercepted: true, role: "bodyguard"|"private_security", remaining: N }
 * or { intercepted: false, mitigated: 0|0.5 }.
 *
 * - bodyguard: blocks 1 PvP rob attempt per UTC day.
 * - private_security: blocks up to 3 attempts/day; if no intercept available,
 *   loot still halved by caller (see returned `mitigated`).
 *
 * Called from samp-life.js handleRob inside the PvP branch.
 */
async function consumeBodyguardIntercept(db, victimId) {
  const hasPS = await userHasCrewRole(db, victimId, "private_security");
  const hasBG = await userHasCrewRole(db, victimId, "bodyguard");
  if (!hasPS && !hasBG) return { intercepted: false, mitigated: 0 };

  const dailyCap = hasPS ? 3 : 1;
  const ymd = todayUtcDate();

  let consumed = false;
  await withTx(db, async () => {
    const row = await dbGet(
      db,
      "SELECT used FROM samp_crew_intercepts WHERE user_id = ? AND ymd = ?",
      [String(victimId), ymd]
    );
    const used = Number(row?.used || 0);
    if (used >= dailyCap) return;
    if (row) {
      await dbRun(
        db,
        "UPDATE samp_crew_intercepts SET used = used + 1 WHERE user_id = ? AND ymd = ?",
        [String(victimId), ymd]
      );
    } else {
      await dbRun(
        db,
        "INSERT INTO samp_crew_intercepts(user_id, ymd, used) VALUES(?, ?, 1)",
        [String(victimId), ymd]
      );
    }
    consumed = true;
  });

  if (consumed) {
    const after = await dbGet(
      db,
      "SELECT used FROM samp_crew_intercepts WHERE user_id = ? AND ymd = ?",
      [String(victimId), ymd]
    );
    return {
      intercepted: true,
      role: hasPS ? "private_security" : "bodyguard",
      remaining: Math.max(0, dailyCap - Number(after?.used || dailyCap)),
    };
  }

  // Daily cap exceeded — for private_security still mitigate loot 50%.
  return { intercepted: false, mitigated: hasPS ? 0.5 : 0 };
}

// ═══════════════════════════════════════════════════════════════
// SLASH COMMAND BUILDERS
// ═══════════════════════════════════════════════════════════════

function getPrestigeCommandBuilders() {
  return [
    // ─── Social flex ───
    new SlashCommandBuilder()
      .setName("burnmoney")
      .setDescription("SAMP Life: сжечь вирты публично — чистый понт")
      .addIntegerOption((o) =>
        o.setName("amount")
          .setDescription(`Сумма (от ${FLEX_BURN_MIN.toLocaleString("ru-RU")} до ${FLEX_BURN_MAX.toLocaleString("ru-RU")} $)`)
          .setRequired(true)
          .setMinValue(FLEX_BURN_MIN)
          .setMaxValue(FLEX_BURN_MAX)
      ),

    new SlashCommandBuilder()
      .setName("champagne")
      .setDescription("SAMP Life: заказать шампанское на весь клуб")
      .addIntegerOption((o) =>
        o.setName("amount")
          .setDescription(`Сумма (от ${FLEX_CHAMPAGNE_MIN.toLocaleString("ru-RU")} $)`)
          .setRequired(true)
          .setMinValue(FLEX_CHAMPAGNE_MIN)
          .setMaxValue(FLEX_CHAMPAGNE_MAX)
      ),

    new SlashCommandBuilder()
      .setName("donatechat")
      .setDescription("SAMP Life: раздать вирты случайным активным игрокам в чате")
      .addIntegerOption((o) =>
        o.setName("amount")
          .setDescription(`Сумма (от ${FLEX_DONATE_MIN.toLocaleString("ru-RU")} $)`)
          .setRequired(true)
          .setMinValue(FLEX_DONATE_MIN)
          .setMaxValue(FLEX_DONATE_MAX)
      ),

    new SlashCommandBuilder()
      .setName("flexboard")
      .setDescription("SAMP Life: рейтинг главных понтярщиков (по сожжённым/пожертвованным виртам)"),

    // ─── Real estate ───
    new SlashCommandBuilder()
      .setName("realestate")
      .setDescription("SAMP Life: каталог особняков"),

    new SlashCommandBuilder()
      .setName("buymansion")
      .setDescription("SAMP Life: купить особняк (заменяет текущий, без возврата)")
      .addStringOption((o) => {
        const opt = o.setName("mansion").setDescription("Какой особняк").setRequired(true);
        for (const m of Object.values(MANSIONS)) {
          opt.addChoices({ name: `${m.emoji} ${m.name} — ${m.price.toLocaleString("ru-RU")} $`, value: m.id });
        }
        return opt;
      }),

    new SlashCommandBuilder()
      .setName("buyaircraft")
      .setDescription("SAMP Life: купить летающую технику")
      .addStringOption((o) => {
        const opt = o.setName("aircraft").setDescription("Какая техника").setRequired(true);
        for (const a of Object.values(AIRCRAFT)) {
          opt.addChoices({ name: `${a.emoji} ${a.name} — ${a.price.toLocaleString("ru-RU")} $`, value: a.id });
        }
        return opt;
      }),

    new SlashCommandBuilder()
      .setName("airjob")
      .setDescription("SAMP Life: выполнить воздушный рейс на своём борту (свой кулдаун у каждой техники)")
      .addStringOption((o) => {
        const opt = o.setName("aircraft").setDescription("На каком борту летим").setRequired(true);
        for (const a of Object.values(AIRCRAFT)) {
          if (!a.job) continue;
          const cdMin = Math.round(a.job.cooldownMs / 60_000);
          opt.addChoices({
            name: `${a.emoji} ${a.name} — ${a.job.payMin.toLocaleString("ru-RU")}–${a.job.payMax.toLocaleString("ru-RU")} $ • ${cdMin} мин`,
            value: a.id,
          });
        }
        return opt;
      }),

    new SlashCommandBuilder()
      .setName("mansion-collect")
      .setDescription("SAMP Life: собрать суточную аренду с особняка"),

    new SlashCommandBuilder()
      .setName("estate")
      .setDescription("SAMP Life: показать своё или чужое поместье и технику")
      .addUserOption((o) => o.setName("user").setDescription("Чей профиль смотрим").setRequired(false)),

    // ─── Stock market ───
    new SlashCommandBuilder()
      .setName("stocks")
      .setDescription("SAMP Life: курс акций на бирже Лос-Сантоса"),

    new SlashCommandBuilder()
      .setName("buystock")
      .setDescription("SAMP Life: купить акции (комиссия 2%)")
      .addStringOption((o) => {
        const opt = o.setName("ticker").setDescription("Тикер").setRequired(true);
        for (const s of Object.values(STOCKS)) {
          opt.addChoices({ name: `${s.emoji} ${s.ticker} — ${s.name}`, value: s.ticker });
        }
        return opt;
      })
      .addIntegerOption((o) =>
        o.setName("shares").setDescription("Сколько акций").setRequired(true).setMinValue(1).setMaxValue(1_000_000)
      ),

    new SlashCommandBuilder()
      .setName("sellstock")
      .setDescription("SAMP Life: продать акции (комиссия 2%)")
      .addStringOption((o) => {
        const opt = o.setName("ticker").setDescription("Тикер").setRequired(true);
        for (const s of Object.values(STOCKS)) {
          opt.addChoices({ name: `${s.emoji} ${s.ticker} — ${s.name}`, value: s.ticker });
        }
        return opt;
      })
      .addIntegerOption((o) =>
        o.setName("shares").setDescription("Сколько акций").setRequired(true).setMinValue(1).setMaxValue(1_000_000)
      ),

    new SlashCommandBuilder()
      .setName("portfolio")
      .setDescription("SAMP Life: твой инвестиционный портфель")
      .addUserOption((o) => o.setName("user").setDescription("Чей портфель смотрим").setRequired(false)),

    // ─── Crew ───
    new SlashCommandBuilder()
      .setName("hire")
      .setDescription("SAMP Life: нанять персонал (есть зарплата раз в месяц)")
      .addStringOption((o) => {
        const opt = o.setName("role").setDescription("Кого нанимаем").setRequired(true);
        for (const r of Object.values(CREW_ROLES)) {
          opt.addChoices({
            name: `${r.emoji} ${r.name} — найм ${r.hireCost.toLocaleString("ru-RU")} $ • ЗП ${r.monthlySalary.toLocaleString("ru-RU")} $/мес`,
            value: r.id,
          });
        }
        return opt;
      }),

    new SlashCommandBuilder()
      .setName("fire")
      .setDescription("SAMP Life: уволить персонал")
      .addStringOption((o) => {
        const opt = o.setName("role").setDescription("Кого увольняем").setRequired(true);
        for (const r of Object.values(CREW_ROLES)) {
          opt.addChoices({ name: `${r.emoji} ${r.name}`, value: r.id });
        }
        return opt;
      }),

    new SlashCommandBuilder()
      .setName("crew")
      .setDescription("SAMP Life: твоя команда персонала"),
  ];
}

const PRESTIGE_COMMAND_NAMES = [
  "burnmoney", "champagne", "donatechat", "flexboard",
  "realestate", "buymansion", "buyaircraft", "airjob", "mansion-collect", "estate",
  "stocks", "buystock", "sellstock", "portfolio",
  "hire", "fire", "crew",
];

// ═══════════════════════════════════════════════════════════════
// HANDLERS — SOCIAL FLEX
// ═══════════════════════════════════════════════════════════════

async function handleBurnMoney(interaction, db) {
  const userId = interaction.user.id;
  const amount = interaction.options.getInteger("amount", true);

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }
  if (Number(user.money) < amount) {
    await interaction.reply({ content: `Не хватает виртов. На счету: **${fmtMoney(user.money)}**`, ephemeral: true });
    return;
  }
  if (!(await checkAndSetActionCooldown(interaction, db, userId, "burnmoney", FLEX_BURN_COOLDOWN_MS))) return;

  await withTx(db, async () => {
    const fresh = await getSampUser(db, userId);
    if (Number(fresh?.money || 0) < amount) throw new Error("INSUFFICIENT");
    await adjustMoney(db, userId, -amount);
    const inserted = await addLedgerUnique(db, "flex_burn", userId, null, amount, makeInteractionOpKey(interaction, "flex_burn"), {});
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await dbRun(db, `INSERT INTO samp_flex_log(user_id, action, amount, meta_json) VALUES(?, 'burn', ?, ?)`, [String(userId), Number(amount), JSON.stringify({})]);
  });

  const after = await getSampUser(db, userId);
  const flames = amount >= 50_000_000 ? "🔥🔥🔥🔥🔥" : amount >= 10_000_000 ? "🔥🔥🔥" : "🔥";
  const embed = new EmbedBuilder()
    .setTitle(`${flames} Сожжено ${fmtMoney(amount)} ${flames}`)
    .setDescription(`<@${userId}> демонстративно сжёг **${fmtMoney(amount)}** в бочке на парковке.\nДеньги превращаются в пепел и понт.`)
    .addFields({ name: "Остаток", value: `**${fmtMoney(after?.money || 0)}**`, inline: true })
    .setColor(0xe67e22)
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed] });
}

async function handleChampagne(interaction, db) {
  const userId = interaction.user.id;
  const amount = interaction.options.getInteger("amount", true);

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }
  if (Number(user.money) < amount) {
    await interaction.reply({ content: `Не хватает виртов. На счету: **${fmtMoney(user.money)}**`, ephemeral: true });
    return;
  }

  const tier = getChampagneTier(amount);
  if (!(await checkAndSetActionCooldown(interaction, db, userId, "champagne", FLEX_CHAMPAGNE_COOLDOWN_MS))) return;
  await withTx(db, async () => {
    const fresh = await getSampUser(db, userId);
    if (Number(fresh?.money || 0) < amount) throw new Error("INSUFFICIENT");
    await adjustMoney(db, userId, -amount);
    const inserted = await addLedgerUnique(db, "flex_champagne", userId, null, amount, makeInteractionOpKey(interaction, "flex_champagne"), { tier: tier.name });
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await dbRun(db, `INSERT INTO samp_flex_log(user_id, action, amount, meta_json) VALUES(?, 'champagne', ?, ?)`, [String(userId), Number(amount), JSON.stringify({ tier: tier.name })]);
  });

  const after = await getSampUser(db, userId);
  const embed = new EmbedBuilder()
    .setTitle(`${tier.emoji} ${tier.name} Champagne!`)
    .setDescription(
      `<@${userId}> заказывает шампанское на весь клуб — **${fmtMoney(amount)}**!\n` +
      `За счёт ${interaction.user.username}: **${fmtMoney(amount)}**. Вечеринка в полном разгаре.`
    )
    .addFields(
      { name: "Уровень", value: tier.name, inline: true },
      { name: "Остаток", value: `**${fmtMoney(after?.money || 0)}**`, inline: true },
    )
    .setColor(tier.color)
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed] });
}

async function handleDonateChat(interaction, db) {
  const userId = interaction.user.id;
  const amount = interaction.options.getInteger("amount", true);
  const guildId = interaction.guild?.id;

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }
  if (Number(user.money) < amount) {
    await interaction.reply({ content: `Не хватает виртов. На счету: **${fmtMoney(user.money)}**`, ephemeral: true });
    return;
  }
  if (!(await checkAndSetActionCooldown(interaction, db, userId, "donatechat", FLEX_DONATE_COOLDOWN_MS))) return;

  // Pick recently active SAMP users (touched in last 24h), excluding the donor.
  // Only users with FLEX_DONATE_MIN_GUILD_MESSAGES real chat messages in this
  // guild qualify — anti-alt-farming filter.
  const sinceMs = nowMs() - FLEX_DONATE_ACTIVE_WINDOW_HOURS * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString().slice(0, 19).replace("T", " ");

  let candidates;
  if (guildId) {
    candidates = await dbAll(
      db,
      `SELECT u.user_id
         FROM samp_users u
         JOIN user_stats s ON s.user_id = u.user_id AND s.guild_id = ?
        WHERE u.user_id <> ?
          AND u.last_samp_seen_at IS NOT NULL
          AND u.last_samp_seen_at >= ?
          AND s.message_count >= ?
        ORDER BY u.last_samp_seen_at DESC
        LIMIT 50`,
      [String(guildId), String(userId), sinceIso, FLEX_DONATE_MIN_GUILD_MESSAGES]
    );
  } else {
    // No guild context (DM): refuse — flex commands must be in-guild anyway.
    await interaction.reply({ content: "❌ Эту команду можно использовать только на сервере.", ephemeral: true });
    return;
  }

  if (!candidates || candidates.length < FLEX_DONATE_MIN_RECIPIENTS) {
    await interaction.reply({
      content: `❌ В чате слишком мало активных игроков (нужно минимум **${FLEX_DONATE_MIN_RECIPIENTS}** с ${FLEX_DONATE_MIN_GUILD_MESSAGES}+ сообщений за 24ч). Нашлось: **${candidates?.length || 0}**.`,
      ephemeral: true,
    });
    return;
  }

  // Shuffle + pick up to FLEX_DONATE_RECIPIENTS
  const pool = candidates.map((r) => r.user_id);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const recipients = pool.slice(0, Math.min(FLEX_DONATE_RECIPIENTS, pool.length));
  if (recipients.length < FLEX_DONATE_MIN_RECIPIENTS) {
    await interaction.reply({
      content: `❌ Активных получателей меньше минимума (**${FLEX_DONATE_MIN_RECIPIENTS}**). Попробуй позже.`,
      ephemeral: true,
    });
    return;
  }
  const perPerson = Math.floor(amount / recipients.length);
  if (perPerson <= 0) {
    await interaction.reply({ content: "Слишком маленькая сумма на такое количество получателей.", ephemeral: true });
    return;
  }
  const distributedTotal = perPerson * recipients.length;

  await withTx(db, async () => {
    const fresh = await getSampUser(db, userId);
    if (Number(fresh?.money || 0) < distributedTotal) throw new Error("INSUFFICIENT");
    await adjustMoney(db, userId, -distributedTotal);
    const insertedSrc = await addLedgerUnique(
      db, "flex_donate_src", userId, null, distributedTotal,
      makeInteractionOpKey(interaction, "flex_donate_src"),
      { recipients: recipients.length, per_person: perPerson }
    );
    if (!insertedSrc) throw new Error("DUPLICATE_OPERATION");
    for (const rid of recipients) {
      await adjustMoney(db, rid, perPerson);
      await addLedger(db, "flex_donate_in", userId, rid, perPerson, {});
    }
    await dbRun(db, `INSERT INTO samp_flex_log(user_id, action, amount, meta_json) VALUES(?, 'donate', ?, ?)`,
      [String(userId), Number(distributedTotal), JSON.stringify({ recipients: recipients.length, per_person: perPerson })]);
  });

  const after = await getSampUser(db, userId);
  const mentionLines = recipients.map((rid) => `• <@${rid}> +${fmtMoney(perPerson)}`).join("\n");
  const embed = new EmbedBuilder()
    .setTitle(`💸 Щедрая раздача от ${interaction.user.username}`)
    .setDescription(`<@${userId}> раздал **${fmtMoney(distributedTotal)}** на **${recipients.length}** активных игроков:\n${mentionLines}`)
    .addFields({ name: "Остаток", value: `**${fmtMoney(after?.money || 0)}**`, inline: true })
    .setColor(0x2ecc71)
    .setTimestamp(new Date());

  await interaction.reply({ embeds: [embed] });
}

async function handleFlexboard(interaction, db) {
  // Top 10 by total flex spend over all time (burn + champagne + donate)
  const rows = await dbAll(
    db,
    `SELECT user_id, SUM(amount) AS total, COUNT(*) AS events
       FROM samp_flex_log
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT 10`
  );
  if (!rows || rows.length === 0) {
    await interaction.reply({ content: "❌ Никто ещё не понтанул. Стань первым: /burnmoney, /champagne или /donatechat.", ephemeral: true });
    return;
  }
  const lines = rows.map((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;
    return `${medal} <@${r.user_id}> — **${fmtMoney(r.total)}** _(${r.events} раздач)_`;
  });
  const embed = new EmbedBuilder()
    .setTitle("👑 Доска понтярщиков SAMP Life")
    .setDescription(lines.join("\n"))
    .setColor(0xf1c40f)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS — REAL ESTATE
// ═══════════════════════════════════════════════════════════════

async function handleRealEstate(interaction, _db) {
  const lines = Object.values(MANSIONS)
    .sort((a, b) => a.price - b.price)
    .map((m) => {
      const b = m.bonuses || {};
      const bonusParts = [];
      if (b.workMultiplier) bonusParts.push(`+${Math.round(b.workMultiplier * 100)}% к /work`);
      if (b.cooldownMultiplier && b.cooldownMultiplier < 1) bonusParts.push(`−${Math.round((1 - b.cooldownMultiplier) * 100)}% кулдаун`);
      if (b.robLossMitigation) bonusParts.push(`−${Math.round(b.robLossMitigation * 100)}% потерь при /rob`);
      if (b.stashCapMultiplier && b.stashCapMultiplier > 1) bonusParts.push(`тайник ×${b.stashCapMultiplier.toFixed(1)}`);
      const rentLine = m.dailyRent ? `Аренда: **${fmtMoney(m.dailyRent)}**/сутки` : "";
      const bonusLine = bonusParts.length ? `Бонусы: ${bonusParts.join(" • ")}` : "";
      return `${m.emoji} **${m.name}** — _${m.district}_\n   ${m.description}\n   Цена: **${fmtMoney(m.price)}** • Понт: **${m.flexScore}**` +
        (rentLine ? `\n   ${rentLine}` : "") +
        (bonusLine ? `\n   ${bonusLine}` : "");
    });
  const aircraftLines = Object.values(AIRCRAFT)
    .sort((a, b) => a.price - b.price)
    .map((a) => {
      const j = a.job;
      const jobLine = j
        ? `\n   /airjob: **${j.payMin.toLocaleString("ru-RU")}–${j.payMax.toLocaleString("ru-RU")} $** каждые **${Math.round(j.cooldownMs / 60_000)} мин**` +
          (j.jailChance ? ` • ${Math.round(j.jailChance * 100)}% риск тюрьмы` : (j.incidentChance ? ` • ${Math.round(j.incidentChance * 100)}% риск ИНЦИДЕНТА` : ""))
        : "";
      return `${a.emoji} **${a.name}** — Цена: **${fmtMoney(a.price)}** • Понт: **${a.flexScore}**\n   ${a.description}${jobLine}`;
    });

  const embed = new EmbedBuilder()
    .setTitle("🏖️ Каталог недвижимости и техники")
    .setDescription("Особняки дают суточную аренду (`/mansion-collect`) и пассивные бонусы к /work и защите от /rob.\nТехника открывает `/airjob` — воздушные рейсы со своим кулдауном у каждого борта.")
    .addFields(
      { name: "🏠 Особняки", value: lines.join("\n\n"), inline: false },
      { name: "✈️ Воздух", value: aircraftLines.join("\n\n"), inline: false },
    )
    .setColor(0x9b59b6)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

async function handleBuyMansion(interaction, db) {
  const userId = interaction.user.id;
  const mansionId = interaction.options.getString("mansion", true);
  const mansion = MANSIONS[mansionId];
  if (!mansion) {
    await interaction.reply({ content: "❌ Такого особняка нет в каталоге.", ephemeral: true });
    return;
  }

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }

  const existing = await getUserMansion(db, userId);
  if (existing && existing.id === mansion.id) {
    await interaction.reply({ content: `У тебя уже есть **${mansion.name}**.`, ephemeral: true });
    return;
  }
  if (Number(user.money) < mansion.price) {
    await interaction.reply({ content: `Не хватает виртов. Нужно: **${fmtMoney(mansion.price)}**, у тебя: **${fmtMoney(user.money)}**`, ephemeral: true });
    return;
  }

  await withTx(db, async () => {
    // Re-check inside tx — prevents double-charge on concurrent /buymansion clicks.
    const existingRow = await dbGet(db, "SELECT mansion_id FROM samp_mansions WHERE user_id = ?", [String(userId)]);
    if (existingRow && existingRow.mansion_id === mansion.id) throw new Error("ALREADY_OWNED");
    const fresh = await getSampUser(db, userId);
    if (Number(fresh?.money || 0) < mansion.price) throw new Error("INSUFFICIENT");
    await adjustMoney(db, userId, -mansion.price);
    const inserted = await addLedgerUnique(
      db, "buy_mansion", userId, null, mansion.price,
      makeInteractionOpKey(interaction, "buy_mansion"),
      { mansion_id: mansion.id, replaced: existingRow?.mansion_id || null }
    );
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await dbRun(
      db,
      `INSERT INTO samp_mansions(user_id, mansion_id, bought_at) VALUES(?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET mansion_id = excluded.mansion_id, bought_at = excluded.bought_at`,
      [String(userId), mansion.id]
    );
  });

  const after = await getSampUser(db, userId);
  const note = existing ? `\nСтарый особняк (**${existing.name}**) продан без возврата.` : "";
  await interaction.reply(
    `${mansion.emoji} Поздравляем! Теперь **${mansion.name}** в _${mansion.district}_ принадлежит <@${userId}>.${note}\n` +
    `Списано: **${fmtMoney(mansion.price)}**. Остаток: **${fmtMoney(after?.money || 0)}**.`
  );
}

async function handleBuyAircraft(interaction, db) {
  const userId = interaction.user.id;
  const acId = interaction.options.getString("aircraft", true);
  const aircraft = AIRCRAFT[acId];
  if (!aircraft) {
    await interaction.reply({ content: "❌ Такой техники нет в каталоге.", ephemeral: true });
    return;
  }

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }

  const owned = await getUserAircraft(db, userId);
  if (owned.some((a) => a.id === aircraft.id)) {
    await interaction.reply({ content: `У тебя уже есть **${aircraft.name}**.`, ephemeral: true });
    return;
  }
  if (Number(user.money) < aircraft.price) {
    await interaction.reply({ content: `Не хватает виртов. Нужно: **${fmtMoney(aircraft.price)}**, у тебя: **${fmtMoney(user.money)}**`, ephemeral: true });
    return;
  }

  await withTx(db, async () => {
    // Re-check inside tx — prevents double-charge on concurrent /buyaircraft clicks.
    const existing = await dbGet(
      db,
      "SELECT aircraft_id FROM samp_aircraft WHERE user_id = ? AND aircraft_id = ?",
      [String(userId), String(aircraft.id)]
    );
    if (existing) throw new Error("ALREADY_OWNED");
    const fresh = await getSampUser(db, userId);
    if (Number(fresh?.money || 0) < aircraft.price) throw new Error("INSUFFICIENT");
    await adjustMoney(db, userId, -aircraft.price);
    const inserted = await addLedgerUnique(
      db, "buy_aircraft", userId, null, aircraft.price,
      makeInteractionOpKey(interaction, "buy_aircraft"),
      { aircraft_id: aircraft.id }
    );
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await dbRun(
      db,
      `INSERT INTO samp_aircraft(user_id, aircraft_id, bought_at) VALUES(?, ?, datetime('now'))`,
      [String(userId), aircraft.id]
    );
  });

  const after = await getSampUser(db, userId);
  await interaction.reply(
    `${aircraft.emoji} **${aircraft.name}** теперь в твоём ангаре, <@${userId}>!\n` +
    `Списано: **${fmtMoney(aircraft.price)}**. Остаток: **${fmtMoney(after?.money || 0)}**.`
  );
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS — AIRCRAFT JOBS
// ═══════════════════════════════════════════════════════════════

async function handleAirJob(interaction, db) {
  const userId = interaction.user.id;
  const acId = interaction.options.getString("aircraft", true);
  const aircraft = AIRCRAFT[acId];
  if (!aircraft || !aircraft.job) {
    await interaction.reply({ content: "❌ Такой техники нет в каталоге или у неё нет работ.", ephemeral: true });
    return;
  }

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }
  // Jail gate (mirror samp-life ensureNotJailed)
  if (Number(user.jail_until || 0) > nowMs()) {
    const left = Math.ceil((Number(user.jail_until) - nowMs()) / 1000);
    const leftMin = Math.ceil(left / 60);
    await interaction.reply({
      content: `🚔 Ты в тюрьме ещё **${leftMin} мин**. Полёты подождут.`,
      ephemeral: true,
    });
    return;
  }

  // Ownership pre-check
  const ownsRow = await dbGet(
    db,
    "SELECT aircraft_id FROM samp_aircraft WHERE user_id = ? AND aircraft_id = ?",
    [String(userId), String(aircraft.id)]
  );
  if (!ownsRow) {
    await interaction.reply({
      content: `❌ У тебя нет **${aircraft.name}** в ангаре. Купи через /buyaircraft.`,
      ephemeral: true,
    });
    return;
  }

  const cdAction = `airjob:${aircraft.id}`;
  if (!(await checkAndSetActionCooldown(interaction, db, userId, cdAction, aircraft.job.cooldownMs))) return;

  const job = aircraft.job;
  const roll = Math.random();
  const jailChance = Number(job.jailChance || 0);
  const incidentChance = Number(job.incidentChance || 0);
  const opKey = makeInteractionOpKey(interaction, `airjob:${aircraft.id}`);

  // Decide outcome
  let outcome;
  if (jailChance > 0 && roll < jailChance) outcome = "jail";
  else if (incidentChance > 0 && roll < jailChance + incidentChance) outcome = "incident";
  else outcome = "success";

  let resultText = "";

  if (outcome === "jail") {
    const fine = randInt(job.jailFineMin, job.jailFineMax);
    const jailUntil = nowMs() + Number(job.jailMs || 0);
    const line = pick(job.jailLines || ["арестован при посадке"]);
    await withTx(db, async () => {
      const fresh = await getSampUser(db, userId);
      // Re-check ownership (race-safe)
      const stillOwns = await dbGet(
        db,
        "SELECT 1 FROM samp_aircraft WHERE user_id = ? AND aircraft_id = ?",
        [String(userId), String(aircraft.id)]
      );
      if (!stillOwns) throw new Error("ALREADY_OWNED"); // means: no longer owns (sold)
      const fineActual = Math.min(Number(fresh?.money || 0), fine);
      if (fineActual > 0) await adjustMoney(db, userId, -fineActual);
      await dbRun(
        db,
        `UPDATE samp_users SET jail_until = ?, updated_at = datetime('now') WHERE user_id = ?`,
        [Number(jailUntil), String(userId)]
      );
      const inserted = await addLedgerUnique(
        db, "airjob_jail", userId, null, fineActual, opKey,
        { aircraft: aircraft.id, line, jailMs: job.jailMs }
      );
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
    });
    const after = await getSampUser(db, userId);
    resultText =
      `${aircraft.emoji} ${line}.\n` +
      `Штраф: **−${fmtMoney(fine)}**. Тюрьма на **${Math.ceil(Number(job.jailMs || 0) / 60_000)} мин**.\n` +
      `Баланс: **${fmtMoney(after?.money || 0)}**.`;
  } else if (outcome === "incident") {
    const penalty = randInt(job.incidentPenaltyMin, job.incidentPenaltyMax);
    const line = pick(job.incidentLines || ["неудачный рейс"]);
    await withTx(db, async () => {
      const fresh = await getSampUser(db, userId);
      const stillOwns = await dbGet(
        db,
        "SELECT 1 FROM samp_aircraft WHERE user_id = ? AND aircraft_id = ?",
        [String(userId), String(aircraft.id)]
      );
      if (!stillOwns) throw new Error("ALREADY_OWNED");
      const penaltyActual = Math.min(Number(fresh?.money || 0), penalty);
      if (penaltyActual > 0) await adjustMoney(db, userId, -penaltyActual);
      const inserted = await addLedgerUnique(
        db, "airjob_incident", userId, null, penaltyActual, opKey,
        { aircraft: aircraft.id, line }
      );
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
    });
    const after = await getSampUser(db, userId);
    resultText =
      `${aircraft.emoji} ${line}.\n` +
      `Потери: **−${fmtMoney(penalty)}**.\n` +
      `Баланс: **${fmtMoney(after?.money || 0)}**.`;
  } else {
    const pay = randInt(job.payMin, job.payMax);
    const line = pick(job.jobLines || ["выполнил рейс"]);
    await withTx(db, async () => {
      const stillOwns = await dbGet(
        db,
        "SELECT 1 FROM samp_aircraft WHERE user_id = ? AND aircraft_id = ?",
        [String(userId), String(aircraft.id)]
      );
      if (!stillOwns) throw new Error("ALREADY_OWNED");
      await adjustMoney(db, userId, pay);
      const inserted = await addLedgerUnique(
        db, "airjob", null, userId, pay, opKey,
        { aircraft: aircraft.id, line }
      );
      if (!inserted) throw new Error("DUPLICATE_OPERATION");
      try { const { awardMaterialDrops } = require("./phasec-utils"); await awardMaterialDrops(db, userId, "airjob"); } catch (_e) {}
    });
    const after = await getSampUser(db, userId);
    resultText =
      `${aircraft.emoji} ${line}.\n` +
      `Заработал: **+${fmtMoney(pay)}**.\n` +
      `Баланс: **${fmtMoney(after?.money || 0)}**.`;
  }

  await interaction.reply(resultText);
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS — MANSION RENT
// ═══════════════════════════════════════════════════════════════

async function handleMansionCollect(interaction, db) {
  const userId = interaction.user.id;
  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }
  const mansion = await getUserMansion(db, userId);
  if (!mansion) {
    await interaction.reply({
      content: "❌ У тебя нет особняка. Сначала купи через /buymansion.",
      ephemeral: true,
    });
    return;
  }
  if (!Number(mansion.dailyRent)) {
    await interaction.reply({ content: "❌ С этого особняка нечего собирать.", ephemeral: true });
    return;
  }

  if (!(await checkAndSetActionCooldown(interaction, db, userId, "mansion_rent", MANSION_RENT_COOLDOWN_MS))) return;

  const opKey = makeInteractionOpKey(interaction, "mansion_rent");
  const rent = Number(mansion.dailyRent);
  await withTx(db, async () => {
    // Re-fetch mansion inside tx in case user replaced it.
    const row = await dbGet(db, "SELECT mansion_id FROM samp_mansions WHERE user_id = ?", [String(userId)]);
    const m = row ? MANSIONS[row.mansion_id] : null;
    if (!m) throw new Error("ALREADY_OWNED"); // generic "no mansion now" — message reused
    const rentNow = Number(m.dailyRent || 0);
    if (rentNow <= 0) throw new Error("INSUFFICIENT");
    await adjustMoney(db, userId, rentNow);
    const inserted = await addLedgerUnique(
      db, "mansion_rent", null, userId, rentNow, opKey,
      { mansion_id: m.id }
    );
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
  });
  const after = await getSampUser(db, userId);
  await interaction.reply(
    `${mansion.emoji} Аренда с **${mansion.name}**: получено **+${fmtMoney(rent)}**.\n` +
    `Баланс: **${fmtMoney(after?.money || 0)}**. Следующий сбор примерно через 23 часа.`
  );
}

async function handleEstate(interaction, db) {
  const target = interaction.options.getUser("user") || interaction.user;
  const mansion = await getUserMansion(db, target.id);
  const aircraft = await getUserAircraft(db, target.id);
  const flex = await getUserPrestigeFlexScore(db, target.id);

  const fields = [];
  fields.push({
    name: "🏠 Резиденция",
    value: mansion
      ? `${mansion.emoji} **${mansion.name}** _(${mansion.district})_` +
        (mansion.dailyRent ? `\n💵 Аренда: **${fmtMoney(mansion.dailyRent)}**/сутки — собирается через **/mansion-collect**` : "")
      : "—",
    inline: false,
  });
  fields.push({
    name: "✈️ Ангар",
    value: aircraft.length > 0
      ? aircraft.map((a) => {
          const j = a.job;
          const jobLine = j ? ` _(/airjob: ${j.payMin.toLocaleString("ru-RU")}–${j.payMax.toLocaleString("ru-RU")} $ / ${Math.round(j.cooldownMs / 60_000)} мин)_` : "";
          return `${a.emoji} **${a.name}**${jobLine}`;
        }).join("\n")
      : "—",
    inline: false,
  });
  fields.push({ name: "👑 Понт-очки", value: `**${flex}**`, inline: true });

  const embed = new EmbedBuilder()
    .setTitle(`Поместье ${target.username}`)
    .setDescription(`<@${target.id}>`)
    .addFields(fields)
    .setColor(0x9b59b6)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS — STOCKS
// ═══════════════════════════════════════════════════════════════

async function handleStocks(interaction, db) {
  const prices = await getAllStockPrices(db);
  const rows = [];
  for (const ticker of Object.keys(STOCKS)) {
    const meta = STOCKS[ticker];
    const cur = prices.get(ticker)?.price || meta.basePrice;
    const delta = ((cur - meta.basePrice) / meta.basePrice) * 100;
    const arrow = delta >= 0 ? "🟢▲" : "🔴▼";
    rows.push(`${meta.emoji} **${ticker}** — ${meta.name}\n   Курс: **${fmtMoney(cur)}** ${arrow} ${delta.toFixed(2)}% от базы`);
  }
  const embed = new EmbedBuilder()
    .setTitle("📈 Биржа Лос-Сантоса")
    .setDescription(`Комиссия **${(STOCK_COMMISSION_PCT * 100).toFixed(0)}%** на все сделки. Лимит: **${fmtMoney(STOCK_MAX_TRADE_AMOUNT)}** за сделку, **${fmtMoney(STOCK_MAX_DAILY_VOLUME)}** в сутки.\n\n${rows.join("\n\n")}`)
    .setColor(0x3498db)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

async function handleBuyStock(interaction, db) {
  const userId = interaction.user.id;
  const ticker = interaction.options.getString("ticker", true);
  const shares = interaction.options.getInteger("shares", true);
  const meta = STOCKS[ticker];
  if (!meta) { await interaction.reply({ content: "❌ Неизвестный тикер.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true }); return; }

  const price = await getStockPrice(db, ticker);
  const gross = Math.ceil(price * shares);
  const commission = Math.ceil(gross * STOCK_COMMISSION_PCT);
  const total = gross + commission;

  if (total > STOCK_MAX_TRADE_AMOUNT) {
    await interaction.reply({ content: `❌ Превышен лимит на сделку: **${fmtMoney(STOCK_MAX_TRADE_AMOUNT)}**. У тебя: **${fmtMoney(total)}**`, ephemeral: true });
    return;
  }
  if (Number(user.money) < total) {
    await interaction.reply({ content: `Не хватает: нужно **${fmtMoney(total)}** (включая комиссию ${fmtMoney(commission)}). У тебя: **${fmtMoney(user.money)}**`, ephemeral: true });
    return;
  }

  const dailyVol = await getUserDailyVolume(db, userId);
  if (dailyVol + total > STOCK_MAX_DAILY_VOLUME) {
    await interaction.reply({ content: `❌ Превышен дневной лимит оборота: **${fmtMoney(STOCK_MAX_DAILY_VOLUME)}**. Сегодня уже: **${fmtMoney(dailyVol)}**`, ephemeral: true });
    return;
  }
  if (!(await checkAndSetActionCooldown(interaction, db, userId, "stock_trade", STOCK_TRADE_COOLDOWN_MS))) return;

  await withTx(db, async () => {
    const fresh = await getSampUser(db, userId);
    if (Number(fresh?.money || 0) < total) throw new Error("INSUFFICIENT");
    await adjustMoney(db, userId, -total);

    const insertedTrade = await addLedgerUnique(
      db, "stock_buy", userId, null, gross,
      makeInteractionOpKey(interaction, "stock_buy"),
      { ticker, shares, price }
    );
    if (!insertedTrade) throw new Error("DUPLICATE_OPERATION");
    await addLedger(db, "stock_commission", userId, null, commission, { ticker, side: "buy" });

    // Update / insert holding with new avg cost
    const existing = await dbGet(db, "SELECT shares, avg_cost FROM samp_stocks WHERE user_id = ? AND ticker = ?", [String(userId), String(ticker)]);
    if (existing) {
      const oldShares = Number(existing.shares);
      const oldAvg = Number(existing.avg_cost);
      const newShares = oldShares + shares;
      const newAvg = (oldShares * oldAvg + shares * price) / newShares;
      await dbRun(db, "UPDATE samp_stocks SET shares = ?, avg_cost = ? WHERE user_id = ? AND ticker = ?", [newShares, newAvg, String(userId), String(ticker)]);
    } else {
      await dbRun(db, "INSERT INTO samp_stocks(user_id, ticker, shares, avg_cost) VALUES(?, ?, ?, ?)", [String(userId), String(ticker), shares, price]);
    }
    await bumpUserDailyVolume(db, userId, total);
  });

  const after = await getSampUser(db, userId);
  await interaction.reply(
    `${meta.emoji} Куплено **${shares}** акций **${ticker}** по **${fmtMoney(price)}**.\n` +
    `Сделка: ${fmtMoney(gross)} + комиссия ${fmtMoney(commission)} = **${fmtMoney(total)}**.\n` +
    `Остаток: **${fmtMoney(after?.money || 0)}**.`
  );
}

async function handleSellStock(interaction, db) {
  const userId = interaction.user.id;
  const ticker = interaction.options.getString("ticker", true);
  const shares = interaction.options.getInteger("shares", true);
  const meta = STOCKS[ticker];
  if (!meta) { await interaction.reply({ content: "❌ Неизвестный тикер.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true }); return; }

  const holding = await dbGet(db, "SELECT shares, avg_cost FROM samp_stocks WHERE user_id = ? AND ticker = ?", [String(userId), String(ticker)]);
  if (!holding || Number(holding.shares) < shares) {
    await interaction.reply({ content: `❌ Недостаточно акций. У тебя: **${holding?.shares || 0}**`, ephemeral: true });
    return;
  }

  const price = await getStockPrice(db, ticker);
  const gross = Math.floor(price * shares);
  const commission = Math.floor(gross * STOCK_COMMISSION_PCT);
  const net = gross - commission;

  if (gross > STOCK_MAX_TRADE_AMOUNT) {
    await interaction.reply({ content: `❌ Превышен лимит на сделку: **${fmtMoney(STOCK_MAX_TRADE_AMOUNT)}**. Сделка: **${fmtMoney(gross)}**`, ephemeral: true });
    return;
  }
  const dailyVol = await getUserDailyVolume(db, userId);
  if (dailyVol + gross > STOCK_MAX_DAILY_VOLUME) {
    await interaction.reply({ content: `❌ Превышен дневной лимит оборота: **${fmtMoney(STOCK_MAX_DAILY_VOLUME)}**. Сегодня уже: **${fmtMoney(dailyVol)}**`, ephemeral: true });
    return;
  }
  if (!(await checkAndSetActionCooldown(interaction, db, userId, "stock_trade", STOCK_TRADE_COOLDOWN_MS))) return;

  await withTx(db, async () => {
    const fresh = await dbGet(db, "SELECT shares FROM samp_stocks WHERE user_id = ? AND ticker = ?", [String(userId), String(ticker)]);
    if (!fresh || Number(fresh.shares) < shares) throw new Error("INSUFFICIENT_SHARES");
    const remaining = Number(fresh.shares) - shares;
    if (remaining === 0) {
      await dbRun(db, "DELETE FROM samp_stocks WHERE user_id = ? AND ticker = ?", [String(userId), String(ticker)]);
    } else {
      await dbRun(db, "UPDATE samp_stocks SET shares = ? WHERE user_id = ? AND ticker = ?", [remaining, String(userId), String(ticker)]);
    }
    await adjustMoney(db, userId, net);
    const inserted = await addLedgerUnique(
      db, "stock_sell", null, userId, gross,
      makeInteractionOpKey(interaction, "stock_sell"),
      { ticker, shares, price }
    );
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await addLedger(db, "stock_commission", userId, null, commission, { ticker, side: "sell" });
    await bumpUserDailyVolume(db, userId, gross);
  });

  const after = await getSampUser(db, userId);
  const pnl = (price - Number(holding.avg_cost)) * shares;
  const pnlText = pnl >= 0 ? `🟢 **+${fmtMoney(pnl)}**` : `🔴 **${fmtMoney(pnl)}**`;
  await interaction.reply(
    `${meta.emoji} Продано **${shares}** акций **${ticker}** по **${fmtMoney(price)}**.\n` +
    `Получено: ${fmtMoney(gross)} − комиссия ${fmtMoney(commission)} = **${fmtMoney(net)}**.\n` +
    `Прибыль/убыток: ${pnlText}\n` +
    `Остаток: **${fmtMoney(after?.money || 0)}**.`
  );
}

async function handlePortfolio(interaction, db) {
  const target = interaction.options.getUser("user") || interaction.user;
  const portfolio = await getUserPortfolio(db, target.id);
  if (portfolio.length === 0) {
    await interaction.reply({ content: `📭 У <@${target.id}> нет акций. Купить: /buystock`, ephemeral: true });
    return;
  }
  const prices = await getAllStockPrices(db);
  let totalValue = 0;
  let totalCost = 0;
  const lines = portfolio.map((h) => {
    const meta = STOCKS[h.ticker];
    const price = prices.get(h.ticker)?.price || meta?.basePrice || 0;
    const value = price * Number(h.shares);
    const cost = Number(h.avg_cost) * Number(h.shares);
    totalValue += value;
    totalCost += cost;
    const pnl = value - cost;
    const arrow = pnl >= 0 ? "🟢" : "🔴";
    return `${meta?.emoji || ""} **${h.ticker}** — ${h.shares} шт × ${fmtMoney(price)} = **${fmtMoney(value)}** ${arrow} (ср.цена ${fmtMoney(h.avg_cost)})`;
  });
  const totalPnl = totalValue - totalCost;
  const totalPnlText = totalPnl >= 0 ? `🟢 **+${fmtMoney(totalPnl)}**` : `🔴 **${fmtMoney(totalPnl)}**`;

  const embed = new EmbedBuilder()
    .setTitle(`💼 Портфель ${target.username}`)
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "Всего вложено", value: `**${fmtMoney(totalCost)}**`, inline: true },
      { name: "Текущая стоимость", value: `**${fmtMoney(totalValue)}**`, inline: true },
      { name: "PnL", value: totalPnlText, inline: true },
    )
    .setColor(totalPnl >= 0 ? 0x2ecc71 : 0xe74c3c)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════
// HANDLERS — CREW
// ═══════════════════════════════════════════════════════════════

async function handleHire(interaction, db) {
  const userId = interaction.user.id;
  const roleId = interaction.options.getString("role", true);
  const role = CREW_ROLES[roleId];
  if (!role) { await interaction.reply({ content: "❌ Такой роли нет.", ephemeral: true }); return; }

  const user = await getSampUser(db, userId);
  if (!user) { await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true }); return; }

  if (await userHasCrewRole(db, userId, roleId)) {
    await interaction.reply({ content: `У тебя уже работает **${role.emoji} ${role.name}**.`, ephemeral: true });
    return;
  }

  const total = role.hireCost + role.monthlySalary; // upfront hire + first month
  if (Number(user.money) < total) {
    await interaction.reply({ content: `Не хватает виртов. Нужно: **${fmtMoney(total)}** (найм ${fmtMoney(role.hireCost)} + первый месяц ${fmtMoney(role.monthlySalary)}). У тебя: **${fmtMoney(user.money)}**`, ephemeral: true });
    return;
  }

  const paidThrough = nowMs() + CREW_SALARY_PERIOD_DAYS * 24 * 60 * 60 * 1000;

  await withTx(db, async () => {
    // Re-check inside tx — prevents double-charge on concurrent /hire clicks.
    const existing = await dbGet(
      db,
      "SELECT paid_through FROM samp_crew WHERE user_id = ? AND role_id = ?",
      [String(userId), String(roleId)]
    );
    if (existing && Number(existing.paid_through || 0) > nowMs()) throw new Error("ALREADY_HIRED");
    const fresh = await getSampUser(db, userId);
    if (Number(fresh?.money || 0) < total) throw new Error("INSUFFICIENT");
    await adjustMoney(db, userId, -total);
    const inserted = await addLedgerUnique(
      db, "crew_hire", userId, null, total,
      makeInteractionOpKey(interaction, "crew_hire"),
      { role: roleId, hire: role.hireCost, salary: role.monthlySalary }
    );
    if (!inserted) throw new Error("DUPLICATE_OPERATION");
    await dbRun(
      db,
      `INSERT INTO samp_crew(user_id, role_id, hired_at, paid_through) VALUES(?, ?, datetime('now'), ?)
       ON CONFLICT(user_id, role_id) DO UPDATE SET paid_through = excluded.paid_through, hired_at = excluded.hired_at`,
      [String(userId), String(roleId), paidThrough]
    );
  });

  const after = await getSampUser(db, userId);
  await interaction.reply(
    `${role.emoji} Нанят: **${role.name}**.\n` +
    `${role.description}\n` +
    `Списано: **${fmtMoney(total)}** (найм + первый месяц). Следующая ЗП: <t:${Math.floor(paidThrough / 1000)}:R>.\n` +
    `Остаток: **${fmtMoney(after?.money || 0)}**.`
  );
}

async function handleFire(interaction, db) {
  const userId = interaction.user.id;
  const roleId = interaction.options.getString("role", true);
  const role = CREW_ROLES[roleId];
  if (!role) { await interaction.reply({ content: "❌ Такой роли нет.", ephemeral: true }); return; }

  const result = await dbRun(db, "DELETE FROM samp_crew WHERE user_id = ? AND role_id = ?", [String(userId), String(roleId)]);
  if (Number(result?.changes || 0) === 0) {
    await interaction.reply({ content: `У тебя нет в команде **${role.name}**.`, ephemeral: true });
    return;
  }
  await addLedger(db, "crew_fire", userId, null, 0, { role: roleId });
  await interaction.reply(`${role.emoji} **${role.name}** уволен. Зарплата списываться больше не будет.`);
}

async function handleCrew(interaction, db) {
  const userId = interaction.user.id;
  const crew = await getUserCrew(db, userId);
  if (crew.length === 0) {
    await interaction.reply({ content: "📭 У тебя нет персонала. Нанять: /hire", ephemeral: true });
    return;
  }
  const lines = crew.map((m) => {
    const tsSec = Math.floor(m.paid_through / 1000);
    const lapsed = m.paid_through < nowMs();
    const status = lapsed ? "⚠️ ЗП просрочена" : `Следующая ЗП: <t:${tsSec}:R>`;
    return `${m.role.emoji} **${m.role.name}** — ЗП ${fmtMoney(m.role.monthlySalary)}/мес\n   _${m.role.description}_\n   ${status}`;
  });
  const totalSalary = crew.reduce((acc, m) => acc + m.role.monthlySalary, 0);
  const embed = new EmbedBuilder()
    .setTitle(`👥 Команда ${interaction.user.username}`)
    .setDescription(lines.join("\n\n"))
    .addFields({ name: "Расход в месяц", value: `**${fmtMoney(totalSalary)}**`, inline: true })
    .setColor(0x34495e)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════

async function handleSampPrestigeCommand({ interaction, db }) {
  const name = interaction.commandName;
  try {
    if (name === "burnmoney") await handleBurnMoney(interaction, db);
    else if (name === "champagne") await handleChampagne(interaction, db);
    else if (name === "donatechat") await handleDonateChat(interaction, db);
    else if (name === "flexboard") await handleFlexboard(interaction, db);
    else if (name === "realestate") await handleRealEstate(interaction, db);
    else if (name === "buymansion") await handleBuyMansion(interaction, db);
    else if (name === "buyaircraft") await handleBuyAircraft(interaction, db);
    else if (name === "airjob") await handleAirJob(interaction, db);
    else if (name === "mansion-collect") await handleMansionCollect(interaction, db);
    else if (name === "estate") await handleEstate(interaction, db);
    else if (name === "stocks") await handleStocks(interaction, db);
    else if (name === "buystock") await handleBuyStock(interaction, db);
    else if (name === "sellstock") await handleSellStock(interaction, db);
    else if (name === "portfolio") await handlePortfolio(interaction, db);
    else if (name === "hire") await handleHire(interaction, db);
    else if (name === "fire") await handleFire(interaction, db);
    else if (name === "crew") await handleCrew(interaction, db);
    else return;
  } catch (e) {
    console.error("[samp-prestige] command error:", name, e);
    const msg = e?.message === "DUPLICATE_OPERATION"
      ? "❌ Похоже, эта операция уже была обработана. Попробуй ещё раз."
      : e?.message === "INSUFFICIENT"
        ? "❌ Не хватает виртов (баланс изменился)."
        : e?.message === "INSUFFICIENT_SHARES"
          ? "❌ Не хватает акций."
          : e?.message === "ALREADY_OWNED"
            ? "❌ Этот объект уже в твоём владении."
            : e?.message === "ALREADY_HIRED"
              ? "❌ Этот сотрудник уже в твоей команде."
              : "❌ Что-то пошло не так. Попробуй позже.";
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch (_) {}
  }
  try { await touchSampUserSeenAt(db, interaction.user?.id); } catch (_) {}
}

module.exports = {
  ensurePrestigeTables,
  getPrestigeCommandBuilders,
  handleSampPrestigeCommand,
  PRESTIGE_COMMAND_NAMES,
  // Helpers exported for other modules
  getUserMansion,
  getUserAircraft,
  getUserPrestigeFlexScore,
  getUserCrew,
  userHasCrewRole,
  consumeBodyguardIntercept,
  getStockPrice,
  getAllStockPrices,
};
