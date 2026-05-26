"use strict";

/**
 * Command analytics logging utility.
 *
 * Writes to the `samp_command_logs` table which is created/migrated in bootstrap.js.
 * Safe to call from any async context — failures are swallowed so they never break
 * the command that triggered them.
 *
 * Schema columns used:
 *   id, user_id, guild_id, channel_id, command_name, subcommand_name,
 *   command_type, success, duration_ms, error_message, created_at
 *
 * Do NOT log raw option values — they may contain sensitive user data.
 */

const { dbRun, dbAll, dbGet } = require("./db-helpers");

/**
 * Record one command invocation.
 *
 * @param {object} db       SQLite db handle
 * @param {object} opts
 * @param {string} opts.commandName
 * @param {string} opts.userId
 * @param {string|null} opts.guildId
 * @param {string|null} opts.channelId
 * @param {string|null} [opts.subcommand]
 * @param {string}      [opts.commandType]  'slash' | 'button' | 'select'
 * @param {boolean}     [opts.success]      default true
 * @param {number|null} [opts.durationMs]
 * @param {string|null} [opts.errorMessage]
 */
async function logCommandUsage(db, opts) {
  try {
    const {
      commandName,
      userId,
      guildId = null,
      channelId = null,
      subcommand = null,
      commandType = "slash",
      success = true,
      durationMs = null,
      errorMessage = null,
    } = opts || {};

    if (!commandName || !userId) return;

    await dbRun(
      db,
      `INSERT INTO samp_command_logs
         (user_id, guild_id, channel_id, command_name, subcommand_name,
          command_type, success, duration_ms, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        String(userId),
        guildId ? String(guildId) : null,
        channelId ? String(channelId) : null,
        String(commandName),
        subcommand ? String(subcommand) : null,
        String(commandType),
        success ? 1 : 0,
        durationMs != null ? Math.round(durationMs) : null,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
      ]
    );
  } catch (_) {
    // Logging must never crash the caller.
  }
}

/**
 * Aggregate command statistics for the admin /commandstats view.
 *
 * @param {object} db
 * @param {object} opts
 * @param {number}      [opts.days=7]    Lookback window in days
 * @param {string|null} [opts.guildId]   Filter to one guild (null = all guilds)
 * @returns {Promise<{
 *   topByUsage: Array,
 *   topByFailRate: Array,
 *   todayTotal: number,
 *   weekTotal: number,
 *   totalInWindow: number,
 * }>}
 */
async function getCommandStats(db, { days = 7, guildId = null } = {}) {
  const guildFilter = guildId ? "AND guild_id = ?" : "";
  const guildParams = guildId ? [String(guildId)] : [];

  const windowFilter = `AND created_at >= datetime('now', '-${Math.max(1, Math.min(365, Number(days) || 7))} days')`;

  const topByUsage = await dbAll(
    db,
    `SELECT command_name,
            COUNT(*)                                      AS total,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
            ROUND(AVG(duration_ms))                       AS avg_ms,
            MAX(created_at)                               AS last_used
       FROM samp_command_logs
      WHERE 1=1 ${guildFilter} ${windowFilter}
      GROUP BY command_name
      ORDER BY total DESC
      LIMIT 20`,
    guildParams
  );

  const topByFailRate = await dbAll(
    db,
    `SELECT command_name,
            COUNT(*)                                              AS total,
            SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END)         AS failures,
            ROUND(
              100.0 * SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) / COUNT(*),
              1
            )                                                     AS fail_pct
       FROM samp_command_logs
      WHERE 1=1 ${guildFilter} ${windowFilter}
      GROUP BY command_name
      HAVING failures > 0
      ORDER BY fail_pct DESC, failures DESC
      LIMIT 10`,
    guildParams
  );

  const todayRow = await dbGet(
    db,
    `SELECT COUNT(*) AS cnt
       FROM samp_command_logs
      WHERE created_at >= datetime('now', 'start of day')
        ${guildFilter}`,
    guildParams
  );

  const weekRow = await dbGet(
    db,
    `SELECT COUNT(*) AS cnt
       FROM samp_command_logs
      WHERE created_at >= datetime('now', '-7 days')
        ${guildFilter}`,
    guildParams
  );

  const windowRow = await dbGet(
    db,
    `SELECT COUNT(*) AS cnt
       FROM samp_command_logs
      WHERE 1=1 ${guildFilter} ${windowFilter}`,
    guildParams
  );

  return {
    topByUsage: topByUsage || [],
    topByFailRate: topByFailRate || [],
    todayTotal: Number(todayRow?.cnt || 0),
    weekTotal: Number(weekRow?.cnt || 0),
    totalInWindow: Number(windowRow?.cnt || 0),
  };
}

module.exports = { logCommandUsage, getCommandStats };
