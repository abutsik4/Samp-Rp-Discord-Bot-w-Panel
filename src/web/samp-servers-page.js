// SAMP Servers Status Page

const { generate } = require('./shared-template');

function generateSampServersPage(bot, PANEL_BASE) {
  const head = `
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-success{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);color:var(--accent-green)}
    .alert-error{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:#f87171}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    
    .toggle-container{display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)}
    .toggle-switch{position:relative;display:inline-block;width:56px;height:28px}
    .toggle-switch input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--border);border-radius:28px;transition:all .3s}
    .toggle-slider:before{position:absolute;content:"";height:20px;width:20px;left:4px;bottom:4px;background:#fff;border-radius:50%;transition:all .3s}
    .toggle-switch input:checked+.toggle-slider{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan))}
    .toggle-switch input:checked+.toggle-slider:before{transform:translateX(28px)}
    
    .server-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px;margin-top:20px}
    .server-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;transition:all .3s}
    .server-card:hover{transform:translateY(-3px);border-color:var(--accent-purple)}
    .server-header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
    .server-status{width:12px;height:12px;border-radius:50%;flex-shrink:0}
    .server-status.online{background:var(--accent-green);box-shadow:0 0 12px var(--accent-green)}
    .server-status.offline{background:#f87171;box-shadow:0 0 12px #f87171}
    .server-status.unknown{background:var(--accent-amber);box-shadow:0 0 12px var(--accent-amber)}
    .server-name{font-weight:600;font-size:15px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .server-ip{font-size:13px;color:var(--text-muted);font-family:monospace;background:var(--input-bg);padding:6px 10px;border-radius:6px;margin-bottom:12px}
    .server-players{display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:12px}
    .player-bar{flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden}
    .player-fill{height:100%;background:linear-gradient(90deg,var(--accent-purple),var(--accent-cyan));border-radius:4px;transition:width .3s}
    .server-info{font-size:13px;color:var(--text-muted);margin-bottom:8px;display:flex;justify-content:space-between}
    .server-actions{display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
    .server-actions button{flex:1;padding:8px;font-size:12px}
    
    .add-form{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:12px;align-items:end}
    @media(max-width:768px){.add-form{grid-template-columns:1fr}}
    
    .stat-bar{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:20px;padding:16px;background:var(--bg-card);border-radius:12px;border:1px solid var(--border)}
    .stat-item{text-align:center;flex:1;min-width:100px}
    .stat-value{font-size:28px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-top:4px}
    
    .empty-state{text-align:center;padding:60px 20px;color:var(--text-muted)}
    .empty-state-icon{font-size:64px;margin-bottom:16px;opacity:.5}
    
    .channel-select{width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);margin-bottom:12px}
  `;

  const body = `
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🎮</span> SA-MP Server Status</h1>
            <p class="section-subtitle">Monitor and manage SA-MP game servers</p>
          </div>

          <div id="alertContainer"></div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">⚙️ Tracker Controls</div>

            <div class="toggle-container">
              <span style="font-weight:500">Enable All Trackers</span>
              <label class="toggle-switch">
                <input type="checkbox" id="enabledToggle">
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="form-group" style="margin-top:16px">
              <label>Default Status Channel (for new servers)</label>
              <select id="channelSelect" class="channel-select">
                <option value="">Select a channel...</option>
              </select>
              <small style="color:var(--text-muted)">Each server stores its own channel. This is used as default when adding.</small>
            </div>
          </div>

          <div class="stat-bar" data-scroll data-scroll-class="is-inview">
            <div class="stat-item">
              <div class="stat-value" id="totalServers">0</div>
              <div class="stat-label">Total Servers</div>
            </div>
            <div class="stat-item">
              <div class="stat-value" id="onlineServers">0</div>
              <div class="stat-label">Enabled</div>
            </div>
            <div class="stat-item">
              <div class="stat-value" id="offlineServers">0</div>
              <div class="stat-label">Disabled</div>
            </div>
            <div class="stat-item">
              <div class="stat-value" id="totalPlayers">—</div>
              <div class="stat-label">Live Status</div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">➕ Add New Server</div>
            <div class="add-form">
              <div class="form-group" style="margin-bottom:0">
                <label>Server Name</label>
                <input type="text" id="serverName" placeholder="My SAMP Server">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label>IP:Port</label>
                <input type="text" id="serverIP" placeholder="127.0.0.1:7777">
              </div>
              <div class="form-group" style="margin-bottom:0">
                <label>Channel</label>
                <select id="addChannelSelect" class="channel-select" style="margin-bottom:0">
                  <option value="">Select channel...</option>
                </select>
              </div>
              <button class="btn btn-primary" id="addServerBtn" style="height:42px">➕ Add</button>
            </div>
          </div>

          <div data-scroll data-scroll-class="is-inview">
            <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0">
              <h3 style="margin:0;font-weight:600">🖥️ Tracked Servers</h3>
              <button class="btn" id="refreshAllBtn">🔄 Refresh All</button>
            </div>

            <div id="serverGrid" class="server-grid">
              <div class="empty-state">
                <div class="empty-state-icon">🎮</div>
                <h3>No servers tracked yet</h3>
                <p>Add a SA-MP server above to start monitoring</p>
              </div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview" style="margin-top:20px">
            <div class="card-title">ℹ️ About SA-MP Status</div>
            <div class="alert alert-info">
              This feature monitors SA-MP (San Andreas Multiplayer) game servers and posts live status updates to a Discord channel.
            </div>
            <ul style="margin-left:20px;margin-top:12px;color:var(--text-muted);font-size:14px">
              <li>Real-time player counts and server status</li>
              <li>Automatic status message updates</li>
              <li>Online/offline change notifications</li>
              <li>Server hostname and gamemode display</li>
              <li>Current map and player list</li>
            </ul>
          </div>
        </section>
  `;

  const scripts = `
  <script>
    const botKey = '${bot.key}';
    const apiBase = '${PANEL_BASE}';
    let servers = [];

    function showAlert(msg, type = 'success') {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 4000);
    }

    async function api(path, opts = {}) {
      return window.panelFetchJson(path, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(opts && opts.headers ? opts.headers : {})
        }
      });
    }

    function updateStats() {
      const enabled = servers.filter(s => s.enabled).length;
      document.getElementById('totalServers').textContent = servers.length;
      document.getElementById('onlineServers').textContent = enabled;
      document.getElementById('offlineServers').textContent = servers.length - enabled;
    }

    function renderServers() {
      const grid = document.getElementById('serverGrid');
      if (servers.length === 0) {
        grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎮</div><h3>No servers tracked yet</h3><p>Add a SA-MP server above to start monitoring</p></div>';
        return;
      }
      grid.innerHTML = servers.map(s => {
        const statusClass = s.enabled ? 'online' : 'offline';
        const statusText = s.enabled ? 'Enabled' : 'Disabled';
        const channelName = s.channel_label ? s.channel_label : (s.channel_id ? ('Channel: ' + s.channel_id) : 'Channel: —');
        return '<div class="server-card">'
          + '<div class="server-header">'
          + '<div class="server-status ' + statusClass + '" title="' + statusText + '"></div>'
          + '<div class="server-name">' + (s.emoji || '🎮') + ' ' + (s.server_name || s.server_id) + '</div>'
          + '</div>'
          + '<div class="server-ip">' + s.server_ip + ':' + (s.server_port || 7777) + '</div>'
          + '<div class="server-info"><span>' + channelName + '</span><span>ID: ' + s.server_id + '</span></div>'
          + '<div class="server-actions">'
          + (s.enabled
              ? '<button class="btn" onclick="stopServer(\\'' + s.server_id + '\\')">⏸️ Stop</button>'
              : '<button class="btn" onclick="startServer(\\'' + s.server_id + '\\')">▶️ Start</button>')
          + '<button class="btn btn-danger" onclick="deleteServer(\\'' + s.server_id + '\\')">🗑️ Delete</button>'
          + '</div>'
          + '</div>';
      }).join('');
      updateStats();
    }

    function slugify(str) {
      return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 32) || 'server';
    }

    function parseIpPort(value) {
      const raw = String(value || '').trim();
      const m = raw.match(/^(.+?)(?::(\d{1,5}))?$/);
      if (!m) return null;
      const ip = m[1].trim();
      const port = m[2] ? parseInt(m[2], 10) : 7777;
      if (!ip) return null;
      if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
      return { ip, port };
    }

    async function loadServers() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/samp-servers');
        servers = (data.servers || []).map(s => ({
          ...s,
          enabled: Boolean(s.enabled)
        }));

        // Attach channel names when available
        const channelById = new Map();
        const channelSelect = document.getElementById('channelSelect');
        Array.from(channelSelect.options).forEach(opt => {
          if (opt.value) channelById.set(opt.value, opt.textContent);
        });
        servers.forEach(s => {
          if (s.channel_id && channelById.has(s.channel_id)) s.channel_label = channelById.get(s.channel_id);
        });

        renderServers();
      } catch (e) { showAlert('Failed to load servers', 'error'); }
    }

    async function loadChannels() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/sendable-channels');
        const select = document.getElementById('channelSelect');
        const addSelect = document.getElementById('addChannelSelect');
        select.innerHTML = '<option value="">Select a channel...</option>';
        addSelect.innerHTML = '<option value="">Select channel...</option>';
        (data.items || []).forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = (ch.guild_name ? (ch.guild_name + ' / ') : '') + '#' + ch.name;
          select.appendChild(opt);
          addSelect.appendChild(opt.cloneNode(true));
        });
      } catch (e) {}
    }

    document.getElementById('addServerBtn').addEventListener('click', async () => {
      const name = document.getElementById('serverName').value.trim();
      const ip = document.getElementById('serverIP').value.trim();
      const channelId = document.getElementById('addChannelSelect').value || document.getElementById('channelSelect').value;
      if (!name || !ip || !channelId) return showAlert('Please fill all fields', 'warning');
      const parsed = parseIpPort(ip);
      if (!parsed) return showAlert('Invalid IP:Port', 'warning');
      try {
        const serverId = slugify(name) + '-' + Math.random().toString(36).slice(2, 6);
        await api(apiBase + '/api/' + botKey + '/samp-servers', {
          method: 'POST',
          body: JSON.stringify({
            server_id: serverId,
            server_name: name,
            server_ip: parsed.ip,
            server_port: parsed.port,
            channel_id: channelId,
            emoji: '🎮'
          })
        });
        showAlert('Server added!', 'success');
        document.getElementById('serverName').value = '';
        document.getElementById('serverIP').value = '';
        document.getElementById('addChannelSelect').value = '';
        loadServers();
      } catch (e) { showAlert(e.message, 'error'); }
    });

    window.deleteServer = async (id) => {
      if (!confirm('Remove this server?')) return;
      try {
        await api(apiBase + '/api/' + botKey + '/samp-servers/' + id, { method: 'DELETE' });
        showAlert('Server removed', 'success');
        loadServers();
      } catch (e) { showAlert(e.message, 'error'); }
    };

    window.startServer = async (id) => {
      try {
        await api(apiBase + '/api/' + botKey + '/samp-servers/' + id + '/start', { method: 'POST' });
        showAlert('Tracker started', 'success');
        loadServers();
      } catch (e) { showAlert(e.message, 'error'); }
    };

    window.stopServer = async (id) => {
      try {
        await api(apiBase + '/api/' + botKey + '/samp-servers/' + id + '/stop', { method: 'POST' });
        showAlert('Tracker stopped', 'success');
        loadServers();
      } catch (e) { showAlert(e.message, 'error'); }
    };

    async function setAllEnabled(enabled) {
      const action = enabled ? 'start' : 'stop';
      const targets = servers.filter(s => Boolean(s.enabled) !== Boolean(enabled));
      if (targets.length === 0) return;
      for (const s of targets) {
        try {
          await api(apiBase + '/api/' + botKey + '/samp-servers/' + s.server_id + '/' + action, { method: 'POST' });
        } catch (e) {
          // keep going
        }
      }
    }

    document.getElementById('refreshAllBtn').addEventListener('click', loadServers);

    document.getElementById('enabledToggle').addEventListener('change', async (e) => {
      const enabled = Boolean(e.target.checked);
      await setAllEnabled(enabled);
      loadServers();
    });

    document.addEventListener('DOMContentLoaded', () => {
      loadChannels().then(() => loadServers());
    });
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel — SAMP Servers',
    currentPage: 'samp-servers',
    PANEL_BASE,
  });
}

module.exports = { generateSampServersPage };
