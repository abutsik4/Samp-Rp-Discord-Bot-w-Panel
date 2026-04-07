"use strict";

const { randomInt } = require("crypto");

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { upsertBadgeDefinition, awardBadge } = require("./badges");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

// Reference to the giveaway message so we can edit it live
let giveawayMessage = null;
// Cached db reference (set on launch)
let _db = null;

const GIVEAWAY_ID = "april_fools_admin_2026";
const GIVEAWAY_BADGE_ID = "april_fools_giveaway_2026";
const BUTTON_CUSTOM_ID = `giveaway_join_${GIVEAWAY_ID}`;
const GIVEAWAY_MESSAGE_KV_KEY = `${GIVEAWAY_ID}:message_id`;
const GIVEAWAY_ENDED_KV_KEY = `${GIVEAWAY_ID}:ended_at`;
const GIVEAWAY_ROLE_KV_KEY = `${GIVEAWAY_ID}:role_id`;
const GIVEAWAY_WINNER_KV_KEY = `${GIVEAWAY_ID}:winner_id`;
const GIVEAWAY_ANNOUNCED_KV_KEY = `${GIVEAWAY_ID}:announced_at`;

// Role to create and assign to all participants at the end
const ROLE_NAME = "\u{1F921} \u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C-\u041A\u043B\u043E\u0443\u043D 2026";
const ROLE_COLOR = 0xff4500; // orange-red

// ── SQLite persistence ──────────────────────────────────────────
async function ensureTable(db) {
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS giveaway_participants (
      giveaway_id TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      joined_at   TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (giveaway_id, user_id)
    )
  `);

  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS bot_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
}

async function setKv(db, key, value) {
  await dbRun(
    db,
    `INSERT INTO bot_kv (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(value)]
  );
}

async function getKv(db, key) {
  const row = await dbGet(db, `SELECT value FROM bot_kv WHERE key = ?`, [key]);
  return row ? row.value : null;
}

async function ensureGiveawayReady(db) {
  if (!db) {
    throw new Error("Giveaway database is not available");
  }

  await ensureTable(db);
  _db = db;
  return db;
}

async function ensureGiveawayTables(db) {
  await ensureGiveawayReady(db);
}

async function getBotMember(guild) {
  return guild.members.me || await guild.members.fetchMe().catch(() => null);
}

async function ensureParticipantRole(guild, db, { createIfMissing = true } = {}) {
  let roleId = await getKv(db, GIVEAWAY_ROLE_KV_KEY);
  let role = null;

  if (roleId) {
    role = await guild.roles.fetch(roleId).catch(() => null);
  }

  if (!role) {
    await guild.roles.fetch().catch(() => null);
    role = guild.roles.cache.find((item) => item.name === ROLE_NAME) || null;
  }

  if (!role && createIfMissing) {
    role = await guild.roles.create({
      name: ROLE_NAME,
      color: ROLE_COLOR,
      reason: "April Fools 2026 Giveaway — Руководитель-Клоун",
      mentionable: false,
    });
  }

  if (role) {
    await setKv(db, GIVEAWAY_ROLE_KV_KEY, role.id);
  }

  return role;
}

async function ensureRoleGrantingAvailable(guild, role) {
  const me = await getBotMember(guild);
  if (!me) {
    throw new Error("Bot member is not available in guild");
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("Bot lacks ManageRoles permission");
  }

  if (!role.editable) {
    throw new Error(`Role ${role.name} is not editable by the bot`);
  }

  return me;
}

async function applyGiveawayRewards(guild, db, guildId, userIds) {
  const role = await ensureParticipantRole(guild, db, { createIfMissing: true });
  if (!role) {
    throw new Error("Could not create or resolve giveaway role");
  }

  await ensureRoleGrantingAvailable(guild, role);

  let assigned = 0;
  let badged = 0;
  let missingMembers = 0;
  let roleFailures = 0;

  for (const userId of userIds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      missingMembers++;
      continue;
    }

    let hasRole = member.roles.cache.has(role.id);
    if (!hasRole) {
      try {
        await member.roles.add(role, "April Fools 2026 Giveaway");
        hasRole = true;
      } catch (err) {
        roleFailures++;
        console.error(`[Giveaway] Failed to assign role to ${userId}:`, err.message);
      }
    }

    if (!hasRole) continue;
    assigned++;

    try {
      const awarded = await awardBadge(db, guildId, userId, GIVEAWAY_BADGE_ID);
      if (awarded) badged++;
    } catch (err) {
      console.error(`[Giveaway] Failed to award badge to ${userId}:`, err.message);
    }
  }

  return {
    role,
    assigned,
    badged,
    missingMembers,
    roleFailures,
  };
}

