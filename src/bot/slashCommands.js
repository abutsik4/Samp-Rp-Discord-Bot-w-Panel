const {
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder
} = require("discord.js");
const { enhancedBackfill } = require("../features/enhanced-backfill");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildCommandsJson() {
  return [
    new SlashCommandBuilder().setName("mystats").setDescription("Show your message stats in this server."),
    new SlashCommandBuilder()
      .setName("userstats")
      .setDescription("Show message stats for another user.")
      .addUserOption((option) =>
        option.setName("user").setDescription("User to view").setRequired(true)
      ),
    new SlashCommandBuilder().setName("top5").setDescription("Show top 5 users by message count."),
    new SlashCommandBuilder().setName("top10").setDescription("Show top 10 users by message count."),
    new SlashCommandBuilder().setName("backfill").setDescription("Backfill message history (owner only)."),
    new SlashCommandBuilder().setName("demoembed").setDescription("Send an example embed and edit it later."),
    new SlashCommandBuilder().setName("synccommands").setDescription("Re-register slash commands (owner only).")
  ].map((c) => c.toJSON());
}

async function registerGuildCommands({ client, guildId, token, commands }) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
}

async function backfillGuild({ guild, stats, db, client }) {
  console.log(`Starting enhanced backfill for guild: ${guild.name} (${guild.id})`);
  
  // Use enhanced backfill with progress tracking
  const result = await enhancedBackfill(db, client, guild.id);
  
  return result;
}

function attachSlashAndEvents({ client, stats, ownerId }) {
  const TOKEN = process.env.DISCORD_TOKEN;
  const commands = buildCommandsJson();

  client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}.`);

    for (const guild of client.guilds.cache.values()) {
      try {
        await registerGuildCommands({ client, guildId: guild.id, token: TOKEN, commands });
        console.log(`Slash commands registered for guild ${guild.id}.`);
      } catch (e) {
        console.error(`Error registering commands for guild ${guild.id}:`, e);
      }
    }
  });

  client.on("guildCreate", async (guild) => {
    try {
      await registerGuildCommands({ client, guildId: guild.id, token: TOKEN, commands });
      console.log(`Joined new guild: ${guild.name} (${guild.id})`);
    } catch (e) {
      console.error("Error on guildCreate command registration:", e);
    }
  });

  client.on("messageCreate", (message) => {
    if (!message.guild) return;
    if (message.author?.bot) return;
    stats.incrementMessageCount(message.guild.id, message.author.id);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Check if command is disabled
    const guildId = interaction.guild?.id;
    if (guildId && stats.isCommandDisabled) {
      try {
        const isDisabled = await stats.isCommandDisabled(guildId, interaction.commandName);
        if (isDisabled) {
          await interaction.reply({ 
            content: "❌ This command is currently disabled by administrators.", 
            ephemeral: true 
          });
          return;
        }
      } catch (err) {
        console.error("Error checking command disabled status:", err);
      }
    }

    // Keep your existing command handlers here.
    // The below is a minimal example for /demoembed only:

    if (interaction.commandName === "demoembed") {
      const initialEmbed = new EmbedBuilder()
        .setTitle("Пример Embed от Samp-Rp")
        .setDescription("Это первоначальное сообщение. Через 10 секунд оно изменится.")
        .setColor(0x2ecc71)
        .setTimestamp();

      const editedEmbed = new EmbedBuilder()
        .setTitle("Обновлённый Embed Samp-Rp")
        .setDescription("Сообщение было отредактировано через 10 секунд.")
        .setColor(0xe74c3c)
        .setTimestamp();

      await interaction.reply({ embeds: [initialEmbed], fetchReply: true });

      setTimeout(async () => {
        try {
          await interaction.editReply({ embeds: [editedEmbed] });
        } catch (err) {
          console.error("Error editing embed:", err);
        }
      }, 10_000);
      return;
    }

    // For your other commands: paste your existing logic, using:
    // stats.getUserMessageCount(...)
    // stats.getTopUsers(...)
    // backfillGuild({ guild: interaction.guild, stats })
    // ownerId check for owner-only commands
  });
}

module.exports = { attachSlashAndEvents };
