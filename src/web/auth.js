const bcrypt = require("bcryptjs");

function requireAuth(req, res, next) {
  if (req.session?.user?.ok) return next();
  return res.redirect("/login");
}

async function validateLogin(username, password) {
  const expectedUser = process.env.PANEL_USERNAME || "admin";
  const hash = process.env.PANEL_PASSWORD_HASH;

  if (!hash) return false;
  if (!username || !password) return false;
  if (username !== expectedUser) return false;

  return bcrypt.compare(password, hash);
}

module.exports = { requireAuth, validateLogin };