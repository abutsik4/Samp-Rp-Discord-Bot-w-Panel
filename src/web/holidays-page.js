"use strict";

const { generate } = require("./shared-template");

function generateHolidaysPage(bot, PANEL_BASE) {
  const head = `
    .form-row{display:grid;grid-template-columns:180px 1fr 1fr;gap:12px}
    @media(max-width: 900px){.form-row{grid-template-columns:1fr}}
    .status-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px}
    .status-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid var(--border);background:rgba(0,0,0,.15);color:var(--text-muted);font-size:13px}
    .status-chip strong{color:var(--text)}
  `;

  const body = `
    <div class="page-container">
      <div class="topbar">
        <div class="topbar-content">
          <div class="page-title"><span class="emoji">🎉</span><span class="gradient-text">Holidays</span></div>
          <div class="page-subtitle">Bot: ${bot.name} (${bot.key})</div>
        </div>
        <div class="topbar-actions">
          <a class="btn btn-secondary" href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}">← Back</a>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Add manual holiday</div>

        <div class="form-row">
          <div class="form-group">
            <label>Date</label>
            <input id="holidayDate" type="date" />
          </div>
          <div class="form-group">
            <label>Title</label>
            <input id="holidayTitle" placeholder="For example: День модератора" />
          </div>
          <div class="form-group">
            <label>Note (optional)</label>
            <input id="holidayNote" placeholder="Panel-only note" />
          </div>
        </div>

        <div class="status-row">
          <button class="btn btn-primary" id="addHolidayBtn" type="button">Add holiday</button>
          <span class="status-chip" id="statusChip">Status: <strong id="statusText">Ready</strong></span>
        </div>

        <div class="alert alert-error" id="holidayError" style="display:none;margin-top:16px"></div>

        <div style="height:16px"></div>

        <div class="card-title">Holidays for selected date</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th style="width:90px">ID</th>
                <th>Title</th>
                <th style="width:260px">Note</th>
                <th style="width:210px">Created</th>
                <th style="width:130px"></th>
              </tr>
            </thead>
            <tbody id="holidayRows"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  const scripts = `
    <script>
      (function(){
        const PANEL_BASE = ${JSON.stringify(PANEL_BASE)};
        const botKey = ${JSON.stringify(bot.key)};

        const dateEl = document.getElementById('holidayDate');
        const titleEl = document.getElementById('holidayTitle');
        const noteEl = document.getElementById('holidayNote');
        const rowsEl = document.getElementById('holidayRows');
        const statusTextEl = document.getElementById('statusText');
        const errEl = document.getElementById('holidayError');
        const addBtn = document.getElementById('addHolidayBtn');

        function todayISO(){
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth()+1).padStart(2,'0');
          const da = String(d.getDate()).padStart(2,'0');
          return y+'-'+m+'-'+da;
        }

        function setStatus(t){ statusTextEl.textContent = String(t || ''); }
        function showErr(t){ errEl.style.display = 'block'; errEl.textContent = String(t || ''); }
        function clearErr(){ errEl.style.display = 'none'; errEl.textContent = ''; }

        function escapeHtml(str){
          return String(str || '')
            .replaceAll('&','&amp;')
            .replaceAll('<','&lt;')
            .replaceAll('>','&gt;')
            .replaceAll('"','&quot;')
            .replaceAll("'",'&#039;');
        }

        function render(items){
          rowsEl.innerHTML = '';
          if (!Array.isArray(items) || items.length === 0) {
            rowsEl.innerHTML = '<tr><td colspan="5" class="muted">No manual holidays for this date.</td></tr>';
            return;
          }

          for (const it of items) {
            const tr = document.createElement('tr');
            tr.innerHTML = '' +
              '<td>#' + escapeHtml(it.id) + '</td>' +
              '<td>' + escapeHtml(it.title) + '</td>' +
              '<td class="muted">' + escapeHtml(it.note) + '</td>' +
              '<td class="muted">' + escapeHtml(it.created_at) + '</td>' +
              '<td><button class="btn btn-sm btn-danger" data-del="' + escapeHtml(it.id) + '">Delete</button></td>';
            rowsEl.appendChild(tr);
          }
        }

        async function load(){
          clearErr();
          setStatus('Loading...');
          const date = dateEl.value || todayISO();

          try {
            const data = await window.panelFetchJson(
              PANEL_BASE + '/api/' + encodeURIComponent(botKey) + '/holidays?date=' + encodeURIComponent(date)
            );
            render(data && data.items ? data.items : []);
            setStatus('Loaded: ' + (data && data.items ? data.items.length : 0));
          } catch (e) {
            if (e && e.status === 401) {
              showErr('Session expired. Please log in again.');
            } else {
              showErr((e && e.message) ? e.message : 'Failed to load');
            }
            setStatus('Error');
          }
        }

        async function addHoliday(){
          clearErr();
          const date = String(dateEl.value || '').trim();
          const title = String(titleEl.value || '').trim();
          const note = String(noteEl.value || '').trim();

          if (!date) return showErr('Please pick a date.');
          if (!title) return showErr('Title is required.');

          try {
            setStatus('Saving...');
            const data = await window.panelFetchJson(
              PANEL_BASE + '/api/' + encodeURIComponent(botKey) + '/holidays',
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, title, note })
              }
            );
            titleEl.value = '';
            noteEl.value = '';
            render(data && data.items ? data.items : []);
            setStatus('Saved');
          } catch (e) {
            if (e && e.status === 401) {
              showErr('Session expired. Please log in again.');
            } else {
              showErr((e && e.message) ? e.message : 'Failed to save');
            }
            setStatus('Error');
          }
        }

        async function deleteHoliday(id){
          clearErr();
          if (!confirm('Delete holiday #' + id + '?')) return;

          try {
            setStatus('Deleting...');
            await window.panelFetchJson(
              PANEL_BASE + '/api/' + encodeURIComponent(botKey) + '/holidays/' + encodeURIComponent(id),
              { method: 'DELETE' }
            );
            await load();
            setStatus('Deleted');
          } catch (e) {
            if (e && e.status === 401) {
              showErr('Session expired. Please log in again.');
            } else {
              showErr((e && e.message) ? e.message : 'Failed to delete');
            }
            setStatus('Error');
          }
        }

        dateEl.value = todayISO();
        dateEl.addEventListener('change', load);
        addBtn.addEventListener('click', addHoliday);
        rowsEl.addEventListener('click', (ev) => {
          const btn = ev.target.closest('button[data-del]');
          if (!btn) return;
          const id = btn.getAttribute('data-del');
          if (!id) return;
          deleteHoliday(id);
        });

        document.addEventListener('DOMContentLoaded', load);
      })();
    </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: `JepsenCloud Panel — Holidays`,
    currentPage: "holidays",
    PANEL_BASE,
  });
}

module.exports = { generateHolidaysPage };
