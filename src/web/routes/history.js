const { Router } = require("express");

function createHistoryRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, bots, dbRun, dbGet, dbAll, performUndo } = ctx;

  router.get(`${PANEL_BASE}/api/bot/:botKey/history`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const limit = Math.min(parseInt(req.query?.limit) || 50, 100);

    try {
      const rows = await dbAll(
        `SELECT * FROM operation_history WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?`,
        [bot.guild_id, limit]
      );
      return res.json({ operations: rows });
    } catch (e) {
      console.error("Get history error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get history" });
    }
  });

  router.post(`${PANEL_BASE}/api/bot/:botKey/history/:id/undo`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const operationId = parseInt(req.params.id);

    try {
      const row = await dbGet(
        `SELECT * FROM operation_history WHERE id = ? AND guild_id = ? AND undone = 0`,
        [operationId, bot.guild_id]
      );

      if (!row) return res.status(404).json({ error: "Operation not found or already undone" });

      await performUndo(row);
      await dbRun(`UPDATE operation_history SET undone = 1 WHERE id = ?`, [operationId]);

      return res.json({ ok: true });
    } catch (e) {
      console.error("Undo operation error:", e);
      return res.status(500).json({ error: e?.message || "Failed to undo operation" });
    }
  });

  return router;
}

module.exports = { createHistoryRouter };
