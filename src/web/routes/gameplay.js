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
const {
  getSampLiveOpsConfig,
  updateSampLiveOpsConfig,
  listSampLiveOpsPresets,
  upsertSampLiveOpsPreset,
  deleteSampLiveOpsPreset,
  applySampLiveOpsPreset,
  listGangTerritories,
  PROPERTIES,
  TERRITORY_DISTRICTS,
} = require("../../features/samp-extended");

function createGameplayRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, requireAdmin, apiLimiter, bots, dbRun, dbGet, dbAll, client } = ctx;
  const SAMP_HISTORY_TYPES = {
    territory: new Set([
      "gang_territory_claim",
      "gang_territory_attack",
      "gang_territory_takeover",
      "gang_territory_reinforce",
      "gang_business_support",
    ]),
    liveOps: new Set([
      "live_ops_update",
      "live_ops_preset_save",
      "live_ops_preset_apply",
      "live_ops_preset_delete",
    ]),
    admin: new Set(["samp_admin_adjust"]),
  };

  function parseMetaJsonSafe(value) {
    if (!value) return {};
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  function panelActor(req) {
    const username = String(req.session?.user?.username || "system").trim();
    return `panel:${username || "system"}`;
  }

  async function appendSampLedger(db, { type, fromUser = null, toUser = null, amount = 0, meta = {} }) {
    await dbRun(
      db,
      `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json) VALUES(?, ?, ?, ?, ?)`,
      [type, fromUser, toUser, Number(amount || 0), JSON.stringify(meta || {})]
    );
  }

  function summarizeSampHistory(row) {
    const meta = parseMetaJsonSafe(row.meta_json);
    const base = {
      ...row,
      meta,
      category: "economy",
      summary: row.type,
      target: meta?.district_id || meta?.property_id || row.to_user || row.from_user || "-",
      actor: row.from_user || "system",
    };

    if (SAMP_HISTORY_TYPES.territory.has(row.type)) {
      base.category = "territory";
      if (row.type === "gang_territory_claim") base.summary = `Захват района ${meta.district_id}`;
      if (row.type === "gang_territory_attack") base.summary = `Атака на район ${meta.district_id}`;
      if (row.type === "gang_territory_takeover") base.summary = `Перехват района ${meta.district_id}`;
      if (row.type === "gang_territory_reinforce") base.summary = `Укрепление района ${meta.district_id}`;
      if (row.type === "gang_business_support") base.summary = `Поддержка бизнеса ${meta.property_id}`;
      base.target = meta.district_id || meta.property_id || row.to_user || "-";
      return base;
    }

    if (SAMP_HISTORY_TYPES.liveOps.has(row.type)) {
      base.category = "live-ops";
      if (row.type === "live_ops_update") base.summary = `Обновлены live ops множители`;
      if (row.type === "live_ops_preset_save") base.summary = `Сохранён пресет ${meta.name || meta.preset_name || ""}`.trim();
      if (row.type === "live_ops_preset_apply") base.summary = `Применён пресет ${meta.name || meta.preset_name || ""}`.trim();
      if (row.type === "live_ops_preset_delete") base.summary = `Удалён пресет ${meta.name || meta.preset_name || ""}`.trim();
      base.target = meta.name || meta.preset_name || "-";
      return base;
    }

    if (SAMP_HISTORY_TYPES.admin.has(row.type)) {
      base.category = "admin";
      base.summary = `Ручная правка игрока ${row.to_user || ""}`.trim();
      base.target = row.to_user || "-";
      return base;
    }

    return base;
  }

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
          `SELECT user_id, money, car_id, rep, jail_until, created_at, updated_at,
                  (SELECT COUNT(*) FROM samp_properties sp WHERE sp.user_id = samp_users.user_id) AS businesses_owned
           FROM samp_users
           WHERE user_id LIKE ?
           ORDER BY money DESC
           LIMIT ?`,
          [`%${search}%`, limit]
        );
      } else {
        rows = await dbAll(
          `SELECT user_id, money, car_id, rep, jail_until, created_at, updated_at,
                  (SELECT COUNT(*) FROM samp_properties sp WHERE sp.user_id = samp_users.user_id) AS businesses_owned
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

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/businesses/overview`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const summary = await dbGet(
        `SELECT COUNT(*) AS total_businesses,
                COUNT(DISTINCT user_id) AS total_owners,
                ROUND(AVG(condition), 1) AS avg_condition,
                ROUND(AVG(supplies), 1) AS avg_supplies,
                COALESCE(SUM(total_collected), 0) AS total_collected,
                SUM(CASE WHEN condition < 60 OR supplies < 60 THEN 1 ELSE 0 END) AS at_risk,
                SUM(CASE WHEN gang_boost_until IS NOT NULL AND gang_boost_until > datetime('now') THEN 1 ELSE 0 END) AS boosted_businesses
         FROM samp_properties`
      );

      const distribution = await dbAll(
        `SELECT property_id,
                COUNT(*) AS owned,
                ROUND(AVG(condition), 1) AS avg_condition,
                ROUND(AVG(supplies), 1) AS avg_supplies,
                COALESCE(SUM(total_collected), 0) AS total_collected
         FROM samp_properties
         GROUP BY property_id
         ORDER BY owned DESC, total_collected DESC, property_id ASC`
      );

      const topOwners = await dbAll(
        `SELECT user_id,
                COUNT(*) AS businesses_owned,
                COALESCE(SUM(total_collected), 0) AS total_collected,
                ROUND(AVG(condition), 1) AS avg_condition,
                ROUND(AVG(supplies), 1) AS avg_supplies
         FROM samp_properties
         GROUP BY user_id
         ORDER BY total_collected DESC, businesses_owned DESC, user_id ASC
         LIMIT 10`
      );

      const atRisk = await dbAll(
        `SELECT user_id, property_id, condition, supplies, total_collected, last_collected, gang_boost_until
         FROM samp_properties
         WHERE condition < 60 OR supplies < 60
         ORDER BY CASE WHEN condition < supplies THEN condition ELSE supplies END ASC,
                  total_collected DESC
         LIMIT 15`
      );

      return res.json({
        summary: summary || {},
        distribution: (distribution || []).map((row) => ({
          ...row,
          district: PROPERTIES[row.property_id]?.district || null,
          district_name: PROPERTIES[row.property_id]?.district ? TERRITORY_DISTRICTS[PROPERTIES[row.property_id].district]?.name || PROPERTIES[row.property_id].district : null,
        })),
        topOwners: topOwners || [],
        atRisk: atRisk || [],
      });
    } catch (e) {
      console.error("Gameplay SAMP business overview error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get business overview" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/live-ops`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const config = await getSampLiveOpsConfig(ctx.db);
      return res.json({ config });
    } catch (e) {
      console.error("Gameplay SAMP live ops get error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get live ops config" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/live-ops/presets`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const items = await listSampLiveOpsPresets(ctx.db);
      return res.json({ items });
    } catch (e) {
      console.error("Gameplay SAMP live ops presets get error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get live ops presets" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/live-ops/presets`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const items = await upsertSampLiveOpsPreset(ctx.db, req.body?.preset || {});
      const savedPreset = items.find((item) => item.name === String(req.body?.preset?.name || "").trim()) || null;
      await appendSampLedger(ctx.db, {
        type: "live_ops_preset_save",
        fromUser: panelActor(req),
        amount: 0,
        meta: {
          id: savedPreset?.id || null,
          name: savedPreset?.name || String(req.body?.preset?.name || "").trim(),
          preset_type: savedPreset?.preset_type || req.body?.preset?.preset_type || null,
          config: savedPreset?.config || req.body?.preset?.config || {},
        },
      });
      return res.json({ ok: true, items });
    } catch (e) {
      console.error("Gameplay SAMP live ops preset save error:", e);
      return res.status(400).json({ error: e?.message || "Failed to save live ops preset" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/live-ops/presets/:presetId/apply`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const applied = await applySampLiveOpsPreset(ctx.db, req.params.presetId);
      await appendSampLedger(ctx.db, {
        type: "live_ops_preset_apply",
        fromUser: panelActor(req),
        amount: 0,
        meta: {
          id: applied?.preset?.id || null,
          name: applied?.preset?.name || null,
          preset_type: applied?.preset?.preset_type || null,
          config: applied?.config || {},
        },
      });
      return res.json({ ok: true, ...applied });
    } catch (e) {
      console.error("Gameplay SAMP live ops preset apply error:", e);
      return res.status(400).json({ error: e?.message || "Failed to apply live ops preset" });
    }
  });

  router.delete(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/live-ops/presets/:presetId`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const existing = await listSampLiveOpsPresets(ctx.db);
      const targetPreset = (existing || []).find((item) => Number(item.id) === Number(req.params.presetId)) || null;
      const items = await deleteSampLiveOpsPreset(ctx.db, req.params.presetId);
      await appendSampLedger(ctx.db, {
        type: "live_ops_preset_delete",
        fromUser: panelActor(req),
        amount: 0,
        meta: {
          id: targetPreset?.id || Number(req.params.presetId),
          name: targetPreset?.name || null,
          preset_type: targetPreset?.preset_type || null,
        },
      });
      return res.json({ ok: true, items });
    } catch (e) {
      console.error("Gameplay SAMP live ops preset delete error:", e);
      return res.status(400).json({ error: e?.message || "Failed to delete live ops preset" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/territories/overview`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const items = await listGangTerritories(ctx.db);
      return res.json({ items });
    } catch (e) {
      console.error("Gameplay SAMP territories overview error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get territories overview" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/live-ops`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const before = await getSampLiveOpsConfig(ctx.db);
      const config = await updateSampLiveOpsConfig(ctx.db, req.body?.config || {});
      await appendSampLedger(ctx.db, {
        type: "live_ops_update",
        fromUser: panelActor(req),
        amount: 0,
        meta: {
          before,
          after: config,
        },
      });
      return res.json({ ok: true, config });
    } catch (e) {
      console.error("Gameplay SAMP live ops update error:", e);
      return res.status(400).json({ error: e?.message || "Failed to update live ops config" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/gangs/overview`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;

    try {
      const rows = await dbAll(
        `SELECT g.id,
                g.name,
                g.tag,
                g.treasury,
                COUNT(DISTINCT gm.user_id) AS members,
                  COUNT(DISTINCT t.district_id) AS territories,
                COUNT(DISTINCT CASE WHEN sp.gang_boost_until IS NOT NULL AND sp.gang_boost_until > datetime('now') THEN sp.user_id || ':' || sp.property_id END) AS supported_businesses
         FROM samp_gangs g
         LEFT JOIN samp_gang_members gm ON gm.gang_id = g.id
                LEFT JOIN samp_gang_territories t ON t.gang_id = g.id
         LEFT JOIN samp_properties sp ON sp.gang_boosted_by = g.id
         GROUP BY g.id
                ORDER BY territories DESC, g.treasury DESC, supported_businesses DESC, members DESC, g.name ASC
         LIMIT 20`
      );
      return res.json({ items: rows || [] });
    } catch (e) {
      console.error("Gameplay SAMP gang overview error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get gang overview" });
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
      const territoryMap = new Map((await listGangTerritories(ctx.db)).map((item) => [item.district_id, item]));
      const businesses = await dbAll(
        `SELECT property_id, bought_at, last_collected, condition, supplies, last_maintained, last_state_tick, total_collected, gang_boost_until, gang_boosted_by
         FROM samp_properties
         WHERE user_id = ?
         ORDER BY bought_at DESC`,
        [userId]
      );

      return res.json({
        user,
        inventory: inventory || [],
        garage: garage || [],
        cooldowns: cooldowns || [],
        businesses: (businesses || []).map((business) => {
          const property = PROPERTIES[business.property_id] || null;
          const territory = property?.district ? territoryMap.get(property.district) || null : null;
          return {
            ...business,
            district: property?.district || null,
            district_name: territory?.district_name || property?.district || null,
            territory_gang_id: territory?.gang_id || null,
            territory_gang_name: territory?.gang_name || null,
            territory_buff_pct: territory?.business_buff_pct || 0,
          };
        }),
      });
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
      const before = await dbGet(
        `SELECT user_id, money, car_id, rep, jail_until, created_at, updated_at FROM samp_users WHERE user_id = ?`,
        [userId]
      );
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
      if (moneyDelta !== 0 || repDelta !== 0 || jailMinutes > 0) {
        await appendSampLedger(ctx.db, {
          type: "samp_admin_adjust",
          fromUser: panelActor(req),
          toUser: userId,
          amount: moneyDelta,
          meta: {
            before: before || null,
            after: updated || null,
            moneyDelta,
            repDelta,
            jailMinutes,
          },
        });
      }
      return res.json({ ok: true, user: updated });
    } catch (e) {
      console.error("Gameplay SAMP adjust error:", e);
      return res.status(500).json({ error: e?.message || "Failed to adjust SAMP user" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/gameplay/samp-life/history`, requireAuth, apiLimiter, async (req, res) => {
    if (!resolveBot(req, res)) return;
    const limit = Math.min(Math.max(parseInt(req.query.limit || "80", 10), 1), 200);
    const category = String(req.query.category || "all").trim();

    try {
      let types = null;
      if (category === "territory") {
        types = [...SAMP_HISTORY_TYPES.territory];
      } else if (category === "live-ops") {
        types = [...SAMP_HISTORY_TYPES.liveOps];
      } else if (category === "admin") {
        types = [...SAMP_HISTORY_TYPES.admin];
      } else {
        types = [...new Set([...SAMP_HISTORY_TYPES.territory, ...SAMP_HISTORY_TYPES.liveOps, ...SAMP_HISTORY_TYPES.admin])];
      }

      const placeholders = types.map(() => "?").join(", ");
      const rows = await dbAll(
        `SELECT id, ts, type, from_user, to_user, amount, meta_json
         FROM samp_ledger
         WHERE type IN (${placeholders})
         ORDER BY id DESC
         LIMIT ?`,
        [...types, limit]
      );
      return res.json({ items: (rows || []).map(summarizeSampHistory) });
    } catch (e) {
      console.error("Gameplay SAMP history error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get SAMP history" });
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