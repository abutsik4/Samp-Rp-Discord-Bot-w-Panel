"use strict";
/**
 * One-off: deploy slash commands to GUILD_ID via REST, then post the
 * 2026-05-27 announcement to the SAMP Life channel.
 *
 * Usage: node scripts/deploy-and-announce-2026-05-27.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
const { buildCommandsJson } = require("../src/bot/slashCommands");

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const ANNOUNCE_CHANNEL_ID = "1452060957214769194";
const ANNOUNCE_FILE = path.resolve(__dirname, "../tmp/ann-update-2026-05-27.md");

if (!TOKEN) throw new Error("DISCORD_TOKEN not set");
if (!GUILD_ID) throw new Error("GUILD_ID not set");

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function main() {
  // 1. Resolve application id from current bot token
  const app = await rest.get(Routes.oauth2CurrentApplication());
  console.log(`[deploy] Application: ${app.name} (${app.id})`);

  // 2. Build and register guild commands
  const commands = buildCommandsJson();
  console.log(`[deploy] Registering ${commands.length} commands for guild ${GUILD_ID}...`);
  await rest.put(Routes.applicationGuildCommands(app.id, GUILD_ID), { body: commands });
  console.log(`[deploy] OK — ${commands.length} commands deployed.`);

  // 3. Load and trim announcement body to Discord embed description limit (4096).
  const raw = fs.readFileSync(ANNOUNCE_FILE, "utf8");
  // Strip the meta header (everything before the first horizontal rule "---")
  const splitIdx = raw.indexOf("\n---\n");
  let body = (splitIdx >= 0 ? raw.slice(splitIdx + 5) : raw).trim();
  // First non-empty line is used as the embed title.
  const firstNL = body.indexOf("\n");
  const titleLine = body.slice(0, firstNL).trim().replace(/^[*\s]+|[*\s]+$/g, "").replace(/\*\*/g, "");
  body = body.slice(firstNL).trim();
  if (body.length > 4096) {
    throw new Error(`Announcement body is ${body.length} chars (>4096). Trim before posting.`);
  }
  console.log(`[announce] Posting embed (${body.length} chars desc) to channel ${ANNOUNCE_CHANNEL_ID}...`);
  const msg = await rest.post(Routes.channelMessages(ANNOUNCE_CHANNEL_ID), {
    body: {
      embeds: [{
        title: titleLine.slice(0, 256),
        description: body,
        color: 0xf1c40f,
        footer: { text: "SAMP Life · 27.05.2026" },
      }],
    },
  });
  console.log(`[announce] OK — message id ${msg.id}`);
}

main().catch((err) => {
  console.error("[deploy-and-announce] FAILED:", err);
  process.exit(1);
});
