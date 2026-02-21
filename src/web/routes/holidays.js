const { Router } = require("express");
const { panelList: holidaysPanelList, panelAdd: holidaysPanelAdd, panelRemove: holidaysPanelRemove } = require("../../features/holidays");

function createHolidaysRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, requireAdmin, apiLimiter, bots, db,
  } = ctx;

  router.get(`${PANEL_BASE}/api/:botKey/holidays`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const iso = String(req.query.date || "").trim();
    const date = iso || new Date().toISOString().slice(0, 10);

    try {
      const items = await holidaysPanelList(db, date);
      return res.json({ ok: true, date, items });
    } catch (e) {
      console.error("holidays list error:", e);
      return res.status(400).json({ error: e?.message || "Failed to list holidays" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/holidays`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const date = String(req.body?.date || "").trim();
    const title = String(req.body?.title || "").trim();
    const note = String(req.body?.note || "").trim();

    if (!date) return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    if (!title) return res.status(400).json({ error: "title is required" });

    try {
      const items = await holidaysPanelAdd(db, date, title, note);
      return res.json({ ok: true, date, items });
    } catch (e) {
      console.error("holidays add error:", e);
      return res.status(400).json({ error: e?.message || "Failed to add holiday" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/holidays/:id`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const id = Number.parseInt(String(req.params.id || ""), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

    try {
      await holidaysPanelRemove(db, id);
      return res.json({ ok: true });
    } catch (e) {
      console.error("holidays delete error:", e);
      return res.status(400).json({ error: e?.message || "Failed to delete holiday" });
    }
  });

  return router;
}

module.exports = { createHolidaysRouter };
