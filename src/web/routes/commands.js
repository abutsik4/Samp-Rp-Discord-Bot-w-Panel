const { Router } = require("express");

function createCommandsRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, apiLimiter, bots,
    getDisabledCommands, enableCommand, disableCommand,
  } = ctx;

  router.get(`${PANEL_BASE}/api/:botKey/commands`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const requestedGuildId = String(req.query.guildId || "").trim();
      const guildId = requestedGuildId || bot.client?.guilds.cache.first()?.id || null;
      if (!guildId) return res.json({ ok: true, guildId: null, commands: [] });

      const guild = await bot.client.guilds.fetch(guildId).catch(() => bot.client.guilds.cache.get(guildId));
      if (!guild) return res.status(404).json({ error: "Guild not found" });

      const commandCollection = await guild.commands.fetch();
      const commands = Array.from(commandCollection.values());

      let disabledList = [];
      try {
        disabledList = await getDisabledCommands(guildId);
      } catch (e) {
        console.error("Error getting disabled commands:", e);
      }
      const disabledSet = new Set((disabledList || []).map((d) => d.command_name));

      function categorize(cmd) {
        const name = String(cmd?.name || "").toLowerCase();
        const desc = String(cmd?.description || "").toLowerCase();
        if (name.includes("admin") || name.includes("sync") || name.includes("backfill")) return "admin";
        if (desc.includes("owner") || desc.includes("admin")) return "admin";
        return "user";
      }

      const out = commands
        .filter((c) => c && c.type === 1)
        .map((c) => ({
          name: c.name,
          description: c.description,
          options: Array.isArray(c.options)
            ? c.options.map((o) => ({ name: o?.name, required: !!o?.required }))
            : [],
          enabled: !disabledSet.has(c.name),
          category: categorize(c),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return res.json({ ok: true, guildId, commands: out });
    } catch (e) {
      console.error("Get commands error:", e);
      return res.status(500).json({ error: "Failed to get commands" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/commands/toggle`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { commandName, enabled } = req.body;
    if (!commandName) return res.status(400).json({ error: "commandName is required" });

    try {
      const guild = bot.client?.guilds.cache.first();
      const guildId = guild?.id || "global";
      const username = req.session?.user?.username || "unknown";

      if (enabled) {
        await enableCommand(guildId, commandName);
      } else {
        await disableCommand(guildId, commandName, username);
      }

      return res.json({ ok: true, commandName, enabled, guildId });
    } catch (e) {
      console.error("Toggle command error:", e);
      return res.status(500).json({ error: "Failed to toggle command" });
    }
  });

  return router;
}

module.exports = { createCommandsRouter };
