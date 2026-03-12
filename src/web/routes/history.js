const { Router } = require("express");

function apiError(res, req, status, code, message, details) {
  const error = {
    code,
    message,
    traceId: req.traceId || null,
  };
  if (details != null) error.details = details;
  return res.status(status).json({ ok: false, error });
}

function createHistoryRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, requireAdmin, bots, dbRun, dbGet, dbAll, performUndo } = ctx;

  router.get(`${PANEL_BASE}/api/:botKey/history`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return apiError(res, req, 404, "PANEL_BOT_NOT_FOUND", "Bot not found");

    const limit = Math.min(parseInt(req.query?.limit) || 50, 100);

    try {
      const rows = await dbAll(
        `SELECT * FROM operation_history WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [bot.guild_id, limit]
      );
      return res.json({ operations: rows });
    } catch (e) {
      console.error("Get history error:", e);
      return apiError(res, req, 500, "OPS_HISTORY_LOAD_FAILED", e?.message || "Failed to get history");
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/history/:id/undo`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return apiError(res, req, 404, "PANEL_BOT_NOT_FOUND", "Bot not found");

    const operationId = parseInt(req.params.id);

    try {
      const row = await dbGet(
        `SELECT * FROM operation_history WHERE id = ? AND guild_id = ? AND undone = 0`,
        [operationId, bot.guild_id]
      );

      if (!row) {
        return apiError(res, req, 404, "OPS_UNDO_TARGET_NOT_FOUND", "Operation not found or already undone");
      }

      await performUndo(row);
      await dbRun(`UPDATE operation_history SET undone = 1 WHERE id = ?`, [operationId]);

      return res.json({ ok: true });
    } catch (e) {
      console.error("Undo operation error:", e);
      return apiError(res, req, 500, "OPS_UNDO_FAILED", e?.message || "Failed to undo operation");
    }
  });

  return router;
}

module.exports = { createHistoryRouter };
