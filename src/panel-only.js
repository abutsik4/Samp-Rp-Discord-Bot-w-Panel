/**
 * Standalone Web Panel Launcher
 * 
 * This is an alternative entry point that only starts the web panel
 * without running the Discord bot. Useful for testing the panel independently.
 * 
 * Usage: node src/panel-only.js
 */

require("dotenv").config();
const { createDiscordClient } = require("./bot/discordClient");
const { initStatsDb } = require("./bot/statsDb");
const { createWebServer } = require("./web/server");

const PORT = process.env.PANEL_PORT || 3001;
const TOKEN = process.env.DISCORD_TOKEN;

async function startPanelOnly() {
  console.log("🚀 Starting JepsenCloud Panel...\n");

  // Initialize database
  const statsDb = initStatsDb();
  console.log("✅ Database initialized");

  // Initialize Discord client (needed for bot management, but won't login without token)
  const discordClient = createDiscordClient();

  // Start web server
  const app = createWebServer({ discordClient, statsDb });

  app.listen(PORT, () => {
    console.log(`\n✨ Panel ready!`);
    console.log(`📍 http://localhost:${PORT}/login`);
    console.log(`\n💡 Default credentials:`);
    console.log(`   Admin - username: admin, password: admin123`);
    console.log(`   Test  - username: test, password: test1234`);
    console.log(`\n⚠️  Run 'node scripts/init-panel-users.js' if you need to initialize users\n`);
  });

  // If Discord token is available, connect the bot
  if (TOKEN) {
    console.log("\n🔗 Connecting to Discord...");
    try {
      await discordClient.login(TOKEN);
      console.log(`✅ Connected as ${discordClient.user.tag}`);
    } catch (error) {
      console.log("⚠️  Discord connection failed (panel will work without bot features)");
      console.log(`   Error: ${error.message}`);
    }
  } else {
    console.log("⚠️  No DISCORD_TOKEN found - running panel without Discord connection");
  }
}

startPanelOnly().catch(error => {
  console.error("❌ Failed to start panel:", error);
  process.exit(1);
});
