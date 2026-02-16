const { Router } = require("express");

function createAccuracyRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, apiLimiter, db, client } = ctx;

  router.post(`${PANEL_BASE}/api/accuracy/reconcile`, requireAuth, async (req, res) => {
    try {
      const { guildId } = req.body;
      if (!guildId) return res.json({ success: false, error: "Missing guild ID" });

      const { reconcileGuild } = require("../../features/reconciliation");
      const result = await reconcileGuild(db, guildId);
      res.json({ success: true, result });
    } catch (err) {
      console.error("[API Reconciliation] Error:", err);
      res.json({ success: false, error: err.message });
    }
  });

  router.post(`${PANEL_BASE}/api/accuracy/fullsync`, requireAuth, async (req, res) => {
    try {
      const { guildId } = req.body;
      if (!guildId) return res.json({ success: false, error: "Missing guild ID" });

      const { reconcileGuild, reconcileAllGuilds } = require("../../features/reconciliation");
      const result = guildId ? await reconcileGuild(db, guildId) : await reconcileAllGuilds(db, client);
      res.json({ success: true, result });
    } catch (err) {
      console.error("[API Full Sync] Error:", err);
      res.json({ success: false, error: err.message });
    }
  });

  router.get(`${PANEL_BASE}/api/accuracy/trace/message`, requireAuth, apiLimiter, async (req, res) => {
    try {
      const { guildId, messageId, limit } = req.query;
      const { getMessageTrace } = require("../../features/message-counting-debug");
      const out = await getMessageTrace(db, guildId || null, messageId, limit ? Number(limit) : 50);
      return res.json({ ok: true, trace: out });
    } catch (err) {
      console.error("[API Trace Message] Error:", err);
      return res.status(400).json({ ok: false, error: err.message || "Failed to trace message" });
    }
  });

  router.get(`${PANEL_BASE}/api/accuracy/trace/user`, requireAuth, apiLimiter, async (req, res) => {
    try {
      const { guildId, userId, limit } = req.query;
      const { getUserTrace } = require("../../features/message-counting-debug");
      const out = await getUserTrace(db, guildId || null, userId, limit ? Number(limit) : 50);
      return res.json({ ok: true, trace: out });
    } catch (err) {
      console.error("[API Trace User] Error:", err);
      return res.status(400).json({ ok: false, error: err.message || "Failed to trace user" });
    }
  });

  return router;
}

module.exports = { createAccuracyRouter };
