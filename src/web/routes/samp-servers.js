const { Router } = require("express");
const { SAMPStatusTracker } = require("../../features/samp-status");

// Bounds for per-tracker timings.
const POLL_MIN_MS = 10 * 1000;            // 10s
const POLL_MAX_MS = 60 * 60 * 1000;       // 1h
const POLL_DEFAULT_MS = 2 * 60 * 1000;    // 2 min
const COOLDOWN_MIN_MS = 60 * 1000;        // 1 min
const COOLDOWN_MAX_MS = 30 * 60 * 1000;   // 30 min
const COOLDOWN_DEFAULT_MS = 2 * 60 * 1000;
const MAX_TEXT_LEN = 64;
const MAX_FORMAT_LEN = 200;

/**
 * Validate and normalize optional per-tracker settings.
 * Returns { ok: true, value: { custom_online_text, custom_offline_text, poll_interval_ms, rename_cooldown_ms, name_format } }
 *        or { ok: false, error: string }
 * Empty strings / nulls are normalized to null (which means "use default").
 */
function normalizeSettings(input) {
  const out = {
    custom_online_text: null,
    custom_offline_text: null,
    poll_interval_ms: null,
    rename_cooldown_ms: null,
    name_format: null,
  };
  if (!input || typeof input !== "object") return { ok: true, value: out };

  if (input.custom_online_text !== undefined) {
    const v = String(input.custom_online_text || "").trim();
    if (v.length > MAX_TEXT_LEN) return { ok: false, error: `custom_online_text too long (max ${MAX_TEXT_LEN})` };
    out.custom_online_text = v.length > 0 ? v : null;
  }
  if (input.custom_offline_text !== undefined) {
    const v = String(input.custom_offline_text || "").trim();
    if (v.length > MAX_TEXT_LEN) return { ok: false, error: `custom_offline_text too long (max ${MAX_TEXT_LEN})` };
    out.custom_offline_text = v.length > 0 ? v : null;
  }
  if (input.poll_interval_ms !== undefined && input.poll_interval_ms !== null && input.poll_interval_ms !== "") {
    const n = Number(input.poll_interval_ms);
    if (!Number.isFinite(n)) return { ok: false, error: "poll_interval_ms must be a number" };
    out.poll_interval_ms = Math.max(POLL_MIN_MS, Math.min(POLL_MAX_MS, Math.round(n)));
  }
  if (input.rename_cooldown_ms !== undefined && input.rename_cooldown_ms !== null && input.rename_cooldown_ms !== "") {
    const n = Number(input.rename_cooldown_ms);
    if (!Number.isFinite(n)) return { ok: false, error: "rename_cooldown_ms must be a number" };
    out.rename_cooldown_ms = Math.max(COOLDOWN_MIN_MS, Math.min(COOLDOWN_MAX_MS, Math.round(n)));
  }
  if (input.name_format !== undefined) {
    const v = String(input.name_format || "").trim();
    if (v.length > MAX_FORMAT_LEN) return { ok: false, error: `name_format too long (max ${MAX_FORMAT_LEN})` };
    out.name_format = v.length > 0 ? v : null;
  }

  return { ok: true, value: out };
}

/**
 * Build the tracker config object from a DB row, falling back to defaults.
 * Used when instantiating SAMPStatusTracker from a row.
 */
function trackerConfigFromRow(row) {
  return {
    serverIp: row.server_ip,
    serverPort: row.server_port,
    channelId: row.channel_id,
    serverName: row.server_name,
    emoji: row.emoji,
    custom_online_text: row.custom_online_text || null,
    custom_offline_text: row.custom_offline_text || null,
    poll_interval_ms: row.poll_interval_ms || POLL_DEFAULT_MS,
    rename_cooldown_ms: row.rename_cooldown_ms || COOLDOWN_DEFAULT_MS,
    name_format: row.name_format || null,
  };
}

function createSampServersRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, requireAdmin, bots, client, db, dbRun, dbGet, dbAll } = ctx;

  // Get SAMP servers list
  router.get(`${PANEL_BASE}/api/:botKey/samp-servers`, requireAuth, async (req, res) => {
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
  router.post(`${PANEL_BASE}/api/:botKey/samp-servers`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { server_id, server_name, server_ip, server_port, channel_id, emoji } = req.body;

    if (!server_id || !server_name || !server_ip || !channel_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const settingsCheck = normalizeSettings(req.body);
    if (!settingsCheck.ok) return res.status(400).json({ error: settingsCheck.error });
    const s = settingsCheck.value;

    try {
      const existing = await dbGet(
        "SELECT * FROM samp_trackers WHERE guild_id = ? AND server_id = ?",
        [bot.guild_id, server_id]
      );

      if (existing) {
        return res.status(400).json({ error: "Server ID already exists" });
      }

      await dbRun(
        `INSERT INTO samp_trackers (guild_id, server_id, server_name, server_ip, server_port, channel_id, emoji, enabled, custom_online_text, custom_offline_text, poll_interval_ms, rename_cooldown_ms, name_format)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
        [
          bot.guild_id, server_id, server_name, server_ip, server_port || 7777, channel_id, emoji || "🎮",
          s.custom_online_text, s.custom_offline_text, s.poll_interval_ms, s.rename_cooldown_ms, s.name_format,
        ]
      );

      const tracker = new SAMPStatusTracker(client, {
        serverIp: server_ip,
        serverPort: server_port || 7777,
        channelId: channel_id,
        serverName: server_name,
        emoji: emoji || "🎮",
        custom_online_text: s.custom_online_text,
        custom_offline_text: s.custom_offline_text,
        poll_interval_ms: s.poll_interval_ms || POLL_DEFAULT_MS,
        rename_cooldown_ms: s.rename_cooldown_ms || COOLDOWN_DEFAULT_MS,
        name_format: s.name_format,
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

  // Update SAMP server settings only (does not change server_id, server_ip, channel_id, etc.)
  router.put(`${PANEL_BASE}/api/:botKey/samp-servers/:serverId/settings`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { serverId } = req.params;
    const settingsCheck = normalizeSettings(req.body);
    if (!settingsCheck.ok) return res.status(400).json({ error: settingsCheck.error });
    const s = settingsCheck.value;

    try {
      const existing = await dbGet(
        "SELECT * FROM samp_trackers WHERE guild_id = ? AND server_id = ?",
        [bot.guild_id, serverId]
      );
      if (!existing) return res.status(404).json({ error: "Server not found" });

      // Persist the new settings (NULL means "use default" — we keep the old value if not provided in body)
      const next = {
        custom_online_text: s.custom_online_text !== null ? s.custom_online_text : existing.custom_online_text,
        custom_offline_text: s.custom_offline_text !== null ? s.custom_offline_text : existing.custom_offline_text,
        poll_interval_ms: s.poll_interval_ms !== null ? s.poll_interval_ms : (existing.poll_interval_ms || POLL_DEFAULT_MS),
        rename_cooldown_ms: s.rename_cooldown_ms !== null ? s.rename_cooldown_ms : (existing.rename_cooldown_ms || COOLDOWN_DEFAULT_MS),
        name_format: s.name_format !== null ? s.name_format : existing.name_format,
      };

      await dbRun(
        `UPDATE samp_trackers SET custom_online_text = ?, custom_offline_text = ?, poll_interval_ms = ?, rename_cooldown_ms = ?, name_format = ? WHERE guild_id = ? AND server_id = ?`,
        [next.custom_online_text, next.custom_offline_text, next.poll_interval_ms, next.rename_cooldown_ms, next.name_format, bot.guild_id, serverId]
      );

      // Hot-update the running tracker (if any) without restart.
      const trackerKey = `${bot.guild_id}:${serverId}`;
      if (client.sampTrackers && client.sampTrackers.has(trackerKey)) {
        client.sampTrackers.get(trackerKey).setConfig({
          custom_online_text: next.custom_online_text,
          custom_offline_text: next.custom_offline_text,
          poll_interval_ms: next.poll_interval_ms,
          rename_cooldown_ms: next.rename_cooldown_ms,
          name_format: next.name_format,
        });
        // Force a refresh so the new name/format shows up immediately
        client.sampTrackers.get(trackerKey).forceUpdate().catch(() => {});
      }

      return res.json({ ok: true, message: "Settings updated", settings: next });
    } catch (e) {
      console.error("Update SAMP server settings error:", e);
      return res.status(500).json({ error: e?.message || "Failed to update settings" });
    }
  });

  // Update SAMP server
  router.put(`${PANEL_BASE}/api/:botKey/samp-servers/:serverId`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { serverId } = req.params;
    const { server_name, server_ip, server_port, channel_id, emoji } = req.body;

    if (!server_name || !server_ip || !channel_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const settingsCheck = normalizeSettings(req.body);
    if (!settingsCheck.ok) return res.status(400).json({ error: settingsCheck.error });
    const s = settingsCheck.value;

    try {
      // Preserve existing settings if not provided
      const existing = await dbGet(
        "SELECT * FROM samp_trackers WHERE guild_id = ? AND server_id = ?",
        [bot.guild_id, serverId]
      );
      if (!existing) return res.status(404).json({ error: "Server not found" });

      const next = {
        custom_online_text: s.custom_online_text !== null ? s.custom_online_text : existing.custom_online_text,
        custom_offline_text: s.custom_offline_text !== null ? s.custom_offline_text : existing.custom_offline_text,
        poll_interval_ms: s.poll_interval_ms !== null ? s.poll_interval_ms : (existing.poll_interval_ms || POLL_DEFAULT_MS),
        rename_cooldown_ms: s.rename_cooldown_ms !== null ? s.rename_cooldown_ms : (existing.rename_cooldown_ms || COOLDOWN_DEFAULT_MS),
        name_format: s.name_format !== null ? s.name_format : existing.name_format,
      };

      await dbRun(
        "UPDATE samp_trackers SET server_name = ?, server_ip = ?, server_port = ?, channel_id = ?, emoji = ?, custom_online_text = ?, custom_offline_text = ?, poll_interval_ms = ?, rename_cooldown_ms = ?, name_format = ? WHERE guild_id = ? AND server_id = ?",
        [
          server_name, server_ip, server_port || 7777, channel_id, emoji || "🎮",
          next.custom_online_text, next.custom_offline_text, next.poll_interval_ms, next.rename_cooldown_ms, next.name_format,
          bot.guild_id, serverId
        ]
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
            serverIp: server_ip,
            serverPort: server_port || 7777,
            channelId: channel_id,
            serverName: server_name,
            emoji: emoji || "🎮",
            custom_online_text: next.custom_online_text,
            custom_offline_text: next.custom_offline_text,
            poll_interval_ms: next.poll_interval_ms,
            rename_cooldown_ms: next.rename_cooldown_ms,
            name_format: next.name_format,
          });
          await tracker.start();
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
  router.delete(`${PANEL_BASE}/api/:botKey/samp-servers/:serverId`, requireAuth, requireAdmin, async (req, res) => {
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
  router.post(`${PANEL_BASE}/api/:botKey/samp-servers/:serverId/start`, requireAuth, requireAdmin, async (req, res) => {
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

      const tracker = new SAMPStatusTracker(client, trackerConfigFromRow(server));

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
  router.post(`${PANEL_BASE}/api/:botKey/samp-servers/:serverId/stop`, requireAuth, requireAdmin, async (req, res) => {
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
  router.post(`${PANEL_BASE}/api/:botKey/samp-servers/:serverId/refresh`, requireAuth, requireAdmin, async (req, res) => {
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
