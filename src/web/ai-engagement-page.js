// AI Engagement Management Page
// Web panel for configuring AI chat engagement settings

function generateAIEngagementPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — AI Engagement</title>
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
    .nav{display:flex;gap:12px;align-items:center}
    .nav a{color:var(--accent-cyan);text-decoration:none;font-size:14px;transition:color .2s}
    .nav a:hover{color:var(--accent-purple)}
    .btn{padding:10px 18px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:all .2s}
    .btn:hover{background:rgba(30,41,59,.9);border-color:var(--accent-purple)}
    .btn-primary{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));border:none;color:#fff;font-weight:600}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
    @media(max-width:900px){.grid{grid-template-columns:1fr}}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3)}
    .card-title{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--accent-purple);display:flex;align-items:center;gap:8px}
    .card-title::first-letter{color:inherit}
    .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px}
    .stat-card{background:linear-gradient(135deg,rgba(167,139,250,.1),rgba(34,211,238,.1));border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center}
    .stat-value{font-size:28px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
    .form-group{margin-bottom:20px}
    .form-group label{display:block;font-size:13px;font-weight:500;margin-bottom:8px;color:var(--text)}
    .form-group input[type=number],.form-group select{width:100%;padding:10px 12px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:14px}
    .form-group input:focus,.form-group select:focus{outline:none;border-color:var(--accent-purple);box-shadow:0 0 0 3px rgba(167,139,250,.1)}
    .toggle-container{display:flex;align-items:center;justify-content:space-between;padding:12px 0}
    .toggle-switch{position:relative;display:inline-block;width:56px;height:28px}
    .toggle-switch input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--border);border-radius:28px;transition:all .3s}
    .toggle-slider:before{position:absolute;content:"";height:20px;width:20px;left:4px;bottom:4px;background:#fff;border-radius:50%;transition:all .3s}
    .toggle-switch input:checked + .toggle-slider{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan))}
    .toggle-switch input:checked + .toggle-slider:before{transform:translateX(28px)}
    .slider-container{margin-bottom:12px}
    .range-slider{width:100%;height:6px;border-radius:3px;background:var(--border);outline:none;-webkit-appearance:none;margin:8px 0}
    .range-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));cursor:pointer;box-shadow:0 2px 8px rgba(167,139,250,.4)}
    .range-slider::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));cursor:pointer;border:none;box-shadow:0 2px 8px rgba(167,139,250,.4)}
    .slider-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px}
    .slider-value{font-size:18px;font-weight:600;color:var(--accent-cyan);text-align:center;margin-top:8px}
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .channel-list{max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:12px;background:var(--input-bg)}
    .channel-list-empty{color:var(--text-muted);padding:20px;text-align:center}
    .guild-group{margin-bottom:16px}
    .guild-group:last-child{margin-bottom:0}
    .guild-header{font-size:13px;font-weight:600;color:var(--accent-cyan);margin-bottom:8px;padding:6px 8px;background:rgba(34,211,238,.05);border-radius:4px;display:flex;align-items:center;gap:8px}
    .guild-header-icon{opacity:.7}
    .channel-item{padding:10px 12px 10px 24px;margin:4px 0;border-radius:4px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:12px;position:relative}
    .channel-item:hover{background:rgba(167,139,250,.1)}
    .channel-item.selected{background:rgba(167,139,250,.15);border-left:3px solid var(--accent-purple);padding-left:21px}
    .channel-item input[type=checkbox]{margin:0;cursor:pointer;flex-shrink:0;width:16px;height:16px}
    .channel-item-label{color:var(--text-primary);font-size:14px;flex:1;min-width:0;cursor:pointer}
    .channel-hash{color:var(--text-muted);opacity:.6;margin-right:4px}
    .history-section{margin-top:20px}
    .history-log{max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);padding:12px}
    .history-item{padding:12px;margin-bottom:8px;background:var(--bg-card);border-radius:6px;border-left:3px solid var(--accent-cyan);font-size:13px}
    .history-item-header{display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px;color:var(--text-muted)}
    .history-item-channel{color:var(--accent-purple);font-weight:500}
    .history-item-message{color:var(--text-muted);font-size:12px;margin-bottom:4px}
    .history-item-response{color:var(--text-primary);padding:8px;background:rgba(167,139,250,.05);border-radius:4px;margin-top:6px}
    .history-item-type{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase}
    .type-ml_generation{background:rgba(52,211,153,.2);color:var(--accent-emerald)}
    .type-ml_fallback{background:rgba(251,191,36,.2);color:var(--accent-amber)}
    .btn-danger{background:linear-gradient(135deg,#ef4444,#dc2626);border:none;color:#fff;font-weight:600}
    .btn-danger:hover{opacity:.9}
    .admin-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
    .examples{max-height:300px;overflow-y:auto;padding:12px;background:rgba(17,24,39,.6);border-radius:8px;border:1px solid var(--border)}
    .example-item{padding:10px;margin:8px 0;background:var(--bg-card);border-radius:6px;font-size:13px;border-left:3px solid var(--accent-cyan)}
    .loader{text-align:center;padding:40px;color:var(--text-muted)}
    .mode-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px}
    .mode-btn{padding:12px;border:2px solid var(--border);background:var(--input-bg);border-radius:8px;cursor:pointer;transition:all .2s;text-align:center;font-size:13px;font-weight:500}
    .mode-btn:hover{border-color:var(--accent-purple)}
    .mode-btn.active{border-color:var(--accent-cyan);background:rgba(34,211,238,.1)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">🤖</span><span class="gradient-text">AI Chat Engagement</span></div>
        <div class="subtitle">Bot: ${bot.name} (${bot.key})</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 16px">← Back</button>
        <a href="${PANEL_BASE}/bot/${bot.key}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/rate-limits">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/consecutive-limits">🚫 Consecutive Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/messages">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/commands">📚 Commands</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div id="alertContainer"></div>

    <!-- Statistics -->
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value" id="statTotal">-</div>
        <div class="stat-label">Total Engagements</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="stat24h">-</div>
        <div class="stat-label">Last 24 Hours</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statMLGen">-</div>
        <div class="stat-label">ML Generated</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statMLFallback">-</div>
        <div class="stat-label">ML Fallback</div>
      </div>
    </div>

    <div class="grid">
      <!-- Settings -->
      <div>
        <div class="card">
          <div class="card-title">⚙️ Configuration</div>
          
          <div class="toggle-container">
            <span style="font-weight:500">Enable AI Engagement</span>
            <label class="toggle-switch">
              <input type="checkbox" id="enabledToggle">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <div class="form-group">
            <label>Engagement Probability (%)</label>
            <input type="range" id="probabilitySlider" class="range-slider" min="0" max="100" value="3" step="0.5">
            <div class="slider-labels">
              <span>Never (0%)</span>
              <span>Always (100%)</span>
            </div>
            <div class="slider-value" id="probabilityValue">3%</div>
            <small style="color:var(--text-muted);display:block;margin-top:8px">Chance to attempt response on each message (higher = more active)</small>
          </div>

          <div class="form-group">
            <label>Cooldown (minutes)</label>
            <input type="number" id="cooldownInput" min="0" max="120" value="5" step="1">
            <small style="color:var(--text-muted);display:block;margin-top:4px">Minimum time between responses in same channel</small>
          </div>

          <div class="form-group">
            <label>ML Confidence Threshold</label>
            <input type="range" id="confidenceSlider" class="range-slider" min="0.1" max="0.9" value="0.3" step="0.05">
            <div class="slider-labels">
              <span>Low (0.1)</span>
              <span>High (0.9)</span>
            </div>
            <div class="slider-value" id="confidenceValue">0.30</div>
            <small style="color:var(--text-muted);display:block;margin-top:8px">Minimum model confidence to send response. Lower = more responses but less quality. Model confidence increases with training size (50 states = 0.5, 1000+ states = 0.85)</small>
          </div>

          <div class="form-group">
            <label>Target Channels</label>
            <small style="color:var(--text-muted);display:block;margin-bottom:8px">Leave all unchecked to engage in all channels</small>
            <div id="channelList" class="channel-list">
              <div class="loader">Loading channels...</div>
            </div>
          </div>

          <button class="btn btn-primary" id="saveBtn" style="width:100%">💾 Save Settings</button>
          
          <div class="admin-actions">
            <button class="btn" id="testBtn" style="flex:1">🧪 Test Response</button>
            <button class="btn btn-danger" id="clearHistoryBtn" style="flex:1">🗑️ Clear History</button>
          </div>
        </div>
        
        <!-- ML Model Training -->
        <div class="card history-section">
          <div class="card-title">🎓 Train ML Model</div>
          <div class="alert alert-info" style="margin-bottom:16px">
            Train the Markov ML model using real chat messages from a channel. <strong>The bot will then continuously learn from new messages in target channels.</strong>
          </div>
          
          <div class="form-group">
            <label>Training Channel</label>
            <select id="trainChannelSelect" style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text)">
              <option value="">Select channel...</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Message Limit</label>
            <input type="number" id="trainLimitInput" min="50" max="2000" value="500" step="50" style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text)">
            <small style="color:var(--text-muted);display:block;margin-top:4px">Number of recent messages to train on (50-2000)</small>
          </div>
          
          <div id="modelStats" style="margin-bottom:12px;padding:12px;background:rgba(34,211,238,.05);border-radius:6px;font-size:13px;color:var(--text-muted)">
            <strong style="color:var(--accent-cyan)">Current Model:</strong> States: 0 | Start Words: 0 | Transitions: 0
          </div>
          
          <button class="btn btn-primary" id="trainBtn" style="width:100%">🎓 Train Model</button>
        </div>
        
        <!-- Engagement History -->
        <div class="card history-section">
          <div class="card-title">📜 Recent Engagements</div>
          <div id="historyLog" class="history-log">
            <div class="loader">Loading history...</div>
          </div>
          <button class="btn" id="refreshHistoryBtn" style="width:100%;margin-top:12px">🔄 Refresh</button>
        </div>
      </div>

      <!-- Info & Examples -->
      <div>
        <div class="card">
          <div class="card-title">ℹ️ How It Works</div>
          <div class="alert alert-info">
            The bot uses Markov chain ML to learn from real Discord chat history. <strong>Initial training required, then continuous learning from every new message.</strong> Generates responses based purely on learned conversation patterns - no templates.
          </div>
          
          <div style="margin-top:16px">
            <strong style="color:var(--accent-cyan)">Pure ML Learning:</strong>
            <ul style="margin-left:20px;margin-top:8px;color:var(--text-muted);font-size:14px">
              <li>Initial training on Discord chat history</li>
              <li>Continuous learning from new messages</li>
              <li>Learns vocabulary, grammar, and conversation style</li>
              <li>Generates statistically probable responses</li>
              <li>Context-aware based on sentiment and topics</li>
              <li>Improves naturally over time</li>
            </ul>
          </div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-title">⚠️ Important</div>
          <div class="alert alert-warning">
            <strong>Initial Training Required:</strong> Train the model first using the "Train ML Model" section. After that, the bot will automatically learn from every message in target channels.
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const botKey = ${JSON.stringify(bot.key)};
    const apiBase = ${JSON.stringify(PANEL_BASE)};
    let currentSettings = {};
    let channels = [];
    let selectedMode = 'hybrid';

    // Show alert
    function showAlert(message, type = 'success') {
      const container = document.getElementById('alertContainer');
      const alert = document.createElement('div');
      alert.className = \`alert alert-\${type}\`;
      alert.textContent = message;
      container.appendChild(alert);
      setTimeout(() => alert.remove(), 4000);
    }

    // API helper
    async function api(path, opts = {}) {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      return json;
    }

    // Load channels
    async function loadChannels() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/channels');
        channels = data.items || [];
        renderChannels();
        populateTrainChannelSelect();
      } catch (e) {
        console.error('Failed to load channels:', e);
        document.getElementById('channelList').innerHTML = '<div style="color:var(--accent-rose);padding:10px">Failed to load channels</div>';
      }
    }

    // Populate training channel dropdown
    function populateTrainChannelSelect() {
      const select = document.getElementById('trainChannelSelect');
      select.innerHTML = '<option value="">Select channel...</option>';
      
      channels.forEach(ch => {
        const option = document.createElement('option');
        option.value = ch.id;
        option.textContent = \`\${ch.guild_name} / #\${ch.name}\`;
        select.appendChild(option);
      });
    }

    // Render channels grouped by guild
    function renderChannels() {
      const container = document.getElementById('channelList');
      if (!channels.length) {
        container.innerHTML = '<div class="channel-list-empty">No channels available</div>';
        return;
      }

      const selected = currentSettings.target_channels || [];
      
      // Group channels by guild
      const grouped = {};
      channels.forEach(ch => {
        if (!grouped[ch.guild_id]) {
          grouped[ch.guild_id] = {
            name: ch.guild_name,
            channels: []
          };
        }
        grouped[ch.guild_id].channels.push(ch);
      });

      // Render grouped channels
      container.innerHTML = Object.entries(grouped).map(([guildId, guild]) => \`
        <div class="guild-group">
          <div class="guild-header">
            <span class="guild-header-icon">🏰</span>
            <span>\${guild.name}</span>
          </div>
          \${guild.channels.map(ch => \`
            <div class="channel-item \${selected.includes(ch.id) ? 'selected' : ''}" data-id="\${ch.id}">
              <input type="checkbox" \${selected.includes(ch.id) ? 'checked' : ''}>
              <label class="channel-item-label">
                <span class="channel-hash">#</span>\${ch.name}
              </label>
            </div>
          \`).join('')}
        </div>
      \`).join('');

      // Add click listeners
      container.querySelectorAll('.channel-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const checkbox = item.querySelector('input[type=checkbox]');
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
          }
          item.classList.toggle('selected', checkbox.checked);
        });
      });
    }

    // Load settings and stats
    async function loadSettings() {
      try {
        // Get first guild ID from channels
        const guildId = channels.length > 0 ? channels[0].guild_id : '';
        
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/settings?guildId=' + guildId);
        
        currentSettings = data.settings;
        const stats = data.stats;

        // Update UI
        document.getElementById('enabledToggle').checked = currentSettings.enabled;
        document.getElementById('probabilitySlider').value = currentSettings.probability;
        document.getElementById('probabilityValue').textContent = currentSettings.probability + '%';
        document.getElementById('cooldownInput').value = currentSettings.cooldown_minutes;
        document.getElementById('confidenceSlider').value = currentSettings.ml_confidence_threshold || 0.3;
        document.getElementById('confidenceValue').textContent = (currentSettings.ml_confidence_threshold || 0.3).toFixed(2);

        // Update stats
        document.getElementById('statTotal').textContent = stats.totalEngagements || 0;
        document.getElementById('stat24h').textContent = stats.last24h || 0;
        
        const mlGenCount = stats.byType?.find(t => t.response_type === 'ml_generation')?.count || 0;
        const mlFallbackCount = stats.byType?.find(t => t.response_type === 'ml_fallback')?.count || 0;
        document.getElementById('statMLGen').textContent = mlGenCount;
        document.getElementById('statMLFallback').textContent = mlFallbackCount;

        renderChannels();
        await loadHistory();
        await loadModelStats();
      } catch (e) {
        console.error('Failed to load settings:', e);
        showAlert('Failed to load settings: ' + e.message, 'warning');
      }
    }

    // Load ML model statistics
    async function loadModelStats() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/model-stats');
        const stats = data.stats;
        
        document.getElementById('modelStats').innerHTML = \`
          <strong style="color:var(--accent-cyan)">Current Model:</strong><br>
          States: \${stats.states} | Start Words: \${stats.startWords} | Transitions: \${stats.totalTransitions}
        \`;
      } catch (e) {
        console.error('Failed to load model stats:', e);
        document.getElementById('modelStats').innerHTML = '<strong style="color:var(--accent-cyan)">Current Model:</strong> Not available';
      }
    }

    // Load engagement history
    async function loadHistory() {
      try {
        const guildId = channels.length > 0 ? channels[0].guild_id : '';
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/history?guildId=' + guildId + '&limit=20');
        
        const container = document.getElementById('historyLog');
        if (!data.history || data.history.length === 0) {
          container.innerHTML = '<div class="channel-list-empty">No engagement history yet</div>';
          return;
        }

        container.innerHTML = data.history.map(item => {
          const date = new Date(item.timestamp);
          const channelInfo = channels.find(ch => ch.id === item.channel_id);
          const channelName = channelInfo ? \`#\${channelInfo.name}\` : 'Unknown channel';
          
          return \`
            <div class="history-item">
              <div class="history-item-header">
                <span class="history-item-channel">\${channelName}</span>
                <span>\${date.toLocaleString()}</span>
              </div>
              <div class="history-item-message">
                <strong>Message:</strong> \${item.trigger_message_preview || 'N/A'}
              </div>
              <div class="history-item-response">
                <strong>Response:</strong> \${item.response_text || 'N/A'}
              </div>
              <div style="margin-top:6px">
                <span class="history-item-type type-\${item.response_type}">\${item.response_type}</span>
                <span style="margin-left:8px;font-size:11px;color:var(--text-muted)">
                  Confidence: \${(item.ml_confidence || 0).toFixed(2)}
                </span>
              </div>
            </div>
          \`;
        }).join('');
      } catch (e) {
        console.error('Failed to load history:', e);
        document.getElementById('historyLog').innerHTML = '<div style="color:var(--accent-rose);padding:20px;text-align:center">Failed to load history</div>';
      }
    }

    // Test AI response
    async function testResponse() {
      try {
        const guildId = channels.length > 0 ? channels[0].guild_id : '';
        if (!guildId) {
          showAlert('No guild found. Please ensure bot is in a server.', 'warning');
          return;
        }
        
        console.log('Testing AI response for guild:', guildId);
        showAlert('Generating test response...', 'info');
        
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/test', {
          method: 'POST',
          body: JSON.stringify({ guildId })
        });
        
        console.log('Test response:', data);
        
        if (data.response) {
          showAlert(\`Test Response: "\${data.response}"\`, 'success');
        } else {
          showAlert('No response generated', 'warning');
        }
      } catch (e) {
        console.error('Test failed:', e);
        showAlert('Test failed: ' + (e.message || 'Unknown error'), 'warning');
      }
    }

    // Clear history
    async function clearHistory() {
      if (!confirm('Are you sure you want to clear all engagement history? This cannot be undone.')) {
        return;
      }
      
      try {
        const guildId = channels.length > 0 ? channels[0].guild_id : '';
        await api(apiBase + '/api/' + botKey + '/ai-engagement/history', {
          method: 'DELETE',
          body: JSON.stringify({ guildId })
        });
        
        showAlert('History cleared successfully', 'success');
        await loadHistory();
        await loadSettings(); // Reload stats
      } catch (e) {
        console.error('Failed to clear history:', e);
        showAlert('Failed to clear history: ' + (e.message || 'Unknown error'), 'warning');
      }
    }

    // Train ML model
    async function trainModel() {
      const channelId = document.getElementById('trainChannelSelect').value;
      const messageLimit = parseInt(document.getElementById('trainLimitInput').value);

      if (!channelId) {
        showAlert('Please select a channel to train from', 'warning');
        return;
      }

      if (!confirm(\`Train ML model using \${messageLimit} messages from this channel? This will take a few moments.\`)) {
        return;
      }

      try {
        const trainBtn = document.getElementById('trainBtn');
        trainBtn.disabled = true;
        trainBtn.textContent = '⏳ Training...';
        
        showAlert('Training model... This may take 30-60 seconds', 'info');

        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/train', {
          method: 'POST',
          body: JSON.stringify({ channelId, messageLimit })
        });

        trainBtn.disabled = false;
        trainBtn.textContent = '🎓 Train Model';

        showAlert(\`Model trained successfully! Processed \${data.messagesProcessed} messages\`, 'success');
        await loadModelStats();
      } catch (e) {
        console.error('Training failed:', e);
        const trainBtn = document.getElementById('trainBtn');
        trainBtn.disabled = false;
        trainBtn.textContent = '🎓 Train Model';
        showAlert('Training failed: ' + (e.message || 'Unknown error'), 'warning');
      }
    }

    // Save settings
    async function saveSettings() {
      try {
        const guildId = channels.length > 0 ? channels[0].guild_id : '';
        
        const selectedChannels = Array.from(document.querySelectorAll('.channel-item input:checked'))
          .map(cb => cb.closest('.channel-item').dataset.id);

        const settings = {
          enabled: document.getElementById('enabledToggle').checked,
          probability: parseFloat(document.getElementById('probabilitySlider').value),
          cooldown_minutes: parseInt(document.getElementById('cooldownInput').value),
          ml_confidence_threshold: parseFloat(document.getElementById('confidenceSlider').value),
          target_channels: selectedChannels,
          mode: 'ml_only',
        };

        await api(apiBase + '/api/' + botKey + '/ai-engagement/settings', {
          method: 'POST',
          body: JSON.stringify({ guildId, settings })
        });

        showAlert('Settings saved successfully!', 'success');
        await loadSettings();
      } catch (e) {
        console.error('Failed to save settings:', e);
        showAlert('Failed to save settings: ' + e.message, 'warning');
      }
    }

    // Event listeners
    document.getElementById('probabilitySlider').addEventListener('input', (e) => {
      document.getElementById('probabilityValue').textContent = e.target.value + '%';
    });

    document.getElementById('confidenceSlider').addEventListener('input', (e) => {
      document.getElementById('confidenceValue').textContent = parseFloat(e.target.value).toFixed(2);
    });

    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('testBtn').addEventListener('click', testResponse);
    document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
    document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);
    document.getElementById('trainBtn').addEventListener('click', trainModel);

    // Initialize
    (async () => {
      await loadChannels();
      await loadSettings();
      await loadModelStats(); // Ensure stats load on page refresh
    })();
  </script>
  <link rel="stylesheet" href="/snow.css">
  <script src="/snow.js"></script>
</body>
</html>`;
}

module.exports = { generateAIEngagementPage };
