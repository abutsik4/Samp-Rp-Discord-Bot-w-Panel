const { Router } = require("express");

const {
  generateVerificationSelectPage,
  generateVerificationDashboardPage,
} = require("../verification-dashboard-page");

function clampInt(value, { min, max, fallback }) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function isoDateDaysAgo(days) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function fillDailySeries(dailyRows, startDate, days) {
  const byDate = new Map();
  for (const r of dailyRows || []) {
    const date = String(r?.date || r?.message_date || "").slice(0, 10);
    if (!date) continue;
    byDate.set(date, {
      date,
      messages: Number(r?.messages || 0),
      users: Number(r?.users || 0),
    });
  }

  const out = [];
  for (let i = 0; i < days; i++) {
    const date = isoDateDaysAgo((days - 1) - i);
    if (date < startDate) continue;
    out.push(byDate.get(date) || { date, messages: 0, users: 0 });
  }
  return out;
}

function createAnalyticsRouter(ctx) {
  const router = Router();
  const { PANEL_BASE, requireAuth, requireAdmin, apiLimiter, bots, client, dbGet, dbAll } = ctx;

  // ========================
  // ANALYTICS API ENDPOINTS
  // ========================

  router.get(`${PANEL_BASE}/api/:botKey/analytics`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const days = clampInt(req.query.days, { min: 1, max: 365, fallback: 7 });
    const startDate = isoDateDaysAgo(days - 1);
    const startDateTime = `${startDate} 00:00:00`;
    const guildId = String(bot.guild_id);

    try {
      let dailyRows = await dbAll(
        ctx.db,
        `SELECT message_date as date, SUM(count) as messages, COUNT(DISTINCT user_id) as users
         FROM daily_channel_stats
         WHERE guild_id = ? AND message_date >= ?
         GROUP BY message_date
         ORDER BY message_date ASC`,
        [guildId, startDate]
      );

      if (!dailyRows || dailyRows.length === 0) {
        dailyRows = await dbAll(
          ctx.db,
          `SELECT substr(created_at, 1, 10) as date,
                  COUNT(*) as messages,
                  COUNT(DISTINCT user_id) as users
           FROM message_index
           WHERE guild_id = ? AND created_at >= ?
           GROUP BY substr(created_at, 1, 10)
           ORDER BY date ASC`,
          [guildId, startDateTime]
        );
      }

      const daily = fillDailySeries(dailyRows, startDate, days);
      const totalMessages = daily.reduce((acc, d) => acc + (Number(d.messages) || 0), 0);

      let activeUsersRow = await dbGet(
        ctx.db,
        `SELECT COUNT(DISTINCT user_id) as cnt
         FROM daily_channel_stats
         WHERE guild_id = ? AND message_date >= ?`,
        [guildId, startDate]
      );
      if (!activeUsersRow || !Number.isFinite(Number(activeUsersRow?.cnt))) {
        activeUsersRow = await dbGet(
          ctx.db,
          `SELECT COUNT(DISTINCT user_id) as cnt
           FROM message_index
           WHERE guild_id = ? AND created_at >= ?`,
          [guildId, startDateTime]
        );
      }

      const activeUsers = Number(activeUsersRow?.cnt || 0);
      const avgDaily = days > 0 ? totalMessages / days : 0;

      const hourlyRows =
        (await dbAll(
          ctx.db,
          `SELECT CAST(strftime('%H', created_at) as integer) as hour,
                  COUNT(*) as count
           FROM message_index
           WHERE guild_id = ? AND created_at >= ?
           GROUP BY hour`,
          [guildId, startDateTime]
        )) || [];

      const hourly = Array(24).fill(0);
      for (const r of hourlyRows) {
        const h = Number(r?.hour);
        if (Number.isInteger(h) && h >= 0 && h < 24) hourly[h] = Number(r?.count || 0);
      }

      const peakHourRow = hourlyRows.reduce(
        (best, r) => {
          const count = Number(r?.count || 0);
          if (!best || count > Number(best.count || 0)) return r;
          return best;
        },
        null
      );
      const peakHour = Number.isInteger(Number(peakHourRow?.hour)) ? Number(peakHourRow.hour) : 0;

      const weeklyRows =
        (await dbAll(
          ctx.db,
          `SELECT CAST(strftime('%w', created_at) as integer) as wday,
                  COUNT(*) as count
           FROM message_index
           WHERE guild_id = ? AND created_at >= ?
           GROUP BY wday`,
          [guildId, startDateTime]
        )) || [];

      // Output order: Mon..Sun
      const weekly = Array(7).fill(0);
      for (const r of weeklyRows) {
        const w = Number(r?.wday);
        const c = Number(r?.count || 0);
        if (!Number.isInteger(w)) continue;
        const idx = w === 0 ? 6 : w - 1;
        if (idx >= 0 && idx < 7) weekly[idx] = c;
      }

      const topUsers =
        (await dbAll(
          ctx.db,
          `SELECT d.user_id as id,
                  COALESCE(uc.username, d.user_id) as name,
                  SUM(d.count) as count
           FROM daily_channel_stats d
           LEFT JOIN user_cache uc
             ON uc.guild_id = d.guild_id AND uc.user_id = d.user_id
           WHERE d.guild_id = ? AND d.message_date >= ?
           GROUP BY d.user_id
           ORDER BY count DESC
           LIMIT 10`,
          [guildId, startDate]
        )) || [];

      let topChannelsRows =
        (await dbAll(
          ctx.db,
          `SELECT channel_id as id, SUM(count) as count
           FROM daily_channel_stats
           WHERE guild_id = ? AND message_date >= ?
           GROUP BY channel_id
           ORDER BY count DESC
           LIMIT 10`,
          [guildId, startDate]
        )) || [];

      if (!topChannelsRows || topChannelsRows.length === 0) {
        topChannelsRows =
          (await dbAll(
            ctx.db,
            `SELECT channel_id as id, COUNT(*) as count
             FROM message_index
             WHERE guild_id = ? AND created_at >= ? AND channel_id IS NOT NULL
             GROUP BY channel_id
             ORDER BY count DESC
             LIMIT 10`,
            [guildId, startDateTime]
          )) || [];
      }

      const guild = client?.guilds?.cache?.get(guildId) || null;
      const topChannels = topChannelsRows.map((r) => {
        const id = String(r?.id || "");
        const name = guild?.channels?.cache?.get(id)?.name || id;
        return { id, name, count: Number(r?.count || 0) };
      });

      return res.json({
        ok: true,
        days,
        totalMessages,
        activeUsers,
        avgDaily,
        peakHour,
        daily,
        hourly,
        weekly,
        topUsers: topUsers.map((r) => ({ id: r.id, name: r.name, count: Number(r.count || 0) })),
        topChannels,
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load analytics" });
    }
  });

  // Channel list (for potential filters)
  router.get(`${PANEL_BASE}/api/:botKey/analytics/channels`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const days = clampInt(req.query.days, { min: 1, max: 365, fallback: 30 });
    const startDate = isoDateDaysAgo(days - 1);
    const guildId = String(bot.guild_id);

    try {
      const rows =
        (await dbAll(
          ctx.db,
          `SELECT channel_id as id, SUM(count) as count
           FROM daily_channel_stats
           WHERE guild_id = ? AND message_date >= ?
           GROUP BY channel_id
           ORDER BY count DESC
           LIMIT 500`,
          [guildId, startDate]
        )) || [];

      const guild = client?.guilds?.cache?.get(guildId) || null;
      const channels = rows.map((r) => {
        const id = String(r?.id || "");
        const name = guild?.channels?.cache?.get(id)?.name || id;
        return { id, name, count: Number(r?.count || 0) };
      });

      return res.json({ ok: true, channels });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to list channels" });
    }
  });

  // ========================
  // VERIFICATION DASHBOARD
  // ========================

  router.get(`${PANEL_BASE}/verification-dashboard`, requireAuth, requireAdmin, async (req, res) => {
    const bot = bots.find((b) => b.key === req.query.bot);
    if (!bot) return res.send(generateVerificationSelectPage(bots, PANEL_BASE));
    return res.send(generateVerificationDashboardPage(bot, PANEL_BASE));
  });

  router.get(`${PANEL_BASE}/api/:botKey/verify/message-counted`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const messageId = String(req.query.messageId || "").trim();
    if (!messageId) return res.status(400).json({ error: "messageId is required" });

    try {
      const row = await dbGet(
        ctx.db,
        `SELECT guild_id as guildId, user_id as userId, created_at as createdAt
         FROM message_index
         WHERE guild_id = ? AND message_id = ?`,
        [String(bot.guild_id), messageId]
      );
      if (!row) return res.json({ ok: true, found: false });
      return res.json({ ok: true, found: true, message: row });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to check message" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/verify/user-stats`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const userId = String(req.query.userId || "").trim();
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const guildId = String(req.query.guildId || bot.guild_id);
    if (String(guildId) !== String(bot.guild_id)) {
      return res.status(400).json({ error: "guildId must match the selected bot" });
    }

    try {
      const storedRow =
        (await dbGet(
          ctx.db,
          `SELECT
             COALESCE(us.message_count, 0) as base_count,
             COALESCE(ua.adjustment, 0) as adjustment
           FROM user_stats us
           LEFT JOIN user_adjustments ua ON ua.guild_id = us.guild_id AND ua.user_id = us.user_id
           WHERE us.guild_id = ? AND us.user_id = ?`,
          [guildId, userId]
        )) || { base_count: 0, adjustment: 0 };

      const storedCount = Math.max(0, Number(storedRow.base_count || 0) + Number(storedRow.adjustment || 0));

      const indexedRow = await dbGet(
        ctx.db,
        `SELECT COUNT(*) as cnt FROM message_index WHERE guild_id = ? AND user_id = ?`,
        [guildId, userId]
      );
      const indexedCount = Number(indexedRow?.cnt || 0);

      const nameRow = await dbGet(
        ctx.db,
        `SELECT username FROM user_cache WHERE guild_id = ? AND user_id = ?`,
        [guildId, userId]
      );
      const username = String(nameRow?.username || userId);

      const discrepancy = storedCount - indexedCount;

      return res.json({
        ok: true,
        userId,
        guildId,
        username,
        storedCount,
        indexedCount,
        discrepancy,
      });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to verify user" });
    }
  });

  router.get(`${PANEL_BASE}/api/:botKey/verify/results`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const limit = clampInt(req.query.limit, { min: 1, max: 200, fallback: 50 });
    const guildId = String(bot.guild_id);

    try {
      const top =
        (await dbAll(
          ctx.db,
          `SELECT us.user_id as user_id,
                  COALESCE(uc.username, us.user_id) as username,
                  MAX(0, us.message_count + COALESCE(ua.adjustment, 0)) as stored_count
           FROM user_stats us
           LEFT JOIN user_adjustments ua ON ua.guild_id = us.guild_id AND ua.user_id = us.user_id
           LEFT JOIN user_cache uc ON uc.guild_id = us.guild_id AND uc.user_id = us.user_id
           WHERE us.guild_id = ?
           ORDER BY stored_count DESC
           LIMIT ?`,
          [guildId, limit]
        )) || [];

      if (top.length === 0) {
        return res.json({ ok: true, results: [], summary: { total: 0, perfect: 0, discrepancies: 0 } });
      }

      const userIds = top.map((r) => r.user_id);
      const placeholders = userIds.map(() => "?").join(",");
      const indexed =
        (await dbAll(
          ctx.db,
          `SELECT user_id, COUNT(*) as indexed_count
           FROM message_index
           WHERE guild_id = ? AND user_id IN (${placeholders})
           GROUP BY user_id`,
          [guildId, ...userIds]
        )) || [];

      const indexedMap = new Map(indexed.map((r) => [String(r.user_id), Number(r.indexed_count || 0)]));
      const now = new Date().toISOString();

      const results = top.map((r) => {
        const userId = String(r.user_id);
        const stored = Number(r.stored_count || 0);
        const indexedCount = indexedMap.get(userId) || 0;
        return {
          user_id: userId,
          username: r.username,
          stored_count: stored,
          indexed_count: indexedCount,
          difference: stored - indexedCount,
          updated_at: now,
        };
      });

      let perfect = 0;
      let discrepancies = 0;
      for (const r of results) {
        if (Number(r.difference || 0) === 0) perfect++;
        else discrepancies++;
      }

      return res.json({ ok: true, results, summary: { total: results.length, perfect, discrepancies } });
    } catch (e) {
      return res.status(500).json({ error: e?.message || "Failed to load verification results" });
    }
  });

  return router;
}

module.exports = { createAnalyticsRouter };
