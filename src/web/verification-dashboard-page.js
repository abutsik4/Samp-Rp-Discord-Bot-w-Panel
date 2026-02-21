"use strict";

const { generate } = require("./shared-template");

function generateVerificationSelectPage(bots, PANEL_BASE) {
  const botTiles = (Array.isArray(bots) ? bots : []).map((b) => {
    const href = `${PANEL_BASE}/verification-dashboard?bot=${encodeURIComponent(b.key)}`;
    return `
      <a class="tile" href="${href}">
        <div class="tile-title">🤖 ${b.name}</div>
        <div class="muted">${b.key}</div>
      </a>
    `;
  }).join("");

  return generate({
    title: "JepsenCloud Panel — Verification Dashboard",
    botKey: "",
    botName: "JepsenCloud",
    currentPage: "",
    PANEL_BASE,
    navSections: [
      {
        title: "Panel",
        links: [
          { href: `${PANEL_BASE}`, icon: "🏠", label: "Dashboard", id: "dashboard" },
        ],
      },
    ],
    head: `
      .bot-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
      .tile{display:block}
    `,
    body: `
      <div class="page-container">
        <div class="topbar">
          <div class="topbar-content">
            <div class="page-title"><span class="emoji">🔍</span><span class="gradient-text">Verification Dashboard</span></div>
            <div class="page-subtitle">Select a bot to verify message counts and index health.</div>
          </div>
          <div class="topbar-actions">
            <a class="btn btn-secondary" href="${PANEL_BASE}">← Back</a>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Choose a bot</div>
          <div class="bot-grid">
            ${botTiles || '<div class="muted">No bots available.</div>'}
          </div>
        </div>
      </div>
    `,
  });
}

