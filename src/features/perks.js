"use strict";

const { dbRun, dbAll, dbGet } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");

async function withTransaction(db, fn) {
  return withSerializedTransaction(db, fn);
}

async function ensurePerksTables(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS perk_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL CHECK (trigger_type IN ('badge', 'level')),
      trigger_value TEXT NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('grant_role', 'grant_money', 'grant_xp')),
      action_value TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )
  `
  );

  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_perk_rules_guild ON perk_rules(guild_id)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_perk_rules_trigger ON perk_rules(guild_id, trigger_type, trigger_value)`);
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS perk_grant_claims (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      claim_key TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (guild_id, user_id, claim_key)
    )`
  );
}

async function listPerkRules(db, guildId) {
  const rows = await dbAll(
    db,
    `SELECT id, guild_id, trigger_type, trigger_value, action_type, action_value, enabled, created_at, updated_at
     FROM perk_rules
     WHERE guild_id = ?
     ORDER BY id DESC`,
    [guildId]
  );

  return (rows || []).map((r) => ({
    ...r,
    enabled: Boolean(r.enabled),
  }));
}

async function upsertPerkRule(db, guildId, rule) {
  const triggerType = String(rule?.trigger_type || "").trim();
  const triggerValue = String(rule?.trigger_value || "").trim();
  const actionType = String(rule?.action_type || "").trim();
  const actionValue = String(rule?.action_value || "").trim();
  const enabled = rule?.enabled === undefined ? 1 : (rule.enabled ? 1 : 0);

  if (!triggerType || !["badge", "level"].includes(triggerType)) throw new Error("trigger_type must be 'badge' or 'level'");
  if (!triggerValue) throw new Error("trigger_value required");
  if (triggerType === "level") {
    const n = Number.parseInt(triggerValue, 10);
    if (!Number.isFinite(n) || String(n) !== triggerValue || n < 1) throw new Error("trigger_value must be a positive integer for 'level'");
  }
  if (!actionType || !["grant_role", "grant_money", "grant_xp"].includes(actionType)) throw new Error("action_type must be 'grant_role', 'grant_money', or 'grant_xp'");
  if (!actionValue) throw new Error("action_value required");

  const id = rule?.id != null ? Number(rule.id) : null;

  if (id && Number.isFinite(id)) {
    const existing = await dbGet(db, `SELECT id FROM perk_rules WHERE id = ? AND guild_id = ?`, [id, guildId]);
    if (!existing) throw new Error("Rule not found");

    await dbRun(
      db,
      `UPDATE perk_rules
       SET trigger_type = ?, trigger_value = ?, action_type = ?, action_value = ?, enabled = ?, updated_at = (strftime('%s','now'))
       WHERE id = ? AND guild_id = ?`,
      [triggerType, triggerValue, actionType, actionValue, enabled, id, guildId]
    );

    return { id, guild_id: guildId, trigger_type: triggerType, trigger_value: triggerValue, action_type: actionType, action_value: actionValue, enabled: Boolean(enabled) };
  }

  await dbRun(
    db,
    `INSERT INTO perk_rules (guild_id, trigger_type, trigger_value, action_type, action_value, enabled)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [guildId, triggerType, triggerValue, actionType, actionValue, enabled]
  );

  const row = await dbGet(db, `SELECT last_insert_rowid() as id`);
  return { id: row?.id, guild_id: guildId, trigger_type: triggerType, trigger_value: triggerValue, action_type: actionType, action_value: actionValue, enabled: Boolean(enabled) };
}

async function deletePerkRule(db, guildId, id) {
  const parsed = Number(id);
  if (!Number.isFinite(parsed)) throw new Error("Invalid rule id");
  await dbRun(db, `DELETE FROM perk_rules WHERE id = ? AND guild_id = ?`, [parsed, guildId]);
  return { ok: true };
}

