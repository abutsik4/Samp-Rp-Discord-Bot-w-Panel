// AI Engagement Management Page

const { generate } = require('./shared-template');

function generateAIEngagementPage(bot, PANEL_BASE) {
  const head = `
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
    @media(max-width:900px){.grid{grid-template-columns:1fr}}
    .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px}
    .stat-card{background:linear-gradient(135deg,color-mix(in srgb, var(--accent-purple) 10%, transparent),color-mix(in srgb, var(--accent-cyan) 10%, transparent));border:1px solid var(--border);border-radius:10px;padding:16px;text-align:center}
    .stat-value{font-size:28px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:4px;text-transform:uppercase;letter-spacing:.5px}
    .toggle-container{display:flex;align-items:center;justify-content:space-between;padding:12px 0}
    .toggle-switch{position:relative;display:inline-block;width:56px;height:28px}
    .toggle-switch input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--border);border-radius:28px;transition:all .3s}
    .toggle-slider:before{position:absolute;content:"";height:20px;width:20px;left:4px;bottom:4px;background:#fff;border-radius:50%;transition:all .3s}
    .toggle-switch input:checked+.toggle-slider{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan))}
    .toggle-switch input:checked+.toggle-slider:before{transform:translateX(28px)}
    .slider-container{margin-bottom:12px}
    .range-slider{width:100%;height:6px;border-radius:3px;background:var(--border);outline:none;-webkit-appearance:none;margin:8px 0}
    .range-slider::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));cursor:pointer}
    .slider-labels{display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px}
    .slider-value{font-size:18px;font-weight:600;color:var(--accent-cyan);text-align:center;margin-top:8px}
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .channel-list{max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:12px;background:var(--input-bg)}
    .channel-group{margin:10px 0 6px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--text-muted)}
    /* Use grid to avoid weird spacing/RTL-like layout issues */
    .channel-item{padding:10px 12px;margin:4px 0;border-radius:4px;cursor:pointer;transition:all .2s;display:grid;grid-template-columns:18px 1fr;align-items:center;column-gap:12px;justify-items:start;text-align:left}
    .channel-item input{margin:0;justify-self:center;align-self:center}
    .channel-item span{min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-word;text-align:left}
    .channel-item:hover{background:color-mix(in srgb, var(--accent-purple) 10%, transparent)}
    .channel-item.selected{background:color-mix(in srgb, var(--accent-purple) 15%, transparent);border-left:3px solid var(--accent-purple)}
    .history-log{max-height:400px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);padding:12px}
    .history-item{padding:12px;margin-bottom:8px;background:var(--bg-card);border-radius:6px;border-left:3px solid var(--accent-cyan);font-size:13px}
    .history-item-header{display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px;color:var(--text-muted)}
    .admin-actions{display:flex;gap:10px;margin-top:12px;flex-wrap:wrap}
  `;

  const body = `
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🤖</span> AI Chat Engagement</h1>
            <p class="section-subtitle">Configure Markov ML chat responses</p>
          </div>

          <div id="alertContainer"></div>

          <div id="debugBox" class="alert alert-warning" style="display:none"></div>

          <div class="stat-grid" data-scroll data-scroll-class="is-inview">
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

          <div class="grid" data-scroll data-scroll-class="is-inview">
            <div class="content-card">
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
                <div class="slider-labels"><span>Never (0%)</span><span>Always (100%)</span></div>
                <div class="slider-value" id="probabilityValue">3%</div>
                <small style="color:var(--text-muted);display:block;margin-top:8px">Chance to respond to each message</small>
              </div>

              <div class="form-group">
                <label>Cooldown (minutes)</label>
                <input type="number" id="cooldownInput" min="0" max="120" value="5">
                <small style="color:var(--text-muted);display:block;margin-top:4px">Min time between responses in same channel</small>
              </div>

              <div class="form-group">
                <label>Cooldown Jitter (seconds)</label>
                <input type="number" id="cooldownJitterInput" min="0" max="3600" value="0">
                <small style="color:var(--text-muted);display:block;margin-top:4px">Adds a random extra delay after each engagement (reduces "responds exactly when cooldown ends")</small>
              </div>

              <div class="form-group">
                <label>Response Delay (seconds)</label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                  <input type="number" id="delayMinInput" min="0" max="600" value="0" placeholder="Min">
                  <input type="number" id="delayMaxInput" min="0" max="600" value="0" placeholder="Max">
                </div>
                <small style="color:var(--text-muted);display:block;margin-top:4px">When engaging, wait a bit before sending (human-like pacing)</small>
              </div>

              <div class="form-group">
                <label>ML Confidence Threshold</label>
                <input type="range" id="confidenceSlider" class="range-slider" min="0.1" max="0.9" value="0.3" step="0.05">
                <div class="slider-labels"><span>Low (0.1)</span><span>High (0.9)</span></div>
                <div class="slider-value" id="confidenceValue">0.30</div>
              </div>

              <div class="form-group">
                <label>Target Channels</label>
                <small style="color:var(--text-muted);display:block;margin-bottom:8px">Leave all unchecked to engage in all channels</small>
                <div id="channelList" class="channel-list">Loading channels...</div>
              </div>

              <button class="btn btn-primary" id="saveBtn" style="width:100%">💾 Save Settings</button>
              
              <div class="admin-actions">
                <button class="btn" id="testBtn" style="flex:1">🧪 Test Response</button>
                <button class="btn btn-danger" id="clearHistoryBtn" style="flex:1">🗑️ Clear History</button>
              </div>
            </div>

            <div>
              <div class="content-card">
                <div class="card-title">🎓 Train ML Model</div>
                <div class="alert alert-info" style="margin-bottom:16px">
                  Train the Markov ML model using real chat messages. The bot will continuously learn from new messages in target channels.
                </div>
                
                <div class="form-group">
                  <label>Training Channel</label>
                  <select id="trainChannelSelect" style="width:100%;padding:10px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text)">
                    <option value="">Select channel...</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label>Message Limit</label>
                  <input type="number" id="trainLimitInput" min="50" max="2000" value="500" step="50">
                  <small style="color:var(--text-muted);display:block;margin-top:4px">Number of messages to train on (50-2000)</small>
                </div>
                
                <div id="modelStats" style="margin-bottom:12px;padding:12px;background:rgba(34,211,238,.05);border-radius:6px;font-size:13px;color:var(--text-muted)">
                  <strong style="color:var(--accent-cyan)">Current Model:</strong> States: 0 | Start Words: 0 | Transitions: 0
                </div>
                
                <button class="btn btn-primary" id="trainBtn" style="width:100%">🎓 Train Model</button>
              </div>

              <div class="content-card" style="margin-top:20px">
                <div class="card-title">📜 Recent Engagements</div>
                <div id="historyLog" class="history-log">Loading history...</div>
                <button class="btn" id="refreshHistoryBtn" style="width:100%;margin-top:12px">🔄 Refresh</button>
              </div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">ℹ️ How It Works</div>
            <div class="alert alert-info">
              The bot uses Markov chain ML to learn from real Discord chat history. Initial training required, then continuous learning from every new message.
            </div>
            <ul style="margin-left:20px;margin-top:12px;color:var(--text-muted);font-size:14px">
              <li>Initial training on Discord chat history</li>
              <li>Continuous learning from new messages</li>
              <li>Learns vocabulary, grammar, and conversation style</li>
              <li>Generates statistically probable responses</li>
              <li>Context-aware based on sentiment and topics</li>
            </ul>
          </div>
        </section>
  `;

  const scripts = `
  <script>
    const botKey = '${bot.key}';
    const apiBase = '${PANEL_BASE}';
    let guildId = '${bot.guild_id || ''}';
    let channels = [];

    function showAlert(msg, type = 'success') {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 4000);
    }

    function setDebug(msg) {
      const el = document.getElementById('debugBox');
      if (!el) return;
      if (!msg) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = 'block';
      el.textContent = msg;
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

    async function loadChannels() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/sendable-channels');
        channels = (data.items || []).slice().sort((a, b) => {
          const g = String(a.guild_name || '').localeCompare(String(b.guild_name || ''));
          if (g !== 0) return g;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
        const list = document.getElementById('channelList');
        const trainSelect = document.getElementById('trainChannelSelect');
        list.innerHTML = '';
        trainSelect.innerHTML = '<option value="">Select channel...</option>';

        const byGuild = new Map();
        channels.forEach(ch => {
          const g = ch.guild_name || 'Unknown Guild';
          if (!byGuild.has(g)) byGuild.set(g, []);
          byGuild.get(g).push(ch);
        });

        const guildNames = Array.from(byGuild.keys()).sort((a, b) => String(a).localeCompare(String(b)));
        for (const guildName of guildNames) {
          const chans = byGuild.get(guildName) || [];
          const header = document.createElement('div');
          header.className = 'channel-group';
          header.textContent = guildName;
          list.appendChild(header);

          chans
            .slice()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
            .forEach(ch => {
            const row = document.createElement('div');
            row.className = 'channel-item';
            row.innerHTML = '<input type="checkbox" value="' + ch.id + '"><span>' + (ch.name ? ('#' + ch.name) : '(no-name)') + '</span>';
            row.addEventListener('click', (e) => {
              if (e.target && e.target.tagName === 'INPUT') return;
              const cb = row.querySelector('input[type="checkbox"]');
              cb.checked = !cb.checked;
              cb.dispatchEvent(new Event('change'));
            });
            row.querySelector('input').addEventListener('change', () => {
              row.classList.toggle('selected', row.querySelector('input').checked);
            });
            list.appendChild(row);

            const opt = document.createElement('option');
            opt.value = ch.id;
            opt.textContent = (ch.guild_name ? (ch.guild_name + ' / ') : '') + '#' + ch.name;
            trainSelect.appendChild(opt);
          });
        }

        if (!guildId && channels[0]?.guild_id) guildId = String(channels[0].guild_id);
      } catch (e) { showAlert('Failed to load channels', 'warning'); }
    }

    function setStats(stats) {
      document.getElementById('statTotal').textContent = String(stats?.totalEngagements ?? 0);
      document.getElementById('stat24h').textContent = String(stats?.last24h ?? 0);
      const byType = Array.isArray(stats?.byType) ? stats.byType : [];
      const gen = byType.find(x => x.response_type === 'ml_generation')?.count ?? 0;
      const fb = byType.find(x => x.response_type === 'ml_fallback')?.count ?? 0;
      document.getElementById('statMLGen').textContent = String(gen);
      document.getElementById('statMLFallback').textContent = String(fb);
    }

    function applySettingsToUI(settings) {
      document.getElementById('enabledToggle').checked = Boolean(settings?.enabled);
      document.getElementById('probabilitySlider').value = String(settings?.probability ?? 3);
      document.getElementById('probabilityValue').textContent = String(settings?.probability ?? 3) + '%';
      document.getElementById('cooldownInput').value = String(settings?.cooldown_minutes ?? 5);
      document.getElementById('confidenceSlider').value = String(settings?.ml_confidence_threshold ?? 0.3);
      document.getElementById('confidenceValue').textContent = parseFloat(String(settings?.ml_confidence_threshold ?? 0.3)).toFixed(2);

      document.getElementById('cooldownJitterInput').value = String(settings?.cooldown_jitter_seconds ?? 0);
      document.getElementById('delayMinInput').value = String(settings?.response_delay_min_seconds ?? 0);
      document.getElementById('delayMaxInput').value = String(settings?.response_delay_max_seconds ?? 0);

      const selected = new Set(settings?.target_channels || []);
      document.querySelectorAll('#channelList input[type="checkbox"]').forEach(cb => {
        cb.checked = selected.has(cb.value);
      });
    }

    async function loadSettingsAndStats() {
      if (!guildId) {
        showAlert('No guildId detected for this bot', 'warning');
        setDebug('AI Engagement: missing guildId; cannot query settings/history.');
        return;
      }
      try {
        setDebug('');
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/settings?guildId=' + encodeURIComponent(guildId));
        applySettingsToUI(data.settings);
        setStats(data.stats);
        try { window.requestLocoUpdate && window.requestLocoUpdate(); } catch (_) {}
      } catch (e) {
        showAlert('Failed to load AI settings', 'warning');
        setDebug('Settings/stats load failed: ' + (e && e.message ? e.message : String(e)));
      }
    }

    function renderHistory(items) {
      const el = document.getElementById('historyLog');
      if (!items || items.length === 0) {
        el.innerHTML = '<div style="padding:18px;color:var(--text-muted)">No engagements yet.</div>';
        return;
      }
      el.innerHTML = items.map(h => {
        const when = new Date((h.timestamp || 0) * 1000).toLocaleString();
        const method = h.response_type || 'unknown';
        const conf = typeof h.ml_confidence === 'number' ? h.ml_confidence.toFixed(2) : String(h.ml_confidence ?? '');
        const text = String(h.response_text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<div class="history-item">'
          + '<div class="history-item-header"><span>' + method + ' • ' + conf + '</span><span>' + when + '</span></div>'
          + '<div>' + text + '</div>'
          + '</div>';
      }).join('');
    }

    async function loadHistory() {
      if (!guildId) {
        document.getElementById('historyLog').textContent = 'No guildId detected';
        setDebug('History load skipped (missing guildId).');
        return;
      }
      try {
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/history?guildId=' + encodeURIComponent(guildId) + '&limit=30');
        renderHistory(data.history || []);
        try { window.requestLocoUpdate && window.requestLocoUpdate(); } catch (_) {}
      } catch (e) {
        document.getElementById('historyLog').textContent = 'Failed to load history';
        setDebug('History load failed: ' + (e && e.message ? e.message : String(e)));
      }
    }

    async function loadModelStats() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/model-stats');
        const stats = data.stats || {};
        const el = document.getElementById('modelStats');
        el.innerHTML = '<strong style="color:var(--accent-cyan)">Current Model:</strong> States: ' + (stats.states ?? 0) + ' | Start Words: ' + (stats.startWords ?? 0) + ' | Transitions: ' + (stats.transitions ?? 0);
      } catch (e) {}
    }

    document.getElementById('probabilitySlider').addEventListener('input', (e) => {
      document.getElementById('probabilityValue').textContent = e.target.value + '%';
    });

    document.getElementById('confidenceSlider').addEventListener('input', (e) => {
      document.getElementById('confidenceValue').textContent = parseFloat(e.target.value).toFixed(2);
    });

    document.getElementById('saveBtn').addEventListener('click', async () => {
      try {
        const targetChannels = Array.from(document.querySelectorAll('#channelList input[type="checkbox"]'))
          .filter(cb => cb.checked)
          .map(cb => cb.value);
        const settings = {
          enabled: document.getElementById('enabledToggle').checked,
          probability: parseFloat(document.getElementById('probabilitySlider').value),
          cooldown_minutes: parseInt(document.getElementById('cooldownInput').value, 10),
          ml_confidence_threshold: parseFloat(document.getElementById('confidenceSlider').value),
          target_channels: targetChannels,
          cooldown_jitter_seconds: parseInt(document.getElementById('cooldownJitterInput').value, 10) || 0,
          response_delay_min_seconds: parseInt(document.getElementById('delayMinInput').value, 10) || 0,
          response_delay_max_seconds: parseInt(document.getElementById('delayMaxInput').value, 10) || 0,
        };

        await api(apiBase + '/api/' + botKey + '/ai-engagement/settings', {
          method: 'POST',
          body: JSON.stringify({ guildId, settings })
        });
        showAlert('Settings saved', 'success');
        loadSettingsAndStats();
      } catch (e) {
        showAlert(e.message || 'Save failed', 'error');
      }
    });

    document.getElementById('refreshHistoryBtn').addEventListener('click', loadHistory);

    document.getElementById('testBtn').addEventListener('click', async () => {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/test', {
          method: 'POST',
          body: JSON.stringify({ guildId })
        });
        const resp = data.response || '(no response)';
        showAlert('Test: ' + resp, 'info');
      } catch (e) {
        showAlert(e.message || 'Test failed', 'error');
      }
    });

    document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
      if (!confirm('Clear engagement history for this guild?')) return;
      try {
        await api(apiBase + '/api/' + botKey + '/ai-engagement/history', {
          method: 'DELETE',
          body: JSON.stringify({ guildId })
        });
        showAlert('History cleared', 'success');
        loadHistory();
        loadSettingsAndStats();
      } catch (e) {
        showAlert(e.message || 'Clear failed', 'error');
      }
    });

    document.getElementById('trainBtn').addEventListener('click', async () => {
      const channelId = document.getElementById('trainChannelSelect').value;
      const messageLimit = parseInt(document.getElementById('trainLimitInput').value, 10) || 500;
      if (!channelId) return showAlert('Select a training channel', 'warning');
      try {
        const data = await api(apiBase + '/api/' + botKey + '/ai-engagement/train', {
          method: 'POST',
          body: JSON.stringify({ channelId, messageLimit })
        });
        showAlert('Trained on ' + (data.messagesProcessed || 0) + ' messages', 'success');
        loadModelStats();
      } catch (e) {
        showAlert(e.message || 'Train failed', 'error');
      }
    });

    document.addEventListener('DOMContentLoaded', async () => {
      await loadChannels();
      await loadSettingsAndStats();
      await loadHistory();
      await loadModelStats();
    });
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel — AI Engagement',
    currentPage: 'ai-engagement',
    PANEL_BASE,
  });
}

module.exports = { generateAIEngagementPage };
