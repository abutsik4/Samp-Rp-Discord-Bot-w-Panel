"use strict";

const { generate } = require("./shared-template");

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function generateLoginPage(PANEL_BASE, { error = null, showSetupWarning = false } = {}) {
  const body = `
    <div class="page-container" style="max-width:520px">
      <div class="topbar">
        <div class="topbar-content">
          <div class="page-title"><span class="emoji">☁️</span><span class="gradient-text">JepsenCloud Panel</span></div>
          <div class="page-subtitle">Sign in to manage your bots.</div>
        </div>
        <div class="topbar-actions">
          <a class="btn btn-secondary" href="/">← Back to landing</a>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Login</div>

        ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}
        ${showSetupWarning ? `
          <div class="alert alert-warning">
            No panel users found and <code>PANEL_PASSWORD_HASH</code> is not set.
            Create a panel user (e.g. via <code>node scripts/init-panel-users.js</code>) or set <code>PANEL_PASSWORD_HASH</code>.
          </div>
        ` : ""}

        <form method="post" action="${PANEL_BASE}/login">
          <div class="form-group">
            <label>Username</label>
            <input name="username" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input name="password" type="password" autocomplete="current-password" required />
          </div>
          <div style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary" type="submit">Login</button>
          </div>
        </form>
      </div>
    </div>
  `;

  return generate({
    title: "JepsenCloud Panel — Login",
    botKey: "",
    botName: "JepsenCloud",
    currentPage: "",
    PANEL_BASE,
    navSections: [
      {
        title: "Panel",
        links: [{ href: "/", icon: "🏠", label: "Landing", id: "landing" }],
      },
    ],
    head: "",
    body,
    scripts: "",
  });
}

module.exports = { generateLoginPage };
