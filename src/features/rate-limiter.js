"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Message Rate Limiting Module
 * Spam Limits Module
 * Turn-taking / consecutive limiting: other user speaks -> counter resets.
 */

// -------------------------
// IN-MEMORY STATE (Turn-taking)
// -------------------------
// guildId:channelId -> { lastUserId: string, count: number, updatedAt: number }
const consecutiveState = new Map();
const CONSECUTIVE_STATE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function pruneConsecutiveState(nowMs = Date.now()) {
  let removed = 0;
  for (const [key, value] of consecutiveState.entries()) {
    if (!value || typeof value.updatedAt !== "number" || nowMs - value.updatedAt > CONSECUTIVE_STATE_TTL_MS) {
      consecutiveState.delete(key);
      removed++;
    }
  }
  return removed;
}

function noteConsecutiveMessage(guildId, channelId, userId, nowMs = Date.now()) {
  const key = `${guildId}:${channelId}`;
  const prev = consecutiveState.get(key);
  let nextCount = 1;

  if (prev && typeof prev.updatedAt === "number" && nowMs - prev.updatedAt <= CONSECUTIVE_STATE_TTL_MS) {
    nextCount = prev.lastUserId === userId ? (prev.count + 1) : 1;
  }

  consecutiveState.set(key, { lastUserId: userId, count: nextCount, updatedAt: nowMs });
  return { current: nextCount };
}

// -------------------------
// DATABASE FUNCTIONS
// -------------------------

/**
 * Ensure rate limiting tables exist
 */
