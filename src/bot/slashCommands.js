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
      .setDescription("Загрузить историю сообщений сервера (только владелец, может занять время)."),
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
    new SlashCommandBuilder().setName("countdown").setDescription("Обратный отсчёт до Нового Года!"),
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
        .addStringOption((o) => o.setName("emoji").setDescription("Эмодзи (по умолчанию: \xF0\x9F\x8E\xAE)")))
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
  ].map((cmd) => cmd.toJSON());
}

// -- Guild registration -------------------------------------------------------

async function registerGuildCommands(client, guildId, token) {
  const commands = buildCommandsJson();
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    console.log("Registering slash commands for guild " + guildId + "...");
    await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
    console.log("Slash commands registered for guild " + guildId + ".");
  } catch (error) {
    console.error("Error registering slash commands for guild " + guildId + ":", error);
  }
}

module.exports = { buildCommandsJson, registerGuildCommands };
