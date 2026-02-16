// Commands Documentation Page

const { generate } = require('./shared-template');

function generateCommandsPage(bot, PANEL_BASE, disabledCommands = []) {
  const disabledSet = new Set(disabledCommands.map(d => d.command_name));
  
  function commandCard(name, desc, usage, category = 'user', badge = '') {
    const isDisabled = disabledSet.has(name);
    const badgeHtml = badge ? '<span class="badge badge-' + badge.toLowerCase() + '">' + badge + '</span>' : '';
    return '<div class="command-card ' + (isDisabled ? 'command-disabled' : '') + '" data-command="' + name + '"><div class="command-header"><div class="command-info"><div class="command-name">/' + name + ' ' + badgeHtml + '</div><div class="command-desc">' + desc + '</div>' + (usage ? '<div class="command-usage">Usage: ' + usage + '</div>' : '') + '</div><label class="toggle-switch"><input type="checkbox" ' + (isDisabled ? '' : 'checked') + ' data-command="' + name + '" onchange="toggleCommand(this)"><span class="toggle-slider"></span></label></div></div>';
  }

  const head = `
    .commands-grid{display:grid;gap:12px}
    .category-section{margin-bottom:24px}
    .category-title{font-size:16px;font-weight:600;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px}
    .command-card{background:var(--bg-card);border:1px solid var(--border);border-radius:10px;padding:16px;transition:all .2s}
    .command-card:hover{border-color:var(--accent-purple)}
    .command-card.command-disabled{opacity:.5}
    .command-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .command-info{flex:1}
    .command-name{font-weight:600;font-size:15px;color:var(--accent-cyan);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .command-desc{font-size:13px;color:var(--text-muted);margin-top:4px}
    .command-usage{font-size:12px;color:var(--text-muted);margin-top:6px;font-family:monospace;background:var(--input-bg);padding:4px 8px;border-radius:4px;display:inline-block}
    .badge{font-size:10px;padding:2px 6px;border-radius:4px;text-transform:uppercase;font-weight:600}
    .badge-admin{background:rgba(248,113,113,.2);color:#f87171}
    .badge-new{background:rgba(74,222,128,.2);color:var(--accent-green)}
    .toggle-switch{position:relative;display:inline-block;width:48px;height:24px;flex-shrink:0}
    .toggle-switch input{opacity:0;width:0;height:0}
    .toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--border);border-radius:24px;transition:all .3s}
    .toggle-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:all .3s}
    .toggle-switch input:checked+.toggle-slider{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan))}
    .toggle-switch input:checked+.toggle-slider:before{transform:translateX(24px)}
    .search-box{margin-bottom:20px}
    .search-box input{width:100%;padding:12px 16px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:14px}
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-success{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);color:var(--accent-green)}
    .alert-error{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:#f87171}
    .muted{color:var(--text-muted);font-size:12.5px}
    .empty{text-align:center;padding:60px 20px;color:var(--text-muted)}
  `;

  const body = `
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>⚡</span> Bot Commands</h1>
            <p class="section-subtitle">Enable or disable slash commands</p>
          </div>

          <div id="alertContainer"></div>

          <div class="search-box" data-scroll data-scroll-class="is-inview">
            <input type="text" id="searchInput" placeholder="Search commands..." oninput="filterCommands(this.value)">
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="muted" id="commandsLoading" style="margin-bottom:12px">Loading commands from Discord…</div>
            <div id="commandsRoot"></div>
          </div>
        </section>
  `;

  const scripts = `
  <script>
    const botKey = '${bot.key}';
    const apiBase = '${PANEL_BASE}';

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function buildUsage(cmd) {
      try {
        const opts = Array.isArray(cmd.options) ? cmd.options : [];
        if (!opts.length) return '';
        const parts = opts.map(o => {
          const name = o && o.name ? o.name : 'option';
          const required = !!(o && o.required);
          return required ? '<' + name + '>' : '[' + name + ']';
        });
        return '/' + cmd.name + ' ' + parts.join(' ');
      } catch {
        return '';
      }
    }

    function commandCardFromApi(cmd) {
      const isDisabled = !cmd.enabled;
      const badge = cmd.category === 'admin' ? 'Admin' : '';
      const badgeHtml = badge ? '<span class="badge badge-admin">' + badge + '</span>' : '';
      const usage = buildUsage(cmd);
      return '<div class="command-card ' + (isDisabled ? 'command-disabled' : '') + '" data-command="' + escapeHtml(cmd.name) + '">' +
        '<div class="command-header">' +
          '<div class="command-info">' +
            '<div class="command-name">/' + escapeHtml(cmd.name) + ' ' + badgeHtml + '</div>' +
            '<div class="command-desc">' + escapeHtml(cmd.description || '') + '</div>' +
            (usage ? '<div class="command-usage">Usage: ' + escapeHtml(usage) + '</div>' : '') +
          '</div>' +
          '<label class="toggle-switch">' +
            '<input type="checkbox" ' + (isDisabled ? '' : 'checked') + ' data-command="' + escapeHtml(cmd.name) + '" onchange="toggleCommand(this)">' +
            '<span class="toggle-slider"></span>' +
          '</label>' +
        '</div>' +
      '</div>';
    }

    function renderCommands(commands) {
      const loading = document.getElementById('commandsLoading');
      if (loading) loading.style.display = 'none';
      const root = document.getElementById('commandsRoot');
      if (!root) return;

      const byCat = { user: [], admin: [], other: [] };
      (commands || []).forEach(c => {
        const cat = c.category === 'admin' ? 'admin' : (c.category === 'user' ? 'user' : 'other');
        byCat[cat].push(c);
      });
      byCat.user.sort((a,b) => a.name.localeCompare(b.name));
      byCat.admin.sort((a,b) => a.name.localeCompare(b.name));
      byCat.other.sort((a,b) => a.name.localeCompare(b.name));

      let html = '';
      if (byCat.user.length) {
        html += '<div class="category-section"><div class="category-title">👥 User Commands</div><div class="commands-grid">' + byCat.user.map(commandCardFromApi).join('') + '</div></div>';
      }
      if (byCat.admin.length) {
        html += '<div class="category-section"><div class="category-title">🛡️ Admin Commands</div><div class="commands-grid">' + byCat.admin.map(commandCardFromApi).join('') + '</div></div>';
      }
      if (byCat.other.length) {
        html += '<div class="category-section"><div class="category-title">🧩 Other</div><div class="commands-grid">' + byCat.other.map(commandCardFromApi).join('') + '</div></div>';
      }

      root.innerHTML = html || '<div class="empty">No commands found.</div>';

      if (window.requestLocoUpdate) window.requestLocoUpdate();
      else if (window.__locoScroll && window.__locoScroll.update) window.__locoScroll.update();
    }

    function showAlert(msg, type = 'success') {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 3000);
    }

    async function toggleCommand(el) {
      const cmd = el.dataset.command;
      const enabled = el.checked;
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/commands/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commandName: cmd, enabled })
        });
        if (!res.ok) throw new Error('Failed');
        showAlert(cmd + ' ' + (enabled ? 'enabled' : 'disabled'), 'success');
        el.closest('.command-card').classList.toggle('command-disabled', !enabled);
      } catch (e) {
        el.checked = !enabled;
        showAlert('Failed to update ' + cmd, 'error');
      }
    }

    function filterCommands(q) {
      q = q.toLowerCase();
      document.querySelectorAll('.command-card').forEach(card => {
        const name = card.dataset.command.toLowerCase();
        const desc = card.querySelector('.command-desc').textContent.toLowerCase();
        card.style.display = (name.includes(q) || desc.includes(q)) ? '' : 'none';
      });
    }

    async function loadCommands() {
      try {
        const res = await fetch(apiBase + '/api/' + botKey + '/commands');
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
        renderCommands((data && data.commands) || []);
      } catch (e) {
        const loading = document.getElementById('commandsLoading');
        if (loading) loading.style.display = 'none';
        showAlert('Failed to load commands: ' + e.message, 'error');
        const root = document.getElementById('commandsRoot');
        if (root) root.innerHTML = '<div class="empty">Failed to load commands.</div>';

        if (window.requestLocoUpdate) window.requestLocoUpdate();
        else if (window.__locoScroll && window.__locoScroll.update) window.__locoScroll.update();
      }
    }

    document.addEventListener('DOMContentLoaded', loadCommands);
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel - Bot Commands',
    currentPage: 'commands'
  });
}

module.exports = { generateCommandsPage };
