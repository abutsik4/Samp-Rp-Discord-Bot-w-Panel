"use strict";

/**
 * SAMP Life — VIP Subscription module (2026-05-27).
 *
 * Three weekly subscription tiers with stacking renewal:
 *   - Bronze ($250k/wk)  : +10% XP, +1 garage slot, golden name accent
 *   - Silver ($500k/wk)  : Bronze + -25% bail cost + custom title slot hint
 *   - Gold   ($1M/wk)    : Silver + +15% business income + nicer flexboard tag
 *
 * Schema: samp_vip (one active row per user; expires_at stores ms epoch).
 *
 * Subscriptions stack — calling /vip subscribe while active extends expiry
 * by another 7 days from the *current* expiry, not from "now". Downgrading
 * (lower tier while higher one is active) is rejected to prevent abuse.
 */

const { dbRun, dbGet } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { touchSampUserSeenAt } = require("./samp-life");

// ─── Constants ────────────────────────────────────────────────────────────

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const VIP_TIERS = {
  bronze: {
    id: "bronze",
    name: "Bronze VIP",
    emoji: "🥉",
    price: 250_000,
    color: 0xcd7f32,
    perks: [
      "+10% XP к работе и грузоперевозкам",
      "+1 слот в гараже",
      "Золотая полоска в `/balance`",
    ],
    xpBonus: 0.10,
    bailDiscount: 0,
    bizBonus: 0,
    garageBonusSlots: 1,
  },
  silver: {
    id: "silver",
    name: "Silver VIP",
    emoji: "🥈",
    price: 500_000,
    color: 0xc0c0c0,
    perks: [
      "Всё из Bronze",
      "-25% к стоимости залога `/bail`",
      "Расширенное место под кастомный титул",
    ],
    xpBonus: 0.10,
    bailDiscount: 0.25,
    bizBonus: 0,
    garageBonusSlots: 1,
  },
  gold: {
    id: "gold",
    name: "Gold VIP",
    emoji: "🥇",
    price: 1_000_000,
    color: 0xffd700,
    perks: [
      "Всё из Silver",
      "+15% к доходу с работ (`/play работа`)",
      "Особая иконка в профиле и коллекции",
    ],
    xpBonus: 0.10,
    bailDiscount: 0.25,
    bizBonus: 0.15,
    garageBonusSlots: 1,
  },
};

const TIER_RANK = { bronze: 1, silver: 2, gold: 3 };

const VIP_COMMAND_NAMES = ["vip"];

// ─── Schema ───────────────────────────────────────────────────────────────

async function ensureVipTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_vip (
      user_id      TEXT PRIMARY KEY,
      tier         TEXT NOT NULL,
      expires_at   INTEGER NOT NULL,
      total_spent  INTEGER NOT NULL DEFAULT 0,
      first_subscribed_at INTEGER NOT NULL DEFAULT 0,
      last_renewed_at     INTEGER NOT NULL DEFAULT 0
    )`
  );
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_samp_vip_expires ON samp_vip(expires_at)`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtMoney(n) { return `${Number(n || 0).toLocaleString("ru-RU")} $`; }

async function getActiveVip(db, userId) {
  const row = await dbGet(
    db,
    "SELECT * FROM samp_vip WHERE user_id = ? AND expires_at > ?",
    [String(userId), Date.now()]
  );
  if (!row) return null;
  const tier = VIP_TIERS[row.tier];
  if (!tier) return null;
  return { tier, expiresAt: Number(row.expires_at), totalSpent: Number(row.total_spent || 0) };
}

/** Returns multiplicative XP bonus from active VIP (e.g. 0.10 = +10%). */
async function getVipXpBonus(db, userId) {
  const active = await getActiveVip(db, userId);
  return active ? Number(active.tier.xpBonus || 0) : 0;
}

/** Returns bail discount (e.g. 0.25 = -25%). */
async function getVipBailDiscount(db, userId) {
  const active = await getActiveVip(db, userId);
  return active ? Number(active.tier.bailDiscount || 0) : 0;
}

/** Returns business income bonus (e.g. 0.15 = +15%). */
async function getVipBizBonus(db, userId) {
  const active = await getActiveVip(db, userId);
  return active ? Number(active.tier.bizBonus || 0) : 0;
}

