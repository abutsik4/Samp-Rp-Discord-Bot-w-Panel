/**
 * Standalone Web Panel Launcher
 *
 * Alternative entry point that only starts the web panel
 * without running the Discord bot. Useful for testing the panel independently.
 *
 * Usage: node src/panel-only.js
 */

require("dotenv").config();
const path = require("path");
const { initCore, initFeatureTables, parsePanelConfig } = require("./bootstrap");
const { initSchema } = require("./db/schema");
const { createDiscordClient } = require("./bot/discordClient");
const { createPanelApp } = require("./web/panel-app");

const PORT = Number(process.env.PANEL_PORT || process.env.PORT || 3001);
const TOKEN = process.env.DISCORD_TOKEN;
const PANEL_DISABLE_DISCORD = process.env.PANEL_DISABLE_DISCORD === "1";
const GUILD_ID = process.env.GUILD_ID || "537187880842559499";

const { db, dbRun, dbGet, dbAll } = initCore({
  dbPath: process.env.STATS_DB_PATH,
});

const { PANEL_BASE, TRUST_PROXY, COOKIE_SECURE, isAllowedChannel } = parsePanelConfig();

(async () => {
  await initSchema(dbRun, path.resolve(process.env.STATS_DB_PATH || path.join(__dirname, "..", "data", "stats.db")));
  await initFeatureTables(db, dbRun);
  console.log("✅ Database initialized");

  const discordClient = createDiscordClient();
  const helpers = require("./bot/helpers");
  helpers.init({ db, dbRun, dbGet, dbAll });

  const {
    ruPlural, getUserMessageCount, recordOperation, performUndo,
    getDisabledCommands, enableCommand, disableCommand,
    listCommandCategoryChannels, setCommandCategoryChannel, clearCommandCategoryChannel,
  } = helpers;

  const bots = [{ key: "samprp", name: "JepsenCloud Bot", kind: "discord", client: discordClient, guild_id: GUILD_ID }];

  const { app } = createPanelApp({
    client: discordClient, db, dbRun, dbGet, dbAll, bots,
    isAllowedChannel, PANEL_BASE, TRUST_PROXY, COOKIE_SECURE,
    recordOperation, performUndo, getUserMessageCount, ruPlural,
    getDisabledCommands, enableCommand, disableCommand,
    listCommandCategoryChannels, setCommandCategoryChannel, clearCommandCategoryChannel,
  });

  app.listen(PORT, () => {
    console.log(`\n✨ Panel ready!`);
    console.log(`📍 http://localhost:${PORT}${PANEL_BASE}/login`);
    console.log(`\n💡 Tip: run 'node scripts/init-panel-users.js' to create panel users if needed.\n`);
  });

  if (TOKEN && !PANEL_DISABLE_DISCORD) {
    console.log("\n🔗 Connecting to Discord...");
    try {
      await discordClient.login(TOKEN);
      console.log(`✅ Connected as ${discordClient.user.tag}`);
    } catch (error) {
      console.log("⚠️  Discord connection failed (panel will work without bot features)");
      console.log(`   Error: ${error.message}`);
    }
  } else if (PANEL_DISABLE_DISCORD) {
    console.log("⚠️  Discord login disabled for panel-only mode");
  } else {
    console.log("⚠️  No DISCORD_TOKEN found - running panel without Discord connection");
  }
})().catch((error) => {
  console.error("❌ Failed to start panel:", error);
  process.exit(1);
});