const bcrypt = require("bcryptjs");

let statsDbInstance = null;

function setStatsDbInstance(instance) {
  statsDbInstance = instance;
}

function requireAuth(req, res, next) {
  if (req.session?.user?.ok) return next();
  return res.redirect("/login");
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.ok && req.session?.user?.role === 'admin') return next();
  return res.status(403).send("Access denied. Admin role required.");
}

async function validateLogin(username, password) {
  if (!username || !password) return false;
  
  // Try database authentication first
  if (statsDbInstance) {
    try {
      const user = await statsDbInstance.getPanelUser(username);
      if (user) {
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (isValid) {
          // Update last login
          await statsDbInstance.updatePanelUserLastLogin(username);
          return { ok: true, username: user.username, role: user.role };
        }
        return false;
      }
    } catch (err) {
      console.error("Database auth error:", err);
    }
  }

  // Fallback to environment variable authentication (legacy)
  const expectedUser = process.env.PANEL_USERNAME || "admin";
  const hash = process.env.PANEL_PASSWORD_HASH;

  if (!hash) return false;
  if (username !== expectedUser) return false;

  const isValid = await bcrypt.compare(password, hash);
  return isValid ? { ok: true, username, role: 'admin' } : false;
}

module.exports = { requireAuth, requireAdmin, validateLogin, setStatsDbInstance };