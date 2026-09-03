/**
 * Database schema initialization.
 * Contains all CREATE TABLE statements and migrations.
 */

/**
 * Initialize all database tables and indexes.
 * @param {Function} dbRun - Promisified db.run function
 * @param {string} dbPath - Path to the database file (for logging)
 * @param {object} db - Raw database instance for feature table initialization
 */
async function initSchema(dbRun, dbPath, db = null) {
  // Stats table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // KV store
  await dbRun(`
    CREATE TABLE IF NOT EXISTS bot_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // User cache for storing Discord usernames
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_cache (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      avatar_url TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_user_cache_guild_user 
    ON user_cache(guild_id, user_id)
  `);

  // Message index for robust decrement
  await dbRun(`
    CREATE TABLE IF NOT EXISTS message_index (
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, message_id)
    )
  `);

  // Best-effort migrations
  try {
    await dbRun(`ALTER TABLE message_index ADD COLUMN channel_id TEXT`);
  } catch (_) {}

  try {
    await dbRun(`ALTER TABLE message_index ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))`);
  } catch (_) {}

  // Manual adjustments table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_adjustments (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      adjustment INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  // Per-channel manual adjustments
  await dbRun(`
    CREATE TABLE IF NOT EXISTS channel_user_adjustments (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      adjustment INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      reason TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, channel_id, user_id)
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_channel_user_adjustments_user
    ON channel_user_adjustments(guild_id, user_id)
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_channel_user_adjustments_channel
    ON channel_user_adjustments(guild_id, channel_id)
  `);

  // Panel sent items
  await dbRun(`
    CREATE TABLE IF NOT EXISTS panel_sent_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_key TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('message', 'embed')),
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      content TEXT,
      title TEXT,
      description TEXT,
      color TEXT,
      footer TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE (bot_key, channel_id, message_id)
    )
  `);

  await dbRun(`CREATE INDEX IF NOT EXISTS idx_panel_sent_items_updated ON panel_sent_items(updated_at)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_panel_sent_items_channel ON panel_sent_items(channel_id)`);

  // Panel debug reports
  await dbRun(`
    CREATE TABLE IF NOT EXISTS panel_debug_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      updated_by TEXT,
      ip TEXT,
      user_agent TEXT,
      url TEXT,
      client_trace_id TEXT,
      server_trace_id TEXT,
      report_json TEXT NOT NULL
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_panel_debug_reports_created_at ON panel_debug_reports(created_at)`);

  // Daily/channel analytics
  await dbRun(`
    CREATE TABLE IF NOT EXISTS daily_channel_stats (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_date TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, channel_id, message_date)
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date
    ON daily_channel_stats(guild_id, message_date)
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_channel
    ON daily_channel_stats(guild_id, channel_id, message_date)
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_daily_stats_user
    ON daily_channel_stats(guild_id, user_id, message_date DESC)
  `);

  // Incremental sync tracking
  await dbRun(`
    CREATE TABLE IF NOT EXISTS backfill_watermarks (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL DEFAULT '__guild__',
      last_message_id TEXT NOT NULL,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      messages_synced INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, channel_id)
    )
  `);

  try {
    await dbRun(`ALTER TABLE backfill_watermarks ADD COLUMN channel_id TEXT DEFAULT '__guild__'`);
  } catch (_) {}
  try {
    await dbRun(`ALTER TABLE backfill_watermarks ADD COLUMN last_synced_at TEXT DEFAULT CURRENT_TIMESTAMP`);
  } catch (_) {}
  try {
    await dbRun(`ALTER TABLE backfill_watermarks ADD COLUMN messages_synced INTEGER DEFAULT 0`);
  } catch (_) {}

  // Panel messages
  await dbRun(`
    CREATE TABLE IF NOT EXISTS panel_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_key TEXT NOT NULL,
      channel_id TEXT,
      content TEXT,
      embed TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent')),
      discord_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Enable WAL mode
  await dbRun(`PRAGMA journal_mode = WAL`);

  // Event log
  await dbRun(`
    CREATE TABLE IF NOT EXISTS message_count_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      guild_id TEXT,
      user_id TEXT,
      message_id TEXT,
      details TEXT,
      timestamp INTEGER NOT NULL
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_events_timestamp 
    ON message_count_events(timestamp DESC)
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_events_type 
    ON message_count_events(event_type, timestamp DESC)
  `);

  // Error queue
  await dbRun(`
    CREATE TABLE IF NOT EXISTS message_count_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_id TEXT,
      operation TEXT NOT NULL CHECK (operation IN ('increment', 'decrement')),
      error TEXT,
      retry_count INTEGER DEFAULT 0,
      channel_id TEXT,
      message_created_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try {
    await dbRun(`ALTER TABLE message_count_errors ADD COLUMN channel_id TEXT`);
  } catch (_) {}
  try {
    await dbRun(`ALTER TABLE message_count_errors ADD COLUMN message_created_at TEXT`);
  } catch (_) {}

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_errors_retry 
    ON message_count_errors(retry_count, created_at)
  `);

  // Disabled commands
  await dbRun(`
    CREATE TABLE IF NOT EXISTS disabled_commands (
      guild_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      disabled_at INTEGER NOT NULL,
      disabled_by TEXT,
      PRIMARY KEY (guild_id, command_name)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS command_channel_restrictions (
      guild_id TEXT NOT NULL,
      command_category TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_by TEXT,
      PRIMARY KEY (guild_id, command_category)
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_message_index_created 
    ON message_index(created_at)
  `);

  // Channel whitelist
  await dbRun(`
    CREATE TABLE IF NOT EXISTS channel_whitelist (
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, channel_id)
    )
  `);

  // Banned words
  await dbRun(`
    CREATE TABLE IF NOT EXISTS banned_words (
      guild_id TEXT NOT NULL,
      word TEXT NOT NULL,
      case_sensitive INTEGER DEFAULT 0,
      added_by TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, word)
    )
  `);

  // Operation history
  await dbRun(`
    CREATE TABLE IF NOT EXISTS operation_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      scope TEXT NOT NULL,
      target_id TEXT,
      payload_before TEXT NOT NULL,
      payload_after TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      undone INTEGER DEFAULT 0
    )
  `);

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_operation_history_guild 
    ON operation_history(guild_id, timestamp DESC)
  `);

  // SAMP server tracker
  await dbRun(`
    CREATE TABLE IF NOT EXISTS samp_trackers (
      guild_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      server_name TEXT NOT NULL,
      server_ip TEXT NOT NULL,
      server_port INTEGER DEFAULT 7777,
      channel_id TEXT NOT NULL,
      emoji TEXT DEFAULT '🎮',
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      custom_online_text TEXT,
      custom_offline_text TEXT,
      poll_interval_ms INTEGER,
      rename_cooldown_ms INTEGER,
      name_format TEXT,
      PRIMARY KEY (guild_id, server_id)
    )
  `);

  // Panel users
  await dbRun(`
    CREATE TABLE IF NOT EXISTS panel_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      last_login INTEGER,
      CONSTRAINT check_role CHECK (role IN ('admin', 'user'))
    )
  `);

  // Verification reference table
  await dbRun(`
    CREATE TABLE IF NOT EXISTS message_count_reference (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      expected_count INTEGER NOT NULL DEFAULT 0,
      actual_count INTEGER NOT NULL DEFAULT 0,
      difference INTEGER NOT NULL DEFAULT 0,
      verified_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, user_id)
    )
  `);

  console.log("DB ready:", dbPath);
}

module.exports = { initSchema };
