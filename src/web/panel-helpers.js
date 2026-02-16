"use strict";
/**
 * Panel helper functions — extracted from index.js
 *
 * Call `init({ db, dbRun, dbGet, dbAll, panelBase })` once at startup.
 */

const bcrypt = require("bcryptjs");
const { EmbedBuilder, ChannelType, PermissionsBitField } = require("discord.js");

let _db = null;
let _dbRun = null;
let _dbGet = null;
let _dbAll = null;
let _panelBase = "/panel";

function init({ db, dbRun, dbGet, dbAll, panelBase }) {
  _db = db;
  _dbRun = dbRun;
  _dbGet = dbGet;
  _dbAll = dbAll;
  if (panelBase != null) _panelBase = panelBase;
}

// ── HTML / validation helpers ──────────────────────────────────────────

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseHexColor(input, fallback) {
  if (!input || typeof input !== "string") return fallback;
  const hex = input.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return parseInt(hex, 16);
}

function validateLength(value, max, label) {
  if (value == null) return { ok: true, value: "" };
  const str = String(value);
  if (str.length > max) return { ok: false, error: `${label} too long (max ${max} chars)` };
  return { ok: true, value: str };
}

// ── Auth middleware ────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.session?.user?.ok) return next();
  return res.redirect(`${_panelBase}/login`);
}

function requireAdmin(req, res, next) {
  if (req.session?.user?.ok && req.session?.user?.role === "admin") return next();
  return res.status(403).send("Access denied. Admin role required.");
}

// ── Panel user management ──────────────────────────────────────────────

function createPanelUser(username, passwordHash, role = "user") {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    _db.run(
      `INSERT INTO panel_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)`,
      [username, passwordHash, role, now],
      function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, username, role });
      }
    );
  });
}

function getPanelUser(username) {
  return new Promise((resolve, reject) => {
    _db.get(`SELECT * FROM panel_users WHERE username = ?`, [username], (err, row) =>
      err ? reject(err) : resolve(row)
    );
  });
}

