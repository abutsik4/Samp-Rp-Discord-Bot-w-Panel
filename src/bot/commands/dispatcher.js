const { EmbedBuilder } = require("discord.js");
const { logCommandUsage, getCommandStats } = require("../../utils/command-logger");

// Direct imports – no pass-through from index.js
const { handleHolidayCommand } = require("../../features/holidays");
const { handleSampLifeCommand, handleSampLifeAutocomplete } = require("../../features/samp-life");
const { getUserAnalytics, getFunFact, exportStatsToCSV } = require("../../features/analytics");
const { getStreak } = require("../../features/streaks");
const { getUserWeeklyStats, getWeeklyTopUsers } = require("../../features/weekly-stats");
const { getUserReactionStats, getTopReactionsGiven, getTopReactionsReceived } = require("../../features/reactions");
const { getViolationStrikes, getUserViolationData } = require("../../features/rate-limiter");
const { getWantedLevel, formatWantedDisplay } = require("../../features/wanted-stars");
const { handleTriviaCommand } = require("../../features/trivia");
const { handleLevelCommand } = require("../../features/levels");
const { handleAwardsCommand } = require("../../features/weekly-awards");
const { handleRadioVote, handleRadioTop, handleRadioInfo, handleRadioFans } = require("../../features/radio-vote");
const { handleSampExtendedCommand, handleSampExtendedAutocomplete } = require("../../features/samp-extended");
const { handleSampPrestigeCommand, PRESTIGE_COMMAND_NAMES } = require("../../features/samp-prestige");
const { handleSampVipCommand, VIP_COMMAND_NAMES } = require("../../features/samp-vip");
const { handleSampUpgradeCommand, UPGRADE_COMMAND_NAMES } = require("../../features/samp-property-upgrades");
const { handleSampCrateCommand, CRATE_COMMAND_NAMES } = require("../../features/samp-crates");
const { handlePhaseCCommand, PHASEC_COMMAND_NAMES, getPhaseCCommandBuilders } = require("../../features/samp-phasec");
const { handleEventsCommand } = require("../../features/seasonal-events");
const { handleGameFaqCommand } = require("../../features/game-faq");
const {
  handleShopCommand,
  handleShopSelectMenu,
  handleMyCollectionCommand,
  handleEquipCommand,
  handleCosmeticsAutocomplete,
} = require("../../features/samp-cosmetics");
const { handleQuestCommand } = require("../../features/samp-onboarding");
const { getUserBadges, getBadgeDefinitions } = require("../../features/badges");
const { SAMPStatusTracker } = require("../../features/samp-status");
const { getLeaderboard } = require("../../features/leaderboard-cache");
const { handleGiveawayButton } = require("../../features/giveaway");
const { handleSelfRoleButton } = require("../../features/self-roles");
const { handleStreetEventButton } = require("../../features/street-events");
const { handleProgressCommand } = require("../../features/chat-bridge");
const { handlePlayCommand, handlePlayComponent } = require("../../features/play-hub");
const {
  handleRequestStaffRoleCommand,
  handleRequestModalSubmit,
  handleRejectionModalSubmit,
  handleEditReasonModalSubmit,
  handleRequestButton,
} = require("../../features/staff-role-requests");

const SAMP_GAME_COMMAND_CATEGORY = "samp_game";
const SAMP_LIFE_COMMANDS = [
  "reg", "balance", "moneylog", "work", "truck", "rob",
  "dealership", "weaponshop", "buy", "race", "duel",
  "sellcar", "buycar", "weapon",
  "bail", "richest", "daily",
  "pay", "slots", "blackjack", "roulette", "insure",
];
const SAMP_COSMETICS_COMMANDS = ["shop", "mycollection", "equip", "unequip"];
const SAMP_ONBOARDING_COMMANDS = ["quest"];
const SAMP_EXTENDED_COMMANDS = [
  "businesses", "bizstats", "mbizstats", "buybiz", "collectincome",
  "maintainbiz", "bizrun",
  "tune", "switchcar", "garage",
  "bounty", "bountylist",
  "heist",
  "jobs", "dojob",
  "gang", "gmap", "gcapture", "gsupportbiz", "gangtop",
  "shopcosmetics", "buycosmetic",
  "repair",
  "lottery",
  "blackmarket",
  "usejailpass", "userepairkit", "disguise", "hottip", "secretheist",
  "wiretap", "sabotage", "gangbmorder",
];
const SAMP_LIFE_AUTOCOMPLETE_COMMANDS = ["buy", "weapon", "sellcar"];
const SAMP_EXTENDED_AUTOCOMPLETE_COMMANDS = ["buybiz", "bizstats", "mbizstats", "maintainbiz", "bizrun", "tune", "switchcar", "buycosmetic", "gang", "gcapture", "gsupportbiz"];
const SAMP_COSMETICS_AUTOCOMPLETE_COMMANDS = ["equip", "unequip"];
const SAMP_PRESTIGE_COMMANDS = PRESTIGE_COMMAND_NAMES;
const SAMP_VIP_COMMANDS = VIP_COMMAND_NAMES;
const SAMP_UPGRADE_COMMANDS = UPGRADE_COMMAND_NAMES;
const SAMP_CRATE_COMMANDS = CRATE_COMMAND_NAMES;
const SAMP_PHASEC_COMMANDS = PHASEC_COMMAND_NAMES;
const SAMP_GAME_COMMANDS = new Set([...SAMP_LIFE_COMMANDS, ...SAMP_EXTENDED_COMMANDS, ...SAMP_COSMETICS_COMMANDS, ...SAMP_ONBOARDING_COMMANDS, ...SAMP_PRESTIGE_COMMANDS, ...SAMP_VIP_COMMANDS, ...SAMP_UPGRADE_COMMANDS, ...SAMP_CRATE_COMMANDS, ...SAMP_PHASEC_COMMANDS]);

function buildRestrictedChannelWarning(channelId) {
  return `❌ Команды SAMP Life доступны только в канале <#${channelId}>.`;
}

/**
 * Register the interactionCreate handler for slash command dispatch.
 * All command logic is dispatched from a single handler.
 */
