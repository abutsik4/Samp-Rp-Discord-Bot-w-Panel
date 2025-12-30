// Commands Documentation Page
// Shows all bot commands organized by category with enable/disable toggles

function generateCommandsPage(bot, PANEL_BASE, disabledCommands = []) {
  const disabledSet = new Set(disabledCommands.map(d => d.command_name));
  
  function commandCard(name, desc, usage, category = 'user', badge = '') {
    const isDisabled = disabledSet.has(name);
    const badgeHtml = badge ? `<span class="badge badge-${badge.toLowerCase()}">${badge}</span>` : '';
    return `
        <div class="command-card ${isDisabled ? 'command-disabled' : ''}" data-command="${name}">
          <div class="command-header">
            <div class="command-info">
              <div class="command-name">/${name} ${badgeHtml}</div>
              <div class="command-desc">${desc}</div>
              ${usage ? `<div class="command-usage">Usage: ${usage}</div>` : ''}
            </div>
            <label class="toggle-switch">
              <input type="checkbox" ${isDisabled ? '' : 'checked'} data-command="${name}" onchange="toggleCommand(this)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>`;
  }

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
    .section{margin-bottom:32px}
    .section-title{font-size:19px;font-weight:600;color:var(--accent-purple);margin-bottom:12px;display:flex;align-items:center;gap:10px}
    .section-desc{color:var(--text-muted);font-size:13px;margin-bottom:16px;padding-left:30px}
    .command-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
    .command-card{background:rgba(255,255,255,0.03);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;transition:all .3s ease}
    .command-card:hover{background:rgba(255,255,255,0.05);border-color:rgba(139,92,246,0.4)}
    .command-card.command-disabled{opacity:0.5;background:rgba(100,100,100,0.05)}
    .command-card.command-disabled .command-name{color:var(--text-muted)}
    .command-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .command-info{flex:1}
    .command-name{font-family:'Courier New',monospace;font-size:15px;font-weight:600;color:var(--accent-cyan);margin-bottom:6px}
    .command-desc{font-size:13px;color:var(--text-muted);margin-bottom:6px;line-height:1.4}
    .command-usage{font-family:'Courier New',monospace;font-size:12px;background:rgba(17,24,39,.6);padding:6px 10px;border-radius:6px;border-left:3px solid var(--accent-purple);margin-top:6px;color:var(--accent-emerald)}
    .badge{display:inline-block;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-left:6px}
    .badge-admin{background:rgba(251,113,133,.2);color:var(--accent-rose);border:1px solid rgba(251,113,133,.3)}
    .badge-owner{background:rgba(251,113,133,.2);color:var(--accent-rose);border:1px solid rgba(251,113,133,.3)}
    .badge-user{background:rgba(52,211,153,.2);color:var(--accent-emerald);border:1px solid rgba(52,211,153,.3)}
    .badge-new{background:rgba(251,191,36,.2);color:var(--accent-amber);border:1px solid rgba(251,191,36,.3)}
    .info-box{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);border-radius:8px;padding:14px;margin-bottom:18px;font-size:13px;line-height:1.5}
    .info-box strong{color:var(--accent-cyan)}
    .toggle-switch{position:relative;width:44px;height:24px;flex-shrink:0}
    .toggle-switch input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:rgba(100,116,139,0.5);transition:.3s;border-radius:24px}
    .toggle-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background-color:white;transition:.3s;border-radius:50%}
    input:checked+.toggle-slider{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan))}
    input:checked+.toggle-slider:before{transform:translateX(20px)}
    input:disabled+.toggle-slider{opacity:0.5;cursor:not-allowed}
    .toast{position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;font-size:14px;z-index:1000;animation:slideIn .3s ease}
    .toast-success{background:rgba(52,211,153,0.9);color:#fff}
    .toast-error{background:rgba(251,113,133,0.9);color:#fff}
    @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">📚</span><span class="gradient-text">Bot Commands</span></div>
        <div class="subtitle">Manage and configure all available commands</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 16px">← Back</button>
        <a href="${PANEL_BASE}/bot/${bot.key}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/stats">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/rate-limits">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/ai-engagement">🤖 AI</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div class="info-box">
      <strong>⚙️ Command Management:</strong> Use the toggles to enable or disable slash commands. Disabled commands will show an error message when users try to use them.
    </div>

    <!-- User Commands -->
    <div class="section">
      <div class="section-title">
        👤 User Commands
        <span class="badge badge-user">All Users</span>
      </div>
      <div class="section-desc">These commands can be used by any server member</div>
      
      <div class="command-grid">
        ${commandCard('mystats', 'Show your message statistics on the server', '/mystats')}
        ${commandCard('userstats', 'View another user\'s statistics', '/userstats user:@Username')}
        ${commandCard('top5', 'Top 5 users by message count', '/top5')}
        ${commandCard('top10', 'Top 10 users by message count', '/top10')}
        ${commandCard('weekly', 'Weekly leaderboard (resets every Monday)', '/weekly', 'user', 'New')}
        ${commandCard('streak', 'View daily message streak', '/streak [user:@Username]', 'user', 'New')}
        ${commandCard('reactions', 'Reactions leaderboard', '/reactions [type:given/received]', 'user', 'New')}
        ${commandCard('mystrikes', 'View your current violations and strikes', '/mystrikes', 'user', 'New')}
        ${commandCard('countdown', 'Countdown to New Year 2026!', '/countdown')}
        ${commandCard('demoembed', 'Send example embed message', '/demoembed')}
      </div>
    </div>

    <!-- Holiday Commands -->
    <div class="section">
      <div class="section-title">
        🎊 Holiday Commands
        <span class="badge badge-user">All Users</span>
      </div>
      <div class="section-desc">Commands for viewing and managing holidays</div>
      
      <div class="command-grid">
        ${commandCard('holiday', 'Show today\'s holidays or manage holidays', '/holiday today | /holiday date value:2025-12-31')}
      </div>
    </div>

    <!-- Admin Commands -->
    <div class="section">
      <div class="section-title">
        🔧 Administrator Commands
        <span class="badge badge-admin">Requires Permissions</span>
      </div>
      <div class="section-desc">These commands are available to the bot owner and administrators</div>
      
      <div class="command-grid">
        ${commandCard('backfill', 'Load server message history (may take a long time)', '/backfill', 'admin', 'Owner')}
        ${commandCard('synccommands', 'Re-register slash commands for the server', '/synccommands', 'admin', 'Owner')}
        ${commandCard('export', 'Export server statistics to CSV file', '/export', 'admin', 'Owner')}
      </div>
    </div>

    <!-- Auto Features (no toggles) -->
    <div class="section">
      <div class="section-title">
        🤖 Automatic Features
        <span class="badge badge-new">24/7 Active</span>
      </div>
      <div class="section-desc">These features work automatically without commands</div>
      
      <div class="command-grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
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
          <div class="command-name">🤖 AI Chat</div>
          <div class="command-desc">Smart bot interaction in chats with contextual responses</div>
        </div>
        <div class="command-card">
          <div class="command-name">🚦 Message Limits</div>
          <div class="command-desc">Message frequency control with role-based limits</div>
        </div>
      </div>
    </div>

    <div class="info-box" style="margin-top:40px">
      <strong>💡 Tip:</strong> Disabled commands will still appear in Discord's command list but will show an error when used.
    </div>
  </div>

  <div id="toast" class="toast" style="display:none"></div>

  <script>
    const BOT_KEY = "${bot.key}";
    const PANEL_BASE = "${PANEL_BASE}";
    
    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast toast-' + type;
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    async function toggleCommand(checkbox) {
      const commandName = checkbox.dataset.command;
      const enabled = checkbox.checked;
      const card = checkbox.closest('.command-card');
      
      checkbox.disabled = true;
      
      try {
        const res = await fetch(PANEL_BASE + '/api/' + BOT_KEY + '/commands/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commandName, enabled })
        });
        
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'Failed to toggle command');
        
        card.classList.toggle('command-disabled', !enabled);
        showToast('/' + commandName + ' ' + (enabled ? 'enabled' : 'disabled'), 'success');
      } catch (e) {
        checkbox.checked = !enabled;
        showToast('Error: ' + e.message, 'error');
      } finally {
        checkbox.disabled = false;
      }
    }
  </script>
  <link rel="stylesheet" href="/snow.css">
  <script src="/snow.js"></script>
</body>
</html>`;
}

module.exports = { generateCommandsPage };
