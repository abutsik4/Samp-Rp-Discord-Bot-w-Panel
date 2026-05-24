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

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return escapeHtml(String(value));
  return d.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
}

function generateUsersPage(users, PANEL_BASE, { username, userRole, csrfToken = '', message = null, error = null } = {}) {
  const rows = (Array.isArray(users) ? users : [])
    .map((u) => {
      const isSelf = username && u.username === username;
      const role = String(u.role || "user");
      return `
        <tr>
          <td><strong>${escapeHtml(u.username)}</strong>${isSelf ? ' <span class="tag">you</span>' : ""}</td>
          <td>${escapeHtml(role)}</td>
          <td>${formatDateTime(u.created_at)}</td>
          <td>${formatDateTime(u.last_login)}</td>
          <td style="white-space:nowrap">
            ${isSelf
              ? `<a class="btn btn-secondary btn-sm" href="${PANEL_BASE}/change-password">🔐 Change</a>`
              : `
                <button class="btn btn-secondary btn-sm" type="button" data-action="reset" data-user="${escapeHtml(u.username)}">🔑 Reset</button>
                <button class="btn btn-danger btn-sm" type="button" data-action="delete" data-user="${escapeHtml(u.username)}">🗑️ Delete</button>
                ${role === "user"
                  ? `<button class="btn btn-secondary btn-sm" type="button" data-action="role" data-user="${escapeHtml(u.username)}" data-role="admin">⬆️ Admin</button>`
                  : `<button class="btn btn-secondary btn-sm" type="button" data-action="role" data-user="${escapeHtml(u.username)}" data-role="user">⬇️ User</button>`
                }
              `}
          </td>
        </tr>
      `;
    })
    .join("");

  const body = `
    <div class="page-container-wide">
      <div class="topbar">
        <div class="topbar-content">
          <div class="page-title"><span class="emoji">👥</span><span class="gradient-text">User Management</span></div>
          <div class="page-subtitle">Logged in as ${escapeHtml(username || "")} (${escapeHtml(userRole || "")})</div>
        </div>
        <div class="topbar-actions" style="gap:8px">
          <a class="btn btn-secondary" href="${PANEL_BASE}">← Dashboard</a>
          <a class="btn btn-secondary" href="${PANEL_BASE}/change-password">🔐 Password</a>
          <form method="post" action="${PANEL_BASE}/logout" style="margin:0">
          <input type="hidden" name="_csrf" value="${csrfToken}">
            <button class="btn btn-danger" type="submit">Logout</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Create new user</div>
        <form method="post" action="${PANEL_BASE}/users/create" class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
          <input type="hidden" name="_csrf" value="${csrfToken}">
          <div class="form-group" style="margin:0">
            <label>Username</label>
            <input name="username" required minlength="3" maxlength="50" pattern="[a-zA-Z0-9_-]+" />
          </div>
          <div class="form-group" style="margin:0">
            <label>Password</label>
            <input name="password" type="password" required minlength="8" />
          </div>
          <div class="form-group" style="margin:0">
            <label>Role</label>
            <select name="role" required>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div style="display:flex;align-items:flex-end;justify-content:flex-end">
            <button class="btn btn-primary" type="submit">Create</button>
          </div>
        </form>
      </div>

      ${message ? `<div class="alert alert-success">${escapeHtml(message)}</div>` : ""}
      ${error ? `<div class="alert alert-error">${escapeHtml(error)}</div>` : ""}

      <div class="card">
        <div class="card-title">Panel users</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Created</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="usersRows">
              ${rows || '<tr><td colspan="5" class="muted">No users.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div id="resetModal" class="modal" style="display:none">
        <div class="modal-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
            <div class="card-title" style="margin:0">Reset password</div>
            <button class="btn btn-secondary btn-sm" type="button" data-close-modal>✕</button>
          </div>
          <div class="muted" style="margin-top:8px">User: <strong id="resetUser"></strong></div>
          <form method="post" action="${PANEL_BASE}/users/reset-password" style="margin-top:12px">
          <input type="hidden" name="_csrf" value="${csrfToken}">
            <input type="hidden" name="username" id="resetUserInput" />
            <div class="form-group">
              <label>New password</label>
              <input name="newPassword" type="password" minlength="8" required />
            </div>
            <div class="form-group">
              <label>Confirm password</label>
              <input name="confirmPassword" type="password" minlength="8" required />
            </div>
            <div style="display:flex;justify-content:flex-end;gap:8px">
              <button class="btn btn-secondary" type="button" data-close-modal>Cancel</button>
              <button class="btn btn-primary" type="submit">Reset</button>
            </div>
          </form>
        </div>
      </div>

      <form id="deleteForm" method="post" action="${PANEL_BASE}/users/delete" style="display:none">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <input type="hidden" name="username" id="deleteUserInput" />
      </form>
      <form id="roleForm" method="post" action="${PANEL_BASE}/users/update-role" style="display:none">
        <input type="hidden" name="_csrf" value="${csrfToken}">
        <input type="hidden" name="username" id="roleUserInput" />
        <input type="hidden" name="role" id="roleValueInput" />
      </form>
    </div>
  `;

  const scripts = `
    <script>
      (function(){
        const rows = document.getElementById('usersRows');
        const modal = document.getElementById('resetModal');
        const resetUser = document.getElementById('resetUser');
        const resetUserInput = document.getElementById('resetUserInput');
        const deleteUserInput = document.getElementById('deleteUserInput');
        const roleUserInput = document.getElementById('roleUserInput');
        const roleValueInput = document.getElementById('roleValueInput');

        function openReset(username){
          resetUser.textContent = username;
          resetUserInput.value = username;
          modal.style.display = 'block';
        }
        function closeReset(){
          modal.style.display = 'none';
          resetUser.textContent = '';
          resetUserInput.value = '';
        }

        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeReset();
          if (e.target && e.target.hasAttribute('data-close-modal')) closeReset();
        });
        modal.querySelectorAll('[data-close-modal]').forEach((b) => b.addEventListener('click', closeReset));

        rows.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-action]');
          if (!btn) return;
          const action = btn.getAttribute('data-action');
          const user = btn.getAttribute('data-user');
          if (!action || !user) return;

          if (action === 'reset') {
            openReset(user);
            return;
          }

          if (action === 'delete') {
            if (!confirm('Delete user "' + user + '"?')) return;
            deleteUserInput.value = user;
            document.getElementById('deleteForm').submit();
            return;
          }

          if (action === 'role') {
            const role = btn.getAttribute('data-role');
            if (!role) return;
            if (!confirm('Change "' + user + '" role to ' + role + '?')) return;
            roleUserInput.value = user;
            roleValueInput.value = role;
            document.getElementById('roleForm').submit();
          }
        });
      })();
    </script>
  `;

  return generate({
    title: "JepsenCloud Panel — Users",
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
        ],
      },
    ],
    head: `
      .tag{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;border:1px solid var(--border);background:rgba(0,0,0,.15);font-size:12px;color:var(--text-muted)}
      .modal{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px;z-index:1000}
      .modal-card{width:100%;max-width:520px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px}
    `,
    body,
    scripts,
  });
}

module.exports = { generateUsersPage };
