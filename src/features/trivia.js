"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");

/**
 * GTA San Andreas Trivia System
 * Timed quiz questions about SA lore with leaderboard.
 *
 * Error codes:
 *   TRIVIA-001: Table creation failed
 *   TRIVIA-002: Score update failed
 *   TRIVIA-003: Score lookup failed
 *   TRIVIA-004: Question delivery failed
 */

// 50+ GTA SA trivia questions in Russian
const TRIVIA_QUESTIONS = [
  { q: "Кто предал CJ в начале игры?", answers: ["Big Smoke", "Ryder", "OG Loc", "Sweet"], correct: 0 },
  { q: "Как называется банда CJ?", answers: ["Grove Street Families", "Ballas", "Vagos", "Triads"], correct: 0 },
  { q: "В каком городе начинается игра GTA SA?", answers: ["Лос-Сантос", "Сан-Фиерро", "Лас-Вентурас", "Либерти-Сити"], correct: 0 },
  { q: "Какого цвета банда Ballas?", answers: ["Фиолетовый", "Зелёный", "Красный", "Синий"], correct: 0 },
  { q: "Как зовут брата CJ?", answers: ["Sweet", "Ryder", "Big Smoke", "Cesar"], correct: 0 },
  { q: "Какая радиостанция играет хип-хоп в GTA SA?", answers: ["Radio Los Santos", "K-DST", "Radio X", "SF-UR"], correct: 0 },
  { q: "На какой улице живёт CJ?", answers: ["Grove Street", "Main Street", "Ocean Drive", "Vinewood Blvd"], correct: 0 },
  { q: "Как называется казино в Лас-Вентурасе?", answers: ["Caligula's Palace", "Casino Royale", "The Strip", "Four Dragons"], correct: 0 },
  { q: "Кто лидер триад в Сан-Фиерро?", answers: ["Ву Зи Му (Woozie)", "Ran Fa Li", "Su Xi Mu", "Chen Lee"], correct: 0 },
  { q: "Какой максимальный уровень розыска в GTA SA?", answers: ["6 звёзд", "5 звёзд", "4 звёзды", "7 звёзд"], correct: 0 },
  { q: "Как называется спортзал в районе Ganton?", answers: ["Ganton Gym", "Gold's Gym", "Muscle Beach", "SA Fitness"], correct: 0 },
  { q: "Какой реплику говорит Big Smoke при заказе еды?", answers: ["I'll have two number 9s...", "Give me a burger", "Just fries please", "Large soda"], correct: 0 },
  { q: "Как зовут сестру CJ?", answers: ["Kendl", "Maria", "Catalina", "Denise"], correct: 0 },
  { q: "Кто такой Officer Tenpenny?", answers: ["Коррумпированный полицейский", "Лидер банды", "Друг CJ", "Продавец оружия"], correct: 0 },
  { q: "Какой актёр озвучил CJ?", answers: ["Young Maylay", "Ice Cube", "Samuel L. Jackson", "50 Cent"], correct: 0 },
  { q: "Кто озвучил Officer Tenpenny?", answers: ["Samuel L. Jackson", "Young Maylay", "Ice-T", "Snoop Dogg"], correct: 0 },
  { q: "Какой транспорт можно угнать с военной базы?", answers: ["Hydra", "Boeing", "Apache", "F-16"], correct: 0 },
  { q: "Как называется военная база в GTA SA?", answers: ["Area 69", "Fort Zancudo", "Area 51", "Camp Pendleton"], correct: 0 },
  { q: "Какой бизнес можно купить в Сан-Фиерро?", answers: ["Автосервис", "Ресторан", "Клуб", "Казино"], correct: 0 },
  { q: "Как зовут подругу CJ из Лос-Сантоса?", answers: ["Denise Robinson", "Helena", "Katie", "Barbara"], correct: 0 },
  { q: "Как называется крупнейшая гора в GTA SA?", answers: ["Mount Chiliad", "Mount San Andreas", "Mount Diablo", "Mount Whitney"], correct: 0 },
  { q: "Какой год события GTA San Andreas?", answers: ["1992", "1990", "1995", "1988"], correct: 0 },
  { q: "В каком штате происходит GTA SA?", answers: ["San Andreas", "California", "Texas", "Nevada"], correct: 0 },
  { q: "Какое оружие можно купить у Ammu-Nation?", answers: ["Все ответы верны", "Пистолет", "Дробовик", "AK-47"], correct: 0 },
  { q: "Что нужно делать чтобы CJ не толстел?", answers: ["Тренироваться в зале", "Есть салаты", "Бегать", "Плавать"], correct: 0 },
  { q: "Как называется банда в жёлтом?", answers: ["Los Santos Vagos", "Ballas", "Aztecas", "Triads"], correct: 0 },
  { q: "Как попасть в Лас-Вентурас из Лос-Сантоса?", answers: ["Через пустыню", "По мосту", "На поезде", "По шоссе"], correct: 0 },
  { q: "Кто помогает CJ ограбить казино Caligula's?", answers: ["Woozie и триады", "Sweet", "Ryder", "Big Smoke"], correct: 0 },
  { q: "Как называется парикмахерская в GTA SA?", answers: ["Old Reece's", "Cut & Style", "SA Barbers", "Hood Cuts"], correct: 0 },
  { q: "Что произошло с мамой CJ?", answers: ["Её убили", "Она уехала", "Она в тюрьме", "Она жива"], correct: 0 },
  { q: "Откуда CJ вернулся в начале игры?", answers: ["Из Либерти-Сити", "Из тюрьмы", "Из армии", "Из Вайс-Сити"], correct: 0 },
  { q: "Какую фразу произносит CJ при смерти NPC?", answers: ["Ah shit, here we go again", "Busta!", "Grove Street!", "Respect+"], correct: 0 },
  { q: "Как называется заведение быстрого питания?", answers: ["Cluckin' Bell", "Burger Shot", "Pizza Stack", "Все ответы верны"], correct: 3 },
  { q: "Какой цвет у Grove Street Families?", answers: ["Зелёный", "Фиолетовый", "Синий", "Красный"], correct: 0 },
  { q: "Кто такой Zero?", answers: ["Гик с магазином RC-моделей", "Хакер", "Уличный гонщик", "Наркодилер"], correct: 0 },
  { q: "Какой знаменитый мост есть в Сан-Фиерро?", answers: ["Gant Bridge", "Golden Gate", "Bay Bridge", "Tower Bridge"], correct: 0 },
  { q: "Чем заканчивается GTA SA?", answers: ["CJ возвращает Grove Street", "CJ погибает", "CJ уезжает", "Sweet предаёт CJ"], correct: 0 },
  { q: "Как называется аэропорт Лос-Сантоса?", answers: ["Los Santos International", "SA Airport", "Santos Air", "Liberty Airport"], correct: 0 },
  { q: "Кто такой Catalina в GTA SA?", answers: ["Безумная подруга CJ", "Сестра Sweet", "Полицейская", "Журналистка"], correct: 0 },
  { q: "Какой вид спорта доступен в GTA SA?", answers: ["Все ответы верны", "Бассейн", "Баскетбол", "Велосипед"], correct: 0 },
  { q: "Как называется район банды Ballas?", answers: ["Idlewood", "Ganton", "Commerce", "Vinewood"], correct: 0 },
  { q: "Кто такой The Truth?", answers: ["Хиппи-фермер", "Полицейский", "Бандит", "Пилот"], correct: 0 },
  { q: "Какая панк-рок станция есть в GTA SA?", answers: ["Radio X", "K-DST", "Radio Los Santos", "Master Sounds"], correct: 0 },
  { q: "Что можно делать в казино Four Dragons?", answers: ["Играть в азартные игры", "Тренироваться", "Покупать оружие", "Стричься"], correct: 0 },
  { q: "Как называется пиццерия в GTA SA?", answers: ["Pizza Stack", "Pizza Boy", "Pizza Hut", "Domino's"], correct: 0 },
  { q: "Какая максимальная мускулатура CJ?", answers: ["100%", "75%", "50%", "Нет лимита"], correct: 0 },
  { q: "Кто такой Madd Dogg?", answers: ["Рэпер", "Боксёр", "Гонщик", "Полицейский"], correct: 0 },
  { q: "Как называется ранчо Truth'а?", answers: ["The Farm", "Truth Ranch", "Weed Farm", "Bone County Ranch"], correct: 0 },
  { q: "Что CJ говорит в культовой сцене начала?", answers: ["Ah shit, here we go again", "Not this again", "I'm back", "Grove Street"], correct: 0 },
  { q: "Какой джетпак можно найти в Area 69?", answers: ["Jetpack", "Rocket Pack", "Fly Pack", "Boost Pack"], correct: 0 },
];

