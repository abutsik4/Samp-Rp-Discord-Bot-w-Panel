"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getXpMultiplierForRoles } = require("./xp-multipliers");

/**
 * XP & Levels System — GTA SA Themed Ranks
 * Each message earns 15-25 XP (randomized to prevent gaming).
 * Levels use a quadratic formula. Rank names are GTA SA themed.
 *
 * Error codes:
 *   LEVEL-001: Table creation failed
 *   LEVEL-002: XP award failed
 *   LEVEL-003: Level lookup failed
 *   LEVEL-004: Leaderboard lookup failed
 */

// GTA SA themed rank names by level range
const RANK_TIERS = [
  { minLevel: 1,  maxLevel: 5,  name: "Бродяга",         emoji: "🚶" },
  { minLevel: 6,  maxLevel: 10, name: "Уличный пацан",   emoji: "👊" },
  { minLevel: 11, maxLevel: 15, name: "Боец Grove Street", emoji: "💚" },
  { minLevel: 16, maxLevel: 20, name: "Бандит",           emoji: "🔫" },
  { minLevel: 21, maxLevel: 25, name: "OG района",        emoji: "🏅" },
  { minLevel: 26, maxLevel: 30, name: "Авторитет",        emoji: "👑" },
  { minLevel: 31, maxLevel: 40, name: "Крёстный отец",    emoji: "🎩" },
  { minLevel: 41, maxLevel: 50, name: "Дон",              emoji: "💎" },
  { minLevel: 51, maxLevel: 75, name: "Легенда SA",       emoji: "🌟" },
  { minLevel: 76, maxLevel: Infinity, name: "Бог San Andreas", emoji: "⭐" },
];

/**
 * Calculate XP required for a given level (quadratic curve)
 * Level 1: 0 XP, Level 2: 100 XP, Level 10: ~4500 XP, etc.
 */
function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level - 1, 2) + 50 * (level - 1));
}

/**
 * Calculate level from total XP
 */
function levelFromXP(totalXP) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXP) {
    level++;
    if (level > 200) break; // safety cap
  }
  return level;
}

/**
 * Get rank info for a level
 */
function getRankForLevel(level) {
  for (const tier of RANK_TIERS) {
    if (level >= tier.minLevel && level <= tier.maxLevel) {
      return { name: tier.name, emoji: tier.emoji };
    }
  }
  return { name: "Бог San Andreas", emoji: "⭐" };
}

/**
 * Generate random XP for a message (15-25 range)
 */
function generateMessageXP() {
  return Math.floor(Math.random() * 11) + 15; // 15-25
}

/**
 * Ensure levels table exists
 */
async function ensureLevelsTable(db) {
  try {
    await dbRun(
      db,
      `
      CREATE TABLE IF NOT EXISTS user_levels (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        last_xp_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `
    );
    await dbRun(
      db,
      `CREATE INDEX IF NOT EXISTS idx_user_levels_level ON user_levels(guild_id, level DESC, xp DESC)`
    );
  } catch (err) {
    console.error("[LEVEL-001] Failed to create levels table:", err);
    throw err;
  }
}

/**
 * Award XP for a message. Enforces 60-second cooldown to prevent spam-leveling.
 * @returns {{ xpGained, newLevel, oldLevel, leveledUp, rank }} or null if on cooldown
 */
