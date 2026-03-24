"use strict";
/**
 * One-time script: post economy game guide + admin config guide
 * to Discord channel 562391575972544532 via REST (no gateway needed).
 *
 * Usage:  node scripts/post-guides.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { REST, Routes } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = "562391575972544532";
const rest = new REST({ version: "10" }).setToken(TOKEN);

async function send(embeds) {
  await rest.post(Routes.channelMessages(CHANNEL_ID), { body: { embeds } });
}

// ── Economy game explanation (Russian) ──────────────────────────────

const economyEmbeds = [
  {
    title: "🎮 SAMP Life — Экономическая игра прямо в Discord",
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
  },
  {
    title: "⚔️ PvP и торговля",
    color: 0xef4444,
    fields: [
      {
        name: "🏁 Гонки — `/race`",
        value:
          "**`/race user:@игрок bet:1000`**\n" +
          "Победитель определяется по скорости авто + случайный фактор (1–50).\n" +
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
          "`/balance` — твой профиль (деньги, тачка, оружие, статус)\n" +
          "`/dealership` — список доступных авто и цены\n" +
          "`/weapon id:<id>` — экипировать оружие перед дуэлью",
        inline: false,
      },
    ],
    footer: { text: "Удачи на улицах San Andreas! 🌴" },
  },
];

// ── Admin configuration guide ───────────────────────────────────────

const adminEmbeds = [
  {
    title: "🛠️ Гайд: настройка бота через Web-панель",
    description:
      "Этот гайд — план действий для настройки XP множителей, автоматической выдачи ролей и других функций через панель управления.",
    color: 0x7c3aed,
    fields: [
      {
        name: "⭐ 1. XP Множители (роли → бонус XP)",
        value:
          "**Где:** Панель → XP Multipliers\n" +
          "**Что делать:** Привязать Discord-роли к множителям XP.\n" +
          "Применяется **только наивысший** множитель (не суммируются).\n\n" +
          "Рекомендованная схема:\n" +
          "```\n" +
          "Server Booster  → 1.5x XP\n" +
          "Модератор       → 1.25x XP\n" +
          "Авторитет (L30) → 1.15x XP\n" +
          "Бог SA (L76)    → 1.3x XP\n" +
          "```\n" +
          "⚠️ Нужно указать **ID роли** в Discord. ПКМ по роли → Copy ID.",
        inline: false,
      },
      {
        name: "🎖️ 2. Авто-выдача ролей (Perks)",
        value:
          "**Где:** Панель → Perks\n" +
          "**Что делать:** Создать правила для автоматической выдачи ролей при достижении уровня или получении значка.\n\n" +
          "Пример правил:\n" +
          "```\n" +
          "trigger: level 10  → grant_role: <ID роли 'Уличный пацан'>\n" +
          "trigger: level 30  → grant_role: <ID роли 'Авторитет'>\n" +
          "trigger: level 76  → grant_role: <ID роли 'Бог SA'>\n" +
          "trigger: badge streak_30 → grant_role: <ID роли 'Активист'>\n" +
          "```\n" +
          "⚠️ Бот должен иметь право **Manage Roles** и стоять выше этих ролей в иерархии.",
        inline: false,
      },
      {
        name: "📢 3. Объявления уровней",
        value:
          "**Переменные окружения (.env):**\n" +
          "```\n" +
          "LEVELS_ANNOUNCE=1\n" +
          "LEVELS_ANNOUNCE_CHANNEL_ID=<ID канала>\n" +
          "```\n" +
          "Если `LEVELS_ANNOUNCE_CHANNEL_ID` не указан — пишет в тот же канал где было сообщение.",
        inline: false,
      },
      {
        name: "📻 4. Радио, Викторина, Экономика",
        value:
          "Эти системы работают автоматически, настройка не требуется.\n" +
          "`/radio` — голосование за радиостанции + инфо о треках\n" +
          "`/trivia` — викторина по GTA SA\n" +
          "`/reg` — экономическая мини-игра",
        inline: false,
      },
      {
        name: "📊 5. Вайтлист каналов",
        value:
          "По умолчанию бот считает сообщения **во всех каналах**.\n" +
          "Чтобы ограничить: `/whitelist add channel:#канал`\n" +
          "Посмотреть список: `/whitelist list`",
        inline: false,
      },
    ],
    footer: { text: "Настраивается через Web-панель: panel.jepsencloud.com" },
  },
];

// ── Main ────────────────────────────────────────────────────────────

(async () => {
  try {
    console.log(`Posting economy guide to channel ${CHANNEL_ID}...`);
    await send(economyEmbeds);
    console.log("✓ Economy guide posted.");

    // small delay to keep order
    await new Promise((r) => setTimeout(r, 1500));

    console.log("Posting admin config guide...");
    await send(adminEmbeds);
    console.log("✓ Admin config guide posted.");

    console.log("\nDone! Both guides posted to channel " + CHANNEL_ID);
  } catch (err) {
    console.error("Failed to post:", err);
    process.exit(1);
  }
})();
