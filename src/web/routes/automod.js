const { Router } = require("express");
const { invalidateBannedWordsCache } = require("../../features/security-pipeline");

function createAutomodRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, requireAdmin, bots, dbRun, dbAll } = ctx;

  router.get(`${PANEL_BASE}/api/:botKey/automod`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const rows = await dbAll(
        `SELECT word, case_sensitive, added_by, added_at FROM banned_words WHERE guild_id = ?`,
        [bot.guild_id]
      );
      return res.json({ words: rows });
    } catch (e) {
      console.error("Get banned words error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get banned words" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/automod`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const word = req.body?.word?.toLowerCase();
    const caseSensitive = req.body?.case_sensitive || false;

    if (!word) return res.status(400).json({ error: "word required" });

    try {
      await dbRun(
        `INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, ?)`,
        [bot.guild_id, word, caseSensitive ? 1 : 0]
      );
      invalidateBannedWordsCache(bot.guild_id);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Add banned word error:", e);
      return res.status(500).json({ error: e?.message || "Failed to add word" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/automod/:word`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const word = decodeURIComponent(req.params.word).toLowerCase();

    try {
      await dbRun(
        `DELETE FROM banned_words WHERE guild_id = ? AND word = ?`,
        [bot.guild_id, word]
      );
      invalidateBannedWordsCache(bot.guild_id);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Remove banned word error:", e);
      return res.status(500).json({ error: e?.message || "Failed to remove word" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/automod`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      await dbRun(`DELETE FROM banned_words WHERE guild_id = ?`, [bot.guild_id]);
      invalidateBannedWordsCache(bot.guild_id);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Clear banned words error:", e);
      return res.status(500).json({ error: e?.message || "Failed to clear banned words" });
    }
  });

  return router;
}

module.exports = { createAutomodRouter };
