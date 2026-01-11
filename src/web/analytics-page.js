// Analytics Dashboard Page

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateAnalyticsPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Analytics</title>
  <link rel="stylesheet" href="/shared.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    ${generateSidebarStyles()}
    
    .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
    .stat-card{background:linear-gradient(135deg,color-mix(in srgb, var(--accent-purple) 8%, transparent),color-mix(in srgb, var(--accent-cyan) 8%, transparent));border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center;transition:all .3s}
    .stat-card:hover{transform:translateY(-3px);border-color:var(--accent-purple)}
    .stat-value{font-size:32px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:12px;color:var(--text-muted);margin-top:6px;text-transform:uppercase;letter-spacing:.5px}
    .stat-change{font-size:11px;margin-top:6px;font-weight:500}
    .stat-change.positive{color:var(--accent-green)}
    .stat-change.negative{color:#f87171}
    
    .chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px}
    @media(max-width:1100px){.chart-grid{grid-template-columns:1fr}}
    .chart-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px}
    .chart-title{font-size:14px;font-weight:600;margin-bottom:16px;display:flex;align-items:center;gap:8px}
    .chart-container{position:relative;height:260px}
    
    .date-filter{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
    .date-btn{padding:8px 16px;border-radius:6px;background:var(--input-bg);border:1px solid var(--border);color:var(--text);cursor:pointer;transition:all .2s;font-size:13px}
    .date-btn:hover{border-color:var(--accent-purple)}
    .date-btn.active{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));color:#fff;border-color:transparent}
    
    .top-list{max-height:300px;overflow-y:auto}
    .top-item{display:flex;align-items:center;gap:12px;padding:12px;background:var(--input-bg);border-radius:8px;margin-bottom:8px}
    .top-rank{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0}
    .top-name{flex:1;font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .top-count{font-size:13px;color:var(--accent-cyan);font-weight:600}
    
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'Analytics',
      icon: '📊',
      botKey: bot.key,
      PANEL_BASE,
      currentPage: 'analytics'
    })}

    <main class="main-scroll-container">
      <div class="scroll-progress">
        <div class="scroll-progress-bar" id="scrollProgressBar"></div>
      </div>

      <div data-scroll-container id="scrollContainer">
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>📊</span> Analytics Dashboard</h1>
            <p class="section-subtitle">Server activity insights and statistics</p>
          </div>

          <div class="date-filter" data-scroll data-scroll-class="is-inview">
            <button class="date-btn active" data-range="7">7 Days</button>
            <button class="date-btn" data-range="14">14 Days</button>
            <button class="date-btn" data-range="30">30 Days</button>
            <button class="date-btn" data-range="90">90 Days</button>
          </div>

          <div class="stat-grid" data-scroll data-scroll-class="is-inview">
            <div class="stat-card">
              <div class="stat-value" id="totalMessages">-</div>
              <div class="stat-label">Total Messages</div>
              <div class="stat-change positive" id="messagesChange">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="activeUsers">-</div>
              <div class="stat-label">Active Users</div>
              <div class="stat-change positive" id="usersChange">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="avgDaily">-</div>
              <div class="stat-label">Avg Daily</div>
              <div class="stat-change" id="avgChange">-</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" id="peakHour">-</div>
              <div class="stat-label">Peak Hour</div>
              <div class="stat-change" id="peakInfo">-</div>
            </div>
          </div>

          <div class="chart-grid" data-scroll data-scroll-class="is-inview">
            <div class="chart-card">
              <div class="chart-title">📈 Messages Over Time</div>
              <div class="chart-container">
                <canvas id="messagesChart"></canvas>
              </div>
            </div>
            <div class="chart-card">
              <div class="chart-title">👥 Active Users</div>
              <div class="chart-container">
                <canvas id="usersChart"></canvas>
              </div>
            </div>
            <div class="chart-card">
              <div class="chart-title">🕐 Hourly Activity</div>
              <div class="chart-container">
                <canvas id="hourlyChart"></canvas>
              </div>
            </div>
            <div class="chart-card">
              <div class="chart-title">📅 Weekly Pattern</div>
              <div class="chart-container">
                <canvas id="weeklyChart"></canvas>
              </div>
            </div>
          </div>

          <div class="chart-grid" data-scroll data-scroll-class="is-inview">
            <div class="chart-card">
              <div class="chart-title">🏆 Top Users</div>
              <div id="topUsers" class="top-list">Loading...</div>
            </div>
            <div class="chart-card">
              <div class="chart-title">💬 Top Channels</div>
              <div id="topChannels" class="top-list">Loading...</div>
            </div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">ℹ️ About Analytics</div>
            <div class="alert alert-info">
              Analytics are collected automatically from server activity. Data is aggregated daily for performance.
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>

  ${generateSidebarScripts()}

  <script>
    const botKey = '${bot.key}';
    const apiBase = '${PANEL_BASE}';
    let charts = {};
    let currentRange = 7;

    const chartColors = {
      purple: 'rgba(167, 139, 250, 1)',
      purpleFade: 'rgba(167, 139, 250, 0.2)',
      cyan: 'rgba(34, 211, 238, 1)',
      cyanFade: 'rgba(34, 211, 238, 0.2)',
      green: 'rgba(74, 222, 128, 1)',
      amber: 'rgba(251, 191, 36, 1)'
    };

    const defaultChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } } }
      }
    };

    function initCharts() {
      charts.messages = new Chart(document.getElementById('messagesChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: chartColors.purple, backgroundColor: chartColors.purpleFade, fill: true, tension: 0.4 }] },
        options: defaultChartOptions
      });
      charts.users = new Chart(document.getElementById('usersChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: chartColors.cyan, backgroundColor: chartColors.cyanFade, fill: true, tension: 0.4 }] },
        options: defaultChartOptions
      });
      charts.hourly = new Chart(document.getElementById('hourlyChart'), {
        type: 'bar',
        data: { labels: Array.from({length:24}, (_,i) => i + ':00'), datasets: [{ data: Array(24).fill(0), backgroundColor: chartColors.purpleFade, borderColor: chartColors.purple, borderWidth: 1 }] },
        options: defaultChartOptions
      });
      charts.weekly = new Chart(document.getElementById('weeklyChart'), {
        type: 'bar',
        data: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], datasets: [{ data: Array(7).fill(0), backgroundColor: chartColors.cyanFade, borderColor: chartColors.cyan, borderWidth: 1 }] },
        options: defaultChartOptions
      });
    }

    async function loadAnalytics(days) {
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/analytics?days=' + days);
        const data = await res.json();
        
        document.getElementById('totalMessages').textContent = (data.totalMessages || 0).toLocaleString();
        document.getElementById('activeUsers').textContent = (data.activeUsers || 0).toLocaleString();
        document.getElementById('avgDaily').textContent = Math.round(data.avgDaily || 0).toLocaleString();
        document.getElementById('peakHour').textContent = (data.peakHour || 0) + ':00';
        
        if (data.daily && data.daily.length) {
          charts.messages.data.labels = data.daily.map(d => d.date);
          charts.messages.data.datasets[0].data = data.daily.map(d => d.messages);
          charts.messages.update();
          
          charts.users.data.labels = data.daily.map(d => d.date);
          charts.users.data.datasets[0].data = data.daily.map(d => d.users);
          charts.users.update();
        }
        
        if (data.hourly) {
          charts.hourly.data.datasets[0].data = data.hourly;
          charts.hourly.update();
        }
        
        if (data.weekly) {
          charts.weekly.data.datasets[0].data = data.weekly;
          charts.weekly.update();
        }
        
        renderTopList('topUsers', data.topUsers || []);
        renderTopList('topChannels', data.topChannels || []);
      } catch (e) {
        console.error('Analytics load error:', e);
      }
    }

    function renderTopList(id, items) {
      const el = document.getElementById(id);
      if (!items.length) {
        el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">No data available</div>';
        return;
      }
      el.innerHTML = items.slice(0, 10).map((item, i) => 
        '<div class="top-item"><div class="top-rank">' + (i + 1) + '</div><div class="top-name">' + (item.name || item.id) + '</div><div class="top-count">' + item.count.toLocaleString() + '</div></div>'
      ).join('');
    }

    document.querySelectorAll('.date-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRange = parseInt(btn.dataset.range);
        loadAnalytics(currentRange);
      });
    });

    document.addEventListener('DOMContentLoaded', () => {
      initCharts();
      loadAnalytics(currentRange);
    });
  </script>
</body>
</html>`;
}

module.exports = { generateAnalyticsPage };
