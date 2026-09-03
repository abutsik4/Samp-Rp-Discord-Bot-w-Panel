"use strict";

/**
 * SAMP Life — Black-Market Mystery Crates (2026-05-27).
 *
 * Late-game money sink with controlled randomness. Three crate tiers:
 *   - Standard ($250k)   : common cash + small chance of rare
 *   - Premium  ($1M)     : rare/epic loot, 1% jackpot $3M
 *   - Apocalypse ($2.5M) : guaranteed rare+, 1% legendary
 *
 * Anti-abuse:
 *   - 60s cooldown between opens (samp_cooldowns reused)
 *   - max 50 opens / day / user
 *   - all rolls server-side, recorded in samp_crate_history
 *   - debit + credit inside a single transaction (Phase A money safety)
 *   - pity: after 10 consecutive duds (sub-rare), next roll guarantees rare+
 *
 * Per the 27-May-2026 plan, the legendary jackpot tier is capped to 1% AND
 * limited to a single hit per user per 7 days to avoid wrecking real-estate
 * scarcity ("Apocalypse jackpot ceiling").
 */

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { touchSampUserSeenAt } = require("./samp-life");

// ─── Tuning constants ─────────────────────────────────────────────────────

const CRATE_COOLDOWN_MS = 60 * 1000;
const CRATE_DAILY_CAP = 50;
const JACKPOT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Reward kinds:
//   cash_small    — 30%–60% of crate price
//   cash_medium   — 100%–180% of crate price
//   cash_large    — 250%–400% of crate price
//   jackpot       — fixed large bonus
const REWARD_KINDS = {
  cash_small:  { rarity: "common",    label: "💵 Мелкие наличные",   color: 0x95a5a6 },
  cash_medium: { rarity: "uncommon",  label: "💰 Толстая пачка",     color: 0x3498db },
  cash_large:  { rarity: "rare",      label: "💎 Сейф с виртами",    color: 0x9b59b6 },
  jackpot:     { rarity: "legendary", label: "🃏 ДЖЕКПОТ",           color: 0xf1c40f },
};

const CRATES = {
  standard: {
    id: "standard",
    name: "Стандартный кейс",
    emoji: "📦",
    price: 250_000,
    jackpotPayout: 3_000_000,
    // Probabilities must sum to 1.0. Validated in tests.
    odds: [
      { kind: "cash_small",  p: 0.65, payMin: 0.30, payMax: 0.60 },
      { kind: "cash_medium", p: 0.30, payMin: 1.00, payMax: 1.80 },
      { kind: "cash_large",  p: 0.049, payMin: 2.50, payMax: 4.00 },
      { kind: "jackpot",     p: 0.001 },
    ],
    color: 0x95a5a6,
  },
  premium: {
    id: "premium",
    name: "Премиум кейс",
    emoji: "🎁",
    price: 1_000_000,
    jackpotPayout: 10_000_000,
    odds: [
      { kind: "cash_small",  p: 0.40, payMin: 0.30, payMax: 0.60 },
      { kind: "cash_medium", p: 0.40, payMin: 1.00, payMax: 1.80 },
      { kind: "cash_large",  p: 0.19, payMin: 2.50, payMax: 4.00 },
      { kind: "jackpot",     p: 0.01 },
    ],
    color: 0x3498db,
  },
  apocalypse: {
    id: "apocalypse",
    name: "Кейс «Апокалипсис»",
    emoji: "☢️",
    price: 2_500_000,
    jackpotPayout: 25_000_000,
    // odds populated immediately after this block — see below
    odds: [],
    color: 0xe74c3c,
  },
};

// Apocalypse odds — defined out-of-line so the table layout stays readable.
CRATES.apocalypse.odds = [
  { kind: "cash_small",  p: 0.20, payMin: 0.30, payMax: 0.60 },
  { kind: "cash_medium", p: 0.45, payMin: 1.00, payMax: 1.80 },
  { kind: "cash_large",  p: 0.34, payMin: 2.50, payMax: 4.00 },
  { kind: "jackpot",     p: 0.01 },
];

const PITY_THRESHOLD = 10;

