"use strict";
/**
 * Slash-command definitions and registration helper.
 *
 * Single source of truth for every slash command the bot exposes.
 * index.js imports `buildCommandsJson` and `registerGuildCommands`.
 */

const {
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");

const { getSampLifeCommandBuilders } = require("../features/samp-life");
const { getHolidayCommandBuilders } = require("../features/holidays");
const { getTriviaCommandBuilders } = require("../features/trivia");
const { getLevelsCommandBuilders } = require("../features/levels");
const { getWeeklyAwardsCommandBuilders } = require("../features/weekly-awards");
const { getRadioCommandBuilders } = require("../features/radio-vote");
const { getSampExtendedCommandBuilders } = require("../features/samp-extended");
const { getSeasonalEventCommandBuilders } = require("../features/seasonal-events");
const { getGameFaqCommandBuilders } = require("../features/game-faq");
const { getCosmeticsCommandBuilders } = require("../features/samp-cosmetics");
const { getOnboardingCommandBuilders } = require("../features/samp-onboarding");
const { getPrestigeCommandBuilders } = require("../features/samp-prestige");
const { getVipCommandBuilders } = require("../features/samp-vip");
const { getUpgradeCommandBuilders } = require("../features/samp-property-upgrades");
const { getCrateCommandBuilders } = require("../features/samp-crates");
const { getStaffRoleRequestCommandBuilder } = require("../features/staff-role-requests");
const { getChatBridgeCommandBuilders } = require("../features/chat-bridge");
const { getPlayCommandBuilder } = require("../features/play-hub");

// -- Registration filters -----------------------------------------------------

/**
 * Commands that exist in code but are deliberately not registered — legacy or
 * owner-only tooling reachable by other means.
 */
const HIDDEN_COMMANDS = new Set([
  "userstats", "top5", "top10", "backfill", "sync-missing",
  "reactions", "export", "mystrikes",
  "whitelist", "automod", "sampstatus",
  "holiday",
  "portfolio",
  "radio", "radio-top", "radio-info", "radio-fans",
]);

/**
 * Phase 2 hard cut (see PHASE2_PLAN.md).
 *
 * These commands are no longer registered with Discord — every one of them is
 * reachable from a `/play <категория>` panel instead. The handlers are
 * untouched; play-hub.js calls them through a shimmed interaction.
 *
 * What deliberately stays top-level:
 *   - habit commands typed dozens of times a session (/work /balance /daily)
 *   - anything aimed at another player, because Discord modals cannot pick a
 *     user (/pay /duel /race /rob /bounty /sellcar)
 *   - the onboarding path (/reg /quest /progress)
 *   - /gang, which already has its own coherent subcommand tree
 */
const FOLDED_INTO_PLAY = new Set([
  // работа
  "truck", "jobs", "dojob", "collectincome", "bizrun", "airjob",
  // транспорт
  "dealership", "buy", "buycar", "switchcar", "garage", "tune", "repair", "insure",
  // бизнес
  "businesses", "bizstats", "mbizstats", "buybiz", "maintainbiz",
  "realestate", "buymansion", "buyaircraft", "mansion-collect", "estate",
  "stocks", "buystock", "sellstock", "hire", "fire", "crew", "upgrade",
  // криминал
  "heist", "secretheist", "blackmarket", "hottip", "disguise",
  "usejailpass", "userepairkit", "wiretap", "sabotage", "gangbmorder",
  "bountylist",
  // казино
  "slots", "blackjack", "roulette", "lottery",
  // банда (the /gang tree stays; these were duplicate aliases of it)
  "gmap", "gcapture", "gsupportbiz", "gangtop",
  // магазин
  "shopcosmetics", "buycosmetic", "shop", "mycollection", "equip", "unequip",
  "weapon", "weaponshop", "crate", "vip",
  "prestige", "burnmoney", "champagne", "donatechat", "flexboard",
]);

// -- DRY helper for top5/top10 ------------------------------------------------

function buildTopCommand(name, description) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .addChannelOption((o) => o.setName("channel").setDescription("Фильтр по каналу (необязательно)").setRequired(false))
    .addStringOption((o) => o.setName("date").setDescription("Фильтр по дате (ГГГГ-ММ-ДД, необязательно)").setRequired(false))
    .addStringOption((o) => o.setName("period").setDescription("Период (необязательно)").setRequired(false)
      .addChoices(
        { name: "Сегодня", value: "today" },
        { name: "Эта неделя", value: "week" },
        { name: "Этот месяц", value: "month" },
        { name: "Всё время", value: "all" }
      ));
}

// -- Core command builders -----------------------------------------------------

