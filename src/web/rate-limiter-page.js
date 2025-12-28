// Rate Limiter Management Page
// Web panel for configuring message rate limits per channel with role-based overrides

function generateRateLimiterPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Rate Limiting</title>
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
    .nav{display:flex;gap:12px;align-items:center}
    .nav a{color:var(--accent-cyan);text-decoration:none;font-size:14px;transition:color .2s}
    .nav a:hover{color:var(--accent-purple)}
    .btn{padding:10px 18px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:all .2s}
    .btn:hover{background:rgba(30,41,59,.9);border-color:var(--accent-purple)}
    .btn-primary{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));border:none;color:#fff;font-weight:600}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .btn-danger{background:var(--accent-rose);border:none;color:#fff}
    .btn-danger:hover{opacity:.9}
    .btn-sm{padding:6px 12px;font-size:13px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
    @media(max-width:1100px){.grid{grid-template-columns:1fr}}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3)}
    .card-title{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--accent-purple);display:flex;align-items:center;gap:8px}
    .card-title::first-letter{color:inherit}
    .form-group{margin-bottom:20px}
    .form-group label{display:block;font-size:13px;font-weight:500;margin-bottom:8px;color:var(--text)}
    .form-group input[type=number],.form-group select, .form-group textarea{width:100%;padding:10px 12px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:14px;font-family:inherit}
    .form-group textarea{resize:vertical;min-height:80px}
    .form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:var(--accent-purple);box-shadow:0 0 0 3px rgba(167,139,250,.1)}
    .toggle-container{display:flex;align-items:center;justify-content:space-between;padding:12px 0}
    .toggle-switch{position:relative;display:inline-block;width:56px;height:28px}
    .toggle-switch input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--border);border-radius:28px;transition:all .3s}
    .toggle-slider:before{position:absolute;content:"";height:20px;width:20px;left:4px;bottom:4px;background:#fff;border-radius:50%;transition:all .3s}
    .toggle-switch input:checked + .toggle-slider{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan))}
    .toggle-switch input:checked + .toggle-slider:before{transform:translateX(28px)}
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .role-limit-item{background:rgba(167,139,250,.1);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
    .role-limit-input{display:flex;gap:10px;margin-top:10px}
    .role-limit-input input{flex:1}
    .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
    .stat-card{background:linear-gradient(135deg,rgba(167,139,250,.1),rgba(34,211,238,.1));border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center}
    .stat-value{font-size:28px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
    .channel-selector{margin-bottom:20px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">🚦</span><span class="gradient-text">Message Rate Limiting</span></div>
        <div class="subtitle">Bot: ${bot.name} (${bot.key})</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 16px">← Back</button>
        <a href="${PANEL_BASE}/bot/${bot.key}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/stats">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/consecutive-limits">🚫 Consecutive</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/messages">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/ai-engagement">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/commands">📚 Commands</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/accuracy">🎯 Accuracy</a>
        <a href="${PANEL_BASE}/verification-dashboard?bot=${bot.key}">🔍 Verification</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div id="alertContainer"></div>

    <!-- Channel Selector -->
    <div class="card channel-selector">
      <div class="card-title">📺 Select Channel</div>
      <select id="channelSelect" class="form-group">
        <option value="">Loading channels...</option>
      </select>
    </div>

    <!-- Statistics -->
    <div class="stat-grid" id="statsContainer" style="display:none">
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

    <div class="grid">
      <!-- Configuration -->
      <div>
        <div class="card">
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
            <small style="color:var(--text-muted);display:block;margin-top:4px">DM sent to users when limit is exceeded</small>
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
      </div>

      <!-- Role-Based Limits -->
      <div>
        <div class="card">
          <div class="card-title">👥 Role-Based Limits</div>
          <div class="alert alert-info">
            Configure different limits for specific roles. Higher limits override default.
          </div>

          <div id="roleLimitsList">
            <!-- Role limits will be populated here -->
          </div>

          <div class="role-limit-input">
            <select id="roleSelector" style="flex:3">
              <option value="">Select a role...</option>
            </select>
            <input type="number" id="newRoleLimit" placeholder="Limit" min="1" max="9999" value="20" style="flex:1">
            <button class="btn btn-sm" id="addRoleBtn">Add Role Limit</button>
          </div>
          <small style="color:var(--text-muted);display:block;margin-top:8px">Or manually enter Role ID:</small>
          <div class="role-limit-input" style="margin-top:8px">
            <input type="text" id="manualRoleId" placeholder="Role ID (manual)" style="flex:2">
            <input type="text" id="manualRoleName" placeholder="Name (optional)" style="flex:2">
            <button class="btn btn-sm" id="addManualRoleBtn">Add Manual</button>
          </div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-title">ℹ️ How to Get Role ID</div>
          <div style="font-size:13px;color:var(--text-muted);line-height:1.8">
            1. Enable Developer Mode in Discord settings<br>
            2. Right-click on a role → Copy ID<br>
            3. Paste the ID above
          </div>
        </div>
      </div>
    </div>

    <!-- NEW: Consecutive Message Limiting -->
    <div class="grid" style="margin-top:20px">
      <div class="card">
        <div class="card-title">🚫 Consecutive Message Limiting</div>
        
        <div class="alert alert-info">
          <strong>Applies to Channel:</strong> <span id="consecutiveChannelInfo">Select a channel above</span>
        </div>
        
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

        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div style="font-weight:500;margin-bottom:12px">👥 Role-Based Consecutive Limits</div>
          
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

        <button class="btn btn-primary" id="saveConsecutiveBtn" style="width:100%;margin-top:16px">Save Configuration</button>
      </div>

      <!-- Strikes Viewer -->
      <div class="card">
        <div class="card-title">⚠️ Strikes Viewer</div>
        <button class="btn btn-sm" id="refreshStrikesBtn" style="margin-bottom:12px">🔄 Refresh Strikes</button>
        
        <div id="strikesContainer">
          <div style="color:var(--text-muted);text-align:center;padding:20px">
            Select a channel and click Refresh to view strikes
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const botKey = ${JSON.stringify(bot.key)};
    const apiBase = ${JSON.stringify(PANEL_BASE)};
    let channels = [];
    let currentChannelId = '1244792820917604463'; // Default channel
    let currentGuildId = '';
    let roleLimits = [];
    let consecutiveRoleLimits = []; // NEW: Consecutive role limits
    let availableRoles = []; // Guild roles from Discord

    function showAlert(message, type) {
      if (!type) type = 'success';
      const container = document.getElementById('alertContainer');
      const alert = document.createElement('div');
      alert.className = 'alert alert-' + type;
      alert.textContent = message;
      container.appendChild(alert);
      setTimeout(function() { alert.remove(); }, 4000);
    }

    async function api(path, opts = {}) {
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
          const defaultCh = channels.find(c => c.id === currentChannelId) || channels[0];
          currentChannelId = defaultCh.id;
          currentGuildId = defaultCh.guild_id;
          
          // Update consecutive channel info
          const channelInfo = document.getElementById('consecutiveChannelInfo');
          if (channelInfo) {
            channelInfo.textContent = defaultCh.guild_name + ' / #' + defaultCh.name;
          }
          
          await loadConfig();
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
        
        console.log('[LOAD] Received data from server:', data);
        
        if (data.config) {
          document.getElementById('enabledToggle').checked = data.config.enabled;
          document.getElementById('defaultLimit').value = data.config.default_limit;
          document.getElementById('timeWindow').value = data.config.time_window_minutes;
          document.getElementById('warningMessage').value = data.config.warning_message;
          document.getElementById('actionSelect').value = data.config.action || 'delete';
          roleLimits = data.config.role_limits || [];
          console.log('[LOAD] Set roleLimits to:', roleLimits);
          renderRoleLimits();

          // NEW: Load consecutive limiting fields
          document.getElementById('consecutiveEnabledToggle').checked = data.config.consecutive_enabled || false;
          document.getElementById('consecutiveLimit').value = data.config.consecutive_limit || 5;
          document.getElementById('strikeResetDays').value = data.config.strike_reset_days || 7;
          document.getElementById('timeoutsEnabledToggle').checked = data.config.timeouts_enabled !== false;
          consecutiveRoleLimits = data.config.consecutive_role_limits || [];
          renderConsecutiveRoleLimits();

          document.getElementById('statsContainer').style.display = 'grid';
        } else {
          // No config, show defaults
          document.getElementById('enabledToggle').checked = false;
          roleLimits = [];
          renderRoleLimits();
          document.getElementById('statsContainer').style.display = 'none';
        }

        if (data.stats) {
          document.getElementById('statTotal').textContent = data.stats.totalMessages || 0;
          document.getElementById('statViolations').textContent = data.stats.totalViolations || 0;
          document.getElementById('statViolators').textContent = data.stats.uniqueViolators || 0;
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    }

    function renderRoleLimits() {
      const container = document.getElementById('roleLimitsList');
      if (roleLimits.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:10px">No role limits configured</div>';
        return;
      }

      container.innerHTML = roleLimits.map((rl, idx) => {
        // Resolve role name from available roles if not stored
        const roleName = rl.name || resolveRoleName(rl.role_id);
        const roleColor = getRoleColor(rl.role_id);
        const colorStyle = roleColor ? 'color: ' + roleColor : '';
        
        return '<div class="role-limit-item">' +
          '<div style="flex:1">' +
            '<div style="font-weight:500;' + colorStyle + '">' + roleName + '</div>' +
            '<div style="font-size:13px;color:var(--text-muted)">ID: ' + rl.role_id + ' | Limit: ' + rl.limit + ' messages</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px">' +
            '<button class="btn btn-sm" onclick="editRoleLimit(' + idx + ')" style="background:var(--accent-purple);color:#fff">Edit</button>' +
            '<button class="btn btn-danger btn-sm" onclick="removeRoleLimit(' + idx + ')">Remove</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // NEW: Render consecutive role limits
    function renderConsecutiveRoleLimits() {
      const container = document.getElementById('consecutiveRoleLimitsList');
      if (consecutiveRoleLimits.length === 0) {
        container.innerHTML = '\u003cdiv style=\"color:var(--text-muted);font-size:13px;padding:10px\"\u003eNo role-based consecutive limits configured\u003c/div\u003e';
        return;
      }

      container.innerHTML = consecutiveRoleLimits.map((rl, idx) => {
        const roleName = rl.name || resolveRoleName(rl.role_id);
        const roleColor = getRoleColor(rl.role_id);
        const colorStyle = roleColor ? 'color: ' + roleColor : '';
        
        return '\u003cdiv class=\"role-limit-item\"\u003e' +
          '\u003cdiv style=\"flex:1\"\u003e' +
            '\u003cdiv style=\"font-weight:500;' + colorStyle + '\"\u003e' + roleName + '\u003c/div\u003e' +
            '\u003cdiv style=\"font-size:13px;color:var(--text-muted)\"\u003eID: ' + rl.role_id + ' | Limit: ' + rl.limit + ' consecutive messages\u003c/div\u003e' +
          '\u003c/div\u003e' +
          '\u003cdiv style=\"display:flex;gap:8px\"\u003e' +
            '\u003cbutton class=\"btn btn-danger btn-sm\" onclick=\"removeConsecutiveRoleLimit(' + idx + ')\"\u003eRemove\u003c/button\u003e' +
          '\u003c/div\u003e' +
        '\u003c/div\u003e';
      }).join('');
    }

    // NEW: Remove consecutive role limit
    window.removeConsecutiveRoleLimit = function(idx) {
      consecutiveRoleLimits.splice(idx, 1);
      renderConsecutiveRoleLimits();
      showAlert('Consecutive role limit removed! Click Save Configuration to persist.', 'info');
    };

    function resolveRoleName(roleId) {
      const role = availableRoles.find(r => r.id === roleId);
      return role ? role.name : 'Role: ' + roleId;
    }

    function getRoleColor(roleId) {
      const role = availableRoles.find(r => r.id === roleId);
      if (role && role.color && role.color !== 0) {
        return '#' + role.color.toString(16).padStart(6, '0');
      }
      return null;
    }

    async function loadRoles() {
      if (!currentGuildId) return;
      
      try {
        const data = await api(apiBase + '/api/' + botKey + '/roles?guildId=' + currentGuildId);
        availableRoles = data.roles || []; // Populate role selector dropdown
        
        const select = document.getElementById('roleSelector');
        const consecutiveSelect = document.getElementById('consecutiveRoleSelector'); // NEW
        
        const roleOptions = availableRoles.map(r => {
            const colorStyle = r.color ? 'color: #' + r.color.toString(16).padStart(6, '0') : '';
            return '<option value="' + r.id + '" style="' + colorStyle + '">' + r.name + '</option>';
          }).join('');

        select.innerHTML = '<option value="">Select a role...</option>' + roleOptions;
        consecutiveSelect.innerHTML = '<option value="">Select a role...</option>' + roleOptions; // NEW
        
        renderRoleLimits();
      } catch (e) {
        console.error('Failed to load roles:', e);
      }
    }

    window.removeRoleLimit = function(idx) {
      roleLimits.splice(idx, 1);
      renderRoleLimits();
    };

    window.editRoleLimit = function(idx) {
      const rl = roleLimits[idx];
      const newLimit = prompt('Enter new limit for ' + (rl.name || rl.role_id) + ':', rl.limit);
      
      if (newLimit !== null && !isNaN(newLimit)) {
        const limitNum = parseInt(newLimit);
        if (limitNum > 0) {
          roleLimits[idx].limit = limitNum;
          renderRoleLimits();
          showAlert('Limit updated. Click Save Configuration to persist.', 'info');
        }
      }
    };

    // Add role from dropdown
    document.getElementById('addRoleBtn').addEventListener('click', () => {
      const roleId = document.getElementById('roleSelector').value;
      const limit = parseInt(document.getElementById('newRoleLimit').value);

      if (!roleId) {
        showAlert('Please select a role', 'warning');
        return;
      }

      if (roleLimits.find(rl => rl.role_id === roleId)) {
        showAlert('Role limit already exists', 'warning');
        return;
      }

      const role = availableRoles.find(r => r.id === roleId);
      const roleLimit = { 
        role_id: roleId, 
        limit: limit,
        name: role ? role.name : undefined
      };
      
      roleLimits.push(roleLimit);
      renderRoleLimits();

      document.getElementById('roleSelector').value = '';
      document.getElementById('newRoleLimit').value = '20';
      showAlert('Role limit added! Click Save Configuration to persist.', 'info');
    });

    // Add manual role by ID
    document.getElementById('addManualRoleBtn').addEventListener('click', () => {
      const roleId = document.getElementById('manualRoleId').value.trim();
      const roleName = document.getElementById('manualRoleName').value.trim();
      const limit = parseInt(document.getElementById('newRoleLimit').value);

      if (!roleId) {
        showAlert('Please enter a role ID', 'warning');
        return;
      }

      if (roleLimits.find(rl => rl.role_id === roleId)) {
        showAlert('Role limit already exists', 'warning');
        return;
      }

      const roleLimit = { role_id: roleId, limit: limit };
      if (roleName) {
        roleLimit.name = roleName;
      }
      
      roleLimits.push(roleLimit);
      renderRoleLimits();

      document.getElementById('manualRoleId').value = '';
      document.getElementById('manualRoleName').value = '';
      showAlert('Role limit added! Click Save Configuration to persist.', 'info');
    });

    // NEW: Add consecutive role limit from dropdown
    document.getElementById('addConsecutiveRoleBtn').addEventListener('click', () => {
      const roleId = document.getElementById('consecutiveRoleSelector').value;
      const limit = parseInt(document.getElementById('newConsecutiveRoleLimit').value);

      if (!roleId) {
        showAlert('Please select a role', 'warning');
        return;
      }

      if (consecutiveRoleLimits.find(rl => rl.role_id === roleId)) {
        showAlert('Consecutive role limit already exists for this role', 'warning');
        return;
      }

      const role = availableRoles.find(r => r.id === roleId);
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

    document.getElementById('channelSelect').addEventListener('change', async (e) => {
      const selectedOption = e.target.selectedOptions[0];
      currentChannelId = e.target.value;
      currentGuildId = selectedOption.dataset.guild;
      
      // Update consecutive channel info display
      const selectedChannel = channels.find(c => c.id === currentChannelId);
      if (selectedChannel) {
        const channelInfo = document.getElementById('consecutiveChannelInfo');
        if (channelInfo) {
          channelInfo.textContent = selectedChannel.guild_name + ' / #' + selectedChannel.name;
        }
      }
      
      await loadRoles(); // Load roles for new guild
      await loadConfig();
    });

    document.getElementById('saveBtn').addEventListener('click', async () => {
      if (!currentChannelId || !currentGuildId) {
        showAlert('Please select a channel first', 'warning');
        return;
      }

      try {
        const config = {
          enabled: document.getElementById('enabledToggle').checked,
          default_limit: parseInt(document.getElementById('defaultLimit').value),
          time_window_minutes: parseInt(document.getElementById('timeWindow').value),
          warning_message: document.getElementById('warningMessage').value,
          action: document.getElementById('actionSelect').value,
          role_limits: roleLimits,
          // NEW: Consecutive limiting fields
          consecutive_enabled: document.getElementById('consecutiveEnabledToggle').checked,
          consecutive_limit: parseInt(document.getElementById('consecutiveLimit').value) || 5,
          consecutive_role_limits: consecutiveRoleLimits,
          strike_reset_days: parseInt(document.getElementById('strikeResetDays').value) || 7,
          timeouts_enabled: document.getElementById('timeoutsEnabledToggle').checked,
        };

        console.log('[SAVE] Saving config with role_limits:', roleLimits);
        console.log('[SAVE] Full config:', config);

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

    // NEW: Load strikes viewer
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

    // NEW: Clear strikes for a user
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

    // NEW: Refresh strikes button
    document.getElementById('refreshStrikesBtn').addEventListener('click', loadStrikes);

    // NEW: Save consecutive button (uses same save logic as main save)
    document.getElementById('saveConsecutiveBtn').addEventListener('click', () => {
      document.getElementById('saveBtn').click();
    });

    // Initialize
    (async () => {
      await loadChannels();
      await loadRoles(); // Load roles after channels
      await loadStrikes(); // NEW: Load strikes on initial page load
    })();
  </script>
  <link rel="stylesheet" href="/snow.css">
</body>
</html>`;
}

module.exports = { generateRateLimiterPage };
