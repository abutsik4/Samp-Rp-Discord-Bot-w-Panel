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
    .addChannelOption((o) => o.setName("channel").setDescription("Filter by specific channel (optional)").setRequired(false))
    .addStringOption((o) => o.setName("date").setDescription("Filter by date (YYYY-MM-DD, optional)").setRequired(false))
    .addStringOption((o) => o.setName("period").setDescription("Time period (optional)").setRequired(false)
      .addChoices(
        { name: "Today", value: "today" },
        { name: "This Week", value: "week" },
        { name: "This Month", value: "month" },
        { name: "All Time", value: "all" }
      ));
}

// -- Core command builders -----------------------------------------------------

function buildCommandsJson() {
  return [
    new SlashCommandBuilder().setName("mystats").setDescription("Show your message stats in this server."),
    new SlashCommandBuilder()
      .setName("userstats")
      .setDescription("Show message stats for another user.")
      .addUserOption((o) => o.setName("user").setDescription("User to view").setRequired(true)),

    buildTopCommand("top5", "Show top 5 users by message count in this server."),
    buildTopCommand("top10", "Show top 10 users by message count in this server."),

    new SlashCommandBuilder()
      .setName("backfill")
      .setDescription("Backfill message history for this server (owner only, may take a long time)."),
    new SlashCommandBuilder()
      .setName("sync-missing")
      .setDescription("Sync messages missed during downtime (owner only, fast incremental sync)."),
    new SlashCommandBuilder()
      .setName("synccommands")
      .setDescription("Re-register slash commands for this server (owner only)."),

    new SlashCommandBuilder().setName("weekly").setDescription("Show weekly leaderboard (resets every Monday)."),
    new SlashCommandBuilder()
      .setName("streak")
      .setDescription("View message streak for you or another user.")
      .addUserOption((o) => o.setName("user").setDescription("User to check (optional)").setRequired(false)),

    new SlashCommandBuilder()
      .setName("reactions")
      .setDescription("View reaction leaderboard.")
      .addStringOption((o) =>
        o.setName("type").setDescription("Type of reactions").setRequired(false)
          .addChoices({ name: "Given", value: "given" }, { name: "Received", value: "received" })
      ),

    new SlashCommandBuilder().setName("export").setDescription("Export server stats to CSV (owner only)."),
    new SlashCommandBuilder().setName("countdown").setDescription("Обратный отсчёт до Нового Года!"),
    new SlashCommandBuilder().setName("mystrikes").setDescription("Просмотреть ваши текущие нарушения и страйки"),

    // Channel whitelist
    new SlashCommandBuilder()
      .setName("whitelist")
      .setDescription("Manage counting channel whitelist (owner only)")
      .addSubcommand((s) => s.setName("add").setDescription("Add channel to counting whitelist")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to add").setRequired(true)))
      .addSubcommand((s) => s.setName("remove").setDescription("Remove channel from counting whitelist")
        .addChannelOption((o) => o.setName("channel").setDescription("Channel to remove").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("List whitelisted channels"))
      .addSubcommand((s) => s.setName("clear").setDescription("Clear whitelist (count all channels)")),

    // AutoMod
    new SlashCommandBuilder()
      .setName("automod")
      .setDescription("Manage banned words (owner only)")
      .addSubcommand((s) => s.setName("add").setDescription("Ban a word")
        .addStringOption((o) => o.setName("word").setDescription("Word to ban").setRequired(true))
        .addBooleanOption((o) => o.setName("case_sensitive").setDescription("Case sensitive? (default: no)")))
      .addSubcommand((s) => s.setName("remove").setDescription("Unban a word")
        .addStringOption((o) => o.setName("word").setDescription("Word to unban").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("List banned words"))
      .addSubcommand((s) => s.setName("clear").setDescription("Clear all banned words")),

    // Undo / History
    new SlashCommandBuilder()
      .setName("undo")
      .setDescription("Undo last bulk operation (owner only)")
      .addIntegerOption((o) => o.setName("operation_id").setDescription("Specific operation ID to undo")),
    new SlashCommandBuilder()
      .setName("history")
      .setDescription("View recent bulk operations (owner only)")
      .addIntegerOption((o) => o.setName("limit").setDescription("Number of operations to show (default: 10)")),

    // SAMP Server Status
    new SlashCommandBuilder()
      .setName("sampstatus")
      .setDescription("Manage SA-MP server status channels (owner only)")
      .addSubcommand((s) => s.setName("add").setDescription("Add a SA-MP server to track")
        .addStringOption((o) => o.setName("server_id").setDescription("Server identifier (e.g., server1)").setRequired(true))
        .addStringOption((o) => o.setName("server_name").setDescription("Display name (e.g., Samp-Rp #1)").setRequired(true))
        .addStringOption((o) => o.setName("ip").setDescription("Server IP address").setRequired(true))
        .addChannelOption((o) => o.setName("channel").setDescription("Voice channel for status").setRequired(true))
        .addIntegerOption((o) => o.setName("port").setDescription("Server port (default: 7777)"))
        .addStringOption((o) => o.setName("emoji").setDescription("Emoji (default: \xF0\x9F\x8E\xAE)")))
      .addSubcommand((s) => s.setName("remove").setDescription("Remove a tracked server")
        .addStringOption((o) => o.setName("server_id").setDescription("Server identifier").setRequired(true)))
      .addSubcommand((s) => s.setName("list").setDescription("List all tracked servers"))
      .addSubcommand((s) => s.setName("stop").setDescription("Stop all trackers"))
      .addSubcommand((s) => s.setName("start").setDescription("Start all trackers")),

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