// Shuffle helper
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Ensure trivia tables exist
 */
async function ensureTriviaTable(db) {
  try {
    await dbRun(
      db,
      `
      CREATE TABLE IF NOT EXISTS trivia_scores (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        correct INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL DEFAULT 0,
        current_streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        total_points INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id)
      )
    `
    );
    await dbRun(
      db,
      `CREATE INDEX IF NOT EXISTS idx_trivia_scores_points ON trivia_scores(guild_id, total_points DESC)`
    );
  } catch (err) {
    console.error("[TRIVIA-001] Failed to create trivia table:", err);
    throw err;
  }
}

/**
 * Update user's trivia score
 */
async function updateTriviaScore(db, guildId, userId, isCorrect) {
  try {
    const existing = await dbGet(
      db,
      `SELECT correct, total, current_streak, best_streak, total_points FROM trivia_scores WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );

    const basePoints = isCorrect ? 10 : 0;
    const streakBonus = isCorrect ? Math.min((existing?.current_streak || 0) * 5, 50) : 0; // max +50 streak bonus
    const points = basePoints + streakBonus;

    if (!existing) {
      await dbRun(
        db,
        `INSERT INTO trivia_scores (guild_id, user_id, correct, total, current_streak, best_streak, total_points, weekly_points)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
        [guildId, userId, isCorrect ? 1 : 0, isCorrect ? 1 : 0, isCorrect ? 1 : 0, points, points]
      );
    } else {
      const newStreak = isCorrect ? existing.current_streak + 1 : 0;
      const newBest = Math.max(newStreak, existing.best_streak);

      await dbRun(
        db,
        `UPDATE trivia_scores
         SET correct = correct + ?, total = total + 1,
             current_streak = ?, best_streak = ?,
             total_points = total_points + ?,
             weekly_points = weekly_points + ?
         WHERE guild_id = ? AND user_id = ?`,
        [isCorrect ? 1 : 0, newStreak, newBest, points, points, guildId, userId]
      );
    }

    return { points, streakBonus };
  } catch (err) {
    console.error(`[TRIVIA-002] Score update failed for user ${userId}:`, err);
    return { points: 0, streakBonus: 0 };
  }
}