function generateVerificationDashboardPage(bot, PANEL_BASE) {
  const body = `
    <div class="page-container-wide">
      <div class="topbar">
        <div class="topbar-content">
          <div class="page-title"><span class="emoji">🔍</span><span class="gradient-text">Verification</span></div>
          <div class="page-subtitle">Bot: ${bot.name} (${bot.key})</div>
        </div>
        <div class="topbar-actions">
          <a class="btn btn-secondary" href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}">← Back</a>
        </div>
      </div>

      <div class="card">
        <div class="tabs" style="display:flex;gap:8px;border-bottom:1px solid var(--border);margin-bottom:16px">
          <button class="btn btn-secondary" data-tab="user" type="button">👤 Check User</button>
          <button class="btn btn-secondary" data-tab="message" type="button">💬 Check Message</button>
          <button class="btn btn-secondary" data-tab="results" type="button">📊 Results</button>
        </div>

        <div class="alert alert-error" id="errBox" style="display:none"></div>

        <div id="tab-user">
          <div class="card-title">Check message count for user</div>
          <div class="form-group">
            <label>User ID</label>
            <input id="userId" placeholder="Discord user id" />
          </div>
          <div class="form-group">
            <label>Guild ID (optional)</label>
            <input id="guildId" placeholder="Leave empty for all guilds" />
          </div>
          <button class="btn btn-primary" id="checkUserBtn" type="button">Check</button>
          <div id="userResult" style="margin-top:16px"></div>
        </div>

        <div id="tab-message" style="display:none">
          <div class="card-title">Check if a message is counted</div>
          <div class="form-group">
            <label>Message ID</label>
            <input id="messageId" placeholder="Discord message id" />
          </div>
          <button class="btn btn-primary" id="checkMessageBtn" type="button">Check</button>
          <div id="messageResult" style="margin-top:16px"></div>
        </div>

        <div id="tab-results" style="display:none">
          <div class="card-title">Verification results</div>
          <div id="resultsSummary"></div>
          <div class="table-container" style="margin-top:12px">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Stored</th>
                  <th>Indexed</th>
                  <th>Diff</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody id="resultsRows"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  const scripts = `
    <script>
      (function(){
        const PANEL_BASE = ${JSON.stringify(PANEL_BASE)};
        const botKey = ${JSON.stringify(bot.key)};
        const apiBase = PANEL_BASE + '/api/' + encodeURIComponent(botKey);

        const errBox = document.getElementById('errBox');
        function showErr(msg){
          errBox.style.display = 'block';
          errBox.textContent = String(msg || 'Error');
        }
        function clearErr(){
          errBox.style.display = 'none';
          errBox.textContent = '';
        }

        function setActiveTab(name){
          for (const t of ['user','message','results']) {
            const el = document.getElementById('tab-' + t);
            if (el) el.style.display = (t === name) ? '' : 'none';
          }
        }

        function escapeHtml(str){
          return String(str || '')
            .replaceAll('&','&amp;')
            .replaceAll('<','&lt;')
            .replaceAll('>','&gt;')
            .replaceAll('"','&quot;')
            .replaceAll("'",'&#039;');
        }

        async function checkUser(){
          clearErr();
          const userId = String(document.getElementById('userId').value || '').trim();
          const guildId = String(document.getElementById('guildId').value || '').trim();
          const out = document.getElementById('userResult');
          if (!userId) {
            out.innerHTML = '<div class="alert alert-warning">User ID is required.</div>';
            return;
          }
          out.innerHTML = '<div class="muted">Loading…</div>';

          try {
            const url = apiBase + '/verify/user-stats?userId=' + encodeURIComponent(userId) + (guildId ? ('&guildId=' + encodeURIComponent(guildId)) : '');
            const data = await window.panelFetchJson(url);

            const diff = Number(data.discrepancy || 0);
            const badge = diff === 0 ? 'alert-success' : 'alert-warning';
            const sign = diff >= 0 ? '+' : '';

            out.innerHTML = '' +
              '<div class="alert ' + badge + '">' +
              '<strong>' + escapeHtml(data.username) + '</strong> (' + escapeHtml(data.userId) + ')<br>' +
              'Stored: ' + escapeHtml(data.storedCount) + ' | Indexed: ' + escapeHtml(data.indexedCount) + ' | Diff: ' + sign + escapeHtml(diff) +
              '</div>';
          } catch (e) {
            if (e && e.status === 401) showErr('Session expired. Please log in again.');
            else showErr(e && e.message ? e.message : 'Failed to check');
            out.innerHTML = '';
          }
        }

        async function checkMessage(){
          clearErr();
          const messageId = String(document.getElementById('messageId').value || '').trim();
          const out = document.getElementById('messageResult');
          if (!messageId) {
            out.innerHTML = '<div class="alert alert-warning">Message ID is required.</div>';
            return;
          }
          out.innerHTML = '<div class="muted">Loading…</div>';

          try {
            const data = await window.panelFetchJson(apiBase + '/verify/message-counted?messageId=' + encodeURIComponent(messageId));
            if (!data.found) {
              out.innerHTML = '<div class="alert alert-error">Message NOT found in database.</div>';
              return;
            }
            const msg = data.message || {};
            out.innerHTML = '' +
              '<div class="alert alert-success">' +
              '<strong>Message is counted</strong><br>' +
              'User: ' + escapeHtml(msg.userId) + '<br>' +
              'Guild: ' + escapeHtml(msg.guildId) + '<br>' +
              'Created: ' + escapeHtml(msg.createdAt) +
              '</div>';
          } catch (e) {
            if (e && e.status === 401) showErr('Session expired. Please log in again.');
            else showErr(e && e.message ? e.message : 'Failed to check');
            out.innerHTML = '';
          }
        }

        async function loadResults(){
          clearErr();
          const sumEl = document.getElementById('resultsSummary');
          const rowsEl = document.getElementById('resultsRows');
          sumEl.innerHTML = '<div class="muted">Loading…</div>';
          rowsEl.innerHTML = '';

          try {
            const data = await window.panelFetchJson(apiBase + '/verify/results');
            const summary = data.summary || {};
            const results = Array.isArray(data.results) ? data.results : [];

            sumEl.innerHTML = '' +
              '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">' +
              '  <div class="tile"><div class="tile-title">Total verified</div><div class="muted">' + escapeHtml(summary.total || 0) + '</div></div>' +
              '  <div class="tile"><div class="tile-title">Perfect matches</div><div class="muted">' + escapeHtml(summary.perfect || 0) + '</div></div>' +
              '  <div class="tile"><div class="tile-title">Discrepancies</div><div class="muted">' + escapeHtml(summary.discrepancies || 0) + '</div></div>' +
              '</div>';

            if (results.length === 0) {
              rowsEl.innerHTML = '<tr><td colspan="5" class="muted">No results.</td></tr>';
              return;
            }

            rowsEl.innerHTML = results.map((r) => {
              const diff = Number(r.difference || 0);
              const sign = diff >= 0 ? '+' : '';
              return '' +
                '<tr>' +
                '  <td>' + escapeHtml(r.username || r.user_id) + '</td>' +
                '  <td>' + escapeHtml(r.stored_count) + '</td>' +
                '  <td>' + escapeHtml(r.indexed_count) + '</td>' +
                '  <td>' + sign + escapeHtml(diff) + '</td>' +
                '  <td>' + escapeHtml(r.updated_at || '') + '</td>' +
                '</tr>';
            }).join('');
          } catch (e) {
            if (e && e.status === 401) showErr('Session expired. Please log in again.');
            else showErr(e && e.message ? e.message : 'Failed to load results');
            sumEl.innerHTML = '';
            rowsEl.innerHTML = '';
          }
        }

        document.querySelectorAll('button[data-tab]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const name = btn.getAttribute('data-tab');
            setActiveTab(name);
            if (name === 'results') loadResults();
          });
        });

        document.getElementById('checkUserBtn').addEventListener('click', checkUser);
        document.getElementById('checkMessageBtn').addEventListener('click', checkMessage);

        setActiveTab('user');
      })();
    </script>
  `;

  return generate({
    title: "JepsenCloud Panel — Verification Dashboard",
    botKey: bot.key,
    botName: bot.name,
    currentPage: "",
    PANEL_BASE,
    head: "",
    body,
    scripts,
  });
}

module.exports = {
  generateVerificationSelectPage,
  generateVerificationDashboardPage,
};