async function ensureRateLimitTables(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS rate_limit_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      default_limit INTEGER DEFAULT 10,
      time_window_minutes INTEGER DEFAULT 60,
      role_limits TEXT DEFAULT '[]',
      warning_message TEXT DEFAULT 'You have exceeded the message limit for this channel.',
      action TEXT DEFAULT 'delete',
      strike_reset_days INTEGER DEFAULT 7,
      strike_role_multipliers TEXT DEFAULT '[]',
      timeout_mappings TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, channel_id)
    )
  `
  );

  // Legacy: frequency-based limiter stored per-message rows in rate_limit_messages.
  // Turn-taking/consecutive limiting doesn't need this table; drop it to save DB space.
  try { await dbRun(db, `DROP INDEX IF EXISTS idx_rate_messages`); } catch (_) {}
  try { await dbRun(db, `DROP TABLE IF EXISTS rate_limit_messages`); } catch (_) {}

  // Legacy field: time_window_minutes is no longer used.
  // Keep the column for backwards compatibility, but clear stored values.
  try { await dbRun(db, `UPDATE rate_limit_config SET time_window_minutes = NULL WHERE time_window_minutes IS NOT NULL`); } catch (_) {}

  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS rate_limit_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      violation_count INTEGER DEFAULT 1,
      last_violation INTEGER DEFAULT (strftime('%s', 'now')),
      total_violations INTEGER DEFAULT 1,
      will_reset_at INTEGER,
      UNIQUE(guild_id, user_id)
    )
  `
  );

  await dbRun(
    db,
    `
    CREATE INDEX IF NOT EXISTS idx_rate_violations 
    ON rate_limit_violations(guild_id, user_id)
  `
  );

  // Countdown configuration table
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS countdown_config (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      channel_id TEXT,
      hour INTEGER DEFAULT 11,
      minute INTEGER DEFAULT 0,
      timezone_offset INTEGER DEFAULT 180,
      last_posted INTEGER,
      total_posts INTEGER DEFAULT 0
    )
  `
  );

  // MIGRATION: Add missing columns to existing tables
  // Add will_reset_at column if it doesn't exist
  try {
    await dbRun(db, `ALTER TABLE rate_limit_violations ADD COLUMN will_reset_at INTEGER`);
    console.log('[Migration] Added will_reset_at column to rate_limit_violations');
  } catch (e) {
    // Column already exists, ignore
    if (!e.message.includes('duplicate column')) {
      console.warn('[Migration] Could not add will_reset_at column:', e.message);
    }
  }

  // Add new columns to rate_limit_config if they don't exist
  const newConfigColumns = [
    'strike_reset_days INTEGER DEFAULT 7',
    'strike_role_multipliers TEXT DEFAULT \'[]\'',
    'timeout_mappings TEXT DEFAULT \'[]\'',
    'timeouts_enabled INTEGER DEFAULT 1',
    'timeout_duration_per_strike INTEGER DEFAULT 1',
    'ignore_admins INTEGER DEFAULT 1'
  ];

  for (const columnDef of newConfigColumns) {
    const columnName = columnDef.split(' ')[0];
    try {
      await dbRun(db, `ALTER TABLE rate_limit_config ADD COLUMN ${columnDef}`);
      console.log(`[Migration] Added ${columnName} column to rate_limit_config`);
    } catch (e) {
      // Column already exists, ignore
      if (!e.message.includes('duplicate column')) {
        console.warn(`[Migration] Could not add ${columnName} column:`, e.message);
      }
    }
  }
}


/**
 * Get rate limit configuration for a channel
 */
async function getRateLimitConfig(db, guildId, channelId) {
  const config = await dbGet(db, `SELECT * FROM rate_limit_config WHERE guild_id = ? AND channel_id = ?`, [guildId, channelId]);

  if (!config) {
    return null; // No rate limiting configured for this channel
  }

  // Parse JSON fields
  config.role_limits = JSON.parse(config.role_limits || "[]");
  config.strike_role_multipliers = JSON.parse(config.strike_role_multipliers || "[]");
  config.timeout_mappings = JSON.parse(config.timeout_mappings || "[]");
  config.enabled = Boolean(config.enabled);
  config.timeouts_enabled = config.timeouts_enabled !== undefined ? Boolean(config.timeouts_enabled) : true;
  config.ignore_admins = config.ignore_admins !== undefined ? Boolean(config.ignore_admins) : true;

  return config;
}

/**
 * Set rate limit configuration for a channel
 */

async function setRateLimitConfig(db, guildId, channelId, config) {
  // Normalize frontend keys to DB keys
  if (config.timeout_per_strike !== undefined && config.timeout_duration_per_strike === undefined) config.timeout_duration_per_strike = config.timeout_per_strike;

  const existing = await getRateLimitConfig(db, guildId, channelId);

  // Helper to fallback to existing value or default
  const val = (key, def) => {
    if (config[key] !== undefined) return config[key];
    if (existing && existing[key] !== undefined) return existing[key];
    return def;
  };
  
  // Helper for boolean fields (handling DB 0/1 vs JS boolean)
  const boolVal = (key, existingKey, defVal) => {
    if (config[key] !== undefined) return config[key] ? 1 : 0;
    if (existing && existing[existingKey] !== undefined) return existing[existingKey] ? 1 : 0;
    return defVal ? 1 : 0;
  };

  // Helper for JSON fields
  const jsonVal = (key, existingKey, defVal) => {
    if (config[key] !== undefined) return JSON.stringify(config[key]);
    if (existing && existing[existingKey] !== undefined) return JSON.stringify(existing[existingKey]);
    return JSON.stringify(defVal);
  };

  const enabled = boolVal('enabled', 'enabled', true);
  const defaultLimit = val('default_limit', 10);
  // Turn-taking: time window is unused; store NULL.
  const timeWindowMinutes = null;
  const roleLimits = jsonVal('role_limits', 'role_limits', []);
  const warningMessage = val('warning_message', "You have exceeded the message limit for this channel.");
  const action = val('action', "delete");
  
  const strikeResetDays = val('strike_reset_days', 7);
  const strikeRoleMultipliers = jsonVal('strike_role_multipliers', 'strike_role_multipliers', []);
  const timeoutMappings = jsonVal('timeout_mappings', 'timeout_mappings', []);
  const timeoutsEnabled = boolVal('timeouts_enabled', 'timeouts_enabled', true);
  const timeoutDurationPerStrike = val('timeout_duration_per_strike', 1);
  const ignoreAdmins = boolVal('ignore_admins', 'ignore_admins', true);

  if (existing) {
    // Update existing
    await dbRun(
      db,
      `
      UPDATE rate_limit_config
      SET enabled = ?, default_limit = ?, time_window_minutes = ?, 
          role_limits = ?, warning_message = ?, action = ?,
          strike_reset_days = ?, strike_role_multipliers = ?, timeout_mappings = ?,
          timeouts_enabled = ?, timeout_duration_per_strike = ?, ignore_admins = ?,
          updated_at = strftime('%s', 'now')
      WHERE guild_id = ? AND channel_id = ?
    `,
      [enabled, defaultLimit, timeWindowMinutes, roleLimits, warningMessage, action,
       strikeResetDays, strikeRoleMultipliers, timeoutMappings,
       timeoutsEnabled, timeoutDurationPerStrike, ignoreAdmins,
       guildId, channelId]
    );
  } else {
    // Insert new
    await dbRun(
      db,
      `
      INSERT INTO rate_limit_config 
      (guild_id, channel_id, enabled, default_limit, time_window_minutes, role_limits, warning_message, action,
       strike_reset_days, strike_role_multipliers, timeout_mappings,
       timeouts_enabled, timeout_duration_per_strike, ignore_admins)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [guildId, channelId, enabled, defaultLimit, timeWindowMinutes, roleLimits, warningMessage, action,
       strikeResetDays, strikeRoleMultipliers, timeoutMappings,
       timeoutsEnabled, timeoutDurationPerStrike, ignoreAdmins]
    );
  }
}

