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

function generatePanelHomePage(bots, PANEL_BASE, { username, userRole } = {}) {
  const botTiles = (Array.isArray(bots) ? bots : [])
    .map((b) => {
      const href = `${PANEL_BASE}/bot/${encodeURIComponent(b.key)}`;
      return `
        <a class="tile" href="${href}">
          <div class="tile-title">🤖 ${escapeHtml(b.name)}</div>
          <div class="muted">${escapeHtml(b.key)} • ${escapeHtml(b.kind || "")}</div>
        </a>
      `;
    })
    .join("");

  const body = `
    <div class="page-container">
      <div class="topbar">
        <div class="topbar-content">
          <div class="page-title"><span class="emoji">🏠</span><span class="gradient-text">Dashboard</span></div>
          <div class="page-subtitle">Logged in as ${escapeHtml(username || "")}${userRole ? ` (${escapeHtml(userRole)})` : ""}</div>
        </div>
        <div class="topbar-actions" style="gap:8px">
          <a class="btn btn-secondary" href="${PANEL_BASE}/change-password">🔐 Password</a>
          ${userRole === "admin" ? `<a class="btn btn-secondary" href="${PANEL_BASE}/users">👥 Users</a>` : ""}
          <form method="post" action="${PANEL_BASE}/logout" style="margin:0">
            <button class="btn btn-danger" type="submit">Logout</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Bots</div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px">
          ${botTiles || '<div class="muted">No bots available.</div>'}
        </div>
      </div>
    </div>
  `;

  return generate({
    title: "JepsenCloud Panel",
    botKey: "",
    botName: "JepsenCloud",
    currentPage: "",
    PANEL_BASE,
    navSections: [
      {
        title: "Panel",
        links: [
          { href: `${PANEL_BASE}`, icon: "🏠", label: "Dashboard", id: "dashboard" },
          { href: `${PANEL_BASE}/change-password`, icon: "🔐", label: "Password", id: "password" },
          ...(userRole === "admin"
            ? [{ href: `${PANEL_BASE}/users`, icon: "👥", label: "Users", id: "users" }]
            : []),
        ],
      },
    ],
    head: `
      .tile{display:block;text-decoration:none}
      .tile:hover{transform:translateY(-1px)}
    `,
    body,
    scripts: "",
  });
}

module.exports = { generatePanelHomePage };
