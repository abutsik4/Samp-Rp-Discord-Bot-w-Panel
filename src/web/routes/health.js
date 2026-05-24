"use strict";
const { dbGet } = require("../../utils/db-helpers");

module.exports = function healthRoutes(app, db) {
  app.get("/health", async (req, res) => {
    try {
      const row = await dbGet(db, "SELECT 1 AS ok");
      if (!row) throw new Error("DB unreachable");
      res.json({ status: "ok", db: "connected", timestamp: new Date().toISOString() });
    } catch (e) {
      res.status(503).json({ status: "error", detail: e.message });
    }
  });
};