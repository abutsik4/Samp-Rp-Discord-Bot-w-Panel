"use strict";

/**
 * Legacy compatibility wrapper.
 *
 * Historically, `src/web/server.js` implemented its own auth/routes/views.
 * The project now uses the consolidated panel stack (same as `src/index.js`).
 *
 * Keep this module to avoid breaking older entrypoints, but route all traffic
 * through the single source of truth.
 */

const path = require("path");

const { createPanelApp } = require("./panel-app");
const { dbRun: dbRunHelper, dbGet: dbGetHelper, dbAll: dbAllHelper } = require("../utils/db-helpers");

function isAllowedChannel(channelId) {
  const list = (process.env.ALLOWED_CHANNEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!list.length) return true;
  return list.includes(channelId);
}

function createWebServer({ discordClient, statsDb }) {
  console.warn(
    "[DEPRECATED] src/web/server.js is deprecated. Use src/index.js or src/web/panel-app.js directly."
  );

  const db = statsDb?.db || statsDb;
  if (!db || typeof db.run !== "function") {
    throw new Error("createWebServer: statsDb.db (sqlite3 Database) is required");
  }

  function dbRun(sqlOrDb, sqlOrParams = [], params = []) {
    if (typeof sqlOrDb === "string") return dbRunHelper(db, sqlOrDb, sqlOrParams);
    return dbRunHelper(sqlOrDb, sqlOrParams, params);
  }
  function dbGet(sqlOrDb, sqlOrParams = [], params = []) {
    if (typeof sqlOrDb === "string") return dbGetHelper(db, sqlOrDb, sqlOrParams);
    return dbGetHelper(sqlOrDb, sqlOrParams, params);
  }
  function dbAll(sqlOrDb, sqlOrParams = [], params = []) {
    if (typeof sqlOrDb === "string") return dbAllHelper(db, sqlOrDb, sqlOrParams);
    return dbAllHelper(sqlOrDb, sqlOrParams, params);
  }

  const helpers = require("../bot/helpers");
  helpers.init({ db, dbRun, dbGet, dbAll });

  const {
    ruPlural,
    getUserMessageCount,
    recordOperation,
    performUndo,
    getDisabledCommands,
    enableCommand,
    disableCommand,
  } = helpers;

  const bots = [
    {
      key: "samprp",
      name: "JepsenCloud Bot",
      kind: "discord",
      client: discordClient,
      guild_id: "537187880842559499",
    },
  ];

  const PANEL_BASE = "/panel";
  const TRUST_PROXY = process.env.TRUST_PROXY === "1";
  const COOKIE_SECURE =
    process.env.COOKIE_SECURE === "auto"
      ? "auto"
      : process.env.COOKIE_SECURE === "true";

  const { app } = createPanelApp({
    client: discordClient,
    db,
    dbRun,
    dbGet,
    dbAll,
    bots,
    isAllowedChannel,
    PANEL_BASE,
    TRUST_PROXY,
    COOKIE_SECURE,
    recordOperation,
    performUndo,
    getUserMessageCount,
    ruPlural,
    getDisabledCommands,
    enableCommand,
    disableCommand,
  });

  // Legacy convenience redirects
  app.get("/login", (_req, res) => res.redirect(302, `${PANEL_BASE}/login`));
  app.get("/logout", (_req, res) => res.redirect(302, `${PANEL_BASE}/login`));

  // Legacy static path (older server served /public from workspace root)
  const legacyPublicDir = path.join(__dirname, "..", "..", "public");
  app.use("/public-legacy", require("express").static(legacyPublicDir, { index: false }));

  return app;
}

module.exports = { createWebServer };