function getAllPanelUsers() {
  return new Promise((resolve, reject) => {
    _db.all(
      `SELECT id, username, role, created_at, last_login FROM panel_users ORDER BY created_at DESC`,
      [],
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });
}

function updatePanelUserPassword(username, newPasswordHash) {
  return new Promise((resolve, reject) => {
    _db.run(`UPDATE panel_users SET password_hash = ? WHERE username = ?`, [newPasswordHash, username], (err) =>
      err ? reject(err) : resolve()
    );
  });
}

function updatePanelUserLastLogin(username) {
  return new Promise((resolve, reject) => {
    const now = Date.now();
    _db.run(`UPDATE panel_users SET last_login = ? WHERE username = ?`, [now, username], (err) =>
      err ? reject(err) : resolve()
    );
  });
}

function deletePanelUser(username) {
  return new Promise((resolve, reject) => {
    _db.run(`DELETE FROM panel_users WHERE username = ?`, [username], (err) =>
      err ? reject(err) : resolve()
    );
  });
}

function updatePanelUserRole(username, newRole) {
  return new Promise((resolve, reject) => {
    _db.run(`UPDATE panel_users SET role = ? WHERE username = ?`, [newRole, username], (err) =>
      err ? reject(err) : resolve()
    );
  });
}

async function validateLogin(username, password) {
  if (!username || !password) return false;

  try {
    const user = await getPanelUser(username);
    if (user) {
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (isValid) {
        await updatePanelUserLastLogin(username);
        return { ok: true, username: user.username, role: user.role };
      }
      return false;
    }
  } catch (err) {
    console.error("Database auth error:", err);
  }

  // Fallback to environment variable authentication (legacy)
  const expectedUser = process.env.PANEL_USERNAME || "admin";
  const hash = process.env.PANEL_PASSWORD_HASH;
  if (!hash) return false;
  if (username !== expectedUser) return false;
  const isValid = await bcrypt.compare(password, hash);
  return isValid ? { ok: true, username, role: "admin" } : false;
}

// ── Panel sent-items library ───────────────────────────────────────────

async function upsertPanelItem(item) {
  const { bot_key, kind, guild_id, channel_id, message_id, content, title, description, color, footer } = item;

  await _dbRun(
    `INSERT INTO panel_sent_items
       (bot_key, kind, guild_id, channel_id, message_id, content, title, description, color, footer, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(bot_key, channel_id, message_id) DO UPDATE SET
       kind=excluded.kind, guild_id=excluded.guild_id, content=excluded.content,
       title=excluded.title, description=excluded.description, color=excluded.color,
       footer=excluded.footer, updated_at=datetime('now'), deleted_at=NULL`,
    [bot_key, kind, guild_id || null, channel_id, message_id, content || null, title || null, description || null, color || null, footer || null]
  );

  return _dbGet(
    `SELECT * FROM panel_sent_items WHERE bot_key=? AND channel_id=? AND message_id=?`,
    [bot_key, channel_id, message_id]
  );
}

async function markPanelItemDeleted(botKey, channelId, messageId) {
  await _dbRun(
    `UPDATE panel_sent_items SET deleted_at = datetime('now'), updated_at=datetime('now') WHERE bot_key=? AND channel_id=? AND message_id=?`,
    [botKey, channelId, messageId]
  );
}

async function deletePanelItemLocalById(id) {
  await _dbRun(`DELETE FROM panel_sent_items WHERE id=?`, [id]);
}

async function listPanelItems(botKey, { limit = 100, kind = "all" } = {}) {
  const safeLimit = Math.max(1, Math.min(300, Number(limit) || 100));
  const params = [botKey];
  let where = `WHERE bot_key = ?`;
  if (kind === "message" || kind === "embed") {
    where += ` AND kind = ?`;
    params.push(kind);
  }
  return _dbAll(
    `SELECT id, bot_key, kind, guild_id, channel_id, message_id,
            content, title, description, color, footer,
            created_at, updated_at, deleted_at
     FROM panel_sent_items ${where} ORDER BY updated_at DESC LIMIT ?`,
    [...params, safeLimit]
  );
}

async function getPanelItemById(id) {
  return _dbGet(`SELECT * FROM panel_sent_items WHERE id=?`, [id]);
}

// ── Discord helpers for panel ──────────────────────────────────────────

async function fetchChannelForBot(botClient, channelId) {
  return botClient.channels.fetch(channelId);
}

function isTextSendableChannel(channel) {
  if (!channel) return false;
  return typeof channel.isTextBased === "function" ? channel.isTextBased() : false;
}

function extractEmbedForStorage(embed) {
  if (!embed) return null;
  return {
    title: embed.title || null,
    description: embed.description || null,
    color: embed.color != null ? "#" + embed.color.toString(16).padStart(6, "0") : null,
    footer: embed.footer?.text || null,
  };
}

function buildEmbedFromFields({ title, description, color, footer }, fallbackColorInt) {
  const e = new EmbedBuilder()
    .setTitle(String(title || "").slice(0, 256))
    .setDescription(String(description || "").slice(0, 3900))
    .setColor(parseHexColor(color, fallbackColorInt))
    .setTimestamp();
  if (footer && String(footer).trim()) {
    e.setFooter({ text: String(footer).trim().slice(0, 2048) });
  }
  return e;
}

async function getAllSendableChannels(botClient, isAllowedChannel) {
  const out = [];
  for (const guild of botClient.guilds.cache.values()) {
    let channels;
    try {
      channels = await guild.channels.fetch();
    } catch {
      continue;
    }
    for (const [, ch] of channels) {
      if (!ch) continue;
      const isText =
        ch.type === ChannelType.GuildText ||
        ch.type === ChannelType.GuildAnnouncement ||
        ch.type === ChannelType.PublicThread ||
        ch.type === ChannelType.PrivateThread ||
        ch.type === ChannelType.AnnouncementThread;
      if (!isText) continue;
      if (!isAllowedChannel(ch.id)) continue;

      const perms = ch.permissionsFor(botClient.user?.id || botClient.application?.id);
      if (!perms) continue;
      const canView = perms.has(PermissionsBitField.Flags.ViewChannel);
      const canSend = ch.isThread()
        ? perms.has(PermissionsBitField.Flags.SendMessagesInThreads)
        : perms.has(PermissionsBitField.Flags.SendMessages);
      if (!canView || !canSend) continue;

      out.push({
        id: ch.id,
        name: ch.name || "(no-name)",
        guild_id: guild.id,
        guild_name: guild.name || "(unknown)",
      });
    }
  }
  out.sort((a, b) => {
    const g = a.guild_name.localeCompare(b.guild_name);
    return g !== 0 ? g : a.name.localeCompare(b.name);
  });
  return out;
}

// ── Exports ────────────────────────────────────────────────────────────

module.exports = {
  init,
  // HTML / validation
  escapeHtml,
  parseHexColor,
  validateLength,
  // Auth middleware
  requireAuth,
  requireAdmin,
  // Panel user management
  createPanelUser,
  getPanelUser,
  getAllPanelUsers,
  updatePanelUserPassword,
  updatePanelUserLastLogin,
  deletePanelUser,
  updatePanelUserRole,
  validateLogin,
  // Sent-items library
  upsertPanelItem,
  markPanelItemDeleted,
  deletePanelItemLocalById,
  listPanelItems,
  getPanelItemById,
  // Discord helpers
  fetchChannelForBot,
  isTextSendableChannel,
  extractEmbedForStorage,
  buildEmbedFromFields,
  getAllSendableChannels,
};