async function reconcileEndedGiveawayRewards(client, db, guildId) {
  const ended = await getKv(db, GIVEAWAY_ENDED_KV_KEY);
  if (!ended) return null;

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return null;

  const userIds = await getAllParticipants(db);
  if (!userIds.length) return null;

  try {
    const summary = await applyGiveawayRewards(guild, db, guildId, userIds);
    console.log(
      `[Giveaway] Reconciled ended giveaway rewards: role=${summary.assigned}/${userIds.length}, badges=${summary.badged}, missing=${summary.missingMembers}, failures=${summary.roleFailures}`
    );
    return summary;
  } catch (err) {
    console.error("[Giveaway] Reward reconciliation failed:", err.message);
    return null;
  }
}

async function resolveWinnerId(db, userIds) {
  const persistedWinnerId = await getKv(db, GIVEAWAY_WINNER_KV_KEY);
  if (persistedWinnerId && userIds.includes(persistedWinnerId)) {
    return persistedWinnerId;
  }

  const winnerId = userIds[randomInt(userIds.length)];
  await setKv(db, GIVEAWAY_WINNER_KV_KEY, winnerId);
  return winnerId;
}

function buildWinnerAnnouncementEmbed({ winnerId, participantCount, assigned, badged }) {
  return new EmbedBuilder()
    .setTitle("🎯 Итоги розыгрыша — Красная Админка")
    .setDescription(
      `Розыгрыш завершён. Случайный выбор сделан, и сегодня победителем становится <@${winnerId}>.\n\n` +
      `Поздравляем! Если ты готов взять на себя ответственность и стать опорой Руководителю проекта, свяжись с руководством после объявления результатов.\n\n` +
      `Всего участников: **${participantCount}**\n` +
      `Роль **${ROLE_NAME}** выдана: **${assigned}/${participantCount}**\n` +
      `Памятная ачивка выдана: **${badged}**`
    )
    .setColor(0xcc0000)
    .setFooter({ text: "Итоги подведены в 21:00 МСК" })
    .setTimestamp();
}

