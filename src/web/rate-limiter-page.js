// Unified Spam Prevention Management Page

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateRateLimiterPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Spam Prevention</title>
  <link rel="stylesheet" href="/shared.css?v=${Date.now()}" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <style>
    ${generateSidebarStyles()}
    
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-bottom: 24px; align-items: start; width: 100%; }
    @media(max-width: 1300px) { .grid { grid-template-columns: 1fr; } }
    
    .toggle-container { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); margin-bottom: 16px; min-height: 48px; gap: 14px; }
    .toggle-switch { position: relative; display: inline-block; width: 64px; height: 28px; flex-shrink: 0; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }

    /* Make switch state visually obvious (track + ON/OFF label) */
    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 999px;
      transition: background .2s ease, border-color .2s ease;
    }
    .toggle-slider:before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 4px;
      top: 50%;
      transform: translateY(-50%);
      background: #ffffff;
      border-radius: 999px;
      transition: transform .2s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,.25);
    }
    .toggle-slider:after {
      content: "OFF";
      position: absolute;
      right: 9px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .06em;
      color: rgba(255, 255, 255, 0.70);
      transition: color .2s ease;
      pointer-events: none;
    }
    .toggle-switch input:checked + .toggle-slider {
      background: rgba(59, 130, 246, 0.75);
      border-color: rgba(59, 130, 246, 0.9);
    }
    .toggle-switch input:checked + .toggle-slider:before {
      transform: translate(36px, -50%);
    }
    .toggle-switch input:checked + .toggle-slider:after {
      content: "ON";
      left: 10px;
      right: auto;
      color: rgba(255, 255, 255, 0.92);
    }

    .toggle-switch input:focus + .toggle-slider {
      outline: 2px solid rgba(59, 130, 246, 0.55);
      outline-offset: 2px;
    }

    .toggle-state {
      margin-top: 6px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .02em;
    }
    .toggle-state.on { color: rgba(34, 197, 94, .95); }
    .toggle-state.off { color: rgba(248, 113, 113, .95); }
    .toggle-state span { color: var(--text-muted); font-weight: 700; margin-right: 6px; }
    
    .alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
    .alert-info { background: rgba(59,130,246,.1); color: #3b82f6; border: 1px solid rgba(59,130,246,.2); }
    .alert-success { background: rgba(34,197,94,.1); color: #22c55e; border: 1px solid rgba(34,197,94,.2); }
    .alert-warning { background: rgba(251,191,36,.1); color: #f59e0b; border: 1px solid rgba(251,191,36,.2); }
    
    .role-limit-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; font-size: 13px; gap: 10px; overflow: hidden; width: 100%; }
    .role-limit-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
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

    .table-container { width: 100%; overflow-x: auto; scrollbar-width: thin; -webkit-overflow-scrolling: touch; }
    .content-card { max-width: 100%; overflow: hidden; width: 100%; min-width: 0; height: 100%; }
    .page-content-wrapper { max-width: 1400px; margin: 0; width: 100%; }
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'Spam Prevention',
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
            <p class="section-subtitle">Manage message frequency and user strikes</p>
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
            <!-- Frequency Limits Column -->
            <div class="content-card">
              <div class="subsection-title">🚦 Frequency Limits</div>
              
              <div class="toggle-container">
                <div>
                  <div style="font-weight:500">Enable Turn-Taking Limit</div>
                  <small style="color:var(--text-muted)">Limit consecutive messages; resets when someone else speaks</small>
                  <div class="toggle-state off" id="rateEnabledState"><span>Currently:</span>OFF</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="rateEnabled">
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group" style="margin-bottom: 16px;">
                <label>Max Consecutive Messages</label>
                <input type="number" id="rateLimit" min="1" max="1000" value="10">
              </div>

              <div class="form-group" style="margin-bottom: 16px;">
                <label>Warning Message</label>
                <textarea id="warningMessage" rows="2">You have exceeded the message limit for this channel.</textarea>
              </div>
              
              <div class="form-group" style="margin-bottom: 16px;">
                <label>Action</label>
                <select id="actionSelect">
                  <option value="delete">Delete Message</option>
                  <option value="warn">Warn Only</option>
                </select>
              </div>

              <div class="divider"></div>
              <div class="subsection-title">👥 Role Overrides</div>
              <p style="color:var(--text-muted); font-size: 13px; margin-bottom: 10px;">Users with these roles can send more consecutive messages before being limited.</p>
              <div id="rateRoleLimitsList"></div>
              <div class="role-limit-input">
                <select id="rateRoleSelector" style="flex:2"><option value="">Select role...</option></select>
                <input type="number" id="newRateRoleLimit" placeholder="Limit" value="20" style="flex:1">
                <button class="btn btn-sm" id="addRateRoleBtn" style="padding: 8px 16px;">Add</button>
              </div>
            </div>

            <!-- Punishments Column -->
            <div class="content-card">
              <div class="subsection-title">⚖️ Punishments (Strikes)</div>

              <div class="toggle-container">
                <div>
                  <div style="font-weight:500">Apply Timeouts</div>
                  <small style="color:var(--text-muted)">Mute users automatically after strikes</small>
                  <div class="toggle-state on" id="timeoutsEnabledState"><span>Currently:</span>ON</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="timeoutsEnabled" checked>
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="form-group" style="margin-bottom: 16px;">
                <label>Timeout per Strike (minutes)</label>
                <input type="number" id="timeoutPerStrike" min="1" max="60" value="1">
              </div>

              <div class="form-group" style="margin-bottom: 16px;">
                <label>Strike Reset (days)</label>
                <input type="number" id="strikeResetDays" min="1" max="365" value="7">
              </div>
              
              <div class="toggle-container">
                <div>
                  <div style="font-weight:500">Ignore Admins</div>
                  <small style="color:var(--text-muted)">Safety: never limit administrators</small>
                  <div class="toggle-state on" id="ignoreAdminsState"><span>Currently:</span>ON</div>
                </div>
                <label class="toggle-switch">
                  <input type="checkbox" id="ignoreAdmins" checked>
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <div class="divider"></div>
              <div class="alert alert-info" style="margin-bottom:0">
                Strikes are recorded when a user exceeds the frequency limit. If timeouts are enabled, users will be temporarily restricted from typing.
              </div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <button class="btn btn-primary" id="saveBtn" style="width:100%; height: 50px; font-size: 16px; font-weight: 700;">💾 Save Configuration</button>
          </div>

          <!-- Strikes Viewer Section -->
          <div class="content-card" data-scroll data-scroll-class="is-inview" style="margin-top: 24px;">
            <div class="subsection-title">⚠️ Active User Strikes</div>
            <p style="color:var(--text-muted); font-size: 13px; margin-bottom: 16px;">List of users who have recently violated spam rules across your server.</p>
            <div id="strikesContainer">
              <div style="color:var(--text-muted); font-style:italic; padding: 20px; text-align: center;">Select a channel to view strikes</div>
            </div>
            <button class="btn btn-secondary btn-sm" id="refreshStrikesBtn" style="margin-top: 16px; width: 100%;">🔄 Refresh Strikes List</button>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview" style="margin-top:20px">
             <div class="card-title">ℹ️ Information</div>
             <p style="color:var(--text-muted); font-size: 14px; line-height: 1.6;">
               <strong>How it works:</strong> The Spam Prevention system monitors how many <strong>consecutive</strong> messages a user sends.
               If a user exceeds the <strong>Max Consecutive Messages</strong>, their next message is deleted (or they are warned).
               When someone else speaks, the counter resets.
               <br><br>
               <strong>Strikes:</strong> Each violation adds a strike to the user. After several strikes, the user may be automatically timed out if enabled.
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
    let rateRoleLimits = [];

    function showAlert(msg, type) {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 4000);
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
        
        const populate = (selId) => {
          const s = document.getElementById(selId);
          if (!s) return;
          s.innerHTML = '<option value="">Select role...</option>';
          rolesCache.forEach(r => {
             const opt = document.createElement('option');
             opt.value = r.id;
             opt.textContent = r.name;
             s.appendChild(opt);
          });
        };
        populate('rateRoleSelector');

        // Re-render overrides so role IDs resolve to names once roles are loaded.
        try { renderRoleLimits('rateRoleLimitsList', rateRoleLimits, 'rateRoleLimits'); } catch (_) {}
      } catch(e) { console.error(e); }
    }

    async function loadConfig() {
      if (!currentChannelId) return;
      
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/rate-limits/' + currentChannelId);
        const config = await res.json();
        
        if (config.guild_id) loadRoles(config.guild_id);

        document.getElementById('rateEnabled').checked = !!config.enabled;
        updateToggleState('rateEnabled', 'rateEnabledState');
        document.getElementById('rateLimit').value = config.default_limit || 10;
        // Turn-taking mode: time window is not used.
        document.getElementById('warningMessage').value = config.warning_message || '';
        document.getElementById('actionSelect').value = config.action || 'delete';
        
        rateRoleLimits = config.role_limits || [];
        renderRoleLimits('rateRoleLimitsList', rateRoleLimits, 'rateRoleLimits');

        document.getElementById('timeoutsEnabled').checked = config.timeouts_enabled !== false;
        updateToggleState('timeoutsEnabled', 'timeoutsEnabledState');
        document.getElementById('timeoutPerStrike').value = config.timeout_duration_per_strike || config.timeout_per_strike || 1;
        document.getElementById('strikeResetDays').value = config.strike_reset_days || 7;
        document.getElementById('ignoreAdmins').checked = config.ignore_admins !== false;
        updateToggleState('ignoreAdmins', 'ignoreAdminsState');

        if(config.stats) {
           document.getElementById('statsContainer').style.display = 'grid';
           document.getElementById('statTotal').textContent = config.stats.total || 0;
           document.getElementById('statViolations').textContent = config.stats.violations || 0;
           document.getElementById('statViolators').textContent = config.stats.unique_violators || 0;
        } else {
           document.getElementById('statsContainer').style.display = 'none';
        }

        await loadStrikes(config.guild_id);
      } catch (err) { 
        console.error(err);
        showAlert('Failed to load config', 'warning'); 
      }
    }

    function updateToggleState(checkboxId, labelId) {
      const cb = document.getElementById(checkboxId);
      const label = document.getElementById(labelId);
      if (!cb || !label) return;
      const on = !!cb.checked;
      label.classList.toggle('on', on);
      label.classList.toggle('off', !on);
      label.innerHTML = '<span>Currently:</span>' + (on ? 'ON' : 'OFF');
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

        container.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'table-container';

        const table = document.createElement('table');
        table.className = 'strikes-table';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['User', 'Strikes', 'Last Violation', 'Actions'].forEach(label => {
          const th = document.createElement('th');
          th.textContent = label;
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);

        const tbody = document.createElement('tbody');

        users.forEach(u => {
          const tr = document.createElement('tr');

          const tdUser = document.createElement('td');
          if (u.username) {
            const pill = document.createElement('span');
            pill.className = 'user-pill';
            pill.textContent = u.username;
            tdUser.appendChild(pill);
          } else {
            const code = document.createElement('code');
            code.style.fontSize = '11px';
            code.textContent = u.user_id;
            tdUser.appendChild(code);
          }

          const tdStrikes = document.createElement('td');
          tdStrikes.style.fontWeight = '700';
          tdStrikes.style.color = 'var(--accent-rose)';
          const strikesVal = (u && (u.strikes ?? u.total_violations)) ?? 0;
          tdStrikes.textContent = String(strikesVal);

          const tdLast = document.createElement('td');
          const lastTs = (u && (u.last_violation_timestamp ?? u.last_violation)) ?? null;
          const lastDate = lastTs
            ? new Date(Number(lastTs) * 1000).toLocaleString()
            : 'Never';
          tdLast.textContent = lastDate;

          const tdActions = document.createElement('td');
          const btn = document.createElement('button');
          btn.className = 'btn btn-danger btn-sm';
          btn.textContent = 'Clear';
          btn.addEventListener('click', () => clearStrikes(u.user_id, guildId));
          tdActions.appendChild(btn);

          tr.appendChild(tdUser);
          tr.appendChild(tdStrikes);
          tr.appendChild(tdLast);
          tr.appendChild(tdActions);

          tbody.appendChild(tr);
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        wrapper.appendChild(table);
        container.appendChild(wrapper);
      } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="alert alert-warning">Failed to load strikes list</div>';
      }
    }

    window.clearStrikes = async function(userId, guildId) {
      if (!confirm('Are you sure you want to clear strikes for this user?')) return;
      try {
        const res = await fetch(
          apiBase + '/api/' + botKey + '/rate-limits/strikes/' + encodeURIComponent(userId) +
          '?guildId=' + encodeURIComponent(guildId),
          { method: 'DELETE' }
        );
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
      if (!c) return;
      c.innerHTML = '';
      if (!limits || !limits.length) {
        c.innerHTML = '<div style="color:var(--text-muted);font-style:italic">No overrides set</div>';
        return;
      }
      limits.forEach((l, idx) => {
        const row = document.createElement('div');
        row.className = 'role-limit-item';

        const left = document.createElement('span');

        const roleName =
          (l && l.role_name) ||
          (rolesCache.find(r => r.id === l.role_id)?.name) ||
          l.role_id;

        const b = document.createElement('b');
        b.textContent = roleName;
        left.appendChild(b);
        left.appendChild(document.createTextNode(': ' + l.limit + ' consecutive'));

        const btn = document.createElement('button');
        btn.className = 'btn btn-danger btn-sm';
        btn.textContent = '×';
        btn.addEventListener('click', () => removeRoleLimit(arrayName, idx));

        row.appendChild(left);
        row.appendChild(btn);
        c.appendChild(row);
      });
    }

    window.removeRoleLimit = function(arrayName, idx) {
      if (arrayName === 'rateRoleLimits') {
        rateRoleLimits.splice(idx, 1);
        renderRoleLimits('rateRoleLimitsList', rateRoleLimits, 'rateRoleLimits');
      }
    };

    function addRoleLimit() {
      const roleId = document.getElementById('rateRoleSelector').value;
      const limit = parseInt(document.getElementById('newRateRoleLimit').value);
      
      if (!roleId) return showAlert('Select a role', 'warning');
      if (isNaN(limit) || limit < 1) return showAlert('Enter a valid limit', 'warning');

      const obj = { role_id: roleId, limit: limit, role_name: rolesCache.find(r => r.id === roleId)?.name || roleId };
      rateRoleLimits = rateRoleLimits.filter(r => r.role_id !== roleId);
      rateRoleLimits.push(obj);
      renderRoleLimits('rateRoleLimitsList', rateRoleLimits, 'rateRoleLimits');
    }

    async function saveConfig() {
      if (!currentChannelId) return showAlert('Select a channel first', 'warning');

      // UX guard: if a role is selected but not added, prompt to add it so it doesn't get lost.
      const pendingRoleId = document.getElementById('rateRoleSelector')?.value;
      const pendingLimitRaw = document.getElementById('newRateRoleLimit')?.value;
      const pendingLimit = pendingLimitRaw != null ? parseInt(pendingLimitRaw) : NaN;
      if (pendingRoleId && !Number.isNaN(pendingLimit) && pendingLimit > 0) {
        const already = rateRoleLimits.some(r => r.role_id === pendingRoleId);
        if (!already) {
          const ok = confirm('You selected a role override but did not click Add. Add it now before saving?');
          if (ok) {
            try { addRoleLimit(); } catch (_) {}
          }
        }
      }
      
      const payload = {
        enabled: document.getElementById('rateEnabled').checked,
        default_limit: parseInt(document.getElementById('rateLimit').value),
        warning_message: document.getElementById('warningMessage').value,
        action: document.getElementById('actionSelect').value,
        role_limits: rateRoleLimits,
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
        if (res.ok) showAlert('Settings successfully saved! (Role overrides: ' + (rateRoleLimits?.length || 0) + ')', 'success');
        else showAlert('Failed to save settings', 'warning');
      } catch (err) { showAlert('Error saving config', 'warning'); }
    }

    document.getElementById('channelSelect').addEventListener('change', (e) => {
      currentChannelId = e.target.value;
      if (currentChannelId) loadConfig();
    });

    document.getElementById('addRateRoleBtn').addEventListener('click', addRoleLimit);
    document.getElementById('saveBtn').addEventListener('click', saveConfig);
    document.getElementById('refreshStrikesBtn').addEventListener('click', () => {
      if(currentChannelId) loadConfig();
    });

    document.getElementById('rateEnabled').addEventListener('change', () => updateToggleState('rateEnabled', 'rateEnabledState'));
    document.getElementById('timeoutsEnabled').addEventListener('change', () => updateToggleState('timeoutsEnabled', 'timeoutsEnabledState'));
    document.getElementById('ignoreAdmins').addEventListener('change', () => updateToggleState('ignoreAdmins', 'ignoreAdminsState'));

    document.addEventListener('DOMContentLoaded', async () => {
       await loadChannels();
       updateToggleState('rateEnabled', 'rateEnabledState');
       updateToggleState('timeoutsEnabled', 'timeoutsEnabledState');
       updateToggleState('ignoreAdmins', 'ignoreAdminsState');
    });
  </script>
</body>
</html>`;
}

module.exports = { generateRateLimiterPage };
