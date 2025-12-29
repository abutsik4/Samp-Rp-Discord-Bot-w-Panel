const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcryptjs");

const { requireAuth, requireAdmin, validateLogin, setStatsDbInstance } = require("./auth");
const { getBotsRegistry } = require("./botsRegistry");
const { EmbedBuilder } = require("discord.js");

function parseHexColor(input, fallback) {
  if (!input || typeof input !== "string") return fallback;
  const hex = input.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return parseInt(hex, 16);
}

function allowedChannel(channelId) {
  const list = (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(channelId);
}

function createWebServer({ discordClient, statsDb }) {
  const app = express();
  const bots = getBotsRegistry({ discordClient });

  // Set statsDb instance for authentication
  setStatsDbInstance(statsDb);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));

  app.use(helmet());
  app.use(express.json({ limit: "200kb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use("/public", express.static(path.join(__dirname, "public")));

  app.use(
    session({
      store: new SQLiteStore({ db: "sessions.db", dir: path.join(__dirname, "../../") }),
      secret: process.env.SESSION_SECRET || "change-me-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false // set true when behind HTTPS and you trust proxy (see note below)
      }
    })
  );

  // If you are behind Nginx/Cloudflare HTTPS, uncomment BOTH:
  // app.set("trust proxy", 1);
  // and set cookie.secure=true above

  const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 });
  const apiLimiter = rateLimit({ windowMs: 10_000, max: 30 });

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.get("/login", (req, res) => res.render("login", { error: null }));

  app.post("/login", loginLimiter, async (req, res) => {
    const { username, password } = req.body;
    const result = await validateLogin(String(username || ""), String(password || ""));
    if (!result) return res.status(401).render("login", { error: "Invalid login." });

    req.session.user = { ok: true, username: result.username, role: result.role };
    return res.redirect("/");
  });

  app.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
  });

  app.get("/", requireAuth, (req, res) => {
    const botList = Object.values(bots).map((b) => ({ key: b.key, name: b.name, kind: b.kind }));
    res.render("home", { 
      bots: botList, 
      username: req.session.user.username,
      userRole: req.session.user.role 
    });
  });

  app.get("/bot/:botKey", requireAuth, (req, res) => {
    const bot = bots[req.params.botKey];
    if (!bot) return res.status(404).send("Bot not found.");
    res.render("bot", { 
      bot,
      username: req.session.user.username,
      userRole: req.session.user.role
    });
  });

  // User Management Routes (Admin only)
  app.get("/users", requireAuth, requireAdmin, async (req, res) => {
    try {
      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: null,
        error: null
      });
    } catch (err) {
      console.error("Error loading users:", err);
      res.status(500).send("Error loading users");
    }
  });

  app.post("/users/create", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username, password, role } = req.body;
      
      if (!username || !password || !role) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "All fields are required"
        });
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "Username must contain only letters, numbers, dashes and underscores"
        });
      }

      if (password.length < 8) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "Password must be at least 8 characters"
        });
      }

      // Check if user already exists
      const existing = await statsDb.getPanelUser(username);
      if (existing) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "Username already exists"
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await statsDb.createPanelUser(username, passwordHash, role);

      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: `User "${username}" created successfully`,
        error: null
      });
    } catch (err) {
      console.error("Error creating user:", err);
      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: null,
        error: "Error creating user"
      });
    }
  });

  app.post("/users/delete", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username } = req.body;
      
      if (username === req.session.user.username) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "Cannot delete your own account"
        });
      }

      await statsDb.deletePanelUser(username);

      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: `User "${username}" deleted successfully`,
        error: null
      });
    } catch (err) {
      console.error("Error deleting user:", err);
      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: null,
        error: "Error deleting user"
      });
    }
  });

  app.post("/users/update-role", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username, role } = req.body;
      
      if (username === req.session.user.username) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "Cannot change your own role"
        });
      }

      await statsDb.updatePanelUserRole(username, role);

      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: `User "${username}" role updated to ${role}`,
        error: null
      });
    } catch (err) {
      console.error("Error updating role:", err);
      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: null,
        error: "Error updating role"
      });
    }
  });

  // Admin reset user password
  app.post("/users/reset-password", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { username, newPassword, confirmPassword } = req.body;
      
      if (!username || !newPassword || !confirmPassword) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "All fields are required"
        });
      }

      if (newPassword !== confirmPassword) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "Passwords do not match"
        });
      }

      if (newPassword.length < 8) {
        const users = await statsDb.getAllPanelUsers();
        return res.render("users", { 
          users, 
          username: req.session.user.username,
          userRole: req.session.user.role,
          message: null,
          error: "Password must be at least 8 characters"
        });
      }

      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await statsDb.updatePanelUserPassword(username, newPasswordHash);

      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: `Password for "${username}" has been reset successfully`,
        error: null
      });
    } catch (err) {
      console.error("Error resetting password:", err);
      const users = await statsDb.getAllPanelUsers();
      res.render("users", { 
        users, 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: null,
        error: "Error resetting password"
      });
    }
  });

  // Password Change Routes (All authenticated users)
  app.get("/change-password", requireAuth, (req, res) => {
    res.render("change-password", { 
      username: req.session.user.username,
      userRole: req.session.user.role,
      message: null,
      error: null
    });
  });

  app.post("/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const username = req.session.user.username;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.render("change-password", { 
          username,
          userRole: req.session.user.role,
          message: null,
          error: "All fields are required"
        });
      }

      if (newPassword !== confirmPassword) {
        return res.render("change-password", { 
          username,
          userRole: req.session.user.role,
          message: null,
          error: "New passwords do not match"
        });
      }

      if (newPassword.length < 8) {
        return res.render("change-password", { 
          username,
          userRole: req.session.user.role,
          message: null,
          error: "Password must be at least 8 characters"
        });
      }

      // Verify current password
      const user = await statsDb.getPanelUser(username);
      if (!user) {
        return res.render("change-password", { 
          username,
          userRole: req.session.user.role,
          message: null,
          error: "User not found"
        });
      }

      const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentValid) {
        return res.render("change-password", { 
          username,
          userRole: req.session.user.role,
          message: null,
          error: "Current password is incorrect"
        });
      }

      // Check if new password is same as current
      const isSameAsOld = await bcrypt.compare(newPassword, user.password_hash);
      if (isSameAsOld) {
        return res.render("change-password", { 
          username,
          userRole: req.session.user.role,
          message: null,
          error: "New password must be different from current password"
        });
      }

      // Update password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await statsDb.updatePanelUserPassword(username, newPasswordHash);

      res.render("change-password", { 
        username,
        userRole: req.session.user.role,
        message: "Password changed successfully",
        error: null
      });
    } catch (err) {
      console.error("Error changing password:", err);
      res.render("change-password", { 
        username: req.session.user.username,
        userRole: req.session.user.role,
        message: null,
        error: "Error changing password"
      });
    }
  });

  // API: Send message (text + optional embed)
  app.post("/api/:botKey/message/send", requireAuth, apiLimiter, async (req, res) => {
    const bot = bots[req.params.botKey];
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { channelId, content } = req.body;
    if (!channelId) return res.status(400).json({ error: "channelId is required" });
    if (!allowedChannel(channelId)) return res.status(403).json({ error: "Channel not allowed" });

    try {
      const channel = await bot.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased?.()) return res.status(400).json({ error: "Invalid channel" });

      const msg = await channel.send({ content: String(content || "").slice(0, 1900) });
      return res.json({ ok: true, messageId: msg.id });
    } catch (e) {
      console.error("Send message error:", e);
      return res.status(500).json({ error: "Failed to send message" });
    }
  });

  // API: Send embed
  app.post("/api/:botKey/embed/send", requireAuth, apiLimiter, async (req, res) => {
    const bot = bots[req.params.botKey];
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { channelId, title, description, color, footer } = req.body;
    if (!channelId || !title || !description) {
      return res.status(400).json({ error: "channelId, title, description are required" });
    }
    if (!allowedChannel(channelId)) return res.status(403).json({ error: "Channel not allowed" });

    try {
      const channel = await bot.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased?.()) return res.status(400).json({ error: "Invalid channel" });

      const embed = new EmbedBuilder()
        .setTitle(String(title).slice(0, 256))
        .setDescription(String(description).slice(0, 3900))
        .setColor(parseHexColor(color, 0x00aeff))
        .setTimestamp();

      if (footer && String(footer).trim()) embed.setFooter({ text: String(footer).trim().slice(0, 2048) });

      const msg = await channel.send({ embeds: [embed] });
      return res.json({ ok: true, messageId: msg.id });
    } catch (e) {
      console.error("Send embed error:", e);
      return res.status(500).json({ error: "Failed to send embed" });
    }
  });

  // API: Edit message (content + optional embed replacement)
  app.post("/api/:botKey/message/edit", requireAuth, apiLimiter, async (req, res) => {
    const bot = bots[req.params.botKey];
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { channelId, messageId, content } = req.body;
    if (!channelId || !messageId) return res.status(400).json({ error: "channelId and messageId are required" });
    if (!allowedChannel(channelId)) return res.status(403).json({ error: "Channel not allowed" });

    try {
      const channel = await bot.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased?.()) return res.status(400).json({ error: "Invalid channel" });

      const msg = await channel.messages.fetch(messageId);
      await msg.edit({ content: String(content || "").slice(0, 1900) });
      return res.json({ ok: true });
    } catch (e) {
      console.error("Edit message error:", e);
      return res.status(500).json({ error: "Failed to edit message" });
    }
  });

  // API: Edit embed (replace embed)
  app.post("/api/:botKey/embed/edit", requireAuth, apiLimiter, async (req, res) => {
    const bot = bots[req.params.botKey];
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { channelId, messageId, title, description, color, footer } = req.body;
    if (!channelId || !messageId || !title || !description) {
      return res.status(400).json({ error: "channelId, messageId, title, description are required" });
    }
    if (!allowedChannel(channelId)) return res.status(403).json({ error: "Channel not allowed" });

    try {
      const channel = await bot.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased?.()) return res.status(400).json({ error: "Invalid channel" });

      const msg = await channel.messages.fetch(messageId);

      const embed = new EmbedBuilder()
        .setTitle(String(title).slice(0, 256))
        .setDescription(String(description).slice(0, 3900))
        .setColor(parseHexColor(color, 0xe74c3c))
        .setTimestamp();

      if (footer && String(footer).trim()) embed.setFooter({ text: String(footer).trim().slice(0, 2048) });

      await msg.edit({ embeds: [embed] });
      return res.json({ ok: true });
    } catch (e) {
      console.error("Edit embed error:", e);
      return res.status(500).json({ error: "Failed to edit embed" });
    }
  });

  return app;
}

module.exports = { createWebServer };