function registerCommandHandlers(ctx) {
  const {
    client, db, dbRun, dbGet, dbAll,
    OWNER_ID, TOKEN,
    // Bot helpers (runtime-constructed, must come from ctx)
    isCommandDisabled, getCommandCategoryChannel, getUserMessageCount,
    ruPlural, formatTimeOnServer, performUndo,
    registerGuildCommands, backfillGuild,
    holidaysScheduler,
  } = ctx;

  client.on("interactionCreate", async (interaction) => {
    console.log(`[dispatch] interaction received: type=${interaction.type} customId=${interaction.customId || "-"}`);
    // Staff role request modals (request / reject / edit-reason)
    if (interaction.isModalSubmit && interaction.isModalSubmit() && interaction.customId && String(interaction.customId).startsWith("srr:")) {
      try {
        const ctx = { client, db };
        if (await handleRequestModalSubmit(interaction, ctx)) return;
        if (await handleRejectionModalSubmit(interaction, ctx)) return;
        if (await handleEditReasonModalSubmit(interaction, ctx)) return;
      } catch (e) {
        console.error("[staff-role-requests] modal error", e);
      }
    }
    // /play hub components — buttons, string selects, user selects and modals
    // all share the `play:` customId prefix, so one call covers every step.
    // Routed first: the prefix is unambiguous and cannot belong to anything else.
    try {
      if (await handlePlayComponent(interaction, db)) return;
    } catch (e) {
      console.error("[play-hub] component error", e);
    }

    // Handle giveaway button clicks
    console.log(`[dispatch] D1 isButton=${interaction.isButton()}`);
    if (interaction.isButton()) {
      try {
        const handled = await handleGiveawayButton(interaction);
        console.log(`[dispatch] giveaway handled=${handled}`);
        if (handled) return;
      } catch (e) {
        console.error("[giveaway] button error", e);
      }
      // Self-role toggle buttons (customId prefix: selfrole:<roleId>)
      try {
        const handled = await handleSelfRoleButton(interaction);
        if (handled) return;
      } catch (e) {
        console.error("[self-roles] button error", e);
      }
      // Staff-role request buttons (customId prefix: srr:)
      try {
        const handled = await handleRequestButton(interaction, { client, db });
        if (handled) return;
      } catch (e) {
        console.error("[staff-role-requests] button error", e);
      }
      // Street event claim buttons (customId prefix: street:<eventId>)
      try {
        const handled = await handleStreetEventButton(interaction, db);
        if (handled) return;
      } catch (e) {
        console.error("[street-events] button error", e);
      }
    }
    console.log(`[dispatch] D2 after button check`);

    // Handle cosmetics shop category select menu
    if (interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
      try {
        if (await handleShopSelectMenu(interaction, db)) return;
      } catch (e) {
        console.error("[samp-cosmetics] select menu error", e);
      }
    }
    console.log(`[dispatch] D3 after selectmenu check`);

    // Handle autocomplete for SAMP Life commands
    if (interaction.isAutocomplete()) {
      const guildId = interaction.guild?.id;
      if (guildId && SAMP_GAME_COMMANDS.has(interaction.commandName)) {
        try {
          const restriction = await getCommandCategoryChannel?.(guildId, SAMP_GAME_COMMAND_CATEGORY);
          if (restriction?.channel_id && restriction.channel_id !== interaction.channelId) {
            await interaction.respond([]);
            return;
          }
        } catch (e) {
          console.error("[dispatch] autocomplete restriction check error", e);
        }
      }

      if (SAMP_LIFE_AUTOCOMPLETE_COMMANDS.includes(interaction.commandName)) {
        try {
          await handleSampLifeAutocomplete(interaction, db);
        } catch (e) {
          console.error("[samp-life] autocomplete error", e);
        }
      } else if (SAMP_EXTENDED_AUTOCOMPLETE_COMMANDS.includes(interaction.commandName)) {
        try {
          await handleSampExtendedAutocomplete(interaction, db);
        } catch (e) {
          console.error("[samp-extended] autocomplete error", e);
        }
      } else if (SAMP_COSMETICS_AUTOCOMPLETE_COMMANDS.includes(interaction.commandName)) {
        try {
          await handleCosmeticsAutocomplete(interaction, db);
        } catch (e) {
          console.error("[samp-cosmetics] autocomplete error", e);
        }
      }
      return;
    }

    if (!interaction.isChatInputCommand()) {
      console.log(`[dispatch] NOT isChatInputCommand, type=${interaction.type}, skipping`);
      return;
    }

    const { commandName } = interaction;
    console.log(`[dispatch] routing command: ${commandName}`);
    // ── Hidden command guard ──
    const HIDDEN_COMMANDS = new Set(["userstats","top5","top10","backfill","sync-missing","demoembed","reactions","export","countdown","mystrikes","whitelist","automod","sampstatus","holiday","portfolio","radio","radio-top","radio-info","radio-fans"]);
    if (HIDDEN_COMMANDS.has(commandName)) {
      await interaction.reply({ content: "Эта команда временно отключена.", ephemeral: true });
      return;
    }

    // ── Timing + structured command logging ──
    const _cmdStart = Date.now();
    let _cmdSuccess = true;
    let _cmdError = null;
    const _subcommand = (() => {
      try { return interaction.options.getSubcommand(false); } catch (_) { return null; }
    })();

    // Log usage (fire-and-forget; won't throw)
    logCommandUsage(db, {
      commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id ?? null,
      channelId: interaction.channelId ?? null,
      subcommand: _subcommand,
    });

    // Check if command is disabled
    const guildId = interaction.guild?.id;
    if (guildId) {
      try {
        const disabled = await isCommandDisabled(guildId, commandName);
        if (disabled) {
          await interaction.reply({
            content: "❌ Эта команда отключена администраторами.",
            ephemeral: true,
          });
          return;
        }
      } catch (err) {
        console.error("Error checking command disabled status:", err);
      }

      if (SAMP_GAME_COMMANDS.has(commandName)) {
        try {
          const restriction = await getCommandCategoryChannel?.(guildId, SAMP_GAME_COMMAND_CATEGORY);
          if (restriction?.channel_id && restriction.channel_id !== interaction.channelId) {
            await interaction.reply({
              content: buildRestrictedChannelWarning(restriction.channel_id),
              ephemeral: true,
            });
            return;
          }
        } catch (err) {
          console.error("Error checking command channel restriction:", err);
        }
      }
    }

    // Holidays commands
    if (
      commandName === "holidays" ||
      commandName === "holidays-test" ||
      commandName === "holidays-next" ||
      commandName === "holiday"
    ) {
      await handleHolidayCommand(interaction, {
        ownerId: OWNER_ID,
        db,
        scheduler: holidaysScheduler,
      });
      return;
    }

    // SAMP Life economy commands
    if (
      SAMP_LIFE_COMMANDS.includes(commandName)
    ) {
      try {
        await handleSampLifeCommand({ interaction, db });
        return;
      } catch (err) {
        console.error(`[dispatch] ${commandName} error:`, err);
        try { await dbRun(db, "INSERT INTO bot_command_errors(command_name, user_id, guild_id, error_message, stack) VALUES(?,?,?,?,?)", [commandName, interaction.user?.id, interaction.guild?.id, err?.message || "", err?.stack || ""]); } catch (_) {}
        logCommandUsage(db, { commandName, userId: interaction.user.id, guildId: interaction.guild?.id, channelId: interaction.channelId, subcommand: _subcommand, success: false, durationMs: Date.now() - _cmdStart, errorMessage: err?.message });
        await interaction.reply({ content: "❌ An error occurred while processing your SAMP command.", ephemeral: true });
        return;
      }
    }

    // SAMP Extended economy commands
    if (
      SAMP_EXTENDED_COMMANDS.includes(commandName)
    ) {
      try {
        await handleSampExtendedCommand({ interaction, db });
        return;
      } catch (err) {
        console.error(`[dispatch] ${commandName} error:`, err);
        try { await dbRun(db, "INSERT INTO bot_command_errors(command_name, user_id, guild_id, error_message, stack) VALUES(?,?,?,?,?)", [commandName, interaction.user?.id, interaction.guild?.id, err?.message || "", err?.stack || ""]); } catch (_) {}
        logCommandUsage(db, { commandName, userId: interaction.user.id, guildId: interaction.guild?.id, channelId: interaction.channelId, subcommand: _subcommand, success: false, durationMs: Date.now() - _cmdStart, errorMessage: err?.message });
        await interaction.reply({ content: "❌ An error occurred while processing your SAMP command.", ephemeral: true });
        return;
      }
    }

    // SAMP Prestige (money sinks: flex, mansions, aircraft, stocks, crew)
    if (SAMP_PRESTIGE_COMMANDS.includes(commandName)) {
      try {
        await handleSampPrestigeCommand({ interaction, db });
        return;
      } catch (err) {
        console.error(`[dispatch] ${commandName} error:`, err);
        try { await dbRun(db, "INSERT INTO bot_command_errors(command_name, user_id, guild_id, error_message, stack) VALUES(?,?,?,?,?)", [commandName, interaction.user?.id, interaction.guild?.id, err?.message || "", err?.stack || ""]); } catch (_) {}
        logCommandUsage(db, { commandName, userId: interaction.user.id, guildId: interaction.guild?.id, channelId: interaction.channelId, subcommand: _subcommand, success: false, durationMs: Date.now() - _cmdStart, errorMessage: err?.message });
        await interaction.reply({ content: "❌ An error occurred while processing your SAMP command.", ephemeral: true });
        return;
      }
    }
    // SAMP VIP subscriptions (recurring money sink)
    if (SAMP_VIP_COMMANDS.includes(commandName)) {
      try {
        await handleSampVipCommand({ interaction, db });
        return;
      } catch (err) {
        console.error(`[dispatch] ${commandName} error:`, err);
        try { await dbRun(db, "INSERT INTO bot_command_errors(command_name, user_id, guild_id, error_message, stack) VALUES(?,?,?,?,?)", [commandName, interaction.user?.id, interaction.guild?.id, err?.message || "", err?.stack || ""]); } catch (_) {}
        logCommandUsage(db, { commandName, userId: interaction.user.id, guildId: interaction.guild?.id, channelId: interaction.channelId, subcommand: _subcommand, success: false, durationMs: Date.now() - _cmdStart, errorMessage: err?.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "❌ An error occurred while processing your SAMP command.", ephemeral: true });
        return;
      }
    }
    // SAMP property upgrades (one-time/scaling money sink)
    if (SAMP_UPGRADE_COMMANDS.includes(commandName)) {
      try {
        await handleSampUpgradeCommand({ interaction, db });
        return;
      } catch (err) {
        console.error(`[dispatch] ${commandName} error:`, err);
        try { await dbRun(db, "INSERT INTO bot_command_errors(command_name, user_id, guild_id, error_message, stack) VALUES(?,?,?,?,?)", [commandName, interaction.user?.id, interaction.guild?.id, err?.message || "", err?.stack || ""]); } catch (_) {}
        logCommandUsage(db, { commandName, userId: interaction.user.id, guildId: interaction.guild?.id, channelId: interaction.channelId, subcommand: _subcommand, success: false, durationMs: Date.now() - _cmdStart, errorMessage: err?.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "❌ An error occurred while processing your SAMP command.", ephemeral: true });
        return;
      }
    }
    // SAMP black-market crates (gamble money sink)
    if (SAMP_CRATE_COMMANDS.includes(commandName)) {
      try {
        await handleSampCrateCommand({ interaction, db });
        return;
      } catch (err) {
        console.error(`[dispatch] ${commandName} error:`, err);
        try { await dbRun(db, "INSERT INTO bot_command_errors(command_name, user_id, guild_id, error_message, stack) VALUES(?,?,?,?,?)", [commandName, interaction.user?.id, interaction.guild?.id, err?.message || "", err?.stack || ""]); } catch (_) {}
        logCommandUsage(db, { commandName, userId: interaction.user.id, guildId: interaction.guild?.id, channelId: interaction.channelId, subcommand: _subcommand, success: false, durationMs: Date.now() - _cmdStart, errorMessage: err?.message });
        if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "❌ An error occurred while processing your SAMP command.", ephemeral: true });
        return;
      }
    }
    if (SAMP_PHASEC_COMMANDS.includes(commandName)) {
      try {
        await handlePhaseCCommand({ interaction, db });
        return;
      } catch (err) {
        console.error(`[dispatch] ${commandName} error:`, err);
        try { await dbRun(db, "INSERT INTO bot_command_errors(command_name, user_id, guild_id, error_message, stack) VALUES(?,?,?,?,?)", [commandName, interaction.user?.id, interaction.guild?.id, err?.message || "", err?.stack || ""]); } catch (_) {}
        logCommandUsage(db, { commandName, userId: interaction.user.id, guildId: interaction.guild?.id, channelId: interaction.channelId, subcommand: _subcommand, success: false, durationMs: Date.now() - _cmdStart, errorMessage: err?.message });
        await interaction.reply({ content: "❌ An error occurred while processing your SAMP command.", ephemeral: true });
        return;
      }
    }

    // Staff role request flow
    if (commandName === "request-staff-role") {
      try {
        await handleRequestStaffRoleCommand(interaction, { client, db });
        return;
      } catch (err) {
        console.error(`[dispatch] ${commandName} error:`, err);
        try { await dbRun(db, "INSERT INTO bot_command_errors(command_name, user_id, guild_id, error_message, stack) VALUES(?,?,?,?,?)", [commandName, interaction.user?.id, interaction.guild?.id, err?.message || "", err?.stack || ""]); } catch (_) {}
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "Ошибка при обработке заявки. Попробуйте позже.", ephemeral: true });
        }
        return;
      }
    }
    // SAMP cosmetics shop + inventory
    if (commandName === "shop") {
      await handleShopCommand(interaction, db);
      return;
    }
    if (commandName === "mycollection") {
      await handleMyCollectionCommand(interaction, db);
      return;
    }
    if (commandName === "equip") {
      await handleEquipCommand(interaction, db, { equip: true });
      return;
    }
    if (commandName === "unequip") {
      await handleEquipCommand(interaction, db, { equip: false });
      return;
    }
    if (commandName === "quest") {
      await handleQuestCommand(interaction, db);
      return;
    }

    // Chat progress + samp-rp.su forum award tracker
    if (commandName === "progress") {
      await handleProgressCommand(interaction, db);
      return;
    }

    // The game hub (Phase 2) — renders the panel for a Russian category.
    if (commandName === "play") {
      await handlePlayCommand(interaction, db);
      return;
    }

    // Seasonal events command
    if (commandName === "events") {
      await handleEventsCommand(interaction, db);
      return;
    }

    if (commandName === "mystats") {
      const member = interaction.member;
      const user = interaction.user;

      const analytics = await getUserAnalytics(db, interaction.guild.id, user.id);
      const streak = await getStreak(db, interaction.guild.id, user.id);
      const weeklyCount = await getUserWeeklyStats(db, interaction.guild.id, user.id);
      const reactions = await getUserReactionStats(db, interaction.guild.id, user.id);
      const funFact = getFunFact(analytics.count);

      const joinedAt = member.joinedAt;
      let timeOnServer = "Неизвестно";

      if (joinedAt) {
        timeOnServer = formatTimeOnServer(joinedAt, new Date());
      }

      const embed = new EmbedBuilder()
        .setTitle("📊 Статистика Сообщений")
        .setDescription(`Статистика для ${user.tag}`)
        .addFields(
          { name: "💬 Всего сообщений", value: `${analytics.count.toLocaleString()}`, inline: true },
          { name: "📅 Эта неделя", value: `${weeklyCount}`, inline: true },
          { name: "🏆 Ранг", value: `#${analytics.rank} из ${analytics.totalUsers}`, inline: true },
          { name: "📈 Процентиль", value: `Топ ${100 - analytics.percentile}%`, inline: true },
          { name: "🔥 Текущая серия", value: `${streak.currentStreak} ${ruPlural(streak.currentStreak, "день", "дня", "дней")}`, inline: true },
          { name: "⭐ Лучшая серия", value: `${streak.longestStreak} ${ruPlural(streak.longestStreak, "день", "дня", "дней")}`, inline: true },
          { name: "👍 Реакций отправлено", value: `${reactions.given}`, inline: true },
          { name: "❤️ Реакций получено", value: `${reactions.received}`, inline: true },
          { name: "📆 На сервере", value: `${timeOnServer}`, inline: true },
          { name: "🎯 Интересный факт", value: funFact, inline: false },
        )
        .setColor(0x00aeff)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "userstats") {
      const targetUser = interaction.options.getUser("user");
      const targetMember =
        interaction.guild.members.cache.get(targetUser.id) ||
        (await interaction.guild.members.fetch(targetUser.id).catch(() => null));

      if (!targetMember) {
        return interaction.reply({ content: "Не удалось найти этого пользователя на сервере.", flags: 64 });
      }

      const count = await getUserMessageCount(interaction.guild.id, targetUser.id);

      const joinedAt = targetMember.joinedAt;
      let joinedText = "Неизвестно";
      let timeOnServer = "Неизвестно";

      if (joinedAt) {
        joinedText = joinedAt.toISOString().split("T")[0];
        timeOnServer = formatTimeOnServer(joinedAt, new Date());
      }

      const embed = new EmbedBuilder()
        .setTitle("Статистика пользователя")
        .setDescription(`Статистика для ${targetUser.tag}`)
        .addFields(
          { name: "Сообщений", value: `${count}`, inline: true },
          { name: "Дата входа на сервер", value: `${joinedText}`, inline: true },
          { name: "На сервере", value: `${timeOnServer}`, inline: true },
        )
        .setColor(0xffc300)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "top5" || commandName === "top10") {
      const desiredLimit = commandName === "top5" ? 5 : 10;
      const channel = interaction.options.getChannel("channel");
      const date = interaction.options.getString("date");
      const period = interaction.options.getString("period") || "all";

      await interaction.deferReply();

      let rows;
      let filterDesc = "";

      if (channel || date || period !== "all") {
        const whereClauses = ["guild_id = ?"];
        const params = [interaction.guild.id];

        if (channel) {
          whereClauses.push("channel_id = ?");
          params.push(channel.id);
          filterDesc += ` в #${channel.name}`;
        }

        if (date) {
          whereClauses.push("message_date = ?");
          params.push(date);
          filterDesc += ` за ${date}`;
        } else if (period !== "all") {
          const dateFilter = {
            today: "0 days",
            week: "-7 days",
            month: "-1 month",
          }[period];
          whereClauses.push(`message_date >= date('now', '${dateFilter}')`);
          const periodNames = { today: "сегодня", week: "неделя", month: "месяц" };
          filterDesc += ` (${periodNames[period] || period})`;
        }

        const whereString = whereClauses.join(" AND ");
        const fetchLimit = desiredLimit + 20;

        rows = await dbAll(
          `SELECT user_id, SUM(count) as message_count
           FROM daily_channel_stats
           WHERE ${whereString}
           GROUP BY user_id
           ORDER BY message_count DESC
           LIMIT ?`,
          [...params, fetchLimit]
        );
      } else {
        const fetchLimit = desiredLimit + 20;
        const out = await getLeaderboard(db, interaction.guild.id, fetchLimit, 0);
        rows = out?.data || [];
      }

      const visible = [];
      for (const row of rows) {
        if (visible.length >= desiredLimit) break;

        let member;
        try {
          member = await interaction.guild.members.fetch(row.user_id);
        } catch {
          continue;
        }

        visible.push({ member, count: row.message_count });
      }

      if (!visible.length) {
        await interaction.editReply({
          content: "Пока нет подходящих пользователей для отображения (все из топа покинули сервер или нет данных).",
        });
        return;
      }

      const lines = visible.map((entry, index) => {
        const label = entry.member.user.tag;
        return `\`${index + 1}.\` **${label}** — ${entry.count} сообщений`;
      });

      const desc =
        lines.join("\n") +
        "\n\n*Учтены все сообщения. Показаны только пользователи, которые всё ещё находятся на сервере.*" +
        "\n*Подсчёт может быть неточным: для проверки используй поиск по пользователю в топе.*";

      const title = `${desiredLimit === 5 ? "Топ 5" : "Топ 10"} по количеству сообщений${filterDesc}`;
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(0x8b5cf6)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (commandName === "sync-missing") {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: "Эта команда доступна только владельцу бота.", flags: 64 });
      }

      await interaction.deferReply({ flags: 64 });

      const { syncMissingMessages, ensureWatermarkForGuild } = require("../../features/incremental-sync");

      const watermark = await ensureWatermarkForGuild(client, db, interaction.guild.id);

      if (!watermark.success) {
        return interaction.editReply({
          content: `❌ Не удалось инициализировать маркер: ${watermark.error}\nСначала выполните полный бэкфилл.`,
        });
      }

      if (watermark.source === "live-init") {
        return interaction.editReply({
          content: `✅ Маркер инициализирован на текущем сообщении \`${watermark.messageId}\`.\n\nИсторические сообщения до этого момента не будут восстановлены без полного бэкфилла.`,
        });
      }

      const result = await syncMissingMessages(client, db, interaction.guild.id);

      if (!result.success) {
        return interaction.editReply({
          content: `❌ Ошибка синхронизации: ${result.error}`,
        });
      }

      if (result.synced === 0) {
        return interaction.editReply({
          content: `✅ Нет новых сообщений для синхронизации. Всё актуально!\n\nМаркер: \`${result.watermark.before}\``,
        });
      }

      const channelSummary = Object.entries(result.channelStats || {})
        .map(([name, count]) => `• ${name}: +${count}`)
        .slice(0, 10)
        .join("\n");

      await interaction.editReply({
        content: `✅ Синхронизировано **${result.synced}** пропущенных сообщений!\n\n**Маркер обновлён:**\nДо: \`${result.watermark.before}\`\nПосле: \`${result.watermark.after}\`\n\n**Топ каналов:**\n${channelSummary || "Нет"}`,
      });
    } else if (commandName === "backfill") {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: "Эта команда доступна только владельцу бота.", flags: 64 });
      }

      const enhanced = Boolean(interaction.options?.getBoolean("enhanced"));
      const resume = Boolean(interaction.options?.getBoolean("resume"));

      await interaction.deferReply({ flags: 64 });

      if (enhanced) {
        const { enhancedBackfill } = require("../../features/enhanced-backfill");

        let lastUiUpdateAt = 0;
        const progressCallback = (p) => {
          const now = Date.now();
          if (now - lastUiUpdateAt < 2500 && p?.step === 2) return;
          lastUiUpdateAt = now;

          const step = Number(p?.step || 0);
          if (step === 2) {
            const percent = p?.progress != null ? `${p.progress}%` : "";
            const eta = p?.eta != null ? `, ETA ~${p.eta}m` : "";
            const name = p?.message ? `\n\nТекущий: **${p.message}**` : "";
            interaction.editReply({ content: `⏳ Enhanced backfill… ${percent}${eta}${name}` }).catch(() => {});
            return;
          }

          if (step === 1) {
            interaction.editReply({ content: "⏳ Enhanced backfill… собираю каналы и треды…" }).catch(() => {});
            return;
          }

          if (step === 3) {
            interaction.editReply({ content: "⏳ Enhanced backfill… сравниваю с базой…" }).catch(() => {});
            return;
          }

          if (step === 4) {
            interaction.editReply({ content: "⏳ Enhanced backfill… применяю изменения…" }).catch(() => {});
          }
        };

        await interaction.editReply({
          content: `⏳ Запускаю **enhanced backfill**. Это может занять продолжительное время.\nResume: **${resume ? "да" : "нет"}**`,
        });

        const result = await enhancedBackfill(db, client, interaction.guild.id, { progressCallback, resume, apply: true });
        if (!result?.success) {
          return interaction.editReply({ content: `❌ Enhanced backfill завершился ошибкой: ${result?.error || "unknown"}` });
        }

        const stats = result.stats || {};
        const cmp = result.comparison || {};
        const fixed = result.applied?.fixed ?? 0;

        return interaction.editReply({
          content:
            `✅ Enhanced backfill завершён.\n` +
            `Сообщений: **${stats.totalMessages || "?"}**, пользователей: **${stats.uniqueUsers || "?"}**\n` +
            `Проверка: mismatched=**${cmp.mismatched ?? "?"}**, fixed=**${fixed}**\n` +
            `Ошибок/пропусков: **${stats.failedTargets || 0}**`,
        });
      }

      await interaction.editReply({
        content: "⏳ Запускаю обычный backfill. Это может занять продолжительное время. Прогресс смотри в логах бота.",
      });

      await backfillGuild(interaction.guild);

      return interaction.editReply({ content: "✅ История сообщений собрана." });
    } else if (commandName === "whitelist") {
      if (interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({ content: "❌ Только владелец сервера может управлять белым списком.", flags: 64 });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "add") {
        const ch = interaction.options.getChannel("channel");
        await dbRun(
          `INSERT OR IGNORE INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)`,
          [interaction.guild.id, ch.id]
        );
        return interaction.reply({
          content: `✅ ${ch} добавлен в белый список. Теперь сообщения будут считаться только в разрешённых каналах.`,
          flags: 64,
        });
      } else if (subcommand === "remove") {
        const ch = interaction.options.getChannel("channel");
        await dbRun(
          `DELETE FROM channel_whitelist WHERE guild_id = ? AND channel_id = ?`,
          [interaction.guild.id, ch.id]
        );
        return interaction.reply({
          content: `✅ ${ch} удалён из белого списка.`,
          flags: 64,
        });
      } else if (subcommand === "list") {
        const rows = await dbAll(
          `SELECT channel_id FROM channel_whitelist WHERE guild_id = ?`,
          [interaction.guild.id]
        );
        if (!rows || rows.length === 0) {
          return interaction.reply({
            content: "📋 Белый список пуст. Сообщения считаются во всех каналах.",
            flags: 64,
          });
        }
        const channels = rows.map((r) => `<#${r.channel_id}>`).join(", ");
        return interaction.reply({
          content: `📋 Белый список каналов:\n${channels}\n\nСообщения считаются только в этих каналах.`,
          flags: 64,
        });
      } else if (subcommand === "clear") {
        await dbRun(`DELETE FROM channel_whitelist WHERE guild_id = ?`, [interaction.guild.id]);
        return interaction.reply({
          content: "✅ Белый список очищен. Сообщения теперь считаются во всех каналах.",
          flags: 64,
        });
      }
    } else if (commandName === "automod") {
      if (interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({ content: "❌ Только владелец сервера может управлять AutoMod.", flags: 64 });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "add") {
        const word = interaction.options.getString("word");
        const caseSensitive = interaction.options.getBoolean("case_sensitive") || false;
        await dbRun(
          `INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive, added_by) VALUES (?, ?, ?, ?)`,
          [interaction.guild.id, word.toLowerCase(), caseSensitive ? 1 : 0, interaction.user.id]
        );
        return interaction.reply({
          content: `✅ Слово "${word}" добавлено в список запрещённых ${caseSensitive ? "(с учётом регистра)" : ""}.`,
          flags: 64,
        });
      } else if (subcommand === "remove") {
        const word = interaction.options.getString("word");
        await dbRun(
          `DELETE FROM banned_words WHERE guild_id = ? AND word = ?`,
          [interaction.guild.id, word.toLowerCase()]
        );
        return interaction.reply({
          content: `✅ Слово "${word}" удалено из списка запрещённых.`,
          flags: 64,
        });
      } else if (subcommand === "list") {
        const rows = await dbAll(
          `SELECT word, case_sensitive FROM banned_words WHERE guild_id = ?`,
          [interaction.guild.id]
        );
        if (!rows || rows.length === 0) {
          return interaction.reply({
            content: "📋 Список запрещённых слов пуст.",
            flags: 64,
          });
        }
        const words = rows.map((r) => `• ${r.word}${r.case_sensitive ? " (регистр важен)" : ""}`).join("\n");
        return interaction.reply({
          content: `📋 Запрещённые слова (${rows.length}):\n${words}`,
          flags: 64,
        });
      } else if (subcommand === "clear") {
        await dbRun(`DELETE FROM banned_words WHERE guild_id = ?`, [interaction.guild.id]);
        return interaction.reply({
          content: "✅ Все запрещённые слова удалены.",
          flags: 64,
        });
      }
    } else if (commandName === "undo") {
      if (interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({ content: "❌ Только владелец сервера может отменять операции.", flags: 64 });
      }

      const operationId = interaction.options.getInteger("operation_id");
      await interaction.deferReply({ flags: 64 });

      if (operationId) {
        const row = await dbGet(
          `SELECT * FROM operation_history WHERE id = ? AND guild_id = ? AND undone = 0`,
          [operationId, interaction.guild.id]
        );
        if (!row) {
          return interaction.editReply("❌ Операция не найдена или уже отменена.");
        }
        await performUndo(row);
        await dbRun(`UPDATE operation_history SET undone = 1 WHERE id = ?`, [operationId]);
        return interaction.editReply(`✅ Операция #${operationId} отменена: ${row.operation}`);
      } else {
        const row = await dbGet(
          `SELECT * FROM operation_history WHERE guild_id = ? AND undone = 0 ORDER BY timestamp DESC LIMIT 1`,
          [interaction.guild.id]
        );
        if (!row) {
          return interaction.editReply("❌ Нет операций для отмены.");
        }
        await performUndo(row);
        await dbRun(`UPDATE operation_history SET undone = 1 WHERE id = ?`, [row.id]);
        return interaction.editReply(`✅ Последняя операция отменена: ${row.operation} (#${row.id})`);
      }
    } else if (commandName === "history") {
      if (interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({ content: "❌ Только владелец сервера может просматривать историю.", flags: 64 });
      }

      const limit = interaction.options.getInteger("limit") || 10;

      const rows = await dbAll(
        `SELECT * FROM operation_history WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [interaction.guild.id, Math.min(limit, 50)]
      );

      if (!rows || rows.length === 0) {
        return interaction.reply({
          content: "📋 История операций пуста.",
          flags: 64,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle("📜 История операций")
        .setColor(0x8b5cf6)
        .setTimestamp();

      for (const row of rows) {
        const status = row.undone ? "❌ Отменена" : "✅ Активна";
        const time = `<t:${row.timestamp}:R>`;
        embed.addFields({
          name: `#${row.id} - ${row.operation}`,
          value: `${status} | Кем: <@${row.actor_id}> | Когда: ${time}`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed], flags: 64 });
    } else if (commandName === "sampstatus") {
      if (interaction.user.id !== interaction.guild.ownerId) {
        return interaction.reply({ content: "❌ Только владелец сервера может управлять SAMP трекером.", flags: 64 });
      }

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "add") {
        await interaction.deferReply({ flags: 64 });

        const serverId = interaction.options.getString("server_id");
        const serverName = interaction.options.getString("server_name");
        const serverIp = interaction.options.getString("ip");
        const serverPort = interaction.options.getInteger("port") || 7777;
        const ch = interaction.options.getChannel("channel");
        const emoji = interaction.options.getString("emoji") || "🎮";

        if (ch.type !== 2) {
          return interaction.editReply("❌ Канал должен быть голосовым каналом!");
        }

        const existing = await dbGet(
          "SELECT * FROM samp_trackers WHERE guild_id = ? AND server_id = ?",
          [interaction.guild.id, serverId]
        );

        if (existing) {
          return interaction.editReply(`❌ Сервер с ID \`${serverId}\` уже существует. Используйте другой ID.`);
        }

        // Optional settings from slash command
        const customOnlineText = interaction.options.getString("online_text") || null;
        const customOfflineText = interaction.options.getString("offline_text") || null;
        const pollIntervalSec = interaction.options.getInteger("poll_interval_sec");
        const renameCooldownSec = interaction.options.getInteger("rename_cooldown_sec");
        const nameFormat = interaction.options.getString("name_format") || null;

        await dbRun(
          `INSERT INTO samp_trackers (guild_id, server_id, server_name, server_ip, server_port, channel_id, emoji, enabled, custom_online_text, custom_offline_text, poll_interval_ms, rename_cooldown_ms, name_format)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
          [
            interaction.guild.id, serverId, serverName, serverIp, serverPort, ch.id, emoji,
            customOnlineText, customOfflineText,
            pollIntervalSec ? pollIntervalSec * 1000 : null,
            renameCooldownSec ? renameCooldownSec * 1000 : null,
            nameFormat,
          ]
        );

        const tracker = new SAMPStatusTracker(client, {
          serverIp,
          serverPort,
          channelId: ch.id,
          serverName,
          emoji,
          custom_online_text: customOnlineText,
          custom_offline_text: customOfflineText,
          poll_interval_ms: pollIntervalSec ? pollIntervalSec * 1000 : undefined,
          rename_cooldown_ms: renameCooldownSec ? renameCooldownSec * 1000 : undefined,
          name_format: nameFormat,
        });

        await tracker.start();

        if (!client.sampTrackers) client.sampTrackers = new Map();
        const trackerKey = `${interaction.guild.id}:${serverId}`;
        client.sampTrackers.set(trackerKey, tracker);

        return interaction.editReply(
          `✅ SAMP трекер добавлен!\n🎮 **${serverName}**\n📍 IP: \`${serverIp}:${serverPort}\`\n📺 Канал: ${ch}`
        );
      } else if (subcommand === "remove") {
        await interaction.deferReply({ flags: 64 });

        const serverId = interaction.options.getString("server_id");

        const trackerKey = `${interaction.guild.id}:${serverId}`;
        if (client.sampTrackers && client.sampTrackers.has(trackerKey)) {
          const t = client.sampTrackers.get(trackerKey);
          t.stop();
          client.sampTrackers.delete(trackerKey);
        }

        const result = await dbRun(
          "DELETE FROM samp_trackers WHERE guild_id = ? AND server_id = ?",
          [interaction.guild.id, serverId]
        );

        if (result.changes === 0) {
          return interaction.editReply(`❌ Сервер \`${serverId}\` не найден.`);
        }

        return interaction.editReply(`✅ Трекер для сервера \`${serverId}\` удалён.`);
      } else if (subcommand === "list") {
        const servers = await dbAll(
          "SELECT * FROM samp_trackers WHERE guild_id = ? ORDER BY server_id",
          [interaction.guild.id]
        );

        if (!servers || servers.length === 0) {
          return interaction.reply({
            content: "📋 Нет добавленных серверов. Используйте `/sampstatus add` для добавления.",
            flags: 64,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle("🎮 SAMP Серверы")
          .setColor(0x00ff00)
          .setTimestamp();

        for (const server of servers) {
          const status = server.enabled ? "🟢 Активен" : "🔴 Остановлен";
          const trackerKey = `${server.guild_id}:${server.server_id}`;
          const isRunning = client.sampTrackers && client.sampTrackers.has(trackerKey);

          embed.addFields({
            name: `${server.emoji} ${server.server_name}`,
            value: `**ID:** \`${server.server_id}\`\n**IP:** \`${server.server_ip}:${server.server_port}\`\n**Канал:** <#${server.channel_id}>\n**Статус:** ${status} ${isRunning ? "✓" : "✗"}`,
            inline: false,
          });
        }

        return interaction.reply({ embeds: [embed], flags: 64 });
      } else if (subcommand === "stop") {
        await interaction.deferReply({ flags: 64 });

        let stopped = 0;
        if (client.sampTrackers) {
          for (const [key, t] of client.sampTrackers.entries()) {
            if (key.startsWith(`${interaction.guild.id}:`)) {
              t.stop();
              client.sampTrackers.delete(key);
              stopped++;
            }
          }
        }

        await dbRun("UPDATE samp_trackers SET enabled = 0 WHERE guild_id = ?", [interaction.guild.id]);

        return interaction.editReply(`✅ Остановлено трекеров: ${stopped}`);
      } else if (subcommand === "start") {
        await interaction.deferReply({ flags: 64 });

        const servers = await dbAll("SELECT * FROM samp_trackers WHERE guild_id = ?", [interaction.guild.id]);

        if (!servers || servers.length === 0) {
          return interaction.editReply("❌ Нет серверов для запуска. Используйте `/sampstatus add`.");
        }

        let started = 0;
        if (!client.sampTrackers) client.sampTrackers = new Map();

        for (const server of servers) {
          try {
            const trackerKey = `${server.guild_id}:${server.server_id}`;

            if (client.sampTrackers.has(trackerKey)) {
              client.sampTrackers.get(trackerKey).stop();
            }

            const t = new SAMPStatusTracker(client, {
              serverIp: server.server_ip,
              serverPort: server.server_port,
              channelId: server.channel_id,
              serverName: server.server_name,
              emoji: server.emoji,
              custom_online_text: server.custom_online_text,
              custom_offline_text: server.custom_offline_text,
              poll_interval_ms: server.poll_interval_ms,
              rename_cooldown_ms: server.rename_cooldown_ms,
              name_format: server.name_format,
            });

            await t.start();
            client.sampTrackers.set(trackerKey, t);

            await dbRun(
              "UPDATE samp_trackers SET enabled = 1 WHERE guild_id = ? AND server_id = ?",
              [server.guild_id, server.server_id]
            );

            started++;
          } catch (error) {
            console.error(`[SAMP] Failed to start tracker ${server.server_id}:`, error);
          }
        }

        return interaction.editReply(`✅ Запущено трекеров: ${started}/${servers.length}`);
      }
    } else if (commandName === "synccommands") {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: "Эта команда доступна только владельцу бота.", flags: 64 });
      }

      await interaction.deferReply({ flags: 64 });

      try {
        await registerGuildCommands(client, interaction.guild.id, TOKEN);
        await interaction.editReply({ content: "Slash-команды перераегистрированы для этого сервера." });
      } catch (err) {
        console.error("synccommands error:", err);
        await interaction.editReply({ content: "Ошибка при регистрации slash-команд. Проверь логи." });
      }
    } else if (commandName === "weekly") {
      await interaction.deferReply();

      const rows = await getWeeklyTopUsers(db, interaction.guild.id, 10);
      const visible = [];

      for (const row of rows) {
        if (visible.length >= 10) break;
        let member;
        try {
          member = await interaction.guild.members.fetch(row.user_id);
        } catch {
          continue;
        }
        visible.push({ member, count: row.message_count });
      }

      if (!visible.length) {
        await interaction.editReply({
          content: "Пока нет активных пользователей на этой неделе.",
        });
        return;
      }

      const lines = visible.map((entry, index) => {
        const label = entry.member.user.tag;
        return `\`${index + 1}.\` **${label}** — ${entry.count} сообщений`;
      });

      const desc = lines.join("\n") + "\n\n*Обнуляется каждый понедельник.*";

      const embed = new EmbedBuilder()
        .setTitle("📅 Топ 10 на этой неделе")
        .setDescription(desc)
        .setColor(0x10b981)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (commandName === "streak") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const streak = await getStreak(db, interaction.guild.id, targetUser.id);

      const embed = new EmbedBuilder()
        .setTitle("🔥 Серия активности")
        .setDescription(`Статистика серии для ${targetUser.tag}`)
        .addFields(
          { name: "Текущая серия", value: `${streak.currentStreak} ${ruPlural(streak.currentStreak, "день", "дня", "дней")}`, inline: true },
          { name: "Лучшая серия", value: `${streak.longestStreak} ${ruPlural(streak.longestStreak, "день", "дня", "дней")}`, inline: true },
        )
        .setColor(0xf59e0b)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "reactions") {
      const type = interaction.options.getString("type") || "given";

      await interaction.deferReply();

      const rows =
        type === "given"
          ? await getTopReactionsGiven(db, interaction.guild.id, 10)
          : await getTopReactionsReceived(db, interaction.guild.id, 10);

      const visible = [];

      for (const row of rows) {
        if (visible.length >= 10) break;
        let member;
        try {
          member = await interaction.guild.members.fetch(row.user_id);
        } catch {
          continue;
        }
        const count = type === "given" ? row.reactions_given : row.reactions_received;
        visible.push({ member, count });
      }

      if (!visible.length) {
        await interaction.editReply({
          content: "Пока нет данных по реакциям.",
        });
        return;
      }

      const lines = visible.map((entry, index) => {
        const label = entry.member.user.tag;
        return `\`${index + 1}.\` **${label}** — ${entry.count} реакций`;
      });

      const title = type === "given" ? "👍 Топ по реакциям (отправлено)" : "❤️ Топ по реакциям (получено)";
      const desc = lines.join("\n");

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(0xec4899)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } else if (commandName === "export") {
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: "Эта команда доступна только владельцу бота.", flags: 64 });
      }

      await interaction.deferReply({ flags: 64 });

      try {
        const csv = await exportStatsToCSV(db, interaction.guild.id);
        const buffer = Buffer.from(csv, "utf-8");

        await interaction.editReply({
          content: "Экспорт готов!",
          files: [{ attachment: buffer, name: `stats_${interaction.guild.id}_${Date.now()}.csv` }],
        });
      } catch (err) {
        console.error("export error:", err);
        await interaction.editReply({ content: "Ошибка при экспорте данных." });
      }
    } else if (commandName === "mystrikes") {
      const userId = interaction.user.id;

      const strikes = await getViolationStrikes(db, guildId, userId);
      const violationData = await getUserViolationData(db, guildId, userId);

      if (strikes === 0) {
        const wanted = await getWantedLevel(db, guildId, userId);
        return interaction.reply({
          content: `✅ У вас нет активных страйков!\n\n**Уровень розыска:**\n${formatWantedDisplay(wanted)}`,
          flags: 64,
        });
      }

      const resetDate = new Date(violationData.will_reset_at * 1000);
      const daysUntilReset = Math.ceil((resetDate - Date.now()) / (1000 * 60 * 60 * 24));

      const wanted = await getWantedLevel(db, guildId, userId);

      const embed = new EmbedBuilder()
        .setTitle("⚠️ Ваши Страйки")
        .setDescription(`У вас **${strikes}** ${ruPlural(strikes, "страйк", "страйка", "страйков")}`)
        .addFields(
          { name: "Сброс через", value: `${daysUntilReset} ${ruPlural(daysUntilReset, "день", "дня", "дней")}`, inline: true },
          { name: "Дата сброса", value: resetDate.toLocaleDateString("ru-RU"), inline: true },
          { name: "🔫 Уровень розыска", value: formatWantedDisplay(wanted), inline: false },
          { name: "ℹ️ Информация", value: "Страйки автоматически сбрасываются через настроенный период времени." },
        )
        .setColor(0xfbbf24)
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: 64 });

      // --- D-track: Trivia commands ---
    } else if (commandName === "trivia" || commandName === "trivia-top" || commandName === "trivia-stats") {
      await handleTriviaCommand({ interaction, db });

      // --- D-track: Level commands ---
    } else if (commandName === "level" || commandName === "levels-top") {
      await handleLevelCommand({ interaction, db });

      // --- D-track: Weekly awards command ---
    } else if (commandName === "awards") {
      await handleAwardsCommand(interaction, db);

      // --- D-track: Radio vote commands ---
    } else if (commandName === "radio") {
      await handleRadioVote(interaction, db);
    } else if (commandName === "radio-top") {
      await handleRadioTop(interaction, db);
    } else if (commandName === "radio-info") {
      await handleRadioInfo(interaction, db);
    } else if (commandName === "radio-fans") {
      await handleRadioFans(interaction, db);
    } else if (commandName === "faq") {
      await handleGameFaqCommand(interaction);

      // --- Badges / achievements command ---
    } else if (commandName === "badges") {
      const targetUser = interaction.options.getUser("user") || interaction.user;

      const badges = await getUserBadges(db, interaction.guild.id, targetUser.id);
      const allDefs = await getBadgeDefinitions(db, interaction.guild.id, { includeDisabled: false });

      if (!allDefs || allDefs.length === 0) {
        await interaction.reply({ content: "Значки ещё не настроены на этом сервере.", ephemeral: true });
        return;
      }

      const earnedSet = new Set(badges.map((b) => b.badge_id));

      // Group by type
      const groups = {
        messages: { label: "💬 Сообщения", items: [] },
        streak: { label: "🔥 Стрики", items: [] },
        reactions_given: { label: "👍 Реакции (отправлено)", items: [] },
        reactions_received: { label: "❤️ Реакции (получено)", items: [] },
        event: { label: "🎉 Особые", items: [] },
      };

      for (const def of allDefs) {
        const earned = earnedSet.has(def.id);
        const icon = earned ? def.emoji : "⬜";
        const line = `${icon} **${def.name}** — ${def.description}${earned ? " ✅" : ""}`;
        if (groups[def.type]) {
          groups[def.type].items.push(line);
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`🏅 Значки — ${targetUser.tag}`)
        .setDescription(`Получено: **${badges.length}** из **${allDefs.length}**`)
        .setColor(0xf59e0b)
        .setTimestamp();

      for (const [, group] of Object.entries(groups)) {
        if (group.items.length > 0) {
          embed.addFields({
            name: group.label,
            value: group.items.join("\n"),
            inline: false,
          });
        }
      }

      await interaction.reply({ embeds: [embed] });
    } else if (commandName === "commandstats") {
      // ── Admin command: command usage analytics ──
      const isOwner = interaction.user.id === OWNER_ID;
      const isGuildOwner = interaction.guild && interaction.user.id === interaction.guild.ownerId;
      if (!isOwner && !isGuildOwner) {
        return interaction.reply({ content: "❌ Только владелец бота или сервера может просматривать статистику.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const days = interaction.options.getInteger("days") || 7;
      // Guild owners see only their guild; bot owner can see all guilds
      const statsGuildId = isOwner ? (interaction.options.getBoolean("all_guilds") ? null : interaction.guild?.id) : interaction.guild?.id;

      const stats = await getCommandStats(db, { days, guildId: statsGuildId });

      const usageLines = stats.topByUsage.slice(0, 15).map((r, i) => {
        const bar = r.total > 0 ? "▓".repeat(Math.min(10, Math.round((r.total / (stats.topByUsage[0]?.total || 1)) * 10))) : "";
        const avgMs = r.avg_ms != null ? ` ~${r.avg_ms}ms` : "";
        return `\`${String(i + 1).padStart(2)}.\` **${r.command_name}** — ${r.total} (${r.failures} err${avgMs}) ${bar}`;
      }).join("\n") || "Нет данных";

      const failLines = stats.topByFailRate.slice(0, 8).map((r) =>
        `• **${r.command_name}** — ${r.fail_pct}% ошибок (${r.failures}/${r.total})`
      ).join("\n") || "Нет ошибок";

      const guildLabel = statsGuildId ? `сервер \`${statsGuildId}\`` : "все серверы";
      const embed = new EmbedBuilder()
        .setTitle(`📊 Статистика команд — последние ${days} дн.`)
        .setDescription(`Охват: ${guildLabel} · Сегодня: **${stats.todayTotal}** · За неделю: **${stats.weekTotal}** · За окно: **${stats.totalInWindow}**`)
        .addFields(
          { name: `🏆 Топ по использованию (из ${stats.totalInWindow})`, value: usageLines, inline: false },
          { name: "⚠️ Топ по проценту ошибок", value: failLines, inline: false },
        )
        .setColor(0x6366f1)
        .setFooter({ text: `Данные за последние ${days} дней` })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  });
}

module.exports = { registerCommandHandlers };
