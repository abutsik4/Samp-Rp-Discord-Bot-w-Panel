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
    queryFn: (guildId, weekStart) => ({
      sql: `SELECT user_id, message_count AS val FROM weekly_stats
            WHERE guild_id = ? AND week_start = ? AND message_count > 0
            ORDER BY message_count DESC LIMIT 1`,
      params: [guildId, weekStart],
    }),
    format: (v) => `${v} сообщений`,
  },
  {
    id: "top_reactor",
    title: "❤️ Самый щедрый на реакции",
    description: "Больше всех реакций за неделю",
    emoji: "👍",
    queryFn: (guildId, weekStart) => ({
      sql: `SELECT user_id, reactions_given_weekly AS val FROM user_reactions
            WHERE guild_id = ? AND reactions_given_weekly > 0
            ORDER BY reactions_given_weekly DESC LIMIT 1`,
      params: [guildId],
    }),
    format: (v) => `${v} реакций`,
  },
  {
    id: "longest_streak",
    title: "🔥 Серийный писатель",
    description: "Самая длинная серия активных дней",
    emoji: "🔥",
    queryFn: (guildId) => ({
      sql: `SELECT user_id, current_streak AS val FROM user_streaks
            WHERE guild_id = ? AND current_streak > 0
            ORDER BY current_streak DESC LIMIT 1`,
      params: [guildId],
    }),
    format: (v) => `${v} дней подряд`,
  },
  {
    id: "trivia_master",
    title: "🧠 Мастер викторины",
    description: "Больше всех очков за неделю",
    emoji: "🧠",
    queryFn: (guildId) => ({
      sql: `SELECT user_id, weekly_points AS val FROM trivia_scores
            WHERE guild_id = ? AND weekly_points > 0
            ORDER BY weekly_points DESC LIMIT 1`,
      params: [guildId],
    }),
    format: (v) => `${v} очков`,
  },
  {
    id: "street_legend",
    title: "💰 Уличная легенда",
    description: "Больше всех заработал за неделю",
    emoji: "💰",
    queryFn: (guildId, weekStart) => ({
      sql: `SELECT to_user AS user_id, SUM(amount) AS val
            FROM samp_ledger
            WHERE to_user IS NOT NULL
              AND type IN ('work', 'truck', 'rob', 'race', 'duel', 'daily_bonus')
              AND ts >= ?
            GROUP BY to_user
            ORDER BY val DESC LIMIT 1`,
      params: [weekStart],
    }),
    format: (v) => `${Number(v).toLocaleString("ru-RU")} $ заработано`,
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

    // Add weekly tracking columns to existing tables (safe if already exist)
    try { await dbRun(db, `ALTER TABLE user_reactions ADD COLUMN reactions_given_weekly INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
    try { await dbRun(db, `ALTER TABLE user_reactions ADD COLUMN reactions_received_weekly INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
    try { await dbRun(db, `ALTER TABLE trivia_scores ADD COLUMN weekly_points INTEGER NOT NULL DEFAULT 0`); } catch (_) {}
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
      const { sql, params } = cat.queryFn(guildId, weekStart);
      const row = await dbGet(db, sql, params);
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
    const reward = AWARD_REWARDS[award.category];
    const rewardText = reward
      ? `\n🎁 +${Number(reward.money).toLocaleString("ru-RU")} $ | +${reward.xp} XP`
      : "";
    embed.addFields({
      name: `${award.title}`,
      value: `<@${award.userId}> — ${award.formatted}${rewardText}`,
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

    // If no awards were generated, insert a sentinel row so we don't post again
    if (awards.length === 0) {
      await dbRun(
        db,
        `INSERT INTO weekly_awards (guild_id, week_start, category, user_id, value)
         VALUES (?, ?, '_no_data', '_none', 0)`,
        [guildId, weekStart]
      );
    }

    await channel.send({ embeds: [embed] });
    return { posted: true, awards: awards.length, awardsList: awards };
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
          const { sql, params } = cat.queryFn(guildId, weekStart);
          const row = await dbGet(db, sql, params);
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

/**
 * Rotate weekly spotlight roles: remove from previous holder, grant to new winner.
 * Call after postWeeklyAwards() on Mondays.
 *
 * @param {object} db - Database instance
 * @param {object} guild - Discord guild object
 * @param {object} roleConfig
 * @param {string} [roleConfig.topChatterRoleId] - Role ID for "Чемпион Недели"
 * @param {string} [roleConfig.nightOwlRoleId] - Role ID for "Ночная Сова"
 * @returns {object} { topChatter: { removed, granted }, nightOwl: { removed, granted } }
 */
async function rotateWeeklyRoles(db, guild, roleConfig = {}) {
  const weekStart = getWeekStart();
  const result = { topChatter: null, nightOwl: null };

  const roleMap = [
    { category: "top_chatter", roleId: roleConfig.topChatterRoleId, key: "topChatter" },
    { category: "night_owl", roleId: roleConfig.nightOwlRoleId, key: "nightOwl" },
  ];

  for (const { category, roleId, key } of roleMap) {
    if (!roleId) continue;

    try {
      // Find this week's winner
      const winner = await dbGet(
        db,
        `SELECT user_id FROM weekly_awards
         WHERE guild_id = ? AND week_start = ? AND category = ?`,
        [guild.id, weekStart, category]
      );

      // Remove role from all current holders (previous winner)
      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        result[key] = { error: "Role not found" };
        continue;
      }

      let removed = 0;
      for (const [, member] of role.members) {
        if (!winner || member.id !== winner.user_id) {
          try {
            await member.roles.remove(roleId, "Weekly award rotation");
            removed++;
          } catch (e) {
            console.error(`[WeeklyRoles] Failed to remove role from ${member.id}:`, e.message);
          }
        }
      }

      // Grant to new winner
      let granted = false;
      if (winner?.user_id) {
        try {
          const winnerMember = await guild.members.fetch(winner.user_id);
          if (!winnerMember.roles.cache.has(roleId)) {
            await winnerMember.roles.add(roleId, `Weekly ${category} award`);
            granted = true;
          }
        } catch (e) {
          console.error(`[WeeklyRoles] Failed to grant role to ${winner.user_id}:`, e.message);
        }
      }

      result[key] = { removed, granted };
    } catch (err) {
      console.error(`[WeeklyRoles] Error rotating ${category}:`, err);
      result[key] = { error: err.message };
    }
  }

  return result;
}

/**
 * Reward category config — SAMP money and XP granted per category.
 */
const AWARD_REWARDS = {
  top_chatter:    { money: 25_000, xp: 2000 },
  top_reactor:    { money: 10_000, xp: 1000 },
  longest_streak: { money: 15_000, xp: 1500 },
  trivia_master:  { money: 15_000, xp: 1500 },
  street_legend:  { money: 5_000,  xp: 500  },
};

/**
 * Grant SAMP money and XP rewards to weekly award winners.
 * Call after postWeeklyAwards() succeeds.
 *
 * @param {object} db - Database instance
 * @param {string} guildId - Guild ID
 * @param {Array} awards - Array of { category, userId, ... } from generateWeeklyAwards
 * @returns {object} { rewarded: number, details: Array }
 */
async function grantWeeklyRewards(db, guildId, awards) {
  const details = [];

  for (const award of awards) {
    const reward = AWARD_REWARDS[award.category];
    if (!reward) continue;

    try {
      // Grant SAMP money (only if user has a SAMP account)
      const sampUser = await dbGet(db, `SELECT user_id FROM samp_users WHERE user_id = ?`, [award.userId]);
      if (sampUser && reward.money > 0) {
        await dbRun(
          db,
          `UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`,
          [reward.money, award.userId]
        );
        await dbRun(
          db,
          `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json)
           VALUES('weekly_award', NULL, ?, ?, ?)`,
          [award.userId, reward.money, JSON.stringify({ category: award.category, week: getWeekStart() })]
        );
      }

      // Grant XP
      if (reward.xp > 0) {
        await dbRun(
          db,
          `UPDATE user_levels SET xp = xp + ? WHERE guild_id = ? AND user_id = ?`,
          [reward.xp, guildId, award.userId]
        );
      }

      details.push({ userId: award.userId, category: award.category, money: reward.money, xp: reward.xp });
    } catch (err) {
      console.error(`[AWARDS-005] Failed to reward ${award.userId} for ${award.category}:`, err);
    }
  }

  return { rewarded: details.length, details };
}

/**
 * Reset weekly counters after awards are posted.
 * Call after postWeeklyAwards() on Mondays.
 */
async function resetWeeklyCounters(db) {
  try {
    await dbRun(db, `UPDATE user_reactions SET reactions_given_weekly = 0, reactions_received_weekly = 0`);
    await dbRun(db, `UPDATE trivia_scores SET weekly_points = 0`);
    console.log("[WeeklyAwards] Weekly counters reset");
  } catch (err) {
    console.error("[AWARDS-006] Failed to reset weekly counters:", err);
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
  rotateWeeklyRoles,
  grantWeeklyRewards,
  resetWeeklyCounters,
  AWARD_REWARDS,
};
