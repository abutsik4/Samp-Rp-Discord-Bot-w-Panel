"use strict";
/**
 * Canonical sync for the commands/docs channel.
 *
 * This script updates the four existing documentation posts in-place and keeps
 * the channel on a single embed-first design. If commands change, update this
 * script and rerun it instead of posting ad-hoc messages.
 *
 * Usage: node scripts/update-commands-and-post-guide.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { REST, Routes } = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const rest = new REST({ version: "10" }).setToken(TOKEN);

const COMMANDS_CHANNEL = "1450304325686399070";
const ADMIN_NOTES_CHANNEL = "1489179230376824852";
const MESSAGE_IDS = {
  overview: { channelId: COMMANDS_CHANNEL, messageId: "1482448047412871382" },
  gameplay: { channelId: COMMANDS_CHANNEL, messageId: "1488481339677081650" },
  community: { channelId: COMMANDS_CHANNEL, messageId: "1488481365862252795" },
  admin: { channelId: ADMIN_NOTES_CHANNEL, messageId: "1491120474069930014" },
};

function lines(...items) {
  return items.join("\n");
}

function field(name, value) {
  return { name, value, inline: false };
}

function validateEmbed(embed) {
  const totalLength =
    (embed.title || "").length +
    (embed.description || "").length +
    (embed.footer?.text || "").length +
    (embed.fields || []).reduce((sum, current) => sum + current.name.length + current.value.length, 0);

  if ((embed.title || "").length > 256) throw new Error(`Embed title too long: ${embed.title}`);
  if ((embed.description || "").length > 4096) throw new Error(`Embed description too long: ${embed.title}`);
  if ((embed.footer?.text || "").length > 2048) throw new Error(`Embed footer too long: ${embed.title}`);
  if ((embed.fields || []).length > 25) throw new Error(`Too many fields in embed: ${embed.title}`);
  if (totalLength > 6000) throw new Error(`Embed exceeds Discord total length limit: ${embed.title}`);

  for (const current of embed.fields || []) {
    if (current.name.length > 256) throw new Error(`Field name too long in embed: ${embed.title}`);
    if (current.value.length > 1024) throw new Error(`Field value too long in embed: ${embed.title} / ${current.name}`);
  }
}

async function editMessage(channelId, messageId, payload) {
  return rest.patch(Routes.channelMessage(channelId, messageId), { body: payload });
}

const channelPosts = [
  {
    channelId: MESSAGE_IDS.overview.channelId,
    id: MESSAGE_IDS.overview.messageId,
    label: "overview",
    embeds: [
      {
        title: "🎮 SAMP Life — Старт, экономика и казино",
        description:
          "Добро пожаловать в **SAMP Life** — игру в стиле GTA San Andreas Roleplay прямо в Discord.\n" +
          "Начни с **`/reg`**, получи стартовые деньги и дальше развивайся через работу, бизнесы, банды и события.",
        color: 0xf59e0b,
        fields: [
          field(
            "💼 Быстрый старт",
            lines(
              "**`/reg`** — регистрация и стартовый набор",
              "**`/balance`** — профиль, деньги и имущество",
              "**`/pay user:@игрок amount:<$>`** — перевести деньги",
              "**`/daily`** — ежедневный бонус",
              "**`/bail`** — выйти из тюрьмы за деньги",
              "**`/events`** — активные бонусы и ивенты",
              "**`/richest`** — рейтинг самых богатых"
            )
          ),
          field(
            "💰 Заработок",
            lines(
              "**`/work`** — короткая подработка",
              "**`/truck`** — рейс дальнобойщика",
              "**`/rob [user:@игрок]`** — ограбить магазин или игрока",
              "**`/jobs`** — посмотреть задания дня",
              "**`/dojob number:<1-3>`** — выполнить выбранное задание",
              "**`/heist tier:<цель>`** — кооперативное ограбление"
            )
          ),
          field(
            "🎰 Казино",
            lines(
              "**`/slots bet:<$>`** — игровые автоматы",
              "**`/blackjack bet:<$>`** — блэкджек",
              "**`/roulette color:<цвет> bet:<$>`** — рулетка"
            )
          ),
        ],
        footer: { text: "SAMP Life — актуальная справка по игровым slash-командам" },
      },
      {
        title: "🚗 Техника, бой и бизнесы",
        color: 0xef4444,
        fields: [
          field(
            "🏁 Машины и гонки",
            lines(
              "**`/dealership`** — список доступных авто",
              "**`/buy type:car id:<id>`** — купить машину",
              "**`/garage`** — посмотреть гараж и тюнинг",
              "**`/tunecar car:<id> upgrade:<id>`** — установить апгрейд",
              "**`/race user:@игрок bet:<$>`** — гонка на деньги",
              "**`/sellcar user:@игрок car:<id> price:<$>`** — создать оффер",
              "**`/buycar offer:<id>`** — купить машину по офферу"
            )
          ),
          field(
            "🔫 Оружие и PvP",
            lines(
              "**`/weaponshop`** — магазин оружия",
              "**`/buy type:weapon id:<id>`** — купить оружие",
              "**`/weapon id:<id>`** — экипировать оружие",
              "**`/repair`** — починить оружие",
              "**`/duel user:@игрок bet:<$>`** — дуэль на деньги",
              "**`/bounty user:@игрок amount:<$>`** — назначить награду",
              "**`/bountylist`** — посмотреть список целей"
            )
          ),
          field(
            "🏢 Бизнесы",
            lines(
              "**`/businesses`** — список доступных бизнесов",
              "**`/buybiz id:<id>`** — купить бизнес",
              "**`/collectincome`** — собрать доход",
              "**`/maintainbiz [id]`** — обслужить все бизнесы или один",
              "**`/bizrun id:<id>`** — вручную поработать на бизнесе"
            )
          ),
        ],
        footer: { text: "Машины, оружие и бизнесы работают в одной общей экономике" },
      },
    ],
  },
  {
    channelId: MESSAGE_IDS.gameplay.channelId,
    id: MESSAGE_IDS.gameplay.messageId,
    label: "gameplay",
    embeds: [
      {
        title: "👥 Банды, районы и редкие системы",
        description:
          "Если уже поднялся на ногах, дальше начинается контроль районов, поддержка бизнеса банды и охота за редкими преимуществами.",
        color: 0x22c55e,
        fields: [
          field(
            "🤝 Банды",
            lines(
              "**`/gang create name:<название> tag:<тег>`** — создать банду",
              "**`/gang invite user:@игрок`** — пригласить игрока",
              "**`/gang leave`** — покинуть банду",
              "**`/gang deposit amount:<$>`** — пополнить казну",
              "**`/gang info`** — информация о банде",
              "**`/gang top`** — рейтинг банд"
            )
          ),
          field(
            "🗺️ Районы и контроль",
            lines(
              "**`/gmap`** — список районов San Andreas",
              "**`/gcapture district:<район>`** — атаковать или укрепить район",
              "**`/gsupportbiz user:@игрок business:<id>`** — помочь бизнесу участника из казны",
              "Контроль района даёт бонус бизнесам вашей банды в этой зоне."
            )
          ),
          field(
            "🎟️ Редкие системы",
            lines(
              "**`/shopcosmetics`** — магазин косметики",
              "**`/buycosmetic id:<id>`** — купить косметический предмет",
              "**`/lottery buy [count]`** — купить лотерейные билеты",
              "**`/lottery info`** — текущий статус лотереи",
              "**`/blackmarket browse`** — посмотреть чёрный рынок",
              "**`/blackmarket buy slot:<номер>`** — купить слот с рынка"
            )
          ),
        ],
        footer: { text: "Эта часть игры рассчитана на поздний прогресс и командную игру" },
      },
    ],
  },
  {
    channelId: MESSAGE_IDS.community.channelId,
    id: MESSAGE_IDS.community.messageId,
    label: "community",
    embeds: [
      {
        title: "📊 Команды сервера — статистика, уровни и активности",
        description:
          "Кроме SAMP Life, бот ведёт серверную статистику, уровни, викторины, радио-голосование и праздничные команды.",
        color: 0x3b82f6,
        fields: [
          field(
            "📈 Статистика активности",
            lines(
              "**`/mystats`** — твоя статистика сообщений",
              "**`/userstats user:@игрок`** — статистика другого пользователя",
              "**`/top5 [channel] [date] [period]`** — топ-5 по сообщениям",
              "**`/top10 [channel] [date] [period]`** — топ-10 по сообщениям",
              "**`/weekly`** — рейтинг недели",
              "**`/streak [user:@игрок]`** — серия активности",
              "**`/reactions [type]`** — рейтинг по реакциям"
            )
          ),
          field(
            "🏆 Прогресс и награды",
            lines(
              "**`/badges [user:@игрок]`** — значки и достижения",
              "**`/level [user:@игрок]`** — текущий уровень",
              "**`/levels-top`** — топ по уровням",
              "**`/awards`** — итоги недели",
              "**`/mystrikes`** — текущие страйки и розыск",
              "**`/countdown`** — отсчёт до Нового Года"
            )
          ),
          field(
            "🎮 Фан и события",
            lines(
              "**`/trivia`** — викторина по GTA San Andreas",
              "**`/trivia-top`** — топ знатоков",
              "**`/trivia-stats [user:@игрок]`** — статистика по викторине",
              "**`/radio station:<станция>`** — проголосовать за радиостанцию",
              "**`/radio-top`** — рейтинг станций",
              "**`/radio-info station:<станция>`** — инфо о станции",
              "**`/radio-fans station:<станция>`** — фанаты станции",
              "**`/holiday today`** — праздники на сегодня",
              "**`/holiday date value:<YYYY-MM-DD>`** — праздники на дату",
              "**`/holiday list date:<YYYY-MM-DD>`** — ручные праздники на дату"
            )
          ),
        ],
        footer: { text: "Серверные команды доступны отдельно от игровой экономики" },
      },
    ],
  },
  {
    channelId: MESSAGE_IDS.admin.channelId,
    id: MESSAGE_IDS.admin.messageId,
    label: "admin",
    embeds: [
      {
        title: "🛠️ Админ-команды — модерация и ручное управление",
        description:
          "Ниже полный набор служебных и админ-команд. Этот пост живёт в отдельном канале и обновляется через `npm run docs:commands-channel`.",
        color: 0x8b5cf6,
        fields: [
          field(
            "🔒 Каналы и автомод",
            lines(
              "**`/whitelist add channel:#канал`** — добавить канал в белый список",
              "**`/whitelist remove channel:#канал`** — убрать канал из списка",
              "**`/whitelist list`** — показать текущий список",
              "**`/whitelist clear`** — очистить белый список",
              "**`/automod add word:<слово> [case_sensitive]`** — запретить слово",
              "**`/automod remove word:<слово>`** — разрешить слово",
              "**`/automod list`** — список запрещённых слов",
              "**`/automod clear`** — очистить словарь автомода"
            )
          ),
          field(
            "🗓️ Ручные праздники и история",
            lines(
              "**`/holiday add date:<YYYY-MM-DD> title:<название> [note]`** — добавить ручной праздник",
              "**`/holiday list date:<YYYY-MM-DD>`** — список ручных праздников на дату",
              "**`/holiday remove id:<id>`** — удалить ручной праздник",
              "**`/undo [operation_id]`** — откат последней массовой операции",
              "**`/history [limit]`** — журнал массовых операций"
            )
          ),
        ],
        footer: { text: "Админ-справка поддерживается автоматически и должна оставаться в embed-формате" },
      },
      {
        title: "⚙️ Админ-команды — обслуживание и инфраструктура",
        description:
          "Команды ниже в основном нужны владельцу бота для обслуживания, синхронизации и технических операций.",
        color: 0x7c3aed,
        fields: [
          field(
            "🧰 Синхронизация и сервис",
            lines(
              "**`/backfill [enhanced] [resume]`** — загрузить историю сообщений",
              "**`/sync-missing`** — синхронизировать пропуски",
              "**`/synccommands`** — перерегистрировать slash-команды",
              "**`/export`** — экспорт статистики в CSV",
              "**`/demoembed`** — тестовая embed-команда"
            )
          ),
          field(
            "🖥️ Статусы SA-MP серверов",
            lines(
              "**`/sampstatus add server_id:<id> server_name:<имя> ip:<ip> channel:#канал [port] [emoji]`** — добавить сервер",
              "**`/sampstatus remove server_id:<id>`** — удалить сервер",
              "**`/sampstatus list`** — список отслеживаемых серверов",
              "**`/sampstatus start`** — запустить трекеры",
              "**`/sampstatus stop`** — остановить трекеры"
            )
          ),
        ],
        footer: { text: "Публичные игровые команды остаются в канале 1450304325686399070" },
      },
    ],
  },
];

(async () => {
  try {
    for (const post of channelPosts) {
      for (const embed of post.embeds) validateEmbed(embed);
    }

    console.log("Syncing command docs...");

    for (const post of channelPosts) {
      await editMessage(post.channelId, post.id, { content: "", embeds: post.embeds });
      console.log(`   ✓ Updated ${post.label}: ${post.channelId}/${post.id}`);
    }

    console.log("\nDone!");
  } catch (err) {
    console.error("Failed:", err.status, err.message);
    if (err.rawError) console.error("Details:", JSON.stringify(err.rawError, null, 2));
    process.exit(1);
  }
})();