async function getRolesToGrantForTriggers(db, guildId, triggers) {
  if (!triggers || triggers.length === 0) return [];

  const byType = new Map();
  for (const t of triggers) {
    const type = String(t?.type || "").trim();
    const value = String(t?.value || "").trim();
    if (!type || !value) continue;
    if (!byType.has(type)) byType.set(type, new Set());
    byType.get(type).add(value);
  }

  const roles = new Set();

  for (const [type, valuesSet] of byType.entries()) {
    const values = Array.from(valuesSet);
    if (!values.length) continue;

    const placeholders = values.map(() => "?").join(",");
    const rows = await dbAll(
      db,
      `SELECT action_value
       FROM perk_rules
       WHERE guild_id = ?
         AND enabled = 1
         AND action_type = 'grant_role'
         AND trigger_type = ?
         AND trigger_value IN (${placeholders})`,
      [guildId, type, ...values]
    );

    for (const r of rows || []) {
      if (r?.action_value) roles.add(String(r.action_value));
    }
  }

  return Array.from(roles);
}

async function applyRoleGrants({ db, guild, member, triggers, reason }) {
  if (!guild || !member) return { granted: [], skipped: [], errors: [] };

  const guildId = guild.id;
  const rolesToGrant = await getRolesToGrantForTriggers(db, guildId, triggers);
  if (!rolesToGrant.length) return { granted: [], skipped: [], errors: [] };

  const granted = [];
  const skipped = [];
  const errors = [];

  for (const roleId of rolesToGrant) {
    try {
      if (member.roles.cache.has(roleId)) {
        skipped.push(roleId);
        continue;
      }
      await member.roles.add(roleId, reason || "Perk grant");
      granted.push(roleId);
    } catch (e) {
      errors.push({ roleId, error: e?.message || String(e) });
    }
  }

  // Also apply money/XP grants
  const moneyXpResults = await applyMoneyXpGrants(db, guildId, member.id, triggers);

  return { granted, skipped, errors, ...moneyXpResults };
}

/**
 * Apply money and XP grants based on triggers.
 * Only grants once per trigger (uses samp_ledger to track).
 */
async function applyMoneyXpGrants(db, guildId, userId, triggers) {
  if (!triggers || triggers.length === 0) return { moneyGranted: 0, xpGranted: 0 };

  let moneyGranted = 0;
  let xpGranted = 0;

  for (const t of triggers) {
    const type = String(t?.type || "").trim();
    const value = String(t?.value || "").trim();
    if (!type || !value) continue;

    // Get money grants
    const moneyRules = await dbAll(
      db,
      `SELECT action_value FROM perk_rules
       WHERE guild_id = ? AND enabled = 1 AND action_type = 'grant_money'
       AND trigger_type = ? AND trigger_value = ?`,
      [guildId, type, value]
    );

    for (const rule of moneyRules || []) {
      const amount = Number(rule.action_value);
      if (!amount || amount <= 0) continue;

      const key = `perk_money_${type}_${value}`;
      try {
        const granted = await withTransaction(db, async () => {
          const claim = await dbRun(
            db,
            `INSERT OR IGNORE INTO perk_grant_claims(guild_id, user_id, claim_key) VALUES(?, ?, ?)`,
            [guildId, userId, key]
          );
          if (!claim || Number(claim.changes || 0) === 0) return false;

          await dbRun(db, `UPDATE samp_users SET money = money + ? WHERE user_id = ?`, [amount, userId]);
          await dbRun(
            db,
            `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json) VALUES('perk_grant', NULL, ?, ?, ?)`,
            [userId, amount, JSON.stringify({ key, trigger: type, value, guildId })]
          );
          return true;
        });
        if (granted) moneyGranted += amount;
      } catch (_) {}
    }

    // Get XP grants
    const xpRules = await dbAll(
      db,
      `SELECT action_value FROM perk_rules
       WHERE guild_id = ? AND enabled = 1 AND action_type = 'grant_xp'
       AND trigger_type = ? AND trigger_value = ?`,
      [guildId, type, value]
    );

    for (const rule of xpRules || []) {
      const amount = Number(rule.action_value);
      if (!amount || amount <= 0) continue;

      const key = `perk_xp_${type}_${value}`;
      try {
        const granted = await withTransaction(db, async () => {
          const claim = await dbRun(
            db,
            `INSERT OR IGNORE INTO perk_grant_claims(guild_id, user_id, claim_key) VALUES(?, ?, ?)`,
            [guildId, userId, key]
          );
          if (!claim || Number(claim.changes || 0) === 0) return false;

          await dbRun(db, `UPDATE user_levels SET xp = xp + ? WHERE guild_id = ? AND user_id = ?`, [amount, guildId, userId]);
          await dbRun(
            db,
            `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json) VALUES('perk_grant_xp', NULL, ?, ?, ?)`,
            [userId, amount, JSON.stringify({ key, trigger: type, value, guildId })]
          );
          return true;
        });
        if (granted) xpGranted += amount;
      } catch (_) {}
    }
  }

  return { moneyGranted, xpGranted };
}

