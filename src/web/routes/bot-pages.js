const { Router } = require("express");

// Page generators (imported directly — no longer passed via ctx)
const { generateMessagesPage } = require("../messages-page");
const { generateStatsPage } = require("../stats-page");
const { generateAnalyticsPage } = require("../analytics-page");
const { generateAIEngagementPage } = require("../ai-engagement-page");
const { generateCommandsPage } = require("../commands-page");
const { generateAccuracyMonitorPage } = require("../accuracy-monitor-page");
const { generateRateLimiterPage } = require("../rate-limiter-page");
const { generateWhitelistPage } = require("../whitelist-page");
const { generateAutoModPage } = require("../automod-page");
const { generateHistoryPage } = require("../history-page");
const { generateDebugReportsPage } = require("../debug-reports-page");
const { generateSampServersPage } = require("../samp-servers-page");
const { generateChannelsPage } = require("../channels-page");

function createBotPagesRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, bots, db,
    escapeHtml, getDisabledCommands,
    panelHttpLogger,
  } = ctx;

  // ========================
  // BOT PAGE RENDERS
  // ========================

  // BOT PAGE
  router.get(`${PANEL_BASE}/bot/:botKey`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");

    res.render("bot", {
      bot: { key: bot.key, name: bot.name },
      username: req.session.user.username,
      userRole: req.session.user.role
    });
  });

  router.get(`${PANEL_BASE}/bot/:botKey/holidays`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");

    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Holidays - ${escapeHtml(bot.name)}</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui;background:#070c14;color:#e5e7eb}
    .wrap{max-width:1100px;margin:0 auto;padding:18px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .title{font-weight:850;font-size:16px}
    .muted{color:#9ca3af;font-size:12.5px;margin-top:4px}
    .card{background:rgba(5,11,22,.86);border:1px solid rgba(31,42,58,.9);border-radius:16px;padding:14px;box-shadow:0 14px 34px rgba(0,0,0,.35);backdrop-filter: blur(8px)}
    label{display:block;font-size:12px;margin:10px 0 6px;color:#cbd5e1}
    input,textarea{width:100%;padding:10px 11px;border-radius:12px;border:1px solid rgba(31,42,58,.95);background:rgba(7,15,32,.85);color:#e5e7eb;outline:none}
    textarea{min-height:72px;resize:vertical}
    .row{display:flex;gap:10px;flex-wrap:wrap}
    .btn{padding:9px 12px;border-radius:999px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb;cursor:pointer}
    .btnPrimary{background:#0ea5e9;color:#06101a;border:0;font-weight:800}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{padding:10px;border-bottom:1px solid rgba(31,42,58,.7);vertical-align:top;font-size:13px}
    th{color:#cbd5e1;text-align:left;font-size:12px}
    .tag{display:inline-block;padding:2px 8px;border-radius:999px;background:rgba(17,28,45,.75);border:1px solid rgba(31,42,58,.9);font-size:12px;color:#e5e7eb}
    a{color:#93c5fd;text-decoration:none}
    .err{margin-top:10px;padding:10px;border-radius:12px;border:1px solid #3b1520;background:#1a0b10;color:#fb7185;font-size:12.5px;display:none}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">🎉 Holidays</div>
        <div class="muted">Bot: ${escapeHtml(bot.name)} (${escapeHtml(bot.key)})</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 14px">← Back</button>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}" style="color:#93c5fd">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/stats" style="color:#93c5fd">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/rate-limits" style="color:#93c5fd">🛡️ Spam Limits</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/messages" style="color:#93c5fd">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/ai-engagement" style="color:#93c5fd">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/commands" style="color:#93c5fd">📚 Commands</a>
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/accuracy" style="color:#93c5fd">🎯 Accuracy</a>
        <a href="${PANEL_BASE}/verification-dashboard?bot=${encodeURIComponent(bot.key)}" style="color:#93c5fd">🔍 Verification</a>
        <form method="post" action="${PANEL_BASE}/logout" style="display:inline;margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div class="card">
      <div class="row">
        <div style="flex:1;min-width:240px">
          <label>Date</label>
          <input id="date" type="date" />
        </div>
        <div style="flex:2;min-width:280px">
          <label>Title</label>
          <input id="title" placeholder="Например: День модератора" />
        </div>
        <div style="flex:2;min-width:280px">
          <label>Note (optional)</label>
          <input id="note" placeholder="Заметка для панели" />
        </div>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn btnPrimary" id="addBtn">Add holiday</button>
        <span class="tag" id="status">Ready</span>
      </div>

      <div class="err" id="err"></div>

      <table>
        <thead>
          <tr>
            <th style="width:80px">ID</th>
            <th>Title</th>
            <th style="width:220px">Note</th>
            <th style="width:170px">Created</th>
            <th style="width:120px"></th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
  </div>

<script>
(function(){
  const botKey = ${JSON.stringify(bot.key)};
  const dateEl = document.getElementById('date');
  const titleEl = document.getElementById('title');
  const noteEl = document.getElementById('note');
  const rowsEl = document.getElementById('rows');
  const statusEl = document.getElementById('status');
  const errEl = document.getElementById('err');
  const addBtn = document.getElementById('addBtn');

  function setStatus(t){ statusEl.textContent = t; }
  function showErr(t){ errEl.style.display='block'; errEl.textContent = t; }
  function clearErr(){ errEl.style.display='none'; errEl.textContent=''; }

  function todayISO(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const da = String(d.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+da;
  }

  async function api(path, opts){
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type':'application/json' }}, opts||{}));
    const txt = await res.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = null; }
    if(!res.ok){
      throw new Error((json && (json.error || json.message)) || txt || ('HTTP '+res.status));
    }
    return json;
  }

  function render(items){
    rowsEl.innerHTML = '';
    if(!items || !items.length){
      rowsEl.innerHTML = '<tr><td colspan="5" style="color:#9ca3af">No manual holidays for this date.</td></tr>';
      return;
    }
    for(const it of items){
      const tr = document.createElement('tr');
      tr.innerHTML = \`
        <td>#\${it.id}</td>
        <td>\${escapeHtml(it.title || '')}</td>
        <td style="color:#9ca3af">\${escapeHtml(it.note || '')}</td>
        <td style="color:#9ca3af">\${escapeHtml(it.created_at || '')}</td>
        <td><button class="btn" data-del="\${it.id}">Delete</button></td>
      \`;
      rowsEl.appendChild(tr);
    }
  }

  function escapeHtml(str){
    return String(str||'')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  async function load(){
    clearErr();
    setStatus('Loading...');
    const date = dateEl.value || todayISO();
    const data = await api(${JSON.stringify(PANEL_BASE)} + '/api/' + encodeURIComponent(botKey) + '/holidays?date=' + encodeURIComponent(date));
    render(data.items);
    setStatus('Loaded: ' + (data.items ? data.items.length : 0));
  }

  dateEl.value = todayISO();
  dateEl.addEventListener('change', () => load().catch(e => showErr(e.message)));

  addBtn.addEventListener('click', async () => {
    clearErr();
    const date = dateEl.value;
    const title = titleEl.value.trim();
    const note = noteEl.value.trim();
    if(!date) return showErr('Please pick a date.');
    if(!title) return showErr('Title is required.');
    try{
      setStatus('Saving...');
      const data = await api(${JSON.stringify(PANEL_BASE)} + '/api/' + encodeURIComponent(botKey) + '/holidays', {
        method:'POST',
        body: JSON.stringify({ date, title, note })
      });
      titleEl.value = '';
      noteEl.value = '';
      render(data.items);
      setStatus('Saved');
    }catch(e){
      showErr(e.message);
      setStatus('Error');
    }
  });

  rowsEl.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-del]');
    if(!btn) return;
    const id = btn.getAttribute('data-del');
    if(!confirm('Delete holiday #' + id + '?')) return;
    try{
      clearErr();
      setStatus('Deleting...');
      await api(${JSON.stringify(PANEL_BASE)} + '/api/' + encodeURIComponent(botKey) + '/holidays/' + encodeURIComponent(id), { method:'DELETE' });
      await load();
      setStatus('Deleted');
    }catch(e){
      showErr(e.message);
      setStatus('Error');
    }
  });

  load().catch(e => showErr(e.message));
})();
</script>
</body>
</html>`);
  });

  // Messages page route
  router.get(`${PANEL_BASE}/bot/:botKey/messages`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateMessagesPage(bot, PANEL_BASE));
  });

  // User statistics page route
  router.get(`${PANEL_BASE}/bot/:botKey/stats`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateStatsPage(bot, PANEL_BASE));
  });

  // Analytics page route (daily/channel stats)
  router.get(`${PANEL_BASE}/bot/:botKey/analytics`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    const botWithPanel = { ...bot, panelBase: PANEL_BASE };
    res.send(generateAnalyticsPage(botWithPanel));
  });

  // AI Engagement page
  router.get(`${PANEL_BASE}/bot/:botKey/ai-engagement`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateAIEngagementPage(bot, PANEL_BASE));
  });

  // Commands documentation page
  router.get(`${PANEL_BASE}/bot/:botKey/commands`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    
    // Get disabled commands for this guild
    const guild = bot.client?.guilds.cache.first();
    const guildId = guild?.id || "global";
    let disabledCommands = [];
    try {
      disabledCommands = await getDisabledCommands(guildId);
    } catch (e) {
      console.error("Error getting disabled commands:", e);
    }
    
    res.send(generateCommandsPage(bot, PANEL_BASE, disabledCommands));
  });

  // Accuracy monitor page
  router.get(`${PANEL_BASE}/bot/:botKey/accuracy`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    
    // Set db in app.locals for the handler to access
    req.app.locals.db = db;
    await generateAccuracyMonitorPage(bot, PANEL_BASE)(req, res);
  });

  // Rate Limiter page
  router.get(`${PANEL_BASE}/bot/:botKey/rate-limits`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateRateLimiterPage(bot, PANEL_BASE));
  });

  // Redirect old consecutive limits route to unified spam prevention
  router.get(`${PANEL_BASE}/bot/:botKey/consecutive-limits`, requireAuth, (req, res) => {
    res.redirect(`${PANEL_BASE}/bot/${req.params.botKey}/rate-limits`);
  });

  // Channel Whitelist page
  router.get(`${PANEL_BASE}/bot/:botKey/whitelist`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateWhitelistPage(bot, PANEL_BASE));
  });

  // AutoMod page
  router.get(`${PANEL_BASE}/bot/:botKey/automod`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateAutoModPage(bot, PANEL_BASE));
  });

  // Operation History page
  router.get(`${PANEL_BASE}/bot/:botKey/history`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateHistoryPage(bot, PANEL_BASE));
  });

  // Debug Reports page
  router.get(`${PANEL_BASE}/bot/:botKey/debug-reports`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateDebugReportsPage(bot, PANEL_BASE));
  });

  // SAMP Servers page
  router.get(`${PANEL_BASE}/bot/:botKey/samp-servers`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateSampServersPage(bot, PANEL_BASE));
  });

  // Channel Manager page
  router.get(`${PANEL_BASE}/bot/:botKey/channels`, requireAuth, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).send("Bot not found");
    res.send(generateChannelsPage(bot, PANEL_BASE));
  });

  return router;
}

module.exports = { createBotPagesRouter };
