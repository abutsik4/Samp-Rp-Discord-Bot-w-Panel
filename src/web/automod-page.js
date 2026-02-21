// AutoMod Management Page

const { generate } = require('./shared-template');

function generateAutoModPage(bot, PANEL_BASE) {
  const head = `
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .word-list{list-style:none}
    .word-item{background:rgba(244,63,94,.1);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;transition:all .2s}
    .word-item:hover{background:rgba(244,63,94,.15);border-color:var(--accent-rose)}
    .word-text{font-weight:500;font-family:'Courier New',monospace;font-size:15px}
    .word-badge{background:var(--accent-amber);color:#000;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-left:8px}
    .word-date{font-size:12px;color:var(--text-muted);margin-top:4px}
    .checkbox-group{display:flex;align-items:center;gap:8px}
    .checkbox-group input[type=checkbox]{width:auto}
    .empty-state{text-align:center;padding:40px;color:var(--text-muted)}
    .empty-state-icon{font-size:48px;margin-bottom:16px}
    .stat-box{background:linear-gradient(135deg,rgba(244,63,94,.1),rgba(251,191,36,.1));border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center;margin-bottom:20px}
    .stat-value{font-size:36px;font-weight:700;background:linear-gradient(135deg,var(--accent-rose),var(--accent-amber));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:13px;color:var(--text-muted);margin-top:8px}
  `;

  const body = `
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🛡️</span> AutoMod - Banned Words</h1>
            <p class="section-subtitle">Manage automatically filtered content</p>
          </div>

          <div id="alertContainer"></div>

          <div class="alert alert-warning" data-scroll data-scroll-class="is-inview">
            <strong>⚠️ Warning:</strong> Messages containing banned words will be automatically deleted. The user will receive a DM notification.
          </div>

          <div class="stat-box" data-scroll data-scroll-class="is-inview">
            <div class="stat-value" id="wordCount">-</div>
            <div class="stat-label">Banned Words</div>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title">➕ Add Banned Word</div>
            <form id="addWordForm">
              <div class="form-group">
                <label for="wordInput">Word or Phrase</label>
                <input type="text" id="wordInput" placeholder="Enter word to ban..." required />
              </div>
              <div class="form-group checkbox-group">
                <input type="checkbox" id="caseSensitive" />
                <label for="caseSensitive" style="margin:0">Case Sensitive (Aa != aa)</label>
              </div>
              <button type="submit" class="btn btn-primary">Ban Word</button>
            </form>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
              <span>🚫 Banned Words</span>
              <button id="clearAllBtn" class="btn btn-danger" style="display:none">Clear All</button>
            </div>
            <ul class="word-list" id="wordsContainer">
              <li class="empty-state">
                <div class="empty-state-icon">⏳</div>
                <div>Loading...</div>
              </li>
            </ul>
          </div>
        </section>
  `;

  const scripts = `
  <script>
    const botKey = '${bot.key}';
    const apiBase = '${PANEL_BASE}/api/' + botKey;
    function escapeHtml(str) { return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function showAlert(msg, type) {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 3000);
    }

    async function loadBannedWords() {
      try {
        const data = await window.panelFetchJson(apiBase + '/automod');
        const container = document.getElementById('wordsContainer');
        document.getElementById('wordCount').textContent = data.words.length;
        const clearBtn = document.getElementById('clearAllBtn');
        if (data.words.length === 0) {
          container.innerHTML = '<li class="empty-state"><div class="empty-state-icon">✅</div><div>No banned words.</div></li>';
          clearBtn.style.display = 'none';
          return;
        }
        clearBtn.style.display = 'inline-block';
        container.innerHTML = '';
        data.words.forEach(w => {
          const li = document.createElement('li');
          li.className = 'word-item';
          li.innerHTML = '<div><div><span class="word-text">' + escapeHtml(w.word) + '</span>' + (w.case_sensitive ? '<span class="word-badge">CASE SENSITIVE</span>' : '') + '</div><div class="word-date">Added: ' + new Date(w.added_at).toLocaleString() + '</div></div><button class="btn btn-danger" onclick="removeWord(\\'' + escapeHtml(w.word).replace(/'/g,"\\\\'") + '\\')">Remove</button>';
          container.appendChild(li);
        });
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Failed to load banned words', 'warning');
      }
    }

    async function removeWord(word) {
      if (!confirm('Remove "' + word + '" from banned words?')) return;
      try {
        await window.panelFetchJson(apiBase + '/automod/' + encodeURIComponent(word), { method: 'DELETE' });
        showAlert('Word removed', 'success');
        loadBannedWords();
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Error removing word', 'warning');
      }
    }

    document.getElementById('addWordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const word = document.getElementById('wordInput').value.trim();
      const caseSensitive = document.getElementById('caseSensitive').checked;
      if (!word) return;
      try {
        await window.panelFetchJson(apiBase + '/automod', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, case_sensitive: caseSensitive })
        });
        showAlert('Word banned', 'success');
        document.getElementById('wordInput').value = '';
        document.getElementById('caseSensitive').checked = false;
        loadBannedWords();
      } catch (err) {
        if (err && err.status === 401) showAlert('Session expired. Please log in again.', 'warning');
        else showAlert('Error banning word', 'warning');
      }
    });

    document.addEventListener('DOMContentLoaded', loadBannedWords);
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel — AutoMod',
    currentPage: 'automod',
    PANEL_BASE,
  });
}

module.exports = { generateAutoModPage };
