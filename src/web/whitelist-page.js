// Channel Whitelist Management Page
// Web panel for managing which channels count messages

function generateWhitelistPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Channel Whitelist</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-main);color:var(--text);line-height:1.6}
    .wrap{max-width:1200px;margin:0 auto;padding:20px}
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
    .btn-danger{background:var(--accent-rose);border:none;color:#fff}
    .btn-danger:hover{opacity:.9}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,.3);margin-bottom:20px}
    .card-title{font-size:18px;font-weight:600;margin-bottom:16px;color:var(--accent-purple);display:flex;align-items:center;gap:8px}
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .channel-list{list-style:none}
    .channel-item{background:rgba(167,139,250,.1);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;transition:all .2s}
    .channel-item:hover{background:rgba(167,139,250,.15);border-color:var(--accent-purple)}
    .channel-name{font-weight:500;display:flex;align-items:center;gap:8px}
    .channel-name::before{content:'#';color:var(--text-muted)}
    .channel-date{font-size:12px;color:var(--text-muted)}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;font-size:13px;font-weight:500;margin-bottom:8px;color:var(--text)}
    .form-group select{width:100%;padding:10px 12px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:14px;font-family:inherit}
    .form-group select:focus{outline:none;border-color:var(--accent-purple);box-shadow:0 0 0 3px rgba(167,139,250,.1)}
    .empty-state{text-align:center;padding:40px;color:var(--text-muted)}
    .empty-state-icon{font-size:48px;margin-bottom:16px}
    .stat-box{background:linear-gradient(135deg,rgba(167,139,250,.1),rgba(34,211,238,.1));border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}
    .stat-value{font-size:36px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:13px;color:var(--text-muted);margin-top:8px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">📋</span><span class="gradient-text">Channel Whitelist</span></div>
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
        <a href="${PANEL_BASE}/bot/${bot.key}/automod">🛡️ AutoMod</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/history">📜 History</a>
        <a href="${PANEL_BASE}/verification-dashboard?bot=${bot.key}">🔍 Verification</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div id="alertContainer"></div>

    <div class="alert alert-info">
      <strong>ℹ️ How it works:</strong> When whitelist is empty, messages are counted in all channels. 
      Add channels to whitelist to only count messages in specific channels.
    </div>

    <div class="stat-box">
      <div class="stat-value" id="whitelistCount">-</div>
      <div class="stat-label">Whitelisted Channels</div>
    </div>

    <!-- Add Channel -->
    <div class="card">
      <div class="card-title">➕ Add Channel to Whitelist</div>
      <form id="addChannelForm">
        <div class="form-group">
          <label for="channelSelect">Select Channel</label>
          <select id="channelSelect" required>
            <option value="">Loading channels...</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Add to Whitelist</button>
      </form>
    </div>

    <!-- Whitelisted Channels -->
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>✅ Whitelisted Channels</span>
        <button id="clearAllBtn" class="btn btn-danger" style="display:none">Clear All</button>
      </div>
      <ul class="channel-list" id="whitelistContainer">
        <li class="empty-state">
          <div class="empty-state-icon">⏳</div>
          <div>Loading...</div>
        </li>
      </ul>
    </div>
  </div>

  <script>
    const botKey = '${bot.key}';
    const guildId = '${bot.guild_id}';

    async function loadChannels() {
      try {
        const res = await fetch(\`/api/bot/\${botKey}/channels\`);
        const channels = await res.json();
        
        const select = document.getElementById('channelSelect');
        select.innerHTML = '<option value="">-- Select Channel --</option>';
        
        channels.forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = ch.name;
          select.appendChild(opt);
        });
      } catch (err) {
        console.error('Failed to load channels:', err);
        showAlert('Failed to load channels', 'warning');
      }
    }

    async function loadWhitelist() {
      try {
        const res = await fetch(\`/api/bot/\${botKey}/whitelist\`);
        const data = await res.json();
        
        const container = document.getElementById('whitelistContainer');
        const countEl = document.getElementById('whitelistCount');
        const clearBtn = document.getElementById('clearAllBtn');
        
        countEl.textContent = data.channels.length;
        
        if (data.channels.length === 0) {
          container.innerHTML = '<li class="empty-state"><div class="empty-state-icon">📭</div><div>No channels in whitelist. All channels are being counted.</div></li>';
          clearBtn.style.display = 'none';
          return;
        }
        
        clearBtn.style.display = 'inline-block';
        container.innerHTML = '';
        
        data.channels.forEach(ch => {
          const li = document.createElement('li');
          li.className = 'channel-item';
          li.innerHTML = \`
            <div>
              <div class="channel-name">\${ch.name}</div>
              <div class="channel-date">Added: \${new Date(ch.added_at).toLocaleString()}</div>
            </div>
            <button class="btn btn-danger" onclick="removeChannel('\${ch.id}')">Remove</button>
          \`;
          container.appendChild(li);
        });
      } catch (err) {
        console.error('Failed to load whitelist:', err);
        showAlert('Failed to load whitelist', 'warning');
      }
    }

    async function removeChannel(channelId) {
      if (!confirm('Remove this channel from whitelist?')) return;
      
      try {
        const res = await fetch(\`/api/bot/\${botKey}/whitelist/\${channelId}\`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          showAlert('Channel removed from whitelist', 'success');
          loadWhitelist();
        } else {
          showAlert('Failed to remove channel', 'warning');
        }
      } catch (err) {
        console.error('Failed to remove channel:', err);
        showAlert('Error removing channel', 'warning');
      }
    }

    document.getElementById('addChannelForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const channelId = document.getElementById('channelSelect').value;
      if (!channelId) return;
      
      try {
        const res = await fetch(\`/api/bot/\${botKey}/whitelist\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id: channelId })
        });
        
        if (res.ok) {
          showAlert('Channel added to whitelist', 'success');
          document.getElementById('addChannelForm').reset();
          loadWhitelist();
        } else {
          showAlert('Failed to add channel', 'warning');
        }
      } catch (err) {
        console.error('Failed to add channel:', err);
        showAlert('Error adding channel', 'warning');
      }
    });

    document.getElementById('clearAllBtn').addEventListener('click', async () => {
      if (!confirm('Clear all channels from whitelist? Messages will be counted in all channels.')) return;
      
      try {
        const res = await fetch(\`/api/bot/\${botKey}/whitelist\`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          showAlert('Whitelist cleared', 'success');
          loadWhitelist();
        } else {
          showAlert('Failed to clear whitelist', 'warning');
        }
      } catch (err) {
        console.error('Failed to clear whitelist:', err);
        showAlert('Error clearing whitelist', 'warning');
      }
    });

    function showAlert(message, type = 'info') {
      const container = document.getElementById('alertContainer');
      const alert = document.createElement('div');
      alert.className = \`alert alert-\${type}\`;
      alert.textContent = message;
      container.appendChild(alert);
      setTimeout(() => alert.remove(), 5000);
    }

    loadChannels();
    loadWhitelist();
  </script>
</body>
</html>`;
}

module.exports = { generateWhitelistPage };