/**
 * Delete rate limit configuration
 */
async function deleteRateLimitConfig(db, guildId, channelId) {
  await dbRun(db, `DELETE FROM rate_limit_config WHERE guild_id = ? AND channel_id = ?`, [guildId, channelId]);
}

/**
 * Get all rate limit configurations for a guild
 */
async function getAllRateLimitConfigs(db, guildId) {
  const configs = await dbAll(db, `SELECT * FROM rate_limit_config WHERE guild_id = ? ORDER BY channel_id`, [guildId]);

  return configs.map((c) => {
    c.role_limits = JSON.parse(c.role_limits || "[]");
    c.enabled = Boolean(c.enabled);
    return c;
  });
}

// -------------------------
// SPAM LIMITING LOGIC (Turn-taking / Consecutive)
// -------------------------

/**
 * Check if user can send a message (turn-taking / consecutive limit check)
 * Other user speaks -> counter resets.
 * Returns: { allowed: boolean, limit: number, current: number, config: object }
 */
async function checkRateLimit(db, guildId, channelId, userId, userRoles = [], configOverride = undefined) {
  // Get configuration (optionally preloaded by caller)
  const config = configOverride === undefined ? await getRateLimitConfig(db, guildId, channelId) : configOverride;

  // If no config or disabled, allow
  if (!config || !config.enabled) {
    return { allowed: true, limit: null, current: 0, config: null };
  }

  // Determine user's limit based on roles
  let userLimit = config.default_limit;

  // Check role-based limits (highest limit wins)
  for (const roleLimit of config.role_limits) {
    if (userRoles.includes(roleLimit.role_id)) {
      if (roleLimit.limit > userLimit) {
        userLimit = roleLimit.limit;
      }
    }
  }

  const nowMs = Date.now();
  const { current } = noteConsecutiveMessage(guildId, channelId, userId, nowMs);

  // Check if limit exceeded
  const allowed = current <= userLimit;

  return {
    allowed,
    limit: userLimit,
    current,
    remaining: Math.max(0, userLimit - current),
    config,
  };
}

/**
 * Track a message for rate limiting
 */
async function trackMessage(db, guildId, channelId, userId, messageId) {
  // Legacy no-op.
  // Previously: wrote into rate_limit_messages to enforce rolling-window frequency limits.
  // Current behavior: turn-taking/consecutive limiting uses in-memory state only.
  void db;
  void guildId;
  void channelId;
  void userId;
  void messageId;
}

/**
 * Record a rate limit violation
 */
async function recordViolation(db, guildId, channelId, userId) {
  // Fix: The table has UNIQUE(guild_id, user_id), so we must lookup by guild+user only.
  // Including channel_id in the WHERE causes duplicate INSERT attempts if the user
  // violated in a different channel previously.
  const existing = await dbGet(
    db,
    `
    SELECT * FROM rate_limit_violations 
    WHERE guild_id = ? AND user_id = ?
  `,
    [guildId, userId]
  );

  if (existing) {
    await dbRun(
      db,
      `
      UPDATE rate_limit_violations
      SET violation_count = violation_count + 1,
          total_violations = total_violations + 1,
          last_violation = strftime('%s', 'now'),
          channel_id = ?
      WHERE guild_id = ? AND user_id = ?
    `,
      [channelId, guildId, userId]
    );
  } else {
    await dbRun(
      db,
      `
      INSERT INTO rate_limit_violations (guild_id, channel_id, user_id)
      VALUES (?, ?, ?)
    `,
      [guildId, channelId, userId]
    );
  }
}

/**
 * Clean up old message records (older than max window)
 */
async function cleanupOldRecords(db) {
  // Legacy no-op.
  // Previously cleaned old rows from rate_limit_messages (frequency mode).
  void db;
  return 0;
}

/**
 * Get rate limit statistics
 */
