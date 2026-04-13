const { EmbedBuilder } = require("discord.js");

// Direct imports – no pass-through from index.js
const { incrementMessageCountRobust, decrementMessageCountRobust, bulkDecrementRobust, logEvent } = require("../../features/robust-message-counting");
const { runSecurityPipeline } = require("../../features/security-pipeline");
const { updateStreak, getStreak } = require("../../features/streaks");
const { incrementWeeklyCount, decrementWeeklyCount } = require("../../features/weekly-stats");
const { checkMilestone } = require("../../features/milestones");
const { awardMessageXP } = require("../../features/levels");
const { checkAndAwardBadges, awardBadge, upsertBadgeDefinition } = require("../../features/badges");
const { getUserReactionStats, incrementReactionsGiven, incrementReactionsReceived } = require("../../features/reactions");
const { getEngagementSettings, tryEngageWithMessage } = require("../../features/ai-engagement");
const { updateWatermark } = require("../../features/incremental-sync");
const { applyRoleGrants } = require("../../features/perks");
const { tryAnswerGameFaqInChat } = require("../../features/game-faq");
const { createWhitelistSet, getCountableChannelIds, isChannelWhitelistedForCounting } = require("../../features/message-counting-rules");

const SAMP_GAME_COMMAND_CATEGORY = "samp_game";
const SAMP_GAME_COMMAND_BYPASS_USER_ID = "143160841225633792";

/**
 * Register all Discord event handlers on the client.
 * Expects a context object with all required dependencies.
 */
