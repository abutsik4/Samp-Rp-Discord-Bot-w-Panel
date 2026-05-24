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

function generateChangePasswordPage(PANEL_BASE, { username, userRole, csrfToken = '', message = null, error = null } = {}) {
  const body = `
    <div class="page-container" style="max-width:700px">
      <div class="topbar">
        <div class="topbar-content">
          <div class="page-title"><span class="emoji">🔐</span><span class="gradient-text">Change Password</span></div>
          <div class="page-subtitle">Logged in as ${escapeHtml(username || "")}</div>
        </div>
        <div class="topbar-actions" style="gap:8px">
          <a class="btn btn-secondary" href="${PANEL_BASE}">← Dashboard</a>
          ${userRole === "admin" ? `<a class="btn btn-secondary" href="${PANEL_BASE}/users">👥 Users</a>` : ""}
          <form method="post" action="${PANEL_BASE}/logout" style="margin:0">
          <input type="hidden" name="_csrf" value="${csrfToken}">
            <button class="btn btn-danger" type="submit">Logout</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Update your password</div>

        ${message ? `<div class="alert alert-success">${escapeHtml(message)}</div>` : ""}
        ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}

        <div class="alert alert-info">
          <strong>Password requirements:</strong>
          <div class="muted" style="margin-top:6px">Minimum 8 characters; cannot be the same as current password.</div>
        </div>

        <form method="post" action="${PANEL_BASE}/change-password">
        <input type="hidden" name="_csrf" value="${csrfToken}">
          <div class="form-group">
            <label>Current Password</label>
            <input name="currentPassword" type="password" required />
          </div>
          <div class="form-group">
            <label>New Password</label>
            <input name="newPassword" type="password" minlength="8" required />
          </div>
          <div class="form-group">
            <label>Confirm New Password</label>
            <input name="confirmPassword" type="password" minlength="8" required />
          </div>
          <div style="display:flex;justify-content:flex-end">
            <button class="btn btn-primary" type="submit">Update Password</button>
          </div>
        </form>
      </div>
    </div>
  `;

  return generate({
    title: "JepsenCloud Panel — Change Password",
    botKey: "",
    botName: "JepsenCloud",
    currentPage: "",
    PANEL_BASE,
    navSections: [
      {
        title: "Panel",
        links: [
          { href: `${PANEL_BASE}`, icon: "🏠", label: "Dashboard", id: "dashboard" },
          ...(userRole === "admin"
            ? [{ href: `${PANEL_BASE}/users`, icon: "👥", label: "Users", id: "users" }]
            : []),
        ],
      },
    ],
    head: "",
    body,
    scripts: "",
  });
}

module.exports = { generateChangePasswordPage };
