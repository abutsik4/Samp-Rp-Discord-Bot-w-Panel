const { Router } = require("express");
const { getEngagementSettings, getEngagementStats, updateEngagementSettings } = require("../../features/ai-engagement");

function createAIEngagementRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, requireAdmin, apiLimiter, bots, db, dbRun, dbAll,
  } = ctx;

  router.get(`${PANEL_BASE}/api/:botKey/ai-engagement/settings`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.query.guildId || bot.guild_id || bot.client?.guilds?.cache?.first()?.id || "");
    if (!guildId) return res.status(400).json({ error: "guildId query parameter required" });

    try {
      const settings = await getEngagementSettings(db, guildId);
      const stats = await getEngagementStats(db, guildId);
      return res.json({ settings, stats });
    } catch (e) {
      console.error("AI engagement settings get error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get settings" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/ai-engagement/settings`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.body?.guildId || bot.guild_id || bot.client?.guilds?.cache?.first()?.id || "");
    const settings = req.body?.settings;

    if (!guildId) return res.status(400).json({ error: "guildId required" });
    if (!settings) return res.status(400).json({ error: "settings required" });

    try {
      await updateEngagementSettings(db, guildId, settings);
      return res.json({ ok: true });
    } catch (e) {
      console.error("AI engagement settings update error:", e);
      return res.status(500).json({ error: e?.message || "Failed to update settings" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/ai-engagement/history`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.query.guildId || bot.guild_id || bot.client?.guilds?.cache?.first()?.id || "");
    const limit = parseInt(req.query.limit || "20");

    if (!guildId) return res.status(400).json({ error: "guildId query parameter required" });

    try {
      const history = await dbAll(
        `SELECT * FROM ai_engagement_history WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [guildId, limit]
      );
      return res.json({ history });
    } catch (e) {
      console.error("AI engagement history get error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get history" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/ai-engagement/test`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.body?.guildId || bot.guild_id || bot.client?.guilds?.cache?.first()?.id || "");
    if (!guildId) return res.status(400).json({ error: "guildId required" });

    try {
      console.log("[AI Test] Generating test response for guild:", guildId);
      const { generateContextualResponse } = require("../../features/ml-engine");
      const mockContext = {
        sentiment: { score: 0.7, comparative: 0.05, label: "POSITIVE" },
        topics: ["greeting", "positive"],
        messageText: "Привет! Как дела?",
        confidence: 0.75,
      };
      const result = await generateContextualResponse(mockContext, 0.2);
      console.log("[AI Test] Generated result:", result);

      const response = result?.response || null;
      return res.json({ response, confidence: result?.confidence, method: result?.method });
    } catch (e) {
      console.error("AI engagement test error:", e);
      return res.status(500).json({ error: e?.message || "Failed to generate test response" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/ai-engagement/history`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.body?.guildId || bot.guild_id || bot.client?.guilds?.cache?.first()?.id || "");
    if (!guildId) return res.status(400).json({ error: "guildId required" });

    try {
      await dbRun(db, `DELETE FROM ai_engagement_history WHERE guild_id = ?`, [guildId]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("AI engagement clear history error:", e);
      return res.status(500).json({ error: e?.message || "Failed to clear history" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/ai-engagement/train`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const channelId = String(req.body?.channelId || "");
    const messageLimit = parseInt(req.body?.messageLimit || "500");

    if (!channelId) return res.status(400).json({ error: "channelId required" });

    try {
      console.log(`[AI Train] Training model from channel ${channelId} (limit: ${messageLimit})`);
      const { trainFromDiscordChannel } = require("../../features/markov-generator");
      const result = await trainFromDiscordChannel(bot.client, channelId, messageLimit);

      console.log(`[AI Train] Training complete! Processed ${result.messagesProcessed} messages`);
      return res.json({ ok: true, messagesProcessed: result.messagesProcessed, stats: result.stats });
    } catch (e) {
      console.error("AI engagement train error:", e);
      return res.status(500).json({ error: e?.message || "Failed to train model" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/ai-engagement/model-stats`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { getMarkovStats } = require("../../features/markov-generator");
      const stats = getMarkovStats();
      return res.json({ stats });
    } catch (e) {
      console.error("AI engagement model stats error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get model stats" });
    }
  });

  return router;
}

module.exports = { createAIEngagementRouter };
