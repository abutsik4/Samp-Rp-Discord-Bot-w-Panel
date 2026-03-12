"use strict";

const { dbRun, dbAll } = require("../utils/db-helpers");

async function ensureXpMultipliersTable(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS xp_role_multipliers (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      multiplier REAL NOT NULL DEFAULT 1.0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, role_id)
    )
  `
  );
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_xp_role_multipliers_guild ON xp_role_multipliers(guild_id)`);
}

async function listXpRoleMultipliers(db, guildId) {
  const rows = await dbAll(
    db,
    `SELECT role_id, multiplier, updated_at
     FROM xp_role_multipliers
     WHERE guild_id = ?
     ORDER BY multiplier DESC`,
    [guildId]
  );

  return (rows || []).map((r) => ({
    role_id: String(r.role_id),
    multiplier: Number(r.multiplier),
    updated_at: r.updated_at,
  }));
}

async function upsertXpRoleMultiplier(db, guildId, roleId, multiplier) {
  const role = String(roleId || "").trim();
  const mult = Number(multiplier);
  if (!role) throw new Error("roleId required");
  if (!Number.isFinite(mult) || mult <= 0 || mult > 10) throw new Error("multiplier must be between 0 and 10");

  await dbRun(
    db,
    `INSERT INTO xp_role_multipliers (guild_id, role_id, multiplier)
     VALUES (?, ?, ?)
     ON CONFLICT(guild_id, role_id)
     DO UPDATE SET multiplier = excluded.multiplier, updated_at = (strftime('%s','now'))`,
    [guildId, role, mult]
  );

  return { role_id: role, multiplier: mult };
}

async function deleteXpRoleMultiplier(db, guildId, roleId) {
  const role = String(roleId || "").trim();
  if (!role) throw new Error("roleId required");
  await dbRun(db, `DELETE FROM xp_role_multipliers WHERE guild_id = ? AND role_id = ?`, [guildId, role]);
  return { ok: true };
}

async function getXpMultiplierForRoles(db, guildId, userRoles) {
  const roles = Array.isArray(userRoles) ? userRoles.map((r) => String(r)) : [];
  if (!roles.length) return 1.0;

  const placeholders = roles.map(() => "?").join(",");
  const rows = await dbAll(
    db,
    `SELECT role_id, multiplier
     FROM xp_role_multipliers
     WHERE guild_id = ? AND role_id IN (${placeholders})`,
    [guildId, ...roles]
  );

  let best = 1.0;
  for (const r of rows || []) {
    const m = Number(r.multiplier);
    if (Number.isFinite(m) && m > best) best = m;
  }

  if (!Number.isFinite(best) || best <= 0) return 1.0;
  return Math.min(best, 10.0);
}

module.exports = {
  ensureXpMultipliersTable,
  listXpRoleMultipliers,
  upsertXpRoleMultiplier,
  deleteXpRoleMultiplier,
  getXpMultiplierForRoles,
};
