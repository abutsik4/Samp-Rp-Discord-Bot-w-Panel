"use strict";

const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Weekly Awards System — auto-posts weekly superlatives.
 *
 * Error codes:
 *   AWARDS-001: Table creation failed
 *   AWARDS-002: Award generation failed
 *   AWARDS-003: Award lookup failed
 *   AWARDS-004: Weekly post failed
 */

const AWARD_CATEGORIES = [
  {
    id: "top_chatter",
    title: "🏆 Самый активный",
    description: "Больше всех сообщений за неделю",
    emoji: "💬",
    query: `SELECT user_id, COUNT(*) AS val FROM message_counts
            WHERE date >= date('now', '-7 days') GROUP BY user_id ORDER BY val DESC LIMIT 1`,
    format: (v) => `${v} сообщений`,
  },
  {
    id: "top_reactor",
    title: "❤️ Самый щедрый на реакции",
    description: "Больше всех реакций за неделю",
    emoji: "👍",
    query: `SELECT user_id, SUM(reactions_given) AS val FROM daily_stats
            WHERE date >= date('now', '-7 days') GROUP BY user_id ORDER BY val DESC LIMIT 1`,
    format: (v) => `${v} реакций`,
  },
  {
    id: "longest_streak",
    title: "🔥 Серийный писатель",
    description: "Самая длинная серия активных дней",
    emoji: "🔥",
    query: `SELECT user_id, current_streak AS val FROM streaks
            WHERE guild_id IS NOT NULL ORDER BY current_streak DESC LIMIT 1`,
    format: (v) => `${v} дней подряд`,
  },
  {
    id: "night_owl",
    title: "🦉 Сова недели",
    description: "Больше всех сообщений с 00:00 до 06:00",
    emoji: "🌙",
    query: `SELECT user_id, COUNT(*) AS val FROM message_counts
            WHERE date >= date('now', '-7 days') AND hour BETWEEN 0 AND 5
            GROUP BY user_id ORDER BY val DESC LIMIT 1`,
    format: (v) => `${v} ночных сообщений`,
  },
  {
    id: "early_bird",
    title: "🐦 Жаворонок недели",
    description: "Больше всех сообщений с 06:00 до 10:00",
    emoji: "☀️",
    query: `SELECT user_id, COUNT(*) AS val FROM message_counts
            WHERE date >= date('now', '-7 days') AND hour BETWEEN 6 AND 9
            GROUP BY user_id ORDER BY val DESC LIMIT 1`,
    format: (v) => `${v} утренних сообщений`,
  },
];

/**
 * Ensure weekly awards table exists
 */
async function ensureWeeklyAwardsTable(db) {
  try {
    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS weekly_awards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        week_start TEXT NOT NULL,
        category TEXT NOT NULL,
        user_id TEXT NOT NULL,
        value INTEGER NOT NULL DEFAULT 0,
        awarded_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    );
    await dbRun(
      db,
      `CREATE INDEX IF NOT EXISTS idx_weekly_awards_guild_week ON weekly_awards(guild_id, week_start)`
    );
  } catch (err) {
    console.error("[AWARDS-001] Failed to create weekly_awards table:", err);
    throw err;
  }
}

/**
 * Calculate the Monday of the current week (ISO).
 */
function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

/**
 * Generate weekly awards for a guild.
 * Returns array of { category, userId, value, title, formatted }.
 */
async function generateWeeklyAwards(db, guildId) {
  const weekStart = getWeekStart();
  const results = [];

  for (const cat of AWARD_CATEGORIES) {
    try {
      const row = await dbGet(db, cat.query);
      if (row && row.user_id && row.val > 0) {
        // Save to DB
        await dbRun(
          db,
          `INSERT INTO weekly_awards (guild_id, week_start, category, user_id, value)
           VALUES (?, ?, ?, ?, ?)`,
          [guildId, weekStart, cat.id, row.user_id, row.val]
        );

        results.push({
          category: cat.id,
          userId: row.user_id,
          value: row.val,
          title: cat.title,
          formatted: cat.format(row.val),
          emoji: cat.emoji,
        });
      }
    } catch (err) {
      console.error(`[AWARDS-002] Award generation failed for ${cat.id}:`, err);
    }
  }

  return results;
}

/**
 * Build an embed for the weekly awards.
 */
