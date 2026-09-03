"use strict";

/**
 * SAMP Life — Property Upgrades module (2026-05-27).
 *
 * Money sink for late-game players. Re-invest into your existing assets:
 *   - Businesses (samp_properties.upgrade_level)   0–5  → +20% income / level
 *   - Mansions  (samp_mansions.upgrade_level)      0–5  → +25% rent / level
 *   - Aircraft  (samp_aircraft.upgrade_level)      0–3  → +15% airjob pay / level
 *
 * Cost formula:
 *   biz:      $200_000 × (nextLevel)
 *   mansion:  $500_000 × (nextLevel)
 *   aircraft: $500_000 × (nextLevel)
 *
 * All level columns are added via ALTER TABLE ... ADD COLUMN at module init
 * so the migration is idempotent and survives older DB files.
 */

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { touchSampUserSeenAt } = require("./samp-life");

// ─── Tuning constants ─────────────────────────────────────────────────────

const BIZ_MAX_LEVEL = 5;
const BIZ_COST_PER_LEVEL = 200_000;
const BIZ_BONUS_PER_LEVEL = 0.20;

const MANSION_MAX_LEVEL = 5;
const MANSION_COST_PER_LEVEL = 500_000;
const MANSION_BONUS_PER_LEVEL = 0.25;

const AIRCRAFT_MAX_LEVEL = 3;
const AIRCRAFT_COST_PER_LEVEL = 500_000;
const AIRCRAFT_BONUS_PER_LEVEL = 0.15;

const UPGRADE_COMMAND_NAMES = ["upgrade"];

// ─── Schema migrations ────────────────────────────────────────────────────

