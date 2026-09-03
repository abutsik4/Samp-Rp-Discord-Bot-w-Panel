"use strict";

/**
 * Chat Bridge — connects chatting to the game, and surfaces the samp-rp.su
 * 5,000-message forum award as a visible, tracked goal.
 *
 * Two problems this solves (see REVIVAL_PLAN.md):
 *
 * 1. The chat XP system reaches ~380 people. The game reaches 3. They were
 *    completely disconnected: chatting earned XP that bought nothing, and the
 *    game ignored chat entirely. Message milestones now pay in-game cash, so
 *    the large audience is continuously nudged into the small one.
 *
 * 2. The community's forum award at 5,000 Discord messages is, right now,
 *    effectively invisible and unreachable — the highest tracked count in the
 *    whole guild is under 1,000. One distant cliff motivates nobody. This
 *    module breaks the road to 5,000 into visible ranks with rewards at each
 *    step, and gives players a progress command with a realistic ETA.
 *
 * NOTE ON COUNTS: `user_stats.message_count` is the canonical counter used by
 * badges and milestones, but it currently disagrees with
 * `daily_channel_stats` by roughly 2.4x (4,605 vs 11,249 guild-wide). Until
 * that is reconciled, the forum-award progress shown here uses the *higher*
 * of the two, so no player is ever told they have fewer messages than they
 * actually posted. See getMessageCount().
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { getOrCreateUser, adjustMoney, addLedger, fmtMoney } = require("./samp-life");

// The samp-rp.su forum award threshold.
const FORUM_AWARD_TARGET = 5_000;
const FORUM_AWARD_URL = "https://samp-rp.su";

/**
 * The road to the forum award, broken into reachable ranks.
 * `cash` is paid once, in-game, when the rank is first reached.
 */
const CHAT_RANKS = [
  { at: 100,   name: "Новичок района",   emoji: "🚶", cash: 5_000 },
  { at: 250,   name: "Свой на районе",   emoji: "👟", cash: 10_000 },
  { at: 500,   name: "Постоянный",       emoji: "🗣", cash: 20_000 },
  { at: 1_000, name: "Голос Grove",      emoji: "📢", cash: 40_000 },
  { at: 1_500, name: "Старожил",         emoji: "🏘", cash: 60_000 },
  { at: 2_500, name: "Ветеран чата",     emoji: "🎖", cash: 100_000 },
  { at: 3_500, name: "Легенда района",   emoji: "🌟", cash: 150_000 },
  { at: 5_000, name: "Награда форума",   emoji: "🏆", cash: 300_000 },
];

// -- Schema -------------------------------------------------------------------

async function ensureChatBridgeTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_chat_rank_claims (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rank_at INTEGER NOT NULL,
      cash INTEGER NOT NULL DEFAULT 0,
      awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, user_id, rank_at)
    )`
  );
}

// -- Counting -----------------------------------------------------------------

/**
 * Best available message count for a user.
 *
 * Deliberately takes the max of the two disagreeing sources rather than
 * picking one: under-reporting a player's progress toward a real-world forum
 * award is far worse than over-reporting it.
 */
async function getMessageCount(db, guildId, userId) {
  let canonical = 0;
  let daily = 0;

  try {
    const row = await dbGet(
      db,
      `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    canonical = Number(row?.message_count || 0);
  } catch (_) { /* table missing — treat as zero */ }

  try {
    const row = await dbGet(
      db,
      `SELECT SUM(count) AS c FROM daily_channel_stats WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    daily = Number(row?.c || 0);
  } catch (_) { /* table missing — treat as zero */ }

  return Math.max(canonical, daily);
}

// -- Ranks --------------------------------------------------------------------

function rankForCount(count) {
  let current = null;
  let next = null;
  for (const rank of CHAT_RANKS) {
    if (count >= rank.at) current = rank;
    else { next = rank; break; }
  }
  return { current, next };
}

/**
 * Award any chat ranks the user has newly reached. Idempotent — each rank pays
 * at most once per user, enforced by the primary key.
 *
 * @returns {Promise<Array<{rank, cash}>>} newly awarded ranks (usually 0 or 1)
 */
async function awardChatRanks(db, guildId, userId, count) {
  const awarded = [];
  const eligible = CHAT_RANKS.filter((r) => count >= r.at);
  if (eligible.length === 0) return awarded;

  await ensureChatBridgeTables(db);

  const claimedRows = await dbAll(
    db,
    `SELECT rank_at FROM samp_chat_rank_claims WHERE guild_id = ? AND user_id = ?`,
    [guildId, userId]
  );
  const claimed = new Set((claimedRows || []).map((r) => Number(r.rank_at)));

  // First time we see this user, backfill everything they already passed
  // silently — nobody should get eight pings and a windfall at once.
  const isBackfill = claimed.size === 0 && eligible.length > 1;

  for (const rank of eligible) {
    if (claimed.has(rank.at)) continue;

    const insert = await dbRun(
      db,
      `INSERT OR IGNORE INTO samp_chat_rank_claims (guild_id, user_id, rank_at, cash)
       VALUES (?, ?, ?, ?)`,
      [guildId, userId, rank.at, isBackfill ? 0 : rank.cash]
    );
    if (!insert.changes) continue; // raced with another message

    if (isBackfill) continue; // recorded, but not paid and not announced

    try {
      await getOrCreateUser(db, userId);
      await adjustMoney(db, userId, rank.cash);
      await addLedger(db, "chat_rank", null, userId, rank.cash, { rank_at: rank.at, rank: rank.name });
      awarded.push({ rank, cash: rank.cash });
    } catch (err) {
      console.error("[ChatBridge] rank payout failed:", err?.message || err);
    }
  }

  return awarded;
}

// -- Presentation -------------------------------------------------------------

function progressBar(count, target, width = 20) {
  const ratio = Math.max(0, Math.min(1, count / target));
  const filled = Math.round(ratio * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${Math.floor(ratio * 100)}%`;
}

function buildRankUpEmbed(userId, rank, cash, count) {
  const isForumAward = rank.at >= FORUM_AWARD_TARGET;
  const embed = new EmbedBuilder()
    .setTitle(`${rank.emoji} ${isForumAward ? "НАГРАДА ФОРУМА!" : "Новый ранг чата!"}`)
    .setDescription(
      `<@${userId}> — **${rank.name}**\n`
      + `${count.toLocaleString("ru-RU")} сообщений • награда: **${fmtMoney(cash)}**`
      + (isForumAward
        ? `\n\n🏆 **${FORUM_AWARD_TARGET.toLocaleString("ru-RU")} сообщений достигнуто.**\n`
          + `Это порог специальной награды на форуме ${FORUM_AWARD_URL} — забирай.`
        : "")
    )
    .setColor(isForumAward ? 0xffd700 : 0x3498db)
    .setTimestamp();
  return embed;
}

// -- /progress command --------------------------------------------------------

function getChatBridgeCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("progress")
      .setDescription("Прогресс по сообщениям и путь к награде форума (5000)")
      .addUserOption((o) =>
        o.setName("user").setDescription("Чей прогресс посмотреть (необязательно)").setRequired(false)
      ),
  ];
}

