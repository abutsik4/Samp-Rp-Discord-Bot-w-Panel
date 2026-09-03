"use strict";

/**
 * Public announcement layer — Phase 1 of REVIVAL_PLAN.md.
 *
 * Before this module, no gameplay or scheduler code ever posted to a channel:
 * every outcome was a private interaction reply, and background systems
 * (lottery draws, protection racket, territory decay) were completely silent.
 * A Discord economy game with no spectators has no social loop.
 *
 * Everything here is best-effort and never throws into a caller — an
 * announcement failing must never break the gameplay action that triggered it.
 *
 * Main chat resolution order:
 *   1. bot_kv key `game:main_chat_channel_id:<guildId>` (set via setMainChatChannelId)
 *   2. bot_kv key `game:main_chat_channel_id`           (guild-agnostic override)
 *   3. env MAIN_CHAT_CHANNEL_ID
 *   4. DEFAULT_MAIN_CHAT_CHANNEL_ID
 */

const { dbRun, dbGet } = require("../utils/db-helpers");

// Current main chat for the SAMP-RP community guild. Overridable at runtime.
const DEFAULT_MAIN_CHAT_CHANNEL_ID = "541024085283700741";

const KV_PREFIX = "game:main_chat_channel_id";

// -- Config -------------------------------------------------------------------

async function getMainChatChannelId(db, guildId = null) {
  try {
    if (guildId) {
      const scoped = await dbGet(db, `SELECT value FROM bot_kv WHERE key = ?`, [`${KV_PREFIX}:${guildId}`]);
      if (scoped?.value) return String(scoped.value);
    }
    const global = await dbGet(db, `SELECT value FROM bot_kv WHERE key = ?`, [KV_PREFIX]);
    if (global?.value) return String(global.value);
  } catch (_) { /* kv unavailable — fall through to env/default */ }

  return String(process.env.MAIN_CHAT_CHANNEL_ID || DEFAULT_MAIN_CHAT_CHANNEL_ID);
}

async function setMainChatChannelId(db, guildId, channelId) {
  const key = guildId ? `${KV_PREFIX}:${guildId}` : KV_PREFIX;
  await dbRun(
    db,
    `INSERT INTO bot_kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(channelId)]
  );
}

// -- Sending ------------------------------------------------------------------

/**
 * Resolve the main-chat channel object, or null if unreachable.
 */
async function resolveMainChat(client, db, guildId = null) {
  try {
    const channelId = await getMainChatChannelId(db, guildId);
    if (!channelId) return null;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof channel.isTextBased !== "function" || !channel.isTextBased()) return null;
    return channel;
  } catch (_) {
    return null;
  }
}

/**
 * Post to main chat. Returns the sent Message, or null on any failure.
 *
 * @param {object} client  discord.js client
 * @param {object} db      sqlite handle
 * @param {object} payload anything Channel#send accepts ({ content }, { embeds }, ...)
 * @param {object} [opts]
 * @param {string} [opts.guildId]
 */
async function announceToMainChat(client, db, payload, { guildId = null } = {}) {
  try {
    const channel = await resolveMainChat(client, db, guildId);
    if (!channel) return null;
    return await channel.send(payload);
  } catch (err) {
    console.error("[announce] main chat send failed:", err?.message || err);
    return null;
  }
}

// -- Throttling ---------------------------------------------------------------

/**
 * Rate-limit a recurring announcement feed.
 *
 * Background feeds run on timers that know nothing about how busy chat is. The
 * stock ticker, for example, fires ~29 news events a day; announcing even the
 * dramatic third of those put ~9 bot posts into a channel that averages ~20
 * human messages a day, so the bot became the loudest voice in the room.
 *
 * State is a single bot_kv row per feed key: the last send time and a per-day
 * counter that resets on date change (UTC).
 *
 * @param {string} key         feed identifier, e.g. "stocks"
 * @param {object} opts
 * @param {number} opts.minGapMs    minimum spacing between sends
 * @param {number} opts.maxPerDay   hard ceiling per UTC day
 * @returns {Promise<boolean>} true if the caller may send now
 */
async function claimAnnounceSlot(db, key, { minGapMs = 0, maxPerDay = Infinity } = {}) {
  const kvKey = `announce:throttle:${key}`;
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  let state = { last: 0, day: today, count: 0 };
  try {
    const row = await dbGet(db, `SELECT value FROM bot_kv WHERE key = ?`, [kvKey]);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed === "object") state = { ...state, ...parsed };
    }
  } catch (_) { /* unreadable state — treat as fresh */ }

  if (state.day !== today) state = { last: state.last || 0, day: today, count: 0 };

  if (state.count >= maxPerDay) return false;
  if (minGapMs > 0 && now - Number(state.last || 0) < minGapMs) return false;

  const next = { last: now, day: today, count: Number(state.count || 0) + 1 };
  try {
    await dbRun(
      db,
      `INSERT INTO bot_kv (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [kvKey, JSON.stringify(next)]
    );
  } catch (err) {
    console.error("[announce] throttle persist failed:", err?.message || err);
    return false; // fail closed: better silent than spamming
  }
  return true;
}

/**
 * announceToMainChat guarded by claimAnnounceSlot. No-ops when rate limited.
 */
async function announceThrottled(client, db, key, payload, { guildId = null, minGapMs = 0, maxPerDay = Infinity } = {}) {
  const allowed = await claimAnnounceSlot(db, key, { minGapMs, maxPerDay });
  if (!allowed) return null;
  return announceToMainChat(client, db, payload, { guildId });
}

/**
 * Announce a noteworthy gameplay moment triggered by an interaction.
 *
 * The interaction's own reply stays where it is (the player still gets their
 * detailed result); this adds a short public line so the rest of the server
 * sees that something happened. If the interaction already happened in main
 * chat, we skip — the reply is public there already and a duplicate would be
 * noise.
 *
 * @param {object} interaction
 * @param {object} db
 * @param {string|object} payload  string content or a Channel#send payload
 * @param {object} [opts]
 * @param {number} [opts.amount]     value of the event; compared against threshold
 * @param {number} [opts.threshold]  minimum amount required to announce
 */
async function announceMoment(interaction, db, payload, { amount = null, threshold = 0 } = {}) {
  try {
    if (amount !== null && Number(amount) < Number(threshold)) return null;

    const client = interaction.client;
    const guildId = interaction.guild?.id || null;
    const mainChatId = await getMainChatChannelId(db, guildId);

    // Already visible where it happened.
    if (interaction.channelId === mainChatId) return null;

    const body = typeof payload === "string" ? { content: payload } : payload;
    return await announceToMainChat(client, db, body, { guildId });
  } catch (err) {
    console.error("[announce] moment failed:", err?.message || err);
    return null;
  }
}

module.exports = {
  DEFAULT_MAIN_CHAT_CHANNEL_ID,
  getMainChatChannelId,
  setMainChatChannelId,
  resolveMainChat,
  announceToMainChat,
  announceThrottled,
  claimAnnounceSlot,
  announceMoment,
};
