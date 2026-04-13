const { Router } = require("express");

const SUPPORTED_COMMAND_CATEGORIES = {
  samp_game: "SAMP Life game commands",
};

function createCommandChannelsRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, requireAdmin, bots, client,
    listCommandCategoryChannels, setCommandCategoryChannel, clearCommandCategoryChannel,
  } = ctx;

  router.get(`${PANEL_BASE}/api/:botKey/command-channels`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const rows = await listCommandCategoryChannels(bot.guild_id);
      const guild = client.guilds.cache.get(bot.guild_id);
      const restrictions = rows.map((row) => {
        const channel = guild?.channels?.cache?.get(row.channel_id);
        return {
          command_category: row.command_category,
          label: SUPPORTED_COMMAND_CATEGORIES[row.command_category] || row.command_category,
          channel_id: row.channel_id,
          channel_name: channel?.name || "Unknown Channel",
          updated_at: row.updated_at,
          updated_by: row.updated_by,
        };
      });

      return res.json({
        restrictions,
        supportedCategories: Object.entries(SUPPORTED_COMMAND_CATEGORIES).map(([id, label]) => ({ id, label })),
      });
    } catch (e) {
      console.error("Get command channel restrictions error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get command channel restrictions" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/command-channels`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const commandCategory = String(req.body?.command_category || "").trim();
    const channelId = String(req.body?.channel_id || "").trim();
    const updatedBy = req.session?.user?.username || null;

    if (!SUPPORTED_COMMAND_CATEGORIES[commandCategory]) {
      return res.status(400).json({ error: "Unsupported command category" });
    }
    if (!channelId) return res.status(400).json({ error: "channel_id required" });

    try {
      await setCommandCategoryChannel(bot.guild_id, commandCategory, channelId, updatedBy);
      return res.json({ ok: true, command_category: commandCategory, channel_id: channelId });
    } catch (e) {
      console.error("Save command channel restriction error:", e);
      return res.status(500).json({ error: e?.message || "Failed to save command channel restriction" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/command-channels/:commandCategory`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const commandCategory = String(req.params.commandCategory || "").trim();
    if (!SUPPORTED_COMMAND_CATEGORIES[commandCategory]) {
      return res.status(400).json({ error: "Unsupported command category" });
    }

    try {
      await clearCommandCategoryChannel(bot.guild_id, commandCategory);
      return res.json({ ok: true, command_category: commandCategory });
    } catch (e) {
      console.error("Clear command channel restriction error:", e);
      return res.status(500).json({ error: e?.message || "Failed to clear command channel restriction" });
    }
  });

  return router;
}

module.exports = { createCommandChannelsRouter };