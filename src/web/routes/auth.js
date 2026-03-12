const { Router } = require("express");
const bcrypt = require("bcryptjs");

const { generateLoginPage } = require("../login-page");
const { generatePanelHomePage } = require("../panel-home-page");
const { generateUsersPage } = require("../users-page");
const { generateChangePasswordPage } = require("../change-password-page");

function createAuthRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, requireAdmin, loginLimiter,
    validateLogin, createPanelUser, getPanelUser, getAllPanelUsers,
    updatePanelUserPassword, deletePanelUser, updatePanelUserRole,
    escapeHtml, bots, panelHttpLogger, dbGet, useLegacyPages,
  } = ctx;

  // -------------------------
  // SPA AUTH/API ROUTES
  // -------------------------

  router.post(`${PANEL_BASE}/api/auth/login`, loginLimiter, async (req, res) => {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");

    const result = await validateLogin(username, password);
    if (!result) {
      return res.status(401).json({ ok: false, error: "Invalid login" });
    }

    req.session.user = { ok: true, username: result.username, role: result.role };
    return res.json({ ok: true, user: req.session.user });
  });

  router.post(`${PANEL_BASE}/api/auth/logout`, (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get(`${PANEL_BASE}/api/auth/me`, (req, res) => {
    const user = req.session?.user;
    if (!user?.ok) {
      return res.status(401).json({ ok: false, authenticated: false });
    }
    return res.json({ ok: true, authenticated: true, user });
  });

  router.get(`${PANEL_BASE}/api/auth/bots`, requireAuth, async (_req, res) => {
    const items = (bots || []).map((bot) => ({
      key: bot.key,
      name: bot.name,
      kind: bot.kind,
      guild_id: bot.guild_id,
    }));
    return res.json({ ok: true, items });
  });

  router.get(`${PANEL_BASE}/api/auth/users`, requireAuth, requireAdmin, async (_req, res) => {
    try {
      const users = await getAllPanelUsers();
      return res.json({ ok: true, users });
    } catch (err) {
      return res.status(500).json({ ok: false, error: "Failed to load users" });
    }
  });

  router.post(`${PANEL_BASE}/api/auth/users`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username, password, role } = req.body || {};
      if (!username || !password || !role) {
        return res.status(400).json({ ok: false, error: "username, password, and role are required" });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        return res.status(400).json({ ok: false, error: "Invalid username format (letters, digits, _ and - only)" });
      }
      if (password.length < 8) {
        return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
      }
      if (!["admin", "user"].includes(role)) {
        return res.status(400).json({ ok: false, error: "Role must be admin or user" });
      }
      const existing = await getPanelUser(username);
      if (existing) {
        return res.status(409).json({ ok: false, error: "Username already exists" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      await createPanelUser(username, passwordHash, role);
      return res.json({ ok: true, username });
    } catch (err) {
      console.error("Error creating user:", err);
      return res.status(500).json({ ok: false, error: "Error creating user" });
    }
  });

  router.delete(`${PANEL_BASE}/api/auth/users/:username`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username } = req.params;
      if (username === req.session.user.username) {
        return res.status(400).json({ ok: false, error: "Cannot delete your own account" });
      }
      const existing = await getPanelUser(username);
      if (!existing) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }
      await deletePanelUser(username);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Error deleting user:", err);
      return res.status(500).json({ ok: false, error: "Error deleting user" });
    }
  });

  router.post(`${PANEL_BASE}/api/auth/users/:username/role`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username } = req.params;
      const { role } = req.body || {};
      if (username === req.session.user.username) {
        return res.status(400).json({ ok: false, error: "Cannot change your own role" });
      }
      if (!["admin", "user"].includes(role)) {
        return res.status(400).json({ ok: false, error: "Role must be admin or user" });
      }
      const existing = await getPanelUser(username);
      if (!existing) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }
      await updatePanelUserRole(username, role);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Error updating role:", err);
      return res.status(500).json({ ok: false, error: "Error updating role" });
    }
  });

  router.post(`${PANEL_BASE}/api/auth/users/:username/password`, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username } = req.params;
      const { newPassword } = req.body || {};
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ ok: false, error: "New password must be at least 8 characters" });
      }
      const existing = await getPanelUser(username);
      if (!existing) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await updatePanelUserPassword(username, passwordHash);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Error resetting password:", err);
      return res.status(500).json({ ok: false, error: "Error resetting password" });
    }
  });

  router.post(`${PANEL_BASE}/api/auth/me/password`, requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      const username = req.session.user.username;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ ok: false, error: "currentPassword and newPassword are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ ok: false, error: "New password must be at least 8 characters" });
      }
      const user = await getPanelUser(username);
      if (!user) {
        return res.status(404).json({ ok: false, error: "User not found" });
      }
      const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentValid) {
        return res.status(401).json({ ok: false, error: "Current password is incorrect" });
      }
      const isSameAsOld = await bcrypt.compare(newPassword, user.password_hash);
      if (isSameAsOld) {
        return res.status(400).json({ ok: false, error: "New password must be different from current" });
      }
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await updatePanelUserPassword(username, newPasswordHash);
      return res.json({ ok: true });
    } catch (err) {
      console.error("Error changing password:", err);
      return res.status(500).json({ ok: false, error: "Error changing password" });
    }
  });

  if (!useLegacyPages) {
    return router;
  }

  // -------------------------
  // PANEL ROUTES
  // -------------------------
  router.get(`${PANEL_BASE}/login`, async (req, res) => {
    const hasEnvHash = !!process.env.PANEL_PASSWORD_HASH;
    let hasDbUsers = false;
    try {
      const row = await dbGet(`SELECT COUNT(*) as c FROM panel_users`, []);
      hasDbUsers = (row?.c || 0) > 0;
    } catch {
      hasDbUsers = false;
    }

    const error = String(req.query?.error || "").trim() || null;
    res.send(
      generateLoginPage(PANEL_BASE, {
        error,
        showSetupWarning: !hasEnvHash && !hasDbUsers,
      })
    );
  });

  router.post(`${PANEL_BASE}/login`, loginLimiter, async (req, res) => {
    const username = String(req.body.username || "");
    const password = String(req.body.password || "");

    const result = await validateLogin(username, password);
    if (!result) {
      return res.redirect(302, `${PANEL_BASE}/login?error=${encodeURIComponent("Invalid login")}`);
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

      res.send(
        generateUsersPage(users, PANEL_BASE, {
          username: req.session.user.username,
          userRole: req.session.user.role,
          message,
          error,
        })
      );
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

    res.send(
      generateChangePasswordPage(PANEL_BASE, {
        username: req.session.user.username,
        userRole: req.session.user.role,
        message,
        error,
      })
    );
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
    res.send(
      generatePanelHomePage(bots, PANEL_BASE, {
        username: req.session.user.username,
        userRole: req.session.user.role,
      })
    );
  });

  return router;
}

module.exports = { createAuthRouter };
