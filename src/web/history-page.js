// Operation History Page

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateHistoryPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Operation History</title>
  <link rel="stylesheet" href="/shared.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <style>
    ${generateSidebarStyles()}
    
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .operation-list{list-style:none}
    .operation-item{background:color-mix(in srgb, var(--accent-purple) 5%, transparent);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;transition:all .2s}
    .operation-item:hover{background:color-mix(in srgb, var(--accent-purple) 10%, transparent);border-color:var(--accent-purple)}
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
    .stat-box{background:linear-gradient(135deg,color-mix(in srgb, var(--accent-purple) 10%, transparent),color-mix(in srgb, var(--accent-cyan) 10%, transparent));border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center}
    .stat-value{font-size:32px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:8px;text-transform:uppercase;letter-spacing:.5px}
    .details-toggle{cursor:pointer;color:var(--accent-cyan);font-size:13px;margin-top:8px;display:inline-block}
    .details-toggle:hover{text-decoration:underline}
    .operation-details{margin-top:12px;padding:12px;background:rgba(0,0,0,.2);border-radius:6px;font-family:'Courier New',monospace;font-size:12px;max-height:200px;overflow-y:auto}
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'History',
      icon: '📜',
      botKey: bot.key,
      PANEL_BASE,
      currentPage: 'history'
    })}

    <main class="main-scroll-container">
      <div class="scroll-progress">
        <div class="scroll-progress-bar" id="scrollProgressBar"></div>
      </div>

      <div data-scroll-container id="scrollContainer">
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>📜</span> Operation History</h1>
            <p class="section-subtitle">Track and undo bulk operations</p>
          </div>

          <div id="alertContainer"></div>

          <div class="alert alert-info" data-scroll data-scroll-class="is-inview">
            <strong>ℹ️ Operation History:</strong> Track all bulk operations performed on server data. You can undo operations to restore previous state.
          </div>

          <div class="stat-grid" data-scroll data-scroll-class="is-inview">
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

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">🕐 Recent Operations</div>
            <ul class="operation-list" id="operationsContainer">
              <li class="empty-state">
                <div class="empty-state-icon">⏳</div>
                <div>Loading operations...</div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  </div>

  ${generateSidebarScripts()}

  <script>
    const botKey = '${bot.key}';
    function showAlert(msg, type) {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 3000);
    }

    function getTimeAgo(date) {
      const seconds = Math.floor((new Date() - date) / 1000);
      const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 }
      ];
      for (const i of intervals) {
        const count = Math.floor(seconds / i.seconds);
        if (count > 0) return count + ' ' + i.label + (count > 1 ? 's' : '') + ' ago';
      }
      return 'just now';
    }

    function getOperationIcon(op) {
      const icons = { 'backfill': '📥', 'reset': '🔄', 'adjust': '📊', 'delete': '🗑️', 'import': '📤' };
      return icons[op.toLowerCase()] || '📋';
    }

    function toggleDetails(id) {
      const el = document.getElementById('details-' + id);
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    async function loadOperations() {
      try {
        const res = await fetch('/api/bot/' + botKey + '/history?limit=50');
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
          li.innerHTML = '<div class="operation-header"><div class="operation-title"><span>' + getOperationIcon(op.operation) + '</span><span>' + op.operation + '</span><span class="operation-badge ' + (op.undone ? 'badge-undone' : 'badge-active') + '">' + (op.undone ? '❌ Undone' : '✅ Active') + '</span></div>' + (!op.undone ? '<button class="btn btn-warning btn-sm" onclick="undoOperation(' + op.id + ')">⏮️ Undo</button>' : '') + '</div><div class="operation-meta"><div class="meta-item"><span class="meta-label">ID</span><div class="meta-value">#' + op.id + '</div></div><div class="meta-item"><span class="meta-label">Actor</span><div class="meta-value"><@' + op.actor_id + '></div></div><div class="meta-item"><span class="meta-label">Scope</span><div class="meta-value">' + op.scope + '</div></div><div class="meta-item"><span class="meta-label">When</span><div class="meta-value">' + timestamp.toLocaleString() + '</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + getTimeAgo(timestamp) + '</div></div></div><a class="details-toggle" onclick="toggleDetails(' + op.id + ')">🔍 View Details</a><div id="details-' + op.id + '" class="operation-details" style="display:none"><strong>Before:</strong><br><pre>' + JSON.stringify(JSON.parse(op.payload_before), null, 2) + '</pre><br><strong>After:</strong><br><pre>' + JSON.stringify(JSON.parse(op.payload_after), null, 2) + '</pre></div>';
          container.appendChild(li);
        });
      } catch (err) { showAlert('Failed to load operations', 'warning'); }
    }

    async function undoOperation(id) {
      if (!confirm('Undo operation #' + id + '? This will restore the previous state.')) return;
      try {
        const res = await fetch('/api/bot/' + botKey + '/history/' + id + '/undo', { method: 'POST' });
        if (res.ok) { showAlert('Operation undone successfully', 'success'); loadOperations(); }
        else showAlert('Failed to undo operation', 'warning');
      } catch (err) { showAlert('Error undoing operation', 'warning'); }
    }

    document.addEventListener('DOMContentLoaded', loadOperations);
  </script>
</body>
</html>`;
}

module.exports = { generateHistoryPage };
