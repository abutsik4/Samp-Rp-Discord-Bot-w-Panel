// Message/Embed Management Page HTML Template
// This generates the full HTML for the message composer and library

function generateMessagesPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Messages</title>
  <link rel="stylesheet" href="/shared.css" />
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg-main);color:var(--text);line-height:1.6}
    .wrap{max-width:1400px;margin:0 auto;padding:20px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .title{font-weight:700;font-size:24px;display:flex;align-items:center;gap:8px}
    .title .gradient-text{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .title .emoji{font-size:28px}
    .muted{color:var(--text-muted);font-size:13px;margin-top:4px}
    .nav{display:flex;gap:12px;align-items:center}
    .nav a{color:var(--accent-cyan);text-decoration:none;font-size:14px;transition:color .2s}
    .nav a:hover{color:var(--accent-purple)}
    .btn{padding:10px 18px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:14px;font-weight:500;transition:all .2s}
    .btn:hover{background:rgba(30,41,59,.9);border-color:var(--accent-purple)}
    .btn-primary{background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));border:none;color:#fff;font-weight:600}
    .btn-primary:hover{opacity:.9;transform:translateY(-1px)}
    .btn-danger{background:var(--accent-rose);border:none;color:#fff}
    .btn-danger:hover{opacity:.9}
    .grid{display:grid;grid-template-columns:1fr 450px;gap:20px;margin-bottom:20px}
    @media(max-width:1100px){.grid{grid-template-columns:1fr}}
    .card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3)}
    .card-title{font-size:16px;font-weight:600;margin-bottom:16px;color:var(--accent-purple)}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:var(--text-muted)}
    .form-group input,.form-group select,.form-group textarea{width:100%;padding:10px 12px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:14px;font-family:inherit}
    .form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:var(--accent-purple);box-shadow:0 0 0 3px rgba(167,139,250,.1)}
    .form-group textarea{resize:vertical;min-height:80px;font-family:monospace}
    .color-input{display:flex;gap:10px;align-items:center}
    .color-input input[type=color]{width:50px;height:40px;border-radius:6px;border:none;cursor:pointer}
    .color-input input[type=text]{flex:1}
    .preview{background:linear-gradient(135deg,rgba(30,41,59,.6),rgba(17,24,39,.6));border-radius:8px;padding:16px;border:1px solid var(--border)}
    .preview-embed{background:rgba(17,24,39,.95);border-left:4px solid var(--accent-cyan);border-radius:4px;padding:14px;max-width:500px}
    .preview-embed-title{font-size:15px;font-weight:600;margin-bottom:6px}
    .preview-embed-desc{font-size:13px;color:var(--text-muted);white-space:pre-wrap;margin-bottom:8px}
    .preview-embed-footer{font-size:11px;color:var(--text-muted);margin-top:10px}
    .preview-embed-image{max-width:100%;border-radius:6px;margin-top:10px}
    .library{margin-top:20px}
    .filter-bar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
    .filter-bar select,.filter-bar input{padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:13px}
    .message-item{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;transition:all .2s;cursor:pointer}
    .message-item:hover{border-color:var(--accent-purple);box-shadow:0 4px 12px rgba(167,139,250,.1)}
    .message-item-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:8px}
    .message-item-title{font-weight:600;font-size:14px;color:var(--accent-cyan)}
    .message-item-meta{font-size:12px;color:var(--text-muted)}
    .message-item-desc{font-size:13px;color:var(--text-muted);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .message-item-actions{display:flex;gap:8px}
    .message-item-actions button{font-size:12px;padding:6px 12px}
    .file-upload{position:relative;overflow:hidden;display:inline-block;width:100%}
    .file-upload input[type=file]{position:absolute;left:0;top:0;opacity:0;width:100%;height:100%;cursor:pointer}
    .file-upload-label{display:block;padding:10px 12px;border-radius:6px;border:1px dashed var(--border);background:var(--input-bg);color:var(--text-muted);text-align:center;cursor:pointer;transition:all .2s}
    .file-upload-label:hover{border-color:var(--accent-purple);color:var(--accent-purple)}
    .file-preview{margin-top:8px;max-width:200px;border-radius:6px}
    .loader{text-align:center;padding:40px;color:var(--text-muted)}
    .empty{text-align:center;padding:60px 20px;color:var(--text-muted)}
    .empty-icon{font-size:48px;margin-bottom:12px;opacity:.5}
    .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase}
    .badge-sent{background:rgba(34,211,238,.2);color:var(--accent-cyan)}
    .badge-draft{background:rgba(251,113,133,.2);color:var(--accent-rose)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">📨 Messages & Embeds</div>
        <div class="muted">Bot: ${bot.name} (${bot.key})</div>
      </div>
      <div class="nav">
        <button onclick="history.back()" class="btn" type="button" style="padding:8px 16px">← Back</button>
        <a href="${PANEL_BASE}/bot/${bot.key}">🏠 Panel</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/stats">📊 Stats</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/rate-limits">🚦 Rate Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/consecutive-limits">🚫 Consecutive Limits</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/ai-engagement">🤖 AI</a>
        <a href="${PANEL_BASE}/bot/${bot.key}/commands">📚 Commands</a>
        <form method="post" action="${PANEL_BASE}/logout" style="display:inline"><button class="btn" type="submit">Logout</button></form>
      </div>
    </div>

    <div class="grid">
      <div>
        <div class="card">
          <div class="card-title">✍️ Compose Message</div>
          <form id="composeForm">
            <div class="form-group">
              <label>Channel</label>
              <select id="channelSelect" required>
                <option value="">Loading channels...</option>
              </select>
            </div>
            <div class="form-group">
              <label>Plain Text Content (optional)</label>
              <textarea id="plainContent" placeholder="Enter plain text message..."></textarea>
            </div>
            <hr style="border:none;border-top:1px solid var(--border);margin:20px 0">
            <div class="card-title" style="margin-top:20px">🎨 Embed (optional)</div>
            <div class="form-group">
              <label>Embed Title</label>
              <input type="text" id="embedTitle" placeholder="e.g. Important Announcement">
            </div>
            <div class="form-group">
              <label>Embed Description</label>
              <textarea id="embedDesc" placeholder="Main content of the embed..."></textarea>
            </div>
            <div class="form-group">
              <label>Embed Color</label>
              <div class="color-input">
                <input type="color" id="embedColorPicker" value="#a78bfa">
                <input type="text" id="embedColor" placeholder="#a78bfa" value="#a78bfa">
              </div>
            </div>
            <div class="form-group">
              <label>Embed Footer</label>
              <input type="text" id="embedFooter" placeholder="e.g. JepsenCloud Team">
            </div>
            <div class="form-group">
              <label>Embed Image (optional)</label>
              <div class="file-upload">
                <input type="file" id="embedImage" accept="image/*">
                <label for="embedImage" class="file-upload-label" id="fileLabel">Click to upload image</label>
              </div>
              <img id="embedImagePreview" class="file-preview" style="display:none">
            </div>
            <div style="display:flex;gap:10px;margin-top:20px">
              <button type="submit" class="btn btn-primary">Send to Discord</button>
              <button type="button" class="btn" id="saveDraftBtn">Save Draft</button>
              <button type="button" class="btn" id="clearBtn">Clear</button>
            </div>
          </form>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">👁️ Live Preview</div>
          <div id="livePreview" class="preview">
            <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Fill the form to see preview</div>
          </div>
        </div>
      </div>
    </div>

    <div class="library">
      <div class="card">
        <div class="card-title">📚 Message Library</div>
        <div class="filter-bar">
          <select id="filterChannel">
            <option value="">All Channels</option>
          </select>
          <select id="filterStatus">
            <option value="">All Messages</option>
            <option value="sent">Sent Only</option>
            <option value="draft">Drafts Only</option>
          </select>
          <input type="text" id="searchInput" placeholder="Search messages...">
        </div>
        <div id="messagesContainer">
          <div class="loader">Loading messages...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const botKey = ${JSON.stringify(bot.key)};
    const apiBase = ${JSON.stringify(PANEL_BASE)};
    let channels = [];
    let messages = [];
    let editingId = null;

    // API helper
    async function api(path, opts = {}) {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts
      });
      const txt = await res.text();
      let json;
      try { json = JSON.parse(txt); } catch { json = null; }
      if (!res.ok) {
        throw new Error((json && (json.error || json.message)) || txt || ('HTTP ' + res.status));
      }
      return json;
    }

    // Escape HTML
    function escapeHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // Load channels
    async function loadChannels() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/channels');
        channels = data.items || [];
        const select = document.getElementById('channelSelect');
        const filterSelect = document.getElementById('filterChannel');
        
        select.innerHTML = '<option value="">Select a channel...</option>';
        filterSelect.innerHTML = '<option value="">All Channels</option>';
        
        const byGuild = {};
        channels.forEach(ch => {
          if (!byGuild[ch.guild_name]) byGuild[ch.guild_name] = [];
          byGuild[ch.guild_name].push(ch);
        });

        for (const [guild, chans] of Object.entries(byGuild)) {
          chans.forEach(ch => {
            const option = document.createElement('option');
            option.value = ch.id;
            option.textContent = guild + ' / #' + ch.name;
            select.appendChild(option);

            const filterOption = option.cloneNode(true);
            filterSelect.appendChild(filterOption);
          });
        }
      } catch (e) {
        console.error('Failed to load channels:', e);
      }
    }

    // Update live preview
    function updatePreview() {
      const plain = document.getElementById('plainContent').value;
      const title = document.getElementById('embedTitle').value;
      const desc = document.getElementById('embedDesc').value;
      const color = document.getElementById('embedColor').value;
      const footer = document.getElementById('embedFooter').value;
      const imagePreview = document.getElementById('embedImagePreview');
      const imageUrl = imagePreview.style.display !== 'none' ? imagePreview.src : null;

      const container = document.getElementById('livePreview');
      
      if (!plain && !title && !desc) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Fill the form to see preview</div>';
        return;
      }

      let html = '';
      if (plain) {
        html += '<div style="color:var(--text);margin-bottom:12px;white-space:pre-wrap">' + escapeHtml(plain) + '</div>';
      }

      if (title || desc) {
        const borderColor = color || '#a78bfa';
        html += '<div class="preview-embed" style="border-left-color:' + borderColor + '">';
        if (title) html += '<div class="preview-embed-title">' + escapeHtml(title) + '</div>';
        if (desc) html += '<div class="preview-embed-desc">' + escapeHtml(desc) + '</div>';
        if (imageUrl) html += '<img src="' + escapeHtml(imageUrl) + '" class="preview-embed-image">';
        if (footer) html += '<div class="preview-embed-footer">' + escapeHtml(footer) + '</div>';
        html += '</div>';
      }

      container.innerHTML = html;
    }

    // Handle image upload
    document.getElementById('embedImage').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const preview = document.getElementById('embedImagePreview');
          preview.src = ev.target.result;
          preview.style.display = 'block';
          document.getElementById('fileLabel').textContent = file.name;
          updatePreview();
        };
        reader.readAsDataURL(file);
      }
    });

    // Color picker sync
    document.getElementById('embedColorPicker').addEventListener('input', (e) => {
      document.getElementById('embedColor').value = e.target.value;
      updatePreview();
    });

    document.getElementById('embedColor').addEventListener('input', (e) => {
      const val = e.target.value;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        document.getElementById('embedColorPicker').value = val;
      }
      updatePreview();
    });

    // Live preview updates
    ['plainContent', 'embedTitle', 'embedDesc', 'embedFooter'].forEach(id => {
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    function buildPayload(statusOverride) {
      const plain = document.getElementById('plainContent').value || '';
      const title = document.getElementById('embedTitle').value || '';
      const desc = document.getElementById('embedDesc').value || '';

      // Client-side length guard to avoid Discord validation errors / 500s
      if (plain.length > 2000) throw new Error('Content too long (max 2000 chars)');
      if (title.length > 256) throw new Error('Embed title too long (max 256 chars)');
      if (desc.length > 4096) throw new Error('Embed description too long (max 4096 chars)');
      const footerVal = document.getElementById('embedFooter').value || '';
      if (footerVal.length > 2048) throw new Error('Embed footer too long (max 2048 chars)');

      return {
        content: plain || undefined,
        embed: (title || desc || footerVal) ? {
          title: title || undefined,
          description: desc || undefined,
          color: document.getElementById('embedColor').value,
          footer: footerVal || undefined,
          imageData: document.getElementById('embedImagePreview').src || undefined
        } : undefined,
        status: statusOverride
      };
    }

    // Send message
    document.getElementById('composeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const channelId = document.getElementById('channelSelect').value;
      if (!channelId) {
        alert('Please select a channel');
        return;
      }

      try {
        const payload = buildPayload('sent');
        payload.channelId = channelId;

        if (editingId) {
          await api(apiBase + '/api/' + botKey + '/messages/' + editingId, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          alert('Message updated and sent!');
          editingId = null;
        } else {
          await api(apiBase + '/api/' + botKey + '/messages', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          alert('Message sent to Discord!');
        }
        clearForm();
        await loadMessages();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    // Save draft
    document.getElementById('saveDraftBtn').addEventListener('click', async () => {
      const channelId = document.getElementById('channelSelect').value;

      try {
        const payload = buildPayload('draft');
        payload.channelId = channelId || null;

        if (editingId) {
          await api(apiBase + '/api/' + botKey + '/messages/' + editingId, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          alert('Draft updated!');
          editingId = null;
        } else {
          await api(apiBase + '/api/' + botKey + '/messages', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          alert('Draft saved!');
        }
        clearForm();
        await loadMessages();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    });

    // Clear form
    function clearForm() {
      document.getElementById('composeForm').reset();
      document.getElementById('embedImagePreview').style.display = 'none';
      document.getElementById('fileLabel').textContent = 'Click to upload image';
      document.getElementById('embedColor').value = '#a78bfa';
      document.getElementById('embedColorPicker').value = '#a78bfa';
      editingId = null;
      updatePreview();
    }

    document.getElementById('clearBtn').addEventListener('click', clearForm);

    // Load message into form for editing
    function hydrateFormFromMessage(msg) {
      editingId = msg.id;
      document.getElementById('channelSelect').value = msg.channel_id || '';
      document.getElementById('plainContent').value = msg.content || '';
      
      if (msg.embed) {
        const embed = typeof msg.embed === 'string' ? JSON.parse(msg.embed) : msg.embed;
        document.getElementById('embedTitle').value = embed.title || '';
        document.getElementById('embedDesc').value = embed.description || '';
        document.getElementById('embedColor').value = embed.color || '#a78bfa';
        document.getElementById('embedColorPicker').value = embed.color || '#a78bfa';
        document.getElementById('embedFooter').value = embed.footer || '';
        
        if (embed.imageData) {
          const preview = document.getElementById('embedImagePreview');
          preview.src = embed.imageData;
          preview.style.display = 'block';
          document.getElementById('fileLabel').textContent = 'Image uploaded';
        }
      }

      updatePreview();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function handleEditMessage(id) {
      const msg = messages.find(m => m.id === id);
      if (!msg) {
        alert('Message not found');
        return;
      }
      hydrateFormFromMessage(msg);
    }

    // Delete message
    async function deleteMessage(id) {
      if (!confirm('Are you sure you want to delete this message?')) return;
      
      try {
        await api(apiBase + '/api/' + botKey + '/messages/' + id, { method: 'DELETE' });
        alert('Message deleted!');
        await loadMessages();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    // Load and render messages
    async function loadMessages() {
      const container = document.getElementById('messagesContainer');
      try {
        const data = await api(apiBase + '/api/' + botKey + '/messages');
        messages = data.messages || [];
        renderMessages();
      } catch (e) {
        container.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><div>Error loading messages: ' + escapeHtml(e.message) + '</div></div>';
      }
    }

    function renderMessages() {
      const container = document.getElementById('messagesContainer');
      const channelFilter = document.getElementById('filterChannel').value;
      const statusFilter = document.getElementById('filterStatus').value;
      const search = document.getElementById('searchInput').value.toLowerCase();

      let filtered = messages.filter(msg => {
        if (channelFilter && msg.channel_id !== channelFilter) return false;
        if (statusFilter && msg.status !== statusFilter) return false;
        if (search) {
          const searchable = [
            msg.content,
            msg.embed ? (typeof msg.embed === 'string' ? msg.embed : JSON.stringify(msg.embed)) : ''
          ].join(' ').toLowerCase();
          if (!searchable.includes(search)) return false;
        }
        return true;
      });

      if (!filtered.length) {
        container.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div>No messages found</div></div>';
        return;
      }

      container.innerHTML = filtered.map(msg => {
        const channel = channels.find(c => c.id === msg.channel_id);
        const channelName = channel ? channel.guild_name + ' / #' + channel.name : 'Unknown';
        const embed = msg.embed ? (typeof msg.embed === 'string' ? JSON.parse(msg.embed) : msg.embed) : null;
        const title = embed?.title || msg.content?.substring(0, 50) || 'Untitled';
        const desc = embed?.description || msg.content || '';

        return \`
          <div class="message-item" onclick="editMessage(\${msg.id})">
            <div class="message-item-header">
              <div>
                <div class="message-item-title">\${escapeHtml(title)}</div>
                <div class="message-item-meta">
                  <span class="badge badge-\${msg.status}">\${msg.status}</span>
                  · \${escapeHtml(channelName)}
                  · \${new Date(msg.created_at).toLocaleDateString()}
                </div>
              </div>
              <div class="message-item-actions" onclick="event.stopPropagation()">
                <button class="btn" onclick="editMessage(\${msg.id})">Edit</button>
                <button class="btn btn-danger" onclick="deleteMessage(\${msg.id})">Delete</button>
              </div>
            </div>
            \${desc ? \`<div class="message-item-desc">\${escapeHtml(desc)}</div>\` : ''}
          </div>
        \`;
      }).join('');
    }

    // Make functions globalfor onclick
    window.editMessage = handleEditMessage;
    window.deleteMessage = deleteMessage;

    // Filter listeners
    document.getElementById('filterChannel').addEventListener('change', renderMessages);
    document.getElementById('filterStatus').addEventListener('change', renderMessages);
    document.getElementById('searchInput').addEventListener('input', renderMessages);

    // Initialize
    (async () => {
      await loadChannels();
      await loadMessages();
    })();
  </script>
</body>
</html>`;
}

module.exports = { generateMessagesPage };
