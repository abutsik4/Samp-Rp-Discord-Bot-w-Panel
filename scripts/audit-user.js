// /opt/jepsencloud-bot/scripts/audit-user.js
require("dotenv").config({ path: "/opt/jepsencloud-bot/.env" });

const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

const TOKEN = process.env.DISCORD_TOKEN;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchAllMessagesForUser(channel, userId) {
  let before;
  let count = 0;
  let scanned = 0;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;

    for (const msg of batch.values()) {
      scanned++;
      if (msg.author?.id === userId && !msg.author?.bot) count++;
    }

    before = batch.last().id;
    await sleep(350); // gentle rate limiting
  }

  return { count, scanned };
}

async function main() {
  const guildId = process.argv[2];
  const userId = process.argv[3];

  if (!TOKEN) {
    console.error("Missing DISCORD_TOKEN in .env");
    process.exit(1);
  }
  if (!guildId || !userId) {
    console.error("Usage: node scripts/audit-user.js <GUILD_ID> <USER_ID>");
    process.exit(1);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  client.once("ready", async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      await guild.channels.fetch();

      const me = await guild.members.fetchMe();

      // DB stored count (optional comparison)
      const db = new sqlite3.Database("/opt/jepsencloud-bot/data/stats.db");
      const dbCount = await new Promise((resolve) => {
        db.get(
          "SELECT message_count FROM user_stats WHERE guild_id=? AND user_id=?",
          [guildId, userId],
          (err, row) => resolve(row?.message_count ?? 0)
        );
      });
      db.close();

      const perTarget = [];
      const errors = [];

      // 1) Normal channels
      for (const ch of guild.channels.cache.values()) {
        if (!ch?.isTextBased?.()) continue;
        if (!ch.messages) continue;

        const perms = ch.permissionsFor(me);
        if (
          !perms ||
          !perms.has(PermissionsBitField.Flags.ViewChannel) ||
          !perms.has(PermissionsBitField.Flags.ReadMessageHistory)
        ) {
          errors.push({ id: ch.id, name: ch.name, reason: "No View/History permission" });
          continue;
        }

        try {
          const { count, scanned } = await fetchAllMessagesForUser(ch, userId);
          perTarget.push({ type: "channel", id: ch.id, name: ch.name, count, scanned });
        } catch (e) {
          errors.push({ id: ch.id, name: ch.name, reason: String(e?.message || e) });
        }
      }

      // 2) Threads (active + archived best-effort)
      for (const ch of guild.channels.cache.values()) {
        if (!ch?.isTextBased?.()) continue;
        if (!ch.threads) continue;

        // Active threads
        try {
          const active = await ch.threads.fetchActive();
          for (const th of active.threads.values()) {
            const perms = th.permissionsFor(me);
            if (
              !perms ||
              !perms.has(PermissionsBitField.Flags.ViewChannel) ||
              !perms.has(PermissionsBitField.Flags.ReadMessageHistory)
            ) {
              errors.push({ id: th.id, name: th.name, reason: "No View/History permission (thread)" });
              continue;
            }
            const { count, scanned } = await fetchAllMessagesForUser(th, userId);
            perTarget.push({ type: "thread", id: th.id, name: th.name, count, scanned });
          }
        } catch (e) {
          // ignore if not supported
        }

        // Archived threads (public/private best-effort, single page each)
        for (const type of ["public", "private"]) {
          try {
            const archived = await ch.threads.fetchArchived({ type, limit: 100 });
            for (const th of archived.threads.values()) {
              const perms = th.permissionsFor(me);
              if (
                !perms ||
                !perms.has(PermissionsBitField.Flags.ViewChannel) ||
                !perms.has(PermissionsBitField.Flags.ReadMessageHistory)
              ) {
                errors.push({ id: th.id, name: th.name, reason: `No View/History permission (archived ${type})` });
                continue;
              }
              const { count, scanned } = await fetchAllMessagesForUser(th, userId);
              perTarget.push({ type: "thread", id: th.id, name: th.name, count, scanned });
            }
          } catch (e) {
            // not permitted / not supported
          }
        }
      }

      const auditedTotal = perTarget.reduce((s, x) => s + x.count, 0);

      perTarget.sort((a, b) => b.count - a.count);

      console.log("DB count:", dbCount);
      console.log("Audited total:", auditedTotal);
      console.log("Delta (audited - db):", auditedTotal - dbCount);
      console.log("\nTop targets by count:");
      console.log(perTarget.slice(0, 20));

      if (errors.length) {
        console.log("\nSkipped / errors (these often explain undercount):");
        console.log(errors.slice(0, 50));
        if (errors.length > 50) console.log(`... plus ${errors.length - 50} more`);
      }

      await client.destroy();
      process.exit(0);
    } catch (e) {
      console.error(e);
      await client.destroy();
      process.exit(1);
    }
  });

  await client.login(TOKEN);
}

main();
