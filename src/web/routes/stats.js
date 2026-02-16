const { Router } = require("express");

function createStatsRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, apiLimiter, bots,
    db, dbRun, dbGet, dbAll,
    recordOperation, client, getUserMessageCount,
    panelHttpLogger,
  } = ctx;

  // ========================
  // STATS API ENDPOINTS
  // ========================

  // Get user statistics with Discord usernames instead of just IDs
  router.get(`${PANEL_BASE}/api/:botKey/stats/users`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const guildId = req.query.guildId || '';
      const sortBy = req.query.sortBy || 'count'; // 'count', 'username', 'recent'
      const limit = Math.min(parseInt(req.query.limit || 100), 500); // Max 500, default 100
      const offset = parseInt(req.query.offset || 0);
      const search = (req.query.search || '').trim().toLowerCase();

      let whereClause = '';
      let params = [];
      let whereParams = [];

      if (guildId) {
        whereClause = 'WHERE us.guild_id = ?';
        whereParams.push(guildId);
      }

      let orderClause = 'ORDER BY us.message_count DESC, us.user_id ASC';
      let orderParams = [];
      if (sortBy === 'username') {
        orderClause = 'ORDER BY COALESCE(uc_guild.username, uc_any.username, us.user_id) ASC';
      } else if (sortBy === 'recent') {
        orderClause = 'ORDER BY COALESCE(uc_guild.updated_at, uc_any.updated_at, ?) DESC';
        orderParams.push(new Date().toISOString());
      }

      // Join with user_cache (prefer guild-specific, else latest seen globally)
      let query = `
        SELECT 
          us.user_id,
          COALESCE(uc_guild.username, uc_any.username, us.user_id) as username,
          us.message_count,
          COALESCE(uc_guild.avatar_url, uc_any.avatar_url) as avatar_url,
          COALESCE(uc_guild.updated_at, uc_any.updated_at, ?) as updated_at
        FROM user_stats us
        LEFT JOIN user_cache uc_guild ON us.guild_id = uc_guild.guild_id AND us.user_id = uc_guild.user_id
        LEFT JOIN (
          SELECT uc1.user_id, uc1.username, uc1.avatar_url, uc1.updated_at
          FROM user_cache uc1
          JOIN (
            SELECT user_id, MAX(updated_at) AS max_updated_at
            FROM user_cache
            GROUP BY user_id
          ) ucmax ON uc1.user_id = ucmax.user_id AND uc1.updated_at = ucmax.max_updated_at
        ) uc_any ON uc_any.user_id = us.user_id
        ${whereClause}
      `;
      params.push(new Date().toISOString());
      params.push(...whereParams);

      // Apply search filter if provided
      if (search) {
        query += whereClause ? ` AND` : ` WHERE`;
        query += ` (LOWER(COALESCE(uc_guild.username, uc_any.username, us.user_id)) LIKE ? OR us.user_id LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` ${orderClause} LIMIT ? OFFSET ?`;
      params.push(...orderParams);
      params.push(limit, offset);

      console.log('Stats query:', query);
      console.log('Stats params:', params);
      const users = await dbAll(query, params);
      console.log('Stats users returned:', users?.length);

      // On-demand hydration: fetch Discord usernames for entries still showing raw IDs (limit 5 per request)
      if (users?.length) {
        const missing = users.filter((u) => u.username === u.user_id).slice(0, 5);
        for (const entry of missing) {
          try {
            const fetched = await bot.client.users.fetch(entry.user_id);
            if (fetched?.username) {
              const nowIso = new Date().toISOString();
              await dbRun(
                `INSERT OR REPLACE INTO user_cache (guild_id, user_id, username, avatar_url, updated_at)
                 VALUES (?, ?, ?, ?, ?)` ,
                [guildId || null, entry.user_id, fetched.username, fetched.avatarURL() || null, nowIso]
              );
              entry.username = fetched.username;
              entry.avatar_url = fetched.avatarURL() || null;
              entry.updated_at = nowIso;
            }
          } catch (_) {
            // ignore fetch failures (user missing or rate limited)
          }
        }
      }

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM user_stats us LEFT JOIN user_cache uc ON us.guild_id = uc.guild_id AND us.user_id = uc.user_id`;
      let countParams = [];
      if (guildId) {
        countQuery += ` WHERE us.guild_id = ?`;
        countParams.push(guildId);
      }
      if (search) {
        countQuery += guildId ? ` AND` : ` WHERE`;
        countQuery += ` (LOWER(COALESCE(uc.username, us.user_id)) LIKE ? OR us.user_id LIKE ?)`;
        countParams.push(`%${search}%`, `%${search}%`);
      }

      const countResult = await dbGet(countQuery, countParams);
      const total = countResult?.total || 0;

      return res.json({
        ok: true,
        users,
        pagination: { offset, limit, total }
      });
    } catch (e) {
      console.error('GET /stats/users error:', e);
      return res.status(500).json({ error: e.message || "Failed to fetch user statistics" });
    }
  });

  // Channel breakdown per user (best-effort; requires channel_id in message_index)
  router.get(`${PANEL_BASE}/api/:botKey/stats/user-channels`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { guildId, userId, limit = 10 } = req.query;
      if (!guildId || !userId) return res.status(400).json({ error: "guildId and userId are required" });

      const rows = await dbAll(
        `SELECT channel_id, COUNT(*) as count
         FROM message_index
         WHERE guild_id = ? AND user_id = ? AND channel_id IS NOT NULL
         GROUP BY channel_id
         ORDER BY count DESC
         LIMIT ?`,
        [guildId, userId, Math.min(parseInt(limit, 10) || 10, 25)]
      );

      return res.json({ ok: true, channels: rows });
    } catch (e) {
      console.error('GET /stats/user-channels error:', e);
      return res.status(500).json({ error: e.message || "Failed to fetch channel breakdown" });
    }
  });

  // Adjust a user's message count (admin tool)
  router.post(`${PANEL_BASE}/api/:botKey/stats/adjust`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { guildId, userId, delta, setTo } = req.body || {};
      if (!userId || !guildId) return res.status(400).json({ error: "guildId and userId are required" });

      const currentRow = await dbGet(`SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);
      const currentCount = currentRow?.message_count || 0;
      let newCount = currentCount;

      if (typeof setTo === 'number' && Number.isFinite(setTo) && setTo >= 0) {
        newCount = Math.floor(setTo);
      } else if (typeof delta === 'number' && Number.isFinite(delta) && delta !== 0) {
        newCount = Math.max(0, currentCount + Math.floor(delta));
      } else {
        return res.status(400).json({ error: "Provide either a non-negative setTo or a non-zero delta" });
      }

      const deltaApplied = newCount - currentCount;

      // Persist adjustment delta for backfill/reconciliation safety
      await dbRun(
        `INSERT INTO user_adjustments (guild_id, user_id, adjustment, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(guild_id, user_id)
         DO UPDATE SET adjustment = user_adjustments.adjustment + excluded.adjustment,
                       updated_at = excluded.updated_at`,
        [guildId, userId, deltaApplied, new Date().toISOString()]
      );

      // Update visible stats
      await dbRun(
        `INSERT INTO user_stats (guild_id, user_id, message_count)
         VALUES (?, ?, ?)
         ON CONFLICT(guild_id, user_id)
         DO UPDATE SET message_count = excluded.message_count`,
        [guildId, userId, newCount]
      );

      return res.json({ ok: true, guildId, userId, messageCount: newCount });
    } catch (e) {
      console.error('POST /stats/adjust error:', e);
      return res.status(500).json({ error: e.message || "Failed to adjust user stats" });
    }
  });

  // List channels by activity (for channel-centric stats management)
  router.get(`${PANEL_BASE}/api/:botKey/stats/channels`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { guildId } = req.query;
      if (!guildId) return res.status(400).json({ error: "guildId is required" });

      let rows = await dbAll(
        `SELECT
          channel_id,
          SUM(count) as base_count
         FROM daily_channel_stats
         WHERE guild_id = ?
         GROUP BY channel_id
         ORDER BY base_count DESC
         LIMIT 500`,
        [guildId]
      );

      // Fallback: if daily_channel_stats isn't populated yet, derive from message_index
      if (!rows || rows.length === 0) {
        rows = await dbAll(
          `SELECT
            channel_id,
            COUNT(*) as base_count
           FROM message_index
           WHERE guild_id = ? AND channel_id IS NOT NULL
           GROUP BY channel_id
           ORDER BY base_count DESC
           LIMIT 500`,
          [guildId]
        );
      }

      const adjRows = await dbAll(
        `SELECT channel_id, SUM(adjustment) as adjustment
         FROM channel_user_adjustments
         WHERE guild_id = ?
         GROUP BY channel_id`,
        [guildId]
      );
      const adjMap = new Map(adjRows.map((r) => [r.channel_id, r.adjustment || 0]));

      const out = rows.map((r) => {
        const adj = adjMap.get(r.channel_id) || 0;
        return {
          channel_id: r.channel_id,
          base_count: r.base_count || 0,
          adjustment: adj,
          effective_count: Math.max(0, (r.base_count || 0) + adj),
          channel_name: null,
        };
      });

      // Best-effort name hydration (cache-based)
      const guild = bot.client?.guilds?.cache?.get(String(guildId)) || null;
      if (guild) {
        for (const item of out) {
          const ch = guild.channels?.cache?.get(item.channel_id);
          if (ch?.name) item.channel_name = ch.name;
        }
      }

      return res.json({ ok: true, channels: out });
    } catch (e) {
      console.error('GET /stats/channels error:', e);
      return res.status(500).json({ error: e.message || "Failed to list channels" });
    }
  });

  // Channel-centric: users for a channel (base from daily_channel_stats + adjustments)
  router.get(`${PANEL_BASE}/api/:botKey/stats/channel-users`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const guildId = String(req.query.guildId || '').trim();
      const channelId = String(req.query.channelId || '').trim();
      const limit = Math.min(parseInt(req.query.limit || 100, 10), 500);
      const offset = Math.max(parseInt(req.query.offset || 0, 10), 0);
      const search = String(req.query.search || '').trim().toLowerCase();
      const sortBy = String(req.query.sortBy || 'count'); // count|username

      if (!guildId || !channelId) return res.status(400).json({ error: "guildId and channelId are required" });

      const orderClause = sortBy === 'username'
        ? 'ORDER BY COALESCE(uc_guild.username, uc_any.username, t.user_id) ASC'
        : 'ORDER BY effective_count DESC, t.user_id ASC';

      let query = `
        WITH totals AS (
          SELECT user_id, SUM(count) as base_count
          FROM daily_channel_stats
          WHERE guild_id = ? AND channel_id = ?
          GROUP BY user_id
        ),
        adj AS (
          SELECT user_id, adjustment
          FROM channel_user_adjustments
          WHERE guild_id = ? AND channel_id = ?
        ),
        t AS (
          SELECT
            totals.user_id as user_id,
            COALESCE(totals.base_count, 0) as base_count,
            COALESCE(adj.adjustment, 0) as adjustment,
            MAX(0, COALESCE(totals.base_count, 0) + COALESCE(adj.adjustment, 0)) as effective_count
          FROM totals
          LEFT JOIN adj ON totals.user_id = adj.user_id
        )
        SELECT
          t.user_id,
          COALESCE(uc_guild.username, uc_any.username, t.user_id) as username,
          t.base_count,
          t.adjustment,
          t.effective_count,
          COALESCE(uc_guild.avatar_url, uc_any.avatar_url) as avatar_url
        FROM t
        LEFT JOIN user_cache uc_guild ON uc_guild.guild_id = ? AND uc_guild.user_id = t.user_id
        LEFT JOIN (
          SELECT uc1.user_id, uc1.username, uc1.avatar_url, uc1.updated_at
          FROM user_cache uc1
          JOIN (
            SELECT user_id, MAX(updated_at) AS max_updated_at
            FROM user_cache
            GROUP BY user_id
          ) ucmax ON uc1.user_id = ucmax.user_id AND uc1.updated_at = ucmax.max_updated_at
        ) uc_any ON uc_any.user_id = t.user_id
      `;

      const params = [guildId, channelId, guildId, channelId, guildId];

      if (search) {
        query += ` WHERE (LOWER(COALESCE(uc_guild.username, uc_any.username, t.user_id)) LIKE ? OR t.user_id LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
      }

      query += ` ${orderClause} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const users = await dbAll(query, params);

      // total count
      let countQuery = `
        WITH totals AS (
          SELECT user_id
          FROM daily_channel_stats
          WHERE guild_id = ? AND channel_id = ?
          GROUP BY user_id
        )
        SELECT COUNT(*) as total FROM totals
      `;
      const countParams = [guildId, channelId];
      if (search) {
        countQuery = `
          WITH totals AS (
            SELECT user_id
            FROM daily_channel_stats
            WHERE guild_id = ? AND channel_id = ?
            GROUP BY user_id
          )
          SELECT COUNT(*) as total
          FROM totals
          LEFT JOIN user_cache uc_guild ON uc_guild.guild_id = ? AND uc_guild.user_id = totals.user_id
          LEFT JOIN (
            SELECT uc1.user_id, uc1.username, uc1.avatar_url, uc1.updated_at
            FROM user_cache uc1
            JOIN (
              SELECT user_id, MAX(updated_at) AS max_updated_at
              FROM user_cache
              GROUP BY user_id
            ) ucmax ON uc1.user_id = ucmax.user_id AND uc1.updated_at = ucmax.max_updated_at
          ) uc_any ON uc_any.user_id = totals.user_id
          WHERE (LOWER(COALESCE(uc_guild.username, uc_any.username, totals.user_id)) LIKE ? OR totals.user_id LIKE ?)
        `;
        countParams.push(guildId, `%${search}%`, `%${search}%`);
      }

      const countRow = await dbGet(countQuery, countParams);

      return res.json({
        ok: true,
        users,
        pagination: { offset, limit, total: countRow?.total || 0 }
      });
    } catch (e) {
      console.error('GET /stats/channel-users error:', e);
      return res.status(500).json({ error: e.message || "Failed to list channel users" });
    }
  });

  // Apply a per-channel adjustment for a user (delta or setTo, persists via channel_user_adjustments)
  router.post(`${PANEL_BASE}/api/:botKey/stats/channel-adjust`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { guildId, channelId, userId, delta, setTo, reason } = req.body || {};
      if (!guildId || !channelId || !userId) return res.status(400).json({ error: "guildId, channelId, and userId are required" });

      const baseRow = await dbGet(
        `SELECT COALESCE(SUM(count), 0) as base_count
         FROM daily_channel_stats
         WHERE guild_id = ? AND channel_id = ? AND user_id = ?`,
        [guildId, channelId, userId]
      );
      const baseCount = baseRow?.base_count || 0;

      const adjRow = await dbGet(
        `SELECT adjustment FROM channel_user_adjustments WHERE guild_id = ? AND channel_id = ? AND user_id = ?`,
        [guildId, channelId, userId]
      );
      const currentAdj = adjRow?.adjustment || 0;
      const currentEffective = Math.max(0, baseCount + currentAdj);

      let appliedDelta = 0;
      if (typeof setTo === 'number' && Number.isFinite(setTo) && setTo >= 0) {
        const target = Math.floor(setTo);
        appliedDelta = target - currentEffective;
      } else if (typeof delta === 'number' && Number.isFinite(delta) && delta !== 0) {
        appliedDelta = Math.floor(delta);
      } else {
        return res.status(400).json({ error: "Provide either a non-negative setTo or a non-zero delta" });
      }

      // Clamp so effective never goes below 0
      const newEffective = Math.max(0, currentEffective + appliedDelta);
      const clampedApplied = newEffective - currentEffective;
      const newAdj = currentAdj + clampedApplied;

      const updatedBy = req.session?.user?.username || null;

      await dbRun(
        `INSERT INTO channel_user_adjustments (guild_id, channel_id, user_id, adjustment, updated_by, reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(guild_id, channel_id, user_id)
         DO UPDATE SET adjustment = excluded.adjustment,
                       updated_by = excluded.updated_by,
                       reason = excluded.reason,
                       updated_at = excluded.updated_at`,
        [guildId, channelId, userId, newAdj, updatedBy, String(reason || '').slice(0, 500) || null, new Date().toISOString()]
      );

      // Update overall user_stats so the leaderboard immediately reflects the change
      const userRow = await dbGet(`SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);
      const userCurrent = userRow?.message_count || 0;
      const userNew = Math.max(0, userCurrent + clampedApplied);
      await dbRun(
        `INSERT INTO user_stats (guild_id, user_id, message_count)
         VALUES (?, ?, ?)
         ON CONFLICT(guild_id, user_id)
         DO UPDATE SET message_count = excluded.message_count`,
        [guildId, userId, userNew]
      );

      return res.json({
        ok: true,
        guildId,
        channelId,
        userId,
        baseCount,
        adjustment: newAdj,
        effectiveCount: newEffective,
        deltaApplied: clampedApplied,
      });
    } catch (e) {
      console.error('POST /stats/channel-adjust error:', e);
      return res.status(500).json({ error: e.message || "Failed to apply channel adjustment" });
    }
  });

  // Recalculate daily_channel_stats and user_stats from message_index (DB-only rebuild)
  router.post(`${PANEL_BASE}/api/:botKey/stats/recalculate`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { guildId } = req.body || {};
      if (!guildId) return res.status(400).json({ error: "guildId is required" });

      const start = Date.now();

      // Rebuild daily_channel_stats (derived from message_index)
      await dbRun(db, `DELETE FROM daily_channel_stats WHERE guild_id = ?`, [guildId]);
      await dbRun(
        db,
        `INSERT INTO daily_channel_stats (guild_id, user_id, channel_id, message_date, count)
         SELECT
           guild_id,
           user_id,
           channel_id,
           substr(created_at, 1, 10) as message_date,
           COUNT(*) as count
         FROM message_index
         WHERE guild_id = ? AND channel_id IS NOT NULL
         GROUP BY guild_id, user_id, channel_id, message_date`,
        [guildId]
      );

      // Rebuild user_stats (derived from message_index + user_adjustments + channel_user_adjustments)
      const actualCounts = await dbAll(
        db,
        `SELECT user_id, COUNT(*) as actual_count
         FROM message_index
         WHERE guild_id = ?
         GROUP BY user_id`,
        [guildId]
      );
      const userAdjRows = await dbAll(db, `SELECT user_id, adjustment FROM user_adjustments WHERE guild_id = ?`, [guildId]);
      const chAdjRows = await dbAll(
        db,
        `SELECT user_id, SUM(adjustment) as adjustment
         FROM channel_user_adjustments
         WHERE guild_id = ?
         GROUP BY user_id`,
        [guildId]
      );

      const actualMap = new Map(actualCounts.map((r) => [r.user_id, r.actual_count || 0]));
      const userAdj = new Map(userAdjRows.map((r) => [r.user_id, r.adjustment || 0]));
      const chAdj = new Map(chAdjRows.map((r) => [r.user_id, r.adjustment || 0]));

      const userIds = new Set();
      for (const r of actualCounts) userIds.add(r.user_id);
      for (const r of userAdjRows) userIds.add(r.user_id);
      for (const r of chAdjRows) userIds.add(r.user_id);

      let updated = 0;
      for (const userId of userIds) {
        const actual = actualMap.get(userId) || 0;
        const expected = Math.max(0, actual + (userAdj.get(userId) || 0) + (chAdj.get(userId) || 0));
        await dbRun(
          db,
          `INSERT INTO user_stats (guild_id, user_id, message_count)
           VALUES (?, ?, ?)
           ON CONFLICT(guild_id, user_id)
           DO UPDATE SET message_count = excluded.message_count`,
          [guildId, userId, expected]
        );
        updated++;
      }

      const duration = Date.now() - start;
      return res.json({ ok: true, guildId, updatedUsers: updated, durationMs: duration });
    } catch (e) {
      console.error('POST /stats/recalculate error:', e);
      return res.status(500).json({ error: e.message || "Failed to recalculate" });
    }
  });

  // Backfill a single channel from Discord history into message_index (rate-limited)
  router.post(`${PANEL_BASE}/api/:botKey/stats/backfill-channel`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { guildId, channelId, maxMessages } = req.body || {};
      if (!guildId || !channelId) return res.status(400).json({ error: "guildId and channelId are required" });

      const { incrementMessageCountRobust } = require('../../features/robust-message-counting');

      const channel = await bot.client.channels.fetch(String(channelId));
      if (!channel || !channel.isTextBased || !channel.isTextBased()) {
        return res.status(400).json({ error: "Channel not found or not text-based" });
      }

      const cap = Number.isFinite(Number(maxMessages)) && Number(maxMessages) > 0 ? Math.floor(Number(maxMessages)) : 25000;
      const start = Date.now();
      let lastId = null;
      let processed = 0;
      let fetchedBatches = 0;

      while (processed < cap) {
        const options = { limit: 100 };
        if (lastId) options.before = lastId;
        const batch = await channel.messages.fetch(options);
        fetchedBatches++;
        if (!batch || batch.size === 0) break;

        for (const msg of batch.values()) {
          if (!msg?.guild) continue;
          if (!msg.author || msg.author.bot) continue;
          await incrementMessageCountRobust(db, String(guildId), msg.author.id, msg.id, String(channelId), msg.createdAt?.toISOString?.() || new Date().toISOString());
          processed++;
          if (processed >= cap) break;
        }

        lastId = batch.last().id;
        // gentle rate limit
        await new Promise((r) => setTimeout(r, 500));
      }

      const duration = Date.now() - start;
      return res.json({ ok: true, guildId, channelId, processed, fetchedBatches, durationMs: duration, cappedAt: cap });
    } catch (e) {
      console.error('POST /stats/backfill-channel error:', e);
      return res.status(500).json({ error: e.message || "Failed to backfill channel" });
    }
  });

  // LIVE STATS ENDPOINT (for real-time web panel updates)
  router.get(`${PANEL_BASE}/api/:botKey/stats/live`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const guildId = req.query.guildId || '';

      // Get total messages
      let totalQuery = 'SELECT COUNT(*) as total FROM message_index';
      let totalParams = [];
      if (guildId) {
        totalQuery += ' WHERE guild_id = ?';
        totalParams.push(guildId);
      }
      const totalResult = await dbGet(totalQuery, totalParams);

      // Get unique users and sum of message counts
      let usersQuery = 'SELECT COUNT(DISTINCT user_id) as unique_users, SUM(message_count) as total_messages FROM user_stats';
      let usersParams = [];
      if (guildId) {
        usersQuery += ' WHERE guild_id = ?';
        usersParams.push(guildId);
      }
      const usersResult = await dbGet(usersQuery, usersParams);

      // Get top users (limited) with best-effort username lookup
      let topUsersQuery = `
        SELECT 
          us.user_id, 
          us.message_count, 
          COALESCE(uc_guild.username, uc_any.username, us.user_id) as username
        FROM user_stats us
        LEFT JOIN user_cache uc_guild ON us.user_id = uc_guild.user_id AND us.guild_id = uc_guild.guild_id
        LEFT JOIN (
          SELECT uc1.user_id, uc1.username, uc1.avatar_url, uc1.updated_at
          FROM user_cache uc1
          JOIN (
            SELECT user_id, MAX(updated_at) AS max_updated_at
            FROM user_cache
            GROUP BY user_id
          ) ucmax ON uc1.user_id = ucmax.user_id AND uc1.updated_at = ucmax.max_updated_at
        ) uc_any ON uc_any.user_id = us.user_id
      `;
      let topUsersParams = [];
      if (guildId) {
        topUsersQuery += ' WHERE us.guild_id = ?';
        topUsersParams.push(guildId);
      }
      topUsersQuery += ' ORDER BY us.message_count DESC LIMIT 10';
      const topUsers = await dbAll(topUsersQuery, topUsersParams);

      return res.json({
        ok: true,
        stats: {
          totalMessages: usersResult?.total_messages || 0,
          uniqueUsers: usersResult?.unique_users || 0,
          topUsers: topUsers || [],
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (e) {
      console.error('GET /stats/live error:', e);
      return res.status(500).json({ error: e.message || "Failed to fetch live statistics" });
    }
  });

  return router;
}

module.exports = { createStatsRouter };