/** Returns garage bonus slots from active VIP. */
async function getVipGarageBonus(db, userId) {
  const active = await getActiveVip(db, userId);
  return active ? Number(active.tier.garageBonusSlots || 0) : 0;
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

function fmtExpiry(expiresMs) {
  const remaining = Number(expiresMs) - Date.now();
  if (remaining <= 0) return "истёк";
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `через ${days} д ${hours} ч`;
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return `через ${hours} ч ${mins} мин`;
}

// ─── Slash command builders ───────────────────────────────────────────────

function getVipCommandBuilders() {
  const tierChoices = Object.values(VIP_TIERS).map((t) => ({
    name: `${t.emoji} ${t.name} — ${t.price.toLocaleString("ru-RU")} $/нед`,
    value: t.id,
  }));
  return [
    new SlashCommandBuilder()
      .setName("vip")
      .setDescription("SAMP Life: VIP-подписка (бонусы к XP, доходам, гаражу)")
      .addSubcommand((s) => s.setName("status").setDescription("Показать твой VIP-статус и срок действия"))
      .addSubcommand((s) => s.setName("subscribe").setDescription("Купить или продлить VIP-подписку на 7 дней")
        .addStringOption((o) => {
          const opt = o.setName("tier").setDescription("Какой уровень").setRequired(true);
          for (const c of tierChoices) opt.addChoices(c);
          return opt;
        }))
      .addSubcommand((s) => s.setName("perks").setDescription("Полный список перков по уровням")),
  ];
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleStatus(interaction, db) {
  const userId = interaction.user.id;
  const active = await getActiveVip(db, userId);
  const totalRow = await dbGet(db, "SELECT total_spent, first_subscribed_at FROM samp_vip WHERE user_id = ?", [String(userId)]);
  const totalSpent = Number(totalRow?.total_spent || 0);

  const embed = new EmbedBuilder()
    .setTitle("💎 VIP-статус")
    .setColor(active ? active.tier.color : 0x808080);

  if (active) {
    embed
      .setDescription(`Действующая подписка: **${active.tier.emoji} ${active.tier.name}**`)
      .addFields(
        { name: "Истекает", value: fmtExpiry(active.expiresAt), inline: true },
        { name: "Потрачено всего", value: `**${fmtMoney(totalSpent)}**`, inline: true },
        { name: "Перки", value: active.tier.perks.map((p) => `• ${p}`).join("\n") },
      );
  } else {
    embed
      .setDescription("У тебя нет активной VIP-подписки.\nКупи через `/play магазин` → «VIP статус».")
      .addFields({ name: "Потрачено всего", value: `**${fmtMoney(totalSpent)}**`, inline: true });
  }
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handlePerks(interaction) {
  const lines = Object.values(VIP_TIERS).map((t) =>
    `**${t.emoji} ${t.name}** — ${fmtMoney(t.price)}/нед\n${t.perks.map((p) => `• ${p}`).join("\n")}`
  );
  const embed = new EmbedBuilder()
    .setTitle("💎 VIP — уровни и перки")
    .setDescription(lines.join("\n\n"))
    .setColor(0xffd700)
    .setFooter({ text: "Подписки стекаются: повторная покупка добавляет 7 дней к текущему сроку." });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleSubscribe(interaction, db) {
  const userId = interaction.user.id;
  const tierId = interaction.options.getString("tier", true);
  const tier = VIP_TIERS[tierId];
  if (!tier) {
    await interaction.reply({ content: "Неизвестный уровень VIP.", ephemeral: true });
    return;
  }

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }
  if (Number(user.money) < tier.price) {
    await interaction.reply({
      content: `Не хватает виртов. Цена **${fmtMoney(tier.price)}**, на счету **${fmtMoney(user.money)}**.`,
      ephemeral: true,
    });
    return;
  }

  // Reject downgrades while a higher tier is still active.
  const current = await getActiveVip(db, userId);
  if (current && TIER_RANK[current.tier.id] > TIER_RANK[tier.id]) {
    await interaction.reply({
      content: `У тебя уже активен **${current.tier.emoji} ${current.tier.name}**, нельзя купить уровень ниже до истечения.`,
      ephemeral: true,
    });
    return;
  }

  let result;
  try {
    result = await withSerializedTransaction(db, async () => {
      // Re-read balance inside transaction to prevent race.
      const fresh = await getSampUser(db, userId);
      if (Number(fresh?.money || 0) < tier.price) throw new Error("INSUFFICIENT");

      const now = Date.now();
      const existing = await dbGet(db, "SELECT * FROM samp_vip WHERE user_id = ?", [String(userId)]);
      const base = existing && Number(existing.expires_at) > now ? Number(existing.expires_at) : now;
      const newExpiry = base + WEEK_MS;
      const newTotal = Number(existing?.total_spent || 0) + tier.price;
      const firstAt = Number(existing?.first_subscribed_at || 0) || now;

      await adjustMoney(db, userId, -tier.price);
      await dbRun(
        db,
        `INSERT INTO samp_vip(user_id, tier, expires_at, total_spent, first_subscribed_at, last_renewed_at)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           tier = excluded.tier,
           expires_at = excluded.expires_at,
           total_spent = excluded.total_spent,
           last_renewed_at = excluded.last_renewed_at`,
        [String(userId), tier.id, newExpiry, newTotal, firstAt, now]
      );
      await addLedger(db, "vip_subscribe", userId, null, tier.price, { tier: tier.id, expires_at: newExpiry });
      return { newExpiry, newTotal };
    });
  } catch (err) {
    const msg = err?.message === "INSUFFICIENT"
      ? "❌ Не хватает виртов (баланс изменился)."
      : "❌ Не удалось оформить подписку. Попробуй позже.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
    return;
  }

  const after = await getSampUser(db, userId);
  const embed = new EmbedBuilder()
    .setTitle(`${tier.emoji} ${tier.name} активирован!`)
    .setDescription(`<@${userId}> оформил **${tier.name}** за ${fmtMoney(tier.price)}.`)
    .addFields(
      { name: "Действует до", value: fmtExpiry(result.newExpiry), inline: true },
      { name: "Остаток", value: `**${fmtMoney(after?.money || 0)}**`, inline: true },
      { name: "Перки", value: tier.perks.map((p) => `• ${p}`).join("\n") },
    )
    .setColor(tier.color)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

async function handleSampVipCommand({ interaction, db }) {
  if (interaction.commandName !== "vip") return;
  const sub = interaction.options.getSubcommand(false);
  try {
    if (sub === "status") await handleStatus(interaction, db);
    else if (sub === "subscribe") await handleSubscribe(interaction, db);
    else if (sub === "perks") await handlePerks(interaction);
    else await interaction.reply({ content: "Неизвестная подкоманда.", ephemeral: true });
  } catch (err) {
    console.error("[samp-vip] command error:", sub, err);
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
  ensureVipTables,
  getVipCommandBuilders,
  handleSampVipCommand,
  VIP_COMMAND_NAMES,
  VIP_TIERS,
  WEEK_MS,
  // Hook helpers for sibling modules
  getActiveVip,
  getVipXpBonus,
  getVipBailDiscount,
  getVipBizBonus,
  getVipGarageBonus,
};
