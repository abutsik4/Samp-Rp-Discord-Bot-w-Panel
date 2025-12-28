// Commands Documentation Page
// Shows all bot commands organized by category

function generateCommandsPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Bot Commands</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-main);color:var(--text);line-height:1.6}
    .wrap{max-width:1200px;margin:0 auto;padding:20px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .title{font-weight:700;font-size:28px;display:flex;align-items:center;gap:8px}
    .title .gradient-text{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .title .emoji{font-size:32px}
    .subtitle{color:var(--text-muted);font-size:14px;margin-top:6px}
    .nav{display:flex;gap:12px;align-items:center}
    .nav a{color:var(--accent-cyan);text-decoration:none;font-size:14px;transition:color .2s}
    .nav a:hover{color:var(--accent-purple)}
    .btn{padding:10px 18px;border-radius:8px;border:1px solid var(--border);background:rgba(17,24,39,.9);color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:all .2s}
    .btn:hover{background:rgba(30,41,59,.9);border-color:var(--accent-purple)}
    .lang-switch{display:flex;gap:6px;background:rgba(17,24,39,.9);border:1px solid var(--border);border-radius:8px;padding:4px}
    .lang-btn{padding:6px 12px;border:none;background:transparent;color:var(--text-muted);cursor:pointer;border-radius:6px;font-size:13px;font-weight:500;transition:all .2s}
    .lang-btn.active{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));color:#fff}
    .lang-btn:hover:not(.active){color:var(--text);background:rgba(30,41,59,.5)}
    .section{margin-bottom:32px}
    .section-title{font-size:19px;font-weight:600;color:var(--accent-purple);margin-bottom:12px;display:flex;align-items:center;gap:10px}
    .section-title::first-letter{color:inherit}
    .section-desc{color:var(--text-muted);font-size:13px;margin-bottom:16px;padding-left:30px}
    .command-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
    .command-card{background:rgba(255,255,255,0.03);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;transition:all .3s ease}
    .command-card:hover{background:rgba(255,255,255,0.05);border-color:rgba(139,92,246,0.4);transform:translateY(-2px);box-shadow:0 8px 32px rgba(139,92,246,0.15)}
    .command-name{font-family:'Courier New',monospace;font-size:15px;font-weight:600;color:var(--accent-cyan);margin-bottom:6px}
    .command-desc{font-size:13px;color:var(--text-muted);margin-bottom:6px;line-height:1.4}
    .command-usage{font-family:'Courier New',monospace;font-size:12px;background:rgba(17,24,39,.6);padding:6px 10px;border-radius:6px;border-left:3px solid var(--accent-purple);margin-top:6px;color:var(--accent-emerald)}
    .badge{display:inline-block;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
    .badge-admin{background:rgba(251,113,133,.2);color:var(--accent-rose);border:1px solid rgba(251,113,133,.3)}
    .badge-user{background:rgba(52,211,153,.2);color:var(--accent-emerald);border:1px solid rgba(52,211,153,.3)}
    .badge-new{background:rgba(251,191,36,.2);color:var(--accent-amber);border:1px solid rgba(251,191,36,.3)}
    .info-box{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);border-radius:8px;padding:14px;margin-bottom:18px;font-size:13px;line-height:1.5}
    .info-box strong{color:var(--accent-cyan)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">📚</span><span class="gradient-text">Bot Commands</span></div>
        <div class="subtitle">Complete list of all available commands</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 16px">← Back</button>
        <a href="${PANEL_BASE}/bot/${bot.key}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/rate-limits">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/consecutive-limits">🚫 Consecutive</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/messages">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/ai-engagement">🤖 AI</a>
        <form method="post" action="${PANEL_BASE}/logout" style="display:inline">
          <button class="btn" type="submit">Logout</button>
        </form>
      </div>
    </div>

    <div class="info-box">
      <strong>Update (Dec 21):</strong> Bot now uses only ML-based AI engagement for chat communication. Keyword trigger responses have been removed.
    </div>

    <!-- User Commands -->
    <div class="section">
      <div class="section-title">
        👤 User Commands
        <span class="badge badge-user">All Users</span>
      </div>
      <div class="section-desc">These commands can be used by any server member</div>
      
      <div class="command-grid">
        <div class="command-card">
          <div class="command-name">/mystats</div>
          <div class="command-desc">Show your message statistics on the server</div>
          <div class="command-usage">Usage: /mystats</div>
        </div>

        <div class="command-card">
          <div class="command-name">/userstats</div>
          <div class="command-desc">View another user's statistics</div>
          <div class="command-usage">Usage: /userstats user:@Username</div>
        </div>

        <div class="command-card">
          <div class="command-name">/top5</div>
          <div class="command-desc">Top 5 users by message count</div>
          <div class="command-usage">Usage: /top5</div>
        </div>

        <div class="command-card">
          <div class="command-name">/top10</div>
          <div class="command-desc">Top 10 users by message count</div>
          <div class="command-usage">Usage: /top10</div>
        </div>

        <div class="command-card">
          <div class="command-name">/weekly <span class="badge badge-new">New</span></div>
          <div class="command-desc">Weekly leaderboard (resets every Monday)</div>
          <div class="command-usage">Usage: /weekly</div>
        </div>

        <div class="command-card">
          <div class="command-name">/streak <span class="badge badge-new">New</span></div>
          <div class="command-desc">View daily message streak (yours or another user's)</div>
          <div class="command-usage">Usage: /streak [user:@Username]</div>
        </div>

        <div class="command-card">
          <div class="command-name">/reactions <span class="badge badge-new">New</span></div>
          <div class="command-desc">Reactions leaderboard (given or received)</div>
          <div class="command-usage">Usage: /reactions [type:given/received]</div>
        </div>

        <div class="command-card">
          <div class="command-name">/mystrikes <span class="badge badge-new">New</span></div>
          <div class="command-desc">View your current violations and strikes</div>
          <div class="command-usage">Usage: /mystrikes</div>
        </div>

        <div class="command-card">
          <div class="command-name">/countdown</div>
          <div class="command-desc">Countdown to New Year 2026!</div>
          <div class="command-usage">Usage: /countdown</div>
        </div>

        <div class="command-card">
          <div class="command-name">/holiday today</div>
          <div class="command-desc">Show today's holidays</div>
          <div class="command-usage">Usage: /holiday today</div>
        </div>

        <div class="command-card">
          <div class="command-name">/holiday date</div>
          <div class="command-desc">Show holidays for selected date</div>
          <div class="command-usage">Usage: /holiday date value:2025-12-31</div>
        </div>

        <div class="command-card">
          <div class="command-name">/holiday list</div>
          <div class="command-desc">List manual holidays for a date</div>
          <div class="command-usage">Usage: /holiday list date:2025-12-31</div>
        </div>
      </div>
    </div>

    <!-- Admin Commands -->
    <div class="section">
      <div class="section-title">
        🔧 Administrator Commands
        <span class="badge badge-admin">Requires Permissions</span>
      </div>
      <div class="section-desc">These commands are available to the bot owner and administrators with 'Manage Server' permissions</div>
      
      <div class="command-grid">
        <div class="command-card">
          <div class="command-name">/backfill <span class="badge badge-admin">Owner</span></div>
          <div class="command-desc">Load server message history (may take a long time)</div>
          <div class="command-usage">Usage: /backfill</div>
        </div>

        <div class="command-card">
          <div class="command-name">/synccommands <span class="badge badge-admin">Owner</span></div>
          <div class="command-desc">Re-register slash commands for the server</div>
          <div class="command-usage">Usage: /synccommands</div>
        </div>

        <div class="command-card">
          <div class="command-name">/export <span class="badge badge-admin">Owner</span></div>
          <div class="command-desc">Export server statistics to CSV file</div>
          <div class="command-usage">Usage: /export</div>
        </div>

        <div class="command-card">
          <div class="command-name">/demoembed <span class="badge badge-admin">Admin</span></div>
          <div class="command-desc">Send example embed message that edits after 10 seconds</div>
          <div class="command-usage">Usage: /demoembed</div>
        </div>

        <div class="command-card">
          <div class="command-name">/holiday add <span class="badge badge-admin">Admin</span></div>
          <div class="command-desc">Add manual holiday for a date</div>
          <div class="command-usage">Usage: /holiday add date:2025-12-25 title:Christmas [note:Note]</div>
        </div>

        <div class="command-card">
          <div class="command-name">/holiday remove <span class="badge badge-admin">Admin</span></div>
          <div class="command-desc">Remove manual holiday by ID</div>
          <div class="command-usage">Usage: /holiday remove id:1</div>
        </div>
      </div>
    </div>

    <!-- Auto Features -->
    <div class="section">
      <div class="section-title">
        🤖 Automatic Features
        <span class="badge badge-new">24/7 Active</span>
      </div>
      <div class="section-desc">These features work automatically without commands</div>
      
      <div class="command-grid">
        <div class="command-card">
          <div class="command-name">📊 Message Counting</div>
          <div class="command-desc">Automatically tracks all messages and updates statistics</div>
        </div>

        <div class="command-card">
          <div class="command-name">🎉 Milestones</div>
          <div class="command-desc">Automatic celebrations at 100, 500, 1000, 5000+ messages</div>
        </div>

        <div class="command-card">
          <div class="command-name">🔥 Streaks</div>
          <div class="command-desc">Tracking daily activity and longest streak</div>
        </div>

        <div class="command-card">
          <div class="command-name">👍 Reactions</div>
          <div class="command-desc">Counting given and received reactions</div>
        </div>

        <div class="command-card">
          <div class="command-name">🤖 AI Chat <span class="badge badge-new">New</span></div>
          <div class="command-desc">Smart bot interaction in chats with contextual Russian responses</div>
        </div>

        <div class="command-card">
          <div class="command-name">🚦 Message Limits <span class="badge badge-new">New</span></div>
          <div class="command-desc">Message frequency control with customizable role-based limits</div>
        </div>

        <div class="command-card">
          <div class="command-name">🎊 Daily Holidays</div>
          <div class="command-desc">Automatic holiday posting every day at 09:00 MSK</div>
        </div>
      </div>
    </div>

    <!-- Panel Features -->
    <div class="section">
      <div class="section-title">
        🌐 Web Panel Features
        <span class="badge badge-admin">Admin Only</span>
      </div>
      <div class="section-desc">Available through the control panel (login required)</div>
      
      <div class="command-grid">
        <div class="command-card">
          <div class="command-name">📝 Message Management</div>
          <div class="command-desc">Create, edit and send messages with embeds via panel</div>
        </div>

        <div class="command-card">
          <div class="command-name">🎊 Holiday Management</div>
          <div class="command-desc">Add, remove and view manual holidays</div>
        </div>

        <div class="command-card">
          <div class="command-name">🤖 AI Settings <span class="badge badge-new">New</span></div>
          <div class="command-desc">Configure AI chat engagement: frequency, channels, mode</div>
        </div>

        <div class="command-card">
          <div class="command-name">🚦 Rate Limit Settings <span class="badge badge-new">New</span></div>
          <div class="command-desc">Configure message limits per channel and role</div>
        </div>
      </div>
    </div>

    <div class="info-box" style="margin-top:40px">
      <strong>💡 Tip:</strong> Use the web panel for easier bot management. Contact server admin for access.
    </div>
  </div>

  <link rel="stylesheet" href="/snow.css">
  <script src="/snow.js"></script>
</body>
</html>`;
}

module.exports = { generateCommandsPage };
