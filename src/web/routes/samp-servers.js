const { Router } = require("express");
const { SAMPStatusTracker } = require("../../features/samp-status");

function createSampServersRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, bots, client, db, dbRun, dbGet, dbAll } = ctx;

  // Get SAMP servers list
  router.get(`${PANEL_BASE}/api/bot/:botKey/samp-servers`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const servers = await dbAll(
        "SELECT * FROM samp_trackers WHERE guild_id = ? ORDER BY server_id",
        [bot.guild_id]
      );
      return res.json({ servers });
    } catch (e) {
      console.error("Get SAMP servers error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get servers" });
    }
  });

  // Add SAMP server
  router.post(`${PANEL_BASE}/api/bot/:botKey/samp-servers`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { server_id, server_name, server_ip, server_port, channel_id, emoji } = req.body;

    if (!server_id || !server_name || !server_ip || !channel_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      const existing = await dbGet(
        "SELECT * FROM samp_trackers WHERE guild_id = ? AND server_id = ?",
        [bot.guild_id, server_id]
      );

      if (existing) {
        return res.status(400).json({ error: "Server ID already exists" });
      }

      await dbRun(
        `INSERT INTO samp_trackers (guild_id, server_id, server_name, server_ip, server_port, channel_id, emoji, enabled) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [bot.guild_id, server_id, server_name, server_ip, server_port || 7777, channel_id, emoji || "🎮"]
      );

      const tracker = new SAMPStatusTracker(client, {
        serverIp: server_ip,
        serverPort: server_port || 7777,
        channelId: channel_id,
        serverName: server_name,
        emoji: emoji || "🎮",
      });

      await tracker.start();

      if (!client.sampTrackers) client.sampTrackers = new Map();
      const trackerKey = `${bot.guild_id}:${server_id}`;
      client.sampTrackers.set(trackerKey, tracker);

      return res.json({ ok: true, message: "Server added successfully" });
    } catch (e) {
      console.error("Add SAMP server error:", e);
      return res.status(500).json({ error: e?.message || "Failed to add server" });
    }
  });

  // Update SAMP server
  router.put(`${PANEL_BASE}/api/bot/:botKey/samp-servers/:serverId`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { serverId } = req.params;
    const { server_name, server_ip, server_port, channel_id, emoji } = req.body;

    if (!server_name || !server_ip || !channel_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      await dbRun(
        "UPDATE samp_trackers SET server_name = ?, server_ip = ?, server_port = ?, channel_id = ?, emoji = ? WHERE guild_id = ? AND server_id = ?",
        [server_name, server_ip, server_port || 7777, channel_id, emoji || "🎮", bot.guild_id, serverId]
      );

      // Restart tracker if it was running
      const trackerKey = `${bot.guild_id}:${serverId}`;
      if (client.sampTrackers && client.sampTrackers.has(trackerKey)) {
        const oldTracker = client.sampTrackers.get(trackerKey);
        const wasEnabled = oldTracker.enabled;
        oldTracker.stop();
        client.sampTrackers.delete(trackerKey);

        if (wasEnabled) {
          const tracker = new SAMPStatusTracker(client, {
            guildId: bot.guild_id,
            serverId: serverId,
            serverName: server_name,
            serverIp: server_ip,
            serverPort: server_port || 7777,
            channelId: channel_id,
            emoji: emoji || "🎮",
          });
          tracker.start();
          client.sampTrackers.set(trackerKey, tracker);
        }
      }

      return res.json({ ok: true, message: "Server updated successfully" });
    } catch (e) {
      console.error("Update SAMP server error:", e);
      return res.status(500).json({ error: e?.message || "Failed to update server" });
    }
  });

  // Remove SAMP server
  router.delete(`${PANEL_BASE}/api/bot/:botKey/samp-servers/:serverId`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { serverId } = req.params;

    try {
      const trackerKey = `${bot.guild_id}:${serverId}`;
      if (client.sampTrackers && client.sampTrackers.has(trackerKey)) {
        const tracker = client.sampTrackers.get(trackerKey);
        tracker.stop();
        client.sampTrackers.delete(trackerKey);
      }

      const result = await dbRun(
        "DELETE FROM samp_trackers WHERE guild_id = ? AND server_id = ?",
        [bot.guild_id, serverId]
      );

      if (result.changes === 0) {
        return res.status(404).json({ error: "Server not found" });
      }

      return res.json({ ok: true, message: "Server removed successfully" });
    } catch (e) {
      console.error("Remove SAMP server error:", e);
      return res.status(500).json({ error: e?.message || "Failed to remove server" });
    }
  });

  // Start SAMP server tracker
  router.post(`${PANEL_BASE}/api/bot/:botKey/samp-servers/:serverId/start`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { serverId } = req.params;

    try {
      const server = await dbGet(
        "SELECT * FROM samp_trackers WHERE guild_id = ? AND server_id = ?",
        [bot.guild_id, serverId]
      );

      if (!server) {
        return res.status(404).json({ error: "Server not found" });
      }

      const trackerKey = `${bot.guild_id}:${serverId}`;
      if (client.sampTrackers && client.sampTrackers.has(trackerKey)) {
        client.sampTrackers.get(trackerKey).stop();
      }

      const tracker = new SAMPStatusTracker(client, {
        serverIp: server.server_ip,
        serverPort: server.server_port,
        channelId: server.channel_id,
        serverName: server.server_name,
        emoji: server.emoji,
      });

      await tracker.start();

      if (!client.sampTrackers) client.sampTrackers = new Map();
      client.sampTrackers.set(trackerKey, tracker);

      await dbRun(
        "UPDATE samp_trackers SET enabled = 1 WHERE guild_id = ? AND server_id = ?",
        [bot.guild_id, serverId]
      );

      return res.json({ ok: true, message: "Server started successfully" });
    } catch (e) {
      console.error("Start SAMP server error:", e);
      return res.status(500).json({ error: e?.message || "Failed to start server" });
    }
  });

  // Stop SAMP server tracker
  router.post(`${PANEL_BASE}/api/bot/:botKey/samp-servers/:serverId/stop`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { serverId } = req.params;

    try {
      const trackerKey = `${bot.guild_id}:${serverId}`;
      if (client.sampTrackers && client.sampTrackers.has(trackerKey)) {
        const tracker = client.sampTrackers.get(trackerKey);
        tracker.stop();
        client.sampTrackers.delete(trackerKey);
      }

      await dbRun(
        "UPDATE samp_trackers SET enabled = 0 WHERE guild_id = ? AND server_id = ?",
        [bot.guild_id, serverId]
      );

      return res.json({ ok: true, message: "Server stopped successfully" });
    } catch (e) {
      console.error("Stop SAMP server error:", e);
      return res.status(500).json({ error: e?.message || "Failed to stop server" });
    }
  });

  // Force refresh SAMP server tracker
  router.post(`${PANEL_BASE}/api/bot/:botKey/samp-servers/:serverId/refresh`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { serverId } = req.params;

    try {
      const trackerKey = `${bot.guild_id}:${serverId}`;
      if (!client.sampTrackers || !client.sampTrackers.has(trackerKey)) {
        return res.status(400).json({ error: "Server tracker is not running" });
      }

      const tracker = client.sampTrackers.get(trackerKey);

      const status = await tracker.getStatus();
      await tracker.forceUpdate();

      return res.json({
        ok: true,
        message: "Server refreshed successfully",
        status: status,
      });
    } catch (e) {
      console.error("Refresh SAMP server error:", e);
      return res.status(500).json({ error: e?.message || "Failed to refresh server" });
    }
  });

  return router;
}

module.exports = { createSampServersRouter };