async function announceGiveawayWinner(client, db, channelId, winnerId, summary, participantCount) {
  const announcedAt = await getKv(db, GIVEAWAY_ANNOUNCED_KV_KEY);
  if (announcedAt) {
    return false;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Could not fetch text channel ${channelId} for giveaway announcement`);
  }

  const embed = buildWinnerAnnouncementEmbed({
    winnerId,
    participantCount,
    assigned: summary.assigned,
    badged: summary.badged,
  });

  await channel.send({
    content: `🎉 Победитель розыгрыша: <@${winnerId}>`,
    embeds: [embed],
  });

  await setKv(db, GIVEAWAY_ANNOUNCED_KV_KEY, new Date().toISOString());
  return true;
}

async function addParticipant(db, userId) {
  await dbRun(
    db,
    `INSERT OR IGNORE INTO giveaway_participants (giveaway_id, user_id) VALUES (?, ?)`,
    [GIVEAWAY_ID, userId]
  );
}

async function hasParticipant(db, userId) {
  const row = await dbGet(
    db,
    `SELECT 1 FROM giveaway_participants WHERE giveaway_id = ? AND user_id = ?`,
    [GIVEAWAY_ID, userId]
  );
  return !!row;
}

async function getParticipantCount(db) {
  const row = await dbGet(
    db,
    `SELECT COUNT(*) as cnt FROM giveaway_participants WHERE giveaway_id = ?`,
    [GIVEAWAY_ID]
  );
  return row ? row.cnt : 0;
}

async function getAllParticipants(db) {
  const rows = await dbAll(
    db,
    `SELECT user_id FROM giveaway_participants WHERE giveaway_id = ?`,
    [GIVEAWAY_ID]
  );
  return rows.map((r) => r.user_id);
}

/**
 * Build the giveaway embed with current participant count.
 */
function buildGiveawayEmbed(participantCount) {
  const countLine = participantCount > 0
    ? `\n\n\u{1F465} \u0423\u0447\u0430\u0441\u0442\u043D\u0438\u043A\u043E\u0432: **${participantCount}**`
    : "";

  return new EmbedBuilder()
    .setTitle("\u{1F389} \u041A\u0440\u0430\u0441\u043D\u0430\u044F \u0410\u0434\u043C\u0438\u043D\u043A\u0430 \u2014 \u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u041F\u0440\u043E\u0435\u043A\u0442\u0430")
    .setDescription(
      "\u0412 \u0440\u0443\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u0435 \u043F\u0440\u043E\u0435\u043A\u0442\u0430 \u043F\u0440\u043E\u0438\u0437\u043E\u0448\u043B\u0438 \u0438\u0437\u043C\u0435\u043D\u0435\u043D\u0438\u044F, \u0438 \u0441\u0435\u0439\u0447\u0430\u0441 \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043C\u0435\u0441\u0442\u043E \u0434\u043B\u044F \u0442\u043E\u0433\u043E, \u043A\u0442\u043E \u0441\u043C\u043E\u0436\u0435\u0442 \u0441\u0442\u0430\u0442\u044C \u043E\u043F\u043E\u0440\u043E\u0439 \u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044E. " +
      "\u0412\u043F\u0435\u0440\u0435\u0434\u0438 \u0440\u0430\u0437\u0432\u0438\u0442\u0438\u0435 samp-rp.ru \u0438 \u043D\u043E\u0432\u044B\u0439 \u0441\u0435\u0440\u0432\u0435\u0440. \u0418\u0442\u043E\u0433\u0438 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u0432\u0435\u0447\u0435\u0440\u043E\u043C.\n\n" +
      "\u041D\u0430\u0436\u043C\u0438 \u043A\u043D\u043E\u043F\u043A\u0443 \u043D\u0438\u0436\u0435, \u0447\u0442\u043E\u0431\u044B \u043F\u0440\u0438\u043D\u044F\u0442\u044C \u0443\u0447\u0430\u0441\u0442\u0438\u0435!" +
      countLine
    )
    .setColor(0xcc0000)
    .setFooter({ text: "\u0418\u0442\u043E\u0433\u0438 \u0431\u0443\u0434\u0443\u0442 \u043F\u043E\u0434\u0432\u0435\u0434\u0435\u043D\u044B \u0432 21:00 \u041C\u0421\u041A" })
    .setTimestamp();
}

function buildJoinButton(disabled = false, participantCount = null) {
  const label = participantCount == null
    ? "Участвовать"
    : `Участвовать (${participantCount})`;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_CUSTOM_ID)
      .setLabel(label)
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Danger)
      .setEmoji("🎲")
      .setDisabled(disabled),
  );
}

async function resolveGiveawayMessage(client, db, channel, { allowSearch = true } = {}) {
  if (giveawayMessage) return giveawayMessage;

  const messageId = await getKv(db, GIVEAWAY_MESSAGE_KV_KEY);
  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null);
    if (existing) {
      giveawayMessage = existing;
      return existing;
    }
  }

  if (!allowSearch) return null;

  const messages = await channel.messages.fetch({ limit: 20 });
  const existing = messages.find(
    (message) =>
      message.author.id === client.user.id &&
      message.components.some((row) => row.components.some((component) => component.customId === BUTTON_CUSTOM_ID))
  );

  if (!existing) return null;

  giveawayMessage = existing;
  await setKv(db, GIVEAWAY_MESSAGE_KV_KEY, existing.id);
  return existing;
}

async function syncGiveawayMessage(client, db, channelId, participantCount) {
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;

  const message = await resolveGiveawayMessage(client, db, channel, { allowSearch: true }).catch((err) => {
    console.error("[Giveaway] Failed to resolve giveaway message:", err.message);
    return null;
  });

  if (!message) return null;

  const ended = await getKv(db, GIVEAWAY_ENDED_KV_KEY);
  const components = [buildJoinButton(Boolean(ended), participantCount)];

  await message.edit({
    embeds: [buildGiveawayEmbed(participantCount)],
    components,
  });

  giveawayMessage = message;
  return message;
}

/**
 * Find an existing giveaway message from the bot in the channel,
 * or send a new one if none exists. This prevents duplicates on restart.
 */
async function launchGiveaway(client, channelId, db) {
  await ensureGiveawayReady(db);

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.error(`[Giveaway] Could not fetch channel ${channelId}`);
    return null;
  }

  const guild = channel.guild || await client.guilds.fetch(channel.guildId).catch(() => null);
  if (guild) {
    try {
      await ensureParticipantRole(guild, db, { createIfMissing: true });
    } catch (err) {
      console.error("[Giveaway] Failed to prepare participant role:", err.message);
    }

    const reconciliation = await reconcileEndedGiveawayRewards(client, db, guild.id).catch(() => null);
    const ended = await getKv(db, GIVEAWAY_ENDED_KV_KEY);
    const winnerId = await getKv(db, GIVEAWAY_WINNER_KV_KEY);
    const participantCount = await getParticipantCount(db);
    if (ended && winnerId && reconciliation) {
      await announceGiveawayWinner(client, db, channelId, winnerId, reconciliation, participantCount).catch((err) => {
        console.error("[Giveaway] Failed to announce persisted winner:", err.message);
      });
    }
  }

  const count = await getParticipantCount(db);
  const ended = await getKv(db, GIVEAWAY_ENDED_KV_KEY);

  // Check recent messages for an existing giveaway post from this bot
  try {
    const existing = await resolveGiveawayMessage(client, db, channel, { allowSearch: true });

    if (existing) {
      await existing.edit({
        embeds: [buildGiveawayEmbed(count)],
        components: [buildJoinButton(Boolean(ended), count)],
      }).catch(() => {});
      console.log(`[Giveaway] Found existing message ${existing.id} — reusing it (${count} participants in DB)`);
      return existing;
    }
  } catch (err) {
    console.error("[Giveaway] Failed to search for existing message:", err.message);
  }

  // No existing message found \u2014 post a new one
  const embed = buildGiveawayEmbed(count);

  giveawayMessage = await channel.send({
    embeds: [embed],
    components: [buildJoinButton(Boolean(ended), count)],
  });
  await setKv(db, GIVEAWAY_MESSAGE_KV_KEY, giveawayMessage.id);
  console.log(`[Giveaway] Launched in #${channel.name} (${channelId}), message ${giveawayMessage.id}`);
  return giveawayMessage;
}

/**
 * Handle button interaction for giveaway participation.
 * Returns true if handled, false otherwise.
 */
async function handleGiveawayButton(interaction) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== BUTTON_CUSTOM_ID) return false;

  const db = _db;
  if (!db) {
    await interaction.reply({
      content: "⚠️ Розыгрыш ещё инициализируется. Нажми кнопку ещё раз через пару секунд.",
      ephemeral: true,
    }).catch(() => {});
    return true;
  }

  await interaction.deferReply({ ephemeral: true }).catch(() => null);

  try {
    await ensureGiveawayReady(db);
  } catch (err) {
    console.error("[Giveaway] Failed to initialize storage:", err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("⚠️ Не удалось подготовить розыгрыш. Попробуй ещё раз через минуту.").catch(() => {});
    }
    return true;
  }

  const ended = await getKv(db, GIVEAWAY_ENDED_KV_KEY);
  if (ended) {
    await interaction.editReply("⏱️ Розыгрыш уже завершён. Итоги подведены.").catch(() => {});
    return true;
  }

  const userId = interaction.user.id;

  try {
    if (await hasParticipant(db, userId)) {
      const count = await getParticipantCount(db);
      await syncGiveawayMessage(interaction.client, db, interaction.channelId, count).catch(() => null);
      await interaction.editReply("✅ Ты уже участвуешь в розыгрыше. Жди итогов в 21:00 МСК.").catch(() => {});
      return true;
    }

    await addParticipant(db, userId);
    const count = await getParticipantCount(db);
    console.log(`[Giveaway] +1 participant: ${userId} (total: ${count})`);

    await syncGiveawayMessage(interaction.client, db, interaction.channelId, count).catch((err) => {
      console.error("[Giveaway] Failed to sync giveaway message:", err.message);
    });

    await interaction.editReply(`🎉 Ты записан! Участников: **${count}**. Итоги в 21:00 МСК.`).catch(() => {});
  } catch (err) {
    console.error("[Giveaway] Failed to handle participant:", err);
    await interaction.editReply("⚠️ Не удалось записать участие. Попробуй ещё раз через пару секунд.").catch(() => {});
  }

  return true;
}

