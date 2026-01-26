// Unified Rate & Consecutive Limiter Management Page

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateRateLimiterPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Message Limits</title>
  <link rel="stylesheet" href="/shared.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <style>
    ${generateSidebarStyles()}
    
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-bottom: 24px; align-items: start; }
    @media(max-width: 1300px) { .grid { grid-template-columns: 1fr; } }
    
    .toggle-container { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; min-height: 48px; }
    .toggle-switch { position: relative; display: inline-block; width: 50px; height: 26px; flex-shrink: 0; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--border); border-radius: 26px; transition: .4s; }
    .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background: #fff; border-radius: 50%; transition: .4s; }
    .toggle-switch input:checked + .toggle-slider { background: var(--accent-blue); }
    .toggle-switch input:checked + .toggle-slider:before { transform: translateX(24px); }
    
    .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
    .alert-info { background: rgba(59,130,246,.1); color: #3b82f6; border: 1px solid rgba(59,130,246,.2); }
    .alert-success { background: rgba(34,197,94,.1); color: #22c55e; border: 1px solid rgba(34,197,94,.2); }
    .alert-warning { background: rgba(251,191,36,.1); color: #f59e0b; border: 1px solid rgba(251,191,36,.2); }
    
    .role-limit-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 8px; font-size: 13px; }
    .role-limit-input { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
    
    .subsection-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; color: var(--text); }
    .divider { height: 1px; background: var(--border); margin: 24px 0; }
    
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .stat-card { background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 10px; padding: 16px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: var(--accent-blue); }
    .stat-label { font-size: 11px; color: var(--text-muted); margin-top: 4px; text-transform: uppercase; }

    .strikes-table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: auto; }
    .strikes-table th, .strikes-table td { padding: 10px; text-align: left; border-bottom: 1px solid var(--border); font-size: 13px; }
    .strikes-table th { background: rgba(167, 139, 250, 0.05); color: var(--accent-blue); font-weight: 600; }
    .strikes-table tr:hover { background: rgba(255, 255, 255, 0.02); }
    .user-pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; background: rgba(34, 211, 238, 0.1); border-radius: 12px; color: var(--accent-cyan); font-weight: 500; font-size: 12px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role-limit-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; font-size: 13px; gap: 10px; overflow: hidden; }
    .role-limit-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
    .table-container { width: 100%; overflow-x: auto; scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
    .content-card { max-width: 100%; overflow: hidden; }
    .page-content-wrapper { max-width: 1400px; margin: 0 left; }
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'Message Limits',
      icon: '🛡️',
      botKey: bot.key,
      PANEL_BASE,
      currentPage: 'rate-limits'
    })}

    <main class="main-scroll-container">
      <div class="scroll-progress"><div class="scroll-progress-bar" id="scrollProgressBar"></div></div>

      <div data-scroll-container id="scrollContainer">
        <section class="panel-section" data-scroll-section>
          <div class="page-content-wrapper">
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🛡️</span> Spam Prevention</h1>
            <p class="section-subtitle">Manage rate limits and consecutive message limits</p>
          </div>

          <div id="alertContainer"></div>

          <div class="content-card" data-scroll data-scroll-class="is-inview" style="margin-bottom: 20px;">
            <div class="card-title">📺 Select Channel</div>
            <select id="channelSelect" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:8px;color:var(--text)">
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
              <div class="stat-label">Rate Violations</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="statViolators">-</div>
              <div class="stat-label">Unique Violators</div>
            </div>
          </div>

          <div class="grid" data-scroll data-scroll-class="is-inview">
            <!-- Rate Limits Column -->
            <div class="content-card">
              <div class="subsection-title">🚦 Rate Limits (Frequency)</div>
              
              <div class="toggle-container">
                <div>
                  <div style="font-weight:500">Enable Rate Limiting</div>
                  <small style="color:var(--text-muted)">Limit messages per X minutes</small>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="rateEnabled">
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group">
                <label>Max Messages</label>
                <input type="number" id="rateLimit" min="1" max="1000" value="10">
              </div>

              <div class="form-group">
                <label>Time Window (minutes)</label>
                <input type="number" id="rateTimeWindow" min="1" max="1440" value="60">
              </div>

              <div class="form-group">
                <label>Warning Message</label>
                <textarea id="warningMessage" rows="2">You have exceeded the message limit for this channel.</textarea>
              </div>
              
              <div class="form-group">
                <label>Action</label>
                <select id="actionSelect">
                  <option value="delete">Delete Message</option>
                  <option value="warn">Warn Only</option>
                </select>
              </div>

              <div class="divider"></div>
              <div class="subsection-title">👥 Role Limits (Frequency)</div>
              <div id="rateRoleLimitsList"></div>
              <div class="role-limit-input">
                <select id="rateRoleSelector" style="flex:2"><option value="">Select role...</option></select>
                <input type="number" id="newRateRoleLimit" placeholder="Limit" value="20" style="flex:1">
                <button class="btn btn-sm" id="addRateRoleBtn">Add</button>
              </div>
            </div>

            <!-- Consecutive Limits Column -->
            <div class="content-card">
              <div class="subsection-title">🚫 Consecutive Limits (Turn-Taking)</div>

              <div class="toggle-container">
                <div>
                  <div style="font-weight:500">Enable Consecutive Limits</div>
                  <small style="color:var(--text-muted)">Limit messages in a row</small>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="consecEnabled">
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group">
                <label>Max Consecutive Messages</label>
                <input type="number" id="consecLimit" min="1" max="50" value="5">
              </div>
              
              <div class="toggle-container">
                <span style="font-weight:400">Ignore Admins</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="ignoreAdmins" checked>
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="divider"></div>
              <div class="subsection-title">⚖️ Punishments</div>

              <div class="toggle-container">
                <span style="font-weight:400">Apply Timeouts</span>
                <label class="toggle-switch">
                  <input type="checkbox" id="timeoutsEnabled" checked>
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group">
                <label>Timeout per Strike (minutes)</label>
                <input type="number" id="timeoutPerStrike" min="1" max="60" value="1">
              </div>

              <div class="form-group">
                <label>Strike Reset (days)</label>
                <input type="number" id="strikeResetDays" min="1" max="365" value="7">
              </div>

              <div class="divider"></div>
              <div class="subsection-title">👥 Role Limits (Consecutive)</div>
              <div id="consecRoleLimitsList"></div>
              <div class="role-limit-input">
                <select id="consecRoleSelector" style="flex:2"><option value="">Select role...</option></select>
                <input type="number" id="newConsecRoleLimit" placeholder="Limit" value="10" style="flex:1">
                <button class="btn btn-sm" id="addConsecRoleBtn">Add</button>
              </div>
            </div>
          </div>

          <!-- Strikes Viewer Section -->
          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="subsection-title">⚠️ User Strikes (Consecutive Violations)</div>
            <p style="color:var(--text-muted); font-size: 13px; margin-bottom: 16px;">Users who have accumulated strikes across the entire guild. Strikes result in progressive timeouts.</p>
            <div id="strikesContainer">
              <div style="color:var(--text-muted); font-style:italic; padding: 20px; text-align: center;">Select a channel to view strikes</div>
            </div>
            <button class="btn btn-secondary btn-sm" id="refreshStrikesBtn" style="margin-top: 16px; width: 100%;">🔄 Refresh Strikes List</button>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <button class="btn btn-primary" id="saveBtn" style="width:100%; height: 50px; font-size: 16px;">💾 Save All Changes</button>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview" style="margin-top:20px">
             <div class="card-title">ℹ️ Information</div>
             <p style="color:var(--text-muted); font-size: 14px; line-height: 1.6;">
               <strong>Rate Limits</strong> control how many messages a user can send within a specific time window (e.g. 10 messages per hour).
               <br>
                <strong>Consecutive Limits</strong> control how many messages a user can send <em>in a row</em> without anyone else speaking.
                <br>
                If <strong>Timeouts</strong> are enabled, violations will accumulate "strikes" which result in temporary timeouts.
              </p>
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
    let rolesCache = [];

    // State for role limits (arrays of objects)
    let rateRoleLimits = [];
    let consecRoleLimits = [];

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
    
    async function loadRoles(guildId) {
      if (!guildId) return;
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/roles?guildId=' + guildId);
        const data = await res.json();
        rolesCache = data.roles || [];
        
        // Populate both selectors
        const populate = (selId) => {
          const s = document.getElementById(selId);
          s.innerHTML = '<option value="">Select role...</option>';
          rolesCache.forEach(r => {
             const opt = document.createElement('option');
             opt.value = r.id;
             opt.textContent = r.name;
             s.appendChild(opt);
          });
        };
        populate('rateRoleSelector');
        populate('consecRoleSelector');
      } catch(e) { console.error(e); }
    }

    async function loadConfig() {
      if (!currentChannelId) return;
      
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/rate-limits/' + currentChannelId);
        const config = await res.json();
        
        if (config.guild_id) loadRoles(config.guild_id);

        // Rate Limits
        document.getElementById('rateEnabled').checked = !!config.enabled;
        document.getElementById('rateLimit').value = config.default_limit || 10;
        document.getElementById('rateTimeWindow').value = config.time_window || config.time_window_minutes || 60;
        document.getElementById('warningMessage').value = config.warning_message || '';
        document.getElementById('actionSelect').value = config.action || 'delete';
        
        rateRoleLimits = config.role_limits || [];
        renderRoleLimits('rateRoleLimitsList', rateRoleLimits, 'rateRoleLimits');

        // Consecutive Limits
        document.getElementById('consecEnabled').checked = !!config.consecutive_enabled;
        document.getElementById('consecLimit').value = config.consecutive_limit || 5;
        document.getElementById('ignoreAdmins').checked = config.ignore_admins !== false;
        
        document.getElementById('timeoutsEnabled').checked = config.timeouts_enabled !== false;
        document.getElementById('timeoutPerStrike').value = config.timeout_duration_per_strike || config.timeout_per_strike || 1;
        document.getElementById('strikeResetDays').value = config.strike_reset_days || 7;

        consecRoleLimits = config.consecutive_role_limits || [];
        renderRoleLimits('consecRoleLimitsList', consecRoleLimits, 'consecRoleLimits');

        // Stats
        if(config.stats) {
           document.getElementById('statsContainer').style.display = 'grid';
        } else {
           document.getElementById('statsContainer').style.display = 'none';
        }

        }

        // Load Strikes
        await loadStrikes(config.guild_id);
        
        // Refresh Scroll Engine
        if (window.requestLocoUpdate) window.requestLocoUpdate();

      } catch (err) { 
        console.error(err);
        showAlert('Failed to load config', 'warning'); 
      }
    }

    async function loadStrikes(guildId) {
      if (!guildId) return;
      const container = document.getElementById('strikesContainer');
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/rate-limits/strikes?guildId=' + guildId);
        const data = await res.json();
        const users = data.users || [];

        if (users.length === 0) {
          container.innerHTML = '<div style="color:var(--text-muted); font-style:italic; padding: 20px; text-align: center;">No active strikes in this guild</div>';
          return;
        }

        let html = '<div class="table-container"><table class="strikes-table">';
        html += '<thead><tr><th>User</th><th>Strikes</th><th>Last Violation</th><th>Actions</th></tr></thead>';
        html += '<tbody>';
        
        users.forEach(u => {
          const displayUser = u.username ? \`<span class="user-pill">\${u.username}</span>\` : \`<code style="font-size:11px">\${u.user_id}</code>\`;
          const lastDate = u.last_violation_timestamp ? new Date(u.last_violation_timestamp * 1000).toLocaleString() : 'Never';
          
          html += \`<tr>
            <td>\${displayUser}</td>
            <td style="font-weight:700; color:var(--accent-rose)">\${u.strikes}</td>
            <td>\${lastDate}</td>
            <td><button class="btn btn-danger btn-sm" onclick="clearStrikes('\${u.user_id}', '\${guildId}')">Clear</button></td>
          </tr>\`;
        });
        
        html += '</tbody></table></div>';
        container.innerHTML = html;
        if (window.requestLocoUpdate) window.requestLocoUpdate();
      } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="alert alert-warning">Failed to load strikes list</div>';
      }
    }

    window.clearStrikes = async function(userId, guildId) {
      if (!confirm('Are you sure you want to clear strikes for this user?')) return;
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/rate-limits/strikes/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, guildId })
        });
        if (res.ok) {
          showAlert('Strikes cleared', 'success');
          loadStrikes(guildId);
        } else {
          showAlert('Failed to clear strikes', 'warning');
        }
      } catch (err) { showAlert('Error clearing strikes', 'warning'); }
    }

    function renderRoleLimits(containerId, limits, arrayName) {
      const c = document.getElementById(containerId);
      c.innerHTML = '';
      if (!limits || !limits.length) {
        c.innerHTML = '<div style="color:var(--text-muted);font-style:italic">No role limits</div>';
        return;
      }
      limits.forEach((l, idx) => {
        const div = document.createElement('div');
        div.className = 'role-limit-item';
        // Try to find role name
        const rName = rolesCache.find(r => r.id === l.role_id)?.name || l.role_id;
        div.innerHTML = '<span><b>' + rName + '</b>: ' + l.limit + '</span> <button class="btn btn-danger btn-sm" onclick="removeRoleLimit(\\'' + arrayName + '\\', ' + idx + ')">×</button>';
        c.appendChild(div);
      });
      if (window.requestLocoUpdate) window.requestLocoUpdate();
    }

    // Global exposed for onclick
    window.removeRoleLimit = function(arrayName, idx) {
      if (arrayName === 'rateRoleLimits') {
        rateRoleLimits.splice(idx, 1);
        renderRoleLimits('rateRoleLimitsList', rateRoleLimits, 'rateRoleLimits');
      } else {
        consecRoleLimits.splice(idx, 1);
        renderRoleLimits('consecRoleLimitsList', consecRoleLimits, 'consecRoleLimits');
      }
    };

    function addRoleLimit(type) {
      const selId = type === 'rate' ? 'rateRoleSelector' : 'consecRoleSelector';
      const inpId = type === 'rate' ? 'newRateRoleLimit' : 'newConsecRoleLimit';
      const roleId = document.getElementById(selId).value;
      const limit = parseInt(document.getElementById(inpId).value);
      
      if (!roleId) return;
      if (isNaN(limit) || limit < 1) return;

      const obj = { role_id: roleId, limit: limit, role_name: rolesCache.find(r => r.id === roleId)?.name || roleId };
      
      if (type === 'rate') {
        // Remove existing for this role if any
        rateRoleLimits = rateRoleLimits.filter(r => r.role_id !== roleId);
        rateRoleLimits.push(obj);
        renderRoleLimits('rateRoleLimitsList', rateRoleLimits, 'rateRoleLimits');
      } else {
        consecRoleLimits = consecRoleLimits.filter(r => r.role_id !== roleId);
        consecRoleLimits.push(obj);
        renderRoleLimits('consecRoleLimitsList', consecRoleLimits, 'consecRoleLimits');
      }
    }

    async function saveConfig() {
      if (!currentChannelId) return showAlert('Select a channel first', 'warning');
      
      const payload = {
        // Rate
        enabled: document.getElementById('rateEnabled').checked,
        default_limit: parseInt(document.getElementById('rateLimit').value),
        time_window: parseInt(document.getElementById('rateTimeWindow').value),
        warning_message: document.getElementById('warningMessage').value,
        action: document.getElementById('actionSelect').value,
        role_limits: rateRoleLimits,

        // Consecutive
        consecutive_enabled: document.getElementById('consecEnabled').checked,
        consecutive_limit: parseInt(document.getElementById('consecLimit').value),
        consecutive_role_limits: consecRoleLimits,
        
        // Common/Punishments
        ignore_admins: document.getElementById('ignoreAdmins').checked,
        timeouts_enabled: document.getElementById('timeoutsEnabled').checked,
        timeout_per_strike: parseInt(document.getElementById('timeoutPerStrike').value),
        strike_reset_days: parseInt(document.getElementById('strikeResetDays').value)
      };

      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/rate-limits/' + currentChannelId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) showAlert('Configuration saved!', 'success');
        else showAlert('Failed to save', 'warning');
      } catch (err) { showAlert('Error saving config', 'warning'); }
    }

    document.getElementById('channelSelect').addEventListener('change', (e) => {
      currentChannelId = e.target.value;
      if (currentChannelId) {
         loadConfig();
      }
    });

    document.getElementById('addRateRoleBtn').addEventListener('click', () => addRoleLimit('rate'));
    document.getElementById('addConsecRoleBtn').addEventListener('click', () => addRoleLimit('consecutive'));
    document.getElementById('saveBtn').addEventListener('click', saveConfig);
    document.getElementById('refreshStrikesBtn').addEventListener('click', () => {
      // Find guildId from rolesCache or current config fetch (we'll re-load config to be safe)
      loadConfig();
    });

    document.addEventListener('DOMContentLoaded', async () => {
       await loadChannels();
    });
  </script>
</body>
</html>`;
}

module.exports = { generateRateLimiterPage };