function buildCommandsJson() {
  return [
    new SlashCommandBuilder().setName("mystats").setDescription("Показать вашу статистику сообщений на сервере."),
    new SlashCommandBuilder()
      .setName("userstats")
      .setDescription("Показать статистику другого пользователя.")
      .addUserOption((o) => o.setName("user").setDescription("Выберите пользователя").setRequired(true)),

    buildTopCommand("top5", "Топ 5 пользователей по количеству сообщений."),
    buildTopCommand("top10", "Топ 10 пользователей по количеству сообщений."),

    new SlashCommandBuilder()
      .setName("backfill")
      .setDescription("Загрузить историю сообщений сервера (только владелец, может занять время).")
      .addBooleanOption((o) => o.setName("enhanced").setDescription("Использовать улучшенный бэкфилл (рекомендуется)").setRequired(false))
      .addBooleanOption((o) => o.setName("resume").setDescription("Продолжить с чекпоинта (только для enhanced)").setRequired(false)),
    new SlashCommandBuilder()
      .setName("sync-missing")
      .setDescription("Синхронизировать пропущенные сообщения (только владелец, быстрая синхронизация)."),
    new SlashCommandBuilder()
      .setName("synccommands")
      .setDescription("Перерегистрировать слеш-команды для сервера (только владелец)."),

    new SlashCommandBuilder().setName("weekly").setDescription("Еженедельный рейтинг (обнуляется каждый понедельник)."),
    new SlashCommandBuilder()
      .setName("streak")
      .setDescription("Посмотреть серию активности (свою или другого пользователя).")
      .addUserOption((o) => o.setName("user").setDescription("Пользователь (необязательно)").setRequired(false)),

    new SlashCommandBuilder()
      .setName("reactions")
      .setDescription("Рейтинг по реакциям.")
      .addStringOption((o) =>
        o.setName("type").setDescription("Тип реакций").setRequired(false)
          .addChoices({ name: "Отправленные", value: "given" }, { name: "Полученные", value: "received" })
      ),

    new SlashCommandBuilder().setName("export").setDescription("Экспорт статистики в CSV (только владелец)."),
    new SlashCommandBuilder().setName("mystrikes").setDescription("Просмотреть ваши текущие нарушения и страйки"),

    // Channel whitelist
    new SlashCommandBuilder()
      .setName("whitelist")
      .setDescription("Управление белым списком каналов (только владелец)")
      .addSubcommand((s) => s.setName("add").setDescription("Добавить канал в белый список")
        .addChannelOption((o) => o.setName("channel").setDescription("Канал для добавления").setRequired(true)))
      .addSubcommand((s) => s.setName("remove").setDescription("Удалить канал из белого списка")
        .addChannelOption((o) => o.setName("channel").setDescription("Канал для удаления").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("Показать белый список каналов"))
      .addSubcommand((s) => s.setName("clear").setDescription("Очистить белый список (считать все каналы)")),

    // AutoMod
    new SlashCommandBuilder()
      .setName("automod")
      .setDescription("Управление запрещёнными словами (только владелец)")
      .addSubcommand((s) => s.setName("add").setDescription("Запретить слово")
        .addStringOption((o) => o.setName("word").setDescription("Слово для запрета").setRequired(true))
        .addBooleanOption((o) => o.setName("case_sensitive").setDescription("Учитывать регистр? (по умолчанию: нет)")))
      .addSubcommand((s) => s.setName("remove").setDescription("Разрешить слово")
        .addStringOption((o) => o.setName("word").setDescription("Слово для разрешения").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("Список запрещённых слов"))
      .addSubcommand((s) => s.setName("clear").setDescription("Очистить все запрещённые слова")),

    // Undo / History
    new SlashCommandBuilder()
      .setName("undo")
      .setDescription("Отменить последнюю массовую операцию (только владелец)")
      .addIntegerOption((o) => o.setName("operation_id").setDescription("ID операции для отмены")),
    new SlashCommandBuilder()
      .setName("history")
      .setDescription("Просмотр последних массовых операций (только владелец)")
      .addIntegerOption((o) => o.setName("limit").setDescription("Количество операций (по умолчанию: 10)")),

    // SAMP Server Status
    new SlashCommandBuilder()
      .setName("sampstatus")
      .setDescription("Управление статусом SA-MP серверов (только владелец)")
      .addSubcommand((s) => s.setName("add").setDescription("Добавить SA-MP сервер для отслеживания")
        .addStringOption((o) => o.setName("server_id").setDescription("Идентификатор сервера (напр., server1)").setRequired(true))
        .addStringOption((o) => o.setName("server_name").setDescription("Отображаемое имя (напр., Samp-Rp #1)").setRequired(true))
        .addStringOption((o) => o.setName("ip").setDescription("IP-адрес сервера").setRequired(true))
        .addChannelOption((o) => o.setName("channel").setDescription("Голосовой канал для статуса").setRequired(true))
        .addIntegerOption((o) => o.setName("port").setDescription("Порт сервера (по умолчанию: 7777)"))
        .addStringOption((o) => o.setName("emoji").setDescription("Эмодзи (по умолчанию: 🎮)"))
        .addStringOption((o) => o.setName("online_text").setDescription("Кастомный текст в канале при онлайне (напр., 50/1000)"))
        .addStringOption((o) => o.setName("offline_text").setDescription("Кастомный текст в канале при оффлайне (по умолчанию: ОФФЛАЙН)"))
        .addIntegerOption((o) => o.setName("poll_interval_sec").setDescription("Интервал опроса в секундах (10-3600, по умолчанию: 120)"))
        .addIntegerOption((o) => o.setName("rename_cooldown_sec").setDescription("Мин. интервал переименований канала в секундах (60-1800, по умолчанию: 120)"))
        .addStringOption((o) => o.setName("name_format").setDescription("Шаблон имени канала. Доступно: {emoji} {name} {players} {max} {online} {status}")))
      .addSubcommand((s) => s.setName("remove").setDescription("Удалить отслеживаемый сервер")
        .addStringOption((o) => o.setName("server_id").setDescription("Идентификатор сервера").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("Показать все отслеживаемые серверы"))
      .addSubcommand((s) => s.setName("stop").setDescription("Остановить все трекеры"))
      .addSubcommand((s) => s.setName("start").setDescription("Запустить все трекеры")),

    // Feature module commands
    ...getSampLifeCommandBuilders(),
    ...getHolidayCommandBuilders(),
    ...getTriviaCommandBuilders(),
    ...getLevelsCommandBuilders(),
    ...getWeeklyAwardsCommandBuilders(),
    ...getRadioCommandBuilders(),
    ...getSampExtendedCommandBuilders(),
    ...getSeasonalEventCommandBuilders(),
    ...getGameFaqCommandBuilders(),
    ...getCosmeticsCommandBuilders(),
    ...getOnboardingCommandBuilders(),
    ...getPrestigeCommandBuilders(),
    ...getVipCommandBuilders(),
    ...getUpgradeCommandBuilders(),
    ...getCrateCommandBuilders(),
    ...getChatBridgeCommandBuilders(),
    getStaffRoleRequestCommandBuilder(),

    // The game hub — replaces ~60 individual game commands (PHASE2_PLAN.md).
    getPlayCommandBuilder(),

    // Badges / achievements
    new SlashCommandBuilder()
      .setName("badges")
      .setDescription("Показать заработанные значки (свои или другого пользователя)")
      .addUserOption((o) => o.setName("user").setDescription("Пользователь (необязательно)").setRequired(false)),

    // SAMP Life: richest leaderboard
    new SlashCommandBuilder().setName("richest").setDescription("SAMP Life: рейтинг самых богатых игроков"),

    // SAMP Life: bail out of jail
    new SlashCommandBuilder().setName("bail").setDescription("SAMP Life: откупиться от тюрьмы (стоимость зависит от оставшегося времени)"),

    // SAMP Life: daily login bonus
    new SlashCommandBuilder().setName("daily").setDescription("SAMP Life: ежедневный бонус (зависит от стрика)"),

    // Admin: command usage statistics
    new SlashCommandBuilder()
      .setName("commandstats")
      .setDescription("Статистика использования команд (только владелец сервера/бота)")
      .addIntegerOption((o) =>
        o.setName("days").setDescription("Период в днях (по умолчанию: 7)").setRequired(false)
          .setMinValue(1).setMaxValue(90)
      )
      .addBooleanOption((o) =>
        o.setName("all_guilds").setDescription("(Только владелец бота) Показать данные по всем серверам").setRequired(false)
      ),
  ].filter((cmd) => !HIDDEN_COMMANDS.has(cmd.name) && !FOLDED_INTO_PLAY.has(cmd.name))
    .map((cmd) => cmd.toJSON());
}

// -- Guild registration -------------------------------------------------------

async function registerGuildCommands(client, guildId, token, { maxAttempts = 3 } = {}) {
  const commands = buildCommandsJson();
  const rest = new REST({ version: "10" }).setToken(token);

  console.log("[Slash] Commands to register: " + commands.length);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`[Slash] Registering commands for guild ${guildId} (attempt ${attempt}/${maxAttempts})...`);
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
      console.log("[Slash] Commands registered for guild " + guildId + ".");
      return true;
    } catch (error) {
      const status = error?.status ?? error?.rawError?.status;
      const retryAfterSeconds = Number(error?.rawError?.retry_after || 0);
      const details = error?.rawError?.errors || error?.errors;

      console.error("[Slash] Error registering commands for guild " + guildId + ":", error.message || error);
      if (details) {
        console.error("[Slash] Registration error details:", JSON.stringify(details, null, 2));
      }

      if (status === 429 && retryAfterSeconds > 0 && attempt < maxAttempts) {
        const waitMs = Math.ceil(retryAfterSeconds * 1000) + 1000;
        console.warn(`[Slash] Rate limited for guild ${guildId}. Retrying in ${Math.ceil(waitMs / 1000)}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      return false;
    }
  }

  return false;
}

module.exports = { buildCommandsJson, registerGuildCommands };