async function getRateLimitStats(db, guildId, channelId = null) {
  const stats = {};

  // Turn-taking mode doesn't track total message counts.
  // We report violations/unique violators based on rate_limit_violations.
  stats.totalMessages = null;

  if (channelId) {
    const violations = await dbGet(
      db,
      `SELECT COUNT(*) as count, COALESCE(SUM(total_violations), 0) as total FROM rate_limit_violations WHERE guild_id = ? AND channel_id = ?`,
      [guildId, channelId]
    );

    const topViolators = await dbAll(
      db,
      `
      SELECT user_id, total_violations, last_violation
      FROM rate_limit_violations
      WHERE guild_id = ? AND channel_id = ?
      ORDER BY total_violations DESC
      LIMIT 10
    `,
      [guildId, channelId]
    );

    stats.uniqueViolators = violations?.count || 0;
    stats.totalViolations = violations?.total || 0;
    stats.topViolators = topViolators || [];
  } else {
    const violations = await dbGet(
      db,
      `SELECT COUNT(*) as count, COALESCE(SUM(total_violations), 0) as total FROM rate_limit_violations WHERE guild_id = ?`,
      [guildId]
    );

    const channels = await dbAll(
      db,
      `
      SELECT channel_id,
             COUNT(*) as unique_violators,
             COALESCE(SUM(total_violations), 0) as total_violations
      FROM rate_limit_violations
      WHERE guild_id = ?
      GROUP BY channel_id
      ORDER BY total_violations DESC
    `,
      [guildId]
    );

    stats.uniqueViolators = violations?.count || 0;
    stats.totalViolations = violations?.total || 0;
    stats.channelBreakdown = channels || [];
  }

  return stats;
}

// -------------------------
// STRIKE & TIMEOUT MANAGEMENT
// -------------------------

/**
 * Get total strikes for a user in a guild
 */
