#!/usr/bin/env node
/**
 * Staff Role Requests — setup script
 *
 * Idempotent. Run once after deploying the feature to bootstrap it:
 *   node scripts/setup-staff-role-requests.js
 *
 * What it does:
 *  1. Logs in as the bot.
 *  2. Ensures the SQLite table exists.
 *  3. Ensures the hub channel exists in the guild.
 *  4. Re-registers all slash commands (so /request-staff-role appears).
 *
 * Re-running is safe: channels are matched by name, the table uses
 * CREATE TABLE IF NOT EXISTS, and slash command registration is idempotent.
 */

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const {
  ensureStaffRoleRequestsTable,
  ensureRequestHubChannel,
  HUB_CHANNEL_NAME,
} = require("../src/features/staff-role-requests");
const { registerGuildCommands } = require("../src/bot/slashCommands");

async function main() {
  const TOKEN = process.env.DISCORD_TOKEN;
  const GUILD_ID = process.env.GUILD_ID;
  if (!TOKEN) {
    console.error("[setup] DISCORD_TOKEN env is required");
    process.exit(1);
  }
  if (!GUILD_ID) {
    console.error("[setup] GUILD_ID env is required");
    process.exit(1);
  }

  const dbPath =
    process.env.STATS_DB_PATH ||
    path.join(__dirname, "..", "data", "stats.db");
  const db = new sqlite3.Database(dbPath);
  db.configure("busyTimeout", 5000);

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
  });

  client.once("ready", async () => {
    console.log(`[setup] Logged in as ${client.user.tag}`);
    try {
      console.log("[setup] Ensuring SQLite table...");
      await ensureStaffRoleRequestsTable(db);

      console.log(`[setup] Ensuring hub channel "${HUB_CHANNEL_NAME}" exists...`);
      client.db = db;
      const hub = await ensureRequestHubChannel(client, GUILD_ID);
      console.log(`[setup] Hub channel ready: ${hub.name} (${hub.id})`);

      console.log("[setup] Re-registering slash commands for guild...");
      const ok = await registerGuildCommands(client, GUILD_ID, TOKEN);
      if (ok) {
        console.log("[setup] Slash commands registered.");
      } else {
        console.warn("[setup] Slash command registration returned false — check logs.");
      }

      console.log("[setup] Done.");
    } catch (err) {
      console.error("[setup] Failed:", err);
      process.exitCode = 2;
    } finally {
      client.destroy();
      db.close();
    }
  });

  await client.login(TOKEN);
}

main().catch((err) => {
  console.error("[setup] Unhandled error:", err);
  process.exit(3);
});
