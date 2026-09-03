"use strict";

/**
 * Street Events — ambient, zero-command gameplay in main chat.
 *
 * Rationale (see REVIVAL_PLAN.md): the single most successful thing this bot
 * has ever done was the April Fools giveaway — one public, timed, one-click
 * event that reached 70 users, more people than have *ever* run /reg. Meanwhile
 * the 97-command game reached 3 active players.
 *
 * A street event drops into main chat on its own schedule. Anyone can claim it
 * with one button press — no registration required up front, because claiming
 * *is* the registration. That is the conversion funnel: chatter -> one click ->
 * player with money in their pocket.
 *
 * Claims are first-come-first-served and settled with a conditional UPDATE, so
 * two simultaneous clicks cannot both win.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { announceToMainChat, resolveMainChat } = require("./announce");
const { getOrCreateUser, adjustMoney, addLedger, fmtMoney } = require("./samp-life");

const BUTTON_PREFIX = "street";

// How long a drop stays claimable.
const EVENT_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Community is Russian (MSK = UTC+3). Only drop while people are awake:
// 12:00–23:00 MSK == 09:00–20:00 UTC.
const ACTIVE_HOURS_UTC = { start: 9, end: 20 };

/**
 * Event templates. `reward` is a [min, max] range rolled at drop time.
 * Kept deliberately modest — these are hooks, not an income source. The point
 * is the notification and the click, not the money.
 */
const EVENT_KINDS = [
  {
    id: "briefcase",
    emoji: "💼",
    title: "Потерянный дипломат",
    body: "Возле Grove Street кто-то обронил дипломат. Внутри — наличка.",
    button: "Забрать дипломат",
    reward: [3_000, 9_000],
    claimText: (user, amount) => `💼 <@${user}> первым добежал до дипломата и забрал **${fmtMoney(amount)}**.`,
  },
  {
    id: "stash",
    emoji: "📦",
    title: "Тайник под мостом",
    body: "Под мостом в Los Santos заметили свежий тайник. Пока никто не видит...",
    button: "Вскрыть тайник",
    reward: [2_000, 7_000],
    claimText: (user, amount) => `📦 <@${user}> вскрыл тайник и вынес **${fmtMoney(amount)}**.`,
  },
  {
    id: "armored",
    emoji: "🚐",
    title: "Инкассаторская застряла",
    body: "Инкассаторская машина заглохла на выезде из Idlewood. Дверь открыта.",
    button: "Подойти ближе",
    reward: [5_000, 14_000],
    claimText: (user, amount) => `🚐 <@${user}> успел раньше копов и поднял **${fmtMoney(amount)}**.`,
  },
  {
    id: "payphone",
    emoji: "☎️",
    title: "Звонок в таксофоне",
    body: "Таксофон в Ganton надрывается уже пять минут. Кто-то хочет что-то предложить.",
    button: "Снять трубку",
    reward: [1_500, 5_000],
    claimText: (user, amount) => `☎️ <@${user}> снял трубку, выслушал наводку и заработал **${fmtMoney(amount)}**.`,
  },
  {
    id: "race_pink",
    emoji: "🏁",
    title: "Уличная сходка",
    body: "На парковке Santa Maria собрались гонщики и скинулись в общий банк.",
    button: "Заявиться",
    reward: [4_000, 11_000],
    claimText: (user, amount) => `🏁 <@${user}> забрал банк сходки — **${fmtMoney(amount)}**.`,
  },
];

// -- Schema -------------------------------------------------------------------

