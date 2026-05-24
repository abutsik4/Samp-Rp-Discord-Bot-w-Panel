const { Router } = require("express");

function createNexusRouter(ctx) {
  const router = Router();
  const { db, dbRun, dbGet, dbAll, requireAuth, apiLimiter } = ctx;

  // ── Gangs ─────────────────────────────────────────────
  router.get("/panel/api/gameplay/gangs", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const list = await dbAll(
        `SELECT g.id, g.name, g.tag, g.leader_id, g.treasury, g.created_at,
                e.level, e.xp, e.color, e.perks_json,
                (SELECT COUNT(*) FROM samp_gang_members WHERE gang_id = g.id) as memberCount,
                (SELECT COUNT(*) FROM samp_gang_territories WHERE gang_id = g.id) as territories
         FROM samp_gangs g
         LEFT JOIN samp_gang_evolution e ON e.gang_id = g.id
         ORDER BY g.treasury DESC, e.xp DESC`
      );
      const wars = await dbAll(
        `SELECT id, attacker_gang_id, defender_gang_id, status, started_at, stake
         FROM samp_gang_wars WHERE status = 'active' ORDER BY started_at DESC`
      );
      // Resolve gang names for wars
      const enrichedWars = [];
      for (const w of wars || []) {
        const a = await dbGet(`SELECT name FROM samp_gangs WHERE id = ?`, [w.attacker_gang_id]);
        const d = await dbGet(`SELECT name FROM samp_gangs WHERE id = ?`, [w.defender_gang_id]);
        enrichedWars.push({ ...w, attackerName: a?.name || "?", defenderName: d?.name || "?" });
      }
      const top = list.slice(0, 10);
      return res.json({ list: list || [], top, wars: { active: enrichedWars } });
    } catch (e) {
      console.error("Nexus gangs error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Territories ───────────────────────────────────────
  router.get("/panel/api/gameplay/territories", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const rows = await dbAll(
        `SELECT t.id, t.district_id, t.gang_id, t.pressure, t.revenue, t.updated_at,
                g.name as gangName, g.color as gangColor
         FROM samp_gang_territories t
         LEFT JOIN samp_gangs g ON g.id = t.gang_id
         ORDER BY t.district_id`
      );
      return res.json({ list: rows || [] });
    } catch (e) {
      console.error("Nexus territories error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Wars ──────────────────────────────────────────────
  router.get("/panel/api/gameplay/wars", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const active = await dbAll(
        `SELECT id, attacker_gang_id, defender_gang_id, status, started_at, stake
         FROM samp_gang_wars WHERE status = 'active' ORDER BY started_at DESC`
      );
      const history = await dbAll(
        `SELECT id, attacker_gang_id, defender_gang_id, winner_gang_id, status, started_at, ended_at, stake
         FROM samp_gang_wars WHERE status != 'active' ORDER BY ended_at DESC LIMIT 20`
      );
      return res.json({ active: active || [], history: history || [] });
    } catch (e) {
      console.error("Nexus wars error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Ledger Summary ────────────────────────────────────
  router.get("/panel/api/gameplay/ledger-summary", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const totalCash = await dbGet(`SELECT SUM(cash) as v FROM samp_users`);
      const totalBank = await dbGet(`SELECT SUM(bank) as v FROM samp_users`);
      const dailyVolume = await dbGet(
        `SELECT COALESCE(SUM(ABS(amount)),0) as v FROM samp_ledger WHERE created_at > datetime('now','-1 day')`
      );
      const recent = await dbAll(
        `SELECT id, type, from_user, to_user, amount, meta_json, created_at
         FROM samp_ledger ORDER BY created_at DESC LIMIT 50`
      );
      const recentHeists = await dbAll(
        `SELECT id, from_user as gangName, amount as payout, created_at
         FROM samp_ledger WHERE type = 'heist' ORDER BY created_at DESC LIMIT 10`
      );
      return res.json({
        totalCash: totalCash?.v || 0,
        totalBank: totalBank?.v || 0,
        dailyVolume: dailyVolume?.v || 0,
        recent: recent || [],
        recentHeists: recentHeists || []
      });
    } catch (e) {
      console.error("Nexus ledger error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Stocks ────────────────────────────────────────────
  router.get("/panel/api/gameplay/stocks", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const rows = await dbAll(
        `SELECT s.symbol, s.name, p.price, p.change_pct as change, v.volume
         FROM samp_stocks s
         LEFT JOIN samp_stock_prices p ON p.symbol = s.symbol
         LEFT JOIN samp_stock_daily_volume v ON v.symbol = s.symbol AND v.date = date('now')
         ORDER BY s.symbol`
      );
      return res.json({ list: rows || [] });
    } catch (e) {
      console.error("Nexus stocks error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Casino Games (stub metadata) ──────────────────────
  router.get("/panel/api/gameplay/casino-games", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const rows = await dbAll(`SELECT DISTINCT game FROM samp_chip_ledger ORDER BY game`);
      const list = (rows || []).map((r, i) => ({
        id: i,
        name: r.game || "Unknown",
        players: 0,
        maxWin: 0
      }));
      return res.json({ list });
    } catch (e) {
      console.error("Nexus casino games error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Casino Leaderboard ────────────────────────────────
  router.get("/panel/api/gameplay/casino-leaderboard", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const rows = await dbAll(
        `SELECT user_id, SUM(CASE WHEN amount > 0 THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END) as losses,
                SUM(amount) as profit
         FROM samp_chip_ledger
         GROUP BY user_id
         ORDER BY profit DESC
         LIMIT 20`
      );
      return res.json({ list: rows || [] });
    } catch (e) {
      console.error("Nexus casino leaderboard error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Casino History ────────────────────────────────────
  router.get("/panel/api/gameplay/casino-history", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const rows = await dbAll(
        `SELECT id, user_id, game, amount, result, created_at
         FROM samp_chip_ledger ORDER BY created_at DESC LIMIT 50`
      );
      return res.json({ list: rows || [] });
    } catch (e) {
      console.error("Nexus casino history error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Materials ─────────────────────────────────────────
  router.get("/panel/api/gameplay/materials", requireAuth, apiLimiter, async (_req, res) => {
    try {
      const rows = await dbAll(
        `SELECT material_id as id, material_name as name, SUM(qty) as stock
         FROM samp_crafting_inventory GROUP BY material_id, material_name`
      );
      return res.json({ list: rows || [] });
    } catch (e) {
      console.error("Nexus materials error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Recipes ────────────────────────────────────────────
  router.get("/panel/api/gameplay/recipes", requireAuth, apiLimiter, async (_req, res) => {
    try {
      // samp_crafting_ledger may hold recipe-like data; for now return empty
      return res.json({ list: [] });
    } catch (e) {
      console.error("Nexus recipes error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  // ── Crafting Queue ────────────────────────────────────
  router.get("/panel/api/gameplay/crafting-queue", requireAuth, apiLimiter, async (_req, res) => {
    try {
      return res.json({ items: [] });
    } catch (e) {
      console.error("Nexus queue error:", e);
      return res.status(500).json({ error: e?.message || "Failed" });
    }
  });

  return router;
}

module.exports = { createNexusRouter };