async function handleProgressCommand(interaction, db) {
  const target = interaction.options.getUser("user") || interaction.user;
  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.reply({ content: "Только на сервере.", ephemeral: true });
    return;
  }

  const count = await getMessageCount(db, guildId, target.id);
  const { current, next } = rankForCount(count);
  const remaining = Math.max(0, FORUM_AWARD_TARGET - count);

  // Pace over the last 30 days, used for a realistic ETA.
  let perDay = 0;
  try {
    const row = await dbGet(
      db,
      `SELECT SUM(count) AS c FROM daily_channel_stats
       WHERE guild_id = ? AND user_id = ? AND message_date > date('now','-30 days')`,
      [guildId, target.id]
    );
    perDay = Number(row?.c || 0) / 30;
  } catch (_) { /* no pace data */ }

  const etaText = remaining === 0
    ? "✅ Награда форума доступна"
    : perDay > 0.5
      ? `~${Math.ceil(remaining / perDay)} дн. при текущем темпе (${perDay.toFixed(1)} сообщ./день)`
      : "темп слишком низкий для прогноза";

  const lines = CHAT_RANKS.map((r) => {
    const done = count >= r.at;
    const mark = done ? "✅" : "▫️";
    return `${mark} ${r.emoji} **${r.name}** — ${r.at.toLocaleString("ru-RU")} сообщ. _(+${fmtMoney(r.cash)})_`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`📊 Прогресс — ${target.username}`)
    .setDescription(
      `**${count.toLocaleString("ru-RU")}** сообщений\n`
      + `Текущий ранг: ${current ? `${current.emoji} **${current.name}**` : "_пока нет_"}\n`
      + (next ? `Следующий: ${next.emoji} **${next.name}** — осталось **${(next.at - count).toLocaleString("ru-RU")}**\n` : "")
      + `\n🏆 **Награда форума (${FORUM_AWARD_TARGET.toLocaleString("ru-RU")} сообщ.)**\n`
      + `${progressBar(count, FORUM_AWARD_TARGET)}\n`
      + `Осталось: **${remaining.toLocaleString("ru-RU")}** • ${etaText}`
    )
    .addFields({ name: "Ранги чата", value: lines.join("\n") })
    .setColor(count >= FORUM_AWARD_TARGET ? 0xffd700 : 0x3498db)
    .setFooter({ text: `Награда выдаётся на форуме ${FORUM_AWARD_URL}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

module.exports = {
  FORUM_AWARD_TARGET,
  FORUM_AWARD_URL,
  CHAT_RANKS,
  ensureChatBridgeTables,
  getMessageCount,
  rankForCount,
  awardChatRanks,
  buildRankUpEmbed,
  progressBar,
  getChatBridgeCommandBuilders,
  handleProgressCommand,
};
