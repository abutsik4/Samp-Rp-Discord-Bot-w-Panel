/**
 * Verification API routes.
 * Handles message count verification and accuracy checks.
 */

const express = require('express');
const { findBot, getDbGet, getDbAll, getBots, getPanelBase } = require('../context');

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createVerificationRouter({ requireAuth, apiLimiter }) {
  const router = express.Router();
  const dbGet = getDbGet();
  const dbAll = getDbAll();

  // Get message count for a user
  router.get('/api/:botKey/verify/user-count', requireAuth, apiLimiter, async (req, res) => {
    const bot = findBot(req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { userId, guildId } = req.query;
      if (!userId) return res.status(400).json({ error: "userId required" });
      
      let query = "SELECT COUNT(*) as count FROM message_index WHERE user_id = ?";
      let params = [userId];
      
      if (guildId) {
        query += " AND guild_id = ?";
        params.push(guildId);
      }
      
      const result = await dbGet(query, params);
      
      return res.json({
        ok: true,
        userId,
        guildId: guildId || null,
        messageCount: result?.count || 0
      });
    } catch (e) {
      console.error('GET /verify/user-count error:', e);
      return res.status(500).json({ error: e.message || "Failed to count messages" });
    }
  });

  // Check if a specific message is counted
  router.get('/api/:botKey/verify/message-counted', requireAuth, apiLimiter, async (req, res) => {
    const bot = findBot(req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { messageId } = req.query;
      if (!messageId) return res.status(400).json({ error: "messageId required" });
      
      const message = await dbGet(
        "SELECT * FROM message_index WHERE message_id = ?",
        [messageId]
      );
      
      if (!message) {
        return res.json({
          ok: true,
          messageId,
          found: false,
          message: null
        });
      }
      
      return res.json({
        ok: true,
        messageId,
        found: true,
        message: {
          userId: message.user_id,
          guildId: message.guild_id,
          createdAt: message.created_at
        }
      });
    } catch (e) {
      console.error('GET /verify/message-counted error:', e);
      return res.status(500).json({ error: e.message || "Failed to check message" });
    }
  });

  // Get user stats overview
  router.get('/api/:botKey/verify/user-stats', requireAuth, apiLimiter, async (req, res) => {
    const bot = findBot(req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { userId, guildId } = req.query;
      if (!userId) return res.status(400).json({ error: "userId required" });
      
      let statsQuery = "SELECT message_count FROM user_stats WHERE user_id = ?";
      let statsParams = [userId];
      if (guildId) {
        statsQuery += " AND guild_id = ?";
        statsParams.push(guildId);
      }
      
      const stats = await dbGet(statsQuery, statsParams);
      
      let indexQuery = "SELECT COUNT(*) as count FROM message_index WHERE user_id = ?";
      let indexParams = [userId];
      if (guildId) {
        indexQuery += " AND guild_id = ?";
        indexParams.push(guildId);
      }
      
      const indexed = await dbGet(indexQuery, indexParams);
      
      let usernameQuery = "SELECT username FROM user_cache WHERE user_id = ?";
      let usernameParams = [userId];
      if (guildId) {
        usernameQuery += " AND guild_id = ?";
        usernameParams.push(guildId);
      }
      
      const userCache = await dbGet(usernameQuery, usernameParams);
      
      return res.json({
        ok: true,
        userId,
        username: userCache?.username || "Unknown",
        storedCount: stats?.message_count || 0,
        indexedCount: indexed?.count || 0,
        discrepancy: (indexed?.count || 0) - (stats?.message_count || 0)
      });
    } catch (e) {
      console.error('GET /verify/user-stats error:', e);
      return res.status(500).json({ error: e.message || "Failed to get user stats" });
    }
  });

  // Get all verification results
  router.get('/api/:botKey/verify/results', requireAuth, apiLimiter, async (req, res) => {
    const bot = findBot(req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const results = await dbAll(
        `SELECT 
          r.*,
          COALESCE(uc.username, r.user_id) as username
         FROM message_count_reference r
         LEFT JOIN user_cache uc ON r.user_id = uc.user_id
         ORDER BY ABS(r.difference) DESC
         LIMIT 100`,
        []
      );
      
      return res.json({
        ok: true,
        results: results || [],
        summary: {
          total: (results || []).length,
          perfect: (results || []).filter(r => r.difference === 0).length,
          discrepancies: (results || []).filter(r => r.difference !== 0).length
        }
      });
    } catch (e) {
      console.error('GET /verify/results error:', e);
      return res.status(500).json({ error: e.message || "Failed to fetch verification results" });
    }
  });

  // Verification dashboard page (simplified - delegates to main handler)
  router.get('/verification-dashboard', requireAuth, async (req, res) => {
    const bots = getBots();
    const PANEL_BASE = getPanelBase();
    const bot = bots.find((b) => b.key === req.query.bot);
    
    if (!bot) {
      const botList = bots.map(b => `<li><a href="${PANEL_BASE}/verification-dashboard?bot=${encodeURIComponent(b.key)}">${escapeHtml(b.name)}</a></li>`).join('');
      return res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Select Bot</title>
  <style>
    body { font-family: system-ui; background: #0a0e17; color: #e5e7eb; padding: 20px; }
    .wrap { max-width: 600px; margin: 0 auto; }
    h1 { color: #a78bfa; }
    ul { list-style: none; padding: 0; }
    li { margin: 10px 0; }
    a { color: #22d3ee; text-decoration: none; padding: 10px; display: block; border-radius: 6px; background: rgba(34,211,238,.1); }
    a:hover { background: rgba(34,211,238,.2); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Select a Bot</h1>
    <p>Choose which bot's verification dashboard you want to access:</p>
    <ul>${botList || '<li>No bots available</li>'}</ul>
    <hr style="border-color: rgba(45,55,75,.5); margin-top: 20px;">
    <p><a href="${PANEL_BASE}" style="color: #22d3ee;">← Back to Panel</a></p>
  </div>
</body>
</html>`);
    }

    // For the actual dashboard, we need to return the full inline HTML
    // This is kept in index.js for now due to its size
    return res.redirect(`${PANEL_BASE}/verification-dashboard-full?bot=${encodeURIComponent(bot.key)}`);
  });

  return router;
}

module.exports = { createVerificationRouter };
