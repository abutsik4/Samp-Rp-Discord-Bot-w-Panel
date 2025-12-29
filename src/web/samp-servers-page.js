const generateSampServersPage = (bot, panelBase) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SAMP Servers - ${bot.name}</title>
  <link rel="stylesheet" href="/shared.css">
  <style>
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--space-md);
      margin-bottom: var(--space-xl);
    }

    .stat-card {
      background: var(--gradient-glass);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: var(--space-lg);
      text-align: center;
      transition: all var(--transition-base);
    }

    .stat-card:hover {
      border-color: var(--border-hover);
      box-shadow: var(--shadow-glow);
      transform: translateY(-2px);
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      background: var(--gradient-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .section-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: var(--space-xl);
      margin-bottom: var(--space-xl);
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-bright);
      margin-bottom: var(--space-md);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    .server-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: var(--space-lg);
      margin-bottom: var(--space-md);
      transition: all var(--transition-base);
    }

    .server-card:hover {
      border-color: var(--border-hover);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }

    .server-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-md);
      padding-bottom: var(--space-sm);
      border-bottom: 1px solid var(--border);
    }

    .server-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-bright);
    }

    .server-status {
      padding: 3px 10px;
      border-radius: var(--radius-full);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-online {
      background: rgba(52, 211, 153, 0.1);
      border: 1px solid rgba(52, 211, 153, 0.3);
      color: var(--accent-emerald);
    }

    .status-offline {
      background: rgba(251, 113, 133, 0.1);
      border: 1px solid rgba(251, 113, 133, 0.3);
      color: var(--accent-rose);
    }

    .server-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--space-sm);
      margin-bottom: var(--space-md);
    }

    .info-item {
      background: var(--input-bg);
      padding: var(--space-sm);
      border-radius: var(--radius-sm);
      border: 1px solid rgba(45, 55, 75, 0.5);
    }

    .info-label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }

    .info-value {
      font-size: 13px;
      color: var(--text);
      font-weight: 500;
    }

    .server-actions {
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
    }

    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: var(--space-xl);
    }

    .modal-content {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: var(--space-2xl);
      max-width: 600px;
      width: 100%;
      box-shadow: var(--shadow-lg);
      max-height: 90vh;
      overflow-y: auto;
    }

    .emoji-preview {
      font-size: 2em;
      text-align: center;
      padding: var(--space-md);
      background: var(--input-bg);
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="page-container-wide">
    <div class="topbar">
      <div class="topbar-content">
        <div class="page-title">
          <span class="emoji">🎮</span>
          <span class="gradient-text">SAMP Voice Channel Status</span>
        </div>
        <div class="muted">Manage server status displays in voice channel names</div>
      </div>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="${panelBase}/bot/${bot.key}">← Back to Dashboard</a>
      </div>
    </div>

    <div id="alert"></div>

    <!-- Statistics -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" id="totalServers">0</div>
        <div class="stat-label">Total Servers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="activeServers">0</div>
        <div class="stat-label">Active Trackers</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="offlineServers">0</div>
        <div class="stat-label">Offline Servers</div>
      </div>
    </div>

    <!-- Add Server Form -->
    <div class="section-card">
      <h2 class="section-title">➕ Add New Server</h2>
      <form id="addServerForm" onsubmit="addServer(event)">
        <div class="grid-2col">
          <div class="form-group">
            <label class="form-label">Server ID *</label>
            <input type="text" id="serverId" class="form-input" placeholder="server1" required pattern="[a-z0-9_-]+" maxlength="20">
            <span class="muted" style="font-size: 12px; margin-top: 4px;">Unique identifier (lowercase, no spaces)</span>
          </div>
          <div class="form-group">
            <label class="form-label">Display Name *</label>
            <input type="text" id="serverName" class="form-input" placeholder="Samp-Rp #1" required maxlength="50">
            <span class="muted" style="font-size: 12px; margin-top: 4px;">Name shown in channel</span>
          </div>
          <div class="form-group">
            <label class="form-label">Server IP *</label>
            <input type="text" id="serverIp" class="form-input" placeholder="5.252.33.202" required>
            <span class="muted" style="font-size: 12px; margin-top: 4px;">IPv4 address</span>
          </div>
          <div class="form-group">
            <label class="form-label">Server Port</label>
            <input type="number" id="serverPort" class="form-input" placeholder="7777" value="7777" min="1" max="65535">
            <span class="muted" style="font-size: 12px; margin-top: 4px;">Default: 7777</span>
          </div>
          <div class="form-group">
            <label class="form-label">Voice Channel *</label>
            <select id="channelId" class="form-select" required>
              <option value="">Loading channels...</option>
            </select>
            <span class="muted" style="font-size: 12px; margin-top: 4px;">Where to display status</span>
          </div>
          <div class="form-group">
            <label class="form-label">Emoji</label>
            <input type="text" id="emoji" class="form-input" placeholder="🎮" value="🎮" maxlength="4" oninput="updateEmojiPreview()">
            <div class="emoji-preview" id="emojiPreview">🎮</div>
          </div>
        </div>
        <div style="display: flex; gap: 12px; margin-top: 20px;">
          <button type="submit" class="btn btn-primary">Add Server</button>
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('addServerForm').reset(); updateEmojiPreview();">Clear</button>
        </div>
      </form>
    </div>

    <!-- Servers List -->
    <div>
      <h2 class="section-title">📋 Configured Servers</h2>
      <div id="serversList">
        <p style="text-align: center; color: var(--text-muted); padding: 40px;">Loading servers...</p>
      </div>
    </div>

    <!-- Edit Server Modal -->
    <div id="editModal" class="modal-overlay">
      <div class="modal-content">
        <h2 class="section-title">✏️ Edit Server</h2>
        <form id="editServerForm" onsubmit="submitEdit(event)">
          <input type="hidden" id="editServerId">
          <div class="grid-2col">
            <div class="form-group">
              <label class="form-label">Display Name *</label>
              <input type="text" id="editServerName" class="form-input" required maxlength="50">
            </div>
            <div class="form-group">
              <label class="form-label">Server IP *</label>
              <input type="text" id="editServerIp" class="form-input" required>
            </div>
            <div class="form-group">
              <label class="form-label">Server Port</label>
              <input type="number" id="editServerPort" class="form-input" min="1" max="65535">
            </div>
            <div class="form-group">
              <label class="form-label">Voice Channel *</label>
              <select id="editChannelId" class="form-select" required>
                <option value="">-- Select Voice Channel --</option>
              </select>
            </div>
            <div class="form-group" style="grid-column: 1 / -1;">
              <label class="form-label">Emoji</label>
              <input type="text" id="editEmoji" class="form-input" maxlength="4">
            </div>
          </div>
          <div style="display: flex; gap: 12px; margin-top: 20px;">
            <button type="submit" class="btn btn-primary" style="flex: 1;">💾 Save Changes</button>
            <button type="button" class="btn btn-secondary" onclick="closeEditModal()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <script>
    const botKey = '${bot.key}';
    let channels = [];
    let servers = [];

    // Load channels for dropdown
    async function loadChannels() {
      try {
        const res = await fetch(\`/panel/api/bot/\${botKey}/channels\`);
        if (!res.ok) throw new Error('Failed to load channels');
        
        const data = await res.json();
        channels = data.channels.filter(ch => ch.type === 2); // Voice channels only
        
        const select = document.getElementById('channelId');
        select.innerHTML = '<option value="">-- Select Voice Channel --</option>';
        
        channels.forEach(ch => {
          const option = document.createElement('option');
          option.value = ch.id;
          option.textContent = ch.name;
          select.appendChild(option);
        });
      } catch (err) {
        showAlert('Failed to load channels: ' + err.message, 'error');
      }
    }

    // Load servers list
    async function loadServers() {
      try {
        const res = await fetch(\`/panel/api/bot/\${botKey}/samp-servers\`);
        if (!res.ok) throw new Error('Failed to load servers');
        
        const data = await res.json();
        servers = data.servers || [];
        
        renderServers();
        updateStats();
      } catch (err) {
        showAlert('Failed to load servers: ' + err.message, 'error');
        document.getElementById('serversList').innerHTML = '<p style="text-align: center; color: var(--accent-rose);">Error loading servers</p>';
      }
    }

    // Render servers
    function renderServers() {
      const container = document.getElementById('serversList');
      
      if (servers.length === 0) {
        container.innerHTML = '<div class="card card-glass" style="padding: 40px; text-align: center;"><p class="muted">No servers added yet. Use the form above to add your first server!</p></div>';
        return;
      }

      container.innerHTML = servers.map(server => {
        const channelName = channels.find(ch => ch.id === server.channel_id)?.name || 'Unknown Channel';
        const status = server.enabled ? 'online' : 'offline';
        const statusText = server.enabled ? '🟢 Active' : '🔴 Stopped';
        
        return \`
          <div class="server-card">
            <div class="server-header">
              <div class="server-title">\${server.emoji} \${server.server_name}</div>
              <span class="server-status status-\${status}">\${statusText}</span>
            </div>
            <div class="server-info">
              <div class="info-item">
                <div class="info-label">Server ID</div>
                <div class="info-value">\${server.server_id}</div>
              </div>
              <div class="info-item">
                <div class="info-label">IP Address</div>
                <div class="info-value">\${server.server_ip}:\${server.server_port}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Voice Channel</div>
                <div class="info-value">#\${channelName}</div>
              </div>
              <div class="info-item">
                <div class="info-label">Added</div>
                <div class="info-value">\${new Date(server.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            <div class="server-actions">
              <button class="btn \${server.enabled ? 'btn-secondary' : 'btn-primary'}" onclick="toggleServer('\${server.server_id}', \${server.enabled})">
                \${server.enabled ? '⏸️ Stop' : '▶️ Start'}
              </button>
              <button class="btn btn-secondary" onclick="editServer('\${server.server_id}')">
                ✏️ Edit
              </button>
              <button class="btn btn-danger" onclick="removeServer('\${server.server_id}', '\${server.server_name}')">
                🗑️ Remove
              </button>
            </div>
          </div>
        \`;
      }).join('');
    }

    // Update statistics
    function updateStats() {
      document.getElementById('totalServers').textContent = servers.length;
      document.getElementById('activeServers').textContent = servers.filter(s => s.enabled).length;
      document.getElementById('offlineServers').textContent = servers.filter(s => !s.enabled).length;
    }

    // Show alert
    function showAlert(message, type = 'success') {
      const alert = document.getElementById('alert');
      alert.className = type === 'success' ? 'alert alert-success' : 'alert alert-error';
      alert.textContent = message;
      alert.style.display = 'block';
      setTimeout(() => alert.style.display = 'none', 5000);
    }

    // Add server
    async function addServer(e) {
      e.preventDefault();
      
      const serverId = document.getElementById('serverId').value;
      const serverName = document.getElementById('serverName').value;
      const serverIp = document.getElementById('serverIp').value;
      const serverPort = parseInt(document.getElementById('serverPort').value) || 7777;
      const channelId = document.getElementById('channelId').value;
      const emoji = document.getElementById('emoji').value || '🎮';

      try {
        const res = await fetch(\`/panel/api/bot/\${botKey}/samp-servers\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server_id: serverId, server_name: serverName, server_ip: serverIp, server_port: serverPort, channel_id: channelId, emoji })
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to add server');
        }

        showAlert('✅ Server added successfully!', 'success');
        document.getElementById('addServerForm').reset();
        updateEmojiPreview();
        loadServers();
      } catch (err) {
        showAlert('❌ ' + err.message, 'error');
      }
    }

    // Remove server
    async function removeServer(serverId, serverName) {
      if (!confirm(\`Remove server "\${serverName}"?\`)) return;

      try {
        const res = await fetch(\`/panel/api/bot/\${botKey}/samp-servers/\${serverId}\`, {
          method: 'DELETE'
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to remove server');
        }

        showAlert('✅ Server removed successfully!', 'success');
        loadServers();
      } catch (err) {
        showAlert('❌ ' + err.message, 'error');
      }
    }

    // Toggle server
    async function toggleServer(serverId, isEnabled) {
      const action = isEnabled ? 'stop' : 'start';
      
      try {
        const res = await fetch(\`/panel/api/bot/\${botKey}/samp-servers/\${serverId}/\${action}\`, {
          method: 'POST'
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || \`Failed to \${action} tracker\`);
        }

        showAlert(\`✅ Tracker \${action}ed successfully!\`, 'success');
        loadServers();
      } catch (err) {
        showAlert('❌ ' + err.message, 'error');
      }
    }

    // Edit server
    function editServer(serverId) {
      const server = servers.find(s => s.server_id === serverId);
      if (!server) return;

      document.getElementById('editServerId').value = server.server_id;
      document.getElementById('editServerName').value = server.server_name;
      document.getElementById('editServerIp').value = server.server_ip;
      document.getElementById('editServerPort').value = server.server_port;
      document.getElementById('editEmoji').value = server.emoji;

      const editChannelSelect = document.getElementById('editChannelId');
      editChannelSelect.innerHTML = '<option value="">-- Select Voice Channel --</option>';
      channels.forEach(ch => {
        const option = document.createElement('option');
        option.value = ch.id;
        option.textContent = ch.name;
        if (ch.id === server.channel_id) option.selected = true;
        editChannelSelect.appendChild(option);
      });

      document.getElementById('editModal').style.display = 'flex';
    }

    function closeEditModal() {
      document.getElementById('editModal').style.display = 'none';
      document.getElementById('editServerForm').reset();
    }

    async function submitEdit(e) {
      e.preventDefault();
      
      const serverId = document.getElementById('editServerId').value;
      const serverName = document.getElementById('editServerName').value;
      const serverIp = document.getElementById('editServerIp').value;
      const serverPort = parseInt(document.getElementById('editServerPort').value) || 7777;
      const channelId = document.getElementById('editChannelId').value;
      const emoji = document.getElementById('editEmoji').value || '🎮';

      try {
        const res = await fetch(\`/panel/api/bot/\${botKey}/samp-servers/\${serverId}\`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ server_name: serverName, server_ip: serverIp, server_port: serverPort, channel_id: channelId, emoji })
        });

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to update server');
        }

        showAlert('✅ Server updated successfully!', 'success');
        closeEditModal();
        loadServers();
      } catch (err) {
        showAlert('❌ ' + err.message, 'error');
      }
    }

    // Update emoji preview
    function updateEmojiPreview() {
      const emoji = document.getElementById('emoji').value || '🎮';
      document.getElementById('emojiPreview').textContent = emoji;
    }

    // Auto-refresh every 30 seconds
    setInterval(loadServers, 30000);

    // Initial load
    loadChannels();
    loadServers();
  </script>
</body>
</html>
`;

module.exports = { generateSampServersPage };