async function ensureStreetEventTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_street_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      kind TEXT NOT NULL,
      reward INTEGER NOT NULL,
      claimed_by TEXT,
      claimed_at TEXT,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
  await dbRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_street_events_open
     ON samp_street_events(claimed_by, expires_at)`
  );
}

// -- Helpers ------------------------------------------------------------------

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isActiveHourUtc(date = new Date()) {
  const h = date.getUTCHours();
  return h >= ACTIVE_HOURS_UTC.start && h < ACTIVE_HOURS_UTC.end;
}

function buildDropEmbed(kind, reward, expiresAtMs) {
  return new EmbedBuilder()
    .setTitle(`${kind.emoji} ${kind.title}`)
    .setDescription(
      `${kind.body}\n\n`
      + `Первый, кто нажмёт кнопку, забирает **${fmtMoney(reward)}**.\n`
      + `_Регистрация не нужна — если ты ещё не в игре, тебя заведут автоматически._`
    )
    .setColor(0xf1c40f)
    .setFooter({ text: "Успей до" })
    .setTimestamp(new Date(expiresAtMs));
}

function buildClaimedEmbed(kind, reward, claimerId) {
  return new EmbedBuilder()
    .setTitle(`${kind.emoji} ${kind.title} — забрали`)
    .setDescription(kind.claimText(claimerId, reward))
    .setColor(0x2ecc71)
    .setTimestamp();
}

function buildExpiredEmbed(kind) {
  return new EmbedBuilder()
    .setTitle(`${kind.emoji} ${kind.title} — упущено`)
    .setDescription("Никто не успел. В следующий раз будь быстрее.")
    .setColor(0x7f8c8d)
    .setTimestamp();
}

function buildRow(eventId, kind, { disabled = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BUTTON_PREFIX}:${eventId}`)
      .setLabel(kind.button)
      .setEmoji(kind.emoji)
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

function kindById(id) {
  return EVENT_KINDS.find((k) => k.id === id) || EVENT_KINDS[0];
}

// -- Dropping -----------------------------------------------------------------

/**
 * Drop a street event into main chat. Returns the event row id, or null if it
 * could not be posted.
 */
