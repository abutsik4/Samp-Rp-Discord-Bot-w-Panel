"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Radio Station Voting — GTA SA themed radio poll system.
 *
 * Features:
 *   /radio        — Vote for a station (rich embed response)
 *   /radio-top    — Leaderboard with genres and percentages
 *   /radio-info   — Station details: DJ, description, famous tracks
 *   /radio-fans   — See who voted for a specific station
 *
 * Error codes:
 *   RADIO-001: Table creation failed
 *   RADIO-002: Vote registration failed
 *   RADIO-003: Vote lookup failed
 *   RADIO-004: Results compilation failed
 */

const RADIO_STATIONS = [
  {
    id: "playback", name: "Playback FM", genre: "Hip-Hop / Rap", emoji: "🎤",
    dj: "Forth Right MC",
    desc: "Олдскульный хип-хоп прямиком из 90-х. Классика золотой эры рэпа.",
    tracks: [
      "Too $hort — The Ghetto",
      "Slick Rick — Children's Story",
      "Big Daddy Kane — Warm It Up, Kane",
      "Eazy-E — Eazy-Er Said Than Dunn",
    ],
    color: 0xf97316,
  },
  {
    id: "radio_los_santos", name: "Radio Los Santos", genre: "Gangsta Rap", emoji: "🔫",
    dj: "Julio G",
    desc: "Голос улиц Лос-Сантоса. Гангста-рэп западного побережья.",
    tracks: [
      "Dr. Dre & Snoop — Nuthin' but a 'G' Thang",
      "N.W.A — Express Yourself",
      "2Pac — I Don't Give a Fuck",
      "Da Lench Mob — Guerillas in tha Mist",
    ],
    color: 0x16a34a,
  },
  {
    id: "radio_x", name: "Radio X", genre: "Alternative Rock", emoji: "🎸",
    dj: "Sage",
    desc: "Альтернативный рок и гранж из Сан-Фиерро. Тяжёлые гитары и протест.",
    tracks: [
      "Rage Against the Machine — Killing in the Name",
      "Soundgarden — Rusty Cage",
      "Alice in Chains — Them Bones",
      "Stone Temple Pilots — Plush",
    ],
    color: 0xdc2626,
  },
  {
    id: "k_rose", name: "K-Rose", genre: "Country", emoji: "🤠",
    dj: "Mary-Beth Maybell",
    desc: "Кантри и вестерн для настоящих ковбоев. Пустыня, пикапы и текила.",
    tracks: [
      "Willie Nelson — Crazy",
      "Hank Williams — Hey Good Lookin'",
      "Eddie Rabbitt — I Love a Rainy Night",
      "Patsy Cline — Three Cigarettes in an Ashtray",
    ],
    color: 0xca8a04,
  },
  {
    id: "k_dst", name: "K-DST", genre: "Classic Rock", emoji: "🎶",
    dj: "Tommy «The Nightmare» Smith",
    desc: "Классический рок — хиты 70-х и 80-х. Гитарные соло и драйв.",
    tracks: [
      "Tom Petty — Runnin' Down a Dream",
      "Lynyrd Skynyrd — Free Bird",
      "CCR — Green River",
      "The Who — Eminence Front",
    ],
    color: 0x7c3aed,
  },
  {
    id: "bounce_fm", name: "Bounce FM", genre: "Funk / Disco", emoji: "🕺",
    dj: "The Funktipus",
    desc: "Фанк и диско — грув, который заставит танцевать даже CJ.",
    tracks: [
      "Ohio Players — Love Rollercoaster",
      "Kool & The Gang — Hollywood Swinging",
      "Rick James — Cold Blooded",
      "The Gap Band — You Dropped a Bomb on Me",
    ],
    color: 0xec4899,
  },
  {
    id: "sf_ur", name: "SF-UR", genre: "House / Techno", emoji: "💿",
    dj: "Hans Oberlansen",
    desc: "Электронная музыка из подпольных клубов Сан-Фиерро.",
    tracks: [
      "Orbital — Halcyon + On + On",
      "28 Days — Rip It Up",
      "Joe Smooth — Promised Land",
      "The Chemical Brothers — Chemical Beats",
    ],
    color: 0x06b6d4,
  },
  {
    id: "csr", name: "CSR 103.9", genre: "New Jack Swing / Soul", emoji: "🎷",
    dj: "Phillip Michaels",
    desc: "Соул и нью-джек свинг — гладкий звук для ночного Вентураса.",
    tracks: [
      "Al Green — Tired of Being Alone",
      "Mtume — Juicy Fruit",
      "Guy — Groove Me",
      "Ralph Tresvant — Sensitivity",
    ],
    color: 0xd946ef,
  },
  {
    id: "k_jah", name: "K-JAH West", genre: "Reggae / Dub", emoji: "🌴",
    dj: "Marshall Peters & Johnny Lawton",
    desc: "Регги и даб — расслабленные вайбы с островов Карибского моря.",
    tracks: [
      "Bob Marley — Natural Mystic",
      "Black Uhuru — Great Train Robbery",
      "Max Romeo — Chase the Devil",
      "Buju Banton — Batty Rider",
    ],
    color: 0x16a34a,
  },
  {
    id: "master_sounds", name: "Master Sounds 98.3", genre: "Rare Groove / Funk", emoji: "🎹",
    dj: "Johnny «The Man» Parkinson",
    desc: "Редкий грув — жемчужины фанка и соула, которые ты не слышал.",
    tracks: [
      "James Brown — The Payback (Part 1)",
      "The Blackbyrds — Rock Creek Park",
      "War — Low Rider",
      "Eddie Bo — Hook & Sling",
    ],
    color: 0xf59e0b,
  },
  {
    id: "wctr", name: "WCTR", genre: "Talk Radio", emoji: "📻",
    dj: "Lazlow & др.",
    desc: "Ток-шоу San Andreas. Безумные звонки, теории заговоров и Lazlow.",
    tracks: [
      "Entertaining America (Lazlow)",
      "Area 53 (с Marvin Trill)",
      "Gardening with Maurice",
      "I Say / You Say",
    ],
    color: 0x64748b,
  },
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

    const prev = await dbGet(
      db,
      `SELECT station_id FROM radio_votes WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    await dbRun(
      db,
      `INSERT INTO radio_votes (guild_id, user_id, station_id, voted_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(guild_id, user_id) DO UPDATE SET station_id = excluded.station_id, voted_at = excluded.voted_at`,
      [guildId, userId, stationId]
    );

    const changed = prev && prev.station_id !== stationId;
    const prevStation = changed ? RADIO_STATIONS.find((s) => s.id === prev.station_id) : null;

    return { success: true, station, changed, prevStation, isNew: !prev };
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
 * Get fans (voters) for a specific station.
 */
async function getStationFans(db, guildId, stationId, limit = 20) {
  try {
    return await dbAll(
      db,
      `SELECT user_id, voted_at FROM radio_votes
       WHERE guild_id = ? AND station_id = ?
       ORDER BY voted_at DESC LIMIT ?`,
      [guildId, stationId, limit]
    );
  } catch (err) {
    console.error(`[RADIO-003] Fans lookup failed for station ${stationId}:`, err);
    return [];
  }
}

/**
 * Build a progress bar string.
 */
function progressBar(pct, width = 14) {
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

    new SlashCommandBuilder()
      .setName("radio-info")
      .setDescription("Информация о радиостанции: DJ, описание, треки")
      .addStringOption((o) =>
        o
          .setName("station")
          .setDescription("Выбери станцию")
          .setRequired(true)
          .addChoices(...stationChoices)
      ),

    new SlashCommandBuilder()
      .setName("radio-fans")
      .setDescription("Кто слушает эту станцию?")
      .addStringOption((o) =>
        o
          .setName("station")
          .setDescription("Выбери станцию")
          .setRequired(true)
          .addChoices(...stationChoices)
      ),
  ];
}

/**
 * Handle /radio command — vote with rich embed response.
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

    const s = result.station;
    let desc;
    if (result.isNew) {
      desc = `Ты настроился на **${s.name}**!`;
    } else if (result.changed) {
      desc = `Переключился с **${result.prevStation.name}** на **${s.name}**!`;
    } else {
      desc = `Ты уже слушаешь **${s.name}** — голос сохранён!`;
    }

    const embed = new EmbedBuilder()
      .setTitle(`${s.emoji} ${s.name}`)
      .setDescription(`${desc}\n*${s.genre}*\n\n> ${s.desc}`)
      .setColor(s.color)
      .addFields({
        name: "🎵 В эфире",
        value: s.tracks.slice(0, 2).map((t) => `♪ ${t}`).join("\n"),
        inline: false,
      })
      .setFooter({ text: "Посмотри рейтинг: /radio-top  •  Подробнее: /radio-info" });

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error("[RADIO-002] Radio vote command failed:", err);
    await interaction.reply({
      content: "Не удалось зарегистрировать голос. Попробуй позже.",
      ephemeral: true,
    });
  }
}

/**
 * Handle /radio-top command — richer leaderboard.
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
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`${i + 1}.\``;
        const bar = progressBar(r.pct);
        const marker = userVote && userVote.id === r.id ? " **← ты**" : "";
        const genreTag = `\`${r.genre}\``;
        return `${medal} ${r.emoji} **${r.name}** ${genreTag}\n${bar} ${r.pct}% (${r.votes} гол.)${marker}`;
      });

      // only show stations with votes + up to 3 with zero
      const withVotes = lines.filter((_, i) => results[i].votes > 0);
      const withoutVotes = lines.filter((_, i) => results[i].votes === 0).slice(0, 3);
      const shown = withVotes.concat(withoutVotes);

      const half = Math.ceil(shown.length / 2);
      embed.addFields(
        { name: "🏆 Топ станции", value: shown.slice(0, half).join("\n\n"), inline: false },
      );
      if (shown.length > half) {
        embed.addFields(
          { name: "📻 Остальные", value: shown.slice(half).join("\n\n") || "—", inline: false },
        );
      }

      // highlight the #1 station
      const top = results[0];
      if (top.votes > 0) {
        embed.setDescription(`${top.emoji} **${top.name}** лидирует с ${top.pct}% голосов!`);
      }

      embed.setFooter({ text: `Всего голосов: ${totalVotes}  •  /radio-info — подробнее о станции  •  /radio-fans — слушатели` });
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

/**
 * Handle /radio-info command — station details with tracks.
 */
async function handleRadioInfo(interaction, db) {
  try {
    const stationId = interaction.options.getString("station", true);
    const s = RADIO_STATIONS.find((st) => st.id === stationId);
    if (!s) {
      await interaction.reply({ content: "Станция не найдена.", ephemeral: true });
      return;
    }

    const results = await getRadioResults(db, interaction.guildId);
    const stationResult = results.find((r) => r.id === stationId);
    const rank = results.findIndex((r) => r.id === stationId) + 1;
    const userVote = await getUserVote(db, interaction.guildId, interaction.user.id);
    const isListening = userVote && userVote.id === stationId;

    const embed = new EmbedBuilder()
      .setTitle(`${s.emoji} ${s.name}`)
      .setDescription(`*${s.genre}*\n\n> ${s.desc}`)
      .setColor(s.color)
      .addFields(
        { name: "🎙️ DJ", value: s.dj, inline: true },
        { name: "📊 Голоса", value: `${stationResult?.votes || 0} (${stationResult?.pct || 0}%)`, inline: true },
        { name: "🏅 Место", value: `#${rank}`, inline: true },
        {
          name: "🎵 Известные треки",
          value: s.tracks.map((t) => `♪ ${t}`).join("\n"),
          inline: false,
        },
      )
      .setTimestamp();

    if (isListening) {
      embed.setFooter({ text: "✅ Ты слушаешь эту станцию!" });
    } else {
      embed.setFooter({ text: "Проголосуй: /radio station:" + stationId });
    }

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error("[RADIO-003] Radio info command failed:", err);
    await interaction.reply({
      content: "Не удалось загрузить информацию. Попробуй позже.",
      ephemeral: true,
    });
  }
}

/**
 * Handle /radio-fans command — who listens to a station.
 */
async function handleRadioFans(interaction, db) {
  try {
    const stationId = interaction.options.getString("station", true);
    const s = RADIO_STATIONS.find((st) => st.id === stationId);
    if (!s) {
      await interaction.reply({ content: "Станция не найдена.", ephemeral: true });
      return;
    }

    const fans = await getStationFans(db, interaction.guildId, stationId, 20);

    const embed = new EmbedBuilder()
      .setTitle(`${s.emoji} ${s.name} — Слушатели`)
      .setColor(s.color)
      .setTimestamp();

    if (!fans.length) {
      embed.setDescription("У этой станции пока нет слушателей.\nБудь первым! `/radio station:" + stationId + "`");
    } else {
      const lines = [];
      for (const fan of fans) {
        let tag;
        try {
          const member = await interaction.guild.members.fetch(fan.user_id);
          tag = member.user.tag;
        } catch {
          continue;
        }
        lines.push(`• **${tag}**`);
      }

      if (!lines.length) {
        embed.setDescription("Слушатели этой станции покинули сервер.");
      } else {
        embed.setDescription(lines.join("\n"));
        embed.setFooter({ text: `${lines.length} слушател${lines.length === 1 ? "ь" : lines.length < 5 ? "я" : "ей"}` });
      }
    }

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error("[RADIO-003] Radio fans command failed:", err);
    await interaction.reply({
      content: "Не удалось загрузить слушателей. Попробуй позже.",
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
  getStationFans,
  getRadioCommandBuilders,
  handleRadioVote,
  handleRadioTop,
  handleRadioInfo,
  handleRadioFans,
};
