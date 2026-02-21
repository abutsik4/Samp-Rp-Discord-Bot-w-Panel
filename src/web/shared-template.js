// Shared HTML Template Helper for Web Panel Pages
// Provides consistent sidebar layout with Locomotive Scroll across all JS-generated pages

const SHARED_STYLES_LINK = '<link rel="stylesheet" href="/shared.css">';

function generateSidebarHTML(options = {}) {
  const { 
    title = 'JepsenCloud', 
    subtitle = 'Panel', 
    icon = '☁️',
    botKey = '',
    botName = '',
    PANEL_BASE = '/panel',
    navSections = [],
    currentPage = ''
  } = options;

  const defaultNav = botKey ? [
    {
      title: 'Navigation',
      links: [
        { href: `${PANEL_BASE}/bot/${botKey}`, icon: '🏠', label: 'Panel', id: 'panel' },
        { href: `${PANEL_BASE}/bot/${botKey}/stats`, icon: '📊', label: 'Statistics', id: 'stats' },
        { href: `${PANEL_BASE}/bot/${botKey}/analytics`, icon: '📈', label: 'Analytics', id: 'analytics' },
        { href: `${PANEL_BASE}/bot/${botKey}/messages`, icon: '📨', label: 'Messages', id: 'messages' },
      ]
    },
    {
      title: 'Management',
      links: [
        { href: `${PANEL_BASE}/bot/${botKey}/rate-limits`, icon: '🛡️', label: 'Spam Limits', id: 'rate-limits' },
        { href: `${PANEL_BASE}/bot/${botKey}/whitelist`, icon: '📋', label: 'Whitelist', id: 'whitelist' },
        { href: `${PANEL_BASE}/bot/${botKey}/automod`, icon: '🛡️', label: 'Automod', id: 'automod' },
        { href: `${PANEL_BASE}/bot/${botKey}/holidays`, icon: '🎉', label: 'Holidays', id: 'holidays' },
        { href: `${PANEL_BASE}/bot/${botKey}/channels`, icon: '🗑️', label: 'Channels', id: 'channels' },
      ]
    },
    {
      title: 'AI & Tools',
      links: [
        { href: `${PANEL_BASE}/bot/${botKey}/ai-engagement`, icon: '🤖', label: 'AI Engagement', id: 'ai-engagement' },
        { href: `${PANEL_BASE}/bot/${botKey}/commands`, icon: '📚', label: 'Commands', id: 'commands' },
        { href: `${PANEL_BASE}/bot/${botKey}/accuracy`, icon: '🎯', label: 'Accuracy', id: 'accuracy' },
        { href: `${PANEL_BASE}/bot/${botKey}/debug-reports`, icon: '🪲', label: 'Debug Reports', id: 'debug-reports' },
        { href: `${PANEL_BASE}/bot/${botKey}/samp-servers`, icon: '🎮', label: 'SAMP Servers', id: 'samp-servers' },
      ]
    }
  ] : navSections;

  const navHTML = defaultNav.map(section => `
    <div class="sidebar-section">
      <div class="sidebar-section-title">${section.title}</div>
      ${section.links.map(link => `
        <a href="${link.href}" class="sidebar-nav-link${currentPage === link.id ? ' active' : ''}">
          <span class="sidebar-nav-icon">${link.icon}</span>
          <span>${link.label}</span>
        </a>
      `).join('')}
    </div>
  `).join('');

  return `
    <button class="sidebar-toggle" id="sidebarToggle">☰</button>
    <div class="sidebar-overlay" id="sidebarOverlay"></div>

    <nav class="sidebar-nav" id="sidebarNav">
      <div class="sidebar-header">
        <div class="sidebar-brand">
          <div class="sidebar-brand-icon">${icon}</div>
          <div>
            <div class="sidebar-brand-text">${title}</div>
            <div class="sidebar-subtitle">${subtitle}</div>
          </div>
        </div>
      </div>

      <div class="sidebar-menu">
        ${navHTML}
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-footer-links">
          <a href="${PANEL_BASE}/change-password" class="sidebar-footer-link">
            <span>🔐</span>
            <span>Change Password</span>
          </a>
          <a href="${PANEL_BASE}" class="sidebar-footer-link">
            <span>←</span>
            <span>Back to Dashboard</span>
          </a>
          <button onclick="toggleSnow()" class="sidebar-footer-link">
            <span>❄️</span>
            <span>Toggle Snow</span>
          </button>
          <form method="post" action="${PANEL_BASE}/logout" style="margin:0">
            <button type="submit" class="sidebar-footer-link" style="color: var(--accent-rose);">
              <span>🚪</span>
              <span>Logout</span>
            </button>
          </form>
        </div>
      </div>
    </nav>
  `;
}