async function dropStreetEvent(client, db, { guildId = null, kindId = null, force = false } = {}) {
  try {
    if (!force && !isActiveHourUtc()) return null;

    await ensureStreetEventTables(db);

    // Never stack drops — one open event at a time keeps main chat clean.
    const open = await dbGet(
      db,
      `SELECT id FROM samp_street_events WHERE claimed_by IS NULL AND expires_at > ?`,
      [Date.now()]
    );
    if (open) return null;

    const channel = await resolveMainChat(client, db, guildId);
    if (!channel) return null;

    const kind = kindId ? kindById(kindId) : pick(EVENT_KINDS);
    const reward = randInt(kind.reward[0], kind.reward[1]);
    const expiresAt = Date.now() + EVENT_TTL_MS;

    const result = await dbRun(
      db,
      `INSERT INTO samp_street_events (guild_id, channel_id, kind, reward, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [guildId, channel.id, kind.id, reward, expiresAt]
    );
    const eventId = result.lastID;

    const message = await channel.send({
      embeds: [buildDropEmbed(kind, reward, expiresAt)],
      components: [buildRow(eventId, kind)],
    });

    await dbRun(db, `UPDATE samp_street_events SET message_id = ? WHERE id = ?`, [message.id, eventId]);
    console.log(`[StreetEvents] dropped ${kind.id} (#${eventId}) worth ${reward} in ${channel.id}`);
    return eventId;
  } catch (err) {
    console.error("[StreetEvents] drop failed:", err?.message || err);
    return null;
  }
}

// -- Claiming -----------------------------------------------------------------

/**
 * Handle a street-event button press. Returns true if this interaction was ours.
 */
async function handleStreetEventButton(interaction, db) {
  if (!interaction.isButton?.()) return false;
  const customId = String(interaction.customId || "");
  if (!customId.startsWith(`${BUTTON_PREFIX}:`)) return false;

  const eventId = Number(customId.split(":")[1]);
  if (!Number.isFinite(eventId)) return true;

  const userId = interaction.user.id;

  try {
    const event = await dbGet(db, `SELECT * FROM samp_street_events WHERE id = ?`, [eventId]);
    if (!event) {
      await interaction.reply({ content: "Это событие уже неактуально.", ephemeral: true });
      return true;
    }

    if (event.expires_at <= Date.now() && !event.claimed_by) {
      await interaction.reply({ content: "⌛ Поздно — момент упущен.", ephemeral: true });
      return true;
    }

    // Atomic first-come-first-served claim: only succeeds while unclaimed.
    const claim = await dbRun(
      db,
      `UPDATE samp_street_events
       SET claimed_by = ?, claimed_at = datetime('now')
       WHERE id = ? AND claimed_by IS NULL AND expires_at > ?`,
      [userId, eventId, Date.now()]
    );

    if (!claim.changes) {
      const winner = await dbGet(db, `SELECT claimed_by FROM samp_street_events WHERE id = ?`, [eventId]);
      const who = winner?.claimed_by ? `<@${winner.claimed_by}>` : "кто-то другой";
      await interaction.reply({ content: `Уже забрали — ${who} успел раньше.`, ephemeral: true });
      return true;
    }

    // Claiming registers you. This is the whole point of the feature.
    const before = await getOrCreateUser(db, userId);
    const isNewPlayer = Number(before?.money || 0) === 500 && !before?.last_samp_seen_at;

    const reward = Number(event.reward || 0);
    await adjustMoney(db, userId, reward);
    await addLedger(db, "street_event", null, userId, reward, { event_id: eventId, kind: event.kind });

    const kind = kindById(event.kind);

    // Rewrite the drop so the whole channel sees who won.
    await interaction.update({
      embeds: [buildClaimedEmbed(kind, reward, userId)],
      components: [buildRow(eventId, kind, { disabled: true })],
    }).catch(() => null);

    const welcome = isNewPlayer
      ? "\n\n🎉 Ты только что завёл персонажа в SAMP Life! Посмотри `/quest`, чтобы освоиться."
      : "";
    await interaction.followUp({
      content: `Ты забрал **${fmtMoney(reward)}**.${welcome}`,
      ephemeral: true,
    }).catch(() => null);

    return true;
  } catch (err) {
    console.error("[StreetEvents] claim failed:", err?.message || err);
    try {
      await interaction.reply({ content: "Что-то пошло не так. Попробуй ещё раз.", ephemeral: true });
    } catch (_) { /* interaction already consumed */ }
    return true;
  }
}

// -- Expiry sweep -------------------------------------------------------------

/**
 * Close out drops nobody claimed, so a stale button never sits in chat.
 */
async function sweepExpiredStreetEvents(client, db) {
  try {
    await ensureStreetEventTables(db);
    const stale = await dbAll(
      db,
      `SELECT * FROM samp_street_events
       WHERE claimed_by IS NULL AND expires_at <= ? AND message_id IS NOT NULL`,
      [Date.now()]
    );

    for (const event of stale) {
      const kind = kindById(event.kind);
      try {
        const channel = await client.channels.fetch(event.channel_id).catch(() => null);
        const message = channel ? await channel.messages.fetch(event.message_id).catch(() => null) : null;
        if (message) {
          await message.edit({
            embeds: [buildExpiredEmbed(kind)],
            components: [buildRow(event.id, kind, { disabled: true })],
          }).catch(() => null);
        }
      } catch (_) { /* message gone — nothing to tidy */ }

      // Mark handled so we do not re-sweep it forever.
      await dbRun(db, `UPDATE samp_street_events SET claimed_by = '__expired__' WHERE id = ?`, [event.id]);
    }
  } catch (err) {
    console.error("[StreetEvents] sweep failed:", err?.message || err);
  }
}

module.exports = {
  EVENT_KINDS,
  EVENT_TTL_MS,
  ensureStreetEventTables,
  dropStreetEvent,
  handleStreetEventButton,
  sweepExpiredStreetEvents,
  isActiveHourUtc,
  announceToMainChat, // re-exported for convenience in schedulers
};
