const { Router } = require("express");
const { xpForLevel } = require("../../features/levels");
const {
  BADGE_DEFINITIONS,
  getBadgeDefinitions,
  upsertBadgeDefinition,
  deleteBadgeDefinition,
  seedDefaultBadgeDefinitions,
} = require("../../features/badges");
const { RADIO_STATIONS } = require("../../features/radio-vote");
const { listPerkRules, upsertPerkRule, deletePerkRule, reconcilePerksForGuild } = require("../../features/perks");
const {
  listXpRoleMultipliers,
  upsertXpRoleMultiplier,
  deleteXpRoleMultiplier,
} = require("../../features/xp-multipliers");

function createGameplayRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, requireAdmin, apiLimiter, bots, dbRun, dbGet, dbAll, client } = ctx;

  function resolveBot(req, res) {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) {
      res.status(404).json({ error: "Bot not found" });
      return null;
    }
    return bot;
  }

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/levels`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);
    const search = String(req.query.search || "").trim();

    try {
      let rows;
      if (search) {
        rows = await dbAll(
          `SELECT user_id, xp, level, last_xp_at
           FROM user_levels
           WHERE guild_id = ? AND user_id LIKE ?
           ORDER BY xp DESC
           LIMIT ?`,
          [bot.guild_id, `%${search}%`, limit]
        );
      } else {
        rows = await dbAll(
          `SELECT user_id, xp, level, last_xp_at
           FROM user_levels
           WHERE guild_id = ?
           ORDER BY xp DESC
           LIMIT ?`,
          [bot.guild_id, limit]
        );
      }

      return res.json({ items: rows || [] });
    } catch (e) {
      console.error("Gameplay levels list error:", e);
      return res.status(500).json({ error: e?.message || "Failed to list levels" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/levels/set`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    const userId = String(req.body?.userId || "").trim();
    const xpRaw = req.body?.xp;
    const levelRaw = req.body?.level;

    if (!userId) return res.status(400).json({ error: "userId required" });
    if (xpRaw == null && levelRaw == null) return res.status(400).json({ error: "xp or level required" });

    let xp = Number.isFinite(Number(xpRaw)) ? Math.max(0, Math.floor(Number(xpRaw))) : null;
    let level = Number.isFinite(Number(levelRaw)) ? Math.max(1, Math.floor(Number(levelRaw))) : null;

    if (level != null && xp == null) xp = xpForLevel(level);
    if (xp != null && level == null) {
      let calculated = 1;
      while (xpForLevel(calculated + 1) <= xp) {
        calculated += 1;
        if (calculated > 200) break;
      }
      level = calculated;
    }

    const now = Math.floor(Date.now() / 1000);

    try {
      await dbRun(
        `INSERT INTO user_levels (guild_id, user_id, xp, level, last_xp_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id)
         DO UPDATE SET xp = excluded.xp, level = excluded.level, last_xp_at = excluded.last_xp_at`,
        [bot.guild_id, userId, xp, level, now]
      );
      return res.json({ ok: true, userId, xp, level });
    } catch (e) {
      console.error("Gameplay level set error:", e);
      return res.status(500).json({ error: e?.message || "Failed to set level" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/badges/definitions`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      const items = await getBadgeDefinitions(ctx.db, bot.guild_id, { includeDisabled: true });
      return res.json({ items });
    } catch (e) {
      // Fallback to static definitions if something goes wrong.
      return res.json({ items: BADGE_DEFINITIONS });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/badges/definitions/seed`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const out = await seedDefaultBadgeDefinitions(ctx.db, bot.guild_id);
    return res.json(out);
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/badges/definitions/upsert`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      await upsertBadgeDefinition(ctx.db, bot.guild_id, req.body);
      const items = await getBadgeDefinitions(ctx.db, bot.guild_id, { includeDisabled: true });
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(400).json({ error: e?.message || "Failed to upsert badge definition" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/gameplay/badges/definitions/:badgeId`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      await deleteBadgeDefinition(ctx.db, bot.guild_id, req.params.badgeId);
      const items = await getBadgeDefinitions(ctx.db, bot.guild_id, { includeDisabled: true });
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(400).json({ error: e?.message || "Failed to delete badge definition" });
    }
  });

  // Perk rules (badge/level -> grant_role)
  router.get(`${PANEL_BASE}/api/:botKey/gameplay/perks/rules`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      const items = await listPerkRules(ctx.db, bot.guild_id);
      return res.json({ items });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to list perk rules" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/perks/rules`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      const item = await upsertPerkRule(ctx.db, bot.guild_id, req.body);
      const items = await listPerkRules(ctx.db, bot.guild_id);
      return res.json({ ok: true, item, items });
    } catch (e) {
      return res.status(400).json({ error: e?.message || "Failed to upsert perk rule" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/gameplay/perks/rules/:id`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      await deletePerkRule(ctx.db, bot.guild_id, req.params.id);
      const items = await listPerkRules(ctx.db, bot.guild_id);
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(400).json({ error: e?.message || "Failed to delete perk rule" });
    }
  });

  // XP multipliers (role -> multiplier)
  router.get(`${PANEL_BASE}/api/:botKey/gameplay/xp-multipliers`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      const items = await listXpRoleMultipliers(ctx.db, bot.guild_id);
      return res.json({ items });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to list XP multipliers" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/xp-multipliers`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      const roleId = String(req.body?.roleId || req.body?.role_id || "");
      const multiplier = req.body?.multiplier;
      await upsertXpRoleMultiplier(ctx.db, bot.guild_id, roleId, multiplier);
      const items = await listXpRoleMultipliers(ctx.db, bot.guild_id);
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(400).json({ error: e?.message || "Failed to save XP multiplier" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/gameplay/xp-multipliers/:roleId`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      await deleteXpRoleMultiplier(ctx.db, bot.guild_id, req.params.roleId);
      const items = await listXpRoleMultipliers(ctx.db, bot.guild_id);
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(400).json({ error: e?.message || "Failed to delete XP multiplier" });
    }
  });

  // Reconcile perks now (grants roles for existing earned badges)
  router.post(`${PANEL_BASE}/api/:botKey/gameplay/perks/reconcile`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    try {
      const limit = Number(req.body?.limit || 200);
      const guild = await client.guilds.fetch(bot.guild_id);
      const result = await reconcilePerksForGuild({ db: ctx.db, guild, limit });
      return res.json({ ok: true, result });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to reconcile perks" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/badges/users`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);
    try {
      const rows = await dbAll(
        `SELECT user_id, COUNT(*) as badge_count, MAX(earned_at) as last_earned_at
         FROM user_badges
         WHERE guild_id = ?
         GROUP BY user_id
         ORDER BY badge_count DESC, last_earned_at DESC
         LIMIT ?`,
        [bot.guild_id, limit]
      );
      return res.json({ items: rows || [] });
    } catch (e) {
      console.error("Gameplay badges users error:", e);
      return res.status(500).json({ error: e?.message || "Failed to list badge users" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/badges/user/:userId`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const rows = await dbAll(
        `SELECT badge_id, earned_at
         FROM user_badges
         WHERE guild_id = ? AND user_id = ?
         ORDER BY earned_at DESC`,
        [bot.guild_id, userId]
      );

      const defs = await getBadgeDefinitions(ctx.db, bot.guild_id, { includeDisabled: true });
      const byId = new Map((defs || []).map((d) => [d.id, d]));

      const enriched = (rows || []).map((row) => ({
        ...row,
        definition: byId.get(row.badge_id) || BADGE_DEFINITIONS.find((d) => d.id === row.badge_id) || null,
      }));
      return res.json({ items: enriched });
    } catch (e) {
      console.error("Gameplay user badges error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get user badges" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/badges/user/:userId/grant`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const userId = String(req.params.userId || "").trim();
    const badgeId = String(req.body?.badgeId || "").trim();

    if (!userId) return res.status(400).json({ error: "userId required" });
    if (!badgeId) return res.status(400).json({ error: "badgeId required" });

    try {
      await dbRun(
        `INSERT OR IGNORE INTO user_badges (guild_id, user_id, badge_id)
         VALUES (?, ?, ?)`,
        [bot.guild_id, userId, badgeId]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("Gameplay badge grant error:", e);
      return res.status(500).json({ error: e?.message || "Failed to grant badge" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/gameplay/badges/user/:userId/:badgeId`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const userId = String(req.params.userId || "").trim();
    const badgeId = String(req.params.badgeId || "").trim();
    if (!userId || !badgeId) return res.status(400).json({ error: "userId and badgeId required" });

    try {
      await dbRun(
        `DELETE FROM user_badges WHERE guild_id = ? AND user_id = ? AND badge_id = ?`,
        [bot.guild_id, userId, badgeId]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("Gameplay badge revoke error:", e);
      return res.status(500).json({ error: e?.message || "Failed to revoke badge" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/trivia/leaderboard`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10), 1), 200);

    try {
      const rows = await dbAll(
        `SELECT user_id, correct, total, current_streak, best_streak, total_points
         FROM trivia_scores
         WHERE guild_id = ?
         ORDER BY total_points DESC
         LIMIT ?`,
        [bot.guild_id, limit]
      );
      return res.json({ items: rows || [] });
    } catch (e) {
      console.error("Gameplay trivia leaderboard error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get trivia leaderboard" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/trivia/user/:userId`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const row = await dbGet(
        `SELECT user_id, correct, total, current_streak, best_streak, total_points
         FROM trivia_scores
         WHERE guild_id = ? AND user_id = ?`,
        [bot.guild_id, userId]
      );
      return res.json({ item: row || null });
    } catch (e) {
      console.error("Gameplay trivia user error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get trivia user" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/trivia/reset-user`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const userId = String(req.body?.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      await dbRun(`DELETE FROM trivia_scores WHERE guild_id = ? AND user_id = ?`, [bot.guild_id, userId]);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Gameplay trivia reset error:", e);
      return res.status(500).json({ error: e?.message || "Failed to reset trivia user" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/wanted`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);

    try {
      const rows = await dbAll(
        `SELECT user_id, stars, total_infractions, last_infraction_at
         FROM wanted_stars
         WHERE guild_id = ?
         ORDER BY stars DESC, total_infractions DESC
         LIMIT ?`,
        [bot.guild_id, limit]
      );
      return res.json({ items: rows || [] });
    } catch (e) {
      console.error("Gameplay wanted list error:", e);
      return res.status(500).json({ error: e?.message || "Failed to list wanted users" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/wanted/set`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    const userId = String(req.body?.userId || "").trim();
    const stars = Math.max(0, Math.min(6, parseInt(req.body?.stars || "0", 10)));

    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const now = Math.floor(Date.now() / 1000);
      await dbRun(
        `INSERT INTO wanted_stars (guild_id, user_id, stars, last_infraction_at, last_decay_at, total_infractions)
         VALUES (?, ?, ?, ?, ?, 0)
         ON CONFLICT(guild_id, user_id)
         DO UPDATE SET stars = excluded.stars, last_decay_at = excluded.last_decay_at`,
        [bot.guild_id, userId, stars, now, now]
      );
      return res.json({ ok: true, userId, stars });
    } catch (e) {
      console.error("Gameplay wanted set error:", e);
      return res.status(500).json({ error: e?.message || "Failed to set wanted stars" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/wanted/clear`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const userId = String(req.body?.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const now = Math.floor(Date.now() / 1000);
      await dbRun(
        `UPDATE wanted_stars SET stars = 0, last_decay_at = ? WHERE guild_id = ? AND user_id = ?`,
        [now, bot.guild_id, userId]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error("Gameplay wanted clear error:", e);
      return res.status(500).json({ error: e?.message || "Failed to clear wanted stars" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/radio/results`, requireAuth, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;

    try {
      const rows = await dbAll(
        `SELECT station_id, COUNT(*) as votes
         FROM radio_votes
         WHERE guild_id = ?
         GROUP BY station_id
         ORDER BY votes DESC`,
        [bot.guild_id]
      );

      const totalVotes = (rows || []).reduce((sum, row) => sum + Number(row.votes || 0), 0);
      const byStation = new Map((rows || []).map((row) => [row.station_id, Number(row.votes || 0)]));
      const items = RADIO_STATIONS.map((station) => {
        const votes = byStation.get(station.id) || 0;
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        return { ...station, votes, pct };
      }).sort((a, b) => b.votes - a.votes);

      return res.json({ totalVotes, items });
    } catch (e) {
      console.error("Gameplay radio results error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get radio results" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/radio/reset`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = resolveBot(req, res);
    if (!bot) return;
    const userId = String(req.body?.userId || "").trim();

    try {
      if (userId) {
        await dbRun(`DELETE FROM radio_votes WHERE guild_id = ? AND user_id = ?`, [bot.guild_id, userId]);
      } else {
        await dbRun(`DELETE FROM radio_votes WHERE guild_id = ?`, [bot.guild_id]);
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error("Gameplay radio reset error:", e);
      return res.status(500).json({ error: e?.message || "Failed to reset radio votes" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/users`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);
    const search = String(req.query.search || "").trim();

    try {
      let rows;
      if (search) {
        rows = await dbAll(
          `SELECT user_id, money, car_id, rep, jail_until, created_at, updated_at
           FROM samp_users
           WHERE user_id LIKE ?
           ORDER BY money DESC
           LIMIT ?`,
          [`%${search}%`, limit]
        );
      } else {
        rows = await dbAll(
          `SELECT user_id, money, car_id, rep, jail_until, created_at, updated_at
           FROM samp_users
           ORDER BY money DESC
           LIMIT ?`,
          [limit]
        );
      }
      return res.json({ items: rows || [] });
    } catch (e) {
      console.error("Gameplay SAMP users error:", e);
      return res.status(500).json({ error: e?.message || "Failed to list SAMP users" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/user/:userId`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId required" });

    try {
      const user = await dbGet(
        `SELECT user_id, money, car_id, rep, jail_until, created_at, updated_at
         FROM samp_users WHERE user_id = ?`,
        [userId]
      );
      if (!user) return res.status(404).json({ error: "User not found" });

      const inventory = await dbAll(`SELECT item_id, qty FROM samp_inventory WHERE user_id = ?`, [userId]);
      const garage = await dbAll(`SELECT car_id, acquired_at FROM samp_garage WHERE user_id = ? ORDER BY acquired_at DESC`, [userId]);
      const cooldowns = await dbAll(`SELECT action, ready_at FROM samp_cooldowns WHERE user_id = ?`, [userId]);

      return res.json({ user, inventory: inventory || [], garage: garage || [], cooldowns: cooldowns || [] });
    } catch (e) {
      console.error("Gameplay SAMP user details error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get SAMP user" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/user/:userId/adjust`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;
    const userId = String(req.params.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId required" });

    const moneyDelta = Number.parseInt(req.body?.moneyDelta || "0", 10) || 0;
    const repDelta = Number.parseInt(req.body?.repDelta || "0", 10) || 0;
    const jailMinutes = Number.parseInt(req.body?.jailMinutes || "0", 10) || 0;

    try {
      await dbRun(
        `INSERT OR IGNORE INTO samp_users (user_id, money, car_id, rep, jail_until)
         VALUES (?, 500, 'bicycle', 0, 0)`,
        [userId]
      );

      if (moneyDelta !== 0) {
        await dbRun(`UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`, [moneyDelta, userId]);
      }
      if (repDelta !== 0) {
        await dbRun(`UPDATE samp_users SET rep = rep + ?, updated_at = datetime('now') WHERE user_id = ?`, [repDelta, userId]);
      }
      if (jailMinutes > 0) {
        const jailUntil = Date.now() + (jailMinutes * 60 * 1000);
        await dbRun(`UPDATE samp_users SET jail_until = ?, updated_at = datetime('now') WHERE user_id = ?`, [jailUntil, userId]);
      }

      const updated = await dbGet(
        `SELECT user_id, money, car_id, rep, jail_until, created_at, updated_at FROM samp_users WHERE user_id = ?`,
        [userId]
      );
      return res.json({ ok: true, user: updated });
    } catch (e) {
      console.error("Gameplay SAMP adjust error:", e);
      return res.status(500).json({ error: e?.message || "Failed to adjust SAMP user" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/ledger`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit || "100", 10), 1), 500);

    try {
      const rows = await dbAll(
        `SELECT id, ts, type, from_user, to_user, amount, meta_json
         FROM samp_ledger
         ORDER BY id DESC
         LIMIT ?`,
        [limit]
      );
      return res.json({ items: rows || [] });
    } catch (e) {
      console.error("Gameplay SAMP ledger error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get SAMP ledger" });
    }
  });

  return router;
}

module.exports = { createGameplayRouter };