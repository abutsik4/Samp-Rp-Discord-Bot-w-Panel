// Operation History Page
// Web panel for viewing and undoing bulk operations

function generateHistoryPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Operation History</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-main);color:var(--text);line-height:1.6}
    .wrap{max-width:1400px;margin:0 auto;padding:20px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .title{font-weight:700;font-size:24px;display:flex;align-items:center;gap:8px}
    .title .gradient-text{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .title .emoji{font-size:28px}
    .subtitle{color:var(--text-muted);font-size:14px;margin-top:4px}
    .nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .nav a{color:var(--accent-cyan);text-decoration:none;font-size:14px;transition:color .2s}
    .nav a:hover{color:var(--accent-purple)}
    .btn{padding:10px 18px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:all .2s}
    .btn:hover{background:rgba(30,41,59,.9);border-color:var(--accent-purple)}
    .btn-primary{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));border:none;color:#fff;font-weight:600}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .btn-warning{background:var(--accent-amber);border:none;color:#000;font-weight:600}
    .btn-warning:hover{opacity:.9}
    .btn-sm{padding:6px 12px;font-size:13px}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,.3);margin-bottom:20px}
    .card-title{font-size:18px;font-weight:600;margin-bottom:16px;color:var(--accent-purple);display:flex;align-items:center;gap:8px}
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .operation-list{list-style:none}
    .operation-item{background:rgba(167,139,250,.05);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;transition:all .2s}
    .operation-item:hover{background:rgba(167,139,250,.1);border-color:var(--accent-purple)}
    .operation-item.undone{opacity:.6;background:rgba(100,100,100,.05)}
    .operation-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:12px}
    .operation-title{font-weight:600;font-size:16px;display:flex;align-items:center;gap:8px}
    .operation-badge{padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600}
    .badge-active{background:var(--accent-emerald);color:#000}
    .badge-undone{background:var(--text-muted);color:#fff}
    .operation-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
    .meta-item{font-size:13px}
    .meta-label{color:var(--text-muted);font-size:12px;display:block}
    .meta-value{color:var(--text);font-weight:500}
    .empty-state{text-align:center;padding:60px 20px;color:var(--text-muted)}
    .empty-state-icon{font-size:64px;margin-bottom:16px}
    .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:20px}
    .stat-box{background:linear-gradient(135deg,rgba(167,139,250,.1),rgba(34,211,238,.1));border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center}
    .stat-value{font-size:32px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:8px;text-transform:uppercase;letter-spacing:.5px}
    .details-toggle{cursor:pointer;color:var(--accent-cyan);font-size:13px;margin-top:8px;display:inline-block}
    .details-toggle:hover{text-decoration:underline}
    .operation-details{margin-top:12px;padding:12px;background:rgba(0,0,0,.2);border-radius:6px;font-family:'Courier New',monospace;font-size:12px;max-height:200px;overflow-y:auto}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">📜</span><span class="gradient-text">Operation History</span></div>
        <div class="subtitle">Bot: ${bot.name} (${bot.key})</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button">← Back</button>
        <a href="${PANEL_BASE}/bot/${bot.key}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/stats">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/rate-limits">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/consecutive-limits">🚫 Consecutive</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/messages">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/ai-engagement">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/commands">📚 Commands</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/accuracy">🎯 Accuracy</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/whitelist">📋 Whitelist</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/automod">🛡️ AutoMod</a>
        <a href="${PANEL_BASE}/verification-dashboard?bot=${bot.key}">🔍 Verification</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div id="alertContainer"></div>

    <div class="alert alert-info">
      <strong>ℹ️ Operation History:</strong> Track all bulk operations performed on server data. 
      You can undo operations to restore previous state.
    </div>

    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-value" id="totalOps">-</div>
        <div class="stat-label">Total Operations</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" id="activeOps">-</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat-box">
        <div class="stat-value" id="undoneOps">-</div>
        <div class="stat-label">Undone</div>
      </div>
    </div>

    <!-- Operations -->
    <div class="card">
      <div class="card-title">
        <span>🕐 Recent Operations</span>
      </div>
      <ul class="operation-list" id="operationsContainer">
        <li class="empty-state">
          <div class="empty-state-icon">⏳</div>
          <div>Loading operations...</div>
        </li>
      </ul>
    </div>
  </div>

  <script>
    const botKey = '${bot.key}';
    const guildId = '${bot.guild_id}';

    async function loadOperations() {
      try {
        const res = await fetch(\`/api/bot/\${botKey}/history?limit=50\`);
        const data = await res.json();
        
        const container = document.getElementById('operationsContainer');
        document.getElementById('totalOps').textContent = data.operations.length;
        document.getElementById('activeOps').textContent = data.operations.filter(o => !o.undone).length;
        document.getElementById('undoneOps').textContent = data.operations.filter(o => o.undone).length;
        
        if (data.operations.length === 0) {
          container.innerHTML = '<li class="empty-state"><div class="empty-state-icon">📭</div><div>No operations recorded yet.</div></li>';
          return;
        }
        
        container.innerHTML = '';
        
        data.operations.forEach(op => {
          const li = document.createElement('li');
          li.className = 'operation-item' + (op.undone ? ' undone' : '');
          
          const timestamp = new Date(op.timestamp * 1000);
          const timeAgo = getTimeAgo(timestamp);
          
          li.innerHTML = \`
            <div class="operation-header">
              <div class="operation-title">
                <span>\${getOperationIcon(op.operation)}</span>
                <span>\${op.operation}</span>
                <span class="operation-badge \${op.undone ? 'badge-undone' : 'badge-active'}">
                  \${op.undone ? '❌ Undone' : '✅ Active'}
                </span>
              </div>
              \${!op.undone ? \`<button class="btn btn-warning btn-sm" onclick="undoOperation(\${op.id})">⏮️ Undo</button>\` : ''}
            </div>
            <div class="operation-meta">
              <div class="meta-item">
                <span class="meta-label">ID</span>
                <div class="meta-value">#\${op.id}</div>
              </div>
              <div class="meta-item">
                <span class="meta-label">Actor</span>
                <div class="meta-value"><@\${op.actor_id}></div>
              </div>
              <div class="meta-item">
                <span class="meta-label">Scope</span>
                <div class="meta-value">\${op.scope}</div>
              </div>
              <div class="meta-item">
                <span class="meta-label">When</span>
                <div class="meta-value">\${timestamp.toLocaleString()}</div>
                <div style="font-size:11px;color:var(--text-muted);margin-top:2px">\${timeAgo}</div>
              </div>
            </div>
            <a class="details-toggle" onclick="toggleDetails(\${op.id})">🔍 View Details</a>
            <div id="details-\${op.id}" class="operation-details" style="display:none">
              <strong>Before:</strong><br><pre>\${JSON.stringify(JSON.parse(op.payload_before), null, 2)}</pre>
              <br><strong>After:</strong><br><pre>\${JSON.stringify(JSON.parse(op.payload_after), null, 2)}</pre>
            </div>
          \`;
          container.appendChild(li);
        });
      } catch (err) {
        console.error('Failed to load operations:', err);
        showAlert('Failed to load operations', 'warning');
      }
    }

    async function undoOperation(id) {
      if (!confirm(\`Undo operation #\${id}? This will restore the previous state.\`)) return;
      
      try {
        const res = await fetch(\`/api/bot/\${botKey}/history/\${id}/undo\`, {
          method: 'POST'
        });
        
        if (res.ok) {
          showAlert(\`Operation #\${id} undone successfully\`, 'success');
          loadOperations();
        } else {
          const data = await res.json();
          showAlert(data.error || 'Failed to undo operation', 'warning');
        }
      } catch (err) {
        console.error('Failed to undo operation:', err);
        showAlert('Error undoing operation', 'warning');
      }
    }

    function toggleDetails(id) {
      const el = document.getElementById(\`details-\${id}\`);
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    function getOperationIcon(op) {
      const icons = {
        'reset_user': '🔄',
        'reset_all': '🗑️',
        'set_user': '✏️',
        'bulk_update': '📝'
      };
      return icons[op] || '📌';
    }

    function getTimeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      if (seconds < 60) return \`\${seconds}s ago\`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return \`\${minutes}m ago\`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return \`\${hours}h ago\`;
      const days = Math.floor(hours / 24);
      return \`\${days}d ago\`;
    }

    function showAlert(message, type = 'info') {
      const container = document.getElementById('alertContainer');
      const alert = document.createElement('div');
      alert.className = \`alert alert-\${type}\`;
      alert.textContent = message;
      container.appendChild(alert);
      setTimeout(() => alert.remove(), 5000);
    }

    loadOperations();
    setInterval(loadOperations, 30000); // Refresh every 30s
  </script>
</body>
</html>`;
}

module.exports = { generateHistoryPage };
