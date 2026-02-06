/**
 * Database helpers.
 * Promisified wrappers for SQLite operations.
 */

/**
 * Create promisified database helper functions.
 * @param {object} db - SQLite database instance
 * @returns {object} Object containing dbRun, dbGet, dbAll functions
 */
function createDbHelpers(db) {
  /**
   * Run a SQL statement (INSERT, UPDATE, DELETE, etc.)
   * @param {string} sql - SQL statement
   * @param {Array} params - Parameters for the statement
   * @returns {Promise<{lastID: number, changes: number}>}
   */
  function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  /**
   * Get a single row from a SELECT query.
   * @param {string} sql - SQL query
   * @param {Array} params - Parameters for the query
   * @returns {Promise<object|undefined>}
   */
  function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  /**
   * Get all rows from a SELECT query.
   * @param {string} sql - SQL query
   * @param {Array} params - Parameters for the query
   * @returns {Promise<Array>}
   */
  function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  return { dbRun, dbGet, dbAll };
}

/**
 * KV store helpers for scheduler state.
 * @param {Function} dbRun - Promisified db.run
 * @param {Function} dbGet - Promisified db.get
 * @returns {object} Object containing getKV, setKV functions
 */
function createKVHelpers(dbRun, dbGet) {
  async function getKV(key) {
    const row = await dbGet(`SELECT value FROM bot_kv WHERE key = ?`, [key]);
    return row ? row.value : null;
  }

  async function setKV(key, value) {
    await dbRun(
      `INSERT INTO bot_kv (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, String(value)]
    );
  }

  return { getKV, setKV };
}

module.exports = { createDbHelpers, createKVHelpers };