function registerEventHandlers(ctx) {
  const {
    client, db, TOKEN,
    // Bot helpers (runtime-constructed, must come from ctx)
    registerGuildCommands, cacheUserUsername,
    getCommandCategoryChannel,
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

      try {
        const restriction = await getCommandCategoryChannel?.(guildId, SAMP_GAME_COMMAND_CATEGORY);
        const isCommandChannelBypassUser = userId === SAMP_GAME_COMMAND_BYPASS_USER_ID;
        if (restriction?.channel_id && restriction.channel_id === channelId && !isCommandChannelBypassUser) {
          if (message.deletable) {
            await message.delete().catch(() => null);
          }
          return;
        }
      } catch (err) {
        console.error("command-only channel enforcement error:", err);
      }

      // Security pipeline (spam prevention, automod)
      const securityResult = await runSecurityPipeline(db, message, userRoles);
      if (securityResult.stop) {
        await logEvent(db, "skip", guildId, userId, message.id, {
          reason: "security_pipeline",
          channelId,
          source: "messageCreate",
        });
        return;
      }

      // April Fools 2026 badge — channel 541024085283700741, April 1st only
      if (channelId === "541024085283700741") {
        const now = new Date();
        if (now.getMonth() === 3 && now.getDate() === 1) {
          try {
            // Ensure badge definition exists for this guild
            await upsertBadgeDefinition(db, guildId, {
              id: "april_fools_2026", type: "event", threshold: 0,
              name: "Клоун Grove Street", emoji: "🤡",
              description: "Попался 1 апреля 2026",
            });
            const awarded = await awardBadge(db, guildId, userId, "april_fools_2026");
            if (awarded) {
              try {
                await message.channel.send(`🤡 <@${userId}> получил секретную ачивку: 🤡 **Клоун Grove Street**!`);
              } catch {}
            }
          } catch {}
        }
      }

      // Channel whitelist check
      const whitelistedChannels = await dbAll(
        `SELECT channel_id FROM channel_whitelist WHERE guild_id = ?`,
        [guildId]
      );

      const whitelistSet = createWhitelistSet(whitelistedChannels);

      if (whitelistSet.size > 0) {
        const isWhitelisted = isChannelWhitelistedForCounting(message.channel, whitelistSet);
        if (!isWhitelisted) {
          console.log(`[Whitelist] Skipping count for channel ${channelId} - not whitelisted`);
          await logEvent(db, "skip", guildId, userId, message.id, {
            reason: "channel_not_whitelisted",
            channelId,
            matchedChannelIds: getCountableChannelIds(message.channel),
            source: "messageCreate",
          });
          return;
        }
      }

      // Cache user's Discord username for panel display (async, non-blocking)
      cacheUserUsername(guildId, userId, message.author.username, message.author.avatarURL()).catch(() => {});

      // Core stats tracking - robust version with transaction + retry
      const counted = await incrementMessageCountRobust(db, guildId, userId, message.id, message.channelId, message.createdAt.toISOString());
      if (!counted) return;

      // Advance watermark so startup catch-up sync knows where to resume
      updateWatermark(db, guildId, message.id, 0).catch(() => {});

      // Streak + weekly
      await updateStreak(db, guildId, userId);
      await incrementWeeklyCount(db, guildId, userId, message.createdAt);

      // XP/Levels
      const levelUp = await awardMessageXP(db, guildId, userId, userRoles);
      // Announcements are opt-in to avoid accidental spam.
      const levelsAnnounceEnabled = process.env.LEVELS_ANNOUNCE === "1";
      if (levelsAnnounceEnabled && levelUp?.leveledUp) {
        try {
          let targetChannel = message.channel;
          const configuredChannelId = process.env.LEVELS_ANNOUNCE_CHANNEL_ID;
          if (configuredChannelId) {
            try {
              const ch = await message.guild.channels.fetch(configuredChannelId);
              if (ch && ch.isTextBased && ch.isTextBased()) {
                targetChannel = ch;
              }
            } catch {}
          }

          const rankName = levelUp.rank?.name || "Новый ранг";
          const embed = new EmbedBuilder()
            .setTitle("⬆️ Новый уровень!")
            .setDescription(`<@${userId}> достиг уровня **${levelUp.newLevel}** — **${rankName}**!`)
            .setColor(0x2ecc71)
            .setTimestamp();
          await targetChannel.send({ embeds: [embed] });
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

        // Perks: grant Discord roles for new achievements
        if (newBadges.length > 0 && member) {
          await applyRoleGrants({
            db,
            guild: message.guild,
            member,
            triggers: newBadges.map((b) => ({ type: "badge", value: b.id })),
            reason: "Achievement perk grant",
          });
        }

        if (newBadges.length > 0) {
          const badgeNames = newBadges.map((b) => `${b.emoji} **${b.name}**`).join(", ");
          try {
            await message.channel.send(`🏅 <@${userId}> получил ачивку: ${badgeNames}!`);
          } catch {}
        }
      } catch {}

      // Perks: grant Discord roles for reaching a level (only on level-up to reduce calls)
      if (levelUp?.leveledUp && member) {
        try {
          await applyRoleGrants({
            db,
            guild: message.guild,
            member,
            triggers: [{ type: "level", value: String(levelUp.newLevel) }],
            reason: "Level perk grant",
          });
        } catch {}
      }

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

      const faqAnswered = await tryAnswerGameFaqInChat(message);
      if (faqAnswered) return;

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
        const decremented = await decrementMessageCountRobust(db, guildId, message.author.id, msgId);
        if (decremented) {
          await decrementWeeklyCount(db, guildId, message.author.id, message.createdAt || new Date());
        }
        return;
      }

      const indexedMessage = await dbAll(
        `SELECT user_id, created_at FROM message_index WHERE guild_id = ? AND message_id = ? LIMIT 1`,
        [guildId, msgId]
      );
      const indexedRow = indexedMessage?.[0] || null;
      const effectiveUserId = indexedRow?.user_id || await lookupIndexedAuthor(guildId, msgId);
      if (effectiveUserId) {
        const decremented = await decrementMessageCountRobust(db, guildId, effectiveUserId, msgId);
        if (decremented) {
          await decrementWeeklyCount(db, guildId, effectiveUserId, indexedRow?.created_at || new Date());
        }
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
      const weeklyCounts = new Map();

      const bumpWeeklyCount = (userId, createdAt) => {
        const dateKey = new Date(createdAt || Date.now()).toISOString();
        const mapKey = `${userId}:${dateKey}`;
        weeklyCounts.set(mapKey, (weeklyCounts.get(mapKey) || 0) + 1);
      };

      for (const msg of messages.values()) {
        if (!msg?.id) continue;
        allMessageIds.push(msg.id);

        if (msg.author && !msg.author.bot) {
          userCounts.set(msg.author.id, (userCounts.get(msg.author.id) || 0) + 1);
          bumpWeeklyCount(msg.author.id, msg.createdAt || new Date());
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
        const indexedRows = await dbAll(
          `SELECT message_id, user_id, created_at FROM message_index
           WHERE guild_id = ? AND message_id IN (${unknownIds.map(() => "?").join(",")})`,
          [guildId, ...unknownIds]
        );
        for (const row of indexedRows) {
          userCounts.set(row.user_id, (userCounts.get(row.user_id) || 0) + 1);
          bumpWeeklyCount(row.user_id, row.created_at || new Date());
        }
      }

      if (userCounts.size > 0 || allMessageIds.length > 0) {
        const decremented = await bulkDecrementRobust(db, guildId, userCounts, allMessageIds);
        if (decremented) {
          for (const [mapKey, count] of weeklyCounts.entries()) {
            const splitIndex = mapKey.indexOf(":");
            const targetUserId = mapKey.slice(0, splitIndex);
            const createdAt = mapKey.slice(splitIndex + 1);
            await decrementWeeklyCount(db, guildId, targetUserId, createdAt, count);
          }
        }
      }
    } catch (err) {
      console.error("messageDeleteBulk handler error:", err);
    }
  });
}

module.exports = { registerEventHandlers };
