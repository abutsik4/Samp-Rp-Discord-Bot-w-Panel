const { Router } = require("express");
const { getRateLimitConfig, setRateLimitConfig, getRateLimitStats, getUsersWithStrikes, clearUserStrikes } = require("../../features/rate-limiter");

function createRateLimitsRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, apiLimiter, bots, db, client,
  } = ctx;

  // Channel-specific handlers
  const handleLimitConfigGet = async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const channelId = req.params.channelId;
    let guildId;
    try {
      const ch = await bot.client.channels.fetch(channelId);
      guildId = ch.guild.id;
    } catch (e) {
      return res.status(404).json({ error: "Channel not found or not accessible" });
    }

    try {
      const config = await getRateLimitConfig(db, guildId, channelId);
      return res.json(config || {});
    } catch (e) {
      console.error("Config get error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get config" });
    }
  };

  const handleLimitConfigSet = async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const channelId = req.params.channelId;
    let guildId;
    try {
      const ch = await bot.client.channels.fetch(channelId);
      guildId = ch.guild.id;
    } catch (e) {
      return res.status(404).json({ error: "Channel not found or not accessible" });
    }

    try {
      await setRateLimitConfig(db, guildId, channelId, req.body);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Config update error:", e);
      return res.status(500).json({ error: e?.message || "Failed to update config" });
    }
  };

  // IMPORTANT: Register specific routes BEFORE the :channelId param route
  // Get config (by guildId + channelId query params)
  router.get(`${PANEL_BASE}/api/:botKey/rate-limits/config`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.query.guildId || "");
    const channelId = String(req.query.channelId || "");

    if (!guildId) return res.status(400).json({ error: "guildId query parameter required" });
    if (!channelId) return res.status(400).json({ error: "channelId query parameter required" });

    try {
      const config = await getRateLimitConfig(db, guildId, channelId);
      const stats = await getRateLimitStats(db, guildId, channelId);
      return res.json({ config, stats });
    } catch (e) {
      console.error("Rate limit config get error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get config" });
    }
  });

  // Set config (by body guildId + channelId)
  router.post(`${PANEL_BASE}/api/:botKey/rate-limits/config`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.body?.guildId || "");
    const channelId = String(req.body?.channelId || "");
    const config = req.body?.config;

    if (!guildId) return res.status(400).json({ error: "guildId required" });
    if (!channelId) return res.status(400).json({ error: "channelId required" });
    if (!config) return res.status(400).json({ error: "config required" });

    try {
      await setRateLimitConfig(db, guildId, channelId, config);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Rate limit config update error:", e);
      return res.status(500).json({ error: e?.message || "Failed to update config" });
    }
  });

  // Get strikes
  router.get(`${PANEL_BASE}/api/:botKey/rate-limits/strikes`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.query?.guildId || "");
    if (!guildId) return res.status(400).json({ error: "guildId required" });

    try {
      const rows = await getUsersWithStrikes(db, guildId);
      const users = (rows || []).map((r) => ({
        user_id: r.user_id,
        strikes: r.total_violations,
        total_violations: r.total_violations,
        last_violation_timestamp: r.last_violation,
        last_violation: r.last_violation,
        will_reset_at: r.will_reset_at,
      }));

      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        for (const user of users) {
          try {
            const member = await guild.members.fetch(user.user_id).catch(() => null);
            user.username = member ? (member.user.username || member.user.tag) : null;
          } catch (e) {
            user.username = null;
          }
        }
      }

      return res.json({ users });
    } catch (e) {
      console.error("Get strikes error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get strikes" });
    }
  });

  // Clear strikes (POST compat endpoint)
  router.post(`${PANEL_BASE}/api/:botKey/rate-limits/strikes/clear`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.body?.guildId || "");
    const userId = String(req.body?.userId || "");

    if (!guildId) return res.status(400).json({ error: "guildId required" });
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      await clearUserStrikes(db, guildId, userId);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Clear strikes error:", e);
      return res.status(500).json({ error: e?.message || "Failed to clear strikes" });
    }
  });

  // Clear strikes (DELETE)
  router.delete(`${PANEL_BASE}/api/:botKey/rate-limits/strikes/:userId`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.query?.guildId || "");
    const userId = req.params.userId;

    if (!guildId) return res.status(400).json({ error: "guildId required" });
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      await clearUserStrikes(db, guildId, userId);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Clear strikes error:", e);
      return res.status(500).json({ error: e?.message || "Failed to clear strikes" });
    }
  });

  // Channel-specific config routes (AFTER specific routes to avoid param collision)
  router.get(`${PANEL_BASE}/api/:botKey/rate-limits/:channelId`, requireAuth, apiLimiter, handleLimitConfigGet);
  router.post(`${PANEL_BASE}/api/:botKey/rate-limits/:channelId`, requireAuth, apiLimiter, handleLimitConfigSet);

  // Guild roles (for role name resolution)
  router.get(`${PANEL_BASE}/api/:botKey/roles`, requireAuth, apiLimiter, async (req, res) => {
    try {
      const { guildId } = req.query;
      if (!guildId) return res.status(400).json({ error: "guildId is required" });

      const guild = await client.guilds.fetch(guildId);
      const roles = await guild.roles.fetch();

      const rolesList = Array.from(roles.values())
        .filter(role => role.id !== guild.id)
        .map(role => ({ id: role.id, name: role.name, color: role.color, position: role.position }))
        .sort((a, b) => b.position - a.position);

      return res.json({ roles: rolesList });
    } catch (e) {
      console.error("Failed to fetch roles:", e);
      return res.status(500).json({ error: "Failed to fetch roles" });
    }
  });

  return router;
}

module.exports = { createRateLimitsRouter };
