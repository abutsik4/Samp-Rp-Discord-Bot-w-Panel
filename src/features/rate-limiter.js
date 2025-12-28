"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * Message Rate Limiting Module
 * Enforces per-channel, per-user message limits with role-based overrides
 */

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
      consecutive_enabled INTEGER DEFAULT 0,
      consecutive_limit INTEGER DEFAULT 5,
      consecutive_role_limits TEXT DEFAULT '[]',
      strike_reset_days INTEGER DEFAULT 7,
      strike_role_multipliers TEXT DEFAULT '[]',
      timeout_mappings TEXT DEFAULT '[]',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(guild_id, channel_id)
    )
  `
  );

  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS rate_limit_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `
  );

  await dbRun(
    db,
    `
    CREATE INDEX IF NOT EXISTS idx_rate_messages 
    ON rate_limit_messages(guild_id, channel_id, user_id, timestamp)
  `
  );

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

  // Consecutive message tracking table
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS consecutive_message_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `
  );

  await dbRun(
    db,
    `
    CREATE INDEX IF NOT EXISTS idx_consecutive_messages 
    ON consecutive_message_tracking(guild_id, channel_id, timestamp)
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
    'consecutive_enabled INTEGER DEFAULT 0',
    'consecutive_limit INTEGER DEFAULT 5',
    'consecutive_role_limits TEXT DEFAULT \'[]\'',
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
  config.consecutive_role_limits = JSON.parse(config.consecutive_role_limits || "[]");
  config.strike_role_multipliers = JSON.parse(config.strike_role_multipliers || "[]");
  config.timeout_mappings = JSON.parse(config.timeout_mappings || "[]");
  config.enabled = Boolean(config.enabled);
  config.consecutive_enabled = Boolean(config.consecutive_enabled);
  config.timeouts_enabled = config.timeouts_enabled !== undefined ? Boolean(config.timeouts_enabled) : true;
  config.ignore_admins = config.ignore_admins !== undefined ? Boolean(config.ignore_admins) : true;

  return config;
}

/**
 * Set rate limit configuration for a channel
 */
