// Panel Debug Reports Viewer
// Lists and inspects reports submitted from the Ctrl+Alt+D debug overlay

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateDebugReportsPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Debug Reports</title>
  <link rel="stylesheet" href="/shared.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <style>
    ${generateSidebarStyles()}

    .grid{display:grid;grid-template-columns:1fr;gap:16px}
    @media(min-width: 1100px){.grid{grid-template-columns: 420px 1fr}}
    .toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:end}
    .muted{color:var(--text-muted);font-size:12px}
    .list{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden}
    .row{padding:12px 14px;border-top:1px solid var(--border);cursor:pointer;transition:background var(--transition-base)}
    .row:first-child{border-top:none}
    .row:hover{background:color-mix(in srgb, var(--accent-purple) 7%, transparent)}
    .row.active{background:color-mix(in srgb, var(--accent-purple) 12%, transparent)}
    .row-title{font-weight:600;color:var(--text);font-size:13px;display:flex;gap:8px;align-items:center}
    .row-meta{margin-top:4px;display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--text-muted)}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);background:color-mix(in srgb, var(--accent-cyan) 8%, transparent)}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
    pre{margin:0;background:color-mix(in srgb, var(--bg-card) 75%, black);border:1px solid color-mix(in srgb, var(--border) 70%, transparent);border-radius:var(--radius-lg);padding:14px;overflow:auto;max-height:70vh;color:var(--text);font-size:12px;line-height:1.4}
    .empty,.loading,.error{padding:18px;color:var(--text-muted)}
    .error{color:var(--accent-rose)}
    .pager{display:flex;gap:10px;align-items:center;justify-content:center;margin-top:12px;color:var(--text-muted);font-size:12px}
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'Debug Reports',
      icon: '🪲',
      botKey: bot.key,
      PANEL_BASE,
      currentPage: 'debug-reports'
    })}

    <main class="main-scroll-container">
      <div class="scroll-progress"><div class="scroll-progress-bar" id="scrollProgressBar"></div></div>
      <div data-scroll-container id="scrollContainer">
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🪲</span> Debug Reports</h1>
            <p class="section-subtitle">Reports submitted from the panel debug overlay (Ctrl+Alt+D → Send report)</p>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="toolbar">
              <div class="form-group mb-0" style="flex:1;min-width:240px">
                <label for="search">Search</label>
                <input id="search" type="text" placeholder="Filter by URL, user, trace…" />
                <div class="muted">Search matches URL / username / trace IDs</div>
              </div>
              <div class="form-group mb-0" style="width:140px">
                <label for="limit">Limit</label>
                <select id="limit">
                  <option value="25">25</option>
                  <option value="50" selected>50</option>
                  <option value="100">100</option>
                </select>
              </div>
              <button class="btn btn-primary" id="refresh">🔄 Refresh</button>
            </div>

            <div id="topError" class="error" style="display:none"></div>

            <div class="grid" style="margin-top:14px">
              <div>
                <div class="list" id="list">
                  <div id="listLoading" class="loading">Loading reports…</div>
                </div>

                <div class="pager" id="pager" style="display:none">
                  <button class="btn btn-secondary" id="prev">← Prev</button>
                  <span id="pageInfo"></span>
                  <button class="btn btn-secondary" id="next">Next →</button>
                </div>
              </div>
              <div>
                <div class="muted" style="margin-bottom:8px">Selected report</div>
                <pre id="details">Select a report from the left.</pre>
                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
                  <button class="btn btn-secondary" id="copyJson">Copy JSON</button>
                  <button class="btn btn-secondary" id="copyServerTrace">Copy Server Trace</button>
                  <button class="btn btn-secondary" id="copyClientTrace">Copy Client Trace</button>
                  <button class="btn btn-secondary" id="openUrl">Open URL</button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>

  ${generateSidebarScripts()}

  <script>
    const PANEL_BASE = '${PANEL_BASE}';
    let selectedId = null;
    let selectedMeta = null;
    let currentOffset = 0;
    let lastPagination = { offset: 0, limit: 50, total: 0 };

    function escapeHtml(text) {
      return String(text || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#039;"})[m]);
    }

    async function loadList() {
      const list = document.getElementById('list');
      const topError = document.getElementById('topError');
      const search = document.getElementById('search').value.trim();
      const limit = document.getElementById('limit').value;
      const pager = document.getElementById('pager');
      const pageInfo = document.getElementById('pageInfo');
      const prevBtn = document.getElementById('prev');
      const nextBtn = document.getElementById('next');

      topError.style.display = 'none';
      list.innerHTML = '<div id="listLoading" class="loading">Loading reports…</div>';
      pager.style.display = 'none';

      try {
        const qs = new URLSearchParams({ limit, offset: String(currentOffset), search });
        const res = await fetch(PANEL_BASE + '/api/debug/reports?' + qs.toString());
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load');

        const rows = data.reports || [];
        lastPagination = data.pagination || { offset: currentOffset, limit: Number(limit), total: rows.length };

        if (!rows.length) {
          list.innerHTML = '<div class="empty">No reports yet.</div>';
          return;
        }

        list.innerHTML = rows.map(r => {
          const active = String(r.id) === String(selectedId) ? ' active' : '';
          const who = r.updated_by || 'unknown';
          const when = r.created_at || '';
          const url = r.url || '';
          const serverTrace = r.server_trace_id || '';
          const clientTrace = r.client_trace_id || '';

          return '<div class="row' + active + '" data-id="' + r.id + '" data-url="' + escapeHtml(url) + '">' +
            '<div class="row-title">' +
              '<span class="pill"><span class="mono">#' + r.id + '</span></span>' +
              '<span class="mono">' + escapeHtml(who) + '</span>' +
            '</div>' +
            '<div class="row-meta">' +
              '<span>' + escapeHtml(when) + '</span>' +
              (serverTrace ? '<span class="pill"><span class="mono">srv</span> ' + escapeHtml(serverTrace) + '</span>' : '') +
              (clientTrace ? '<span class="pill"><span class="mono">cli</span> ' + escapeHtml(clientTrace) + '</span>' : '') +
            '</div>' +
            (url ? '<div class="row-meta" style="margin-top:6px"><span class="mono">' + escapeHtml(url) + '</span></div>' : '') +
          '</div>';
        }).join('');

        for (const el of Array.from(list.querySelectorAll('.row'))) {
          el.addEventListener('click', async () => {
            selectedId = el.getAttribute('data-id');
            await loadDetails(selectedId);
            await loadList();
          });
        }

        // pager
        const total = Number(lastPagination.total || 0);
        const lim = Number(lastPagination.limit || limit);
        const off = Number(lastPagination.offset || currentOffset);
        const start = total ? Math.min(off + 1, total) : 0;
        const end = total ? Math.min(off + rows.length, total) : 0;
        pageInfo.textContent = total ? ('Showing ' + start + '-' + end + ' of ' + total) : '';
        prevBtn.disabled = off <= 0;
        nextBtn.disabled = (off + lim) >= total;
        pager.style.display = total > lim ? 'flex' : 'none';
      } catch (e) {
        topError.textContent = '❌ ' + (e && e.message ? e.message : String(e));
        topError.style.display = 'block';
        list.innerHTML = '<div class="empty">Failed to load reports.</div>';
      }
    }

    async function loadDetails(id) {
      const pre = document.getElementById('details');
      const topError = document.getElementById('topError');
      topError.style.display = 'none';
      pre.textContent = 'Loading…';
      selectedMeta = null;

      try {
        const res = await fetch(PANEL_BASE + '/api/debug/reports/' + encodeURIComponent(id));
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load report');
        selectedMeta = data.report || null;
        pre.textContent = JSON.stringify(data.report, null, 2);
      } catch (e) {
        topError.textContent = '❌ ' + (e && e.message ? e.message : String(e));
        topError.style.display = 'block';
        pre.textContent = 'Failed to load.';
      }
    }

    document.getElementById('refresh').addEventListener('click', loadList);
    document.getElementById('search').addEventListener('input', () => {
      // light debounce
      clearTimeout(window.__dbgListTimer);
      currentOffset = 0;
      window.__dbgListTimer = setTimeout(loadList, 250);
    });
    document.getElementById('limit').addEventListener('change', loadList);

    document.getElementById('prev').addEventListener('click', () => {
      currentOffset = Math.max(0, currentOffset - Number(lastPagination.limit || 50));
      loadList();
    });

    document.getElementById('next').addEventListener('click', () => {
      currentOffset = currentOffset + Number(lastPagination.limit || 50);
      loadList();
    });

    document.getElementById('copyJson').addEventListener('click', async () => {
      try {
        const txt = document.getElementById('details').textContent || '';
        await navigator.clipboard.writeText(txt);
      } catch (_) {
        alert('Copy failed');
      }
    });

    document.getElementById('copyServerTrace').addEventListener('click', async () => {
      const t = selectedMeta?.server_trace_id || selectedMeta?.serverTraceId || '';
      if (!t) return alert('No server trace id');
      try { await navigator.clipboard.writeText(String(t)); } catch (_) { alert('Copy failed'); }
    });

    document.getElementById('copyClientTrace').addEventListener('click', async () => {
      const t = selectedMeta?.client_trace_id || selectedMeta?.clientTraceId || selectedMeta?.data?.clientTraceId || '';
      if (!t) return alert('No client trace id');
      try { await navigator.clipboard.writeText(String(t)); } catch (_) { alert('Copy failed'); }
    });

    document.getElementById('openUrl').addEventListener('click', () => {
      try {
        const obj = selectedMeta;
        const url = obj?.url || obj?.data?.url;
        if (!url) return alert('No URL');
        window.open(url, '_blank', 'noopener');
      } catch (_) {
        alert('No URL');
      }
    });

    document.addEventListener('DOMContentLoaded', loadList);
  </script>
</body>
</html>`;
}

module.exports = { generateDebugReportsPage };
