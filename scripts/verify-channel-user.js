#!/usr/bin/env node
"use strict";

/**
 * Targeted channel fetcher for one user.
 * Counts messages in specific channels (and their active threads) for a user.
 *
 * Usage:
 *   DISCORD_TOKEN=... node scripts/verify-channel-user.js <guildId> <userId> <channelId1> [channelId2 ...]
 */

const { Client, GatewayIntentBits } = require("discord.js");

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is not set");
  process.exit(1);
}

const [guildId, userId, ...channelIds] = process.argv.slice(2);
if (!guildId || !userId || channelIds.length === 0) {
  console.error("Usage: DISCORD_TOKEN=... node scripts/verify-channel-user.js <guildId> <userId> <channelId1> [channelId2 ...]");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function countChannelMessages(channel, userId) {
  let total = 0;
  let before = null;
  let batch = 0;

  while (true) {
    const options = { limit: 100 };
    if (before) options.before = before;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    const userMsgs = messages.filter((m) => m.author?.id === userId);
    total += userMsgs.size;

    before = messages.last()?.id;
    batch++;

    // stop if fewer than 100 returned
    if (messages.size < 100) break;

    // light rate limit protection
    if (batch % 5 === 0) await sleep(250);
  }

  return total;
}

async function main() {
  await client.login(DISCORD_TOKEN);
  const guild = await client.guilds.fetch(guildId);
  console.log(`📍 Guild: ${guild.name}`);
  console.log(`👤 User: ${userId}`);
  console.log(`🎯 Channels: ${channelIds.join(", ")}`);

  let grandTotal = 0;

  for (const channelId of channelIds) {
    try {
      const channel = await guild.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.log(`⚠️  Skip ${channelId} (not text-based or inaccessible)`);
        continue;
      }

      let channelTotal = 0;

      // main channel
      channelTotal += await countChannelMessages(channel, userId);

      // active threads
      try {
        const threads = await channel.threads.fetchActive();
        for (const [, thread] of threads.threads) {
          channelTotal += await countChannelMessages(thread, userId);
        }
      } catch (err) {
        console.log(`⚠️  Cannot fetch active threads for ${channelId}: ${err.message}`);
      }

      // archived threads
      try {
        const archived = await channel.threads.fetchArchived();
        for (const [, thread] of archived.threads) {
          channelTotal += await countChannelMessages(thread, userId);
        }
      } catch (err) {
        console.log(`⚠️  Cannot fetch archived threads for ${channelId}: ${err.message}`);
      }

      grandTotal += channelTotal;
      console.log(`✅ ${channelId} (${channel.name}): ${channelTotal} messages`);
    } catch (err) {
      console.log(`❌ Failed channel ${channelId}: ${err.message}`);
    }
  }

  console.log("────────────────────────────");
  console.log(`Total for user ${userId}: ${grandTotal}`);
  await client.destroy();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
