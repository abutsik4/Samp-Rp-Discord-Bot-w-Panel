"use strict";
/**
 * One-time script:
 *   1) Edit the existing "Все Команды Бота" message with all current commands
 *   2) Post SAMP Life game guide embeds to the same commands channel
 *
 * Usage:  node scripts/update-commands-and-post-guide.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { REST, Routes } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const rest = new REST({ version: "10" }).setToken(TOKEN);

const COMMANDS_CHANNEL = "1450304325686399070"; // #📖┆команды-бота-samp-rp
const COMMANDS_MSG_ID = "1452075405078167714";  // existing "Все Команды Бота" message

async function editMessage(channelId, messageId, payload) {
  return rest.patch(Routes.channelMessage(channelId, messageId), { body: payload });
}

async function sendMessage(channelId, payload) {
  return rest.post(Routes.channelMessages(channelId), { body: payload });
}

// ── Updated commands embed ──────────────────────────────────────────

const commandsEmbed = {
  title: "📚 Все Команды Бота",
  description:
    "Полный список доступных команд бота **Samp-Rp**.",
  color: 0x7357cc, // keep original purple
  fields: [
    {
      name: "📊 Статистика",
      value:
        "`/mystats` — Твоя статистика сообщений\n" +
        "`/userstats @user` — Статистика другого пользователя\n" +
        "`/top5` — Топ-5 по сообщениям\n" +
        "`/top10` — Топ-10 по сообщениям\n" +
        "`/weekly` — Недельный рейтинг (обнуляется в Пн)\n" +
        "`/streak [@user]` — Серия активности (дни подряд)\n" +
        "`/reactions [type]` — Рейтинг по реакциям",
      inline: false,
    },
    {
      name: "⭐ Уровни и XP",
      value:
        "`/level [@user]` — Уровень, ранг и прогресс\n" +
        "`/levels-top` — Топ-10 по уровню\n" +
        "`/badges [@user]` — Все значки (заработанные и доступные)\n" +
        "`/awards` — Еженедельные награды San Andreas",
      inline: false,
    },
    {
      name: "🎮 Викторина GTA SA",
      value:
        "`/trivia` — Случайный вопрос по GTA SA (30 сек)\n" +
        "`/trivia-top` — Топ знатоков\n" +
        "`/trivia-stats [@user]` — Статистика викторины",
      inline: false,
    },
    {
      name: "📻 Радио",
      value:
        "`/radio station:<станция>` — Голосуй за радиостанцию\n" +
        "`/radio-top` — Рейтинг радиостанций\n" +
        "`/radio-info station:<станция>` — Инфо: DJ, треки, описание\n" +
        "`/radio-fans station:<станция>` — Кто слушает станцию",
      inline: false,
    },
    {
      name: "💰 SAMP Life — Экономика",
      value:
        "`/reg` — Регистрация (500$ + велосипед)\n" +
        "`/balance` — Профиль: деньги, авто, оружие\n" +
        "`/work` — Подработка (100–500$)\n" +
        "`/truck` — Дальнобой (2.5–6.5к$, риск аварии)\n" +
        "`/rob` — Ограбление (2–10к$, риск тюрьмы)\n" +
        "`/daily` — Ежедневный бонус (до 50к$ за серию)\n" +
        "`/bail` — Выйти из тюрьмы за деньги\n" +
        "`/richest` — Топ-10 богатейших игроков\n" +
        "`/dealership` — Автосалон\n" +
        "`/buy type:(car|weapon) id:<id>` — Купить\n" +
        "`/weapon id:<id>` — Экипировать оружие",
      inline: false,
    },
    {
      name: "⚔️ SAMP Life — PvP и Торговля",
      value:
        "`/race @user bet:<сумма>` — Гонки на ставку\n" +
        "`/duel @user bet:<сумма>` — Дуэль на ставку\n" +
        "`/sellcar user:@user car:<id> price:<$>` — Продать авто\n" +
        "`/buycar offer:<id>` — Купить авто по предложению",
      inline: false,
    },
    {
      name: "🎉 Разное",
      value:
        "`/countdown` — Обратный отсчёт до Нового Года\n" +
        "`/mystrikes` — Просмотр страйков и уровня розыска\n" +
        "`/holiday today` — Праздники сегодня",
      inline: false,
    },
  ],
  footer: { text: "Samp-Rp • Полный список актуальных команд" },
  timestamp: new Date().toISOString(),
};

// ── SAMP Life game guide embeds ─────────────────────────────────────

const gameGuide1 = {
  title: "🎮 SAMP Life — Экономическая игра в Discord",
  description:
    "Добро пожаловать в **SAMP Life** — мини-игру в стиле GTA San Andreas Roleplay!\n" +
    "Зарабатывай деньги, покупай тачки и оружие, участвуй в гонках и дуэлях.\n\n" +
    "Начни с команды `/reg` — получишь **500$** и велосипед 🚲",
  color: 0xf59e0b,
  fields: [
    {
      name: "💰 Как заработать деньги",
      value:
        "**`/work`** — Подработка (100–500$, кд 60 сек)\n" +
        "**`/truck`** — Дальнобой (2 500–6 500$, кд 15 мин)\n" +
        "┗ ⚠️ 18% шанс аварии → штраф 800–2 500$\n" +
        "**`/rob`** — Ограбление (2 000–10 000$, кд 10 мин)\n" +
        "┗ ⚠️ 35% шанс тюрьмы → 5 мин + штраф 1 000–4 000$",
      inline: false,
    },
    {
      name: "🚗 Автосалон — `/dealership`",
      value:
        "```\n" +
        "Велосипед    —      бесплатно  (скор. 5)\n" +
        "Sultan RS    —     50 000$     (скор. 80)\n" +
        "Elegy        —    100 000$     (скор. 95)\n" +
        "Infernus     —    500 000$     (скор. 120)\n" +
        "```\n" +
        "Покупка: `/buy type:car id:sultan`\n" +
        "Скорость влияет на результат в `/race`",
      inline: false,
    },
    {
      name: "🔫 Оружие — `/buy type:weapon`",
      value:
        "```\n" +
        "Пистолет     —     15 000$     (урон 10-18)\n" +
        "Дробовик     —     70 000$     (урон 18-30)\n" +
        "AK-47        —    160 000$     (урон 22-36)\n" +
        "```\n" +
        "Экипировать: `/weapon id:ak47`\n" +
        "Урон влияет на результат в `/duel`",
      inline: false,
    },
  ],
  footer: { text: "SAMP Life — экономика San Andreas в твоём Discord" },
};

const gameGuide2 = {
  title: "⚔️ PvP и Торговля",
  color: 0xef4444,
  fields: [
    {
      name: "🏁 Гонки — `/race`",
      value:
        "**`/race user:@игрок bet:1000`**\n" +
        "Победитель = скорость авто + случайный фактор (1–50).\n" +
        "Чем лучше тачка — тем выше шанс победить. Проигравший отдаёт ставку.",
      inline: false,
    },
    {
      name: "💥 Дуэли — `/duel`",
      value:
        "**`/duel user:@игрок bet:2000`**\n" +
        "6 раундов боя. Урон зависит от оружия.\n" +
        "Нет оружия = кулаки (1–8 урона). Покупай пушки чтобы побеждать!",
      inline: false,
    },
    {
      name: "🤝 Торговля авто",
      value:
        "**`/sellcar user:@покупатель car:sultan price:40000`** — создать предложение\n" +
        "**`/buycar offer:1`** — принять предложение и купить",
      inline: false,
    },
    {
      name: "📋 Полезные команды",
      value:
        "`/balance` — профиль (деньги, тачка, оружие, статус)\n" +
        "`/dealership` — список доступных авто и цены\n" +
        "`/weapon id:<id>` — экипировать оружие перед дуэлью\n" +
        "`/daily` — ежедневный бонус (серия = больше денег)\n" +
        "`/bail` — выйти из тюрьмы досрочно\n" +
        "`/richest` — топ-10 богатейших игроков\n" +
        "`/badges` — все значки и достижения",
      inline: false,
    },
  ],
  footer: { text: "Удачи на улицах San Andreas! 🌴" },
};

// ── Main ────────────────────────────────────────────────────────────

(async () => {
  try {
    // 1) Update the existing commands message
    console.log("1) Editing commands message", COMMANDS_MSG_ID, "in channel", COMMANDS_CHANNEL, "...");
    await editMessage(COMMANDS_CHANNEL, COMMANDS_MSG_ID, {
      embeds: [commandsEmbed],
    });
    console.log("   ✓ Commands message updated.");

    // Game guides already posted — uncomment below to re-post if needed
    // await new Promise((r) => setTimeout(r, 1500));
    // console.log("2) Posting SAMP Life game guide to", COMMANDS_CHANNEL, "...");
    // await sendMessage(COMMANDS_CHANNEL, { embeds: [gameGuide1, gameGuide2] });
    // console.log("   ✓ Game guide posted.");

    console.log("\nDone!");
  } catch (err) {
    console.error("Failed:", err.status, err.message);
    if (err.rawError) console.error("Details:", JSON.stringify(err.rawError, null, 2));
    process.exit(1);
  }
})();
