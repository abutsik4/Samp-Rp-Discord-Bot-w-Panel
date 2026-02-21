"use strict";

const { generate } = require("./shared-template");

function generateBotOverviewPage(bot, PANEL_BASE, { username, userRole } = {}) {
  const head = `
    .quick-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
    .quick-link{display:block;text-decoration:none}
    .quick-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;transition:all .2s}
    .quick-card:hover{transform:translateY(-1px);border-color:var(--border-hover);background:var(--bg-card-hover)}
    .quick-title{display:flex;align-items:center;gap:10px;font-weight:700;margin:0 0 6px}
    .quick-desc{color:var(--text-muted);font-size:13px;margin:0}
    .meta-row{display:flex;gap:10px;flex-wrap:wrap;color:var(--text-muted);font-size:13px}
    .meta-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;border:1px solid var(--border);background:rgba(0,0,0,.15)}
  `;

  const body = `
    <section class="panel-section">
      <div class="section-header">
        <h1 class="section-title"><span>🏠</span> ${bot.name}</h1>
        <p class="section-subtitle">${bot.key}</p>
        <div class="meta-row" style="margin-top:14px">
          ${username ? `<span class="meta-chip">👤 ${username}</span>` : ""}
          ${userRole ? `<span class="meta-chip">🔐 ${userRole}</span>` : ""}
        </div>
      </div>

      <div class="quick-grid">
        <a class="quick-link" href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/stats">
          <div class="quick-card">
            <h3 class="quick-title">📊 Statistics</h3>
            <p class="quick-desc">Message counts, leaderboards, summaries</p>
          </div>
        </a>
        <a class="quick-link" href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/analytics">
          <div class="quick-card">
            <h3 class="quick-title">📈 Analytics</h3>
            <p class="quick-desc">Charts, trends, verification dashboard</p>
          </div>
        </a>
        <a class="quick-link" href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/messages">
          <div class="quick-card">
            <h3 class="quick-title">📨 Messages</h3>
            <p class="quick-desc">Send/edit messages & embeds (allow-list enforced)</p>
          </div>
        </a>
        <a class="quick-link" href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/rate-limits">
          <div class="quick-card">
            <h3 class="quick-title">🛡️ Spam Limits</h3>
            <p class="quick-desc">Configure rate limits, strikes, timeouts</p>
          </div>
        </a>
        <a class="quick-link" href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/whitelist">
          <div class="quick-card">
            <h3 class="quick-title">📋 Whitelist</h3>
            <p class="quick-desc">Choose which channels count messages</p>
          </div>
        </a>
        <a class="quick-link" href="${PANEL_BASE}/bot/${encodeURIComponent(bot.key)}/automod">
          <div class="quick-card">
            <h3 class="quick-title">🛡️ AutoMod</h3>
            <p class="quick-desc">Banned words (Unicode-aware matching)</p>
          </div>
        </a>
      </div>
    </section>
  `;

  return generate({
    head,
    body,
    scripts: "",
    botKey: bot.key,
    botName: bot.name,
    title: `JepsenCloud Panel — ${bot.name}`,
    currentPage: "panel",
    PANEL_BASE,
  });
}

module.exports = { generateBotOverviewPage };