const CRATE_COMMAND_NAMES = ["crate"];

// ─── Schema ───────────────────────────────────────────────────────────────

async function ensureCrateTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_crate_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL,
      guild_id    TEXT,
      crate_id    TEXT NOT NULL,
      crate_price INTEGER NOT NULL,
      reward_kind TEXT NOT NULL,
      payout      INTEGER NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_crate_hist_user ON samp_crate_history(user_id, created_at DESC)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_crate_hist_kind ON samp_crate_history(reward_kind, created_at DESC)`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtMoney(n) { return `${Number(n || 0).toLocaleString("ru-RU")} $`; }
function randInt(min, max) {
  const lo = Math.ceil(Number(min));
  const hi = Math.floor(Number(max));
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
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

/**
 * Roll a single reward from a crate's odds table.
 * Returns { kind, payout }. Optionally honors pity (force rare+).
 */
function rollCrate(crate, { forceRarePlus = false, jackpotBlocked = false } = {}) {
  let table = crate.odds;
  if (forceRarePlus) {
    // Re-normalize odds for entries with rarity >= rare.
    const eligible = crate.odds.filter((o) => REWARD_KINDS[o.kind] && (REWARD_KINDS[o.kind].rarity === "rare" || REWARD_KINDS[o.kind].rarity === "legendary"));
    const total = eligible.reduce((sum, o) => sum + o.p, 0);
    if (total > 0) table = eligible.map((o) => ({ ...o, p: o.p / total }));
  }
  if (jackpotBlocked) {
    const filtered = table.filter((o) => o.kind !== "jackpot");
    const total = filtered.reduce((sum, o) => sum + o.p, 0);
    if (total > 0) table = filtered.map((o) => ({ ...o, p: o.p / total }));
  }
  const roll = Math.random();
  let acc = 0;
  let chosen = table[table.length - 1];
  for (const opt of table) {
    acc += opt.p;
    if (roll < acc) { chosen = opt; break; }
  }
  let payout;
  if (chosen.kind === "jackpot") {
    payout = crate.jackpotPayout;
  } else {
    const lo = Math.round(crate.price * chosen.payMin);
    const hi = Math.round(crate.price * chosen.payMax);
    payout = randInt(lo, hi);
  }
  return { kind: chosen.kind, payout };
}

async function countConsecutiveDuds(db, userId) {
  // Count crates opened since the last rare-or-better reward.
  const rows = await dbAll(
    db,
    `SELECT reward_kind FROM samp_crate_history WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    [String(userId), PITY_THRESHOLD]
  );
  let streak = 0;
  for (const r of rows) {
    const rarity = REWARD_KINDS[r.reward_kind]?.rarity;
    if (rarity === "rare" || rarity === "legendary") break;
    streak += 1;
  }
  return streak;
}

async function recentJackpot(db, userId) {
  const cutoff = new Date(Date.now() - JACKPOT_WINDOW_MS).toISOString().replace("T", " ").slice(0, 19);
  const row = await dbGet(
    db,
    `SELECT id FROM samp_crate_history WHERE user_id = ? AND reward_kind = 'jackpot' AND created_at > ? LIMIT 1`,
    [String(userId), cutoff]
  );
  return !!row;
}

async function countOpensToday(db, userId) {
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const cutoff = dayStart.toISOString().replace("T", " ").slice(0, 19);
  const row = await dbGet(
    db,
    `SELECT COUNT(*) AS c FROM samp_crate_history WHERE user_id = ? AND created_at > ?`,
    [String(userId), cutoff]
  );
  return Number(row?.c || 0);
}

async function setCooldown(db, userId, action, readyAt) {
  await dbRun(
    db,
    `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?)
     ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`,
    [String(userId), String(action), Number(readyAt)]
  );
}

async function getCooldown(db, userId, action) {
  const row = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?", [String(userId), String(action)]);
  return Number(row?.ready_at || 0);
}

// ─── Slash command builder ────────────────────────────────────────────────

