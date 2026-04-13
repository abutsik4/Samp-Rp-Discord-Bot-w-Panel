const { generate } = require('./shared-template');

function generateCommandChannelsPage(bot, PANEL_BASE) {
  const head = `
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .stat-box{background:linear-gradient(135deg,color-mix(in srgb, var(--accent-purple) 10%, transparent),color-mix(in srgb, var(--accent-cyan) 10%, transparent));border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}
    .stat-value{font-size:32px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:13px;color:var(--text-muted);margin-top:8px}
    .current-channel{padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:color-mix(in srgb, var(--accent-cyan) 8%, transparent);margin-top:16px}
    .current-channel strong{display:block;margin-bottom:6px}
    .actions-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  `;

  const body = `
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🎮</span> Command Channels</h1>
            <p class="section-subtitle">Restrict SAMP Life game commands to a single Discord channel</p>
          </div>

          <div id="alertContainer"></div>

          <div class="alert alert-info" data-scroll data-scroll-class="is-inview">
            <strong>ℹ️ How it works:</strong> Configure one Discord channel for SAMP Life game commands. Outside that channel, users will receive a Russian warning in Discord telling them where to use the command. Non-game stats commands continue working everywhere.
          </div>

          <div class="stat-box" data-scroll data-scroll-class="is-inview">
            <div class="stat-value" id="restrictionStatus">-</div>
            <div class="stat-label">Configured SAMP Game Channel</div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">🎯 SAMP Life Channel</div>
            <div class="form-group">
              <label for="channelSelect">Allowed Channel</label>
              <select id="channelSelect" required>
                <option value="">Loading channels...</option>
              </select>
            </div>
            <div class="actions-row">
              <button id="saveBtn" class="btn btn-primary">Save Channel</button>
              <button id="clearBtn" class="btn btn-danger">Clear Restriction</button>
            </div>
            <div id="currentChannelBox" class="current-channel" style="display:none"></div>
          </div>
        </section>
  `;

  const scripts = `
  <script>
    const botKey = '${bot.key}';
    const apiBase = '${PANEL_BASE}/api/' + botKey;
    const categoryId = 'samp_game';

    function showAlert(msg, type) {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 3000);
    }

    async function loadChannels() {
      const data = await window.panelFetchJson(apiBase + '/channels');
      const channels = Array.isArray(data) ? data : (data.channels || []);
      const select = document.getElementById('channelSelect');
      select.innerHTML = '<option value="">-- Select Channel --</option>';
      channels.forEach((ch) => {
        const opt = document.createElement('option');
        opt.value = ch.id;
        opt.textContent = ch.name + ' (' + ch.id + ')';
        select.appendChild(opt);
      });
    }

    async function loadRestriction() {
      const data = await window.panelFetchJson(apiBase + '/command-channels');
      const row = (data.restrictions || []).find((item) => item.command_category === categoryId);
      const status = document.getElementById('restrictionStatus');
      const box = document.getElementById('currentChannelBox');
      const select = document.getElementById('channelSelect');

      if (!row) {
        status.textContent = 'Not set';
        box.style.display = 'none';
        select.value = '';
        return;
      }

      status.textContent = '#' + row.channel_name;
      select.value = row.channel_id;
      box.style.display = 'block';
      box.innerHTML = '<strong>Current restriction</strong><div>SAMP Life game commands are limited to <b>#' + row.channel_name + '</b> (' + row.channel_id + ').</div>';
    }

    document.getElementById('saveBtn').addEventListener('click', async () => {
      const channelId = document.getElementById('channelSelect').value;
      if (!channelId) {
        showAlert('Please select a channel first', 'info');
        return;
      }
      try {
        await window.panelFetchJson(apiBase + '/command-channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command_category: categoryId, channel_id: channelId })
        });
        showAlert('SAMP command channel saved', 'success');
        loadRestriction();
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Failed to save command channel restriction', 'warning');
      }
    });

    document.getElementById('clearBtn').addEventListener('click', async () => {
      try {
        await window.panelFetchJson(apiBase + '/command-channels/' + categoryId, { method: 'DELETE' });
        showAlert('SAMP command restriction cleared', 'success');
        loadRestriction();
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Failed to clear command channel restriction', 'warning');
      }
    });

    document.addEventListener('DOMContentLoaded', async () => {
      try {
        await loadChannels();
        await loadRestriction();
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Failed to load command channel settings', 'warning');
      }
    });
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel — Command Channels',
    currentPage: 'command-channels',
    PANEL_BASE,
  });
}

module.exports = { generateCommandChannelsPage };