async function getViolationStrikes(db, guildId, userId) {
  const row = await dbGet(
    db,
    `
    SELECT total_violations, will_reset_at
    FROM rate_limit_violations
    WHERE guild_id = ? AND user_id = ?
  `,
    [guildId, userId]
  );

  // Check if strikes should be auto-reset
  if (row && row.will_reset_at) {
    const now = Math.floor(Date.now() / 1000);
    if (now >= row.will_reset_at) {
      // Auto-reset strikes
      await dbRun(db, `DELETE FROM rate_limit_violations WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);
      return 0;
    }
  }

  return row?.total_violations || 0;
}

/**
 * Get violation data for a user (includes reset time)
 */
async function getUserViolationData(db, guildId, userId) {
  const row = await dbGet(
    db,
    `
    SELECT * FROM rate_limit_violations
    WHERE guild_id = ? AND user_id = ?
  `,
    [guildId, userId]
  );

  return row || null;
}

/**
 * Calculate timeout duration based on strikes and configuration
 */
function calculateTimeoutDuration(strikes, config) {
  // Check if custom timeout mappings exist
  if (config.timeout_mappings && config.timeout_mappings.length > 0) {
    // Find the highest matching threshold
    let timeoutMinutes = strikes * (config.timeout_duration_per_strike || 1);
    
    for (const mapping of config.timeout_mappings) {
      if (strikes >= mapping.strikes) {
        timeoutMinutes = mapping.timeout;
      }
    }
    
    return timeoutMinutes;
  }

  // Default: strikes × timeout_duration_per_strike (minutes)
  return strikes * (config.timeout_duration_per_strike || 1);
}

/**
 * Format timeout duration as "X часов Y минут"
 */
function formatTimeoutDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours} ${ruPlural(hours, "час", "часа", "часов")} ${mins} ${ruPlural(mins, "минута", "минуты", "минут")}`;
  } else if (hours > 0) {
    return `${hours} ${ruPlural(hours, "час", "часа", "часов")}`;
  } else {
    return `${mins} ${ruPlural(mins, "минута", "минуты", "минут")}`;
  }
}

/**
 * Russian plural helper (copy from main index.js if not available)
 */
function ruPlural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Record violation with strike increment based on role multipliers
 */
async function recordViolationWithStrikes(db, guildId, channelId, userId, userRoles = [], config = null) {
  // Calculate strike increment based on role multipliers
  let strikeIncrement = 1.0;

  if (config && config.strike_role_multipliers) {
    for (const roleMult of config.strike_role_multipliers) {
      if (userRoles.includes(roleMult.role_id)) {
        strikeIncrement = Math.min(strikeIncrement, roleMult.multiplier);
      }
    }
  }

  const actualStrikes = Math.ceil(strikeIncrement);

  // Calculate reset timestamp
  const strikeResetDays = config?.strike_reset_days || 7;
  const willResetAt = Math.floor(Date.now() / 1000) + (strikeResetDays * 24 * 60 * 60);

  const existing = await dbGet(
    db,
    `
    SELECT * FROM rate_limit_violations
    WHERE guild_id = ? AND user_id = ?
  `,
    [guildId, userId]
  );

  if (existing) {
    await dbRun(
      db,
      `
      UPDATE rate_limit_violations
      SET violation_count = violation_count + ?,
          total_violations = total_violations + ?,
          last_violation = strftime('%s', 'now'),
          will_reset_at = ?,
          channel_id = ?
      WHERE guild_id = ? AND user_id = ?
    `,
      [actualStrikes, actualStrikes, willResetAt, channelId, guildId, userId]
    );
  } else {
    await dbRun(
      db,
      `
      INSERT INTO rate_limit_violations (guild_id, channel_id, user_id, violation_count, total_violations, will_reset_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [guildId, channelId, userId, actualStrikes, actualStrikes, willResetAt]
    );
  }
}

/**
 * Get all users with strikes in a guild
 */
async function getUsersWithStrikes(db, guildId) {
  const users = await dbAll(
    db,
    `
    SELECT user_id, total_violations, last_violation, will_reset_at
    FROM rate_limit_violations
    WHERE guild_id = ? AND total_violations > 0
    ORDER BY total_violations DESC
    LIMIT 50
  `,
    [guildId]
  );

  return users || [];
}

/**
 * Clear strikes for a specific user
 */
async function clearUserStrikes(db, guildId, userId) {
  await dbRun(db, `DELETE FROM rate_limit_violations WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);
}

/**
 * Auto-reset expired strikes (call periodically)
 */
async function autoResetExpiredStrikes(db) {
  const now = Math.floor(Date.now() / 1000);
  const result = await dbRun(
    db,
    `DELETE FROM rate_limit_violations WHERE will_reset_at IS NOT NULL AND will_reset_at <= ?`,
    [now]
  );
  return result?.changes || 0;
}

// -------------------------
// COUNTDOWN CONFIGURATION
// -------------------------

/**
 * Get countdown configuration for a guild
 */
async function getCountdownConfig(db, guildId) {
  const config = await dbGet(db, `SELECT * FROM countdown_config WHERE guild_id = ?`, [guildId]);
  
  if (config) {
    config.enabled = Boolean(config.enabled);
  }
  
  return config || {
    enabled: false,
    channel_id: null,
    hour: 11,
    minute: 0,
    timezone_offset: 180,
    last_posted: null,
    total_posts: 0
  };
}

/**
 * Set countdown configuration
 */
async function setCountdownConfig(db, guildId, config) {
  const enabled = config.enabled ? 1 : 0;
  const channelId = config.channel_id || null;
  const hour = config.hour || 11;
  const minute = config.minute || 0;
  const timezoneOffset = config.timezone_offset || 180;

  await dbRun(
    db,
    `
    INSERT INTO countdown_config (guild_id, enabled, channel_id, hour, minute, timezone_offset)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      enabled = excluded.enabled,
      channel_id = excluded.channel_id,
      hour = excluded.hour,
      minute = excluded.minute,
      timezone_offset = excluded.timezone_offset
  `,
    [guildId, enabled, channelId, hour, minute, timezoneOffset]
  );
}

/**
 * Update last posted timestamp
 */
async function updateCountdownLastPosted(db, guildId) {
  const now = Math.floor(Date.now() / 1000);
  await dbRun(
    db,
    `
    UPDATE countdown_config
    SET last_posted = ?, total_posts = total_posts + 1
    WHERE guild_id = ?
  `,
    [now, guildId]
  );
}

// -------------------------
// EXPORTS
// -------------------------

module.exports = {
  ensureRateLimitTables,
  getRateLimitConfig,
  setRateLimitConfig,
  deleteRateLimitConfig,
  getAllRateLimitConfigs,
  checkRateLimit,
  trackMessage,
  recordViolation,
  noteConsecutiveMessage,
  pruneConsecutiveState,
  cleanupOldRecords,
  getRateLimitStats,
  
  // Strikes & timeouts
  getViolationStrikes,
  getUserViolationData,
  calculateTimeoutDuration,
  formatTimeoutDuration,
  recordViolationWithStrikes,
  getUsersWithStrikes,
  clearUserStrikes,
  autoResetExpiredStrikes,
  
  // Countdown
  getCountdownConfig,
  setCountdownConfig,
  updateCountdownLastPosted,
};