function generateSidebarStyles() {
  return `
    html, body { height: 100%; }

    .dashboard-wrapper {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    .sidebar-nav {
      width: 280px;
      min-width: 280px;
      background: rgba(10, 14, 23, 0.98);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      z-index: 100;
      backdrop-filter: blur(20px);
    }

    .sidebar-header {
      padding: 24px 20px;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .sidebar-brand-icon {
      width: 44px;
      height: 44px;
      background: var(--gradient-primary);
      border-radius: var(--radius-lg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }

    .sidebar-brand-text {
      font-size: 18px;
      font-weight: 700;
      background: var(--gradient-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .sidebar-subtitle {
      font-size: 12px;
      color: var(--text-muted);
    }

    .sidebar-menu {
      flex: 1;
      overflow-y: auto;
      padding: 16px 12px;
    }

    .sidebar-section {
      margin-bottom: 24px;
    }

    .sidebar-section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      padding: 0 12px;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .sidebar-nav-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      color: var(--text-muted);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.25s ease;
      text-decoration: none;
      border: 1px solid transparent;
    }

    .sidebar-nav-link:hover {
      background: rgba(167, 139, 250, 0.1);
      color: var(--text-bright);
      border-color: rgba(167, 139, 250, 0.2);
    }

    .sidebar-nav-link.active {
      background: var(--gradient-glass);
      color: var(--accent-cyan);
      border-color: rgba(34, 211, 238, 0.3);
    }

    .sidebar-nav-icon { font-size: 18px; width: 24px; text-align: center; }

    .sidebar-footer {
      padding: 16px;
      border-top: 1px solid var(--border);
    }

    .sidebar-footer-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .sidebar-footer-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      color: var(--text-muted);
      font-size: 13px;
      text-decoration: none;
      transition: all 0.2s ease;
      border: none;
      background: none;
      cursor: pointer;
      width: 100%;
      text-align: left;
    }

    .sidebar-footer-link:hover {
      background: rgba(167, 139, 250, 0.1);
      color: var(--text-bright);
    }

    .main-scroll-container {
      flex: 1;
      margin-left: 280px;
      height: 100vh;
      overflow: auto;
    }

    .scroll-progress {
      position: fixed;
      top: 0;
      left: 280px;
      right: 0;
      height: 3px;
      background: rgba(45, 55, 75, 0.5);
      z-index: 1000;
    }

    .scroll-progress-bar {
      height: 100%;
      background: var(--gradient-primary);
      width: 0%;
      transition: width 0.1s ease;
    }

    .panel-section {
      min-height: 100vh;
      padding: 60px 40px;
    }

    .section-header {
      margin-bottom: 32px;
    }

    .section-header.is-inview {
      opacity: 1;
      transform: translateY(0);
      transition: all 1s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .section-title {
      font-size: 32px;
      font-weight: 700;
      background: var(--gradient-primary);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0 0 8px;
    }

    /* Prevent emoji/icon spans from inheriting gradient text fill (causes purple overlay) */
    .section-title > span {
      background: none;
      -webkit-background-clip: border-box;
      -webkit-text-fill-color: initial;
    }

    .section-subtitle {
      color: var(--text-muted);
      font-size: 14px;
    }

    .content-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      margin-bottom: 24px;
    }

    .content-card.is-inview {
      opacity: 1;
      transform: translateY(0);
      transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .sidebar-toggle {
      display: none;
      position: fixed;
      top: 20px;
      left: 20px;
      z-index: 200;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 12px;
      cursor: pointer;
      font-size: 20px;
      color: var(--text);
    }

    .sidebar-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 99;
      backdrop-filter: blur(4px);
    }

    @media (max-width: 1024px) {
      .sidebar-nav {
        transform: translateX(-100%);
        transition: transform 0.3s ease;
      }
      .sidebar-nav.open { transform: translateX(0); }
      .sidebar-toggle { display: flex; }
      .sidebar-overlay.open { display: block; }
      .main-scroll-container { margin-left: 0; }
      .scroll-progress { left: 0; }
      .panel-section { padding: 40px 20px; }
    }
  `;
}