/**
 * Get user's trivia stats
 */
async function getTriviaStats(db, guildId, userId) {
  try {
    const row = await dbGet(
      db,
      `SELECT correct, total, current_streak, best_streak, total_points 
       FROM trivia_scores WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    return row || { correct: 0, total: 0, current_streak: 0, best_streak: 0, total_points: 0 };
  } catch (err) {
    console.error(`[TRIVIA-003] Score lookup failed for user ${userId}:`, err);
    return { correct: 0, total: 0, current_streak: 0, best_streak: 0, total_points: 0 };
  }
}

/**
 * Get trivia leaderboard
 */
async function getTriviaLeaderboard(db, guildId, limit = 10) {
  try {
    return await dbAll(
      db,
      `SELECT user_id, correct, total, best_streak, total_points
       FROM trivia_scores WHERE guild_id = ? AND total_points > 0
       ORDER BY total_points DESC LIMIT ?`,
      [guildId, limit]
    );
  } catch (err) {
    console.error(`[TRIVIA-003] Leaderboard lookup failed:`, err);
    return [];
  }
}

/**
 * Get random trivia question
 */
function getRandomQuestion() {
  const idx = Math.floor(Math.random() * TRIVIA_QUESTIONS.length);
  return { ...TRIVIA_QUESTIONS[idx], index: idx };
}

/**
 * Get slash command builders for trivia
 */
function getTriviaCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("trivia")
      .setDescription("Викторина по GTA San Andreas! 🎮"),
    new SlashCommandBuilder()
      .setName("trivia-top")
      .setDescription("Топ знатоков GTA San Andreas"),
    new SlashCommandBuilder()
      .setName("trivia-stats")
      .setDescription("Ваша статистика викторины")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("Пользователь (опционально)").setRequired(false)
      ),
  ];
}

/**
 * Handle trivia slash commands
 */
async function handleTriviaCommand({ interaction, db }) {
  const { commandName } = interaction;

  if (commandName === "trivia") {
    try {
      const question = getRandomQuestion();
      const TIMEOUT_SEC = 30;

      // Create buttons for answers
      const row = new ActionRowBuilder();
      const labels = ["🅰️", "🅱️", "🅾️", "🔷"];

      for (let i = 0; i < question.answers.length; i++) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`trivia_${i}`)
            .setLabel(`${labels[i]} ${question.answers[i]}`)
            .setStyle(ButtonStyle.Secondary)
        );
      }

      const embed = new EmbedBuilder()
        .setTitle("🎮 GTA SA Викторина")
        .setDescription(`**${question.q}**\n\n⏱️ У вас ${TIMEOUT_SEC} секунд!`)
        .setColor(0xf59e0b)
        .setFooter({ text: "Нажмите кнопку с правильным ответом" });

      const reply = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true,
      });

      // Collect button click
      try {
        const collected = await reply.awaitMessageComponent({
          componentType: ComponentType.Button,
          filter: (i) => i.user.id === interaction.user.id,
          time: TIMEOUT_SEC * 1000,
        });

        const selectedIdx = parseInt(collected.customId.split("_")[1], 10);
        const isCorrect = selectedIdx === question.correct;

        const result = await updateTriviaScore(
          db,
          interaction.guild.id,
          interaction.user.id,
          isCorrect
        );

        // Disable all buttons and highlight correct/wrong
        const disabledRow = new ActionRowBuilder();
        for (let i = 0; i < question.answers.length; i++) {
          const style =
            i === question.correct
              ? ButtonStyle.Success
              : i === selectedIdx
              ? ButtonStyle.Danger
              : ButtonStyle.Secondary;
          disabledRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`trivia_done_${i}`)
              .setLabel(`${labels[i]} ${question.answers[i]}`)
              .setStyle(style)
              .setDisabled(true)
          );
        }

        const resultEmbed = new EmbedBuilder()
          .setTitle(isCorrect ? "✅ Правильно!" : "❌ Неправильно!")
          .setDescription(
            isCorrect
              ? `+${result.points} очков${result.streakBonus > 0 ? ` (бонус за серию: +${result.streakBonus})` : ""}!`
              : `Правильный ответ: **${question.answers[question.correct]}**`
          )
          .setColor(isCorrect ? 0x22c55e : 0xef4444);

        await collected.update({ embeds: [resultEmbed], components: [disabledRow] });
      } catch {
        // Timeout
        const timeoutRow = new ActionRowBuilder();
        for (let i = 0; i < question.answers.length; i++) {
          const style = i === question.correct ? ButtonStyle.Success : ButtonStyle.Secondary;
          timeoutRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`trivia_timeout_${i}`)
              .setLabel(`${labels[i]} ${question.answers[i]}`)
              .setStyle(style)
              .setDisabled(true)
          );
        }

        const timeoutEmbed = new EmbedBuilder()
          .setTitle("⏱️ Время вышло!")
          .setDescription(`Правильный ответ: **${question.answers[question.correct]}**`)
          .setColor(0xf59e0b);

        await interaction.editReply({ embeds: [timeoutEmbed], components: [timeoutRow] });

        // Count as wrong
        await updateTriviaScore(db, interaction.guild.id, interaction.user.id, false);
      }
    } catch (err) {
      console.error("[TRIVIA-004] Question delivery failed:", err);
      const errorMsg = "❌ Ошибка при загрузке вопроса. Попробуйте снова.";
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ content: errorMsg }).catch(() => {});
      } else {
        await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
      }
    }
  } else if (commandName === "trivia-top") {
    await interaction.deferReply();

    const rows = await getTriviaLeaderboard(db, interaction.guild.id, 10);
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
      return interaction.editReply({ content: "Пока никто не играл в викторину. Начни первым с /trivia!" });
    }

    const lines = visible.map((e, i) => {
      const accuracy = e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0;
      return `\`${i + 1}.\` **${e.member.user.tag}** — ${e.total_points} очков (${accuracy}% правильных, серия: ${e.best_streak})`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🏆 Топ знатоков GTA San Andreas")
      .setDescription(lines.join("\n"))
      .setColor(0xf59e0b)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } else if (commandName === "trivia-stats") {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const stats = await getTriviaStats(db, interaction.guild.id, targetUser.id);
    const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle(`🎮 Статистика викторины — ${targetUser.tag}`)
      .addFields(
        { name: "🏆 Очки", value: `${stats.total_points}`, inline: true },
        { name: "✅ Правильных", value: `${stats.correct}/${stats.total} (${accuracy}%)`, inline: true },
        { name: "🔥 Текущая серия", value: `${stats.current_streak}`, inline: true },
        { name: "⭐ Лучшая серия", value: `${stats.best_streak}`, inline: true }
      )
      .setColor(0xf59e0b)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
}

module.exports = {
  TRIVIA_QUESTIONS,
  ensureTriviaTable,
  updateTriviaScore,
  getTriviaStats,
  getTriviaLeaderboard,
  getRandomQuestion,
  getTriviaCommandBuilders,
  handleTriviaCommand,
};
