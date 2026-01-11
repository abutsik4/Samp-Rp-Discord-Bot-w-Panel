// Message/Embed Management Page HTML Template

const { generateSidebarHTML, generateSidebarStyles, generateSidebarScripts } = require('./shared-template');

function generateMessagesPage(bot, PANEL_BASE) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Messages</title>
  <link rel="stylesheet" href="/shared.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/locomotive-scroll@4.1.4/dist/locomotive-scroll.min.css">
  <style>
    ${generateSidebarStyles()}
    
    .grid{display:grid;grid-template-columns:1fr 380px;gap:20px;margin-bottom:20px}
    @media(max-width:1100px){.grid{grid-template-columns:1fr}}
    .color-input{display:flex;gap:10px;align-items:center}
    .color-input input[type=color]{width:50px;height:40px;border-radius:6px;border:none;cursor:pointer}
    .color-input input[type=text]{flex:1}
    .preview{background:linear-gradient(135deg,rgba(30,41,59,.6),rgba(17,24,39,.6));border-radius:8px;padding:16px;border:1px solid var(--border)}
    .preview-embed{background:rgba(17,24,39,.95);border-left:4px solid var(--accent-cyan);border-radius:4px;padding:14px;max-width:100%}
    .preview-embed-title{font-size:15px;font-weight:600;margin-bottom:6px}
    .preview-embed-desc{font-size:13px;color:var(--text-muted);white-space:pre-wrap;margin-bottom:8px}
    .preview-embed-footer{font-size:11px;color:var(--text-muted);margin-top:10px}
    .preview-embed-image{max-width:100%;border-radius:6px;margin-top:10px}
    .library{margin-top:20px}
    .filter-bar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
    .filter-bar select,.filter-bar input{padding:8px 12px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:13px}
    .message-item{background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;transition:all .2s;cursor:pointer}
    .message-item:hover{border-color:var(--accent-purple);box-shadow:0 4px 12px color-mix(in srgb, var(--accent-purple) 16%, transparent)}
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
    .badge-sent{background:color-mix(in srgb, var(--accent-cyan) 20%, transparent);color:var(--accent-cyan)}
    .badge-draft{background:color-mix(in srgb, var(--accent-rose) 20%, transparent);color:var(--accent-rose)}
    .alert{padding:12px 16px;border-radius:8px;margin:12px 0;font-size:14px}
    .alert-success{background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.3);color:var(--accent-green)}
    .alert-error{background:rgba(248,113,113,.1);border:1px solid rgba(248,113,113,.3);color:#f87171}
    .editing-banner{margin-top:10px;color:var(--text-muted);font-size:12.5px}
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: bot.name,
      subtitle: 'Messages',
      icon: '📨',
      botKey: bot.key,
      PANEL_BASE,
      currentPage: 'messages'
    })}

    <main class="main-scroll-container">
      <div class="scroll-progress">
        <div class="scroll-progress-bar" id="scrollProgressBar"></div>
      </div>

      <div data-scroll-container id="scrollContainer">
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>📨</span> Messages & Embeds</h1>
            <p class="section-subtitle">Compose and manage bot messages</p>
            <div id="alertContainer"></div>
          </div>

          <div class="grid" data-scroll data-scroll-class="is-inview">
            <div class="content-card">
              <div class="card-title">✍️ Compose Message</div>
              <div class="editing-banner" id="editingBanner" style="display:none"></div>
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
                    <input type="color" id="embedColorPicker" value="#246a73">
                    <input type="text" id="embedColor" placeholder="#246a73" value="#246a73">
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

              <hr style="border:none;border-top:1px solid var(--border);margin:22px 0">

              <div class="card-title">🛠️ Edit Existing Discord Message</div>
              <p class="muted" style="margin-top:6px">Edit a message the bot already sent (by channel + message ID). Useful if it wasn't created from the library.</p>

              <div class="form-group" style="margin-top:12px">
                <label>Message ID</label>
                <input type="text" id="existingMessageId" placeholder="Paste Discord message ID...">
              </div>

              <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
                <button type="button" class="btn btn-secondary" id="loadExistingBtn">Load into Editor</button>
                <button type="button" class="btn btn-primary" id="updateExistingBtn">Update Discord Message</button>
                <button type="button" class="btn" id="clearExistingBtn">Clear Message ID</button>
              </div>
            </div>

            <div class="content-card">
              <div class="card-title">👁️ Live Preview</div>
              <div id="livePreview" class="preview">
                <div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Fill the form to see preview</div>
              </div>
            </div>
          </div>

          <div class="library content-card" data-scroll data-scroll-class="is-inview">
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
        </section>
      </div>
    </main>
  </div>

  ${generateSidebarScripts()}

  <script>
    const botKey = ${JSON.stringify(bot.key)};
    const apiBase = ${JSON.stringify(PANEL_BASE)};
    let channels = [];
    let messages = [];
    let editingId = null;
    let editingExistingDiscordMessageId = null;
    let channelIndex = new Map();

    async function api(path, opts = {}) {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
      const txt = await res.text();
      let json;
      try { json = JSON.parse(txt); } catch { json = null; }
      if (!res.ok) throw new Error((json && (json.error || json.message)) || txt || ('HTTP ' + res.status));
      return json;
    }

    function showAlert(msg, type = 'success') {
      const container = document.getElementById('alertContainer');
      if (!container) return;
      const d = document.createElement('div');
      d.className = 'alert alert-' + (type === 'error' ? 'error' : 'success');
      d.textContent = msg;
      container.appendChild(d);
      setTimeout(() => d.remove(), 3500);
    }

    function escapeHtml(str) {
      return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    async function loadChannels() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/channels');
        channels = data.items || [];
        channelIndex = new Map(channels.map(ch => [String(ch.id), ch]));
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
            filterSelect.appendChild(option.cloneNode(true));
          });
        }
      } catch (e) {
        console.error('Failed to load channels:', e);
        showAlert('Failed to load channels: ' + e.message, 'error');
      }
    }

    function channelLabel(channelId) {
      const ch = channelIndex.get(String(channelId));
      if (!ch) return channelId ? ('#' + channelId) : '—';
      const guild = ch.guild_name ? ch.guild_name + ' / ' : '';
      return guild + '#' + ch.name;
    }

    function parseEmbed(embedStr) {
      if (!embedStr) return null;
      try {
        if (typeof embedStr === 'object') return embedStr;
        return JSON.parse(embedStr);
      } catch {
        return null;
      }
    }

    function summarize(text, max = 120) {
      const s = String(text || '').replace(/\s+/g, ' ').trim();
      if (!s) return '';
      return s.length > max ? (s.slice(0, max - 1) + '…') : s;
    }

    function renderMessages() {
      const container = document.getElementById('messagesContainer');
      if (!container) return;

      const filterChannel = document.getElementById('filterChannel')?.value || '';
      const filterStatus = document.getElementById('filterStatus')?.value || '';
      const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

      const filtered = (messages || []).filter(m => {
        if (filterChannel && String(m.channel_id || '') !== String(filterChannel)) return false;
        if (filterStatus && String(m.status || '') !== String(filterStatus)) return false;
        if (q) {
          const emb = parseEmbed(m.embed);
          const hay = [m.content, emb?.title, emb?.description, emb?.footer, m.discord_message_id, m.channel_id]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (!filtered.length) {
        container.innerHTML = '<div class="empty"><div class="empty-icon">📭</div>No messages match your filters.</div>';
        return;
      }

      container.innerHTML = filtered.map(m => {
        const emb = parseEmbed(m.embed);
        const title = emb?.title || summarize(m.content, 60) || '(Untitled)';
        const desc = emb?.description || summarize(m.content, 140) || '';
        const status = (m.status === 'sent') ? 'sent' : 'draft';
        const badge = status === 'sent' ? '<span class="badge badge-sent">sent</span>' : '<span class="badge badge-draft">draft</span>';
        const meta = channelLabel(m.channel_id) + (m.discord_message_id ? (' • Discord: ' + m.discord_message_id) : '') + (m.updated_at ? (' • Updated: ' + m.updated_at) : '');
        return (
          '<div class="message-item" data-id="' + m.id + '">' +
            '<div class="message-item-header">' +
              '<div>' +
                '<div class="message-item-title">' + escapeHtml(title) + ' ' + badge + '</div>' +
                '<div class="message-item-meta">' + escapeHtml(meta) + '</div>' +
              '</div>' +
              '<div class="message-item-actions">' +
                '<button class="btn" data-action="load" data-id="' + m.id + '">Load</button>' +
                '<button class="btn" data-action="delete" data-id="' + m.id + '">Delete</button>' +
              '</div>' +
            '</div>' +
            (desc ? '<div class="message-item-desc">' + escapeHtml(desc) + '</div>' : '') +
          '</div>'
        );
      }).join('');

      if (window.requestLocoUpdate) window.requestLocoUpdate();
      else if (window.__locoScroll && window.__locoScroll.update) window.__locoScroll.update();
    }

    async function loadMessages() {
      try {
        const data = await api(apiBase + '/api/' + botKey + '/messages');
        messages = data.messages || [];
        renderMessages();
      } catch (e) {
        console.error('Failed to load messages:', e);
        showAlert('Failed to load messages: ' + e.message, 'error');
        const container = document.getElementById('messagesContainer');
        if (container) container.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Failed to load messages.</div>';

        if (window.requestLocoUpdate) window.requestLocoUpdate();
        else if (window.__locoScroll && window.__locoScroll.update) window.__locoScroll.update();
      }
    }

    async function loadExistingDiscordMessage() {
      const channelId = document.getElementById('channelSelect')?.value || '';
      const messageId = document.getElementById('existingMessageId')?.value.trim() || '';
      if (!channelId) return showAlert('Select a channel first', 'error');
      if (!messageId) return showAlert('Enter a message ID', 'error');

      try {
        const qs = new URLSearchParams({ channelId, messageId });
        const data = await api(apiBase + '/api/' + botKey + '/discord-message?' + qs.toString());
        const m = data?.message;
        if (!m) throw new Error('No message returned');

        editingExistingDiscordMessageId = m.id;
        document.getElementById('plainContent').value = m.content || '';

        const emb = m.embed || null;
        document.getElementById('embedTitle').value = emb?.title || '';
        document.getElementById('embedDesc').value = emb?.description || '';
        const col = (emb?.color && /^#[0-9A-Fa-f]{6}$/.test(emb.color)) ? emb.color : '#246a73';
        document.getElementById('embedColor').value = col;
        document.getElementById('embedColorPicker').value = col;
        document.getElementById('embedFooter').value = emb?.footer || '';

        showAlert('Loaded message into editor. Click “Update Discord Message” to apply changes.', 'success');
        updatePreview();
      } catch (e) {
        console.error('Failed to load existing message:', e);
        showAlert('Failed to load message: ' + e.message, 'error');
      }
    }

    async function updateExistingDiscordMessage() {
      const channelId = document.getElementById('channelSelect')?.value || '';
      const messageId = (document.getElementById('existingMessageId')?.value || '').trim();
      if (!channelId) return showAlert('Select a channel first', 'error');
      if (!messageId) return showAlert('Enter a message ID', 'error');

      const content = document.getElementById('plainContent').value || '';
      const embed = {
        title: document.getElementById('embedTitle').value || '',
        description: document.getElementById('embedDesc').value || '',
        color: document.getElementById('embedColor').value || '',
        footer: document.getElementById('embedFooter').value || ''
      };

      try {
        await api(apiBase + '/api/' + botKey + '/discord-message/edit', {
          method: 'POST',
          body: JSON.stringify({ channelId, messageId, content, embed })
        });
        editingExistingDiscordMessageId = messageId;
        showAlert('Discord message updated.', 'success');
      } catch (e) {
        console.error('Failed to update existing message:', e);
        showAlert('Failed to update: ' + e.message, 'error');
      }
    }

    function setEditing(id) {
      editingId = id ? Number(id) : null;
      const banner = document.getElementById('editingBanner');
      if (!banner) return;
      if (!editingId) {
        banner.style.display = 'none';
        banner.textContent = '';
      } else {
        banner.style.display = '';
        banner.textContent = 'Editing saved item #' + editingId + ' (updates will edit the Discord message if it was sent)';
      }
    }

    function loadIntoForm(msg) {
      document.getElementById('channelSelect').value = msg.channel_id || '';
      document.getElementById('plainContent').value = msg.content || '';

      const emb = parseEmbed(msg.embed) || {};
      document.getElementById('embedTitle').value = emb.title || '';
      document.getElementById('embedDesc').value = emb.description || '';
      const color = emb.color && /^#[0-9A-Fa-f]{6}$/.test(emb.color) ? emb.color : '#246a73';
      document.getElementById('embedColor').value = color;
      document.getElementById('embedColorPicker').value = color;
      document.getElementById('embedFooter').value = emb.footer || '';

      // Image editing is not supported server-side yet (kept as preview-only)
      const preview = document.getElementById('embedImagePreview');
      if (emb.imageData && typeof emb.imageData === 'string' && emb.imageData.startsWith('data:image')) {
        preview.src = emb.imageData;
        preview.style.display = 'block';
        document.getElementById('fileLabel').textContent = 'Loaded image (not sent to Discord yet)';
      } else {
        preview.style.display = 'none';
        preview.src = '';
        document.getElementById('fileLabel').textContent = 'Click to upload image';
      }

      updatePreview();
    }

    function buildPayload(status) {
      const channelId = document.getElementById('channelSelect').value;
      const content = document.getElementById('plainContent').value;
      const title = document.getElementById('embedTitle').value;
      const description = document.getElementById('embedDesc').value;
      const color = document.getElementById('embedColor').value;
      const footer = document.getElementById('embedFooter').value;
      const imagePreview = document.getElementById('embedImagePreview');
      const imageData = imagePreview.style.display !== 'none' ? imagePreview.src : null;

      const embed = {
        title: title || undefined,
        description: description || undefined,
        color: color || undefined,
        footer: footer || undefined,
        imageData: (imageData && String(imageData).startsWith('data:image')) ? imageData : undefined,
      };

      return {
        channelId: channelId || null,
        content: content || null,
        embed,
        status,
      };
    }

    async function save(status) {
      try {
        const payload = buildPayload(status);
        if (status === 'sent' && !payload.channelId) {
          showAlert('Channel is required to send.', 'error');
          return;
        }

        if (editingId) {
          await api(apiBase + '/api/' + botKey + '/messages/' + editingId, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          showAlert('Updated #' + editingId + ' (' + status + ')', 'success');
        } else {
          const created = await api(apiBase + '/api/' + botKey + '/messages', {
            method: 'POST',
            body: JSON.stringify(payload)
          });
          if (created && created.id) setEditing(created.id);
          showAlert('Saved new item #' + (created?.id || '?') + ' (' + status + ')', 'success');
        }

        await loadMessages();
      } catch (e) {
        console.error('Save error:', e);
        showAlert(e.message || 'Failed to save', 'error');
      }
    }

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
      if (plain) html += '<div style="color:var(--text);margin-bottom:12px;white-space:pre-wrap">' + escapeHtml(plain) + '</div>';
      if (title || desc) {
        const borderColor = color || '#246a73';
        html += '<div class="preview-embed" style="border-left-color:' + borderColor + '">';
        if (title) html += '<div class="preview-embed-title">' + escapeHtml(title) + '</div>';
        if (desc) html += '<div class="preview-embed-desc">' + escapeHtml(desc) + '</div>';
        if (imageUrl) html += '<img src="' + escapeHtml(imageUrl) + '" class="preview-embed-image">';
        if (footer) html += '<div class="preview-embed-footer">' + escapeHtml(footer) + '</div>';
        html += '</div>';
      }
      container.innerHTML = html;
    }

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

    document.getElementById('embedColorPicker').addEventListener('input', (e) => {
      document.getElementById('embedColor').value = e.target.value;
      updatePreview();
    });

    document.getElementById('embedColor').addEventListener('input', (e) => {
      if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
        document.getElementById('embedColorPicker').value = e.target.value;
      }
      updatePreview();
    });

    ['plainContent','embedTitle','embedDesc','embedFooter'].forEach(id => {
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
      document.getElementById('composeForm').reset();
      document.getElementById('embedImagePreview').style.display = 'none';
      document.getElementById('fileLabel').textContent = 'Click to upload image';
      setEditing(null);
      updatePreview();
    });

    document.getElementById('composeForm').addEventListener('submit', (ev) => {
      ev.preventDefault();
      save('sent');
    });

    document.getElementById('saveDraftBtn').addEventListener('click', () => save('draft'));

    ['filterChannel','filterStatus','searchInput'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', renderMessages);
      el.addEventListener('change', renderMessages);
    });

    document.getElementById('messagesContainer').addEventListener('click', async (ev) => {
      const btn = ev.target.closest('button[data-action]');
      if (!btn) {
        const item = ev.target.closest('.message-item');
        if (!item) return;
        const id = item.getAttribute('data-id');
        const msg = (messages || []).find(m => String(m.id) === String(id));
        if (!msg) return;
        setEditing(msg.id);
        loadIntoForm(msg);
        return;
      }

      const action = btn.getAttribute('data-action');
      const id = btn.getAttribute('data-id');
      const msg = (messages || []).find(m => String(m.id) === String(id));
      if (!msg) return;

      if (action === 'load') {
        setEditing(msg.id);
        loadIntoForm(msg);
        return;
      }

      if (action === 'delete') {
        if (!confirm('Delete saved item #' + msg.id + '?')) return;
        try {
          await api(apiBase + '/api/' + botKey + '/messages/' + msg.id, { method: 'DELETE' });
          if (editingId === Number(msg.id)) setEditing(null);
          showAlert('Deleted #' + msg.id, 'success');
          await loadMessages();
        } catch (e) {
          showAlert('Delete failed: ' + e.message, 'error');
        }
        return;
      }
    });

    document.addEventListener('DOMContentLoaded', async () => {
      await loadChannels();
      await loadMessages();

      document.getElementById('loadExistingBtn')?.addEventListener('click', loadExistingDiscordMessage);
      document.getElementById('updateExistingBtn')?.addEventListener('click', updateExistingDiscordMessage);
      document.getElementById('clearExistingBtn')?.addEventListener('click', () => {
        const el = document.getElementById('existingMessageId');
        if (el) el.value = '';
        editingExistingDiscordMessageId = null;
      });

      if (window.requestLocoUpdate) window.requestLocoUpdate();
      else if (window.__locoScroll && window.__locoScroll.update) window.__locoScroll.update();
    });
  </script>
</body>
</html>`;
}

module.exports = { generateMessagesPage };