function generateSidebarScripts(PANEL_BASE = '/panel') {
  return `
    <script src="/public/snow.js"></script>
    <script>
      window.PANEL_BASE = ${JSON.stringify(PANEL_BASE)};

      // Native scroll shell: provide safe no-ops for legacy pages.
      window.__locoScroll = null;
      window.requestLocoUpdate = function requestLocoUpdate() {};

      // Shared API helper for JS-generated pages.
      window.panelFetchJson = async function panelFetchJson(url, opts) {
        const res = await fetch(url, {
          credentials: 'same-origin',
          ...opts,
          headers: {
            'Accept': 'application/json',
            ...(opts && opts.headers ? opts.headers : {})
          }
        });

        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        const isJson = ct.includes('application/json');
        if (isJson) {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const err = new Error(data && data.error ? data.error : ('Request failed (' + res.status + ')'));
            err.status = res.status;
            err.data = data;
            throw err;
          }
          return data;
        }

        const bodyText = await res.text().catch(() => '');
        const err = new Error(res.status === 401 ? 'Authentication required' : ('Unexpected response (' + res.status + ')'));
        err.status = res.status;
        err.body = bodyText;
        throw err;
      };

      // Mobile sidebar
      const toggle = document.getElementById('sidebarToggle');
      const overlay = document.getElementById('sidebarOverlay');
      const sidebar = document.getElementById('sidebarNav');
      if (toggle && overlay && sidebar) {
        toggle.addEventListener('click', () => {
          sidebar.classList.toggle('open');
          overlay.classList.toggle('open');
        });
        overlay.addEventListener('click', () => {
          sidebar.classList.remove('open');
          overlay.classList.remove('open');
        });
      }
    </script>

    <script>
      // Debug overlay: Ctrl+Alt+D
      // Helps diagnose "invisible but clickable" issues by inspecting the top-most
      // element at the cursor and listing high-z overlays.
      (function () {
        let lastMouse = { x: Math.floor(window.innerWidth / 2), y: Math.floor(window.innerHeight / 2) };
        window.addEventListener('mousemove', (e) => { lastMouse = { x: e.clientX, y: e.clientY }; }, { passive: true });

        function getPanelBase() {
          return window.PANEL_BASE || '/panel';
        }

        function ensureClientTraceId() {
          if (window.__panelClientTraceId) return window.__panelClientTraceId;
          try {
            if (window.crypto && window.crypto.randomUUID) {
              window.__panelClientTraceId = window.crypto.randomUUID();
              return window.__panelClientTraceId;
            }
          } catch (_) {}
          window.__panelClientTraceId = 'ct-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
          return window.__panelClientTraceId;
        }

        function pickComputed(el) {
          if (!el) return null;
          const cs = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const attrs = {};
          if (el.getAttribute) {
            const id = el.getAttribute('id');
            const cls = el.getAttribute('class');
            if (id) attrs.id = id;
            if (cls) attrs.class = cls;
            const ds = el.getAttribute('data-scroll');
            if (ds != null) attrs['data-scroll'] = ds;
            const dsc = el.getAttribute('data-scroll-class');
            if (dsc != null) attrs['data-scroll-class'] = dsc;
            const role = el.getAttribute('role');
            if (role) attrs.role = role;
            const ariaHidden = el.getAttribute('aria-hidden');
            if (ariaHidden != null) attrs['aria-hidden'] = ariaHidden;
          }
          return {
            tag: (el.tagName || '').toLowerCase(),
            attrs,
            rect: {
              top: Math.round(rect.top),
              left: Math.round(rect.left),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            },
            css: {
              display: cs.display,
              visibility: cs.visibility,
              opacity: cs.opacity,
              position: cs.position,
              zIndex: cs.zIndex,
              pointerEvents: cs.pointerEvents,
              color: cs.color,
              backgroundColor: cs.backgroundColor,
              transform: cs.transform,
              filter: cs.filter,
              backdropFilter: cs.backdropFilter,
              mixBlendMode: cs.mixBlendMode
            }
          };
        }

        function getOverlayCandidates() {
          const nodes = Array.from(document.querySelectorAll('*'));
          const results = [];
          for (const el of nodes) {
            try {
              const cs = window.getComputedStyle(el);
              const pos = cs.position;
              if (pos !== 'fixed' && pos !== 'absolute') continue;
              const z = parseInt(cs.zIndex, 10);
              if (!Number.isFinite(z) || z < 1000) continue;
              if (cs.pointerEvents === 'none') continue;
              const opacity = parseFloat(cs.opacity);
              if (Number.isFinite(opacity) && opacity <= 0.01) continue;
              const rect = el.getBoundingClientRect();
              if (rect.width < 10 || rect.height < 10) continue;
              results.push({
                el,
                z,
                area: Math.round(rect.width * rect.height),
                info: pickComputed(el)
              });
            } catch (_) {}
          }
          results.sort((a, b) => (b.z - a.z) || (b.area - a.area));
          return results.slice(0, 12).map(r => r.info);
        }

        function collectVisibilitySummary() {
          const sample = Array.from(document.querySelectorAll('.section-header,.content-card')).slice(0, 6);
          return sample.map(el => pickComputed(el));
        }

        function buildReport(point) {
          const x = point?.x ?? lastMouse.x;
          const y = point?.y ?? lastMouse.y;
          const topEl = document.elementFromPoint(x, y);
          const chain = [];
          let cur = topEl;
          for (let i = 0; i < 8 && cur; i++) {
            chain.push(pickComputed(cur));
            cur = cur.parentElement;
          }

          return {
            time: new Date().toISOString(),
            clientTraceId: ensureClientTraceId(),
            url: location.href,
            userAgent: navigator.userAgent,
            viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
            point: { x, y },
            flags: {
              hasLocoClass: document.documentElement.classList.contains('has-loco'),
              hasLocoInstance: !!window.__locoScroll,
              hasScrollTrigger: !!window.ScrollTrigger,
              prefersReducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
            },
            elementChain: chain,
            overlayCandidates: getOverlayCandidates(),
            visibilitySample: collectVisibilitySummary()
          };
        }

        function createUI() {
          const root = document.createElement('div');
          root.id = 'panelDebugOverlay';
          root.style.cssText = [
            'position:fixed',
            'right:12px',
            'bottom:12px',
            'width:min(520px, calc(100vw - 24px))',
            'max-height:min(80vh, 720px)',
            'z-index:20000',
            'background:color-mix(in srgb, var(--bg-main) 92%, black)',
            'border:1px solid color-mix(in srgb, var(--border-hover) 55%, transparent)',
            'border-radius:12px',
            'box-shadow:0 10px 40px rgba(0,0,0,.55)',
            'backdrop-filter:blur(12px)',
            'padding:12px',
            'display:none'
          ].join(';');

          const header = document.createElement('div');
          header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;';
          header.innerHTML = '<div style="font-weight:700;color:var(--text)">Panel Debug</div><div style="color:var(--text-muted);font-size:12px">Ctrl+Alt+D</div>';

          const btnRow = document.createElement('div');
          btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;';
          function mkBtn(label, onClick) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText = 'padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:12.5px;';
            b.addEventListener('click', onClick);
            return b;
          }

          const pre = document.createElement('pre');
          pre.id = 'panelDebugPre';
          pre.style.cssText = 'margin:0;white-space:pre-wrap;word-break:break-word;color:var(--text);font-size:11.5px;line-height:1.35;overflow:auto;max-height:calc(80vh - 120px);padding:10px;border-radius:10px;border:1px solid color-mix(in srgb, var(--border) 70%, transparent);background:color-mix(in srgb, var(--bg-card) 75%, black);';

          const status = document.createElement('div');
          status.id = 'panelDebugStatus';
          status.style.cssText = 'margin:8px 0 0 0;color:var(--text-muted);font-size:12px;min-height:16px;';

          function render(report) {
            pre.textContent = JSON.stringify(report, null, 2);
            window.__panelDebugLastReport = report;
          }

          async function sendReport() {
            try {
              const payload = window.__panelDebugLastReport || buildReport();
              status.textContent = 'Sending report…';
              const res = await fetch(getPanelBase() + '/api/debug/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ report: payload })
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                status.textContent = 'Send failed: ' + (data.error || ('HTTP ' + res.status));
                return;
              }
              status.textContent = 'Report saved. Server trace: ' + (data.traceId || '(unknown)');
            } catch (e) {
              status.textContent = 'Send failed: ' + (e && e.message ? e.message : String(e));
            }
          }

          btnRow.appendChild(mkBtn('Capture @ cursor', () => render(buildReport())));
          btnRow.appendChild(mkBtn('Capture @ center', () => render(buildReport({ x: Math.floor(window.innerWidth/2), y: Math.floor(window.innerHeight/2) }))));
          btnRow.appendChild(mkBtn('Refresh scroll', () => { try { window.requestLocoUpdate && window.requestLocoUpdate(); } catch (_) {} }));
          btnRow.appendChild(mkBtn('Send report', () => { sendReport(); }));
          btnRow.appendChild(mkBtn('Copy report', async () => {
            try {
              const txt = JSON.stringify(window.__panelDebugLastReport || buildReport(), null, 2);
              await navigator.clipboard.writeText(txt);
            } catch (_) {
              // fallback: select text
              const range = document.createRange();
              range.selectNodeContents(pre);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }));
          btnRow.appendChild(mkBtn('Close', () => { root.style.display = 'none'; }));

          root.appendChild(header);
          root.appendChild(btnRow);
          root.appendChild(pre);
          root.appendChild(status);
          document.body.appendChild(root);

          // Initial capture
          render(buildReport());
          return root;
        }

        let ui = null;
        function toggle() {
          if (!ui) ui = createUI();
          const isOpen = ui.style.display !== 'none';
          ui.style.display = isOpen ? 'none' : 'block';
          if (!isOpen) {
            try { document.getElementById('panelDebugPre').textContent = JSON.stringify(buildReport(), null, 2); } catch (_) {}
          }
        }

        window.addEventListener('keydown', (e) => {
          if (e.ctrlKey && e.altKey && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            toggle();
          }
        });

        // Optional: open with ?debug=1
        try {
          if (new URLSearchParams(location.search).get('debug') === '1') {
            setTimeout(() => toggle(), 250);
          }
        } catch (_) {}
      })();
    </script>
    
    <!-- Global Error Handler & Debug Logger -->
    <script>
      (function() {
        // Global error log for debugging
        window.__panelErrorLog = [];
        const MAX_ERROR_LOG = 50;
        
        function getPanelBase() {
          const p = location.pathname || '';
          const m = p.match(/^\\/panel(\\/|$)/);
          return m ? '/panel' : '/panel';
        }
        
        function logError(error, context = {}) {
          const entry = {
            time: new Date().toISOString(),
            message: error?.message || String(error),
            stack: error?.stack || null,
            context,
            url: location.href,
            userAgent: navigator.userAgent
          };
          
          window.__panelErrorLog.unshift(entry);
          if (window.__panelErrorLog.length > MAX_ERROR_LOG) {
            window.__panelErrorLog.pop();
          }
          
          console.error('[Panel Error]', entry);
          return entry;
        }
        
        // Expose global error logger
        window.panelLogError = logError;
        
        // Global unhandled error handler
        window.addEventListener('error', (event) => {
          logError(event.error || event.message, {
            type: 'uncaught',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          });
        });
        
        // Unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
          logError(event.reason, { type: 'unhandledrejection' });
        });
        
        // API wrapper with automatic error reporting
        window.panelApi = async function(path, opts = {}) {
          const startTime = Date.now();
          try {
            const res = await fetch(path, {
              headers: { 'Content-Type': 'application/json' },
              ...opts
            });
            const txt = await res.text();
            let json;
            try { json = JSON.parse(txt); } catch { json = null; }
            
            if (!res.ok) {
              const errorMsg = (json && (json.error || json.message)) || txt || ('HTTP ' + res.status);
              const error = new Error(errorMsg);
              error.status = res.status;
              error.response = json;
              logError(error, {
                type: 'api_error',
                path,
                status: res.status,
                duration: Date.now() - startTime
              });
              throw error;
            }
            
            return json;
          } catch (e) {
            if (!e.status) {
              logError(e, {
                type: 'network_error',
                path,
                duration: Date.now() - startTime
              });
            }
            throw e;
          }
        };
        
        // Toast notification system
        window.showPanelToast = function(message, type = 'info', duration = 4000) {
          let container = document.getElementById('panelToastContainer');
          if (!container) {
            container = document.createElement('div');
            container.id = 'panelToastContainer';
            container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:25000;display:flex;flex-direction:column;gap:10px;max-width:380px;pointer-events:none;';
            document.body.appendChild(container);
          }
          
          const colors = {
            success: { bg: 'color-mix(in srgb, var(--pearl-aqua) 20%, var(--bg-card))', border: 'var(--pearl-aqua)', icon: '✅' },
            error: { bg: 'color-mix(in srgb, var(--bubblegum-pink) 20%, var(--bg-card))', border: 'var(--bubblegum-pink)', icon: '❌' },
            warning: { bg: 'color-mix(in srgb, #f5c77e 20%, var(--bg-card))', border: '#f5c77e', icon: '⚠️' },
            info: { bg: 'color-mix(in srgb, var(--pearl-aqua) 10%, var(--bg-card))', border: 'var(--border)', icon: '💡' }
          };
          
          const style = colors[type] || colors.info;
          
          const toast = document.createElement('div');
          toast.style.cssText = 'background:' + style.bg + ';border:1px solid ' + style.border + ';border-radius:12px;padding:14px 18px;color:var(--text);font-size:14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 32px rgba(0,0,0,0.3);backdrop-filter:blur(8px);pointer-events:auto;animation:slideIn 0.3s ease;';
          toast.innerHTML = '<span style="font-size:18px;">' + style.icon + '</span><span style="flex:1;">' + message + '</span><button style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:0;" onclick="this.parentElement.remove()">×</button>';
          
          container.appendChild(toast);
          
          // Add animation keyframes if not present
          if (!document.getElementById('toastAnimStyles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'toastAnimStyles';
            styleEl.textContent = '@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}';
            document.head.appendChild(styleEl);
          }
          
          setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
          }, duration);
        };
        
        // Auto-report critical errors to server (rate limited)
        let lastAutoReport = 0;
        window.autoReportError = function(error, context = {}) {
          const now = Date.now();
          if (now - lastAutoReport < 10000) return; // Rate limit: 1 per 10s
          lastAutoReport = now;
          
          const entry = logError(error, context);
          
          fetch(getPanelBase() + '/api/debug/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              report: {
                type: 'auto_error_report',
                error: entry,
                errorLog: window.__panelErrorLog.slice(0, 5),
                time: new Date().toISOString(),
                url: location.href,
                userAgent: navigator.userAgent
              }
            })
          }).catch(() => {}); // Silent fail for auto-reports
        };
        
        // Debug console (Ctrl+Shift+D) - simpler inline version
        let debugConsoleVisible = false;
        window.toggleDebugConsole = function() {
          let console = document.getElementById('globalDebugConsole');
          if (!console) {
            console = document.createElement('div');
            console.id = 'globalDebugConsole';
            console.style.cssText = 'position:fixed;bottom:20px;left:300px;right:20px;height:200px;background:color-mix(in srgb, var(--bg-card) 95%, black);border:1px solid var(--border);border-radius:12px;z-index:24000;display:none;flex-direction:column;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.4);';
            console.innerHTML = '<div style="padding:10px 14px;background:var(--bg-card);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;"><span style="font-weight:600;color:var(--text);">🐛 Debug Console</span><div><button onclick="document.getElementById(\\'globalDebugConsoleBody\\').innerHTML=\\'\\'" style="background:none;border:none;color:var(--text-muted);cursor:pointer;margin-right:10px;">Clear</button><button onclick="toggleDebugConsole()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;">✕</button></div></div><div id="globalDebugConsoleBody" style="flex:1;overflow:auto;padding:10px;font-family:monospace;font-size:12px;line-height:1.6;"></div>';
            document.body.appendChild(console);
          }
          
          debugConsoleVisible = !debugConsoleVisible;
          console.style.display = debugConsoleVisible ? 'flex' : 'none';
        };
        
        window.debugLog = function(message, type = 'info') {
          const body = document.getElementById('globalDebugConsoleBody');
          if (!body) return;
          
          const colors = { info: 'var(--text)', success: 'var(--pearl-aqua)', error: 'var(--bubblegum-pink)', warning: '#f5c77e' };
          const icons = { info: '💡', success: '✅', error: '❌', warning: '⚠️' };
          
          const time = new Date().toLocaleTimeString();
          const entry = document.createElement('div');
          entry.style.color = colors[type] || colors.info;
          entry.innerHTML = '<span style="color:var(--text-muted);">[' + time + ']</span> ' + (icons[type] || '') + ' ' + message;
          body.appendChild(entry);
          body.scrollTop = body.scrollHeight;
        };
        
        // Keyboard shortcut: Ctrl+Shift+D for debug console
        document.addEventListener('keydown', (e) => {
          if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            toggleDebugConsole();
          }
        });
      })();
    </script>
  `;
}

