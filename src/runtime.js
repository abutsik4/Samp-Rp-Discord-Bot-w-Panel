// src/runtime.js
const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
  } = require("discord.js");
  
  const sqlite3 = require("sqlite3").verbose();
  const path = require("path");
  const express = require("express");
  require("dotenv").config();
  
  const helmet = require("helmet");
  const rateLimit = require("express-rate-limit");
  
  // -------------------------
  // ENV
  // -------------------------
  const TOKEN = process.env.DISCORD_TOKEN;
  const OWNER_ID = process.env.OWNER_ID;
  const API_KEY = process.env.RUNTIME_API_KEY; // <— required
  const PORT = Number(process.env.RUNTIME_PORT || 4000);
  
  if (!TOKEN || !OWNER_ID) {
    console.error("Missing DISCORD_TOKEN or OWNER_ID");
    process.exit(1);
  }
  if (!API_KEY) {
    console.error("Missing RUNTIME_API_KEY");
    process.exit(1);
  }
  
  // -------------------------
  // SQLite (stats)
  // -------------------------
  const dbPath = process.env.STATS_DB_PATH
    ? path.resolve(process.env.STATS_DB_PATH)
    : path.join(__dirname, "..", "data", "stats.db");
  
  const db = new sqlite3.Database(dbPath);
  
  db.run(
    `
    CREATE TABLE IF NOT EXISTS user_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `,
    (err) => {
      if (err) console.error("Error creating DB table:", err);
      else console.log("Stats DB ready:", dbPath);
    }
  );
  
  function incrementMessageCount(guildId, userId) {
    db.run(
      `
      INSERT INTO user_stats (guild_id, user_id, message_count)
      VALUES (?, ?, 1)
      ON CONFLICT(guild_id, user_id)
      DO UPDATE SET message_count = message_count + 1
    `,
      [guildId, userId],
      (err) => {
        if (err) console.error("Error incrementing message count:", err);
      }
    );
  }
  
  function decrementMessageCount(guildId, userId, by = 1) {
    const n = Number.isFinite(by) && by > 0 ? Math.floor(by) : 1;
    db.run(
      `
      UPDATE user_stats
      SET message_count = CASE
        WHEN message_count - ? < 0 THEN 0
        ELSE message_count - ?
      END
      WHERE guild_id = ? AND user_id = ?
    `,
      [n, n, guildId, userId],
      (err) => {
        if (err) console.error("Error decrementing message count:", err);
      }
    );
  }
  
  // -------------------------
  // Discord client
  // -------------------------
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel, Partials.Message],
  });
  
  client.once("ready", () => {
    console.log(`Runtime logged in as ${client.user.tag}`);
  });
  
  client.on("messageCreate", (message) => {
    if (!message.guild) return;
    if (!message.author || message.author.bot) return;
    incrementMessageCount(message.guild.id, message.author.id);
  });
  
  client.on("messageDelete", (message) => {
    try {
      if (!message?.guild) return;
      if (!message.author || message.author.bot) return;
      decrementMessageCount(message.guild.id, message.author.id, 1);
    } catch (err) {
      console.error("messageDelete error:", err);
    }
  });
  
  client.on("messageDeleteBulk", (messages) => {
    try {
      if (!messages?.size) return;
      const perUser = new Map();
  
      for (const msg of messages.values()) {
        if (!msg?.guild) continue;
        if (!msg.author || msg.author.bot) continue;
        const key = `${msg.guild.id}:${msg.author.id}`;
        perUser.set(key, (perUser.get(key) || 0) + 1);
      }
  
      for (const [key, count] of perUser.entries()) {
        const [guildId, userId] = key.split(":");
        decrementMessageCount(guildId, userId, count);
      }
    } catch (err) {
      console.error("messageDeleteBulk error:", err);
    }
  });
  
  // -------------------------
  // Runtime API (protected)
  // -------------------------
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "200kb" }));
  
  const apiLimiter = rateLimit({ windowMs: 10_000, max: 60 });
  app.use(apiLimiter);
  
  // API key middleware
  function requireApiKey(req, res, next) {
    const key = req.get("x-api-key");
    if (!key || key !== API_KEY) return res.status(401).json({ error: "Unauthorized" });
    next();
  }
  
  app.get("/health", (req, res) => res.json({ ok: true }));
  
  // List guilds (so panel can choose a server)
  app.get("/api/:botKey/guilds", requireApiKey, async (req, res) => {
    try {
      const guilds = client.guilds.cache.map((g) => ({ id: g.id, name: g.name }));
      return res.json({ ok: true, guilds });
    } catch (e) {
      return res.status(500).json({ error: "Failed to list guilds" });
    }
  });
  
  // List text channels in a guild (for dropdown)
  app.get("/api/:botKey/channels", requireApiKey, async (req, res) => {
    try {
      const guildId = String(req.query.guildId || "").trim();
      if (!guildId) return res.status(400).json({ error: "guildId is required" });
  
      const guild = await client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
  
      const out = [];
      for (const ch of channels.values()) {
        if (!ch) continue;
        if (!ch.isTextBased || !ch.isTextBased()) continue;
        if (ch.isThread && ch.isThread()) continue;
        out.push({ id: ch.id, name: ch.name, type: ch.type });
      }
  
      out.sort((a, b) => a.name.localeCompare(b.name));
      return res.json({ ok: true, channels: out });
    } catch (e) {
      return res.status(500).json({ error: "Failed to list channels" });
    }
  });
  
  function parseHexColor(input, fallback) {
    if (!input || typeof input !== "string") return fallback;
    const hex = input.replace("#", "").trim();
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
    return parseInt(hex, 16);
  }
  
  app.post("/api/:botKey/message/send", requireApiKey, async (req, res) => {
    try {
      const { channelId, content } = req.body;
      if (!channelId) return res.status(400).json({ error: "channelId is required" });
  
      const channel = await client.channels.fetch(String(channelId));
      if (!channel || !channel.isTextBased || !channel.isTextBased()) {
        return res.status(400).json({ error: "Channel is not text-based or not found" });
      }
  
      const msg = await channel.send({ content: String(content || "").slice(0, 1900) });
      return res.json({ ok: true, messageId: msg.id });
    } catch (e) {
      return res.status(500).json({ error: "Failed to send message" });
    }
  });
  
  app.post("/api/:botKey/message/edit", requireApiKey, async (req, res) => {
    try {
      const { channelId, messageId, content } = req.body;
      if (!channelId || !messageId) {
        return res.status(400).json({ error: "channelId and messageId are required" });
      }
  
      const channel = await client.channels.fetch(String(channelId));
      if (!channel || !channel.isTextBased || !channel.isTextBased()) {
        return res.status(400).json({ error: "Channel is not text-based or not found" });
      }
  
      const msg = await channel.messages.fetch(String(messageId));
      await msg.edit({ content: String(content || "").slice(0, 1900) });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: "Failed to edit message" });
    }
  });
  
  app.post("/api/:botKey/embed/send", requireApiKey, async (req, res) => {
    try {
      const { channelId, title, description, color, footer } = req.body;
      if (!channelId || !title || !description) {
        return res.status(400).json({ error: "channelId, title and description are required" });
      }
  
      const channel = await client.channels.fetch(String(channelId));
      if (!channel || !channel.isTextBased || !channel.isTextBased()) {
        return res.status(400).json({ error: "Channel is not text-based or not found" });
      }
  
      const emb = new EmbedBuilder()
        .setTitle(String(title).slice(0, 256))
        .setDescription(String(description).slice(0, 3900))
        .setColor(parseHexColor(color, 0x00aeff))
        .setTimestamp();
  
      if (footer && String(footer).trim()) {
        emb.setFooter({ text: String(footer).trim().slice(0, 2048) });
      }
  
      const msg = await channel.send({ embeds: [emb] });
      return res.json({ ok: true, messageId: msg.id });
    } catch (e) {
      return res.status(500).json({ error: "Failed to send embed" });
    }
  });
  
  app.post("/api/:botKey/embed/edit", requireApiKey, async (req, res) => {
    try {
      const { channelId, messageId, title, description, color, footer } = req.body;
      if (!channelId || !messageId || !title || !description) {
        return res.status(400).json({ error: "channelId, messageId, title and description are required" });
      }
  
      const channel = await client.channels.fetch(String(channelId));
      if (!channel || !channel.isTextBased || !channel.isTextBased()) {
        return res.status(400).json({ error: "Channel is not text-based or not found" });
      }
  
      const msg = await channel.messages.fetch(String(messageId));
      const emb = new EmbedBuilder()
        .setTitle(String(title).slice(0, 256))
        .setDescription(String(description).slice(0, 3900))
        .setColor(parseHexColor(color, 0xe74c3c))
        .setTimestamp();
  
      if (footer && String(footer).trim()) {
        emb.setFooter({ text: String(footer).trim().slice(0, 2048) });
      }
  
      await msg.edit({ embeds: [emb] });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: "Failed to edit embed" });
    }
  });
  
  app.listen(PORT, () => {
    console.log(`Runtime API listening on :${PORT}`);
  });
  
  // Start Discord
  client.login(TOKEN);
  