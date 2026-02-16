const { Router } = require("express");

function createWhitelistRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, bots, client, dbRun, dbAll } = ctx;

  router.get(`${PANEL_BASE}/api/bot/:botKey/whitelist`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const rows = await dbAll(
        `SELECT channel_id, added_at FROM channel_whitelist WHERE guild_id = ?`,
        [bot.guild_id]
      );

      const guild = client.guilds.cache.get(bot.guild_id);
      const channels = rows.map(r => {
        const ch = guild?.channels?.cache?.get(r.channel_id);
        return { id: r.channel_id, name: ch?.name || "Unknown Channel", added_at: r.added_at };
      });

      return res.json({ channels });
    } catch (e) {
      console.error("Get whitelist error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get whitelist" });
    }
  });

  router.post(`${PANEL_BASE}/api/bot/:botKey/whitelist`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const channelId = req.body?.channel_id;
    if (!channelId) return res.status(400).json({ error: "channel_id required" });

    try {
      await dbRun(
        `INSERT OR IGNORE INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)`,
        [bot.guild_id, channelId]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("Add whitelist error:", e);
      return res.status(500).json({ error: e?.message || "Failed to add channel" });
    }
  });

  router.delete(`${PANEL_BASE}/api/bot/:botKey/whitelist/:channelId`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      await dbRun(
        `DELETE FROM channel_whitelist WHERE guild_id = ? AND channel_id = ?`,
        [bot.guild_id, req.params.channelId]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("Remove whitelist error:", e);
      return res.status(500).json({ error: e?.message || "Failed to remove channel" });
    }
  });

  router.delete(`${PANEL_BASE}/api/bot/:botKey/whitelist`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      await dbRun(`DELETE FROM channel_whitelist WHERE guild_id = ?`, [bot.guild_id]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Clear whitelist error:", e);
      return res.status(500).json({ error: e?.message || "Failed to clear whitelist" });
    }
  });

  return router;
}

module.exports = { createWhitelistRouter };