async function ensureUpgradeColumns(db) {
  // Each ALTER is wrapped — ALTER TABLE ADD COLUMN is non-idempotent in SQLite
  // and will throw on the second run; we swallow that case so init is safe.
  for (const sql of [
    `ALTER TABLE samp_properties ADD COLUMN upgrade_level INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE samp_mansions ADD COLUMN upgrade_level INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE samp_aircraft ADD COLUMN upgrade_level INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try { await dbRun(db, sql); } catch (_) { /* column already exists */ }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtMoney(n) { return `${Number(n || 0).toLocaleString("ru-RU")} $`; }

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

/** Multiplier applied to business income for given property level. */
function bizIncomeMultiplier(level) {
  const lv = Math.max(0, Math.min(BIZ_MAX_LEVEL, Number(level) || 0));
  return 1 + lv * BIZ_BONUS_PER_LEVEL;
}

/** Multiplier applied to mansion daily rent for given mansion level. */
function mansionRentMultiplier(level) {
  const lv = Math.max(0, Math.min(MANSION_MAX_LEVEL, Number(level) || 0));
  return 1 + lv * MANSION_BONUS_PER_LEVEL;
}

/** Multiplier applied to airjob payouts for given aircraft level. */
function aircraftPayMultiplier(level) {
  const lv = Math.max(0, Math.min(AIRCRAFT_MAX_LEVEL, Number(level) || 0));
  return 1 + lv * AIRCRAFT_BONUS_PER_LEVEL;
}

async function getBizLevel(db, userId, propertyId) {
  const row = await dbGet(
    db,
    "SELECT upgrade_level FROM samp_properties WHERE user_id = ? AND property_id = ?",
    [String(userId), String(propertyId)]
  );
  return Number(row?.upgrade_level || 0);
}

async function getMansionLevel(db, userId) {
  const row = await dbGet(
    db,
    "SELECT upgrade_level FROM samp_mansions WHERE user_id = ?",
    [String(userId)]
  );
  return Number(row?.upgrade_level || 0);
}

async function getAircraftLevel(db, userId, aircraftId) {
  const row = await dbGet(
    db,
    "SELECT upgrade_level FROM samp_aircraft WHERE user_id = ? AND aircraft_id = ?",
    [String(userId), String(aircraftId)]
  );
  return Number(row?.upgrade_level || 0);
}

function nextBizCost(level) { return BIZ_COST_PER_LEVEL * (Number(level) + 1); }
function nextMansionCost(level) { return MANSION_COST_PER_LEVEL * (Number(level) + 1); }
function nextAircraftCost(level) { return AIRCRAFT_COST_PER_LEVEL * (Number(level) + 1); }

// ─── Slash command builder ────────────────────────────────────────────────

function getUpgradeCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("upgrade")
      .setDescription("SAMP Life: вложиться в свои активы (бизнесы, особняки, техника)")
      .addSubcommand((s) => s.setName("list").setDescription("Показать все твои объекты и стоимость следующего апгрейда"))
      .addSubcommand((s) => s.setName("business").setDescription("Прокачать уровень бизнеса")
        .addStringOption((o) => o.setName("id").setDescription("ID бизнеса (см. «Улучшения» в /play бизнес)").setRequired(true)))
      .addSubcommand((s) => s.setName("mansion").setDescription("Прокачать уровень особняка"))
      .addSubcommand((s) => s.setName("aircraft").setDescription("Прокачать уровень летающей техники")
        .addStringOption((o) => o.setName("id").setDescription("ID борта (см. «Улучшения» в /play бизнес)").setRequired(true))),
  ];
}

// ─── Handlers ─────────────────────────────────────────────────────────────

async function handleList(interaction, db) {
  const userId = interaction.user.id;

  const props = await dbAll(db, "SELECT property_id, upgrade_level FROM samp_properties WHERE user_id = ?", [String(userId)]);
  const mansionRow = await dbGet(db, "SELECT mansion_id, upgrade_level FROM samp_mansions WHERE user_id = ?", [String(userId)]);
  const aircraft = await dbAll(db, "SELECT aircraft_id, upgrade_level FROM samp_aircraft WHERE user_id = ?", [String(userId)]);

  if (!props.length && !mansionRow && !aircraft.length) {
    await interaction.reply({
      content: "У тебя нет апгрейдабельных объектов. Купи бизнес, особняк или борт через `/play бизнес`.",
      ephemeral: true,
    });
    return;
  }

  const lines = [];

  if (props.length) {
    lines.push("**🏪 Бизнесы**");
    for (const p of props) {
      const lv = Number(p.upgrade_level || 0);
      const bonus = `+${Math.round((bizIncomeMultiplier(lv) - 1) * 100)}%`;
      const nextLine = lv >= BIZ_MAX_LEVEL
        ? "макс. уровень"
        : `следующий: ${fmtMoney(nextBizCost(lv))}`;
      lines.push(`• \`${p.property_id}\` — ур. **${lv}/${BIZ_MAX_LEVEL}** (${bonus}), ${nextLine}`);
    }
  }

  if (mansionRow) {
    const lv = Number(mansionRow.upgrade_level || 0);
    const bonus = `+${Math.round((mansionRentMultiplier(lv) - 1) * 100)}%`;
    const nextLine = lv >= MANSION_MAX_LEVEL ? "макс. уровень" : `следующий: ${fmtMoney(nextMansionCost(lv))}`;
    lines.push("\n**🏰 Особняк**");
    lines.push(`• \`${mansionRow.mansion_id}\` — ур. **${lv}/${MANSION_MAX_LEVEL}** (${bonus}), ${nextLine}`);
  }

  if (aircraft.length) {
    lines.push("\n**✈️ Техника**");
    for (const a of aircraft) {
      const lv = Number(a.upgrade_level || 0);
      const bonus = `+${Math.round((aircraftPayMultiplier(lv) - 1) * 100)}%`;
      const nextLine = lv >= AIRCRAFT_MAX_LEVEL ? "макс. уровень" : `следующий: ${fmtMoney(nextAircraftCost(lv))}`;
      lines.push(`• \`${a.aircraft_id}\` — ур. **${lv}/${AIRCRAFT_MAX_LEVEL}** (${bonus}), ${nextLine}`);
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("🛠 Апгрейды активов")
    .setDescription(lines.join("\n"))
    .setColor(0x3498db)
    .setFooter({ text: "Каждый уровень повышает доход на фиксированный процент." });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function upgradeOne(interaction, db, kind) {
  const userId = interaction.user.id;
  const idArg = kind === "mansion" ? null : String(interaction.options.getString("id", true) || "").trim();

  let cfg;
  if (kind === "business") {
    cfg = {
      table: "samp_properties",
      where: "user_id = ? AND property_id = ?",
      args: [String(userId), idArg],
      maxLevel: BIZ_MAX_LEVEL,
      nextCost: nextBizCost,
      multiplier: bizIncomeMultiplier,
      label: `бизнес \`${idArg}\``,
      ledgerType: "upgrade_business",
      missingMsg: `❌ У тебя нет такого бизнеса: \`${idArg}\`. Смотри \`/play бизнес\` → «Улучшения».`,
      meta: { property_id: idArg },
    };
  } else if (kind === "mansion") {
    cfg = {
      table: "samp_mansions",
      where: "user_id = ?",
      args: [String(userId)],
      maxLevel: MANSION_MAX_LEVEL,
      nextCost: nextMansionCost,
      multiplier: mansionRentMultiplier,
      label: "особняк",
      ledgerType: "upgrade_mansion",
      missingMsg: "❌ У тебя нет особняка. Купи через `/play бизнес` → «Купить особняк».",
      meta: {},
    };
  } else if (kind === "aircraft") {
    cfg = {
      table: "samp_aircraft",
      where: "user_id = ? AND aircraft_id = ?",
      args: [String(userId), idArg],
      maxLevel: AIRCRAFT_MAX_LEVEL,
      nextCost: nextAircraftCost,
      multiplier: aircraftPayMultiplier,
      label: `борт \`${idArg}\``,
      ledgerType: "upgrade_aircraft",
      missingMsg: `❌ У тебя нет такого борта: \`${idArg}\`. Смотри \`/play бизнес\` → «Улучшения».`,
      meta: { aircraft_id: idArg },
    };
  } else {
    await interaction.reply({ content: "Неизвестный тип апгрейда.", ephemeral: true });
    return;
  }

  const row = await dbGet(db, `SELECT upgrade_level FROM ${cfg.table} WHERE ${cfg.where}`, cfg.args);
  if (!row) {
    await interaction.reply({ content: cfg.missingMsg, ephemeral: true });
    return;
  }
  const currentLevel = Number(row.upgrade_level || 0);
  if (currentLevel >= cfg.maxLevel) {
    await interaction.reply({ content: `✅ ${cfg.label} уже на максимальном уровне (${cfg.maxLevel}).`, ephemeral: true });
    return;
  }
  const cost = cfg.nextCost(currentLevel);

  const user = await getSampUser(db, userId);
  if (!user) {
    await interaction.reply({ content: "Сначала зарегистрируйся: /reg", ephemeral: true });
    return;
  }
  if (Number(user.money) < cost) {
    await interaction.reply({
      content: `Не хватает виртов. Цена апгрейда **${fmtMoney(cost)}**, на счету **${fmtMoney(user.money)}**.`,
      ephemeral: true,
    });
    return;
  }

  let newLevel;
  try {
    newLevel = await withSerializedTransaction(db, async () => {
      const fresh = await getSampUser(db, userId);
      if (Number(fresh?.money || 0) < cost) throw new Error("INSUFFICIENT");
      const stillThere = await dbGet(db, `SELECT upgrade_level FROM ${cfg.table} WHERE ${cfg.where}`, cfg.args);
      if (!stillThere) throw new Error("GONE");
      const lv = Number(stillThere.upgrade_level || 0);
      if (lv !== currentLevel) throw new Error("RACED");
      if (lv >= cfg.maxLevel) throw new Error("MAXED");
      await adjustMoney(db, userId, -cost);
      await dbRun(db, `UPDATE ${cfg.table} SET upgrade_level = ? WHERE ${cfg.where}`, [lv + 1, ...cfg.args]);
      await addLedger(db, cfg.ledgerType, userId, null, cost, { ...cfg.meta, new_level: lv + 1 });
      return lv + 1;
    });
  } catch (err) {
    let msg;
    switch (err?.message) {
      case "INSUFFICIENT": msg = "❌ Не хватает виртов (баланс изменился)."; break;
      case "GONE":         msg = "❌ Объект больше не твой."; break;
      case "RACED":        msg = "❌ Уровень изменился, попробуй ещё раз."; break;
      case "MAXED":        msg = "❌ Уже максимальный уровень."; break;
      default:             msg = "❌ Не удалось прокачать. Попробуй позже."; break;
    }
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
    return;
  }

  const after = await getSampUser(db, userId);
  const newBonus = `+${Math.round((cfg.multiplier(newLevel) - 1) * 100)}%`;
  const embed = new EmbedBuilder()
    .setTitle("🛠 Апгрейд установлен")
    .setDescription(`${cfg.label} прокачан до уровня **${newLevel}/${cfg.maxLevel}** (${newBonus} к доходу).`)
    .addFields(
      { name: "Потрачено", value: `**${fmtMoney(cost)}**`, inline: true },
      { name: "Баланс", value: `**${fmtMoney(after?.money || 0)}**`, inline: true },
    )
    .setColor(0x2ecc71)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

async function handleSampUpgradeCommand({ interaction, db }) {
  if (interaction.commandName !== "upgrade") return;
  const sub = interaction.options.getSubcommand(false);
  try {
    if (sub === "list") await handleList(interaction, db);
    else if (sub === "business") await upgradeOne(interaction, db, "business");
    else if (sub === "mansion") await upgradeOne(interaction, db, "mansion");
    else if (sub === "aircraft") await upgradeOne(interaction, db, "aircraft");
    else await interaction.reply({ content: "Неизвестная подкоманда.", ephemeral: true });
  } catch (err) {
    console.error("[samp-upgrade] command error:", sub, err);
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
  ensureUpgradeColumns,
  getUpgradeCommandBuilders,
  handleSampUpgradeCommand,
  UPGRADE_COMMAND_NAMES,
  // Hook helpers for sibling modules
  getBizLevel,
  getMansionLevel,
  getAircraftLevel,
  bizIncomeMultiplier,
  mansionRentMultiplier,
  aircraftPayMultiplier,
  // Exported constants for tests
  BIZ_MAX_LEVEL,
  BIZ_COST_PER_LEVEL,
  BIZ_BONUS_PER_LEVEL,
  MANSION_MAX_LEVEL,
  MANSION_COST_PER_LEVEL,
  MANSION_BONUS_PER_LEVEL,
  AIRCRAFT_MAX_LEVEL,
  AIRCRAFT_COST_PER_LEVEL,
  AIRCRAFT_BONUS_PER_LEVEL,
};
