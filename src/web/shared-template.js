// Shared HTML Template Helper for Web Panel Pages
// Provides consistent header and styling across all JS-generated pages

const SHARED_STYLES_LINK = '<link rel="stylesheet" href="/shared.css">';

function generatePageHeader(title, botName = '', botKey = '', PANEL_BASE = '/panel') {
  const navLinks = botKey ? `
    <button onclick="history.back()" class="btn btn-secondary" type="button">← Back</button>
    <a href="${PANEL_BASE}/bot/${botKey}" class="link">🏠 Panel</a>
    <a href="${PANEL_BASE}/bot/${botKey}/stats" class="link">📊 Stats</a>
    <a href="${PANEL_BASE}/bot/${botKey}/analytics" class="link">📈 Analytics</a>
    <a href="${PANEL_BASE}/bot/${botKey}/rate-limits" class="link">🚦 Rate Limits</a>
    <a href="${PANEL_BASE}/bot/${botKey}/consecutive-limits" class="link">🚫 Consecutive</a>
    <a href="${PANEL_BASE}/bot/${botKey}/messages" class="link">📨 Messages</a>
    <a href="${PANEL_BASE}/bot/${botKey}/ai-engagement" class="link">🤖 AI</a>
    <a href="${PANEL_BASE}/bot/${botKey}/commands" class="link">📚 Commands</a>
    <form method="post" action="${PANEL_BASE}/logout" style="display:inline">
      <button class="btn btn-secondary" type="submit">Logout</button>
    </form>
  ` : '';

  const subtitle = botName && botKey ? `<div class="muted">Bot: ${botName} (${botKey})</div>` : '';

  return `
    <div class="topbar">
      <div class="topbar-content">
        <div class="page-title gradient-text">${title}</div>
        ${subtitle}
      </div>
      <div class="topbar-actions">
        ${navLinks}
      </div>
    </div>
  `;
}

function generate({ head = '', body = '', botKey = '', botName = '', title = 'JepsenCloud', currentPage = '' }) {
  const PANEL_BASE = '/panel';
  
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/shared.css">
  ${head}
</head>
<body>
  ${generatePageHeader(title, botName, botKey, PANEL_BASE)}
  ${body}
  <script src="/public/snow.js"></script>
</body>
</html>`;
}

module.exports = {
  SHARED_STYLES_LINK,
  generatePageHeader,
  generate
};