/**
 * End the giveaway: create a role, assign it to all participants, award badge.
 * Called by the scheduler at 9 PM MSK.
 */
async function endGiveaway(client, db, channelId, guildId) {
  console.log("[Giveaway] Ending giveaway...");

  await ensureGiveawayReady(db);

  const ended = await getKv(db, GIVEAWAY_ENDED_KV_KEY);
  if (ended) {
    console.log(`[Giveaway] Already ended at ${ended}`);
    return;
  }

  const userIds = await getAllParticipants(db);
  if (userIds.length === 0) {
    console.log("[Giveaway] No participants.");
    await setKv(db, GIVEAWAY_ENDED_KV_KEY, new Date().toISOString());
    await syncGiveawayMessage(client, db, channelId, 0).catch(() => null);
    return;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error(`[Giveaway] Guild ${guildId} not found`);
    return;
  }

  // Ensure badge definition exists
  try {
    await upsertBadgeDefinition(db, guildId, {
      id: GIVEAWAY_BADGE_ID,
      type: "event",
      threshold: 0,
      name: "\u0420\u0443\u043A\u043E\u0432\u043E\u0434\u0438\u0442\u0435\u043B\u044C-\u041A\u043B\u043E\u0443\u043D",
      emoji: "\u{1F921}",
      description: "\u0423\u0447\u0430\u0441\u0442\u0432\u043E\u0432\u0430\u043B \u0432 \u0440\u043E\u0437\u044B\u0433\u0440\u044B\u0448\u0435 \u043D\u0430 \u041A\u0440\u0430\u0441\u043D\u0443\u044E \u0410\u0434\u043C\u0438\u043D\u043A\u0443 1 \u0430\u043F\u0440\u0435\u043B\u044F 2026",
    });
  } catch (err) {
    console.error("[Giveaway] Failed to upsert badge:", err);
  }

  let rewardSummary;
  try {
    rewardSummary = await applyGiveawayRewards(guild, db, guildId, userIds);
  } catch (err) {
    console.error("[Giveaway] Failed to apply role rewards:", err.message);
    return;
  }

  const winnerId = await resolveWinnerId(db, userIds);

  const { role, assigned, badged, missingMembers, roleFailures } = rewardSummary;

  console.log(
    `[Giveaway] Winner=${winnerId}; role ${role.id} to ${assigned}/${userIds.length}, badges=${badged}, missing=${missingMembers}, failures=${roleFailures}`
  );
  await setKv(db, GIVEAWAY_ENDED_KV_KEY, new Date().toISOString());

  // Disable the button on the giveaway message
  await syncGiveawayMessage(client, db, channelId, userIds.length).catch((err) => {
    console.error("[Giveaway] Failed to disable button:", err.message);
  });

  await announceGiveawayWinner(client, db, channelId, winnerId, rewardSummary, userIds.length).catch((err) => {
    console.error("[Giveaway] Failed to announce winner:", err.message);
  });
}

/**
 * Schedule the giveaway to end at 9 PM Moscow time (UTC+3) today.
 */
function scheduleGiveawayEnd(client, db, channelId, guildId) {
  const now = new Date();
  // 9 PM Moscow = 18:00 UTC
  const endTime = new Date(now);
  endTime.setUTCHours(18, 0, 0, 0);

  // If 9 PM MSK already passed today, end in 1 minute (for testing / late start)
  if (endTime <= now) {
    console.log("[Giveaway] 9 PM MSK already passed \u2014 scheduling end in 1 minute");
    endTime.setTime(now.getTime() + 60_000);
  }

  const ms = endTime.getTime() - now.getTime();
  const minutesUntil = Math.round(ms / 60_000);
  console.log(`[Giveaway] Scheduled end at ${endTime.toISOString()} (in ~${minutesUntil} min)`);

  setTimeout(() => {
    endGiveaway(client, db, channelId, guildId).catch((err) => {
      console.error("[Giveaway] End failed:", err);
    });
  }, ms);
}

module.exports = {
  ensureGiveawayTables,
  launchGiveaway,
  handleGiveawayButton,
  endGiveaway,
  scheduleGiveawayEnd,
};
