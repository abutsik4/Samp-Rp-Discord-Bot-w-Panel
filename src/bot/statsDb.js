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

    return { db, incrementMessageCount, getUserMessageCount, resetStats, getTopUsers };
}

module.exports = { initStatsDb };