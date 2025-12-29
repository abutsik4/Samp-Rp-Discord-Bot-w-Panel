// AutoMod Management Page
// Web panel for managing banned words

function generateAutoModPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — AutoMod</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-main);color:var(--text);line-height:1.6}
    .wrap{max-width:1200px;margin:0 auto;padding:20px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .title{font-weight:700;font-size:24px;display:flex;align-items:center;gap:8px}
    .title .gradient-text{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .title .emoji{font-size:28px}
    .subtitle{color:var(--text-muted);font-size:14px;margin-top:4px}
    .nav{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .nav a{color:var(--accent-cyan);text-decoration:none;font-size:14px;transition:color .2s}
    .nav a:hover{color:var(--accent-purple)}
    .btn{padding:10px 18px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:all .2s}
    .btn:hover{background:rgba(30,41,59,.9);border-color:var(--accent-purple)}
    .btn-primary{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));border:none;color:#fff;font-weight:600}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .btn-danger{background:var(--accent-rose);border:none;color:#fff}
    .btn-danger:hover{opacity:.9}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,.3);margin-bottom:20px}
    .card-title{font-size:18px;font-weight:600;margin-bottom:16px;color:var(--accent-purple);display:flex;align-items:center;gap:8px}
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .word-list{list-style:none}
    .word-item{background:rgba(244,63,94,.1);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;transition:all .2s}
    .word-item:hover{background:rgba(244,63,94,.15);border-color:var(--accent-rose)}
    .word-text{font-weight:500;font-family:'Courier New',monospace;font-size:15px}
    .word-badge{background:var(--accent-amber);color:#000;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-left:8px}
    .word-date{font-size:12px;color:var(--text-muted);margin-top:4px}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;font-size:13px;font-weight:500;margin-bottom:8px;color:var(--text)}
    .form-group input{width:100%;padding:10px 12px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:14px;font-family:inherit}
    .form-group input:focus{outline:none;border-color:var(--accent-purple);box-shadow:0 0 0 3px rgba(167,139,250,.1)}
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
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title"><span class="emoji">🛡️</span><span class="gradient-text">AutoMod - Banned Words</span></div>
        <div class="subtitle">Bot: ${bot.name} (${bot.key})</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button">← Back</button>
        <a href="${PANEL_BASE}/bot/${bot.key}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/stats">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/rate-limits">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/consecutive-limits">🚫 Consecutive</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/messages">📨 Messages</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/ai-engagement">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/commands">📚 Commands</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/accuracy">🎯 Accuracy</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/whitelist">📋 Whitelist</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/history">📜 History</a>
        <a href="${PANEL_BASE}/verification-dashboard?bot=${bot.key}">🔍 Verification</a>
        <form method="post" action="${PANEL_BASE}/logout" style="margin:0"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div id="alertContainer"></div>

    <div class="alert alert-warning">
      <strong>⚠️ Warning:</strong> Messages containing banned words will be automatically deleted. The user will receive a DM notification.
    </div>

    <div class="stat-box">
      <div class="stat-value" id="wordCount">-</div>
      <div class="stat-label">Banned Words</div>
    </div>

    <!-- Add Word -->
    <div class="card">
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

    <!-- Banned Words -->
    <div class="card">
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
  </div>

  <script>
    const botKey = '${bot.key}';
    const guildId = '${bot.guild_id}';

    async function loadBannedWords() {
      try {
        const res = await fetch(\`/api/bot/\${botKey}/automod\`);
        const data = await res.json();
        
        const container = document.getElementById('wordsContainer');
        const countEl = document.getElementById('wordCount');
        const clearBtn = document.getElementById('clearAllBtn');
        
        countEl.textContent = data.words.length;
        
        if (data.words.length === 0) {
          container.innerHTML = '<li class="empty-state"><div class="empty-state-icon">✅</div><div>No banned words. All messages are allowed.</div></li>';
          clearBtn.style.display = 'none';
          return;
        }
        
        clearBtn.style.display = 'inline-block';
        container.innerHTML = '';
        
        data.words.forEach(w => {
          const li = document.createElement('li');
          li.className = 'word-item';
          li.innerHTML = \`
            <div>
              <div>
                <span class="word-text">\${escapeHtml(w.word)}</span>
                \${w.case_sensitive ? '<span class="word-badge">CASE SENSITIVE</span>' : ''}
              </div>
              <div class="word-date">Added: \${new Date(w.added_at).toLocaleString()}</div>
            </div>
            <button class="btn btn-danger" onclick="removeWord('\${escapeHtml(w.word)}')">Remove</button>
          \`;
          container.appendChild(li);
        });
      } catch (err) {
        console.error('Failed to load banned words:', err);
        showAlert('Failed to load banned words', 'warning');
      }
    }

    async function removeWord(word) {
      if (!confirm(\`Remove "\${word}" from banned words?\`)) return;
      
      try {
        const res = await fetch(\`/api/bot/\${botKey}/automod/\${encodeURIComponent(word)}\`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          showAlert('Word removed from ban list', 'success');
          loadBannedWords();
        } else {
          showAlert('Failed to remove word', 'warning');
        }
      } catch (err) {
        console.error('Failed to remove word:', err);
        showAlert('Error removing word', 'warning');
      }
    }

    document.getElementById('addWordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const word = document.getElementById('wordInput').value.trim();
      const caseSensitive = document.getElementById('caseSensitive').checked;
      
      if (!word) return;
      
      try {
        const res = await fetch(\`/api/bot/\${botKey}/automod\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word, case_sensitive: caseSensitive })
        });
        
        if (res.ok) {
          showAlert('Word added to ban list', 'success');
          document.getElementById('addWordForm').reset();
          loadBannedWords();
        } else {
          showAlert('Failed to add word', 'warning');
        }
      } catch (err) {
        console.error('Failed to add word:', err);
        showAlert('Error adding word', 'warning');
      }
    });

    document.getElementById('clearAllBtn').addEventListener('click', async () => {
      if (!confirm('Clear all banned words? This will allow all messages.')) return;
      
      try {
        const res = await fetch(\`/api/bot/\${botKey}/automod\`, {
          method: 'DELETE'
        });
        
        if (res.ok) {
          showAlert('All banned words cleared', 'success');
          loadBannedWords();
        } else {
          showAlert('Failed to clear banned words', 'warning');
        }
      } catch (err) {
        console.error('Failed to clear banned words:', err);
        showAlert('Error clearing banned words', 'warning');
      }
    });

    function showAlert(message, type = 'info') {
      const container = document.getElementById('alertContainer');
      const alert = document.createElement('div');
      alert.className = \`alert alert-\${type}\`;
      alert.textContent = message;
      container.appendChild(alert);
      setTimeout(() => alert.remove(), 5000);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    loadBannedWords();
  </script>
</body>
</html>`;
}

module.exports = { generateAutoModPage };
