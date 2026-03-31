"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

/**
 * Seasonal Events System
 * Monthly themed events: double XP, turf wars, holiday heists, etc.
 * Managed via panel, toggleable per guild.
 */

const EVENT_TYPES = {
  double_xp: {
    name: "Двойной XP",
    emoji: "⚡",
    description: "Удвоенный XP за все действия",
    color: 0xf1c40f,
  },
  double_money: {
    name: "Двойные вирты",
    emoji: "💰",
    description: "Удвоенные выплаты за работу и грабежи",
    color: 0x2ecc71,
  },
  turf_wars: {
    name: "Войны районов",
    emoji: "🔫",
    description: "Бонусы за PvP дуэли и гонки",
    color: 0xe74c3c,
  },
  heist_weekend: {
    name: "Ограбление века",
    emoji: "🏦",
    description: "Повышенные выплаты за ограбления",
    color: 0x9b59b6,
  },
  lucky_streak: {
    name: "Полоса удачи",
    emoji: "🍀",
    description: "Увеличенные шансы в казино",
    color: 0x1abc9c,
  },
};

async function ensureSeasonalEventsTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS seasonal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      name TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      multiplier REAL NOT NULL DEFAULT 2.0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_seasonal_events_guild ON seasonal_events(guild_id, active)`);
}

/**
 * Get currently active events for a guild.
 */
async function getActiveEvents(db, guildId) {
  const rows = await dbAll(
    db,
    `SELECT * FROM seasonal_events
     WHERE guild_id = ? AND active = 1
     AND datetime('now') BETWEEN starts_at AND ends_at
     ORDER BY starts_at`,
    [guildId]
  );
  return rows || [];
}

/**
 * Check if a specific event type is active.
 */
async function isEventActive(db, guildId, eventType) {
  const row = await dbGet(
    db,
    `SELECT multiplier FROM seasonal_events
     WHERE guild_id = ? AND event_type = ? AND active = 1
     AND datetime('now') BETWEEN starts_at AND ends_at`,
    [guildId, eventType]
  );
  return row ? { active: true, multiplier: row.multiplier } : { active: false, multiplier: 1.0 };
}

/**
 * Create a new seasonal event (admin/panel use).
 */
async function createEvent(db, guildId, { eventType, name, startsAt, endsAt, multiplier = 2.0 }) {
  const type = String(eventType || "").trim();
  if (!EVENT_TYPES[type]) throw new Error("Unknown event type: " + type);

  await dbRun(
    db,
    `INSERT INTO seasonal_events (guild_id, event_type, name, starts_at, ends_at, multiplier)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [guildId, type, name || EVENT_TYPES[type].name, startsAt, endsAt, multiplier]
  );
  return { ok: true };
}

/**
 * End an event early.
 */
async function endEvent(db, eventId) {
  await dbRun(db, `UPDATE seasonal_events SET active = 0 WHERE id = ?`, [eventId]);
  return { ok: true };
}

/**
 * Get upcoming and past events for a guild.
 */
async function listEvents(db, guildId, limit = 10) {
  return await dbAll(
    db,
    `SELECT * FROM seasonal_events
     WHERE guild_id = ?
     ORDER BY starts_at DESC LIMIT ?`,
    [guildId, limit]
  );
}

function getSeasonalEventCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("events")
      .setDescription("SAMP Life: активные события и бонусы"),
  ];
}

async function handleEventsCommand(interaction, db) {
  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.reply({ content: "Команда доступна только на сервере.", ephemeral: true });
    return;
  }

  const events = await getActiveEvents(db, guildId);

  if (!events.length) {
    await interaction.reply({
      content: "📅 Сейчас нет активных событий. Следи за анонсами!",
      ephemeral: false,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🎉 Активные события San Andreas")
    .setColor(0xf1c40f)
    .setTimestamp();

  for (const evt of events) {
    const typeInfo = EVENT_TYPES[evt.event_type] || {};
    const endsAt = new Date(evt.ends_at);
    const remaining = endsAt - new Date();
    const hoursLeft = Math.max(0, Math.ceil(remaining / 3600000));

    embed.addFields({
      name: `${typeInfo.emoji || "🎮"} ${evt.name}`,
      value: `${typeInfo.description || ""}\nМножитель: **x${evt.multiplier}**\nОсталось: **${hoursLeft}ч**`,
      inline: false,
    });
  }

  await interaction.reply({ embeds: [embed] });
}

module.exports = {
  EVENT_TYPES,
  ensureSeasonalEventsTables,
  getActiveEvents,
  isEventActive,
  createEvent,
  endEvent,
  listEvents,
  getSeasonalEventCommandBuilders,
  handleEventsCommand,
};
