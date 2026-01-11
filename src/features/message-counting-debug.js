"use strict";

const { dbGet, dbAll } = require("../utils/db-helpers");

async function getMessageTrace(db, guildId, messageId, limit = 50) {
  const mid = String(messageId || "").trim();
  if (!mid) throw new Error("messageId is required");

  const gid = guildId ? String(guildId).trim() : null;

  const indexRow = await dbGet(
    db,
    `SELECT * FROM message_index WHERE message_id = ? ${gid ? "AND guild_id = ?" : ""}`,
    gid ? [mid, gid] : [mid]
  );

  const events = await dbAll(
    db,
    `SELECT * FROM message_count_events WHERE message_id = ? ${gid ? "AND guild_id = ?" : ""} ORDER BY timestamp DESC LIMIT ?`,
    gid ? [mid, gid, limit] : [mid, limit]
  );

  const errors = await dbAll(
    db,
    `SELECT * FROM message_count_errors WHERE message_id = ? ${gid ? "AND guild_id = ?" : ""} ORDER BY created_at DESC LIMIT ?`,
    gid ? [mid, gid, limit] : [mid, limit]
  );

  return {
    messageId: mid,
    guildId: gid,
    index: indexRow,
    events,
    errors,
  };
}

async function getUserTrace(db, guildId, userId, limit = 50) {
  const uid = String(userId || "").trim();
  if (!uid) throw new Error("userId is required");

  const gid = guildId ? String(guildId).trim() : null;

  const stats = await dbGet(
    db,
    `SELECT message_count FROM user_stats WHERE user_id = ? ${gid ? "AND guild_id = ?" : ""}`,
    gid ? [uid, gid] : [uid]
  );

  const indexed = await dbGet(
    db,
    `SELECT COUNT(*) as count FROM message_index WHERE user_id = ? ${gid ? "AND guild_id = ?" : ""}`,
    gid ? [uid, gid] : [uid]
  );

  const recentEvents = await dbAll(
    db,
    `SELECT * FROM message_count_events WHERE user_id = ? ${gid ? "AND guild_id = ?" : ""} ORDER BY timestamp DESC LIMIT ?`,
    gid ? [uid, gid, limit] : [uid, limit]
  );

  const recentErrors = await dbAll(
    db,
    `SELECT * FROM message_count_errors WHERE user_id = ? ${gid ? "AND guild_id = ?" : ""} ORDER BY created_at DESC LIMIT ?`,
    gid ? [uid, gid, limit] : [uid, limit]
  );

  return {
    userId: uid,
    guildId: gid,
    storedCount: stats?.message_count || 0,
    indexedCount: indexed?.count || 0,
    discrepancy: (indexed?.count || 0) - (stats?.message_count || 0),
    recentEvents,
    recentErrors,
  };
}

module.exports = {
  getMessageTrace,
  getUserTrace,
};
