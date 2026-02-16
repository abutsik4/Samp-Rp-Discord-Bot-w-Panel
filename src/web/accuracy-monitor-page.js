"use strict";

/**
 * Accuracy Monitor Page for Admin Panel
 * 
 * Provides real-time monitoring of message counting accuracy:
 * - Current accuracy stats
 * - Recent events
 * - Error queue status
 * - Quick validation tools
 */

const { dbAll, dbGet } = require("../utils/db-helpers");
const { reconcileGuild } = require("../features/reconciliation");
const { generate } = require("./shared-template");

function generateAccuracyMonitorPage(bot, PANEL_BASE) {
  return async (req, res) => {
    try {
      const guildId = req.query.guild || null;

      // Get accuracy stats
      const stats = await getAccuracyStats(req.app.locals.db, guildId);

      // Get recent events
      const recentEvents = await getRecentEvents(req.app.locals.db, guildId, 50);

      // Get error queue status
      const errorQueueStatus = await getErrorQueueStatus(req.app.locals.db);

      const html = generate({
        title: "JepsenCloud Panel — Accuracy Monitor",
        botKey: bot.key,
        botName: bot.name,
        currentPage: "accuracy",
        head: `
    :root{color-scheme:dark;}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3);margin-bottom:20px}
    .card-title{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--accent-purple);display:flex;align-items:center;gap:8px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px}
    .stat-box{background:color-mix(in srgb, var(--accent-purple) 5%, transparent);border:1px solid color-mix(in srgb, var(--accent-purple) 20%, transparent);border-radius:8px;padding:16px;text-align:center}
    .stat-value{font-size:28px;font-weight:700;color:var(--accent-purple)}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:6px}
    .stat-box.warning{background:color-mix(in srgb, var(--accent-amber) 5%, transparent);border-color:color-mix(in srgb, var(--accent-amber) 20%, transparent)}
    .stat-box.warning .stat-value{color:var(--accent-amber)}
    .stat-box.danger{background:color-mix(in srgb, var(--accent-rose) 5%, transparent);border-color:color-mix(in srgb, var(--accent-rose) 20%, transparent)}
    .stat-box.danger .stat-value{color:var(--accent-rose)}
    .stat-box.success{background:color-mix(in srgb, var(--accent-emerald) 5%, transparent);border-color:color-mix(in srgb, var(--accent-emerald) 20%, transparent)}
    .stat-box.success .stat-value{color:var(--accent-emerald)}
    .table-container{overflow-x:auto;margin-top:12px}
    table{width:100%;border-collapse:collapse}
    th{background:color-mix(in srgb, var(--accent-purple) 5%, transparent);padding:12px;text-align:left;font-size:12px;font-weight:600;color:var(--accent-purple);border-bottom:1px solid var(--border)}
    td{padding:12px;border-bottom:1px solid color-mix(in srgb, var(--border) 35%, transparent);font-size:13px}
    tr:hover{background:color-mix(in srgb, var(--accent-cyan) 5%, transparent)}
    .event-type{padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;display:inline-block}
    .event-increment{background:color-mix(in srgb, var(--accent-emerald) 20%, transparent);color:var(--accent-emerald)}
    .event-decrement{background:color-mix(in srgb, var(--accent-rose) 20%, transparent);color:var(--accent-rose)}
    .event-retry{background:color-mix(in srgb, var(--accent-amber) 20%, transparent);color:var(--accent-amber)}
    .event-failed{background:rgba(239,68,68,.2);color:#ff6b6b}
    .event-bulk_decrement{background:rgba(88,166,255,.2);color:#5eb3ff}
    .empty{text-align:center;padding:40px 20px;color:var(--text-muted)}
    .accuracy-bar{width:100%;height:8px;background:color-mix(in srgb, var(--border) 55%, transparent);border-radius:4px;overflow:hidden;margin-top:8px}
    .accuracy-fill{height:100%;background:linear-gradient(90deg,var(--accent-emerald),var(--accent-cyan));transition:width .3s}
    .section-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .section-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  `,
        body: `
        <section class="panel-section" id="accuracy" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <div>
              <h1 class="section-title"><span>🔍</span> Accuracy Monitor</h1>
              <p class="section-subtitle">Real-time message counting accuracy and error tracking</p>
            </div>
            <div class="section-actions">
              <button onclick="history.back()" class="btn" type="button" style="padding:8px 16px">← Back</button>
              <a href="${PANEL_BASE}/verification-dashboard?bot=${bot.key}" class="btn">🔍 Verification</a>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">📈 Accuracy Statistics</div>
            <div class="grid">
              <div class="stat-box success">
                <div class="stat-value">${stats.accuracyPercent.toFixed(1)}%</div>
                <div class="stat-label">Accuracy Rate</div>
                <div class="accuracy-bar">
                  <div class="accuracy-fill" style="width:${stats.accuracyPercent}%"></div>
                </div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${stats.totalUsers.toLocaleString()}</div>
                <div class="stat-label">Total Users</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${stats.totalMessages.toLocaleString()}</div>
                <div class="stat-label">Total Messages Counted</div>
              </div>
              <div class="stat-box">
                <div class="stat-value">${stats.indexedMessages.toLocaleString()}</div>
                <div class="stat-label">Indexed Messages</div>
              </div>
              <div class="stat-box ${stats.discrepancies > 0 ? "warning" : "success"}">
                <div class="stat-value">${stats.discrepancies}</div>
                <div class="stat-label">Discrepancies</div>
              </div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">⚠️ Error Queue Status</div>
            <div class="grid">
              <div class="stat-box">
                <div class="stat-value">${errorQueueStatus.total}</div>
                <div class="stat-label">Total Errors</div>
              </div>
              <div class="stat-box ${errorQueueStatus.pending > 0 ? "warning" : "success"}">
                <div class="stat-value">${errorQueueStatus.pending}</div>
                <div class="stat-label">Pending Retry</div>
              </div>
              <div class="stat-box ${errorQueueStatus.failed > 0 ? "danger" : "success"}">
                <div class="stat-value">${errorQueueStatus.failed}</div>
                <div class="stat-label">Failed (Max Retries)</div>
              </div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">📋 Recent Events (Last 50)</div>
            ${recentEvents.length === 0 ? '<div class="empty">No events recorded yet</div>' : `
              <div class="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style="width:120px">Event Type</th>
                      <th>User</th>
                      <th>Guild ID</th>
                      <th>Details</th>
                      <th style="width:180px">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recentEvents
                      .map(
                        (e) => `
                      <tr>
                        <td><span class="event-type event-${e.event_type}">${e.event_type.toUpperCase()}</span></td>
                        <td style="font-size:12px"><div style="color:var(--text);font-weight:500">${e.username || "Unknown"}</div><code style="color:var(--accent-cyan);font-size:10px">${e.user_id || "-"}</code></td>
                        <td><code style="color:var(--accent-cyan);font-size:11px">${e.guild_id || "-"}</code></td>
                        <td style="color:var(--text-muted);font-size:12px">${e.details.newCount !== undefined ? "→ " + e.details.newCount : e.details.operation || "-"}</td>
                        <td style="color:var(--text-muted);font-size:12px">${e.time}</td>
                      </tr>
                    `
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">🛠️ Admin Tools</div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn btn-primary" onclick="runReconciliation()">Run Reconciliation</button>
              <button class="btn btn-danger" onclick="runFullSync()">Full Sync (Force)</button>
            </div>
            <div id="actionResult" style="margin-top:16px;display:none"></div>
          </div>
        </section>

  <script>
    const botKey = new URLSearchParams(window.location.search).get('bot') || '${bot.key}';
    const guildId = '${guildId || ""}';
    let updateInterval;

    async function fetchLiveStats() {
      try {
        const url = \`${PANEL_BASE}/api/\${botKey}/stats/live?guildId=\${guildId}\`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok && data.stats) {
          updateStatsDisplay(data.stats);
        }
      } catch (err) {
        console.error('Failed to fetch live stats:', err);
      }
    }

    function updateStatsDisplay(stats) {
      const accuracyBox = document.querySelector('.stat-box.success');
      if (accuracyBox && typeof stats.accuracyPercent === 'number') {
        accuracyBox.innerHTML = \`
          <div class="stat-value">\${stats.accuracyPercent.toFixed(1)}%</div>
          <div class="stat-label">Accuracy Rate</div>
          <div class="accuracy-bar">
            <div class="accuracy-fill" style="width:\${stats.accuracyPercent}%"></div>
          </div>
        \`;
      }

      const statBoxes = document.querySelectorAll('.stat-box');
      if (statBoxes[1] && typeof stats.uniqueUsers === 'number') {
        statBoxes[1].innerHTML = \`
          <div class="stat-value">\${stats.uniqueUsers.toLocaleString()}</div>
          <div class="stat-label">Total Users</div>
        \`;
      }
      if (statBoxes[2] && typeof stats.totalMessages === 'number') {
        statBoxes[2].innerHTML = \`
          <div class="stat-value">\${stats.totalMessages.toLocaleString()}</div>
          <div class="stat-label">Total Messages Counted</div>
        \`;
      }
    }

    function startLiveStats() {
      fetchLiveStats();
      updateInterval = setInterval(fetchLiveStats, 5000);
    }

    window.addEventListener('beforeunload', () => {
      if (updateInterval) clearInterval(updateInterval);
    });

    document.addEventListener('DOMContentLoaded', startLiveStats);

    function showStatus(message, type = 'info') {
      const result = document.getElementById('actionResult');
      result.textContent = message;
      result.style.display = 'block';
      result.style.color = type === 'error' ? 'var(--accent-rose)' : type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-cyan)';
    }

    async function runReconciliation() {
      try {
        showStatus('Running reconciliation...', 'info');
        const response = await fetch('${PANEL_BASE}/api/accuracy/reconcile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId: '${guildId || ""}' })
        });
        const data = await response.json();
        if (data.success) {
          showStatus('✓ Reconciliation complete: ' + JSON.stringify(data.result), 'success');
          setTimeout(() => location.reload(), 2000);
        } else {
          showStatus('✗ Error: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        showStatus('✗ Error: ' + err.message, 'error');
      }
    }

    async function runFullSync() {
      if (!confirm('This will force a full database sync. Continue?')) return;
      try {
        showStatus('Running full sync...', 'info');
        const response = await fetch('${PANEL_BASE}/api/accuracy/fullsync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guildId: '${guildId || ""}' })
        });
        const data = await response.json();
        if (data.success) {
          showStatus('✓ Full sync complete: ' + JSON.stringify(data.result), 'success');
          setTimeout(() => location.reload(), 2000);
        } else {
          showStatus('✗ Error: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        showStatus('✗ Error: ' + err.message, 'error');
      }
    }
  </script>
  `,
      });

      res.send(html);
    } catch (err) {
      console.error("[Accuracy Monitor] Error:", err);
      res.status(500).send("Error loading accuracy monitor");
    }
  };
}


/**
 * Get current accuracy statistics
 */
async function getAccuracyStats(db, guildId) {
  const stats = {
    totalUsers: 0,
    totalMessages: 0,
    indexedMessages: 0,
    discrepancies: 0,
    lastReconciliation: null,
    accuracyPercent: 100,
  };

  try {
    // Total users and messages
    const userStats = await dbGet(
      db,
      `SELECT COUNT(*) as user_count, SUM(message_count) as total_messages
       FROM user_stats
       ${guildId ? "WHERE guild_id = ?" : ""}`,
      guildId ? [guildId] : []
    );

    stats.totalUsers = userStats?.user_count || 0;
    stats.totalMessages = userStats?.total_messages || 0;

    // Indexed messages
    const indexStats = await dbGet(
      db,
      `SELECT COUNT(*) as indexed_count FROM message_index ${guildId ? "WHERE guild_id = ?" : ""}`,
      guildId ? [guildId] : []
    );

    stats.indexedMessages = indexStats?.indexed_count || 0;

    // Quick discrepancy check (users with count != index count)
    const discrepancyCheck = await dbAll(
      db,
      `SELECT 
        us.user_id,
        us.message_count as stored_count,
        COALESCE(mi.index_count, 0) as index_count
      FROM user_stats us
      LEFT JOIN (
        SELECT user_id, COUNT(*) as index_count
        FROM message_index
        ${guildId ? "WHERE guild_id = ?" : ""}
        GROUP BY user_id
      ) mi ON us.user_id = mi.user_id
      WHERE us.message_count != COALESCE(mi.index_count, 0)
      ${guildId ? "AND us.guild_id = ?" : ""}`,
      guildId ? [guildId, guildId] : []
    );

    stats.discrepancies = discrepancyCheck.length;
    stats.accuracyPercent =
      stats.totalUsers > 0 ? ((stats.totalUsers - stats.discrepancies) / stats.totalUsers) * 100 : 100;

    return stats;
  } catch (err) {
    console.error("[Accuracy Stats] Error:", err);
    return stats;
   }
}

/**
 * Get recent events from event log
 */
async function getRecentEvents(db, guildId, limit = 50) {
  try {
    const events = await dbAll(
      db,
      `SELECT 
        e.*,
        COALESCE(uc.username, 'Unknown') as username
       FROM message_count_events e
       LEFT JOIN user_cache uc ON e.user_id = uc.user_id AND e.guild_id = uc.guild_id
       ${guildId ? "WHERE e.guild_id = ?" : ""}
       ORDER BY e.timestamp DESC
       LIMIT ?`,
      guildId ? [guildId, limit] : [limit]
    );

    return events.map((e) => ({
      ...e,
      details: e.details ? JSON.parse(e.details) : {},
      time: new Date(e.timestamp * 1000).toLocaleString(),
    }));
  } catch (err) {
    console.error("[Recent Events] Error:", err);
    return [];
  }
}

/**
 * Get error queue status
 */
async function getErrorQueueStatus(db) {
  try {
    const total = await dbGet(db, `SELECT COUNT(*) as count FROM message_count_errors`);
    const pending = await dbGet(db, `SELECT COUNT(*) as count FROM message_count_errors WHERE retry_count < 3`);
    const failed = await dbGet(db, `SELECT COUNT(*) as count FROM message_count_errors WHERE retry_count >= 3`);

    return {
      total: total?.count || 0,
      pending: pending?.count || 0,
      failed: failed?.count || 0,
    };
  } catch (err) {
    console.error("[Error Queue Status] Error:", err);
    return { total: 0, pending: 0, failed: 0 };
  }
}

/**
 * API endpoint: Run reconciliation
 */
function apiRunReconciliation(db) {
  return async (req, res) => {
    try {
      const { guildId } = req.body;

      if (!guildId) {
        return res.json({ success: false, error: "Missing guild ID" });
      }

      const result = await reconcileGuild(db, guildId);

      res.json({
        success: true,
        result,
      });
    } catch (err) {
      console.error("[API Reconciliation] Error:", err);
      res.json({ success: false, error: err.message });
    }
  };
}

/**
 * API endpoint: Get live stats
 */
function apiLiveStats(db) {
  return async (req, res) => {
    try {
      const guildId = req.query.guild || null;
      const stats = await getAccuracyStats(db, guildId);
      const events = await getRecentEvents(db, guildId, 10);
      const errors = await getErrorQueueStatus(db);

      res.json({
        success: true,
        stats,
        events,
        errors,
      });
    } catch (err) {
      console.error("[API Live Stats] Error:", err);
      res.json({ success: false, error: err.message });
    }
  };
}

module.exports = {
  generateAccuracyMonitorPage,
  apiRunReconciliation,
  apiLiveStats,
};