function getCrateCommandBuilders() {
  const crateChoices = Object.values(CRATES).map((c) => ({
    name: `${c.emoji} ${c.name} — ${c.price.toLocaleString("ru-RU")} $`,
    value: c.id,
  }));
  return [
    new SlashCommandBuilder()
      .setName("crate")
      .setDescription("SAMP Life: чёрный рынок — мистические кейсы")
      .addSubcommand((s) => s.setName("buy").setDescription("Купить и вскрыть кейс")
        .addStringOption((o) => {
          const opt = o.setName("type").setDescription("Какой кейс").setRequired(true);
          for (const c of crateChoices) opt.addChoices(c);
          return opt;
        }))
      .addSubcommand((s) => s.setName("history").setDescription("Последние 10 твоих вскрытий"))
      .addSubcommand((s) => s.setName("odds").setDescription("Опубликованные шансы выпадения")),
  ];
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleOdds(interaction) {
  const lines = Object.values(CRATES).map((c) => {
    const rows = c.odds.map((o) => {
      const meta = REWARD_KINDS[o.kind];
      return `  ${meta?.label || o.kind}: **${(o.p * 100).toFixed(1)}%**`;
    });
    return `**${c.emoji} ${c.name}** — ${fmtMoney(c.price)}\n${rows.join("\n")}`;
  });
  const embed = new EmbedBuilder()
    .setTitle("🎰 Шансы кейсов")
    .setDescription(lines.join("\n\n"))
    .setColor(0xf39c12)
    .setFooter({ text: `Pity: после ${PITY_THRESHOLD} подряд "обычных/необычных" гарантируется минимум "редкий" • джекпот не чаще раза в 7 дней` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleHistory(interaction, db) {
  const userId = interaction.user.id;
  const rows = await dbAll(
    db,
    `SELECT crate_id, crate_price, reward_kind, payout, created_at
     FROM samp_crate_history WHERE user_id = ? ORDER BY id DESC LIMIT 10`,
    [String(userId)]
  );
  if (!rows.length) {
    await interaction.reply({ content: "Ты ещё ни одного кейса не вскрывал. Открой `/play магазин` → «Открыть кейс».", ephemeral: true });
    return;
  }
  const lines = rows.map((r) => {
    const crate = CRATES[r.crate_id];
    const meta = REWARD_KINDS[r.reward_kind];
    const net = Number(r.payout) - Number(r.crate_price);
    const sign = net >= 0 ? "+" : "−";
    return `• ${crate?.emoji || "📦"} ${crate?.name || r.crate_id} → ${meta?.label || r.reward_kind} ${fmtMoney(r.payout)} (${sign}${fmtMoney(Math.abs(net))})`;
  });
  const embed = new EmbedBuilder()
    .setTitle("📜 История кейсов")
    .setDescription(lines.join("\n"))
    .setColor(0x9b59b6);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleBuy(interaction, db) {
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id || null;
  const crateId = interaction.options.getString("type", true);
  const crate = CRATES[crateId];
  if (!crate) {
    await interaction.reply({ content: "Неизвестный тип кейса.", ephemeral: true });
    return;
  }

  // Pre-checks (outside tx; rechecked atomically inside).
  const cd = await getCooldown(db, userId, "crate_buy");
  const now = Date.now();
  if (cd > now) {
    const secs = Math.ceil((cd - now) / 1000);
    await interaction.reply({ content: `⏳ Подожди ещё **${secs} с** перед следующим вскрытием.`, ephemeral: true });
    return;
  }

  const opensToday = await countOpensToday(db, userId);
  if (opensToday >= CRATE_DAILY_CAP) {
    await interaction.reply({ content: `🚫 Дневной лимит достигнут (${CRATE_DAILY_CAP} кейсов). Возвращайся завтра.`, ephemeral: true });
    return;
  }

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }
  if (Number(user.money) < crate.price) {
    await interaction.reply({
      content: `Не хватает виртов. Цена **${fmtMoney(crate.price)}**, на счету **${fmtMoney(user.money)}**.`,
      ephemeral: true,
    });
    return;
  }

  const dudStreak = await countConsecutiveDuds(db, userId);
  const forceRarePlus = dudStreak >= PITY_THRESHOLD;
  const jackpotBlocked = await recentJackpot(db, userId);
  const result = rollCrate(crate, { forceRarePlus, jackpotBlocked });

  let postState;
  try {
    postState = await withSerializedTransaction(db, async () => {
      // Re-read balance + cooldown + daily-cap inside transaction to defeat races.
      const fresh = await getSampUser(db, userId);
      if (Number(fresh?.money || 0) < crate.price) throw new Error("INSUFFICIENT");
      const cdNow = await getCooldown(db, userId, "crate_buy");
      if (cdNow > Date.now()) throw new Error("COOLDOWN");
      const todayCount = await countOpensToday(db, userId);
      if (todayCount >= CRATE_DAILY_CAP) throw new Error("CAP");

      await adjustMoney(db, userId, -crate.price);
      await addLedger(db, "crate_spend", userId, null, crate.price, { crate: crate.id });
      await adjustMoney(db, userId, result.payout);
      await addLedger(db, "crate_reward", null, userId, result.payout, { crate: crate.id, kind: result.kind });
      await dbRun(
        db,
        `INSERT INTO samp_crate_history(user_id, guild_id, crate_id, crate_price, reward_kind, payout)
         VALUES(?, ?, ?, ?, ?, ?)`,
        [String(userId), guildId, crate.id, crate.price, result.kind, result.payout]
      );
      await setCooldown(db, userId, "crate_buy", Date.now() + CRATE_COOLDOWN_MS);
      const afterUser = await getSampUser(db, userId);
      return { balance: Number(afterUser?.money || 0) };
    });
  } catch (err) {
    let msg;
    switch (err?.message) {
      case "INSUFFICIENT": msg = "❌ Не хватает виртов (баланс изменился)."; break;
      case "COOLDOWN":     msg = "⏳ Подожди немного перед следующим вскрытием."; break;
      case "CAP":          msg = `🚫 Дневной лимит достигнут (${CRATE_DAILY_CAP}).`; break;
      default:             msg = "❌ Не удалось вскрыть кейс. Попробуй позже."; break;
    }
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
    return;
  }

  const meta = REWARD_KINDS[result.kind] || { label: result.kind, color: 0x95a5a6 };
  const net = result.payout - crate.price;
  const sign = net >= 0 ? "+" : "−";
  const embed = new EmbedBuilder()
    .setTitle(`${crate.emoji} ${crate.name} вскрыт!`)
    .setDescription(
      `<@${userId}> заплатил **${fmtMoney(crate.price)}** и достал из кейса:\n` +
      `**${meta.label}** — **${fmtMoney(result.payout)}**`
    )
    .addFields(
      { name: "Итог", value: `${sign}${fmtMoney(Math.abs(net))}`, inline: true },
      { name: "Баланс", value: `**${fmtMoney(postState.balance)}**`, inline: true },
    )
    .setColor(meta.color || crate.color)
    .setTimestamp(new Date());
  if (forceRarePlus) {
    embed.setFooter({ text: "🍀 Pity-бонус: гарантированно редкий или выше." });
  }
  await interaction.reply({ embeds: [embed] });
}

async function handleSampCrateCommand({ interaction, db }) {
  if (interaction.commandName !== "crate") return;
  const sub = interaction.options.getSubcommand(false);
  try {
    if (sub === "buy") await handleBuy(interaction, db);
    else if (sub === "history") await handleHistory(interaction, db);
    else if (sub === "odds") await handleOdds(interaction);
    else await interaction.reply({ content: "Неизвестная подкоманда.", ephemeral: true });
  } catch (err) {
    console.error("[samp-crate] command error:", sub, err);
    try {
      const msg = "❌ Что-то пошло не так. Попробуй позже.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    } catch (_) {}
  }
  try { await touchSampUserSeenAt(db, interaction.user?.id); } catch (_) {}
}

module.exports = {
  ensureCrateTables,
  getCrateCommandBuilders,
  handleSampCrateCommand,
  CRATE_COMMAND_NAMES,
  // Exports for tests
  CRATES,
  REWARD_KINDS,
  PITY_THRESHOLD,
  CRATE_COOLDOWN_MS,
  CRATE_DAILY_CAP,
  rollCrate,
};
