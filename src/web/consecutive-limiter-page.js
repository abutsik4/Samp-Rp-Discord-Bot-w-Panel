// Consecutive Message Limiter Management Page
// Web panel for configuring consecutive message limits with role-based overrides and strikes

function generateConsecutiveLimiterPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Consecutive Limiting</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-main);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    p { color: var(--text-muted); }
    a { color: var(--accent-cyan); text-decoration: none; transition: color 0.2s; }
    a:hover { color: var(--accent-purple); }
    select, input[type="number"] { 
      background: var(--bg-tertiary); 
      border: 1px solid var(--border); 
      color: var(--text-primary);
      font-size: 14px;
    }
    select:focus, input:focus { 
      outline: none; 
      border-color: var(--accent-blue);
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }
    .card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .card-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: var(--text-primary); }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; margin-bottom: 6px; font-weight: 500; color: var(--text-primary); }
    .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 14px; }
    .form-group textarea { min-height: 80px; font-family: inherit; resize: vertical; }
    .toggle-container { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; }
    .toggle-switch { position: relative; display: inline-block; width: 50px; height: 26px; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border); transition: .4s; border-radius: 26px; }
    .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 4px; bottom: 4px; background-color: white; transition: .4s; border-radius: 50%; }
    input:checked + .toggle-slider { background-color: var(--accent-blue); }
    input:checked + .toggle-slider:before { transform: translateX(24px); }
    .btn { padding: 10px 20px; background: var(--accent-blue); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.2s; }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-primary { background: var(--accent-blue); }
    .btn-danger { background: var(--accent-red); }
    .btn-sm { padding: 6px 12px; font-size: 13px; }
    .alert { padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
    .alert-success { background: rgba(34, 197, 94, 0.1); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.2); }
    .alert-warning { background: rgba(251, 191, 36, 0.1); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.2); }
    .alert-info { background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2); }
    .role-limit-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--bg-tertiary); border-radius: 8px; margin-bottom: 8px; }
    .role-limit-input { display: flex; gap: 8px; align-items: center; margin-top: 12px; }
    #alertContainer { position: fixed; top: 20px; right: 20px; z-index: 1000; display: flex; flex-direction: column; gap: 10px; max-width: 400px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <div>
        <h1>🚫 Consecutive Message Limiting</h1>
        <p style="color:var(--text-muted);margin-top:4px">Bot: ${bot.name} (${bot.key})</p>
      </div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <button onclick="history.back()" class="btn" style="padding:8px 16px">← Back</button>
        <a href="${PANEL_BASE}/bot/${bot.key}" style="color:var(--accent-cyan);text-decoration:none;font-size:14px">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/stats" style="color:var(--text-muted);text-decoration:none;font-size:14px">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/rate-limits" style="color:var(--text-muted);text-decoration:none;font-size:14px">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/messages" style="color:var(--text-muted);text-decoration:none;font-size:14px">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/ai-engagement" style="color:var(--text-muted);text-decoration:none;font-size:14px">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/commands" style="color:var(--text-muted);text-decoration:none;font-size:14px">📚 Commands</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/accuracy" style="color:var(--text-muted);text-decoration:none;font-size:14px">🎯 Accuracy</a>
        <a href="${PANEL_BASE}/verification-dashboard?bot=${bot.key}" style="color:var(--text-muted);text-decoration:none;font-size:14px">🔍 Verification</a>
        <form method="post" action="${PANEL_BASE}/logout" style="display:inline"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div id="alertContainer"></div>

    <div class="form-group">
      <label>Select Channel</label>
      <select id="channelSelect" style="width:100%;padding:10px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:8px;color:var(--text-primary)">
        <option value="">Loading channels...</option>
      </select>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">⚙️ Configuration</div>
        
        <div class="toggle-container">
          <span style="font-weight:500">Enable Consecutive Limiting</span>
          <label class="toggle-switch">
            <input type="checkbox" id="consecutiveEnabledToggle">
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="form-group">
          <label>Default Consecutive Limit</label>
          <input type="number" id="consecutiveLimit" min="1" max="50" value="5">
          <small style="color:var(--text-muted);display:block;margin-top:4px">Max messages a user can send in a row (default for all users)</small>
        </div>

        <div class="form-group">
          <label>Strike Reset Period (days)</label>
          <input type="number" id="strikeResetDays" min="1" max="365" value="7">
          <small style="color:var(--text-muted);display:block;margin-top:4px">Days until strikes auto-reset</small>
        </div>

        <div class="form-group">
          <label>Apply Timeouts for Violations</label>
          <div class="toggle-container" style="margin-top:8px">
            <span style="font-weight:400;color:var(--text-muted)">Enable automatic timeouts based on strikes</span>
            <label class="toggle-switch">
              <input type="checkbox" id="timeoutsEnabledToggle" checked>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <small style="color:var(--text-muted);display:block;margin-top:4px">When enabled, users receive automatic timeouts: 5 strikes = 5 min, 10 strikes = 10 min, etc. (max 120 min)</small>
        </div>

        <div class="form-group">
          <label>Timeout Duration per Strike (minutes)</label>
          <input type="number" id="timeoutDurationPerStrike" min="1" max="60" value="1">
          <small style="color:var(--text-muted);display:block;margin-top:4px">Minutes of timeout per strike (e.g., 2 means 5 strikes = 10 min timeout, max: strike count × this value, capped at 120 min)</small>
        </div>

        <div class="form-group">
          <label>Ignore Administrators</label>
          <div class="toggle-container" style="margin-top:8px">
            <span style="font-weight:400;color:var(--text-muted)">Skip consecutive limiting for users with admin permissions</span>
            <label class="toggle-switch">
              <input type="checkbox" id="ignoreAdminsToggle" checked>
              <span class="toggle-slider"></span>
            </label>
          </div>
          <small style="color:var(--text-muted);display:block;margin-top:4px">When enabled, users with "Manage Server" or "Administrator" permission are exempt from consecutive limits</small>
        </div>

        <button class="btn btn-primary" id="saveBtn" style="width:100%;margin-top:16px">Save Configuration</button>
      </div>

      <div class="card">
        <div class="card-title">👥 Role-Based Consecutive Limits</div>
        <div class="alert alert-info">
          Configure different consecutive limits for specific roles. Higher limits override default.
        </div>

        <div id="consecutiveRoleLimitsList">
          <!-- Consecutive role limits will be populated here -->
        </div>

        <div class="role-limit-input">
          <select id="consecutiveRoleSelector" style="flex:3">
            <option value="">Select a role...</option>
          </select>
          <input type="number" id="newConsecutiveRoleLimit" placeholder="Limit" min="1" max="100" value="10" style="flex:1">
          <button class="btn btn-sm" id="addConsecutiveRoleBtn">Add Role</button>
        </div>
        <small style="color:var(--text-muted);display:block;margin-top:6px">Higher limits for trusted roles (e.g., moderators can send 20 consecutive messages)</small>
      </div>
    </div>

    <div class="grid" style="margin-top:20px">
      <div class="card">
        <div class="card-title">⚠️ Strikes Viewer</div>
        <button class="btn btn-sm" id="refreshStrikesBtn" style="margin-bottom:12px">🔄 Refresh Strikes</button>
        
        <div id="strikesContainer">
          <div style="color:var(--text-muted);text-align:center;padding:20px">
            Select a channel and click Refresh to view strikes
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">ℹ️ How It Works</div>
        <div style="font-size:13px;color:var(--text-muted);line-height:1.8">
          <strong>Consecutive Message Detection:</strong><br>
          When enabled, the bot tracks consecutive messages from each user. If a user sends more than the configured limit without interruption from other users, further messages are deleted.<br><br>
          <strong>Strike System:</strong><br>
          Each violation adds strikes to the user's record. Strikes auto-reset after the configured period (default: 7 days).<br><br>
          <strong>Timeouts:</strong><br>
          If enabled, users are automatically timed out based on their strike count: 5 strikes = 5 min timeout, 10 strikes = 10 min, etc. (max 120 min).
        </div>
      </div>
    </div>
  </div>

  <script>
    const botKey = ${JSON.stringify(bot.key)};
    const apiBase = ${JSON.stringify(PANEL_BASE)};
    let channels = [];
    let currentChannelId = '';
    let currentGuildId = '';
    let consecutiveRoleLimits = [];
    let availableRoles = [];

    function showAlert(message, type) {
      if (!type) type = 'success';
      const container = document.getElementById('alertContainer');
      const alert = document.createElement('div');
      alert.className = 'alert alert-' + type;
      alert.textContent = message;
      container.appendChild(alert);
      setTimeout(function() { alert.remove(); }, 4000);
    }

    async function api(path, opts) {
      if (!opts) opts = {};
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      return json;
    }

    async function loadChannels() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/channels');
        channels = data.items || [];
        
        const select = document.getElementById('channelSelect');
        select.innerHTML = channels.map(function(ch) {
          const selected = ch.id === currentChannelId ? 'selected' : '';
          return '<option value="' + ch.id + '" data-guild="' + ch.guild_id + '" ' + selected + '>' + ch.guild_name + ' / #' + ch.name + '</option>';
        }).join('');

        if (channels.length > 0) {
          const defaultCh = channels[0];
          currentChannelId = defaultCh.id;
          currentGuildId = defaultCh.guild_id;
          await loadConfig();
          await loadRoles();
        }
      } catch (e) {
        console.error('Failed to load channels:', e);
        showAlert('Failed to load channels: ' + e.message, 'warning');
      }
    }

    async function loadConfig() {
      if (!currentChannelId || !currentGuildId) return;

      try {
        const data = await api(apiBase + '/api/' + botKey + '/rate-limits/config?guildId=' + currentGuildId + '&channelId=' + currentChannelId);
        
        if (data.config) {
          document.getElementById('consecutiveEnabledToggle').checked = data.config.consecutive_enabled || false;
          document.getElementById('consecutiveLimit').value = data.config.consecutive_limit || 5;
          document.getElementById('strikeResetDays').value = data.config.strike_reset_days || 7;
          document.getElementById('timeoutsEnabledToggle').checked = data.config.timeouts_enabled !== false;
          document.getElementById('timeoutDurationPerStrike').value = data.config.timeout_duration_per_strike || 1;
          document.getElementById('ignoreAdminsToggle').checked = data.config.ignore_admins !== false;
          consecutiveRoleLimits = data.config.consecutive_role_limits || [];
          renderConsecutiveRoleLimits();
        } else {
          document.getElementById('consecutiveEnabledToggle').checked = false;
          consecutiveRoleLimits = [];
          renderConsecutiveRoleLimits();
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    }

    function renderConsecutiveRoleLimits() {
      const container = document.getElementById('consecutiveRoleLimitsList');
      if (consecutiveRoleLimits.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:10px">No role-based consecutive limits configured</div>';
        return;
      }

      container.innerHTML = consecutiveRoleLimits.map(function(rl, idx) {
        const roleName = rl.name || resolveRoleName(rl.role_id);
        const roleColor = getRoleColor(rl.role_id);
        const colorStyle = roleColor ? 'color: ' + roleColor : '';
        
        return '<div class="role-limit-item">' +
          '<div style="flex:1">' +
            '<div style="font-weight:500;' + colorStyle + '">' + roleName + '</div>' +
            '<div style="font-size:13px;color:var(--text-muted)">ID: ' + rl.role_id + ' | Limit: ' + rl.limit + ' consecutive messages</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-danger btn-sm" onclick="removeConsecutiveRoleLimit(' + idx + ')">Remove</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    window.removeConsecutiveRoleLimit = function(idx) {
      consecutiveRoleLimits.splice(idx, 1);
      renderConsecutiveRoleLimits();
      showAlert('Consecutive role limit removed! Click Save Configuration to persist.', 'info');
    };

    function resolveRoleName(roleId) {
      const role = availableRoles.find(function(r) { return r.id === roleId; });
      return role ? role.name : 'Role: ' + roleId;
    }

    function getRoleColor(roleId) {
      const role = availableRoles.find(function(r) { return r.id === roleId; });
      if (role && role.color) {
        return '#' + role.color.toString(16).padStart(6, '0');
      }
      return null;
    }

    async function loadRoles() {
      if (!currentGuildId) return;
      
      try {
        const data = await api(apiBase + '/api/' + botKey + '/roles?guildId=' + currentGuildId);
        availableRoles = data.roles || [];
        
        const select = document.getElementById('consecutiveRoleSelector');
        select.innerHTML = '<option value="">Select a role...</option>' +
          availableRoles.map(function(r) {
            const colorStyle = r.color ? 'color: #' + r.color.toString(16).padStart(6, '0') : '';
            return '<option value="' + r.id + '" style="' + colorStyle + '">' + r.name + '</option>';
          }).join('');
        
        renderConsecutiveRoleLimits();
      } catch (e) {
        console.error('Failed to load roles:', e);
      }
    }

    document.getElementById('addConsecutiveRoleBtn').addEventListener('click', function() {
      const roleId = document.getElementById('consecutiveRoleSelector').value;
      const limit = parseInt(document.getElementById('newConsecutiveRoleLimit').value);

      if (!roleId) {
        showAlert('Please select a role', 'warning');
        return;
      }

      if (consecutiveRoleLimits.find(function(rl) { return rl.role_id === roleId; })) {
        showAlert('Consecutive role limit already exists for this role', 'warning');
        return;
      }

      const role = availableRoles.find(function(r) { return r.id === roleId; });
      const roleLimit = { 
        role_id: roleId, 
        limit: limit,
        name: role ? role.name : undefined
      };
      
      consecutiveRoleLimits.push(roleLimit);
      renderConsecutiveRoleLimits();

      document.getElementById('consecutiveRoleSelector').value = '';
      document.getElementById('newConsecutiveRoleLimit').value = '10';
      showAlert('Consecutive role limit added! Click Save Configuration to persist.', 'info');
    });

    document.getElementById('channelSelect').addEventListener('change', async function(e) {
      const selectedOption = e.target.selectedOptions[0];
      currentChannelId = e.target.value;
      currentGuildId = selectedOption.dataset.guild;
      await loadRoles();
      await loadConfig();
    });

    document.getElementById('saveBtn').addEventListener('click', async function() {
      if (!currentChannelId || !currentGuildId) {
        showAlert('Please select a channel first', 'warning');
        return;
      }

      try {
        const config = {
          consecutive_enabled: document.getElementById('consecutiveEnabledToggle').checked,
          consecutive_limit: parseInt(document.getElementById('consecutiveLimit').value) || 5,
          consecutive_role_limits: consecutiveRoleLimits,
          strike_reset_days: parseInt(document.getElementById('strikeResetDays').value) || 7,
          timeouts_enabled: document.getElementById('timeoutsEnabledToggle').checked,
          timeout_duration_per_strike: parseInt(document.getElementById('timeoutDurationPerStrike').value) || 1,
          ignore_admins: document.getElementById('ignoreAdminsToggle').checked,
        };

        await api(apiBase + '/api/' + botKey + '/rate-limits/config', {
          method: 'POST',
          body: JSON.stringify({ guildId: currentGuildId, channelId: currentChannelId, config })
        });

        showAlert('Configuration saved successfully!', 'success');
        await loadConfig();
      } catch (e) {
        console.error('Failed to save config:', e);
        showAlert('Failed to save: ' + e.message, 'warning');
      }
    });

    async function loadStrikes() {
      if (!currentGuildId) {
        showAlert('Please select a channel first', 'warning');
        return;
      }

      try {
        const data = await api(apiBase + '/api/' + botKey + '/rate-limits/strikes?guildId=' + currentGuildId);
        const container = document.getElementById('strikesContainer');
        
        if (!data.users || data.users.length === 0) {
          container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px">No users with active strikes</div>';
          return;
        }

        container.innerHTML = data.users.map(function(user) {
          const resetDate = new Date(user.will_reset_at * 1000);
          const daysLeft = Math.ceil((resetDate - Date.now()) / (1000 * 60 * 60 * 24));
          const username = user.username || ('User ID: ' + user.user_id);
          
          return '<div class="role-limit-item">' +
            '<div style="flex:1">' +
              '<div style="font-weight:500">👤 ' + username + '</div>' +
              '<div style="font-size:13px;color:var(--text-muted)">' +
                '⚠️ Strikes: ' + user.total_violations + ' | ' +
                'Resets in: ' + daysLeft + ' days (' + resetDate.toLocaleDateString("ru-RU") + ')' +
              '</div>' +
            '</div>' +
            '<button class="btn btn-sm btn-danger clear-strikes-btn" data-user-id="' + user.user_id + '">Clear</button>' +
          '</div>';
        }).join('');
        
        document.querySelectorAll('.clear-strikes-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
            clearStrikes(this.getAttribute('data-user-id'));
          });
        });
      } catch (e) {
        console.error('Failed to load strikes:', e);
        showAlert('Failed to load strikes: ' + e.message, 'warning');
      }
    }

    window.clearStrikes = async function(userId) {
      if (!confirm('Clear all strikes for this user?')) return;

      try {
        await api(apiBase + '/api/' + botKey + '/rate-limits/strikes/' + userId + '?guildId=' + currentGuildId, {
          method: 'DELETE'
        });
        showAlert('Strikes cleared!', 'success');
        await loadStrikes();
      } catch (e) {
        console.error('Failed to clear strikes:', e);
        showAlert('Failed to clear strikes: ' + e.message, 'warning');
      }
    };

    document.getElementById('refreshStrikesBtn').addEventListener('click', loadStrikes);

    (async function() {
      await loadChannels();
      await loadStrikes();
    })();
  </script>
  <link rel="stylesheet" href="/snow.css">
</body>
</html>`;
}

module.exports = { generateConsecutiveLimiterPage };
