"use strict";

/**
 * Analytics Page Generator
 * 
 * Web panel for viewing daily and channel-based message statistics
 */

const sharedTemplate = require("./shared-template");

function generateAnalyticsPage(bot) {
  const head = `
    <style>
      .analytics-container {
        max-width: 1400px;
        margin: 0 auto;
        padding: 20px;
      }
      
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }
      
      .stat-card {
        background: #2b2d31;
        border-radius: 8px;
        padding: 20px;
        border-left: 4px solid #5865f2;
      }
      
      .stat-card h3 {
        margin: 0 0 10px 0;
        color: #b5bac1;
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      .stat-card .value {
        font-size: 32px;
        font-weight: bold;
        color: #fff;
      }
      
      .chart-container {
        background: #2b2d31;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
      }
      
      .table-container {
        background: #2b2d31;
        border-radius: 8px;
        padding: 20px;
        overflow-x: auto;
      }
      
      table {
        width: 100%;
        border-collapse: collapse;
      }
      
      th {
        background: #1e1f22;
        padding: 12px;
        text-align: left;
        font-weight: 600;
        color: #b5bac1;
        border-bottom: 2px solid #404249;
      }
      
      td {
        padding: 12px;
        border-bottom: 1px solid #404249;
        color: #dbdee1;
      }
      
      tr:hover {
        background: #383a40;
      }
      
      .filters {
        background: #2b2d31;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
      }
      
      .filter-group {
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
        align-items: end;
      }
      
      .filter-group label {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      
      .filter-group input,
      .filter-group select {
        padding: 8px 12px;
        border-radius: 4px;
        border: 1px solid #404249;
        background: #1e1f22;
        color: #fff;
      }
      
      .btn-apply {
        padding: 8px 20px;
        background: #5865f2;
        border: none;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        font-weight: 600;
      }
      
      .btn-apply:hover {
        background: #4752c4;
      }
      
      .loading {
        text-align: center;
        padding: 40px;
        color: #b5bac1;
      }
    </style>
  `;

  const body = `
    <div class="analytics-container">
      <h1>📊 Analytics Dashboard</h1>
      
      <div class="filters">
        <h3>Filters</h3>
        <div class="filter-group">
          <label>
            Start Date
            <input type="date" id="startDate">
          </label>
          <label>
            End Date
            <input type="date" id="endDate">
          </label>
          <label>
            Channel
            <select id="channelFilter">
              <option value="">All Channels</option>
            </select>
          </label>
          <button class="btn-apply" onclick="applyFilters()">Apply Filters</button>
          <button class="btn-apply" onclick="resetFilters()" style="background: #4e5058;">Reset</button>
        </div>
      </div>
      
      <div class="stats-grid" id="statsGrid">
        <div class="stat-card">
          <h3>Total Messages</h3>
          <div class="value" id="totalMessages">-</div>
        </div>
        <div class="stat-card">
          <h3>Active Users</h3>
          <div class="value" id="activeUsers">-</div>
        </div>
        <div class="stat-card">
          <h3>Active Channels</h3>
          <div class="value" id="activeChannels">-</div>
        </div>
        <div class="stat-card">
          <h3>Avg Messages/Day</h3>
          <div class="value" id="avgPerDay">-</div>
        </div>
      </div>
      
      <div class="chart-container">
        <h3>Daily Message Activity</h3>
        <canvas id="dailyChart" width="800" height="300"></canvas>
      </div>
      
      <div class="table-container">
        <h3>Top Users (Filtered Period)</h3>
        <table id="topUsersTable">
          <thead>
            <tr>
              <th>Rank</th>
              <th>User</th>
              <th>Messages</th>
              <th>% of Total</th>
            </tr>
          </thead>
          <tbody id="topUsersBody">
            <tr><td colspan="4" class="loading">Loading...</td></tr>
          </tbody>
        </table>
      </div>
      
      <div class="table-container" style="margin-top: 20px;">
        <h3>Top Channels (Filtered Period)</h3>
        <table id="topChannelsTable">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Channel</th>
              <th>Messages</th>
              <th>% of Total</th>
            </tr>
          </thead>
          <tbody id="topChannelsBody">
            <tr><td colspan="4" class="loading">Loading...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <script>
      const API_BASE = '${bot.panelBase}/api/${bot.key}';
      
      // Set default dates (last 30 days)
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(today.getDate() - 30);
      
      document.getElementById('endDate').valueAsDate = today;
      document.getElementById('startDate').valueAsDate = thirtyDaysAgo;
      
      // Load channels for filter
      async function loadChannels() {
        try {
          const res = await fetch(API_BASE + '/analytics/channels');
          const data = await res.json();
          
          const select = document.getElementById('channelFilter');
          data.channels.forEach(ch => {
            const option = document.createElement('option');
            option.value = ch.channel_id;
            option.textContent = ch.channel_name || 'Channel ' + ch.channel_id;
            select.appendChild(option);
          });
        } catch (err) {
          console.error('Failed to load channels:', err);
        }
      }
      
      // Load analytics data
      async function loadAnalytics() {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const channelId = document.getElementById('channelFilter').value;
        
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (channelId) params.append('channel_id', channelId);
        
        try {
          const res = await fetch(API_BASE + '/analytics/summary?' + params);
          const data = await res.json();
          
          // Update stats cards
          document.getElementById('totalMessages').textContent = data.totalMessages.toLocaleString();
          document.getElementById('activeUsers').textContent = data.activeUsers.toLocaleString();
          document.getElementById('activeChannels').textContent = data.activeChannels.toLocaleString();
          document.getElementById('avgPerDay').textContent = data.avgPerDay.toFixed(1);
          
          // Update top users table
          const usersBody = document.getElementById('topUsersBody');
          usersBody.innerHTML = data.topUsers.map((user, i) => \`
            <tr>
              <td>\${i + 1}</td>
              <td>\${user.username || user.user_id}</td>
              <td>\${user.message_count.toLocaleString()}</td>
              <td>\${user.percentage.toFixed(1)}%</td>
            </tr>
          \`).join('');
          
          // Update top channels table
          const channelsBody = document.getElementById('topChannelsBody');
          channelsBody.innerHTML = data.topChannels.map((ch, i) => \`
            <tr>
              <td>\${i + 1}</td>
              <td>\${ch.channel_name || ch.channel_id}</td>
              <td>\${ch.message_count.toLocaleString()}</td>
              <td>\${ch.percentage.toFixed(1)}%</td>
            </tr>
          \`).join('');
          
          // Update chart (simplified - you'd use Chart.js or similar in production)
          updateChart(data.dailyActivity);
          
        } catch (err) {
          console.error('Failed to load analytics:', err);
        }
      }
      
      function updateChart(dailyData) {
        // Placeholder - integrate with Chart.js or similar
        console.log('Daily activity data:', dailyData);
      }
      
      function applyFilters() {
        loadAnalytics();
      }
      
      function resetFilters() {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        document.getElementById('endDate').valueAsDate = today;
        document.getElementById('startDate').valueAsDate = thirtyDaysAgo;
        document.getElementById('channelFilter').value = '';
        
        loadAnalytics();
      }
      
      // Initial load
      loadChannels();
      loadAnalytics();
    </script>
  `;

  return sharedTemplate.generate({
    head,
    body,
    botKey: bot.key,
    botName: bot.name,
    title: `Analytics - ${bot.name}`,
    currentPage: "analytics",
  });
}

module.exports = { generateAnalyticsPage };
