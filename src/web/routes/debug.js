const { Router } = require("express");

function createDebugRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, requireAdmin, apiLimiter,
    dbRun, dbGet, dbAll,
    client, bots, panelHttpLogger,
  } = ctx;

  router.get("/health", (req, res) => res.json({ ok: true }));

  // In-browser panel debug overlay report ingestion
  router.post(`${PANEL_BASE}/api/debug/report`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    try {
      const report = req.body?.report;
      if (!report || typeof report !== "object") return res.status(400).json({ error: "report object is required" });

      const reportJson = JSON.stringify(report);
      if (reportJson.length > 100_000) return res.status(413).json({ error: "report too large" });

      const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
      const ua = (req.headers["user-agent"] || "").toString().slice(0, 500);
      const updatedBy = req.session?.user?.username || null;

      await dbRun(
        `INSERT INTO panel_debug_reports (created_at, updated_by, ip, user_agent, url, client_trace_id, server_trace_id, report_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          new Date().toISOString(),
          updatedBy,
          ip,
          ua,
          String(report.url || "").slice(0, 2000),
          String(report.clientTraceId || "").slice(0, 120) || null,
          req.traceId || null,
          reportJson,
        ]
      );

      panelHttpLogger.info("Panel debug report saved", { traceId: req.traceId, updatedBy, url: report.url || null });
      return res.json({ ok: true, traceId: req.traceId });
    } catch (e) {
      panelHttpLogger.error("Panel debug report error", { traceId: req.traceId, error: e?.message || String(e) });
      return res.status(500).json({ error: e?.message || "Failed to save report" });
    }
  });

  // Debug reports viewer APIs
  router.get(`${PANEL_BASE}/api/debug/reports`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit || 50, 10), 1), 200);
      const offset = Math.max(parseInt(req.query.offset || 0, 10), 0);
      const search = String(req.query.search || "").trim().toLowerCase();

      let sql = `
        SELECT id, created_at, updated_by, url, client_trace_id, server_trace_id
        FROM panel_debug_reports
      `;
      const params = [];

      let countSql = `SELECT COUNT(*) as total FROM panel_debug_reports`;
      const countParams = [];
      if (search) {
        const where = ` WHERE (LOWER(COALESCE(updated_by,'')) LIKE ? OR LOWER(COALESCE(url,'')) LIKE ? OR LOWER(COALESCE(client_trace_id,'')) LIKE ? OR LOWER(COALESCE(server_trace_id,'')) LIKE ?)`;
        sql += where;
        countSql += where;
        const like = `%${search}%`;
        params.push(like, like, like, like);
        countParams.push(like, like, like, like);
      }
      sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = await dbAll(sql, params);
      const totalRow = await dbGet(countSql, countParams);
      return res.json({
        ok: true,
        reports: rows || [],
        pagination: { offset, limit, total: totalRow?.total || 0 }
      });
    } catch (e) {
      panelHttpLogger.error("List debug reports error", { traceId: req.traceId, error: e?.message || String(e) });
      return res.status(500).json({ error: e?.message || "Failed to list debug reports" });
    }
  });

  router.get(`${PANEL_BASE}/api/debug/reports/:id`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });

      const row = await dbGet(
        `SELECT id, created_at, updated_by, ip, user_agent, url, client_trace_id, server_trace_id, report_json
         FROM panel_debug_reports
         WHERE id = ?`,
        [id]
      );
      if (!row) return res.status(404).json({ error: "Not found" });

      let parsed = null;
      try { parsed = JSON.parse(row.report_json); } catch (_) { parsed = row.report_json; }

      return res.json({
        ok: true,
        report: {
          id: row.id,
          created_at: row.created_at,
          updated_by: row.updated_by,
          ip: row.ip,
          user_agent: row.user_agent,
          url: row.url,
          client_trace_id: row.client_trace_id,
          server_trace_id: row.server_trace_id,
          data: parsed,
        },
      });
    } catch (e) {
      panelHttpLogger.error("Get debug report error", { traceId: req.traceId, error: e?.message || String(e) });
      return res.status(500).json({ error: e?.message || "Failed to fetch debug report" });
    }
  });

  // Public status endpoint with CORS for landing page at jepsencloud.com
  router.get("/api/status", (req, res) => {
    // Allow CORS from any origin for public status
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    
    const isReady = client && client.isReady();
    
    // Get bot info
    const botInfo = isReady ? {
      username: client.user?.username || "Unknown",
      discriminator: client.user?.discriminator || "0",
      id: client.user?.id || null,
      avatar: client.user?.displayAvatarURL({ size: 64 }) || null
    } : null;
    
    // Get guilds (servers) the bot is in
    const guilds = isReady ? client.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      icon: g.iconURL({ size: 64 })
    })) : [];
    
    // Uptime
    const uptime = isReady && client.uptime ? client.uptime : 0;
    
    // Helper to format uptime
    function formatUptime(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    }
    
    res.json({
      ok: true,
      bot: {
        online: isReady,
        info: botInfo,
        guilds: guilds,
        guildCount: guilds.length,
        uptime: uptime > 0 ? formatUptime(uptime) : "N/A",
        uptimeMs: uptime,
        ping: isReady ? client.ws.ping : null
      },
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

module.exports = { createDebugRouter };