async function setRateLimitConfig(db, guildId, channelId, config) {
  const existing = await getRateLimitConfig(db, guildId, channelId);

  const enabled = config.enabled !== undefined ? (config.enabled ? 1 : 0) : 1;
  const defaultLimit = config.default_limit || 10;
  const timeWindowMinutes = config.time_window_minutes || 60;
  const roleLimits = JSON.stringify(config.role_limits || []);
  const warningMessage = config.warning_message || "You have exceeded the message limit for this channel.";
  const action = config.action || "delete";
  
  const consecutiveEnabled = config.consecutive_enabled !== undefined ? (config.consecutive_enabled ? 1 : 0) : 0;
  const consecutiveLimit = config.consecutive_limit || 5;
  const consecutiveRoleLimits = JSON.stringify(config.consecutive_role_limits || []);
  const strikeResetDays = config.strike_reset_days || 7;
  const strikeRoleMultipliers = JSON.stringify(config.strike_role_multipliers || []);
  const timeoutMappings = JSON.stringify(config.timeout_mappings || []);
  const timeoutsEnabled = config.timeouts_enabled !== undefined ? (config.timeouts_enabled ? 1 : 0) : 1;
  const timeoutDurationPerStrike = config.timeout_duration_per_strike || 1;
  const ignoreAdmins = config.ignore_admins !== undefined ? (config.ignore_admins ? 1 : 0) : 1;

  if (existing) {
    // Update existing
    await dbRun(
      db,
      `
      UPDATE rate_limit_config
      SET enabled = ?, default_limit = ?, time_window_minutes = ?, 
          role_limits = ?, warning_message = ?, action = ?,
          consecutive_enabled = ?, consecutive_limit = ?, consecutive_role_limits = ?,
          strike_reset_days = ?, strike_role_multipliers = ?, timeout_mappings = ?,
          timeouts_enabled = ?, timeout_duration_per_strike = ?, ignore_admins = ?,
          updated_at = strftime('%s', 'now')
      WHERE guild_id = ? AND channel_id = ?
    `,
      [enabled, defaultLimit, timeWindowMinutes, roleLimits, warningMessage, action,
       consecutiveEnabled, consecutiveLimit, consecutiveRoleLimits,
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
       consecutive_enabled, consecutive_limit, consecutive_role_limits,
       strike_reset_days, strike_role_multipliers, timeout_mappings,
       timeouts_enabled, timeout_duration_per_strike, ignore_admins)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [guildId, channelId, enabled, defaultLimit, timeWindowMinutes, roleLimits, warningMessage, action,
       consecutiveEnabled, consecutiveLimit, consecutiveRoleLimits,
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
// RATE LIMITING LOGIC
// -------------------------

/**
 * Check if user can send a message (rate limit check)
 * Returns: { allowed: boolean, limit: number, current: number, config: object }
 */
async function checkRateLimit(db, guildId, channelId, userId, userRoles = []) {
  // Get configuration
  const config = await getRateLimitConfig(db, guildId, channelId);

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

  // Get user's message count in the time window
  const windowStart = Math.floor(Date.now() / 1000) - config.time_window_minutes * 60;

  const result = await dbGet(
    db,
    `
    SELECT COUNT(*) as count 
    FROM rate_limit_messages 
    WHERE guild_id = ? AND channel_id = ? AND user_id = ? AND timestamp > ?
  `,
    [guildId, channelId, userId, windowStart]
  );

  const currentCount = result?.count || 0;

  // Check if limit exceeded
  const allowed = currentCount < userLimit;

  return {
    allowed,
    limit: userLimit,
    current: currentCount,
    remaining: Math.max(0, userLimit - currentCount),
    config,
  };
}

/**
 * Track a message for rate limiting
 */
async function trackMessage(db, guildId, channelId, userId, messageId) {
  const timestamp = Math.floor(Date.now() / 1000);

  await dbRun(
    db,
    `
    INSERT INTO rate_limit_messages (guild_id, channel_id, user_id, message_id, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `,
    [guildId, channelId, userId, messageId, timestamp]
  );
}

/**
 * Record a rate limit violation
 */
async function recordViolation(db, guildId, channelId, userId) {
  const existing = await dbGet(
    db,
    `
    SELECT * FROM rate_limit_violations 
    WHERE guild_id = ? AND channel_id = ? AND user_id = ?
  `,
    [guildId, channelId, userId]
  );

  if (existing) {
    await dbRun(
      db,
      `
      UPDATE rate_limit_violations
      SET violation_count = violation_count + 1,
          total_violations = total_violations + 1,
          last_violation = strftime('%s', 'now')
      WHERE guild_id = ? AND channel_id = ? AND user_id = ?
    `,
      [guildId, channelId, userId]
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
  // Keep records for maximum 24 hours
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

  const result = await dbRun(db, `DELETE FROM rate_limit_messages WHERE timestamp < ?`, [cutoff]);

  return result?.changes || 0;
}

/**
 * Get rate limit statistics
 */
async function getRateLimitStats(db, guildId, channelId = null) {
  const stats = {};

  if (channelId) {
    // Stats for specific channel
    const total = await dbGet(db, `SELECT COUNT(*) as count FROM rate_limit_messages WHERE guild_id = ? AND channel_id = ?`, [guildId, channelId]);

    const violations = await dbGet(db, `SELECT COUNT(*) as count, SUM(total_violations) as total FROM rate_limit_violations WHERE guild_id = ? AND channel_id = ?`, [guildId, channelId]);

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

    stats.totalMessages = total?.count || 0;
    stats.uniqueViolators = violations?.count || 0;
    stats.totalViolations = violations?.total || 0;
    stats.topViolators = topViolators || [];
  } else {
    // Guild-wide stats
    const total = await dbGet(db, `SELECT COUNT(*) as count FROM rate_limit_messages WHERE guild_id = ?`, [guildId]);

    const violations = await dbGet(db, `SELECT COUNT(*) as count, SUM(total_violations) as total FROM rate_limit_violations WHERE guild_id = ?`, [guildId]);

    const channels = await dbAll(
      db,
      `
      SELECT channel_id, COUNT(*) as message_count
      FROM rate_limit_messages
      WHERE guild_id = ?
      GROUP BY channel_id
      ORDER BY message_count DESC
    `,
      [guildId]
    );

    stats.totalMessages = total?.count || 0;
    stats.uniqueViolators = violations?.count || 0;
    stats.totalViolations = violations?.total || 0;
    stats.channelBreakdown = channels || [];
  }

  return stats;
}

// -------------------------
// CONSECUTIVE MESSAGE TRACKING
// -------------------------

/**
 * Track a message in consecutive sequence
 */
async function trackConsecutiveMessage(db, guildId, channelId, userId, messageId, timestamp) {
  await dbRun(
    db,
    `
    INSERT INTO consecutive_message_tracking (guild_id, channel_id, user_id, message_id, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `,
    [guildId, channelId, userId, messageId, timestamp]
  );
}

/**
 * Get the last message author in a channel
 */
async function getLastMessageAuthor(db, guildId, channelId) {
  const result = await dbGet(
    db,
    `
    SELECT user_id FROM consecutive_message_tracking
    WHERE guild_id = ? AND channel_id = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `,
    [guildId, channelId]
  );

  return result?.user_id || null;
}

/**
 * Get user's current consecutive message count
 */
async function getConsecutiveCount(db, guildId, channelId, userId) {
  // Get recent messages (reverse chronological)
  const messages = await dbAll(
    db,
    `
    SELECT user_id, timestamp FROM consecutive_message_tracking
    WHERE guild_id = ? AND channel_id = ?
    ORDER BY timestamp DESC
    LIMIT 50
  `,
    [guildId, channelId]
  );

  const maxGapSeconds = 90; // break chain if gap between messages exceeds 90s
  const maxChainAgeSeconds = 180; // break chain if any message is older than 3 minutes from now
  const now = Math.floor(Date.now() / 1000);

  let count = 0;
  let prevTimestamp = null;
  for (const msg of messages) {
    if (now - msg.timestamp > maxChainAgeSeconds) break;
    if (prevTimestamp !== null && prevTimestamp - msg.timestamp > maxGapSeconds) break;
    prevTimestamp = msg.timestamp;

    if (msg.user_id === userId) {
      count++;
    } else {
      break; // Different user, stop counting
    }
  }

  return count;
}

/**
 * Reset consecutive count for a user (when interrupted)
 */
async function resetConsecutiveCount(db, guildId, channelId, userId) {
  // We don't actually delete, just record new messages naturally resets via getConsecutiveCount logic
  // But we can clean up old records here
  const cutoff = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
  await dbRun(
    db,
    `
    DELETE FROM consecutive_message_tracking
    WHERE guild_id = ? AND channel_id = ? AND timestamp < ?
  `,
    [guildId, channelId, cutoff]
  );
}

/**
 * Check if user has exceeded consecutive message limit
 */
async function checkConsecutiveLimit(db, guildId, channelId, userId, userRoles = []) {
  const config = await getRateLimitConfig(db, guildId, channelId);

  // If consecutive limiting not enabled or no config, allow
  if (!config || !config.consecutive_enabled) {
    return { allowed: true, limit: null, current: 0, config: null };
  }

  // Determine user's consecutive limit based on roles
  let userLimit = config.consecutive_limit;

  // Check role-based consecutive limits (highest limit wins)
  for (const roleLimit of config.consecutive_role_limits) {
    if (userRoles.includes(roleLimit.role_id)) {
      if (roleLimit.limit > userLimit) {
        userLimit = roleLimit.limit;
      }
    }
  }

  // Get current consecutive count
  const currentCount = await getConsecutiveCount(db, guildId, channelId, userId);

  // Check if limit exceeded
  const allowed = currentCount < userLimit;

  return {
    allowed,
    limit: userLimit,
    current: currentCount,
    remaining: Math.max(0, userLimit - currentCount),
    config,
  };
}

/**
 * Clean up old consecutive message records
 */
async function cleanupOldConsecutiveRecords(db) {
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const result = await dbRun(db, `DELETE FROM consecutive_message_tracking WHERE timestamp < ?`, [cutoff]);
  return result?.changes || 0;
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
  if (config.timeout_mappings &&config.timeout_mappings.length > 0) {
    // Find the highest matching threshold
    let timeoutMinutes = strikes; // Default: 1 strike = 1 minute
    
    for (const mapping of config.timeout_mappings) {
      if (strikes >= mapping.strikes) {
        timeoutMinutes = mapping.timeout;
      }
    }
    
    return timeoutMinutes;
  }

  // Default: strikes × 1 minute
  return strikes;
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
  cleanupOldRecords,
  getRateLimitStats,
  
  // Consecutive tracking
  trackConsecutiveMessage,
  getLastMessageAuthor,
  getConsecutiveCount,
  resetConsecutiveCount,
  checkConsecutiveLimit,
  cleanupOldConsecutiveRecords,
  
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