// Legacy support for old page format
function generatePageHeader(title, botName = '', botKey = '', PANEL_BASE = '/panel') {
  // Redirect to new sidebar-based layout
  return generateSidebarHTML({
    title: botName || 'JepsenCloud',
    subtitle: 'Control Panel',
    icon: '🤖',
    botKey,
    PANEL_BASE
  });
}

function generate({ head = '', body = '', scripts = '', botKey = '', botName = '', title = 'JepsenCloud', currentPage = '', PANEL_BASE = '/panel', navSections = [] }) {
  
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/shared.css">
  <style>
    ${generateSidebarStyles()}
    ${head}
  </style>
</head>
<body>
  <div class="dashboard-wrapper">
    ${generateSidebarHTML({
      title: botName || 'JepsenCloud',
      subtitle: 'Control Panel',
      icon: '🤖',
      botKey,
      PANEL_BASE,
      navSections,
      currentPage
    })}
    
    <main class="main-scroll-container">
      <div id="scrollContainer">${body}</div>
    </main>
  </div>
  ${generateSidebarScripts(PANEL_BASE)}
  ${scripts}
</body>
</html>`;
}

module.exports = {
  SHARED_STYLES_LINK,
  generatePageHeader,
  generateSidebarHTML,
  generateSidebarStyles,
  generateSidebarScripts,
  generate
};
