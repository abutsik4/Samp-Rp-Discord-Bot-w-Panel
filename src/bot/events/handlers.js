const { EmbedBuilder } = require("discord.js");

// Direct imports – no pass-through from index.js
const { incrementMessageCountRobust, decrementMessageCountRobust, bulkDecrementRobust } = require("../../features/robust-message-counting");
const { runSecurityPipeline } = require("../../features/security-pipeline");
const { updateStreak, getStreak } = require("../../features/streaks");
const { incrementWeeklyCount, decrementWeeklyCount } = require("../../features/weekly-stats");
const { checkMilestone } = require("../../features/milestones");
const { awardMessageXP } = require("../../features/levels");
const { checkAndAwardBadges } = require("../../features/badges");
const { getUserReactionStats, incrementReactionsGiven, incrementReactionsReceived } = require("../../features/reactions");
const { getEngagementSettings, tryEngageWithMessage } = require("../../features/ai-engagement");

/**
 * Register all Discord event handlers on the client.
 * Expects a context object with all required dependencies.
 */
function registerEventHandlers(ctx) {
  const {
    client, db, TOKEN,
    // Bot helpers (runtime-constructed, must come from ctx)
    registerGuildCommands, cacheUserUsername,
    getUserMessageCount,
    lookupIndexedAuthor, lookupIndexedAuthorsBulk,
    dbAll,
  } = ctx;

  // -------------------------
  // GUILD JOIN
  // -------------------------
  client.on("guildCreate", async (guild) => {
    console.log(`Joined new guild: ${guild.name} (${guild.id})`);
    await registerGuildCommands(client, guild.id, TOKEN);
  });

  // -------------------------
  // MESSAGE CREATE
  // -------------------------
  client.on("messageCreate", async (message) => {
    try {
      if (!message.guild) return;
      if (!message.author || message.author.bot) return;

      const guildId = message.guild.id;
      const userId = message.author.id;
      const channelId = message.channel.id;

      // Ensure we have member data for role-based logic
      let member = message.member;
      if (!member) {
        try { member = await message.guild.members.fetch(userId); } catch {}
      }
      const userRoles = member?.roles?.cache?.map(r => r.id) || [];

      // Security pipeline (spam prevention, automod)
      const securityResult = await runSecurityPipeline(db, message, userRoles);
      if (securityResult.stop) return;

      // Channel whitelist check
      const whitelistedChannels = await dbAll(
        `SELECT channel_id FROM channel_whitelist WHERE guild_id = ?`,
        [guildId]
      );

      if (whitelistedChannels && whitelistedChannels.length > 0) {
        const isWhitelisted = whitelistedChannels.some(row => row.channel_id === channelId);
        if (!isWhitelisted) {
          console.log(`[Whitelist] Skipping count for channel ${channelId} - not whitelisted`);
          return;
        }
      }

      // Cache user's Discord username for panel display (async, non-blocking)
      cacheUserUsername(guildId, userId, message.author.username, message.author.avatarURL()).catch(() => {});

      // Core stats tracking - robust version with transaction + retry
      await incrementMessageCountRobust(db, guildId, userId, message.id, message.channelId, message.createdAt.toISOString());

      // Streak + weekly
      await updateStreak(db, guildId, userId);
      await incrementWeeklyCount(db, guildId, userId);

      // XP/Levels
      const levelUp = await awardMessageXP(db, guildId, userId);
      if (levelUp) {
        try {
          const embed = new EmbedBuilder()
            .setTitle("⬆️ Новый уровень!")
            .setDescription(`<@${userId}> достиг уровня **${levelUp.newLevel}** — **${levelUp.rankName}**!`)
            .setColor(0x2ecc71)
            .setTimestamp();
          await message.channel.send({ embeds: [embed] });
        } catch {}
      }

      // Badge checks
      try {
        const streak = await getStreak(db, guildId, userId);
        const reactions = await getUserReactionStats(db, guildId, userId);
        const currentCountForBadges = await getUserMessageCount(guildId, userId);
        const newBadges = await checkAndAwardBadges(db, guildId, userId, {
          messageCount: currentCountForBadges,
          currentStreak: streak?.current_streak || 0,
          reactionsGiven: reactions?.given || 0,
          reactionsReceived: reactions?.received || 0,
        });
        if (newBadges.length > 0) {
          const badgeNames = newBadges.map((b) => `${b.emoji} **${b.name}**`).join(", ");
          try {
            await message.channel.send(`🏅 <@${userId}> получил ачивку: ${badgeNames}!`);
          } catch {}
        }
      } catch {}

      // Milestone celebrations
      const currentCount = await getUserMessageCount(guildId, userId);
      const milestone = await checkMilestone(db, guildId, userId, currentCount);

      if (milestone) {
        const embed = new EmbedBuilder()
          .setTitle("🎉 Достижение!")
          .setDescription(`<@${userId}> достиг **${milestone.toLocaleString()}** сообщений!`)
          .setColor(0xffd700)
          .setTimestamp();
        try {
          await message.channel.send({ embeds: [embed] });
        } catch {}
      }

      // AI engagement
      const aiSettings = await getEngagementSettings(db, guildId);
      if (aiSettings.enabled) {
        await tryEngageWithMessage(db, message, aiSettings);
      }
    } catch (e) {
      console.error("messageCreate handler error:", e);
    }
  });

  // -------------------------
  // MESSAGE DELETE
  // -------------------------
  client.on("messageDelete", async (message) => {
    try {
      if (!message) return;
      if (!message.guild) return;

      const guildId = message.guild.id;
      const msgId = message.id;

      if (message.author && !message.author.bot) {
        await decrementMessageCountRobust(db, guildId, message.author.id, msgId);
        await decrementWeeklyCount(db, guildId, message.author.id);
        return;
      }

      const userId = await lookupIndexedAuthor(guildId, msgId);
      if (userId) {
        await decrementMessageCountRobust(db, guildId, userId, msgId);
        await decrementWeeklyCount(db, guildId, userId);
      }
    } catch (err) {
      console.error("messageDelete handler error:", err);
    }
  });

  // -------------------------
  // REACTION ADD
  // -------------------------
  client.on("messageReactionAdd", async (reaction, user) => {
    try {
      if (user.bot) return;

      if (reaction.partial) {
        try { await reaction.fetch(); } catch { return; }
      }

      if (!reaction.message.guild) return;

      const guildId = reaction.message.guild.id;
      const reactorId = user.id;

      await incrementReactionsGiven(db, guildId, reactorId);

      if (reaction.message.author && !reaction.message.author.bot) {
        await incrementReactionsReceived(db, guildId, reaction.message.author.id);
      }
    } catch (err) {
      console.error("messageReactionAdd handler error:", err);
    }
  });

  // -------------------------
  // BULK DELETE
  // -------------------------
  client.on("messageDeleteBulk", async (messages) => {
    try {
      if (!messages || messages.size === 0) return;

      const first = messages.first();
      const guildId = first?.guild?.id;
      if (!guildId) return;

      const userCounts = new Map();
      const allMessageIds = [];

      for (const msg of messages.values()) {
        if (!msg?.id) continue;
        allMessageIds.push(msg.id);

        if (msg.author && !msg.author.bot) {
          userCounts.set(msg.author.id, (userCounts.get(msg.author.id) || 0) + 1);
        }
      }

      const unknownIds = [];
      for (const msg of messages.values()) {
        if (!msg?.id) continue;
        if (!msg.author || msg.author.bot) {
          unknownIds.push(msg.id);
        }
      }

      if (unknownIds.length > 0) {
        const indexed = await lookupIndexedAuthorsBulk(guildId, unknownIds);
        for (const [userId, count] of indexed.entries()) {
          userCounts.set(userId, (userCounts.get(userId) || 0) + count);
        }
      }

      if (userCounts.size > 0 || allMessageIds.length > 0) {
        await bulkDecrementRobust(db, guildId, userCounts, allMessageIds);
      }
    } catch (err) {
      console.error("messageDeleteBulk handler error:", err);
    }
  });
}

module.exports = { registerEventHandlers };
