// Rate Limiter Management Page

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateRateLimiterPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Rate Limiting</title>
  <link rel="stylesheet" href="/shared.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <style>
    ${generateSidebarStyles()}
    
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
    @media(max-width:1100px){.grid{grid-template-columns:1fr}}
    .toggle-container{display:flex;align-items:center;justify-content:space-between;padding:12px 0}
    .toggle-switch{position:relative;display:inline-block;width:56px;height:28px}
    .toggle-switch input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--border);border-radius:28px;transition:all .3s}
    .toggle-slider:before{position:absolute;content:"";height:20px;width:20px;left:4px;bottom:4px;background:#fff;border-radius:50%;transition:all .3s}
    .toggle-switch input:checked+.toggle-slider{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan))}
    .toggle-switch input:checked+.toggle-slider:before{transform:translateX(28px)}
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .role-limit-item{background:color-mix(in srgb, var(--accent-purple) 10%, transparent);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
    .role-limit-input{display:flex;gap:10px;margin-top:10px}
    .role-limit-input input{flex:1}
    .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
    .stat-card{background:linear-gradient(135deg,color-mix(in srgb, var(--accent-purple) 10%, transparent),color-mix(in srgb, var(--accent-cyan) 10%, transparent));border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center}
    .stat-value{font-size:28px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
    .channel-selector{margin-bottom:20px}
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'Rate Limits',
      icon: '🚦',
      botKey: bot.key,
      PANEL_BASE,
      currentPage: 'rate-limits'
    })}

    <main class="main-scroll-container">
      <div class="scroll-progress">
        <div class="scroll-progress-bar" id="scrollProgressBar"></div>
      </div>

      <div data-scroll-container id="scrollContainer">
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🚦</span> Message Rate Limiting</h1>
            <p class="section-subtitle">Configure message frequency limits per channel</p>
          </div>

          <div id="alertContainer"></div>

          <div class="content-card channel-selector" data-scroll data-scroll-class="is-inview">
            <div class="card-title">📺 Select Channel</div>
            <select id="channelSelect" class="form-group">
              <option value="">Loading channels...</option>
            </select>
          </div>

          <div class="stat-grid" id="statsContainer" style="display:none" data-scroll data-scroll-class="is-inview">
            <div class="stat-card">
              <div class="stat-value" id="statTotal">-</div>
              <div class="stat-label">Total Messages</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="statViolations">-</div>
              <div class="stat-label">Violations</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="statViolators">-</div>
              <div class="stat-label">Unique Violators</div>
            </div>
          </div>

          <div class="grid" data-scroll data-scroll-class="is-inview">
            <div class="content-card">
              <div class="card-title">⚙️ Configuration</div>
              
              <div class="toggle-container">
                <span style="font-weight:500">Enable Rate Limiting</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="enabledToggle">
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group">
                <label>Default Message Limit</label>
                <input type="number" id="defaultLimit" min="1" max="1000" value="10">
                <small style="color:var(--text-muted);display:block;margin-top:4px">Maximum messages per user (default)</small>
              </div>

              <div class="form-group">
                <label>Time Window (minutes)</label>
                <input type="number" id="timeWindow" min="1" max="1440" value="60">
                <small style="color:var(--text-muted);display:block;margin-top:4px">Time period for counting messages</small>
              </div>

              <div class="form-group">
                <label>Warning Message</label>
                <textarea id="warningMessage">You have exceeded the message limit for this channel.</textarea>
              </div>

              <div class="form-group">
                <label>Action on Limit</label>
                <select id="actionSelect">
                  <option value="delete">Delete Message</option>
                  <option value="warn">Warn Only</option>
                </select>
              </div>

              <button class="btn btn-primary" id="saveBtn" style="width:100%">Save Configuration</button>
            </div>

            <div class="content-card">
              <div class="card-title">👥 Role-Based Limits</div>
              <div class="alert alert-info">Configure different limits for specific roles. Higher limits override default.</div>

              <div id="roleLimitsList"></div>

              <div class="role-limit-input">
                <select id="roleSelector" style="flex:3">
                  <option value="">Select a role...</option>
                </select>
                <input type="number" id="newRoleLimit" placeholder="Limit" min="1" max="9999" value="20" style="flex:1">
                <button class="btn btn-sm" id="addRoleBtn">Add</button>
              </div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">ℹ️ How It Works</div>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.8">
              <strong>Rate Limiting:</strong> Tracks messages per user within the specified time window. When a user exceeds their limit, the configured action is taken.<br><br>
              <strong>Role-Based Limits:</strong> Assign different limits to trusted roles. The highest applicable limit is used for each user.
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>

  ${generateSidebarScripts()}

  <script>
    const botKey = '${bot.key}';
    const apiBase = '${PANEL_BASE}';
    let currentChannelId = null;

    function showAlert(msg, type) {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 3000);
    }

    async function loadChannels() {
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/channels');
        const data = await res.json();
        const select = document.getElementById('channelSelect');
        select.innerHTML = '<option value="">Select a channel...</option>';
        (data.items || data).forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = (ch.guild_name ? ch.guild_name + ' / ' : '') + '#' + ch.name;
          select.appendChild(opt);
        });
      } catch (err) { showAlert('Failed to load channels', 'warning'); }
    }

    async function loadConfig() {
      if (!currentChannelId) return;
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/rate-limits/' + currentChannelId);
        const config = await res.json();
        document.getElementById('enabledToggle').checked = config.enabled;
        document.getElementById('defaultLimit').value = config.default_limit || 10;
        document.getElementById('timeWindow').value = config.time_window || 60;
        document.getElementById('warningMessage').value = config.warning_message || '';
        document.getElementById('actionSelect').value = config.action || 'delete';
        document.getElementById('statsContainer').style.display = 'grid';
        renderRoleLimits(config.role_limits || []);
      } catch (err) { showAlert('Failed to load config', 'warning'); }
    }

    function renderRoleLimits(limits) {
      const container = document.getElementById('roleLimitsList');
      if (!limits.length) {
        container.innerHTML = '<div style="color:var(--text-muted);padding:12px;text-align:center">No role limits configured</div>';
        return;
      }
      container.innerHTML = limits.map(r => '<div class="role-limit-item"><span>' + (r.role_name || r.role_id) + ': ' + r.limit + ' msgs</span><button class="btn btn-danger btn-sm" onclick="removeRoleLimit(\\'' + r.role_id + '\\')">Remove</button></div>').join('');
    }

    async function saveConfig() {
      if (!currentChannelId) return showAlert('Select a channel first', 'warning');
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/rate-limits/' + currentChannelId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: document.getElementById('enabledToggle').checked,
            default_limit: parseInt(document.getElementById('defaultLimit').value),
            time_window: parseInt(document.getElementById('timeWindow').value),
            warning_message: document.getElementById('warningMessage').value,
            action: document.getElementById('actionSelect').value
          })
        });
        if (res.ok) showAlert('Configuration saved!', 'success');
        else showAlert('Failed to save', 'warning');
      } catch (err) { showAlert('Error saving config', 'warning'); }
    }

    document.getElementById('channelSelect').addEventListener('change', (e) => {
      currentChannelId = e.target.value;
      if (currentChannelId) loadConfig();
    });
    document.getElementById('saveBtn').addEventListener('click', saveConfig);
    document.addEventListener('DOMContentLoaded', loadChannels);
  </script>
</body>
</html>`;
}

module.exports = { generateRateLimiterPage };
