// User Statistics & Message Count Leaderboard Page
// Displays all users' message counts with Discord usernames

function generateStatsPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Statistics</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    .user-cell{display:flex;align-items:center;gap:var(--space-sm)}
    .avatar{width:32px;height:32px;border-radius:50%;background:var(--input-bg);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:var(--accent-cyan)}
    .username{font-weight:500;color:var(--text)}
    .userid{font-size:12px;color:var(--text-muted);font-family:monospace}
    .count{font-weight:600;color:var(--accent-emerald);text-align:right}
    .rank{width:40px;text-align:center;color:var(--accent-purple);font-weight:600}
    .filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:var(--space-md);margin-bottom:var(--space-lg)}
    .toolbar{display:flex;gap:var(--space-md);align-items:center;flex-wrap:wrap;margin-bottom:var(--space-lg);padding-bottom:var(--space-md);border-bottom:1px solid var(--border)}
    .toolbar-info{color:var(--text-muted);font-size:13px;flex:1}
  </style>
</head>
<body>
  <div class="page-container-wide">
    <div class="topbar">
      <div class="topbar-content">
        <div class="page-title"><span style="font-size:28px">📊</span> <span class="gradient-text">User Statistics</span></div>
        <div class="muted">Message count leaderboard with Discord usernames</div>
      </div>
      <div class="topbar-actions">
        <a href="${PANEL_BASE}" class="link">← Back to Panel</a>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Overview</div>
      <div class="stats-grid">
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
    </div>

    <div class="card">
      <div class="card-title">Filters & Search</div>
      
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
          <label for="guildId">Guild ID (optional)</label>
          <input id="guildId" type="text" placeholder="Leave empty for all" />
        </div>
      </div>

      <div class="toolbar">
        <button class="btn btn-primary" id="refreshBtn">🔄 Refresh</button>
        <button class="btn btn-secondary" id="exportBtn" title="Export as CSV">📥 Export</button>
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
              <th style="width:40px">Rank</th>
              <th>User</th>
              <th style="text-align:right">Messages</th>
              <th style="text-align:right;width:200px">Actions</th>
            </tr>
          </thead>
          <tbody id="statsBody">
          </tbody>
        </table>
        <div id="emptyMsg" class="empty" style="display:none">
          No users found. Start counting messages!
        </div>
      </div>

      <div class="pagination" id="pagination" style="display:none">
        <button id="prevBtn" class="btn btn-icon">← Previous</button>
        <span class="current">Page <span id="currentPage">1</span> of <span id="totalPages">1</span></span>
        <button id="nextBtn" class="btn btn-icon">Next →</button>
      </div>
    </div>
  </div>

  <script>
    const PANEL_BASE = '${PANEL_BASE}';
    const BOT_KEY = '${bot.key}';
    const DEFAULT_GUILD_ID = '${bot.guildId || ''}';
    
    let currentPage = 1;
    const itemsPerPage = 50;
    let allUsers = [];
    let filteredUsers = [];

    // Fetch and display stats
    async function loadStats() {
      const loading = document.getElementById('statsLoading');
      const table = document.getElementById('statsTable');
      const empty = document.getElementById('emptyMsg');
      const error = document.getElementById('errorMsg');
      const searchInput = document.getElementById('searchInput');
      const sortBy = document.getElementById('sortBy');
      const guildId = document.getElementById('guildId');

      loading.style.display = 'block';
      table.style.display = 'none';
      empty.style.display = 'none';
      error.style.display = 'none';

      try {
        const query = new URLSearchParams({
          limit: 1000,
          sortBy: sortBy.value,
          guildId: guildId.value || ''
        });

        const response = await fetch(
          PANEL_BASE + '/api/' + BOT_KEY + '/stats/users?' + query
        );

        if (!response.ok) {
          throw new Error('Failed to fetch statistics');
        }

        const data = await response.json();
        allUsers = data.users || [];

        // Update overview stats
        if (allUsers.length > 0) {
          const totalMessages = allUsers.reduce((sum, u) => sum + (u.message_count || 0), 0);
          const avgMessages = Math.round(totalMessages / allUsers.length);
          const topCount = allUsers[0]?.message_count || 0;

          document.getElementById('totalUsers').textContent = allUsers.length.toLocaleString();
          document.getElementById('totalMessages').textContent = totalMessages.toLocaleString();
          document.getElementById('avgMessages').textContent = avgMessages.toLocaleString();
          document.getElementById('topCount').textContent = topCount.toLocaleString();
        }

        applyFiltersAndRender();
      } catch (err) {
        error.textContent = '❌ ' + err.message;
        error.style.display = 'block';
        loading.style.display = 'none';
      }
    }

    function applyFiltersAndRender() {
      const searchInput = document.getElementById('searchInput');
      const search = searchInput.value.toLowerCase();
      
      // Apply search filter
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
        document.getElementById('loadingStatus').textContent = '';
        return;
      }

      table.style.display = 'table';
      empty.style.display = 'none';

      // Paginate
      const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
      const startIdx = (currentPage - 1) * itemsPerPage;
      const endIdx = startIdx + itemsPerPage;
      const pageUsers = filteredUsers.slice(startIdx, endIdx);

      tbody.innerHTML = pageUsers.map((user, idx) => {
        const rank = startIdx + idx + 1;
        const username = user.username || 'Unknown';
        const avatar = username.charAt(0).toUpperCase();
        const safeUserId = escapeHtml(user.user_id);
        const safeUsername = escapeHtml(username);
        return (
          '<tr>' +
            '<td class="rank">#' + rank + '</td>' +
            '<td>' +
              '<div class="user-cell">' +
                '<div class="avatar">' + avatar + '</div>' +
                '<div>' +
                  '<div class="username">' + escapeHtml(username) + '</div>' +
                  '<div class="userid">' + user.user_id + '</div>' +
                '</div>' +
              '</div>' +
            '</td>' +
            '<td class="count">' + user.message_count.toLocaleString() + '</td>' +
            '<td style="text-align:right; display:flex; gap:8px; justify-content:flex-end">' +
              '<button class="btn btn-icon" data-uid="' + safeUserId + '" onclick="adjustUserCount(this.dataset.uid)">Adjust</button>' +
              '<button class="btn btn-icon" data-uid="' + safeUserId + '" data-uname="' + safeUsername + '" onclick="showChannelBreakdown(this.dataset.uid,this.dataset.uname)">Channels</button>' +
            '</td>' +
          '</tr>'
        );
      }).join('');

      // Update status
      document.getElementById('loadingStatus').textContent = 
        'Showing ' + (startIdx + 1) + ' to ' + Math.min(endIdx, filteredUsers.length) + ' of ' + filteredUsers.length + ' users';

      // Pagination
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
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, m => map[m]);
    }


    function exportCSV() {
      if (filteredUsers.length === 0) {
        alert('No data to export');
        return;
      }

      const rows = filteredUsers.map((user, idx) => {
        const username = (user.username || 'Unknown').replace(/"/g, '""');
        return [idx + 1, '"' + username + '"', user.user_id, user.message_count].join(',');
      });
      const csv = ['Rank,Username,User ID,Message Count', ...rows].join('\\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'message-stats-' + new Date().toISOString().split('T')[0] + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    }

    // Event listeners
    document.getElementById('refreshBtn').addEventListener('click', loadStats);
    document.getElementById('exportBtn').addEventListener('click', exportCSV);
    document.getElementById('searchInput').addEventListener('input', applyFiltersAndRender);
    document.getElementById('sortBy').addEventListener('change', loadStats);
    document.getElementById('guildId').addEventListener('change', loadStats);
    document.getElementById('prevBtn').addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
    document.getElementById('nextBtn').addEventListener('click', () => {
      const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    // Live Stats Auto-Update (every 10 seconds for leaderboard)
    let updateInterval;

    async function fetchLiveStats() {
      try {
        const guildId = document.getElementById('guildId')?.value || '';
        const url = PANEL_BASE + '/api/' + BOT_KEY + '/stats/live?guildId=' + encodeURIComponent(guildId);
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok && data.stats) {
          updateStatsDisplay(data.stats);
        }
      } catch (err) {
        console.error('Failed to fetch live stats:', err);
      }
    }

    function updateStatsDisplay(stats) {
      // Update overview stats
      document.getElementById('totalUsers').textContent = stats.uniqueUsers.toLocaleString();
      document.getElementById('totalMessages').textContent = stats.totalMessages.toLocaleString();
      const avg = stats.uniqueUsers > 0 ? Math.round(stats.totalMessages / stats.uniqueUsers) : 0;
      document.getElementById('avgMessages').textContent = avg.toLocaleString();
    }

    function startLiveStats() {
      fetchLiveStats(); // Fetch immediately
      updateInterval = setInterval(fetchLiveStats, 10000); // Then every 10 seconds
    }

    function stopLiveStats() {
      if (updateInterval) clearInterval(updateInterval);
    }

    // Start polling when page loads
    document.addEventListener('DOMContentLoaded', () => {
      // Initialize guild ID from URL parameters, or use default from bot config
      const urlParams = new URLSearchParams(window.location.search);
      const urlGuildId = urlParams.get('guildId') || DEFAULT_GUILD_ID;
      if (urlGuildId) {
        const guildIdInput = document.getElementById('guildId');
        if (guildIdInput) {
          guildIdInput.value = urlGuildId;
          console.log('Guild ID set to:', urlGuildId);
        }
      }
      startLiveStats();
      loadStats();
    });
    
    // Stop polling when user leaves
    window.addEventListener('beforeunload', stopLiveStats);

    // Adjust user count helper
    async function adjustUserCount(userId) {
      try {
        let guildId = document.getElementById('guildId')?.value || '';
        console.log('Guild ID from input:', guildId);
        
        // Fallback: get guild ID from URL, or use default
        if (!guildId) {
          const urlParams = new URLSearchParams(window.location.search);
          guildId = urlParams.get('guildId') || DEFAULT_GUILD_ID;
          console.log('Guild ID from URL/default:', guildId);
        }
        
        if (!guildId) {
          alert('Please specify Guild ID in filters to adjust a user within that guild.');
          return;
        }
        
        console.log('Using guild ID:', guildId, 'for user:', userId);
        const mode = prompt('Enter adjustment: "+N" to add, "-N" to subtract, or "=N" to set absolute value (e.g., +5, -3, =120).');
        if (!mode) return;
        const trimmed = mode.trim();
        let payload = { guildId, userId };
        if (trimmed.startsWith('=')) {
          const val = parseInt(trimmed.slice(1), 10);
          if (!Number.isFinite(val) || val < 0) throw new Error('Invalid absolute value');
          payload.setTo = val;
        } else {
          const val = parseInt(trimmed, 10);
          if (!Number.isFinite(val) || val === 0) throw new Error('Invalid delta');
          payload.delta = val;
        }
        const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to adjust');
        alert('Adjusted. New count: ' + (await res.json()).messageCount);
        await loadStats();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    async function showChannelBreakdown(userId, username) {
      try {
        let guildId = document.getElementById('guildId')?.value || '';
        if (!guildId) {
          const urlParams = new URLSearchParams(window.location.search);
          guildId = urlParams.get('guildId') || DEFAULT_GUILD_ID;
        }
        if (!guildId) {
          alert('Please set Guild ID first.');
          return;
        }

        const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/stats/user-channels?guildId=' + encodeURIComponent(guildId) + '&userId=' + encodeURIComponent(userId));
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch channel breakdown');
        const data = await res.json();

        if (!data.channels?.length) {
          alert('No channel breakdown available (channel data not yet collected for this user).');
          return;
        }

        const lines = data.channels.map((c, idx) => {
          const channelLabel = c.channel_id || 'unknown';
          return (idx + 1) + '. #' + channelLabel + ' — ' + c.count.toLocaleString() + ' msgs';
        });
        alert('Channel breakdown for ' + (username || userId) + ':\\n\\n' + lines.join('\\n'));
      } catch (err) {
        alert('Error loading channels: ' + err.message);
      }
    }
  </script>
</body>
</html>
  `;
}

module.exports = { generateStatsPage };
