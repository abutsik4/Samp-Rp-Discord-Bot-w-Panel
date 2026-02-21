// Channel Management Page - Bulk delete Discord channels

const { generate } = require('./shared-template');

function generateChannelsPage(bot, PANEL_BASE) {
  const head = `
    .alert{padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:14px}
    .alert-info{background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.3);color:var(--accent-cyan)}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:var(--accent-emerald)}
    .alert-warning{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.3);color:var(--accent-amber)}
    .alert-error{background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.3);color:var(--accent-rose)}
    
    .channel-list{list-style:none;max-height:600px;overflow-y:auto}
    
    .category-item{background:linear-gradient(135deg,color-mix(in srgb, var(--accent-cyan) 15%, transparent),color-mix(in srgb, var(--accent-purple) 10%, transparent));border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px;cursor:pointer;transition:all .2s}
    .category-item:hover{border-color:var(--accent-cyan);transform:translateX(4px)}
    .category-header{display:flex;justify-content:space-between;align-items:center}
    .category-info{display:flex;align-items:center;gap:12px}
    .category-icon{font-size:20px}
    .category-name{font-weight:600;font-size:16px}
    .category-count{font-size:12px;color:var(--text-muted);background:rgba(255,255,255,.1);padding:4px 10px;border-radius:12px}
    .category-arrow{font-size:18px;color:var(--text-muted);transition:transform .2s}
    
    .channel-item{background:color-mix(in srgb, var(--accent-purple) 10%, transparent);border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;transition:all .2s;cursor:pointer}
    .channel-item:hover{background:color-mix(in srgb, var(--accent-purple) 15%, transparent);border-color:var(--accent-purple)}
    .channel-item.selected{background:color-mix(in srgb, var(--accent-rose) 15%, transparent);border-color:var(--accent-rose)}
    .channel-info{display:flex;align-items:center;gap:12px}
    .channel-name{font-weight:500;display:flex;align-items:center;gap:8px}
    .channel-name::before{content:'#';color:var(--text-muted)}
    .channel-id{font-size:12px;color:var(--text-muted);font-family:monospace}
    .channel-type{font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,.1)}
    .channel-checkbox{width:20px;height:20px;accent-color:var(--accent-rose)}
    
    .breadcrumb{display:flex;align-items:center;gap:8px;margin-bottom:20px;padding:12px 16px;background:rgba(0,0,0,.2);border-radius:8px}
    .breadcrumb-item{color:var(--text-muted);cursor:pointer;transition:color .2s}
    .breadcrumb-item:hover{color:var(--accent-cyan)}
    .breadcrumb-item.active{color:var(--text-primary);font-weight:500;cursor:default}
    .breadcrumb-sep{color:var(--text-muted)}
    
    .empty-state{text-align:center;padding:40px;color:var(--text-muted)}
    .empty-state-icon{font-size:48px;margin-bottom:16px}
    
    .stat-row{display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap}
    .stat-box{background:linear-gradient(135deg,color-mix(in srgb, var(--accent-purple) 10%, transparent),color-mix(in srgb, var(--accent-cyan) 10%, transparent));border:1px solid var(--border);border-radius:10px;padding:20px;text-align:center;flex:1;min-width:140px}
    .stat-value{font-size:32px;font-weight:700;background:linear-gradient(135deg,var(--accent-purple),var(--accent-cyan));-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .stat-label{font-size:13px;color:var(--text-muted);margin-top:8px}
    
    .action-bar{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center}
    .action-bar .btn{flex-shrink:0}
    .selected-count{font-size:14px;color:var(--text-muted);margin-left:auto}
    
    .filter-row{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
    .filter-row select,.filter-row input{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;color:var(--text-primary);font-size:14px}
    .filter-row select{min-width:150px}
    .filter-row input{flex:1;min-width:200px}
    
    .danger-zone{background:rgba(244,63,94,.05);border:2px solid rgba(244,63,94,.3);border-radius:12px;padding:20px;margin-top:20px}
    .danger-zone-title{color:var(--accent-rose);font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px}
    .danger-zone-desc{color:var(--text-muted);font-size:14px;margin-bottom:16px}
    
    .confirm-modal{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.8);display:none;align-items:center;justify-content:center;z-index:1000;backdrop-filter:blur(4px)}
    .confirm-modal.active{display:flex}
    .confirm-modal-content{background:var(--card-bg);border:1px solid var(--border);border-radius:16px;padding:24px;max-width:500px;width:90%}
    .confirm-modal-title{font-size:20px;font-weight:600;margin-bottom:16px}
    .confirm-modal-list{max-height:200px;overflow-y:auto;background:rgba(0,0,0,.2);border-radius:8px;padding:12px;margin-bottom:16px;list-style:none}
    .confirm-modal-list li{font-size:13px;padding:4px 0;color:var(--text-muted)}
    .confirm-modal-list li::before{content:'#';color:var(--accent-rose);margin-right:4px}
    .confirm-modal-actions{display:flex;gap:12px;justify-content:flex-end}
    .confirm-input{width:100%;background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:12px;color:var(--text-primary);margin-bottom:16px}
    
    .progress-bar{width:100%;height:8px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden;margin-bottom:16px}
    .progress-bar-fill{height:100%;background:linear-gradient(90deg,var(--accent-rose),var(--accent-purple));transition:width .3s ease}
    .progress-text{text-align:center;font-size:14px;color:var(--text-muted);margin-bottom:16px}
    
    .uncategorized-section{margin-top:24px;padding-top:20px;border-top:1px dashed var(--border)}
    .uncategorized-title{font-size:14px;color:var(--text-muted);margin-bottom:12px;display:flex;align-items:center;gap:8px}
  `;

  const body = `
        <section class="panel-section" data-scroll-section>
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>🗑️</span> Channel Manager</h1>
            <p class="section-subtitle">Bulk delete Discord channels</p>
          </div>

          <div id="alertContainer"></div>

          <div class="alert alert-warning" data-scroll data-scroll-class="is-inview">
            <strong>⚠️ Warning:</strong> Deleting channels is <strong>permanent</strong> and cannot be undone. All messages in deleted channels will be lost forever.
          </div>

          <div class="stat-row" data-scroll data-scroll-class="is-inview">
            <div class="stat-box">
              <div class="stat-value" id="channelCount">-</div>
              <div class="stat-label">Total Channels</div>
            </div>
            <div class="stat-box">
              <div class="stat-value" id="categoryCount">-</div>
              <div class="stat-label">Categories</div>
            </div>
            <div class="stat-box">
              <div class="stat-value" id="selectedCountStat">0</div>
              <div class="stat-label">Selected</div>
            </div>
          </div>

          <div class="breadcrumb" id="breadcrumb" data-scroll data-scroll-class="is-inview">
            <span class="breadcrumb-item active" data-view="root">📁 All Categories</span>
          </div>

          <div class="content-card" data-scroll data-scroll-class="is-inview">
            <div class="card-title" id="viewTitle">📂 Categories</div>
            
            <div class="filter-row" id="filterRow" style="display:none">
              <input type="text" id="searchFilter" placeholder="Search channels in this category..." />
            </div>
            
            <div class="action-bar" id="actionBar" style="display:none">
              <button class="btn btn-secondary" id="selectAllBtn">Select All in View</button>
              <button class="btn btn-secondary" id="deselectAllBtn">Deselect All</button>
              <button class="btn btn-primary" id="backBtn">← Back to Categories</button>
              <span class="selected-count" id="selectedCount">0 selected</span>
            </div>
            
            <ul class="channel-list" id="channelList">
              <li class="empty-state">
                <div class="empty-state-icon">⏳</div>
                <div>Loading channels...</div>
              </li>
            </ul>
          </div>

          <div class="danger-zone" data-scroll data-scroll-class="is-inview">
            <div class="danger-zone-title">⚠️ Danger Zone</div>
            <div class="danger-zone-desc">Selected channels will be permanently deleted from Discord. This action cannot be undone.</div>
            <button class="btn btn-danger" id="deleteSelectedBtn" disabled>🗑️ Delete Selected Channels (0)</button>
          </div>
        </section>
  `;

  const scripts = `
  <!-- Confirmation Modal -->
  <div class="confirm-modal" id="confirmModal">
    <div class="confirm-modal-content">
      <div class="confirm-modal-title" id="modalTitle">⚠️ Confirm Bulk Delete</div>
      <div id="modalBody">
        <p style="margin-bottom:16px">You are about to delete <strong id="deleteCount">0</strong> channels. This is <strong>permanent</strong>.</p>
        <ul class="confirm-modal-list" id="deleteList"></ul>
        <p style="margin-bottom:8px;font-size:14px;color:var(--text-muted)">Type <strong>DELETE</strong> to confirm:</p>
        <input type="text" class="confirm-input" id="confirmInput" placeholder="Type DELETE to confirm" />
      </div>
      <div id="progressBody" style="display:none">
        <div class="progress-bar"><div class="progress-bar-fill" id="progressFill" style="width:0%"></div></div>
        <div class="progress-text" id="progressText">Deleting channels... 0/0</div>
      </div>
      <div class="confirm-modal-actions">
        <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
        <button class="btn btn-danger" id="confirmDeleteBtn" disabled>Delete Forever</button>
      </div>
    </div>
  </div>

  <script>
    const botKey = '${bot.key}';
    const PANEL_BASE = '${PANEL_BASE}';
    let allChannels = [];
    let selectedIds = new Set();
    let currentCategoryId = null; // null = root view showing categories

    // Channel type names
    const channelTypes = {
      0: 'Text',
      2: 'Voice',
      4: 'Category',
      5: 'Announcement',
      10: 'News Thread',
      11: 'Public Thread',
      12: 'Private Thread',
      13: 'Stage',
      15: 'Forum'
    };

    const channelIcons = {
      0: '#',
      2: '🔊',
      4: '📁',
      5: '📢',
      13: '🎭',
      15: '💬'
    };

    function showAlert(msg, type = 'info') {
      const c = document.getElementById('alertContainer');
      const d = document.createElement('div');
      d.className = 'alert alert-' + type;
      d.textContent = msg;
      c.appendChild(d);
      setTimeout(() => d.remove(), 5000);
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    async function loadChannels() {
      try {
        const data = await window.panelFetchJson(PANEL_BASE + '/api/' + botKey + '/channels');
        allChannels = data.channels || [];
        
        const categories = allChannels.filter(ch => ch.type === 4);
        document.getElementById('channelCount').textContent = allChannels.length;
        document.getElementById('categoryCount').textContent = categories.length;
        
        renderView();
      } catch (e) {
        showAlert('Failed to load channels: ' + e.message, 'error');
      }
    }

    function getCategories() {
      return allChannels.filter(ch => ch.type === 4).sort((a, b) => a.position - b.position);
    }

    function getChannelsInCategory(categoryId) {
      return allChannels.filter(ch => ch.parentId === categoryId && ch.type !== 4).sort((a, b) => a.position - b.position);
    }

    function getUncategorizedChannels() {
      return allChannels.filter(ch => !ch.parentId && ch.type !== 4).sort((a, b) => a.position - b.position);
    }

    function renderView() {
      if (currentCategoryId === null) {
        renderCategoriesView();
      } else {
        renderCategoryContents(currentCategoryId);
      }
      updateSelectedCount();
    }

    function renderCategoriesView() {
      const container = document.getElementById('channelList');
      const categories = getCategories();
      const uncategorized = getUncategorizedChannels();
      
      document.getElementById('viewTitle').textContent = '📂 Categories';
      document.getElementById('filterRow').style.display = 'none';
      document.getElementById('actionBar').style.display = 'none';
      document.getElementById('breadcrumb').innerHTML = '<span class="breadcrumb-item active">📁 All Categories</span>';

      if (categories.length === 0 && uncategorized.length === 0) {
        container.innerHTML = '<li class="empty-state"><div class="empty-state-icon">📭</div><div>No channels found</div></li>';
        return;
      }

      let html = '';
      
      // Categories
      categories.forEach(cat => {
        const children = getChannelsInCategory(cat.id);
        const selectedInCat = children.filter(ch => selectedIds.has(ch.id)).length;
        html += '<li class="category-item" data-category-id="' + cat.id + '">' +
          '<div class="category-header">' +
            '<div class="category-info">' +
              '<span class="category-icon">📁</span>' +
              '<span class="category-name">' + escapeHtml(cat.name) + '</span>' +
              '<span class="category-count">' + children.length + ' channels' + (selectedInCat > 0 ? ' • ' + selectedInCat + ' selected' : '') + '</span>' +
            '</div>' +
            '<span class="category-arrow">→</span>' +
          '</div>' +
        '</li>';
      });

      // Uncategorized channels
      if (uncategorized.length > 0) {
        html += '<div class="uncategorized-section"><div class="uncategorized-title">📄 Uncategorized Channels (' + uncategorized.length + ')</div>';
        uncategorized.forEach(ch => {
          const isSelected = selectedIds.has(ch.id);
          const typeName = channelTypes[ch.type] || 'Other';
          html += '<li class="channel-item ' + (isSelected ? 'selected' : '') + '" data-id="' + ch.id + '">' +
            '<div class="channel-info">' +
              '<input type="checkbox" class="channel-checkbox" ' + (isSelected ? 'checked' : '') + ' onclick="event.stopPropagation()" />' +
              '<div>' +
                '<div class="channel-name">' + escapeHtml(ch.name) + '</div>' +
                '<div class="channel-id">' + ch.id + '</div>' +
              '</div>' +
            '</div>' +
            '<span class="channel-type">' + typeName + '</span>' +
          '</li>';
        });
        html += '</div>';
      }

      container.innerHTML = html;
    }

    function renderCategoryContents(categoryId) {
      const container = document.getElementById('channelList');
      const category = allChannels.find(ch => ch.id === categoryId);
      const channels = getChannelsInCategory(categoryId);
      const searchFilter = document.getElementById('searchFilter').value.toLowerCase();
      
      let filtered = channels;
      if (searchFilter) {
        filtered = filtered.filter(ch => ch.name.toLowerCase().includes(searchFilter));
      }

      document.getElementById('viewTitle').textContent = '📁 ' + (category ? category.name : 'Category');
      document.getElementById('filterRow').style.display = 'flex';
      document.getElementById('actionBar').style.display = 'flex';
      
      // Update breadcrumb
      document.getElementById('breadcrumb').innerHTML = 
        '<span class="breadcrumb-item" data-view="root" onclick="navigateToRoot()">📁 All Categories</span>' +
        '<span class="breadcrumb-sep">›</span>' +
        '<span class="breadcrumb-item active">' + escapeHtml(category ? category.name : 'Category') + '</span>';

      if (filtered.length === 0) {
        container.innerHTML = '<li class="empty-state"><div class="empty-state-icon">📭</div><div>' + (searchFilter ? 'No channels match your search' : 'This category is empty') + '</div></li>';
        return;
      }

      let html = '';
      filtered.forEach(ch => {
        const isSelected = selectedIds.has(ch.id);
        const typeName = channelTypes[ch.type] || 'Other';
        html += '<li class="channel-item ' + (isSelected ? 'selected' : '') + '" data-id="' + ch.id + '">' +
          '<div class="channel-info">' +
            '<input type="checkbox" class="channel-checkbox" ' + (isSelected ? 'checked' : '') + ' onclick="event.stopPropagation()" />' +
            '<div>' +
              '<div class="channel-name">' + escapeHtml(ch.name) + '</div>' +
              '<div class="channel-id">' + ch.id + '</div>' +
            '</div>' +
          '</div>' +
          '<span class="channel-type">' + typeName + '</span>' +
        '</li>';
      });
      container.innerHTML = html;
    }

    function navigateToRoot() {
      currentCategoryId = null;
      document.getElementById('searchFilter').value = '';
      renderView();
    }

    function navigateToCategory(categoryId) {
      currentCategoryId = categoryId;
      document.getElementById('searchFilter').value = '';
      renderView();
    }

    function updateSelectedCount() {
      const count = selectedIds.size;
      document.getElementById('selectedCount').textContent = count + ' selected';
      document.getElementById('selectedCountStat').textContent = count;
      document.getElementById('deleteSelectedBtn').textContent = '🗑️ Delete Selected Channels (' + count + ')';
      document.getElementById('deleteSelectedBtn').disabled = count === 0;
    }

    // Event delegation
    document.getElementById('channelList').addEventListener('click', (e) => {
      // Handle category click
      const categoryItem = e.target.closest('.category-item');
      if (categoryItem) {
        const categoryId = categoryItem.dataset.categoryId;
        navigateToCategory(categoryId);
        return;
      }
      
      // Handle channel click
      const item = e.target.closest('.channel-item');
      if (!item) return;
      
      const id = item.dataset.id;
      const checkbox = item.querySelector('.channel-checkbox');
      
      if (selectedIds.has(id)) {
        selectedIds.delete(id);
        item.classList.remove('selected');
        if (checkbox) checkbox.checked = false;
      } else {
        selectedIds.add(id);
        item.classList.add('selected');
        if (checkbox) checkbox.checked = true;
      }
      updateSelectedCount();
    });

    document.getElementById('selectAllBtn').addEventListener('click', () => {
      if (currentCategoryId === null) return;
      
      const channels = getChannelsInCategory(currentCategoryId);
      const searchFilter = document.getElementById('searchFilter').value.toLowerCase();
      
      let filtered = channels;
      if (searchFilter) filtered = filtered.filter(ch => ch.name.toLowerCase().includes(searchFilter));
      
      filtered.forEach(ch => selectedIds.add(ch.id));
      renderView();
    });

    document.getElementById('deselectAllBtn').addEventListener('click', () => {
      if (currentCategoryId === null) {
        selectedIds.clear();
      } else {
        const channels = getChannelsInCategory(currentCategoryId);
        channels.forEach(ch => selectedIds.delete(ch.id));
      }
      renderView();
    });

    document.getElementById('backBtn').addEventListener('click', navigateToRoot);
    document.getElementById('searchFilter').addEventListener('input', renderView);

    // Delete flow
    document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
      if (selectedIds.size === 0) return;
      
      const modal = document.getElementById('confirmModal');
      const list = document.getElementById('deleteList');
      const channels = allChannels.filter(ch => selectedIds.has(ch.id));
      
      document.getElementById('deleteCount').textContent = channels.length;
      list.innerHTML = channels.map(ch => '<li>' + escapeHtml(ch.name) + '</li>').join('');
      
      document.getElementById('modalBody').style.display = 'block';
      document.getElementById('progressBody').style.display = 'none';
      document.getElementById('confirmInput').value = '';
      document.getElementById('confirmDeleteBtn').disabled = true;
      document.getElementById('cancelBtn').disabled = false;
      document.getElementById('cancelBtn').textContent = 'Cancel';
      document.getElementById('modalTitle').textContent = '⚠️ Confirm Bulk Delete';
      
      modal.classList.add('active');
    });

    document.getElementById('confirmInput').addEventListener('input', (e) => {
      document.getElementById('confirmDeleteBtn').disabled = e.target.value !== 'DELETE';
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      document.getElementById('confirmModal').classList.remove('active');
    });

    document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
      const channelIds = Array.from(selectedIds);
      if (channelIds.length === 0) return;

      // Switch to progress view
      document.getElementById('modalBody').style.display = 'none';
      document.getElementById('progressBody').style.display = 'block';
      document.getElementById('confirmDeleteBtn').disabled = true;
      document.getElementById('cancelBtn').disabled = true;
      document.getElementById('modalTitle').textContent = '🗑️ Deleting Channels...';

      const progressFill = document.getElementById('progressFill');
      const progressText = document.getElementById('progressText');

      try {
        const data = await window.panelFetchJson(PANEL_BASE + '/api/' + botKey + '/channels/bulk-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelIds })
        });

        if (data && data.ok) {
          const deleted = data.deleted || 0;
          const failed = data.failed || 0;
          
          progressFill.style.width = '100%';
          progressText.textContent = 'Done! Deleted ' + deleted + ' channels' + (failed > 0 ? ', ' + failed + ' failed' : '');
          
          showAlert('Successfully deleted ' + deleted + ' channels' + (failed > 0 ? ' (' + failed + ' failed)' : ''), 'success');
          
          selectedIds.clear();
          await loadChannels();
        } else {
          throw new Error(data.error || 'Bulk delete failed');
        }
      } catch (e) {
        progressText.textContent = 'Error: ' + e.message;
        showAlert('Failed to delete channels: ' + e.message, 'error');
      }

      document.getElementById('cancelBtn').disabled = false;
      document.getElementById('cancelBtn').textContent = 'Close';
    });

    // Close modal on overlay click
    document.getElementById('confirmModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget && !document.getElementById('cancelBtn').disabled) {
        document.getElementById('confirmModal').classList.remove('active');
      }
    });

    // Initial load
    document.addEventListener('DOMContentLoaded', loadChannels);
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel — Channel Manager',
    currentPage: 'channels',
    PANEL_BASE,
  });
}

module.exports = { generateChannelsPage };
