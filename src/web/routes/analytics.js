/**
 * Analytics API routes.
 * Handles daily/channel statistics and analytics summaries.
 */

const express = require('express');
const { findBot, getDbGet, getDbAll } = require('../context');

function createAnalyticsRouter({ requireAuth, apiLimiter }) {
  const router = express.Router();
  const dbGet = getDbGet();
  const dbAll = getDbAll();

  // Get channels list for filter
  router.get('/api/:botKey/analytics/channels', requireAuth, apiLimiter, async (req, res) => {
    const bot = findBot(req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const guildId = req.query.guildId || null;
      
      let query = 'SELECT DISTINCT channel_id, COUNT(*) as message_count FROM daily_channel_stats';
      let params = [];
      
      if (guildId) {
        query += ' WHERE guild_id = ?';
        params.push(guildId);
      }
      
      query += ' GROUP BY channel_id ORDER BY message_count DESC';
      
      const channels = await dbAll(query, params);
      
      return res.json({
        ok: true,
        channels: channels.map(ch => ({
          channel_id: ch.channel_id,
          message_count: ch.message_count,
          channel_name: null
        }))
      });
    } catch (e) {
      console.error('GET /analytics/channels error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Get analytics summary with filters
  router.get('/api/:botKey/analytics/summary', requireAuth, apiLimiter, async (req, res) => {
    const bot = findBot(req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const guildId = req.query.guildId || null;
      const startDate = req.query.start_date || null;
      const endDate = req.query.end_date || null;
      const channelId = req.query.channel_id || null;

      const whereClauses = [];
      const params = [];

      if (guildId) {
        whereClauses.push('guild_id = ?');
        params.push(guildId);
      }
      if (startDate) {
        whereClauses.push('message_date >= ?');
        params.push(startDate);
      }
      if (endDate) {
        whereClauses.push('message_date <= ?');
        params.push(endDate);
      }
      if (channelId) {
        whereClauses.push('channel_id = ?');
        params.push(channelId);
      }

      const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

      const summaryQuery = `
        SELECT 
          SUM(count) as total_messages,
          COUNT(DISTINCT user_id) as active_users,
          COUNT(DISTINCT channel_id) as active_channels,
          COUNT(DISTINCT message_date) as days_count
        FROM daily_channel_stats
        ${whereClause}
      `;
      const summary = await dbGet(summaryQuery, params);

      const topUsersQuery = `
        SELECT user_id, SUM(count) as message_count
        FROM daily_channel_stats
        ${whereClause}
        GROUP BY user_id
        ORDER BY message_count DESC
        LIMIT 20
      `;
      const topUsers = await dbAll(topUsersQuery, params);

      const topChannelsQuery = `
        SELECT channel_id, SUM(count) as message_count
        FROM daily_channel_stats
        ${whereClause}
        GROUP BY channel_id
        ORDER BY message_count DESC
        LIMIT 20
      `;
      const topChannels = await dbAll(topChannelsQuery, params);

      const dailyQuery = `
        SELECT message_date, SUM(count) as message_count
        FROM daily_channel_stats
        ${whereClause}
        GROUP BY message_date
        ORDER BY message_date ASC
      `;
      const dailyActivity = await dbAll(dailyQuery, params);

      const totalMessages = summary?.total_messages || 0;
      const avgPerDay = summary?.days_count > 0 ? totalMessages / summary.days_count : 0;

      const enrichedUsers = await Promise.all(
        topUsers.map(async (user) => {
          const cached = await dbGet(
            'SELECT username FROM user_cache WHERE user_id = ? LIMIT 1',
            [user.user_id]
          );
          return {
            ...user,
            username: cached?.username || user.user_id,
            percentage: totalMessages > 0 ? (user.message_count / totalMessages) * 100 : 0
          };
        })
      );

      return res.json({
        ok: true,
        totalMessages,
        activeUsers: summary?.active_users || 0,
        activeChannels: summary?.active_channels || 0,
        avgPerDay,
        topUsers: enrichedUsers,
        topChannels: topChannels.map(ch => ({
          ...ch,
          channel_name: null,
          percentage: totalMessages > 0 ? (ch.message_count / totalMessages) * 100 : 0
        })),
        dailyActivity: dailyActivity || []
      });
    } catch (e) {
      console.error('GET /analytics/summary error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createAnalyticsRouter };
