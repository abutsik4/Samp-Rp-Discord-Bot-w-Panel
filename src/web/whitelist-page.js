// Channel Whitelist Management Page

const { generate } = require('./shared-template');

function generateWhitelistPage(bot, PANEL_BASE) {
  const head = `
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .channel-list{list-style:none}
    .channel-item{background:color-mix(in srgb, var(--accent-purple) 10%, transparent);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;transition:all .2s}
    .channel-item:hover{background:color-mix(in srgb, var(--accent-purple) 15%, transparent);border-color:var(--accent-purple)}
    .channel-name{font-weight:500;display:flex;align-items:center;gap:8px}
    .channel-name::before{content:'#';color:var(--text-muted)}
    .channel-date{font-size:12px;color:var(--text-muted)}
    .empty-state{text-align:center;padding:40px;color:var(--text-muted)}
    .empty-state-icon{font-size:48px;margin-bottom:16px}
    .stat-box{background:linear-gradient(135deg,color-mix(in srgb, var(--accent-purple) 10%, transparent),color-mix(in srgb, var(--accent-cyan) 10%, transparent));border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}
    .stat-value{font-size:36px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:13px;color:var(--text-muted);margin-top:8px}
  `;

  const body = `
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>📋</span> Channel Whitelist</h1>
            <p class="section-subtitle">Manage which channels count messages</p>
          </div>

          <div id="alertContainer"></div>

          <div class="alert alert-info" data-scroll data-scroll-class="is-inview">
            <strong>ℹ️ How it works:</strong> When whitelist is empty, messages are counted in all channels. Add channels to only count messages in specific channels. Threads inherit the parent channel whitelist automatically.
          </div>

          <div class="stat-box" data-scroll data-scroll-class="is-inview">
            <div class="stat-value" id="whitelistCount">-</div>
            <div class="stat-label">Whitelisted Channels</div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
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

          <div class="content-card" data-scroll data-scroll-class="is-inview">
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
        </section>
  `;

  const scripts = `
  <script>
    const botKey = '${bot.key}';
    const apiBase = '${PANEL_BASE}/api/' + botKey;
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
        const data = await window.panelFetchJson(apiBase + '/channels');
        const channels = Array.isArray(data) ? data : (data.channels || []);
        const select = document.getElementById('channelSelect');
        select.innerHTML = '<option value="">-- Select Channel --</option>';
        channels.forEach(ch => {
          const opt = document.createElement('option');
          opt.value = ch.id;
          opt.textContent = ch.name;
          select.appendChild(opt);
        });
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Failed to load channels', 'warning');
      }
    }

    async function loadWhitelist() {
      try {
        const data = await window.panelFetchJson(apiBase + '/whitelist');
        const container = document.getElementById('whitelistContainer');
        document.getElementById('whitelistCount').textContent = data.channels.length;
        const clearBtn = document.getElementById('clearAllBtn');
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
          li.innerHTML = '<div><div class="channel-name">' + ch.name + '</div><div class="channel-date">Added: ' + new Date(ch.added_at).toLocaleString() + '</div></div><button class="btn btn-danger" onclick="removeChannel(\\'' + ch.id + '\\')">Remove</button>';
          container.appendChild(li);
        });
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Failed to load whitelist', 'warning');
      }
    }

    async function removeChannel(channelId) {
      if (!confirm('Remove this channel from whitelist?')) return;
      try {
        await window.panelFetchJson(apiBase + '/whitelist/' + channelId, { method: 'DELETE' });
        showAlert('Channel removed', 'success');
        loadWhitelist();
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Error removing channel', 'warning');
      }
    }

    document.getElementById('addChannelForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const channelId = document.getElementById('channelSelect').value;
      if (!channelId) return;
      try {
        await window.panelFetchJson(apiBase + '/whitelist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel_id: channelId })
        });
        showAlert('Channel added to whitelist', 'success');
        loadWhitelist();
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Error adding channel', 'warning');
      }
    });

    document.addEventListener('DOMContentLoaded', () => { loadChannels(); loadWhitelist(); });
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel — Channel Whitelist',
    currentPage: 'whitelist',
    PANEL_BASE,
  });
}

module.exports = { generateWhitelistPage };
