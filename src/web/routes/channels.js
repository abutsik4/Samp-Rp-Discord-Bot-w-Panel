const { Router } = require("express");

function createChannelsRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, bots, client } = ctx;

  router.get(`${PANEL_BASE}/api/bot/:botKey/channels`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const guild = client.guilds.cache.get(bot.guild_id);
      if (!guild) return res.status(404).json({ error: "Guild not found" });

      const channels = guild.channels.cache
        .map((ch) => ({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          parentId: ch.parentId || null,
          position: ch.position || 0,
        }))
        .sort((a, b) => a.position - b.position);

      return res.json({ channels });
    } catch (e) {
      console.error("Get channels error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get channels" });
    }
  });

  router.post(`${PANEL_BASE}/api/bot/:botKey/channels/bulk-delete`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { channelIds } = req.body;
    if (!Array.isArray(channelIds) || channelIds.length === 0) {
      return res.status(400).json({ error: "channelIds array is required" });
    }

    if (channelIds.length > 100) {
      return res.status(400).json({ error: "Maximum 100 channels can be deleted at once" });
    }

    try {
      const guild = client.guilds.cache.get(bot.guild_id);
      if (!guild) return res.status(404).json({ error: "Guild not found" });

      let deleted = 0;
      let failed = 0;
      const errors = [];

      for (const channelId of channelIds) {
        try {
          const channel = await guild.channels.fetch(channelId);
          if (channel) {
            await channel.delete(
              `Bulk delete via panel by ${req.session?.user?.username || "unknown"}`
            );
            deleted++;
          } else {
            failed++;
            errors.push({ id: channelId, error: "Channel not found" });
          }
        } catch (e) {
          failed++;
          errors.push({ id: channelId, error: e.message });
        }
        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 200));
      }

      console.log(
        `Bulk delete channels: ${deleted} deleted, ${failed} failed by ${req.session?.user?.username}`
      );

      return res.json({ ok: true, deleted, failed, errors: errors.slice(0, 10) });
    } catch (e) {
      console.error("Bulk delete channels error:", e);
      return res.status(500).json({ error: e?.message || "Failed to delete channels" });
    }
  });

  return router;
}

module.exports = { createChannelsRouter };
