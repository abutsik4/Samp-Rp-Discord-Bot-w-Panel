const sqlite3 = require("sqlite3").verbose();
const path = require("path");

function initStatsDb() {
    const dbPath = path.join(__dirname, "../../stats.db");
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
            else console.log("Database ready:", dbPath);
        }
    );

    // Panel users table for authentication
    db.run(
        `
    CREATE TABLE IF NOT EXISTS panel_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      last_login INTEGER,
      CONSTRAINT check_role CHECK (role IN ('admin', 'user'))
    )
    `,
        (err) => {
            if (err) console.error("Error creating panel_users table:", err);
            else console.log("Panel users table ready");
        }
    );

    // Disabled commands table
    db.run(
        `
    CREATE TABLE IF NOT EXISTS disabled_commands (
      guild_id TEXT NOT NULL,
      command_name TEXT NOT NULL,
      disabled_at INTEGER NOT NULL,
      disabled_by TEXT,
      PRIMARY KEY (guild_id, command_name)
    )
    `,
        (err) => {
            if (err) console.error("Error creating disabled_commands table:", err);
            else console.log("Disabled commands table ready");
        }
    );

    function incrementMessageCount(guildId, userId) {
        db.run(
            `
      INSERT INTO user_stats (guild_id, user_id, message_count)
      VALUES (?, ?, 1)
      ON CONFLICT(guild_id, user_id)
      DO UPDATE SET message_count = message_count + 1
      `, [guildId, userId],
            (err) => err && console.error("Error updating message count:", err)
        );
    }

    function getUserMessageCount(guildId, userId) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?`, [guildId, userId],
                (err, row) => (err ? reject(err) : resolve(row ? row.message_count : 0))
            );
        });
    }

    function resetStats() {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM user_stats`, (err) => (err ? reject(err) : resolve()));
        });
    }

    function getTopUsers(guildId, limit) {
        const fetchLimit = Math.max(limit * 3, limit);
        return new Promise((resolve, reject) => {
            db.all(
                `
        SELECT user_id, message_count
        FROM user_stats
        WHERE guild_id = ?
        ORDER BY message_count DESC
        LIMIT ?
        `, [guildId, fetchLimit],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
    }

    // Panel user management functions
    function createPanelUser(username, passwordHash, role = 'user') {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            db.run(
                `INSERT INTO panel_users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)`,
                [username, passwordHash, role, now],
                function(err) {
                    if (err) reject(err);
                    else resolve({ id: this.lastID, username, role });
                }
            );
        });
    }

    function getPanelUser(username) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM panel_users WHERE username = ?`,
                [username],
                (err, row) => (err ? reject(err) : resolve(row))
            );
        });
    }

    function getAllPanelUsers() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT id, username, role, created_at, last_login FROM panel_users ORDER BY created_at DESC`,
                [],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
    }

    function updatePanelUserPassword(username, newPasswordHash) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE panel_users SET password_hash = ? WHERE username = ?`,
                [newPasswordHash, username],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    function updatePanelUserLastLogin(username) {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            db.run(
                `UPDATE panel_users SET last_login = ? WHERE username = ?`,
                [now, username],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    function deletePanelUser(username) {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM panel_users WHERE username = ?`,
                [username],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    function updatePanelUserRole(username, newRole) {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE panel_users SET role = ? WHERE username = ?`,
                [newRole, username],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    // Disabled commands functions
    function disableCommand(guildId, commandName, disabledBy = null) {
        return new Promise((resolve, reject) => {
            const now = Date.now();
            db.run(
                `INSERT OR REPLACE INTO disabled_commands (guild_id, command_name, disabled_at, disabled_by) VALUES (?, ?, ?, ?)`,
                [guildId, commandName, now, disabledBy],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    function enableCommand(guildId, commandName) {
        return new Promise((resolve, reject) => {
            db.run(
                `DELETE FROM disabled_commands WHERE guild_id = ? AND command_name = ?`,
                [guildId, commandName],
                (err) => (err ? reject(err) : resolve())
            );
        });
    }

    function isCommandDisabled(guildId, commandName) {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT 1 FROM disabled_commands WHERE guild_id = ? AND command_name = ?`,
                [guildId, commandName],
                (err, row) => (err ? reject(err) : resolve(!!row))
            );
        });
    }

    function getDisabledCommands(guildId) {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT command_name, disabled_at, disabled_by FROM disabled_commands WHERE guild_id = ? ORDER BY command_name`,
                [guildId],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
    }

    function getAllDisabledCommands() {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT guild_id, command_name, disabled_at, disabled_by FROM disabled_commands ORDER BY guild_id, command_name`,
                [],
                (err, rows) => (err ? reject(err) : resolve(rows || []))
            );
        });
    }

    return { 
        db, 
        incrementMessageCount, 
        getUserMessageCount, 
        resetStats, 
        getTopUsers,
        createPanelUser,
        getPanelUser,
        getAllPanelUsers,
        updatePanelUserPassword,
        updatePanelUserLastLogin,
        deletePanelUser,
        updatePanelUserRole,
        disableCommand,
        enableCommand,
        isCommandDisabled,
        getDisabledCommands,
        getAllDisabledCommands
    };
}

module.exports = { initStatsDb };