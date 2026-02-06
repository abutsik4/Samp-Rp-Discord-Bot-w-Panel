/**
 * Shared context for web routes.
 * 
 * This module provides a way to share the database connection, Discord client,
 * bots registry, and common middleware across all route modules.
 */

let _db = null;
let _dbRun = null;
let _dbGet = null;
let _dbAll = null;
let _bots = null;
let _client = null;
let _PANEL_BASE = "/panel";

/**
 * Initialize the shared context.
 * Call this once during app startup before mounting routes.
 */
function initContext({ db, dbRun, dbGet, dbAll, bots, client, PANEL_BASE }) {
  _db = db;
  _dbRun = dbRun;
  _dbGet = dbGet;
  _dbAll = dbAll;
  _bots = bots;
  _client = client;
  if (PANEL_BASE) _PANEL_BASE = PANEL_BASE;
}

function getDb() {
  if (!_db) throw new Error("Context not initialized: db is null");
  return _db;
}

function getDbRun() {
  if (!_dbRun) throw new Error("Context not initialized: dbRun is null");
  return _dbRun;
}

function getDbGet() {
  if (!_dbGet) throw new Error("Context not initialized: dbGet is null");
  return _dbGet;
}

function getDbAll() {
  if (!_dbAll) throw new Error("Context not initialized: dbAll is null");
  return _dbAll;
}

function getBots() {
  if (!_bots) throw new Error("Context not initialized: bots is null");
  return _bots;
}

function getClient() {
  return _client;
}

function getPanelBase() {
  return _PANEL_BASE;
}

/**
 * Helper to find a bot by key from the bots array.
 * @param {string} botKey 
 * @returns {object|undefined}
 */
function findBot(botKey) {
  const bots = getBots();
  return bots.find((b) => b.key === botKey);
}

module.exports = {
  initContext,
  getDb,
  getDbRun,
  getDbGet,
  getDbAll,
  getBots,
  getClient,
  getPanelBase,
  findBot,
};
