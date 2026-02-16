// Backfill utility – extracted from index.js
// Walks every text channel in a guild, counts existing messages and indexes them.

/**
 * Run a full backfill for the given guild.
 *
 * @param {object} guild - Discord.js Guild
 * @param {object} deps  - { resetStats, incrementMessageCount, indexMessage, sleep }
 */
async function backfillGuild(guild, { resetStats, incrementMessageCount, indexMessage, sleep }) {
  console.log(`Starting backfill for guild: ${guild.name} (${guild.id})`);

  await resetStats();
  console.log("Existing stats cleared.");

  const channels = await guild.channels.fetch();

  for (const [, channel] of channels) {
    if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;
    if (channel.isThread && channel.isThread()) continue;

    console.log(`Backfilling channel: #${channel.name} (${channel.id})`);

    let lastId = null;
    let processedInChannel = 0;

    while (true) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;

      let messages;
      try {
        messages = await channel.messages.fetch(options);
      } catch (err) {
        console.error(`Error fetching messages in #${channel.name} (${channel.id}):`, err.message);
        break;
      }

      if (messages.size === 0) break;

      for (const message of messages.values()) {
        if (!message.guild) continue;
        if (!message.author) continue;
        if (message.author.bot) continue;

        incrementMessageCount(message.guild.id, message.author.id);
        await indexMessage(message.guild.id, message.id, message.author.id, message.channelId);

        processedInChannel++;
      }

      lastId = messages.last().id;
      await sleep(500);
    }

    console.log(`Finished channel #${channel.name} (${channel.id}). Messages counted: ${processedInChannel}`);
    await sleep(1000);
  }

  console.log("Backfill complete.");
}

module.exports = { backfillGuild };