async function getRolesToGrantForLevelAtOrBelow(db, guildId, level) {
  const lvl = Number.parseInt(level, 10);
  if (!Number.isFinite(lvl) || lvl < 1) return [];

  const rows = await dbAll(
    db,
    `SELECT DISTINCT action_value
     FROM perk_rules
     WHERE guild_id = ?
       AND enabled = 1
       AND action_type = 'grant_role'
       AND trigger_type = 'level'
       AND CAST(trigger_value AS INTEGER) <= ?`,
    [guildId, lvl]
  );

  return (rows || []).map((r) => String(r.action_value)).filter(Boolean);
}

async function reconcilePerksForGuild({ db, guild, limit = 200 }) {
  const guildId = guild.id;

  const effectiveLimit = Math.max(1, Math.min(1000, Number(limit) || 200));

  const badgeUsers = await dbAll(
    db,
    `SELECT user_id, COUNT(*) as badge_count
     FROM user_badges
     WHERE guild_id = ?
     GROUP BY user_id
     ORDER BY badge_count DESC
     LIMIT ?`,
    [guildId, effectiveLimit]
  );

  const levelUsers = await dbAll(
    db,
    `SELECT user_id, level
     FROM user_levels
     WHERE guild_id = ?
     ORDER BY level DESC, xp DESC
     LIMIT ?`,
    [guildId, effectiveLimit]
  );

  const mergedUserIds = [];
  const seen = new Set();
  for (const row of badgeUsers || []) {
    const userId = String(row.user_id);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    mergedUserIds.push(userId);
    if (mergedUserIds.length >= effectiveLimit) break;
  }
  for (const row of levelUsers || []) {
    const userId = String(row.user_id);
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    mergedUserIds.push(userId);
    if (mergedUserIds.length >= effectiveLimit) break;
  }

  const results = { usersProcessed: 0, rolesGranted: 0, errors: 0 };

  for (const userId of mergedUserIds) {
    let member = null;
    try {
      member = await guild.members.fetch(userId);
    } catch {
      continue;
    }

    const badgeRows = await dbAll(db, `SELECT badge_id FROM user_badges WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);
    const triggers = (badgeRows || []).map((b) => ({ type: "badge", value: String(b.badge_id) }));

    const badgeRoleIds = await getRolesToGrantForTriggers(db, guildId, triggers);

    const levelRow = await dbGet(
      db,
      `SELECT level FROM user_levels WHERE guild_id = ? AND user_id = ?`,
      [guildId, userId]
    );
    const levelRoleIds = await getRolesToGrantForLevelAtOrBelow(db, guildId, levelRow?.level || 1);

    const roleIds = Array.from(new Set([...(badgeRoleIds || []), ...(levelRoleIds || [])]));
    const granted = [];
    const skipped = [];
    const errors = [];

    for (const roleId of roleIds) {
      try {
        if (member.roles.cache.has(roleId)) {
          skipped.push(roleId);
          continue;
        }
        await member.roles.add(roleId, "Perk reconcile");
        granted.push(roleId);
      } catch (e) {
        errors.push({ roleId, error: e?.message || String(e) });
      }
    }

    results.usersProcessed += 1;
    results.rolesGranted += granted.length;
    results.errors += errors.length;
  }

  return results;
}

module.exports = {
  ensurePerksTables,
  listPerkRules,
  upsertPerkRule,
  deletePerkRule,
  applyRoleGrants,
  applyMoneyXpGrants,
  reconcilePerksForGuild,
};
