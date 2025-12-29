const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const { requireAuth, validateLogin } = require("./auth");
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

function createWebServer({ discordClient }) {
  const app = express();
  const bots = getBotsRegistry({ discordClient });

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
    const ok = await validateLogin(String(username || ""), String(password || ""));
    if (!ok) return res.status(401).render("login", { error: "Invalid login." });

    req.session.user = { ok: true, username };
    return res.redirect("/");
  });

  app.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
  });

  app.get("/", requireAuth, (req, res) => {
    const botList = Object.values(bots).map((b) => ({ key: b.key, name: b.name, kind: b.kind }));
    res.render("home", { bots: botList, username: req.session.user.username });
  });

  app.get("/bot/:botKey", requireAuth, (req, res) => {
    const bot = bots[req.params.botKey];
    if (!bot) return res.status(404).send("Bot not found.");
    res.render("bot", { bot });
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
