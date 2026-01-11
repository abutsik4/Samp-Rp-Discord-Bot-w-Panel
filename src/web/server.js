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
  // Serve root public folder (shared.css, snow.js, etc.) but NOT index.html
  app.use(express.static(path.join(__dirname, "../../public"), { index: false }));

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

  // Public status endpoint with CORS for landing page
  app.get("/api/status", (req, res) => {
    // Allow CORS from jepsencloud.com for the landing page
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    
    const client = discordClient;
    const isReady = client && client.isReady();
    
    // Get bot info
    const botInfo = isReady ? {
      username: client.user?.username || "Unknown",
      discriminator: client.user?.discriminator || "0",
      id: client.user?.id || null,
      avatar: client.user?.displayAvatarURL({ size: 64 }) || null
    } : null;
    
    // Get guilds (servers) the bot is in
    const guilds = isReady ? client.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      icon: g.iconURL({ size: 64 })
    })) : [];
    
    // Uptime
    const uptime = isReady && client.uptime ? client.uptime : 0;
    const uptimeFormatted = uptime > 0 ? formatUptime(uptime) : "N/A";
    
    res.json({
      ok: true,
      bot: {
        online: isReady,
        info: botInfo,
        guilds: guilds,
        guildCount: guilds.length,
        uptime: uptimeFormatted,
        uptimeMs: uptime,
        ping: isReady ? client.ws.ping : null
      },
      timestamp: new Date().toISOString()
    });
  });

  // Helper to format uptime
  function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Redirect old /panel/* URLs to new paths
  app.get("/panel/login", (req, res) => res.redirect("/login"));
  app.get("/panel", (req, res) => res.redirect("/"));
  app.use("/panel", (req, res, next) => {
    // Strip /panel prefix and redirect
    const newPath = req.originalUrl.replace(/^\/panel/, '') || '/';
    res.redirect(newPath);
  });

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

  // API: Get available commands list
  app.get("/api/:botKey/commands", requireAuth, async (req, res) => {
    const bot = bots[req.params.botKey];
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    try {
      const requestedGuildId = String(req.query.guildId || "").trim();
      const guildId = requestedGuildId || bot.client?.guilds.cache.first()?.id || null;
      if (!guildId) return res.json({ ok: true, guildId: null, commands: [] });

      const guild = await bot.client.guilds.fetch(guildId).catch(() => bot.client.guilds.cache.get(guildId));
      if (!guild) return res.status(404).json({ error: "Guild not found" });

      const commandCollection = await guild.commands.fetch();
      const list = Array.from(commandCollection.values()).filter((c) => c && c.type === 1);

      let disabledList = [];
      try {
        disabledList = await statsDb.getDisabledCommands(guildId);
      } catch (e) {
        console.error("Error getting disabled commands:", e);
      }
      const disabledSet = new Set((disabledList || []).map((d) => d.command_name));

      function categorize(cmd) {
        const name = String(cmd?.name || "").toLowerCase();
        const desc = String(cmd?.description || "").toLowerCase();
        if (name.includes("admin") || name.includes("sync") || name.includes("backfill")) return "admin";
        if (desc.includes("owner") || desc.includes("admin")) return "admin";
        return "user";
      }

      const commands = list
        .map((c) => ({
          name: c.name,
          description: c.description,
          options: Array.isArray(c.options) ? c.options.map((o) => ({ name: o?.name, required: !!o?.required })) : [],
          category: categorize(c),
          enabled: !disabledSet.has(c.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return res.json({ ok: true, commands, guildId });
    } catch (e) {
      console.error("Get commands error:", e);
      return res.status(500).json({ error: "Failed to get commands" });
    }
  });

  // API: Toggle command enabled/disabled
  app.post("/api/:botKey/commands/toggle", requireAuth, apiLimiter, async (req, res) => {
    const bot = bots[req.params.botKey];
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const { commandName, enabled, guildId } = req.body;
    if (!commandName) return res.status(400).json({ error: "commandName is required" });

    try {
      const targetGuildId = guildId || bot.client.guilds.cache.first()?.id || "global";
      const username = req.session.user.username;

      if (enabled) {
        await statsDb.enableCommand(targetGuildId, commandName);
      } else {
        await statsDb.disableCommand(targetGuildId, commandName, username);
      }

      return res.json({ ok: true, commandName, enabled, guildId: targetGuildId });
    } catch (e) {
      console.error("Toggle command error:", e);
      return res.status(500).json({ error: "Failed to toggle command" });
    }
  });

  return app;
}

module.exports = { createWebServer };
