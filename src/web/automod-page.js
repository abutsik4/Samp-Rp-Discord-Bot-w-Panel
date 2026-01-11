// AutoMod Management Page

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateAutoModPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — AutoMod</title>
  <link rel="stylesheet" href="/shared.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <style>
    ${generateSidebarStyles()}
    
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
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'AutoMod',
      icon: '🛡️',
      botKey: bot.key,
      PANEL_BASE,
      currentPage: 'automod'
    })}

    <main class="main-scroll-container">
      <div class="scroll-progress">
        <div class="scroll-progress-bar" id="scrollProgressBar"></div>
      </div>

      <div data-scroll-container id="scrollContainer">
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
      </div>
    </main>
  </div>

  ${generateSidebarScripts()}

  <script>
    const botKey = '${bot.key}';
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
        const res = await fetch('/api/bot/' + botKey + '/automod');
        const data = await res.json();
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
      } catch (err) { showAlert('Failed to load banned words', 'warning'); }
    }

    async function removeWord(word) {
      if (!confirm('Remove "' + word + '" from banned words?')) return;
      try {
        const res = await fetch('/api/bot/' + botKey + '/automod/' + encodeURIComponent(word), { method: 'DELETE' });
        if (res.ok) { showAlert('Word removed', 'success'); loadBannedWords(); }
        else showAlert('Failed to remove word', 'warning');
      } catch (err) { showAlert('Error removing word', 'warning'); }
    }

    document.getElementById('addWordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const word = document.getElementById('wordInput').value.trim();
      const caseSensitive = document.getElementById('caseSensitive').checked;
      if (!word) return;
      try {
        const res = await fetch('/api/bot/' + botKey + '/automod', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, case_sensitive: caseSensitive })
        });
        if (res.ok) {
          showAlert('Word banned', 'success');
          document.getElementById('wordInput').value = '';
          document.getElementById('caseSensitive').checked = false;
          loadBannedWords();
        } else showAlert('Failed to ban word', 'warning');
      } catch (err) { showAlert('Error banning word', 'warning'); }
    });

    document.addEventListener('DOMContentLoaded', loadBannedWords);
  </script>
</body>
</html>`;
}

module.exports = { generateAutoModPage };
