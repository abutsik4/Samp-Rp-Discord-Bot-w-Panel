const { Router } = require("express");

function createAnalyticsRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, apiLimiter, bots,
    db, dbRun, dbGet, dbAll, client,
    escapeHtml, panelHttpLogger,
  } = ctx;

  // ========================
  // ANALYTICS API ENDPOINTS
  // ========================

  // Get channels list for filter
  router.get(`${PANEL_BASE}/api/:botKey/analytics/channels`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
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
          channel_name: null // Will be filled by frontend with Discord data
        }))
      });
    } catch (e) {
      console.error('GET /analytics/channels error:', e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Get analytics summary with filters
  router.get(`${PANEL_BASE}/api/:botKey/analytics/summary`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const guildId = req.query.guildId || null;
      const startDate = req.query.start_date || null;
      const endDate = req.query.end_date || null;
      const channelId = req.query.channel_id || null;

      // Build WHERE clause
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

      // Get summary stats
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

      // Get top users
      const topUsersQuery = `
        SELECT 
          user_id,
          SUM(count) as message_count
        FROM daily_channel_stats
        ${whereClause}
        GROUP BY user_id
        ORDER BY message_count DESC
        LIMIT 20
      `;
      const topUsers = await dbAll(topUsersQuery, params);

      // Get top channels
      const topChannelsQuery = `
        SELECT 
          channel_id,
          SUM(count) as message_count
        FROM daily_channel_stats
        ${whereClause}
        GROUP BY channel_id
        ORDER BY message_count DESC
        LIMIT 20
      `;
      const topChannels = await dbAll(topChannelsQuery, params);

      // Get daily activity
      const dailyQuery = `
        SELECT 
          message_date,
          SUM(count) as message_count
        FROM daily_channel_stats
        ${whereClause}
        GROUP BY message_date
        ORDER BY message_date ASC
      `;
      const dailyActivity = await dbAll(dailyQuery, params);

      const totalMessages = summary?.total_messages || 0;
      const avgPerDay = summary?.days_count > 0 ? totalMessages / summary.days_count : 0;

      // Enrich top users with usernames
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

  // ============================================================================
  // VERIFICATION API ENDPOINTS
  // ============================================================================

  // Get message count for a user
  router.get(`${PANEL_BASE}/api/:botKey/verify/user-count`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
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
  router.get(`${PANEL_BASE}/api/:botKey/verify/message-counted`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
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
  router.get(`${PANEL_BASE}/api/:botKey/verify/user-stats`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const { userId, guildId } = req.query;
      if (!userId) return res.status(400).json({ error: "userId required" });
      
      // Get stats
      let statsQuery = "SELECT message_count FROM user_stats WHERE user_id = ?";
      let statsParams = [userId];
      if (guildId) {
        statsQuery += " AND guild_id = ?";
        statsParams.push(guildId);
      }
      
      const stats = await dbGet(statsQuery, statsParams);
      
      // Get indexed count
      let indexQuery = "SELECT COUNT(*) as count FROM message_index WHERE user_id = ?";
      let indexParams = [userId];
      if (guildId) {
        indexQuery += " AND guild_id = ?";
        indexParams.push(guildId);
      }
      
      const indexed = await dbGet(indexQuery, indexParams);
      
      // Get username
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
  router.get(`${PANEL_BASE}/api/:botKey/verify/results`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
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

  // VERIFICATION DASHBOARD PAGE
  router.get(`${PANEL_BASE}/verification-dashboard`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.query.bot);
    if (!bot) {
      // If no bot specified, show bot selection screen
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

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Verification Dashboard</title>
  <style>
    :root{
      --bg-main:#0a0e17;
      --bg-card:rgba(12,17,29,.92);
      --border:rgba(45,55,75,.85);
      --text:#e5e7eb;
      --text-muted:#9ca3af;
      --accent-purple:#a78bfa;
      --accent-cyan:#22d3ee;
      --accent-emerald:#34d399;
      --accent-rose:#fb7185;
      --accent-yellow:#fbbf24;
      --input-bg:rgba(17,24,39,.9);
      color-scheme:dark;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-main);color:var(--text);line-height:1.6}
    .wrap{max-width:1400px;margin:0 auto;padding:20px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .title{font-weight:700;font-size:24px;display:flex;align-items:center;gap:8px}
    .title .emoji{font-size:28px}
    .muted{color:var(--text-muted);font-size:13px;margin-top:4px}
    .nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .nav a{color:var(--accent-cyan);text-decoration:none;font-size:14px;transition:color .2s;padding:8px 12px;border-radius:6px}
    .nav a:hover{background:rgba(34,211,238,.1);color:var(--accent-purple)}
    .btn{padding:10px 18px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:all .2s}
    .btn:hover{background:rgba(30,41,59,.9);border-color:var(--accent-purple)}
    .btn-primary{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));border:none;color:#fff;font-weight:600}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3);margin-bottom:20px}
    .card-title{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--accent-purple);display:flex;align-items:center;gap:8px}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;font-size:12px;font-weight:500;margin-bottom:6px;color:var(--text-muted)}
    .form-group input,.form-group textarea{width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-family:inherit;font-size:14px}
    .form-group input:focus,.form-group textarea:focus{outline:none;border-color:var(--accent-purple);box-shadow:0 0 0 2px rgba(167,139,250,.1)}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-bottom:16px}
    .stat-box{background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.2);border-radius:8px;padding:16px;text-align:center}
    .stat-value{font-size:28px;font-weight:700;color:var(--accent-purple)}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:6px;text-transform:uppercase;letter-spacing:.5px}
    .stat-box.success{background:rgba(52,211,153,.05);border-color:rgba(52,211,153,.2)}
    .stat-box.success .stat-value{color:var(--accent-emerald)}
    .stat-box.warning{background:rgba(251,191,36,.05);border-color:rgba(251,191,36,.2)}
    .stat-box.warning .stat-value{color:var(--accent-yellow)}
    .stat-box.danger{background:rgba(251,113,133,.05);border-color:rgba(251,113,133,.2)}
    .stat-box.danger .stat-value{color:var(--accent-rose)}
    .result{background:rgba(167,139,250,.05);border:1px solid rgba(167,139,250,.2);border-radius:8px;padding:12px;margin-bottom:10px;font-size:13px}
    .result.found{background:rgba(52,211,153,.05);border-color:rgba(52,211,153,.2);color:var(--accent-emerald)}
    .result.not-found{background:rgba(251,113,133,.05);border-color:rgba(251,113,133,.2);color:var(--accent-rose)}
    .loading{text-align:center;padding:20px;color:var(--text-muted)}
    .error{background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.3);color:var(--accent-rose);padding:12px;border-radius:8px;margin-bottom:16px}
    .success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald);padding:12px;border-radius:8px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th{background:rgba(167,139,250,.05);padding:12px;text-align:left;font-size:12px;font-weight:600;color:var(--accent-purple);border-bottom:1px solid var(--border)}
    td{padding:12px;border-bottom:1px solid rgba(45,55,75,.3);font-size:13px}
    tr:hover{background:rgba(34,211,238,.03)}
    .tabs{display:flex;gap:8px;border-bottom:1px solid var(--border);margin-bottom:20px}
    .tab{padding:12px 16px;border:none;background:none;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .2s}
    .tab.active{color:var(--accent-purple);border-bottom-color:var(--accent-purple)}
    .tab-content{display:none}
    .tab-content.active{display:block}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">🔍</span> Verification Dashboard</div>
        <div class="muted">Check message counts and verify data accuracy</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 16px">← Back</button>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/stats">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/rate-limits">🛡️ Spam Limits</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/messages">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/ai-engagement">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/commands">📚 Commands</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/accuracy">🎯 Accuracy</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <!-- Tabs -->
    <div class="card">
      <div class="tabs">
        <button class="tab active" onclick="switchTab('user-check')">👤 Check User</button>
        <button class="tab" onclick="switchTab('message-check')">💬 Check Message</button>
        <button class="tab" onclick="switchTab('results')">📊 Results</button>
      </div>

      <!-- User Count Checker -->
      <div id="user-check" class="tab-content active">
        <div class="card-title">Check Message Count for User</div>
        <div class="form-group">
          <label>User ID</label>
          <input type="text" id="userId" placeholder="Enter Discord User ID">
        </div>
        <div class="form-group">
          <label>Guild ID (optional)</label>
          <input type="text" id="guildId" placeholder="Leave empty for all guilds">
        </div>
        <button class="btn btn-primary" onclick="checkUserCount()">Check Count</button>
        <div id="userResult" style="margin-top:16px;display:none"></div>
      </div>

      <!-- Message Checker -->
      <div id="message-check" class="tab-content">
        <div class="card-title">Check if Message is Counted</div>
        <div class="form-group">
          <label>Message ID</label>
          <input type="text" id="messageId" placeholder="Right-click message → Copy Message Link, extract ID">
        </div>
        <button class="btn btn-primary" onclick="checkMessage()">Check Message</button>
        <div id="messageResult" style="margin-top:16px;display:none"></div>
      </div>

      <!-- Results History -->
      <div id="results" class="tab-content">
        <div class="card-title">Verification Results</div>
        <div id="resultsContainer" style="margin-top:16px">
          <div class="loading">Loading...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const botKey = '${bot.key}';
    const apiBase = \`${PANEL_BASE}/api/\${botKey}\`;

    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      event.target.classList.add('active');
    }

    async function checkUserCount() {
      const userId = document.getElementById('userId').value.trim();
      const guildId = document.getElementById('guildId').value.trim();
      const resultDiv = document.getElementById('userResult');

      if (!userId) {
        resultDiv.innerHTML = '<div class="error">❌ Please enter a User ID</div>';
        resultDiv.style.display = 'block';
        return;
      }

      resultDiv.innerHTML = '<div class="loading">⏳ Checking...</div>';
      resultDiv.style.display = 'block';

      try {
        const url = \`\${apiBase}/verify/user-stats?userId=\${userId}\${guildId ? '&guildId=' + guildId : ''}\`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.ok) {
          resultDiv.innerHTML = \`<div class="error">❌ \${data.error}</div>\`;
          return;
        }

        const { storedCount, indexedCount, discrepancy, username } = data;
        const status = discrepancy === 0 ? '✅ Match' : (discrepancy > 0 ? '⚠️ Missing' : '⚠️ Extra');
        
        resultDiv.innerHTML = \`
          <div class="success">
            <strong>\${username}</strong> (\${userId})
            <br>Stored: \${storedCount} | Indexed: \${indexedCount} | Difference: \${discrepancy >= 0 ? '+' : ''}\${discrepancy}
            <br>\${status}
          </div>
        \`;
      } catch (err) {
        resultDiv.innerHTML = \`<div class="error">❌ Error: \${err.message}</div>\`;
      }
    }

    async function checkMessage() {
      const messageId = document.getElementById('messageId').value.trim();
      const resultDiv = document.getElementById('messageResult');

      if (!messageId) {
        resultDiv.innerHTML = '<div class="error">❌ Please enter a Message ID</div>';
        resultDiv.style.display = 'block';
        return;
      }

      resultDiv.innerHTML = '<div class="loading">⏳ Checking...</div>';
      resultDiv.style.display = 'block';

      try {
        const response = await fetch(\`\${apiBase}/verify/message-counted?messageId=\${messageId}\`);
        const data = await response.json();

        if (!data.ok) {
          resultDiv.innerHTML = \`<div class="error">❌ \${data.error}</div>\`;
          return;
        }

        if (!data.found) {
          resultDiv.innerHTML = \`<div class="result not-found">❌ Message NOT found in database</div>\`;
        } else {
          const msg = data.message;
          resultDiv.innerHTML = \`
            <div class="result found">
              ✅ Message IS counted!
              <br>User: \${msg.userId}
              <br>Guild: \${msg.guildId}
              <br>Created: \${msg.createdAt}
            </div>
          \`;
        }
      } catch (err) {
        resultDiv.innerHTML = \`<div class="error">❌ Error: \${err.message}</div>\`;
      }
    }

    async function loadResults() {
      try {
        const response = await fetch(\`\${apiBase}/verify/results\`);
        const data = await response.json();

        if (!data.ok) {
          document.getElementById('resultsContainer').innerHTML = \`<div class="error">❌ \${data.error}</div>\`;
          return;
        }

        const { results, summary } = data;

        let html = \`
          <div class="grid">
            <div class="stat-box success">
              <div class="stat-value">\${summary.total}</div>
              <div class="stat-label">Total Verified</div>
            </div>
            <div class="stat-box success">
              <div class="stat-value">\${summary.perfect}</div>
              <div class="stat-label">Perfect Matches</div>
            </div>
            <div class="stat-box warning">
              <div class="stat-value">\${summary.discrepancies}</div>
              <div class="stat-label">Discrepancies</div>
            </div>
          </div>
        \`;

        if (results.length > 0) {
          html += \`<table>
            <thead>
              <tr>
                <th>User</th>
                <th>Discord Count</th>
                <th>Bot Count</th>
                <th>Difference</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>\`;

          results.forEach(r => {
            const diffClass = r.difference === 0 ? 'success' : 'warning';
            const diffStr = r.difference >= 0 ? '+' + r.difference : r.difference;
            html += \`
              <tr>
                <td>\${r.username}</td>
                <td>\${r.discord_search_count}</td>
                <td>\${r.bot_count}</td>
                <td class=\"\${diffClass}\">\${diffStr}</td>
                <td>\${r.verified_at.substring(0, 10)}</td>
              </tr>
            \`;
          });

          html += \`</tbody></table>\`;
        }

        document.getElementById('resultsContainer').innerHTML = html;
      } catch (err) {
        document.getElementById('resultsContainer').innerHTML = \`<div class="error">❌ Error: \${err.message}</div>\`;
      }
    }

    // Load results when page loads
    document.addEventListener('DOMContentLoaded', () => {
      loadResults();
    });
  </script>
</body>
</html>`;

    res.send(html);
  });

  return router;
}

module.exports = { createAnalyticsRouter };
