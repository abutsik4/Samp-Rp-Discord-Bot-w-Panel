const { Router } = require("express");

// Page generators (imported directly — no longer passed via ctx)
const { generateMessagesPage } = require("../messages-page");
const { generateStatsPage } = require("../stats-page");
const { generateAnalyticsPage } = require("../analytics-page");
const { generateAIEngagementPage } = require("../ai-engagement-page");
const { generateCommandsPage } = require("../commands-page");
const { generateAccuracyMonitorPage } = require("../accuracy-monitor-page");
const { generateRateLimiterPage } = require("../rate-limiter-page");
const { generateWhitelistPage } = require("../whitelist-page");
const { generateAutoModPage } = require("../automod-page");
const { generateHistoryPage } = require("../history-page");
const { generateDebugReportsPage } = require("../debug-reports-page");
const { generateSampServersPage } = require("../samp-servers-page");
const { generateChannelsPage } = require("../channels-page");
const { generateBotOverviewPage } = require("../bot-overview-page");
const { generateHolidaysPage } = require("../holidays-page");

function createBotPagesRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, bots, db,
    getDisabledCommands,
    panelHttpLogger,
  } = ctx;

  // ========================
  // BOT PAGE RENDERS
  // ========================

  // BOT PAGE
  router.get(`${PANEL_BASE}/bot/:botKey`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");

    res.send(
      generateBotOverviewPage(bot, PANEL_BASE, {
        username: req.session.user.username,
        userRole: req.session.user.role,
      })
    );
  });

  // Holidays page
  router.get(`${PANEL_BASE}/bot/:botKey/holidays`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateHolidaysPage(bot, PANEL_BASE));
  });

  // Messages page route
  router.get(`${PANEL_BASE}/bot/:botKey/messages`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateMessagesPage(bot, PANEL_BASE));
  });

  // User statistics page route
  router.get(`${PANEL_BASE}/bot/:botKey/stats`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateStatsPage(bot, PANEL_BASE));
  });

  // Analytics page route (daily/channel stats)
  router.get(`${PANEL_BASE}/bot/:botKey/analytics`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateAnalyticsPage(bot, PANEL_BASE));
  });

  // AI Engagement page
  router.get(`${PANEL_BASE}/bot/:botKey/ai-engagement`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateAIEngagementPage(bot, PANEL_BASE));
  });

  // Commands documentation page
  router.get(`${PANEL_BASE}/bot/:botKey/commands`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    
    // Get disabled commands for this guild
    const guild = bot.client?.guilds.cache.first();
    const guildId = guild?.id || "global";
    let disabledCommands = [];
    try {
      disabledCommands = await getDisabledCommands(guildId);
    } catch (e) {
      console.error("Error getting disabled commands:", e);
    }
    
    res.send(generateCommandsPage(bot, PANEL_BASE, disabledCommands));
  });

  // Accuracy monitor page
  router.get(`${PANEL_BASE}/bot/:botKey/accuracy`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    
    // Set db in app.locals for the handler to access
    req.app.locals.db = db;
    await generateAccuracyMonitorPage(bot, PANEL_BASE)(req, res);
  });

  // Rate Limiter page
  router.get(`${PANEL_BASE}/bot/:botKey/rate-limits`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateRateLimiterPage(bot, PANEL_BASE));
  });

  // Redirect old consecutive limits route to unified spam prevention
  router.get(`${PANEL_BASE}/bot/:botKey/consecutive-limits`, requireAuth, (req, res) => {
    res.redirect(`${PANEL_BASE}/bot/${req.params.botKey}/rate-limits`);
  });

  // Channel Whitelist page
  router.get(`${PANEL_BASE}/bot/:botKey/whitelist`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateWhitelistPage(bot, PANEL_BASE));
  });

  // AutoMod page
  router.get(`${PANEL_BASE}/bot/:botKey/automod`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateAutoModPage(bot, PANEL_BASE));
  });

  // Operation History page
  router.get(`${PANEL_BASE}/bot/:botKey/history`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateHistoryPage(bot, PANEL_BASE));
  });

  // Debug Reports page
  router.get(`${PANEL_BASE}/bot/:botKey/debug-reports`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateDebugReportsPage(bot, PANEL_BASE));
  });

  // SAMP Servers page
  router.get(`${PANEL_BASE}/bot/:botKey/samp-servers`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateSampServersPage(bot, PANEL_BASE));
  });

  // Channel Manager page
  router.get(`${PANEL_BASE}/bot/:botKey/channels`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateChannelsPage(bot, PANEL_BASE));
  });

  return router;
}

module.exports = { createBotPagesRouter };