async function awardMessageXP(db, guildId, userId, userRoles = []) {
  const now = Math.floor(Date.now() / 1000);
  const parsedCooldown = Number.parseInt(process.env.LEVELS_XP_COOLDOWN_SEC || "60", 10);
  const XP_COOLDOWN_SEC = Number.isFinite(parsedCooldown) && parsedCooldown >= 0 ? parsedCooldown : 60;

  try {
    const existing = await dbGet(
      db,
      `SELECT xp, level, last_xp_at FROM user_levels WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    if (existing && (now - existing.last_xp_at) < XP_COOLDOWN_SEC) {
      return null; // On cooldown
    }

    const baseXP = generateMessageXP();
    const multiplier = await getXpMultiplierForRoles(db, guildId, userRoles);
    const xpGained = Math.max(1, Math.floor(baseXP * multiplier));
    const oldXP = existing?.xp || 0;
    const oldLevel = existing?.level || 1;
    const newXP = oldXP + xpGained;
    const newLevel = levelFromXP(newXP);
    const leveledUp = newLevel > oldLevel;

    if (!existing) {
      await dbRun(
        db,
        `INSERT INTO user_levels (guild_id, user_id, xp, level, last_xp_at) VALUES (?, ?, ?, ?, ?)`,
        [guildId, userId, xpGained, newLevel, now]
      );
    } else {
      await dbRun(
        db,
        `UPDATE user_levels SET xp = ?, level = ?, last_xp_at = ? WHERE guild_id = ? AND user_id = ?`,
        [newXP, newLevel, now, guildId, userId]
      );
    }

    const rank = getRankForLevel(newLevel);

    return {
      xpGained,
      totalXP: newXP,
      oldLevel,
      newLevel,
      leveledUp,
      rank,
      xpForNext: xpForLevel(newLevel + 1) - newXP,
    };
  } catch (err) {
    console.error(`[LEVEL-002] XP award failed for user ${userId}:`, err);
    return null;
  }
}

/**
 * Get user's level info
 */
async function getUserLevel(db, guildId, userId) {
  try {
    const row = await dbGet(
      db,
      `SELECT xp, level FROM user_levels WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    const level = row?.level || 1;
    const xp = row?.xp || 0;
    const rank = getRankForLevel(level);

    return {
      level,
      xp,
      rank,
      xpForNext: xpForLevel(level + 1) - xp,
      xpForCurrentLevel: xpForLevel(level),
      xpForNextLevel: xpForLevel(level + 1),
    };
  } catch (err) {
    console.error(`[LEVEL-003] Level lookup failed for user ${userId}:`, err);
    return { level: 1, xp: 0, rank: getRankForLevel(1), xpForNext: 100, xpForCurrentLevel: 0, xpForNextLevel: 100 };
  }
}

/**
 * Get levels leaderboard
 */
async function getLevelsLeaderboard(db, guildId, limit = 10) {
  try {
    return await dbAll(
      db,
      `SELECT user_id, xp, level FROM user_levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?`,
      [guildId, limit]
    );
  } catch (err) {
    console.error(`[LEVEL-004] Leaderboard lookup failed:`, err);
    return [];
  }
}

/**
 * Generate a text progress bar
 */
function generateProgressBar(current, max, length = 10) {
  const progress = Math.min(Math.max(current / max, 0), 1);
  const filled = Math.round(progress * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Get slash command builders for levels
 */
function getLevelsCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("level")
      .setDescription("Проверить свой уровень и ранг")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("Пользователь (опционально)").setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName("levels-top")
      .setDescription("Топ по уровням на сервере"),
  ];
}

/**
 * Handle level slash commands
 */
async function handleLevelCommand(input, dbArg) {
  const interaction = input?.interaction || input;
  const db = input?.db || dbArg;

  if (!interaction || !db) {
    throw new Error("LEVEL_INVALID_HANDLER_ARGS");
  }

  const { commandName } = interaction;

  if (commandName === "level") {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const info = await getUserLevel(db, interaction.guild.id, targetUser.id);

    const currentLevelXP = info.xpForCurrentLevel;
    const nextLevelXP = info.xpForNextLevel;
    const progressXP = info.xp - currentLevelXP;
    const neededXP = nextLevelXP - currentLevelXP;
    const bar = generateProgressBar(progressXP, neededXP, 12);
    const pct = neededXP > 0 ? Math.round((progressXP / neededXP) * 100) : 100;

    const embed = new EmbedBuilder()
      .setTitle(`${info.rank.emoji} ${info.rank.name}`)
      .setDescription(`Уровень и ранг для ${targetUser.tag}`)
      .addFields(
        { name: "📊 Уровень", value: `${info.level}`, inline: true },
        { name: "✨ Всего XP", value: `${info.xp.toLocaleString()}`, inline: true },
        { name: "🎖️ Ранг", value: `${info.rank.emoji} ${info.rank.name}`, inline: true },
        {
          name: "📈 До следующего уровня",
          value: `${bar} ${pct}%\n${progressXP.toLocaleString()} / ${neededXP.toLocaleString()} XP`,
          inline: false,
        }
      )
      .setColor(0x8b5cf6)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } else if (commandName === "levels-top") {
    await interaction.deferReply();

    const rows = await getLevelsLeaderboard(db, interaction.guild.id, 10);
    const visible = [];

    for (const row of rows) {
      if (visible.length >= 10) break;
      let member;
      try {
        member = await interaction.guild.members.fetch(row.user_id);
      } catch {
        continue;
      }
      visible.push({ member, ...row });
    }

    if (!visible.length) {
      return interaction.editReply({ content: "Пока нет данных по уровням. Начните общаться!" });
    }

    const lines = visible.map((e, i) => {
      const rank = getRankForLevel(e.level);
      return `\`${i + 1}.\` ${rank.emoji} **${e.member.user.tag}** — Ур. ${e.level} (${e.xp.toLocaleString()} XP) — ${rank.name}`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🏆 Топ по уровням")
      .setDescription(lines.join("\n"))
      .setColor(0x8b5cf6)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
}

module.exports = {
  RANK_TIERS,
  xpForLevel,
  levelFromXP,
  getRankForLevel,
  generateMessageXP,
  ensureLevelsTable,
  awardMessageXP,
  getUserLevel,
  getLevelsLeaderboard,
  generateProgressBar,
  getLevelsCommandBuilders,
  handleLevelCommand,
};
