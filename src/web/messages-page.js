// Message/Embed Management Page HTML Template
// Enhanced with scheduling, instant send, labels, and modern UI

const { generate } = require('./shared-template');

function generateMessagesPage(bot, PANEL_BASE) {
  const head = `
    </style>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lucide-static@0.378.0/font/lucide.min.css">
    <style>
    
    /* Enhanced Message Pool Styles */
    .message-pool-grid {
      display: grid;
      grid-template-columns: 1fr 400px;
      gap: 24px;
      margin-bottom: 24px;
    }
    
    @media(max-width: 1200px) {
      .message-pool-grid { grid-template-columns: 1fr; }
    }
    
    /* Modern Card Styling */
    .compose-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      position: relative;
      overflow: hidden;
    }
    
    .compose-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: var(--gradient-primary);
    }
    
    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    
    .card-icon {
      width: 48px;
      height: 48px;
      background: var(--gradient-glass);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    
    .card-header-text h2 {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-bright);
      margin: 0;
    }
    
    .card-header-text p {
      font-size: 13px;
      color: var(--text-muted);
      margin: 4px 0 0;
    }
    
    /* Send Options Panel */
    .send-options {
      background: var(--gradient-glass);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-top: 20px;
    }
    
    .send-options-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-cyan);
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .send-mode-tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    
    .send-mode-tab {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--input-bg);
      color: var(--text-muted);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.25s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    
    .send-mode-tab:hover {
      border-color: var(--accent-cyan);
      color: var(--text);
    }
    
    .send-mode-tab.active {
      background: var(--gradient-primary);
      border-color: transparent;
      color: white;
    }
    
    .schedule-options {
      display: none;
      gap: 12px;
      flex-wrap: wrap;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      margin-top: 16px;
    }
    
    .schedule-options.active {
      display: flex;
    }
    
    .schedule-field {
      flex: 1;
      min-width: 120px;
    }
    
    .schedule-field label {
      display: block;
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 6px;
      font-weight: 500;
    }
    
    .schedule-field input,
    .schedule-field select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--input-bg);
      color: var(--text);
      font-size: 14px;
    }
    
    .minute-picker {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6px;
      margin-top: 8px;
    }
    
    .minute-btn {
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input-bg);
      color: var(--text-muted);
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .minute-btn:hover {
      border-color: var(--accent-cyan);
      color: var(--text);
    }
    
    .minute-btn.selected {
      background: var(--accent-cyan);
      border-color: var(--accent-cyan);
      color: var(--coffee-bean);
      font-weight: 600;
    }
    
    /* Label System */
    .label-section {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }
    
    .label-input-row {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    
    .label-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    
    .label-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .label-tag.selected {
      box-shadow: 0 0 0 2px var(--text-bright);
    }
    
    .label-tag-announcement {
      background: color-mix(in srgb, var(--bubblegum-pink) 25%, transparent);
      color: var(--bubblegum-pink);
      border: 1px solid var(--bubblegum-pink);
    }
    
    .label-tag-update {
      background: color-mix(in srgb, var(--pearl-aqua) 25%, transparent);
      color: var(--pearl-aqua);
      border: 1px solid var(--pearl-aqua);
    }
    
    .label-tag-event {
      background: color-mix(in srgb, #f5c77e 25%, transparent);
      color: #f5c77e;
      border: 1px solid #f5c77e;
    }
    
    .label-tag-general {
      background: color-mix(in srgb, var(--lavender-blush) 25%, transparent);
      color: var(--lavender-blush);
      border: 1px solid var(--lavender-blush);
    }
    
    .label-tag-important {
      background: color-mix(in srgb, #ff6b6b 25%, transparent);
      color: #ff6b6b;
      border: 1px solid #ff6b6b;
    }
    
    /* Action Buttons */
    .action-buttons {
      display: flex;
      gap: 12px;
      margin-top: 24px;
      flex-wrap: wrap;
    }
    
    .btn-send-now {
      background: var(--gradient-primary);
      border: none;
      color: white;
      font-weight: 600;
      padding: 14px 28px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      box-shadow: var(--shadow-glow-pink);
    }
    
    .btn-send-now:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: var(--shadow-glow-pink), 0 8px 24px rgba(239, 98, 108, 0.3);
    }
    
    .btn-send-now:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .btn-schedule {
      background: color-mix(in srgb, var(--pearl-aqua) 20%, transparent);
      border: 1px solid var(--pearl-aqua);
      color: var(--pearl-aqua);
      font-weight: 600;
      padding: 14px 28px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
    }
    
    .btn-schedule:hover:not(:disabled) {
      background: var(--pearl-aqua);
      color: var(--coffee-bean);
    }
    
    .btn-secondary {
      background: var(--input-bg);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 12px 20px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    
    .btn-secondary:hover {
      border-color: var(--accent-cyan);
      background: var(--input-bg-focus);
    }
    
    /* Preview Card */
    .preview-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      position: sticky;
      top: 24px;
    }
    
    .preview-container {
      background: linear-gradient(135deg, rgba(34, 24, 28, 0.6), rgba(49, 47, 47, 0.6));
      border-radius: 12px;
      padding: 20px;
      border: 1px solid var(--border);
      min-height: 200px;
    }
    
    .preview-embed {
      background: rgba(49, 47, 47, 0.95);
      border-left: 4px solid var(--pearl-aqua);
      border-radius: 8px;
      padding: 16px;
    }
    
    .preview-embed-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-bright);
      margin-bottom: 8px;
    }
    
    .preview-embed-desc {
      font-size: 14px;
      color: var(--text-muted);
      white-space: pre-wrap;
      line-height: 1.6;
    }
    
    .preview-embed-footer {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }
    
    .preview-embed-image {
      max-width: 100%;
      border-radius: 8px;
      margin-top: 12px;
    }
    
    /* Color Picker */
    .color-picker-row {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    
    .color-picker-row input[type="color"] {
      width: 50px;
      height: 44px;
      border-radius: 8px;
      border: 2px solid var(--border);
      cursor: pointer;
      padding: 2px;
    }
    
    .color-picker-row input[type="text"] {
      flex: 1;
    }
    
    .color-presets {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    
    .color-preset {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 2px solid transparent;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .color-preset:hover {
      transform: scale(1.15);
    }
    
    .color-preset.active {
      border-color: var(--text-bright);
      box-shadow: 0 0 8px currentColor;
    }
    
    /* Message Library */
    .library-section {
      margin-top: 32px;
    }
    
    .library-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 20px;
    }
    
    .library-filters {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    
    .filter-select,
    .filter-input {
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--input-bg);
      color: var(--text);
      font-size: 13px;
      min-width: 140px;
    }
    
    .message-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 16px;
    }
    
    .message-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
      transition: all 0.25s ease;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }
    
    .message-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--gradient-primary);
      opacity: 0;
      transition: opacity 0.25s;
    }
    
    .message-card:hover {
      border-color: var(--accent-cyan);
      transform: translateY(-4px);
      box-shadow: var(--shadow-glow-cyan);
    }
    
    .message-card:hover::before {
      opacity: 1;
    }
    
    .message-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    
    .message-card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-bright);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .message-card-meta {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 4px;
    }
    
    .message-card-content {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      margin-bottom: 12px;
    }
    
    .message-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }
    
    .message-card-actions {
      display: flex;
      gap: 8px;
    }
    
    .message-card-actions button {
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid var(--border);
      background: var(--input-bg);
      color: var(--text);
    }
    
    .message-card-actions button:hover {
      border-color: var(--accent-cyan);
      color: var(--accent-cyan);
    }
    
    .message-card-actions button.btn-resend {
      background: var(--gradient-primary);
      border: none;
      color: white;
    }
    
    /* Status Badges */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .status-badge-sent {
      background: color-mix(in srgb, var(--pearl-aqua) 20%, transparent);
      color: var(--pearl-aqua);
    }
    
    .status-badge-draft {
      background: color-mix(in srgb, var(--muted-rose) 20%, transparent);
      color: var(--muted-rose);
    }
    
    .status-badge-scheduled {
      background: color-mix(in srgb, #f5c77e 20%, transparent);
      color: #f5c77e;
    }
    
    /* Frequency Settings Card */
    .frequency-card {
      background: var(--gradient-glass);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      margin-top: 20px;
    }
    
    .frequency-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .frequency-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--accent-cyan);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .frequency-toggle {
      position: relative;
      width: 48px;
      height: 26px;
    }
    
    .frequency-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .frequency-slider {
      position: absolute;
      cursor: pointer;
      inset: 0;
      background: var(--input-bg);
      border: 1px solid var(--border);
      border-radius: 26px;
      transition: 0.3s;
    }
    
    .frequency-slider::before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 2px;
      bottom: 2px;
      background: var(--text-muted);
      border-radius: 50%;
      transition: 0.3s;
    }
    
    .frequency-toggle input:checked + .frequency-slider {
      background: var(--pearl-aqua);
      border-color: var(--pearl-aqua);
    }
    
    .frequency-toggle input:checked + .frequency-slider::before {
      transform: translateX(22px);
      background: var(--coffee-bean);
    }
    
    .frequency-controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 12px;
    }
    
    .frequency-field label {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .frequency-field input,
    .frequency-field select {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--input-bg);
      color: var(--text);
      font-size: 14px;
    }
    
    /* File Upload */
    .file-upload-zone {
      border: 2px dashed var(--border);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      cursor: pointer;
      transition: all 0.25s;
      position: relative;
      overflow: hidden;
    }
    
    .file-upload-zone:hover {
      border-color: var(--pearl-aqua);
      background: color-mix(in srgb, var(--pearl-aqua) 5%, transparent);
    }
    
    .file-upload-zone input[type="file"] {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    
    .file-upload-icon {
      font-size: 32px;
      margin-bottom: 8px;
    }
    
    .file-upload-text {
      font-size: 14px;
      color: var(--text-muted);
    }
    
    .file-preview-container {
      margin-top: 12px;
    }
    
    .file-preview-image {
      max-width: 200px;
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    
    /* Alerts */
    .alert-container {
      position: fixed;
      top: 24px;
      right: 24px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 400px;
    }
    
    .alert {
      padding: 16px 20px;
      border-radius: 12px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: slideIn 0.3s ease;
      box-shadow: var(--shadow-lg);
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(100px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    .alert-success {
      background: color-mix(in srgb, var(--pearl-aqua) 15%, var(--graphite));
      border: 1px solid var(--pearl-aqua);
      color: var(--pearl-aqua);
    }
    
    .alert-error {
      background: color-mix(in srgb, var(--bubblegum-pink) 15%, var(--graphite));
      border: 1px solid var(--bubblegum-pink);
      color: var(--bubblegum-pink);
    }
    
    .alert-icon {
      font-size: 20px;
    }
    
    /* Loader */
    .loader {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }
    
    .loader-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--pearl-aqua);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 80px 24px;
      color: var(--text-muted);
    }
    
    .empty-icon {
      font-size: 64px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    .empty-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 8px;
    }
    
    .empty-desc {
      font-size: 14px;
      max-width: 400px;
      margin: 0 auto;
    }
    
    /* Debug Console */
    .debug-console {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 400px;
      max-height: 300px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      display: none;
      z-index: 900;
    }
    
    .debug-console.active {
      display: block;
    }
    
    .debug-header {
      padding: 12px 16px;
      background: var(--gradient-glass);
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .debug-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent-cyan);
    }
    
    .debug-body {
      padding: 12px;
      max-height: 240px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 11px;
      color: var(--text-muted);
    }
    
    .debug-entry {
      padding: 6px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    
    .debug-entry.error {
      background: color-mix(in srgb, var(--bubblegum-pink) 10%, transparent);
      color: var(--bubblegum-pink);
    }
    
    .debug-entry.success {
      background: color-mix(in srgb, var(--pearl-aqua) 10%, transparent);
      color: var(--pearl-aqua);
    }
    
    .debug-entry.info {
      background: color-mix(in srgb, var(--lavender-blush) 10%, transparent);
    }
  `;

  const body = `
        <section class="panel-section" data-scroll-section>
          <!-- Alerts Container (Fixed Position) -->
          <div class="alert-container" id="alertContainer"></div>

          <!-- Header -->
          <div class="section-header" data-scroll data-scroll-class="is-inview">
            <h1 class="section-title"><span>📨</span> Message Pool</h1>
            <p class="section-subtitle">Compose, schedule, and manage your bot messages with ease</p>
          </div>

          <!-- Main Grid -->
          <div class="message-pool-grid" data-scroll data-scroll-class="is-inview">
            <!-- Compose Section -->
            <div class="compose-card">
              <div class="card-header">
                <div class="card-icon">✍️</div>
                <div class="card-header-text">
                  <h2>Compose Message</h2>
                  <p>Create and send messages to your Discord channels</p>
                </div>
              </div>
              
              <div id="editingBanner" class="editing-banner" style="display:none"></div>
              
              <form id="composeForm">
                <!-- Channel Selection -->
                <div class="form-group">
                  <label>📍 Target Channel</label>
                  <select id="channelSelect" required>
                    <option value="">Loading channels...</option>
                  </select>
                </div>
                
                <!-- Plain Text Content -->
                <div class="form-group">
                  <label>💬 Message Content</label>
                  <textarea id="plainContent" placeholder="Type your message here..." rows="4"></textarea>
                </div>
                
                <!-- Embed Section -->
                <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border);">
                  <div class="card-header" style="margin-bottom: 16px;">
                    <div class="card-icon" style="width: 36px; height: 36px; font-size: 18px;">🎨</div>
                    <div class="card-header-text">
                      <h2 style="font-size: 15px;">Rich Embed (Optional)</h2>
                      <p>Add a beautiful embed to your message</p>
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <label>📝 Embed Title</label>
                    <input type="text" id="embedTitle" placeholder="e.g. Important Announcement">
                  </div>
                  
                  <div class="form-group">
                    <label>📄 Embed Description</label>
                    <textarea id="embedDesc" placeholder="Describe your announcement..." rows="4"></textarea>
                  </div>
                  
                  <div class="form-group">
                    <label>🎨 Embed Color</label>
                    <div class="color-picker-row">
                      <input type="color" id="embedColorPicker" value="#84dccf">
                      <input type="text" id="embedColor" placeholder="#84dccf" value="#84dccf">
                    </div>
                    <div class="color-presets">
                      <div class="color-preset" style="background: #84dccf;" data-color="#84dccf" title="Pearl Aqua"></div>
                      <div class="color-preset" style="background: #ef626c;" data-color="#ef626c" title="Bubblegum Pink"></div>
                      <div class="color-preset" style="background: #f5c77e;" data-color="#f5c77e" title="Amber"></div>
                      <div class="color-preset" style="background: #f6e8ea;" data-color="#f6e8ea" title="Lavender Blush"></div>
                      <div class="color-preset" style="background: #5865F2;" data-color="#5865F2" title="Discord Blurple"></div>
                      <div class="color-preset" style="background: #57F287;" data-color="#57F287" title="Discord Green"></div>
                    </div>
                  </div>
                  
                  <div class="form-group">
                    <label>📎 Footer Text</label>
                    <input type="text" id="embedFooter" placeholder="e.g. Posted by JepsenCloud">
                  </div>
                  
                  <div class="form-group">
                    <label>🖼️ Embed Image</label>
                    <div class="file-upload-zone" id="fileUploadZone">
                      <input type="file" id="embedImage" accept="image/*">
                      <div class="file-upload-icon">📷</div>
                      <div class="file-upload-text" id="fileLabel">Click or drag to upload an image</div>
                    </div>
                    <div class="file-preview-container" id="filePreviewContainer" style="display: none;">
                      <img id="embedImagePreview" class="file-preview-image">
                      <button type="button" class="btn-secondary" id="clearImageBtn" style="margin-top: 8px;">
                        🗑️ Remove Image
                      </button>
                    </div>
                  </div>
                </div>
                
                <!-- Labels Section -->
                <div class="label-section">
                  <label style="display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">
                    🏷️ Labels (for organization)
                  </label>
                  <div class="label-tags" id="labelTags">
                    <span class="label-tag label-tag-announcement" data-label="announcement">📢 Announcement</span>
                    <span class="label-tag label-tag-update" data-label="update">🔄 Update</span>
                    <span class="label-tag label-tag-event" data-label="event">🎉 Event</span>
                    <span class="label-tag label-tag-general" data-label="general">💬 General</span>
                    <span class="label-tag label-tag-important" data-label="important">🚨 Important</span>
                  </div>
                </div>
                
                <!-- Send Options -->
                <div class="send-options">
                  <div class="send-options-title">
                    <span>🚀</span> Send Options
                  </div>
                  
                  <div class="send-mode-tabs">
                    <button type="button" class="send-mode-tab active" data-mode="instant">
                      ⚡ Instant Send
                    </button>
                    <button type="button" class="send-mode-tab" data-mode="schedule">
                      ⏰ Schedule
                    </button>
                  </div>
                  
                  <div class="schedule-options" id="scheduleOptions">
                    <div class="schedule-field">
                      <label>📅 Date</label>
                      <input type="date" id="scheduleDate">
                    </div>
                    <div class="schedule-field">
                      <label>🕐 Hour (0-23)</label>
                      <select id="scheduleHour">
                        ${Array.from({length: 24}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}:00</option>`).join('')}
                      </select>
                    </div>
                    <div class="schedule-field" style="flex: 2; min-width: 200px;">
                      <label>⏱️ Minute (click to select)</label>
                      <div class="minute-picker" id="minutePicker">
                        ${[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => 
                          `<button type="button" class="minute-btn${m === 0 ? ' selected' : ''}" data-minute="${m}">:${String(m).padStart(2, '0')}</button>`
                        ).join('')}
                      </div>
                    </div>
                  </div>
                </div>
                
                <!-- Bot Frequency Settings -->
                <div class="frequency-card" id="frequencyCard">
                  <div class="frequency-header">
                    <div class="frequency-title">
                      <span>🔄</span> Auto-Send Frequency
                    </div>
                    <label class="frequency-toggle">
                      <input type="checkbox" id="frequencyEnabled">
                      <span class="frequency-slider"></span>
                    </label>
                  </div>
                  
                  <div class="frequency-controls" id="frequencyControls" style="display: none;">
                    <div class="frequency-field">
                      <label>Interval</label>
                      <select id="frequencyInterval">
                        <option value="5">5 minutes</option>
                        <option value="10">10 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60" selected>1 hour</option>
                        <option value="120">2 hours</option>
                        <option value="360">6 hours</option>
                        <option value="720">12 hours</option>
                        <option value="1440">24 hours</option>
                      </select>
                    </div>
                    <div class="frequency-field">
                      <label>At Minute</label>
                      <select id="frequencyMinute">
                        ${Array.from({length: 60}, (_, i) => `<option value="${i}">:${String(i).padStart(2, '0')}</option>`).join('')}
                      </select>
                    </div>
                    <div class="frequency-field">
                      <label>Start Hour</label>
                      <select id="frequencyStartHour">
                        ${Array.from({length: 24}, (_, i) => `<option value="${i}">${String(i).padStart(2, '0')}:00</option>`).join('')}
                      </select>
                    </div>
                    <div class="frequency-field">
                      <label>End Hour</label>
                      <select id="frequencyEndHour">
                        ${Array.from({length: 24}, (_, i) => `<option value="${i}"${i === 23 ? ' selected' : ''}>${String(i).padStart(2, '0')}:00</option>`).join('')}
                      </select>
                    </div>
                  </div>
                </div>
                
                <!-- Action Buttons -->
                <div class="action-buttons">
                  <button type="submit" class="btn-send-now" id="sendNowBtn">
                    <span>⚡</span> Send Now
                  </button>
                  <button type="button" class="btn-schedule" id="scheduleBtn" style="display: none;">
                    <span>⏰</span> Schedule Message
                  </button>
                  <button type="button" class="btn-secondary" id="saveDraftBtn">
                    <span>💾</span> Save Draft
                  </button>
                  <button type="button" class="btn-secondary" id="clearBtn">
                    <span>🗑️</span> Clear
                  </button>
                </div>
              </form>
              
              <!-- Edit Existing Message -->
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border);">
                <div class="card-header" style="margin-bottom: 16px;">
                  <div class="card-icon" style="width: 36px; height: 36px; font-size: 18px;">🛠️</div>
                  <div class="card-header-text">
                    <h2 style="font-size: 15px;">Edit Existing Message</h2>
                    <p>Modify a message the bot already sent</p>
                  </div>
                </div>
                
                <div class="form-group">
                  <label>Message ID</label>
                  <input type="text" id="existingMessageId" placeholder="Paste the Discord message ID...">
                </div>
                
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                  <button type="button" class="btn-secondary" id="loadExistingBtn">
                    <span>📥</span> Load into Editor
                  </button>
                  <button type="button" class="btn-send-now" id="updateExistingBtn" style="padding: 12px 20px;">
                    <span>✏️</span> Update Message
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Preview Section -->
            <div class="preview-card">
              <div class="card-header">
                <div class="card-icon">👁️</div>
                <div class="card-header-text">
                  <h2>Live Preview</h2>
                  <p>See how your message will appear</p>
                </div>
              </div>
              
              <div class="preview-container" id="livePreview">
                <div style="color: var(--text-muted); font-size: 14px; text-align: center; padding: 40px 20px;">
                  <div style="font-size: 48px; margin-bottom: 12px; opacity: 0.5;">💭</div>
                  <p>Start typing to see a preview</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Message Library -->
          <div class="library-section content-card" data-scroll data-scroll-class="is-inview">
            <div class="library-header">
              <div class="card-header">
                <div class="card-icon">📚</div>
                <div class="card-header-text">
                  <h2>Message Library</h2>
                  <p>Your saved and sent messages</p>
                </div>
              </div>
              
              <div class="library-filters">
                <select id="filterChannel" class="filter-select">
                  <option value="">All Channels</option>
                </select>
                <select id="filterStatus" class="filter-select">
                  <option value="">All Status</option>
                  <option value="sent">✅ Sent</option>
                  <option value="draft">📝 Drafts</option>
                  <option value="scheduled">⏰ Scheduled</option>
                </select>
                <select id="filterLabel" class="filter-select">
                  <option value="">All Labels</option>
                  <option value="announcement">📢 Announcement</option>
                  <option value="update">🔄 Update</option>
                  <option value="event">🎉 Event</option>
                  <option value="general">💬 General</option>
                  <option value="important">🚨 Important</option>
                </select>
                <input type="text" id="searchInput" class="filter-input" placeholder="🔍 Search messages...">
              </div>
            </div>
            
            <div id="messagesContainer" class="message-grid">
              <div class="loader">
                <div class="loader-spinner"></div>
                <p>Loading messages...</p>
              </div>
            </div>
          </div>
        </section>
  `;

  const scripts = `
  <!-- Debug Console -->
  <div class="debug-console" id="debugConsole">
    <div class="debug-header">
      <span class="debug-title">🐛 Debug Console</span>
      <button type="button" onclick="toggleDebugConsole()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;">✕</button>
    </div>
    <div class="debug-body" id="debugBody"></div>
  </div>

  <script>
    const botKey = ${JSON.stringify(bot.key)};
    const apiBase = ${JSON.stringify(PANEL_BASE)};
    let channels = [];
    let messages = [];
    let editingId = null;
    let editingExistingDiscordMessageId = null;
    let channelIndex = new Map();
    
    // New state for enhanced features
    let currentSendMode = 'instant'; // 'instant' or 'schedule'
    let selectedMinute = 0;
    let selectedLabels = new Set();
    let debugEnabled = false;
    
    // Enhanced Debug & Error Logging (uses global from shared-template)
    function logDebug(message, type = 'info') {
      // Log to page-specific debug console
      const debugBody = document.getElementById('debugBody');
      if (debugBody) {
        const icons = { info: '💡', success: '✅', error: '❌', warning: '⚠️' };
        const colors = { info: 'var(--text)', success: 'var(--pearl-aqua)', error: 'var(--bubblegum-pink)', warning: '#f5c77e' };
        
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'debug-entry';
        entry.innerHTML = '<span style="color: var(--text-muted);">[' + time + ']</span> <span style="color: ' + colors[type] + ';">' + icons[type] + ' ' + message + '</span>';
        debugBody.appendChild(entry);
        debugBody.scrollTop = debugBody.scrollHeight;
      }
      
      // Also log to global debug console if available
      if (window.debugLog) window.debugLog('[Messages] ' + message, type);
      
      // Log errors to global error tracking
      if (type === 'error' && window.panelLogError) {
        window.panelLogError(new Error(message), { source: 'messages-page' });
      }
    }
    
    function toggleDebugConsole() {
      const console = document.getElementById('debugConsole');
      if (console) {
        debugEnabled = !debugEnabled;
        console.classList.toggle('open', debugEnabled);
        if (debugEnabled) logDebug('Debug console opened');
      }
    }
    
    // Show alerts with both local and global toast
    function showAlert(msg, type = 'success') {
      // Show in page alert container
      const container = document.getElementById('alertContainer');
      if (container) {
        const d = document.createElement('div');
        d.className = 'alert alert-' + (type === 'error' ? 'error' : 'success');
        d.textContent = msg;
        container.appendChild(d);
        setTimeout(() => d.remove(), 3500);
      }
      
      // Also show global toast
      if (window.showPanelToast) {
        window.showPanelToast(msg, type);
      }
      
      // Log to debug
      logDebug(msg, type === 'error' ? 'error' : 'success');
    }
    
    // Send Mode Tabs
    function initSendModeTabs() {
      const tabs = document.querySelectorAll('.send-mode-tab');
      const instantPanel = document.getElementById('instantSendPanel');
      const schedulePanel = document.getElementById('schedulePanel');
      const sendNowBtn = document.getElementById('sendNowBtn');
      const scheduleBtn = document.getElementById('scheduleBtn');
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          currentSendMode = tab.dataset.mode;
          
          if (currentSendMode === 'instant') {
            if (instantPanel) instantPanel.style.display = 'block';
            if (schedulePanel) schedulePanel.style.display = 'none';
            if (sendNowBtn) sendNowBtn.style.display = 'flex';
            if (scheduleBtn) scheduleBtn.style.display = 'none';
          } else {
            if (instantPanel) instantPanel.style.display = 'none';
            if (schedulePanel) schedulePanel.style.display = 'block';
            if (sendNowBtn) sendNowBtn.style.display = 'none';
            if (scheduleBtn) scheduleBtn.style.display = 'flex';
          }
          
          logDebug('Send mode changed to: ' + currentSendMode);
        });
      });
    }
    
    // Minute Picker
    function initMinutePicker() {
      const picker = document.getElementById('minutePicker');
      if (!picker) return;
      
      picker.addEventListener('click', (e) => {
        const btn = e.target.closest('.minute-btn');
        if (!btn) return;
        
        picker.querySelectorAll('.minute-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedMinute = parseInt(btn.dataset.minute, 10);
        
        logDebug('Selected minute: :' + String(selectedMinute).padStart(2, '0'));
      });
    }
    
    // Label Tags
    function initLabelTags() {
      const container = document.getElementById('labelTags');
      if (!container) return;
      
      container.addEventListener('click', (e) => {
        const tag = e.target.closest('.label-tag');
        if (!tag) return;
        
        const label = tag.dataset.label;
        tag.classList.toggle('active');
        
        if (selectedLabels.has(label)) {
          selectedLabels.delete(label);
        } else {
          selectedLabels.add(label);
        }
        
        logDebug('Labels: [' + Array.from(selectedLabels).join(', ') + ']');
      });
    }
    
    // Frequency Controls
    function initFrequencyControls() {
      const toggle = document.getElementById('frequencyEnabled');
      const controls = document.getElementById('frequencyControls');
      
      if (toggle && controls) {
        toggle.addEventListener('change', () => {
          controls.style.display = toggle.checked ? 'grid' : 'none';
          logDebug('Bot frequency ' + (toggle.checked ? 'enabled' : 'disabled'));
        });
      }
    }
    
    // Schedule Message
    async function scheduleMessage() {
      const date = document.getElementById('scheduleDate')?.value;
      const hour = document.getElementById('scheduleHour')?.value;
      
      if (!date) {
        showAlert('Please select a date', 'error');
        return;
      }
      
      const scheduledTime = new Date(date);
      scheduledTime.setHours(parseInt(hour || 0, 10), selectedMinute, 0, 0);
      
      if (scheduledTime <= new Date()) {
        showAlert('Scheduled time must be in the future', 'error');
        return;
      }
      
      // Build payload and add scheduling info
      const payload = buildPayload('scheduled');
      payload.scheduledFor = scheduledTime.toISOString();
      payload.labels = Array.from(selectedLabels);
      
      try {
        if (!payload.channelId) {
          showAlert('Channel is required', 'error');
          return;
        }
        
        await api(apiBase + '/api/' + botKey + '/messages', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        
        showAlert('Message scheduled for ' + scheduledTime.toLocaleString(), 'success');
        logDebug('Scheduled message for ' + scheduledTime.toISOString(), 'success');
        await loadMessages();
      } catch (e) {
        showAlert('Schedule failed: ' + e.message, 'error');
        logDebug('Schedule failed: ' + e.message, 'error');
      }
    }

    async function api(path, opts = {}) {
      const startTime = Date.now();
      try {
        const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
        const txt = await res.text();
        let json;
        try { json = JSON.parse(txt); } catch { json = null; }
        
        if (!res.ok) {
          const errorMsg = (json && (json.error || json.message)) || txt || ('HTTP ' + res.status);
          const error = new Error(errorMsg);
          error.status = res.status;
          
          // Log to global error tracker
          if (window.panelLogError) {
            window.panelLogError(error, {
              source: 'messages-page',
              path,
              status: res.status,
              duration: Date.now() - startTime
            });
          }
          
          logDebug('API Error: ' + path + ' - ' + errorMsg, 'error');
          throw error;
        }
        
        logDebug('API Success: ' + path + ' (' + (Date.now() - startTime) + 'ms)');
        return json;
      } catch (e) {
        if (!e.status && window.panelLogError) {
          window.panelLogError(e, {
            source: 'messages-page',
            path,
            type: 'network_error',
            duration: Date.now() - startTime
          });
        }
        throw e;
      }
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
      
      // Initialize new UI features
      initSendModeTabs();
      initMinutePicker();
      initLabelTags();
      initFrequencyControls();
      
      // Schedule button handler
      document.getElementById('scheduleBtn')?.addEventListener('click', scheduleMessage);
      
      // Save Draft button
      document.getElementById('saveDraftBtn')?.addEventListener('click', async () => {
        const payload = buildPayload('draft');
        payload.labels = Array.from(selectedLabels);
        
        try {
          if (editingId) {
            await api(apiBase + '/api/' + botKey + '/messages/' + editingId, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            showAlert('Draft #' + editingId + ' updated', 'success');
          } else {
            const resp = await api(apiBase + '/api/' + botKey + '/messages', {
              method: 'POST',
              body: JSON.stringify(payload)
            });
            showAlert('Draft saved' + (resp?.id ? ' as #' + resp.id : ''), 'success');
          }
          await loadMessages();
        } catch (e) {
          showAlert('Save failed: ' + e.message, 'error');
        }
      });
      
      // Clear button
      document.getElementById('clearBtn')?.addEventListener('click', () => {
        document.getElementById('channelSelect').value = '';
        document.getElementById('plainContent').value = '';
        document.getElementById('embedTitle').value = '';
        document.getElementById('embedDesc').value = '';
        document.getElementById('embedColor').value = '#246a73';
        document.getElementById('embedColorPicker').value = '#246a73';
        document.getElementById('embedFooter').value = '';
        document.getElementById('embedImagePreview').style.display = 'none';
        document.getElementById('fileLabel').textContent = 'Click to upload image';
        selectedLabels.clear();
        document.querySelectorAll('.label-tag').forEach(t => t.classList.remove('active'));
        setEditing(null);
        updatePreview();
        logDebug('Form cleared');
      });

      document.getElementById('loadExistingBtn')?.addEventListener('click', loadExistingDiscordMessage);
      document.getElementById('updateExistingBtn')?.addEventListener('click', updateExistingDiscordMessage);
      document.getElementById('clearExistingBtn')?.addEventListener('click', () => {
        const el = document.getElementById('existingMessageId');
        if (el) el.value = '';
        editingExistingDiscordMessageId = null;
      });
      
      // Filter change handlers
      document.getElementById('filterChannel')?.addEventListener('change', renderMessages);
      document.getElementById('filterStatus')?.addEventListener('change', renderMessages);
      document.getElementById('filterLabel')?.addEventListener('change', renderMessages);
      document.getElementById('searchInput')?.addEventListener('input', renderMessages);
      
      logDebug('Message Pool initialized', 'success');

      if (window.requestLocoUpdate) window.requestLocoUpdate();
      else if (window.__locoScroll && window.__locoScroll.update) window.__locoScroll.update();
    });
  </script>
  `;

  return generate({
    head,
    body,
    scripts,
    botKey: bot.key,
    botName: bot.name,
    title: 'JepsenCloud Panel — Message Pool',
    currentPage: 'messages'
  });
}

module.exports = { generateMessagesPage };
