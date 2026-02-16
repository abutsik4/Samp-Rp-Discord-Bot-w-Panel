"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Radio Station Voting — GTA SA themed radio poll system.
 *
 * Error codes:
 *   RADIO-001: Table creation failed
 *   RADIO-002: Vote registration failed
 *   RADIO-003: Vote lookup failed
 *   RADIO-004: Results compilation failed
 */

const RADIO_STATIONS = [
  { id: "playback", name: "Playback FM", genre: "Hip-Hop / Rap", emoji: "🎤" },
  { id: "radio_los_santos", name: "Radio Los Santos", genre: "Gangsta Rap", emoji: "🔫" },
  { id: "radio_x", name: "Radio X", genre: "Alternative Rock", emoji: "🎸" },
  { id: "k_rose", name: "K-Rose", genre: "Country", emoji: "🤠" },
  { id: "k_dst", name: "K-DST", genre: "Classic Rock", emoji: "🎶" },
  { id: "bounce_fm", name: "Bounce FM", genre: "Funk / Disco", emoji: "🕺" },
  { id: "sf_ur", name: "SF-UR", genre: "House / Techno", emoji: "💿" },
  { id: "csr", name: "CSR 103.9", genre: "New Jack Swing / Soul", emoji: "🎷" },
  { id: "k_jah", name: "K-JAH West", genre: "Reggae / Dub", emoji: "🌴" },
  { id: "master_sounds", name: "Master Sounds 98.3", genre: "Rare Groove / Funk", emoji: "🎹" },
  { id: "wctr", name: "WCTR", genre: "Talk Radio", emoji: "📻" },
];

/**
 * Ensure radio tables exist.
 */
async function ensureRadioTable(db) {
  try {
    await dbRun(
      db,
      `CREATE TABLE IF NOT EXISTS radio_votes (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        station_id TEXT NOT NULL,
        voted_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (guild_id, user_id)
      )`
    );
    await dbRun(
      db,
      `CREATE INDEX IF NOT EXISTS idx_radio_votes_station ON radio_votes(guild_id, station_id)`
    );
  } catch (err) {
    console.error("[RADIO-001] Failed to create radio_votes table:", err);
    throw err;
  }
}

/**
 * Vote for a radio station. One vote per user (can change).
 */
async function voteForStation(db, guildId, userId, stationId) {
  try {
    const station = RADIO_STATIONS.find((s) => s.id === stationId);
    if (!station) return { success: false, error: "Unknown station" };

    await dbRun(
      db,
      `INSERT INTO radio_votes (guild_id, user_id, station_id, voted_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id, user_id) DO UPDATE SET station_id = excluded.station_id, voted_at = excluded.voted_at`,
      [guildId, userId, stationId]
    );

    return { success: true, station };
  } catch (err) {
    console.error(`[RADIO-002] Vote failed for user ${userId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Get vote counts for all stations.
 */
async function getRadioResults(db, guildId) {
  try {
    const rows = await dbAll(
      db,
      `SELECT station_id, COUNT(*) AS votes FROM radio_votes
       WHERE guild_id = ? GROUP BY station_id ORDER BY votes DESC`,
      [guildId]
    );

    const total = rows.reduce((s, r) => s + r.votes, 0);

    return RADIO_STATIONS.map((station) => {
      const found = rows.find((r) => r.station_id === station.id);
      const votes = found ? found.votes : 0;
      const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
      return { ...station, votes, pct };
    })
      .sort((a, b) => b.votes - a.votes);
  } catch (err) {
    console.error("[RADIO-004] Results compilation failed:", err);
    return [];
  }
}

/**
 * Get user's current vote.
 */
async function getUserVote(db, guildId, userId) {
  try {
    const row = await dbGet(
      db,
      `SELECT station_id FROM radio_votes WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    return row ? RADIO_STATIONS.find((s) => s.id === row.station_id) || null : null;
  } catch (err) {
    console.error(`[RADIO-003] Vote lookup failed for user ${userId}:`, err);
    return null;
  }
}

/**
 * Build a progress bar string.
 */
function progressBar(pct, width = 12) {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/**
 * Slash command builders.
 */
function getRadioCommandBuilders() {
  const stationChoices = RADIO_STATIONS.map((s) => ({
    name: `${s.emoji} ${s.name} (${s.genre})`,
    value: s.id,
  }));

  return [
    new SlashCommandBuilder()
      .setName("radio")
      .setDescription("Голосуй за любимую радиостанцию GTA San Andreas!")
      .addStringOption((o) =>
        o
          .setName("station")
          .setDescription("Выбери станцию")
          .setRequired(true)
          .addChoices(...stationChoices)
      ),

    new SlashCommandBuilder()
      .setName("radio-top")
      .setDescription("Рейтинг радиостанций GTA San Andreas"),
  ];
}

/**
 * Handle /radio command.
 */
async function handleRadioVote(interaction, db) {
  try {
    const stationId = interaction.options.getString("station", true);
    const result = await voteForStation(db, interaction.guildId, interaction.user.id, stationId);

    if (!result.success) {
      await interaction.reply({
        content: `Не удалось проголосовать: ${result.error}`,
        ephemeral: true,
      });
      return;
    }

    const station = result.station;
    await interaction.reply(
      `${station.emoji} Ты голосуешь за **${station.name}** (${station.genre})!\nПосмотри рейтинг: /radio-top`
    );
  } catch (err) {
    console.error("[RADIO-002] Radio vote command failed:", err);
    await interaction.reply({
      content: "Не удалось зарегистрировать голос. Попробуй позже.",
      ephemeral: true,
    });
  }
}

/**
 * Handle /radio-top command.
 */
async function handleRadioTop(interaction, db) {
  try {
    const results = await getRadioResults(db, interaction.guildId);
    const userVote = await getUserVote(db, interaction.guildId, interaction.user.id);

    const totalVotes = results.reduce((s, r) => s + r.votes, 0);

    const embed = new EmbedBuilder()
      .setTitle("📻 Рейтинг радиостанций San Andreas")
      .setColor(0x2ecc71)
      .setTimestamp(new Date());

    if (totalVotes === 0) {
      embed.setDescription(
        "Пока никто не голосовал!\nИспользуй `/radio` чтобы выбрать любимую станцию."
      );
    } else {
      const lines = results.map((r, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
        const bar = progressBar(r.pct);
        const marker = userVote && userVote.id === r.id ? " ← ты" : "";
        return `${medal} ${r.emoji} **${r.name}**\n${bar} ${r.pct}% (${r.votes})${marker}`;
      });

      // Split into fields (max 1024 chars per field value)
      const half = Math.ceil(lines.length / 2);
      embed.addFields(
        { name: "Топ станции", value: lines.slice(0, half).join("\n\n"), inline: false },
        { name: "Остальные", value: lines.slice(half).join("\n\n") || "—", inline: false }
      );

      embed.setFooter({ text: `Всего голосов: ${totalVotes}` });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error("[RADIO-004] Radio top command failed:", err);
    await interaction.reply({
      content: "Не удалось загрузить рейтинг. Попробуй позже.",
      ephemeral: true,
    });
  }
}

module.exports = {
  RADIO_STATIONS,
  ensureRadioTable,
  voteForStation,
  getRadioResults,
  getUserVote,
  getRadioCommandBuilders,
  handleRadioVote,
  handleRadioTop,
};