function buildWeeklyAwardsEmbed(awards, weekStart) {
  const embed = new EmbedBuilder()
    .setTitle("📊 Итоги недели — San Andreas Awards")
    .setDescription(`Неделя с **${weekStart}**`)
    .setColor(0xf1c40f)
    .setTimestamp(new Date());

  if (awards.length === 0) {
    embed.addFields({
      name: "Нет данных",
      value: "На этой неделе недостаточно активности для наград.",
    });
    return embed;
  }

  for (const award of awards) {
    embed.addFields({
      name: `${award.title}`,
      value: `<@${award.userId}> — ${award.formatted}`,
      inline: false,
    });
  }

  embed.setFooter({ text: "Награды обновляются каждый понедельник" });
  return embed;
}

/**
 * Post weekly awards to a channel.
 */
async function postWeeklyAwards(db, client, guildId, channelId) {
  try {
    // Check if already posted this week
    const weekStart = getWeekStart();
    const existing = await dbGet(
      db,
      `SELECT COUNT(*) AS cnt FROM weekly_awards WHERE guild_id = ? AND week_start = ?`,
      [guildId, weekStart]
    );

    if (existing && existing.cnt > 0) {
      return { posted: false, reason: "Already posted this week" };
    }

    const awards = await generateWeeklyAwards(db, guildId);
    const embed = buildWeeklyAwardsEmbed(awards, weekStart);

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.error("[AWARDS-004] Channel not found:", channelId);
      return { posted: false, reason: "Channel not found" };
    }

    await channel.send({ embeds: [embed] });
    return { posted: true, awards: awards.length };
  } catch (err) {
    console.error("[AWARDS-004] Weekly post failed:", err);
    return { posted: false, reason: err.message };
  }
}

/**
 * Get past weekly awards.
 */
async function getPastAwards(db, guildId, limit = 5) {
  try {
    return await dbAll(
      db,
      `SELECT week_start, category, user_id, value, awarded_at
       FROM weekly_awards WHERE guild_id = ?
       ORDER BY awarded_at DESC LIMIT ?`,
      [guildId, limit * AWARD_CATEGORIES.length]
    );
  } catch (err) {
    console.error("[AWARDS-003] Award lookup failed:", err);
    return [];
  }
}

/**
 * Slash command builders for weekly awards.
 */
function getWeeklyAwardsCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("awards")
      .setDescription("Показать итоги недели (San Andreas Awards)"),
  ];
}

/**
 * Handle /awards command.
 */
async function handleAwardsCommand(interaction, db) {
  try {
    const guildId = interaction.guildId;
    const weekStart = getWeekStart();

    // Get this week's awards if they exist
    const rows = await dbAll(
      db,
      `SELECT category, user_id, value FROM weekly_awards WHERE guild_id = ? AND week_start = ?`,
      [guildId, weekStart]
    );

    if (rows.length === 0) {
      // Generate on-demand preview
      const awards = [];
      for (const cat of AWARD_CATEGORIES) {
        try {
          const row = await dbGet(db, cat.query);
          if (row && row.user_id && row.val > 0) {
            awards.push({
              category: cat.id,
              userId: row.user_id,
              value: row.val,
              title: cat.title,
              formatted: cat.format(row.val),
              emoji: cat.emoji,
            });
          }
        } catch (_) {
          // skip failed categories
        }
      }

      const embed = buildWeeklyAwardsEmbed(awards, weekStart);
      embed.setFooter({ text: "Предварительные итоги (неделя ещё не окончена)" });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // Build from stored data
    const awards = rows.map((r) => {
      const cat = AWARD_CATEGORIES.find((c) => c.id === r.category);
      return {
        category: r.category,
        userId: r.user_id,
        value: r.value,
        title: cat?.title || r.category,
        formatted: cat ? cat.format(r.value) : `${r.value}`,
        emoji: cat?.emoji || "🏅",
      };
    });

    const embed = buildWeeklyAwardsEmbed(awards, weekStart);
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error("[AWARDS-003] Awards command failed:", err);
    await interaction.reply({
      content: "Не удалось загрузить итоги недели.",
      ephemeral: true,
    });
  }
}

module.exports = {
  AWARD_CATEGORIES,
  ensureWeeklyAwardsTable,
  getWeekStart,
  generateWeeklyAwards,
  buildWeeklyAwardsEmbed,
  postWeeklyAwards,
  getPastAwards,
  getWeeklyAwardsCommandBuilders,
  handleAwardsCommand,
};
