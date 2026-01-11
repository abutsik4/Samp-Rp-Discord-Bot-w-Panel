// Consecutive Message Limiter Management Page

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateConsecutiveLimiterPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Consecutive Limiting</title>
  <link rel="stylesheet" href="/shared.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <style>
    ${generateSidebarStyles()}
    
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
    @media(max-width:1100px){.grid{grid-template-columns:1fr}}
    .toggle-container{display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg-tertiary);border-radius:8px}
    .toggle-switch{position:relative;display:inline-block;width:50px;height:26px}
    .toggle-switch input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--border);border-radius:26px;transition:.4s}
    .toggle-slider:before{position:absolute;content:"";height:18px;width:18px;left:4px;bottom:4px;background:#fff;border-radius:50%;transition:.4s}
    .toggle-switch input:checked+.toggle-slider{background:var(--accent-blue)}
    .toggle-switch input:checked+.toggle-slider:before{transform:translateX(24px)}
    .alert{padding:12px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-success{background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.2)}
    .alert-warning{background:color-mix(in srgb, var(--accent-amber) 10%, transparent);color:var(--accent-amber);border:1px solid color-mix(in srgb, var(--accent-amber) 20%, transparent)}
    .alert-info{background:rgba(59,130,246,.1);color:#3b82f6;border:1px solid rgba(59,130,246,.2)}
    .role-limit-item{display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-tertiary);border-radius:8px;margin-bottom:8px}
    .role-limit-input{display:flex;gap:8px;align-items:center;margin-top:12px}
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'Consecutive Limits',
      icon: '🚫',
      botKey: bot.key,
      PANEL_BASE,
      currentPage: 'consecutive-limits'
    })}

    <main class="main-scroll-container">
      <div class="scroll-progress">
        <div class="scroll-progress-bar" id="scrollProgressBar"></div>
      </div>

      <div data-scroll-container id="scrollContainer">
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🚫</span> Consecutive Message Limiting</h1>
            <p class="section-subtitle">Prevent users from spamming consecutive messages</p>
          </div>

          <div id="alertContainer"></div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">📺 Select Channel</div>
            <select id="channelSelect" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:8px;color:var(--text)">
              <option value="">Loading channels...</option>
            </select>
          </div>

          <div class="grid" data-scroll data-scroll-class="is-inview">
            <div class="content-card">
              <div class="card-title">⚙️ Configuration</div>
              
              <div class="toggle-container" style="margin-bottom:16px">
                <span style="font-weight:500">Enable Consecutive Limiting</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="consecutiveEnabledToggle">
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group">
                <label>Default Consecutive Limit</label>
                <input type="number" id="consecutiveLimit" min="1" max="50" value="5">
                <small style="color:var(--text-muted);display:block;margin-top:4px">Max messages a user can send in a row</small>
              </div>

              <div class="form-group">
                <label>Strike Reset Period (days)</label>
                <input type="number" id="strikeResetDays" min="1" max="365" value="7">
                <small style="color:var(--text-muted);display:block;margin-top:4px">Days until strikes auto-reset</small>
              </div>

              <div class="toggle-container" style="margin-bottom:16px">
                <span style="font-weight:400;color:var(--text-muted)">Apply Timeouts for Violations</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="timeoutsEnabledToggle" checked>
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group">
                <label>Timeout Duration per Strike (minutes)</label>
                <input type="number" id="timeoutDurationPerStrike" min="1" max="60" value="1">
                <small style="color:var(--text-muted);display:block;margin-top:4px">Minutes per strike (max 120 min total)</small>
              </div>

              <div class="toggle-container" style="margin-bottom:16px">
                <span style="font-weight:400;color:var(--text-muted)">Ignore Administrators</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="ignoreAdminsToggle" checked>
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <button class="btn btn-primary" id="saveBtn" style="width:100%;margin-top:16px">Save Configuration</button>
            </div>

            <div class="content-card">
              <div class="card-title">👥 Role-Based Consecutive Limits</div>
              <div class="alert alert-info">Configure different limits for specific roles. Higher limits override default.</div>

              <div id="consecutiveRoleLimitsList"></div>

              <div class="role-limit-input">
                <select id="consecutiveRoleSelector" style="flex:3">
                  <option value="">Select a role...</option>
                </select>
                <input type="number" id="newConsecutiveRoleLimit" placeholder="Limit" min="1" max="100" value="10" style="flex:1">
                <button class="btn btn-sm" id="addConsecutiveRoleBtn">Add</button>
              </div>
            </div>
          </div>

          <div class="grid" data-scroll data-scroll-class="is-inview">
            <div class="content-card">
              <div class="card-title">⚠️ Strikes Viewer</div>
              <button class="btn btn-sm" id="refreshStrikesBtn" style="margin-bottom:12px">🔄 Refresh Strikes</button>
              <div id="strikesContainer" style="color:var(--text-muted);text-align:center;padding:20px">
                Select a channel and click Refresh to view strikes
              </div>
            </div>

            <div class="content-card">
              <div class="card-title">ℹ️ How It Works</div>
              <div style="font-size:13px;color:var(--text-muted);line-height:1.8">
                <strong>Consecutive Message Detection:</strong><br>
                When enabled, the bot tracks consecutive messages from each user. If a user sends more than the configured limit without interruption from other users, further messages are deleted.<br><br>
                <strong>Strike System:</strong><br>
                Each violation adds strikes. Strikes auto-reset after the configured period.<br><br>
                <strong>Timeouts:</strong><br>
                Users are timed out based on strike count (max 120 min).
              </div>
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
        const res = await fetch(apiBase + '/api/' + botKey + '/consecutive-limits/' + currentChannelId);
        const config = await res.json();
        document.getElementById('consecutiveEnabledToggle').checked = config.enabled;
        document.getElementById('consecutiveLimit').value = config.limit || 5;
        document.getElementById('strikeResetDays').value = config.strike_reset_days || 7;
        document.getElementById('timeoutsEnabledToggle').checked = config.timeouts_enabled !== false;
        document.getElementById('timeoutDurationPerStrike').value = config.timeout_per_strike || 1;
        document.getElementById('ignoreAdminsToggle').checked = config.ignore_admins !== false;
      } catch (err) { showAlert('Failed to load config', 'warning'); }
    }

    async function saveConfig() {
      if (!currentChannelId) return showAlert('Select a channel first', 'warning');
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/consecutive-limits/' + currentChannelId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabled: document.getElementById('consecutiveEnabledToggle').checked,
            limit: parseInt(document.getElementById('consecutiveLimit').value),
            strike_reset_days: parseInt(document.getElementById('strikeResetDays').value),
            timeouts_enabled: document.getElementById('timeoutsEnabledToggle').checked,
            timeout_per_strike: parseInt(document.getElementById('timeoutDurationPerStrike').value),
            ignore_admins: document.getElementById('ignoreAdminsToggle').checked
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

module.exports = { generateConsecutiveLimiterPage };
