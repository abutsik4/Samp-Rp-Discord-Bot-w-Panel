const { EmbedBuilder } = require("discord.js");

// Direct imports – no pass-through from index.js
const { handleHolidayCommand } = require("../../features/holidays");
const { handleSampLifeCommand } = require("../../features/samp-life");
const { getUserAnalytics, getFunFact, exportStatsToCSV } = require("../../features/analytics");
const { getStreak } = require("../../features/streaks");
const { getUserWeeklyStats, getWeeklyTopUsers } = require("../../features/weekly-stats");
const { getUserReactionStats, getTopReactionsGiven, getTopReactionsReceived } = require("../../features/reactions");
const { getViolationStrikes, getUserViolationData } = require("../../features/rate-limiter");
const { getWantedLevel, formatWantedDisplay } = require("../../features/wanted-stars");
const { handleTriviaCommand } = require("../../features/trivia");
const { handleLevelCommand } = require("../../features/levels");
const { handleAwardsCommand } = require("../../features/weekly-awards");
const { handleRadioVote, handleRadioTop } = require("../../features/radio-vote");
const { SAMPStatusTracker } = require("../../features/samp-status");

/**
 * Register the interactionCreate handler for slash command dispatch.
 * All command logic is dispatched from a single handler.
 */
function registerCommandHandlers(ctx) {
  const {
    client, db, dbRun, dbGet, dbAll,
    OWNER_ID, TOKEN,
    // Bot helpers (runtime-constructed, must come from ctx)
    isCommandDisabled, getUserMessageCount,
    ruPlural, formatTimeOnServer, performUndo,
    registerGuildCommands, backfillGuild,
    holidaysScheduler,
  } = ctx;

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

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
      [
        "reg", "balance", "work", "truck", "rob",
        "dealership", "buy", "race", "duel",
        "sellcar", "buycar", "weapon",
      ].includes(commandName)
    ) {
      await handleSampLifeCommand({ interaction, db });
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
        rows = await dbAll(
          `SELECT user_id, message_count
           FROM user_stats
           WHERE guild_id = ?
           ORDER BY message_count DESC
           LIMIT ?`,
          [interaction.guild.id, fetchLimit]
        );
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

      const { syncMissingMessages, initializeWatermark, getWatermark } = require("../features/incremental-sync");

      const watermark = await getWatermark(db, interaction.guild.id);

      if (!watermark) {
        await interaction.editReply({
          content: "⏳ Маркер не найден. Инициализация из текущего состояния...",
        });

        const initResult = await initializeWatermark(client, db, interaction.guild.id);

        if (!initResult.success) {
          return interaction.editReply({
            content: `❌ Не удалось инициализировать маркер: ${initResult.error}\nСначала выполните полный бэкфилл.`,
          });
        }

        return interaction.editReply({
            content: `✅ Маркер инициализирован на сообщении \`${initResult.messageId}\`\n\nТеперь вы можете использовать эту команду для синхронизации пропущенных сообщений.`,
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

      await interaction.reply({
        content: "Запускаю сбор истории сообщений. Это может занять продолжительное время. Прогресс смотри в логах бота.",
        flags: 64,
      });

      await backfillGuild(interaction.guild);

      await interaction.followUp({ content: "История сообщений собрана.", flags: 64 });
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

        await dbRun(
          `INSERT INTO samp_trackers (guild_id, server_id, server_name, server_ip, server_port, channel_id, emoji, enabled) 
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          [interaction.guild.id, serverId, serverName, serverIp, serverPort, ch.id, emoji]
        );

        const tracker = new SAMPStatusTracker(client, {
          serverIp,
          serverPort,
          channelId: ch.id,
          serverName,
          emoji,
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
    } else if (commandName === "demoembed") {
      const initialEmbed = new EmbedBuilder()
        .setTitle("Пример Embed от Samp-Rp")
        .setDescription("Это первоначальное сообщение. Через 10000 миллисекунд оно изменится.")
        .setColor(0x2ecc71)
        .setTimestamp();

      const editedEmbed = new EmbedBuilder()
        .setTitle("Обновлённый Embed Samp-Rp")
        .setDescription("Сообщение было отредактировано через 10000 миллисекунд.")
        .setColor(0xe74c3c)
        .setTimestamp();

      await interaction.reply({ embeds: [initialEmbed], fetchReply: true });

      setTimeout(async () => {
        try {
          await interaction.editReply({ embeds: [editedEmbed] });
        } catch (err) {
          console.error("Error editing embed:", err);
        }
      }, 10000);
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
    } else if (commandName === "countdown") {
      const now = new Date();
      const nextYear =
        now.getMonth() === 11 && now.getDate() === 31 && now.getHours() >= 21
          ? now.getFullYear() + 1
          : now.getMonth() === 0 && now.getDate() === 1
            ? now.getFullYear()
            : now.getFullYear() + 1;
      const newYear = new Date(`${nextYear}-01-01T00:00:00+03:00`);

      const diff = newYear.getTime() - now.getTime();

      if (diff <= 0) {
        return interaction.reply({ content: "С Новым Годом! 🎉", flags: 64 });
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      const embed = new EmbedBuilder()
        .setTitle(`🎆 Обратный отсчёт до Нового Года ${nextYear}!`)
        .setDescription(
          `**${days}** ${ruPlural(days, "день", "дня", "дней")}, **${hours}** ${ruPlural(hours, "час", "часа", "часов")}, **${minutes}** ${ruPlural(minutes, "минута", "минуты", "минут")}, **${seconds}** ${ruPlural(seconds, "секунда", "секунды", "секунд")}`
        )
        .setColor(0xfbbf24)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
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
      await handleTriviaCommand(interaction, db);

      // --- D-track: Level commands ---
    } else if (commandName === "level" || commandName === "levels-top") {
      await handleLevelCommand(interaction, db);

      // --- D-track: Weekly awards command ---
    } else if (commandName === "awards") {
      await handleAwardsCommand(interaction, db);

      // --- D-track: Radio vote commands ---
    } else if (commandName === "radio") {
      await handleRadioVote(interaction, db);
    } else if (commandName === "radio-top") {
      await handleRadioTop(interaction, db);
    }
  });
}

module.exports = { registerCommandHandlers };
