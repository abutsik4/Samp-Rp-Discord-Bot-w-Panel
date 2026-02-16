const { Router } = require("express");
const bcrypt = require("bcryptjs");

function createAuthRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, requireAdmin, loginLimiter,
    validateLogin, createPanelUser, getPanelUser, getAllPanelUsers,
    updatePanelUserPassword, deletePanelUser, updatePanelUserRole,
    escapeHtml, bots, panelHttpLogger,
  } = ctx;

  // -------------------------
  // PANEL ROUTES
  // -------------------------
  router.get(`${PANEL_BASE}/login`, (req, res) => {
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel — Login</title>
  <link rel="icon" type="image/svg+xml" href="/icons/panel.svg" />
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui;background:#070c14;color:#e5e7eb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{width:100%;max-width:420px;background:rgba(5,11,22,.88);border:1px solid rgba(31,42,58,.9);border-radius:16px;padding:16px 16px 14px;box-shadow:0 16px 40px rgba(0,0,0,.45);backdrop-filter: blur(8px)}
    h1{margin:0;font-size:16px;letter-spacing:.2px}
    .muted{color:#9ca3af;font-size:12.5px;margin-top:6px}
    label{display:block;font-size:12px;margin:12px 0 6px;color:#cbd5e1}
    input{width:100%;padding:10px 11px;border-radius:12px;border:1px solid rgba(31,42,58,.95);background:rgba(7,15,32,.85);color:#e5e7eb;outline:none}
    .row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:14px}
    button{padding:10px 14px;border-radius:999px;border:0;cursor:pointer;background:#0ea5e9;color:#06101a;font-weight:800}
    a{color:#93c5fd;text-decoration:none;font-size:12.5px}
    .error{margin:12px 0 0;padding:10px;border-radius:12px;border:1px solid #3b1520;background:#1a0b10;color:#fb7185;font-size:12.5px}
  </style>
</head>
<body>
  <div class="card">
    <h1>JepsenCloud Panel</h1>
    <div class="muted">Sign in to manage your bots.</div>
    <form method="post" action="${PANEL_BASE}/login">
      <label>Username</label>
      <input name="username" autocomplete="username" required />
      <label>Password</label>
      <input name="password" type="password" autocomplete="current-password" required />
      <div class="row">
        <button type="submit">Login</button>
        <a href="/">← Back to landing</a>
      </div>
    </form>
    ${
      !process.env.PANEL_PASSWORD_HASH
        ? `<div class="error">PANEL_PASSWORD_HASH is not set. Panel login will never succeed.</div>`
        : ""
    }
  </div>
</body>
</html>`);
  });

  router.post(`${PANEL_BASE}/login`, loginLimiter, async (req, res) => {
    const username = String(req.body.username || "");
    const password = String(req.body.password || "");

    const result = await validateLogin(username, password);
    if (!result) {
      return res.status(401).send(`<!doctype html>
<html><body style="font-family:system-ui;background:#070c14;color:#e5e7eb;padding:24px">
  <p>Invalid login.</p>
  <p><a style="color:#93c5fd" href="${PANEL_BASE}/login">Try again</a></p>
</body></html>`);
    }

    req.session.user = { ok: true, username: result.username, role: result.role };
    return res.redirect(`${PANEL_BASE}`);
  });

  router.post(`${PANEL_BASE}/logout`, (req, res) => {
    req.session.destroy(() => res.redirect(`${PANEL_BASE}/login`));
  });

  // -------------------------
  // USER MANAGEMENT ROUTES
  // -------------------------

  // User management page (admin only)
  router.get(`${PANEL_BASE}/users`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await getAllPanelUsers();
      const message = req.query.message || null;
      const error = req.query.error || null;
      
      const userRows = users.map(user => `
        <tr>
          <td><strong>${escapeHtml(user.username)}</strong></td>
          <td><span class="role-badge role-${user.role}">${user.role.toUpperCase()}</span></td>
          <td>${new Date(user.created_at).toLocaleDateString()}</td>
          <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
          <td>
            ${user.username !== req.session.user.username ? `
              <button class="btn-small" onclick="showResetPasswordModal('${escapeHtml(user.username)}')">🔑 Reset</button>
              <button class="btn-small btn-danger" onclick="confirmDelete('${escapeHtml(user.username)}')">🗑️ Delete</button>
              ${user.role === 'user' 
                ? `<button class="btn-small btn-primary" onclick="changeRole('${escapeHtml(user.username)}', 'admin')">⬆️ Admin</button>`
                : `<button class="btn-small" onclick="changeRole('${escapeHtml(user.username)}', 'user')">⬇️ User</button>`
              }
            ` : `<a href="${PANEL_BASE}/change-password" class="btn-small">🔐 Change</a>`}
          </td>
        </tr>
      `).join('');

      res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>User Management — JepsenCloud Panel</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui;background:#070c14;color:#e5e7eb}
    .wrap{max-width:1100px;margin:0 auto;padding:18px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .title{font-weight:850;font-size:16px}
    .muted{color:#9ca3af;font-size:12.5px;margin-top:4px}
    .card{background:rgba(5,11,22,.86);border:1px solid rgba(31,42,58,.9);border-radius:16px;padding:20px;margin-top:20px}
    .btn-small{padding:6px 12px;font-size:13px;margin-right:6px;border-radius:8px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb;cursor:pointer}
    .btn-small:hover{background:rgba(31,42,58,.9)}
    .btn-primary{background:rgba(99,102,241,.3);border-color:rgba(99,102,241,.5)}
    .btn-danger{background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.4)}
    .pill{padding:9px 12px;border-radius:999px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb;cursor:pointer}
    a{color:#93c5fd;text-decoration:none}
    table{width:100%;border-collapse:collapse;margin-top:20px}
    th{background:rgba(99,102,241,.1);padding:12px;text-align:left;border-bottom:2px solid rgba(31,42,58,.9)}
    td{padding:12px;border-bottom:1px solid rgba(31,42,58,.9)}
    tr:hover{background:rgba(99,102,241,.05)}
    .role-badge{display:inline-block;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600}
    .role-admin{background:rgba(239,68,68,.2);color:#f87171}
    .role-user{background:rgba(59,130,246,.2);color:#60a5fa}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:#34d399;padding:12px;border-radius:8px;margin-bottom:16px}
    .alert-error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;padding:12px;border-radius:8px;margin-bottom:16px}
    .modal{display:none;position:fixed;z-index:1000;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,.7);backdrop-filter:blur(4px)}
    .modal-content{background:#0c111d;margin:10% auto;padding:30px;border:1px solid rgba(31,42,58,.9);border-radius:12px;width:90%;max-width:500px}
    .close{color:#9ca3af;float:right;font-size:28px;cursor:pointer}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;margin-bottom:6px;font-weight:500}
    .form-group input,.form-group select{width:100%;padding:10px;border-radius:8px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb}
    .btn-full{width:100%;padding:12px;border-radius:8px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:600;cursor:pointer}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">👥 User Management</div>
        <div class="muted">Logged in as ${escapeHtml(req.session.user.username)} (${req.session.user.role})</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <a href="${PANEL_BASE}">← Dashboard</a>
        <a href="${PANEL_BASE}/change-password">🔐 Password</a>
        <form method="post" action="${PANEL_BASE}/logout"><button class="pill" type="submit">Logout</button></form>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="margin:0">Panel Users</h2>
        <button class="btn-small btn-primary" onclick="showCreateUserModal()">➕ Create User</button>
      </div>

      ${message ? `<div class="alert-success">${escapeHtml(message)}</div>` : ''}
      ${error ? `<div class="alert-error">${escapeHtml(error)}</div>` : ''}

      <table>
        <thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Last Login</th><th>Actions</th></tr></thead>
        <tbody>${userRows}</tbody>
      </table>
    </div>
  </div>

  <!-- Create User Modal -->
  <div id="createUserModal" class="modal">
    <div class="modal-content">
      <span class="close" onclick="closeModal('createUserModal')">&times;</span>
      <h2 style="margin-top:0">Create New User</h2>
      <form method="post" action="${PANEL_BASE}/users/create">
        <div class="form-group">
          <label>Username</label>
          <input name="username" required minlength="3" maxlength="50" pattern="[a-zA-Z0-9_-]+" placeholder="alphanumeric, dashes, underscores" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input name="password" type="password" required minlength="8" placeholder="min 8 characters" />
        </div>
        <div class="form-group">
          <label>Role</label>
          <select name="role" required>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button class="btn-full" type="submit">Create User</button>
      </form>
    </div>
  </div>

  <!-- Reset Password Modal -->
  <div id="resetPasswordModal" class="modal">
    <div class="modal-content">
      <span class="close" onclick="closeModal('resetPasswordModal')">&times;</span>
      <h2 style="margin-top:0">🔑 Reset Password</h2>
      <p style="color:#9ca3af">Set new password for: <strong id="resetUsername"></strong></p>
      <form method="post" action="${PANEL_BASE}/users/reset-password">
        <input type="hidden" name="username" id="resetUsernameInput" />
        <div class="form-group">
          <label>New Password</label>
          <input name="newPassword" type="password" required minlength="8" placeholder="min 8 characters" />
        </div>
        <div class="form-group">
          <label>Confirm Password</label>
          <input name="confirmPassword" type="password" required minlength="8" placeholder="confirm password" />
        </div>
        <button class="btn-full" type="submit">Reset Password</button>
      </form>
    </div>
  </div>

  <script>
    function showCreateUserModal() { document.getElementById('createUserModal').style.display = 'block'; }
    function showResetPasswordModal(username) {
      document.getElementById('resetUsername').textContent = username;
      document.getElementById('resetUsernameInput').value = username;
      document.getElementById('resetPasswordModal').style.display = 'block';
    }
    function closeModal(id) { document.getElementById(id).style.display = 'none'; }
    window.onclick = function(e) {
      if (e.target.classList.contains('modal')) e.target.style.display = 'none';
    }
    function confirmDelete(username) {
      if (confirm('Delete user "' + username + '"?')) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '${PANEL_BASE}/users/delete';
        form.innerHTML = '<input type="hidden" name="username" value="' + username + '">';
        document.body.appendChild(form);
        form.submit();
      }
    }
    function changeRole(username, role) {
      if (confirm('Change "' + username + '" role to ' + role + '?')) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '${PANEL_BASE}/users/update-role';
        form.innerHTML = '<input type="hidden" name="username" value="' + username + '"><input type="hidden" name="role" value="' + role + '">';
        document.body.appendChild(form);
        form.submit();
      }
    }
  </script>
</body>
</html>`);
    } catch (err) {
      console.error("Error loading users:", err);
      res.status(500).send("Error loading users");
    }
  });

  // Create user
  router.post(`${PANEL_BASE}/users/create`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username, password, role } = req.body;
      
      if (!username || !password || !role) {
        return res.redirect(`${PANEL_BASE}/users?error=All fields are required`);
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.redirect(`${PANEL_BASE}/users?error=Invalid username format`);
      }
      if (password.length < 8) {
        return res.redirect(`${PANEL_BASE}/users?error=Password must be at least 8 characters`);
      }
      
      const existing = await getPanelUser(username);
      if (existing) {
        return res.redirect(`${PANEL_BASE}/users?error=Username already exists`);
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await createPanelUser(username, passwordHash, role);
      res.redirect(`${PANEL_BASE}/users?message=User "${username}" created successfully`);
    } catch (err) {
      console.error("Error creating user:", err);
      res.redirect(`${PANEL_BASE}/users?error=Error creating user`);
    }
  });

  // Delete user
  router.post(`${PANEL_BASE}/users/delete`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username } = req.body;
      if (username === req.session.user.username) {
        return res.redirect(`${PANEL_BASE}/users?error=Cannot delete your own account`);
      }
      await deletePanelUser(username);
      res.redirect(`${PANEL_BASE}/users?message=User "${username}" deleted`);
    } catch (err) {
      console.error("Error deleting user:", err);
      res.redirect(`${PANEL_BASE}/users?error=Error deleting user`);
    }
  });

  // Update user role
  router.post(`${PANEL_BASE}/users/update-role`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username, role } = req.body;
      if (username === req.session.user.username) {
        return res.redirect(`${PANEL_BASE}/users?error=Cannot change your own role`);
      }
      await updatePanelUserRole(username, role);
      res.redirect(`${PANEL_BASE}/users?message=User "${username}" role updated to ${role}`);
    } catch (err) {
      console.error("Error updating role:", err);
      res.redirect(`${PANEL_BASE}/users?error=Error updating role`);
    }
  });

  // Reset user password (admin)
  router.post(`${PANEL_BASE}/users/reset-password`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username, newPassword, confirmPassword } = req.body;
      
      if (!newPassword || !confirmPassword) {
        return res.redirect(`${PANEL_BASE}/users?error=All fields are required`);
      }
      if (newPassword !== confirmPassword) {
        return res.redirect(`${PANEL_BASE}/users?error=Passwords do not match`);
      }
      if (newPassword.length < 8) {
        return res.redirect(`${PANEL_BASE}/users?error=Password must be at least 8 characters`);
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await updatePanelUserPassword(username, passwordHash);
      res.redirect(`${PANEL_BASE}/users?message=Password for "${username}" reset successfully`);
    } catch (err) {
      console.error("Error resetting password:", err);
      res.redirect(`${PANEL_BASE}/users?error=Error resetting password`);
    }
  });

  // Change own password page
  router.get(`${PANEL_BASE}/change-password`, requireAuth, (req, res) => {
    const message = req.query.message || null;
    const error = req.query.error || null;
    
    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Change Password — JepsenCloud Panel</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui;background:#070c14;color:#e5e7eb}
    .wrap{max-width:500px;margin:0 auto;padding:18px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .title{font-weight:850;font-size:16px}
    .muted{color:#9ca3af;font-size:12.5px;margin-top:4px}
    .card{background:rgba(5,11,22,.86);border:1px solid rgba(31,42,58,.9);border-radius:16px;padding:24px;margin-top:20px}
    .pill{padding:9px 12px;border-radius:999px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb;cursor:pointer}
    a{color:#93c5fd;text-decoration:none}
    .form-group{margin-bottom:16px}
    .form-group label{display:block;margin-bottom:6px;font-weight:500}
    .form-group input{width:100%;padding:10px;border-radius:8px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb}
    .btn-full{width:100%;padding:12px;border-radius:8px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:600;cursor:pointer}
    .alert-success{background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);color:#34d399;padding:12px;border-radius:8px;margin-bottom:16px}
    .alert-error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:#f87171;padding:12px;border-radius:8px;margin-bottom:16px}
    .info-box{background:rgba(99,102,241,.1);border-left:3px solid #6366f1;padding:12px;margin-bottom:20px;border-radius:4px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">🔐 Change Password</div>
        <div class="muted">Logged in as ${escapeHtml(req.session.user.username)}</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <a href="${PANEL_BASE}">← Dashboard</a>
        ${req.session.user.role === 'admin' ? `<a href="${PANEL_BASE}/users">👥 Users</a>` : ''}
        <form method="post" action="${PANEL_BASE}/logout"><button class="pill" type="submit">Logout</button></form>
      </div>
    </div>

    <div class="card">
      ${message ? `<div class="alert-success">✅ ${escapeHtml(message)}</div>` : ''}
      ${error ? `<div class="alert-error">⚠️ ${escapeHtml(error)}</div>` : ''}

      <div class="info-box">
        <strong>Password Requirements:</strong><br>
        • Minimum 8 characters<br>
        • Cannot be the same as current password
      </div>

      <form method="post" action="${PANEL_BASE}/change-password">
        <div class="form-group">
          <label>Current Password</label>
          <input name="currentPassword" type="password" required placeholder="Enter current password" />
        </div>
        <div class="form-group">
          <label>New Password</label>
          <input name="newPassword" type="password" required minlength="8" placeholder="Enter new password" />
        </div>
        <div class="form-group">
          <label>Confirm New Password</label>
          <input name="confirmPassword" type="password" required minlength="8" placeholder="Confirm new password" />
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn-full" type="submit">🔒 Update Password</button>
        </div>
      </form>
    </div>
  </div>
</body>
</html>`);
  });

  // Change own password action
  router.post(`${PANEL_BASE}/change-password`, requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const username = req.session.user.username;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.redirect(`${PANEL_BASE}/change-password?error=All fields are required`);
      }
      if (newPassword !== confirmPassword) {
        return res.redirect(`${PANEL_BASE}/change-password?error=New passwords do not match`);
      }
      if (newPassword.length < 8) {
        return res.redirect(`${PANEL_BASE}/change-password?error=Password must be at least 8 characters`);
      }

      // Verify current password
      const user = await getPanelUser(username);
      if (!user) {
        return res.redirect(`${PANEL_BASE}/change-password?error=User not found`);
      }

      const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentValid) {
        return res.redirect(`${PANEL_BASE}/change-password?error=Current password is incorrect`);
      }

      const isSameAsOld = await bcrypt.compare(newPassword, user.password_hash);
      if (isSameAsOld) {
        return res.redirect(`${PANEL_BASE}/change-password?error=New password must be different`);
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await updatePanelUserPassword(username, newPasswordHash);
      res.redirect(`${PANEL_BASE}/change-password?message=Password changed successfully`);
    } catch (err) {
      console.error("Error changing password:", err);
      res.redirect(`${PANEL_BASE}/change-password?error=Error changing password`);
    }
  });

  // Panel home (bot tiles)
  router.get(`${PANEL_BASE}`, requireAuth, (req, res) => {
    const tiles = bots
      .map(
        (b) => `
        <a href="${PANEL_BASE}/bot/${encodeURIComponent(b.key)}" style="text-decoration:none;color:inherit">
          <div class="tile">
            <div class="tTitle">${escapeHtml(b.name)}</div>
            <div class="tMeta">Type: ${escapeHtml(b.kind)}</div>
          </div>
        </a>`
      )
      .join("");

    res.send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>JepsenCloud Panel</title>
  <style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui;background:#070c14;color:#e5e7eb}
    .wrap{max-width:1100px;margin:0 auto;padding:18px}
    .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
    .title{font-weight:850;font-size:16px}
    .muted{color:#9ca3af;font-size:12.5px;margin-top:4px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
    .tile{background:rgba(5,11,22,.86);border:1px solid rgba(31,42,58,.9);border-radius:16px;padding:14px;box-shadow:0 14px 34px rgba(0,0,0,.35);backdrop-filter: blur(8px)}
    .tTitle{font-weight:850}
    .tMeta{color:#9ca3af;font-size:12.5px;margin-top:6px}
    .pill{padding:9px 12px;border-radius:999px;border:1px solid rgba(31,42,58,.9);background:rgba(17,28,45,.75);color:#e5e7eb;cursor:pointer}
    a{color:#93c5fd;text-decoration:none}
    .role-badge{display:inline-block;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:600;margin-left:6px}
    .role-admin{background:rgba(239,68,68,.2);color:#f87171}
    .role-user{background:rgba(59,130,246,.2);color:#60a5fa}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">JepsenCloud Panel</div>
        <div class="muted">Logged in as ${escapeHtml(req.session.user.username)} <span class="role-badge role-${req.session.user.role || 'user'}">${(req.session.user.role || 'user').toUpperCase()}</span></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <a href="${PANEL_BASE}/change-password">🔐 Password</a>
        ${req.session.user.role === 'admin' ? `<a href="${PANEL_BASE}/users">👥 Users</a>` : ''}
        <a href="/">Landing</a>
        <form method="post" action="${PANEL_BASE}/logout"><button class="pill" type="submit">Logout</button></form>
      </div>
    </div>
    <div class="grid">${tiles}</div>
  </div>
</body>
</html>`);
  });

  return router;
}

module.exports = { createAuthRouter };
