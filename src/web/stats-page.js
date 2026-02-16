// User Statistics & Message Count Leaderboard Page
// Displays all users' message counts with Discord usernames

const { generate } = require('./shared-template');

function generateStatsPage(bot, PANEL_BASE) {
  const head = `
    .user-cell{display:flex;align-items:center;gap:12px}
    .avatar{width:36px;height:36px;border-radius:50%;background:var(--gradient-glass);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--accent-cyan)}
    .username{font-weight:500;color:var(--text)}
    .userid{font-size:12px;color:var(--text-muted);font-family:monospace}
    .count{font-weight:600;color:var(--accent-emerald);text-align:right}
    .rank{width:40px;text-align:center;color:var(--accent-purple);font-weight:600}
    .filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
    .toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
    .toolbar-info{color:var(--text-muted);font-size:13px;flex:1}
    .stats-overview{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px}
    .stat-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;text-align:center}
    .stat-value{font-size:32px;font-weight:700;color:var(--accent-cyan);margin-bottom:4px}
    .stat-label{font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px}
    .table-container{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}
    table{width:100%;border-collapse:collapse}
    th{background:color-mix(in srgb, var(--accent-purple) 14%, transparent);padding:14px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);font-weight:600}
    td{padding:14px 12px;border-top:1px solid var(--border)}
    tr:hover{background:color-mix(in srgb, var(--accent-purple) 7%, transparent)}
    .pagination{display:flex;align-items:center;justify-content:center;gap:16px;padding:20px}
    .loading,.empty,.error{text-align:center;padding:40px;color:var(--text-muted)}
    .error{color:var(--accent-rose)}

    .split-grid{display:grid;grid-template-columns:1fr;gap:16px}
    @media(min-width: 1100px){.split-grid{grid-template-columns:1fr 1fr}}
    .mini-help{font-size:12px;color:var(--text-muted);margin-top:6px}
    .channel-row{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
    .channel-actions{display:flex;gap:10px;flex-wrap:wrap}
    .pill{display:inline-flex;gap:8px;align-items:center;border:1px solid var(--border);border-radius:999px;padding:6px 10px;background:color-mix(in srgb, var(--accent-purple) 6%, transparent);color:var(--text);font-size:12px}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
  `;

  const body = `
        <section class="panel-section" id="stats" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>📊</span> User Statistics</h1>
            <p class="section-subtitle">Message count leaderboard with Discord usernames</p>
          </div>

          <div class="stats-overview" data-scroll data-scroll-class="is-inview">
            <div class="stat-card">
              <div class="stat-value" id="totalUsers">-</div>
              <div class="stat-label">Total Users</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="totalMessages">-</div>
              <div class="stat-label">Total Messages</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="avgMessages">-</div>
              <div class="stat-label">Avg per User</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="topCount">-</div>
              <div class="stat-label">Top User Count</div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">Filters, Leaderboard & Channel Management</div>

            <div class="split-grid">
              <div>
                <div class="filters">
                  <div class="form-group mb-0">
                    <label for="searchInput">Search (username or ID)</label>
                    <input id="searchInput" type="text" placeholder="Find user..." />
                  </div>
                  <div class="form-group mb-0">
                    <label for="sortBy">Sort By</label>
                    <select id="sortBy">
                      <option value="count">Message Count (High to Low)</option>
                      <option value="username">Username (A to Z)</option>
                      <option value="recent">Recently Seen</option>
                    </select>
                  </div>
                  <div class="form-group mb-0">
                    <label for="guildId">Guild ID</label>
                    <input id="guildId" type="text" placeholder="Enter Guild ID" />
                  </div>
                </div>

                <div class="toolbar">
                  <button class="btn btn-primary" id="refreshBtn">🔄 Refresh</button>
                  <button class="btn btn-secondary" id="exportBtn">📥 Export CSV</button>
                  <div class="toolbar-info">
                    <span id="loadingStatus"></span>
                  </div>
                </div>

                <div id="errorMsg" class="error" style="display:none"></div>

                <div class="table-container">
                  <div id="statsLoading" class="loading">Loading user statistics...</div>
                  <table id="statsTable" style="display:none">
                    <thead>
                      <tr>
                        <th style="width:50px">Rank</th>
                        <th>User</th>
                        <th style="text-align:right">Messages</th>
                        <th style="text-align:right;width:200px">Actions</th>
                      </tr>
                    </thead>
                    <tbody id="statsBody"></tbody>
                  </table>
                  <div id="emptyMsg" class="empty" style="display:none">No users found.</div>
                </div>

                <div class="pagination" id="pagination" style="display:none">
                  <button id="prevBtn" class="btn btn-secondary">← Previous</button>
                  <span>Page <span id="currentPage">1</span> of <span id="totalPages">1</span></span>
                  <button id="nextBtn" class="btn btn-secondary">Next →</button>
                </div>
              </div>

              <div>
                <div class="content-card" style="margin:0">
                  <div class="card-title">Channel-centric Controls</div>
                  <div class="mini-help">Select a channel to view per-user counts, apply per-channel adjustments, and run recount actions.</div>

                  <div class="channel-row" style="margin-top:14px">
                    <div class="form-group mb-0" style="min-width:240px;flex:1">
                      <label for="channelSelect">Channel</label>
                      <select id="channelSelect">
                        <option value="">— Select channel —</option>
                      </select>
                    </div>

                    <div class="form-group mb-0" style="min-width:220px;flex:1">
                      <label for="channelIdInput">Channel ID (optional)</label>
                      <input id="channelIdInput" type="text" placeholder="Paste Channel ID" />
                    </div>

                    <div class="channel-actions">
                      <button class="btn btn-secondary" id="loadChannelsBtn">📋 Load Channels</button>
                      <button class="btn btn-secondary" id="loadChannelUsersBtn">👥 Load Users</button>
                    </div>
                  </div>

                  <div class="channel-actions" style="margin-top:12px">
                    <button class="btn btn-primary" id="recalcDbBtn">🧮 Recalculate (DB)</button>
                    <button class="btn btn-secondary" id="backfillChannelBtn">🛰️ Backfill Channel (Discord)</button>
                    <span class="pill"><span class="mono">Mode C</span> = DB recalc + Discord backfill</span>
                  </div>

                  <div id="channelStatus" class="mini-help" style="margin-top:10px"></div>
                  <div id="channelError" class="error" style="display:none"></div>

                  <div class="table-container" style="margin-top:14px">
                    <div id="channelLoading" class="loading" style="display:none">Loading channel users…</div>
                    <table id="channelUsersTable" style="display:none">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th style="text-align:right">Base</th>
                          <th style="text-align:right">Adj</th>
                          <th style="text-align:right">Effective</th>
                          <th style="text-align:right;width:220px">Actions</th>
                        </tr>
                      </thead>
                      <tbody id="channelUsersBody"></tbody>
                    </table>
                    <div id="channelEmpty" class="empty" style="display:none">No per-user stats for this channel.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
  `;

  const scripts = `
  <script>
    const PANEL_BASE = '${PANEL_BASE}';
    const BOT_KEY = '${bot.key}';
    const DEFAULT_GUILD_ID = '${bot.guildId || ''}';
    
    let currentPage = 1;
    const itemsPerPage = 50;
    let allUsers = [];
    let filteredUsers = [];
    let lastChannelUsers = [];

    async function loadStats() {
      const loading = document.getElementById('statsLoading');
      const table = document.getElementById('statsTable');
      const empty = document.getElementById('emptyMsg');
      const error = document.getElementById('errorMsg');

      loading.style.display = 'block';
      table.style.display = 'none';
      empty.style.display = 'none';
      error.style.display = 'none';

      try {
        const query = new URLSearchParams({
          limit: 1000,
          sortBy: document.getElementById('sortBy').value,
          guildId: document.getElementById('guildId').value || ''
        });

        const response = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/users?' + query);
        if (!response.ok) throw new Error('Failed to fetch statistics');

        const data = await response.json();
        allUsers = data.users || [];

        if (allUsers.length > 0) {
          const totalMessages = allUsers.reduce((sum, u) => sum + (u.message_count || 0), 0);
          document.getElementById('totalUsers').textContent = allUsers.length.toLocaleString();
          document.getElementById('totalMessages').textContent = totalMessages.toLocaleString();
          document.getElementById('avgMessages').textContent = Math.round(totalMessages / allUsers.length).toLocaleString();
          document.getElementById('topCount').textContent = (allUsers[0]?.message_count || 0).toLocaleString();
        }

        applyFiltersAndRender();
      } catch (err) {
        error.textContent = '❌ ' + err.message;
        error.style.display = 'block';
        loading.style.display = 'none';
      }
    }

    function applyFiltersAndRender() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      filteredUsers = allUsers.filter(user => {
        const username = user.username || user.user_id;
        return username.toLowerCase().includes(search) || user.user_id.includes(search);
      });
      currentPage = 1;
      renderTable();
    }

    function renderTable() {
      const loading = document.getElementById('statsLoading');
      const table = document.getElementById('statsTable');
      const empty = document.getElementById('emptyMsg');
      const tbody = document.getElementById('statsBody');
      const pagination = document.getElementById('pagination');

      loading.style.display = 'none';

      if (filteredUsers.length === 0) {
        table.style.display = 'none';
        empty.style.display = 'block';
        pagination.style.display = 'none';
        return;
      }

      table.style.display = 'table';
      empty.style.display = 'none';

      const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
      const startIdx = (currentPage - 1) * itemsPerPage;
      const endIdx = startIdx + itemsPerPage;
      const pageUsers = filteredUsers.slice(startIdx, endIdx);

      tbody.innerHTML = pageUsers.map((user, idx) => {
        const rank = startIdx + idx + 1;
        const username = user.username || 'Unknown';
        return '<tr>' +
          '<td class="rank">#' + rank + '</td>' +
          '<td><div class="user-cell"><div class="avatar">' + username.charAt(0).toUpperCase() + '</div><div><div class="username">' + escapeHtml(username) + '</div><div class="userid">' + user.user_id + '</div></div></div></td>' +
          '<td class="count">' + user.message_count.toLocaleString() + '</td>' +
          '<td style="text-align:right"><button class="btn btn-secondary btn-icon" onclick="adjustUserCount(\\'' + user.user_id + '\\')">Adjust</button> <button class="btn btn-secondary btn-icon" onclick="showChannelBreakdown(\\'' + user.user_id + '\\',\\'' + escapeHtml(username) + '\\')">Channels</button></td>' +
        '</tr>';
      }).join('');

      document.getElementById('loadingStatus').textContent = 'Showing ' + (startIdx + 1) + '-' + Math.min(endIdx, filteredUsers.length) + ' of ' + filteredUsers.length;

      if (totalPages > 1) {
        pagination.style.display = 'flex';
        document.getElementById('currentPage').textContent = currentPage;
        document.getElementById('totalPages').textContent = totalPages;
        document.getElementById('prevBtn').disabled = currentPage === 1;
        document.getElementById('nextBtn').disabled = currentPage === totalPages;
      } else {
        pagination.style.display = 'none';
      }
    }

    function escapeHtml(text) {
      return text.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"})[m]);
    }

    function exportCSV() {
      if (!filteredUsers.length) return alert('No data');
      const rows = filteredUsers.map((u, i) => [i + 1, '"' + (u.username || 'Unknown').replace(/"/g, '""') + '"', u.user_id, u.message_count].join(','));
      const csv = ['Rank,Username,User ID,Messages', ...rows].join('\\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = 'stats-' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
    }

    async function adjustUserCount(userId) {
      let guildId = document.getElementById('guildId')?.value || DEFAULT_GUILD_ID;
      if (!guildId) return alert('Enter Guild ID first');
      const mode = prompt('Adjustment: +N, -N, or =N');
      if (!mode) return;
      const payload = { guildId, userId };
      if (mode.startsWith('=')) payload.setTo = parseInt(mode.slice(1));
      else payload.delta = parseInt(mode);
      const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) { alert('Done'); loadStats(); } else alert('Error');
    }

    async function showChannelBreakdown(userId, username) {
      let guildId = document.getElementById('guildId')?.value || DEFAULT_GUILD_ID;
      if (!guildId) return alert('Enter Guild ID first');
      const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/user-channels?guildId=' + guildId + '&userId=' + userId);
      const data = await res.json();
      if (!data.channels?.length) return alert('No channel data');
      alert(username + '\\n\\n' + data.channels.map((c, i) => (i + 1) + '. #' + c.channel_id + ' — ' + c.count + ' msgs').join('\\n'));
    }

    function getGuildIdOrAlert() {
      const guildId = document.getElementById('guildId')?.value || DEFAULT_GUILD_ID;
      if (!guildId) {
        alert('Enter Guild ID first');
        return null;
      }
      return guildId;
    }

    function getSelectedChannelId() {
      const input = (document.getElementById('channelIdInput')?.value || '').trim();
      const selected = (document.getElementById('channelSelect')?.value || '').trim();
      return input || selected || '';
    }

    async function loadChannels() {
      const channelError = document.getElementById('channelError');
      const channelStatus = document.getElementById('channelStatus');
      channelError.style.display = 'none';
      channelStatus.textContent = '';

      const guildId = getGuildIdOrAlert();
      if (!guildId) return;

      channelStatus.textContent = 'Loading channels…';
      const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/channels?guildId=' + encodeURIComponent(guildId));
      const data = await res.json();
      if (!res.ok || !data.ok) {
        channelError.textContent = '❌ ' + (data.error || 'Failed to load channels');
        channelError.style.display = 'block';
        channelStatus.textContent = '';
        return;
      }

      const select = document.getElementById('channelSelect');
      const channels = data.channels || [];
      select.innerHTML = '<option value="">— Select channel —</option>' + channels.map((c) => {
        const label = (c.channel_name ? '#' + c.channel_name : '#' + c.channel_id) + ' — ' + (c.effective_count || 0).toLocaleString();
        return '<option value="' + c.channel_id + '">' + escapeHtml(label) + '</option>';
      }).join('');

      channelStatus.textContent = 'Loaded ' + channels.length + ' channels.';
    }

    async function loadChannelUsers() {
      const channelError = document.getElementById('channelError');
      const channelStatus = document.getElementById('channelStatus');
      const channelLoading = document.getElementById('channelLoading');
      const table = document.getElementById('channelUsersTable');
      const empty = document.getElementById('channelEmpty');
      const tbody = document.getElementById('channelUsersBody');

      channelError.style.display = 'none';
      channelStatus.textContent = '';
      channelLoading.style.display = 'block';
      table.style.display = 'none';
      empty.style.display = 'none';
      tbody.innerHTML = '';

      const guildId = getGuildIdOrAlert();
      if (!guildId) {
        channelLoading.style.display = 'none';
        return;
      }

      const channelId = getSelectedChannelId();
      if (!channelId) {
        channelLoading.style.display = 'none';
        alert('Select or enter a Channel ID');
        return;
      }

      const res = await fetch(
        PANEL_BASE + '/api/' + BOT_KEY + '/stats/channel-users?guildId=' + encodeURIComponent(guildId) +
        '&channelId=' + encodeURIComponent(channelId) + '&limit=200&offset=0&sortBy=count'
      );
      const data = await res.json();
      channelLoading.style.display = 'none';

      if (!res.ok || !data.ok) {
        channelError.textContent = '❌ ' + (data.error || 'Failed to load channel users');
        channelError.style.display = 'block';
        return;
      }

      const users = data.users || [];
      lastChannelUsers = users;
      if (!users.length) {
        empty.style.display = 'block';
        channelStatus.textContent = 'No users for this channel.';
        return;
      }

      table.style.display = 'table';
      tbody.innerHTML = users.map((u) => {
        const username = u.username || u.user_id;
        const base = Number(u.base_count || 0);
        const adj = Number(u.adjustment || 0);
        const eff = Number(u.effective_count || 0);
        return '<tr>' +
          '<td><div class="user-cell"><div class="avatar">' + escapeHtml(String(username).charAt(0).toUpperCase()) + '</div><div><div class="username">' + escapeHtml(String(username)) + '</div><div class="userid">' + escapeHtml(String(u.user_id)) + '</div></div></div></td>' +
          '<td class="count" style="color:var(--text);text-align:right">' + base.toLocaleString() + '</td>' +
          '<td class="count" style="color:var(--text-muted);text-align:right">' + (adj >= 0 ? '+' : '') + adj.toLocaleString() + '</td>' +
          '<td class="count" style="text-align:right">' + eff.toLocaleString() + '</td>' +
          '<td style="text-align:right">' +
            '<button class="btn btn-secondary btn-icon" onclick="adjustChannelUser(\'' + escapeHtml(String(u.user_id)) + '\')">Adjust</button>' +
            ' <button class="btn btn-secondary btn-icon" onclick="setChannelUser(\'' + escapeHtml(String(u.user_id)) + '\')">Set</button>' +
          '</td>' +
        '</tr>';
      }).join('');

      channelStatus.textContent = 'Loaded ' + users.length + ' users for channel ' + channelId + '.';
    }

    async function adjustChannelUser(userId) {
      const guildId = getGuildIdOrAlert();
      if (!guildId) return;
      const channelId = getSelectedChannelId();
      if (!channelId) return alert('Select or enter a Channel ID');

      const mode = prompt('Channel adjustment delta: +N or -N');
      if (!mode) return;
      const delta = parseInt(mode, 10);
      if (!Number.isFinite(delta) || delta === 0) return alert('Invalid delta');

      const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/channel-adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId, channelId, userId, delta })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return alert('Error: ' + (data.error || 'Failed'));
      await loadStats();
      await loadChannelUsers();
    }

    async function setChannelUser(userId) {
      const guildId = getGuildIdOrAlert();
      if (!guildId) return;
      const channelId = getSelectedChannelId();
      if (!channelId) return alert('Select or enter a Channel ID');

      const mode = prompt('Set effective channel count to =N (non-negative)');
      if (!mode) return;
      const setTo = parseInt(mode.replace(/^=/, ''), 10);
      if (!Number.isFinite(setTo) || setTo < 0) return alert('Invalid setTo');

      const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/channel-adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId, channelId, userId, setTo })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return alert('Error: ' + (data.error || 'Failed'));
      await loadStats();
      await loadChannelUsers();
    }

    async function recalcDb() {
      const guildId = getGuildIdOrAlert();
      if (!guildId) return;
      if (!confirm('Recalculate from DB (message_index) for this guild?')) return;

      const channelStatus = document.getElementById('channelStatus');
      channelStatus.textContent = 'Recalculating…';
      const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert('Error: ' + (data.error || 'Failed to recalculate'));
        channelStatus.textContent = '';
        return;
      }

      channelStatus.textContent = 'Recalculated in ' + (data.durationMs || 0) + 'ms.';
      await loadStats();
      await loadChannels();
      await loadChannelUsers();
    }

    async function backfillChannel() {
      const guildId = getGuildIdOrAlert();
      if (!guildId) return;
      const channelId = getSelectedChannelId();
      if (!channelId) return alert('Select or enter a Channel ID');

      const maxMessages = prompt('Max messages to scan (default 25000):');
      const payload = { guildId, channelId };
      if (maxMessages && Number.isFinite(Number(maxMessages))) payload.maxMessages = Number(maxMessages);

      const channelStatus = document.getElementById('channelStatus');
      channelStatus.textContent = 'Backfilling from Discord…';
      const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/backfill-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        alert('Error: ' + (data.error || 'Failed to backfill'));
        channelStatus.textContent = '';
        return;
      }

      channelStatus.textContent = 'Backfilled ' + (data.processed || 0) + ' messages in ' + (data.durationMs || 0) + 'ms.';
      await loadStats();
      await loadChannels();
      await loadChannelUsers();
    }

    document.getElementById('refreshBtn').addEventListener('click', loadStats);
    document.getElementById('exportBtn').addEventListener('click', exportCSV);
    document.getElementById('searchInput').addEventListener('input', applyFiltersAndRender);
    document.getElementById('sortBy').addEventListener('change', loadStats);
    document.getElementById('guildId').addEventListener('change', loadStats);
    document.getElementById('prevBtn').addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderTable(); } });
    document.getElementById('nextBtn').addEventListener('click', () => { if (currentPage < Math.ceil(filteredUsers.length / itemsPerPage)) { currentPage++; renderTable(); } });

    document.getElementById('loadChannelsBtn').addEventListener('click', loadChannels);
    document.getElementById('loadChannelUsersBtn').addEventListener('click', loadChannelUsers);
    document.getElementById('channelSelect').addEventListener('change', () => {
      document.getElementById('channelIdInput').value = '';
      loadChannelUsers();
    });
    document.getElementById('recalcDbBtn').addEventListener('click', recalcDb);
    document.getElementById('backfillChannelBtn').addEventListener('click', backfillChannel);

    document.addEventListener('DOMContentLoaded', () => {
      const urlGuildId = new URLSearchParams(window.location.search).get('guildId') || DEFAULT_GUILD_ID;
      if (urlGuildId) document.getElementById('guildId').value = urlGuildId;
      loadStats();
    });
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel — Statistics',
    currentPage: 'stats'
  });
}

module.exports = { generateStatsPage };
