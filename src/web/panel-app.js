"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const { createLogger, newTraceId } = require("../utils/logger");
const panelHelpers = require("./panel-helpers");

const { createDebugRouter } = require("./routes/debug");
const { createAuthRouter } = require("./routes/auth");
const { createMessagesRouter } = require("./routes/messages");
const { createStatsRouter } = require("./routes/stats");
const { createAnalyticsRouter } = require("./routes/analytics");
const { createBotPagesRouter } = require("./routes/bot-pages");
const { createCommandsRouter } = require("./routes/commands");
const { createAccuracyRouter } = require("./routes/accuracy");
const { createHolidaysRouter } = require("./routes/holidays");
const { createAIEngagementRouter } = require("./routes/ai-engagement");
const { createRateLimitsRouter } = require("./routes/rate-limits");
const { createCountdownRouter } = require("./routes/countdown");
const { createWhitelistRouter } = require("./routes/whitelist");
const { createAutomodRouter } = require("./routes/automod");
const { createHistoryRouter } = require("./routes/history");
const { createChannelsRouter } = require("./routes/channels");
const { createSampServersRouter } = require("./routes/samp-servers");
const { createGameplayRouter } = require("./routes/gameplay");

function createPanelApp({
  client,
  db,
  dbRun,
  dbGet,
  dbAll,
  bots,
  isAllowedChannel,
  PANEL_BASE = "/panel",
  TRUST_PROXY = false,
  COOKIE_SECURE = false,
  // bot helpers injected for routes
  recordOperation,
  performUndo,
  getUserMessageCount,
  ruPlural,
  getDisabledCommands,
  enableCommand,
  disableCommand,
  PANEL_LEGACY_PAGES,
} = {}) {
  if (!client) throw new Error("createPanelApp: client is required");
  if (!db) throw new Error("createPanelApp: db is required");
  if (!dbRun || !dbGet || !dbAll) throw new Error("createPanelApp: dbRun/dbGet/dbAll are required");
  if (!Array.isArray(bots)) throw new Error("createPanelApp: bots array is required");
  if (typeof isAllowedChannel !== "function") throw new Error("createPanelApp: isAllowedChannel(channelId) is required");

  panelHelpers.init({ db, dbRun, dbGet, dbAll, panelBase: PANEL_BASE });

  const {
    escapeHtml,
    parseHexColor,
    validateLength,
    requireAuth,
    requireAdmin,
    validateLogin,
    createPanelUser,
    getPanelUser,
    getAllPanelUsers,
    updatePanelUserPassword,
    deletePanelUser,
    updatePanelUserRole,
    getAllSendableChannels,
  } = panelHelpers;

  const app = express();
  if (TRUST_PROXY) app.set("trust proxy", 1);

  const cookieSecure = COOKIE_SECURE === "auto" ? "auto" : !!COOKIE_SECURE;

  const panelHttpLogger = createLogger("panel-http");

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
      },
    },
  }));
  app.use(express.json({ limit: "300kb" }));
  app.use(express.urlencoded({ extended: false }));

  const publicDir = path.join(__dirname, "..", "..", "public");
  app.use(express.static(publicDir, { index: false }));

  const spaDir = path.join(publicDir, "panel");
  const spaIndexPath = path.join(spaDir, "index.html");
  const hasSpaBuild = fs.existsSync(spaIndexPath);
  const useLegacyPages =
    PANEL_LEGACY_PAGES === true ||
    process.env.PANEL_LEGACY_PAGES === "1" ||
    !hasSpaBuild;

  if (hasSpaBuild) {
    app.use(PANEL_BASE, express.static(spaDir, { index: false }));
  }

  const webPublicDir = path.join(__dirname, "public");
  app.use("/public", express.static(webPublicDir, { index: false }));

  app.get("/favicon.ico", (_req, res) => res.redirect(302, "/icons/panel.svg"));

  app.set("views", path.join(__dirname, "..", "views"));
  app.set("view engine", "ejs");

  app.get("/", (req, res) => {
    return res.sendFile(path.join(publicDir, "index.html"));
  });

  const sessionsDir = path.join(__dirname, "..", "..", "data");

  app.use(
    session({
      store: new SQLiteStore({ db: "sessions.db", dir: sessionsDir }),
      secret: (() => {
        const s = process.env.SESSION_SECRET;
        if (!s || s === "CHANGE_THIS_IN_PROD") {
          console.warn(
            "[SECURITY-001] SESSION_SECRET is not set or uses the default value. Set a strong random string in .env"
          );
        }
        return s || "CHANGE_THIS_IN_PROD";
      })(),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: cookieSecure,
      },
    })
  );

  // Request tracing + structured HTTP logging (panel + APIs)
  app.use((req, res, next) => {
    const traceId = newTraceId();
    req.traceId = traceId;
    res.setHeader("X-Trace-Id", traceId);

    const started = Date.now();
    const ip = (req.headers["x-forwarded-for"] || req.ip || "").toString().split(",")[0].trim();
    const ua = (req.headers["user-agent"] || "").toString().slice(0, 220);
    const user = req.session?.user?.username || null;

    const pathSafe = String(req.originalUrl || req.url || "").slice(0, 2048);

    const isStaticAsset =
      req.method === "GET" &&
      (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map)(\?|$)/i.test(pathSafe) ||
        pathSafe.startsWith("/icons/") ||
        pathSafe.startsWith("/public/") ||
        pathSafe.startsWith("/shared.css"));

    const logReq = isStaticAsset ? panelHttpLogger.debug : panelHttpLogger.info;
    const logRes = isStaticAsset ? panelHttpLogger.debug : panelHttpLogger.info;

    logReq("HTTP request", {
      traceId,
      method: req.method,
      path: pathSafe,
      ip,
      user,
      ua,
    });

    res.on("finish", () => {
      const durationMs = Date.now() - started;
      logRes("HTTP response", {
        traceId,
        method: req.method,
        path: pathSafe,
        status: res.statusCode,
        durationMs,
        ip,
        user,
      });
    });

    next();
  });

  const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 });
  const apiLimiter = rateLimit({ windowMs: 10_000, max: 40 });

  // Back-compat: older panel pages used /panel/api/bot/:botKey/*.
  // Normalize to /panel/api/:botKey/* to avoid drift across pages.
  app.use((req, _res, next) => {
    try {
      const legacyPrefix = `${PANEL_BASE}/api/bot/`;
      if (typeof req.url === "string" && req.url.startsWith(legacyPrefix)) {
        req.url = `${PANEL_BASE}/api/` + req.url.slice(legacyPrefix.length);
      }
    } catch (_) {
      // ignore
    }
    next();
  });

  const routeCtx = {
    PANEL_BASE,
    db,
    client,
    bots,
    requireAuth,
    requireAdmin,
    apiLimiter,
    loginLimiter,
    dbRun,
    dbGet,
    dbAll,
    panelHttpLogger,
    escapeHtml,
    parseHexColor,
    validateLength,
    validateLogin,
    createPanelUser,
    getPanelUser,
    getAllPanelUsers,
    updatePanelUserPassword,
    deletePanelUser,
    updatePanelUserRole,
    getAllSendableChannels,
    isAllowedChannel,
    recordOperation,
    performUndo,
    getUserMessageCount,
    ruPlural,
    getDisabledCommands,
    enableCommand,
    disableCommand,
    useLegacyPages,
  };

  app.use(createDebugRouter(routeCtx));
  app.use(createAuthRouter(routeCtx));
  app.use(createMessagesRouter(routeCtx));
  app.use(createStatsRouter(routeCtx));
  app.use(createAnalyticsRouter(routeCtx));
  if (useLegacyPages) {
    app.use(createBotPagesRouter(routeCtx));
  }
  app.use(createCommandsRouter(routeCtx));
  app.use(createAccuracyRouter(routeCtx));
  app.use(createHolidaysRouter(routeCtx));
  app.use(createAIEngagementRouter(routeCtx));
  app.use(createRateLimitsRouter(routeCtx));
  app.use(createCountdownRouter(routeCtx));
  app.use(createWhitelistRouter(routeCtx));
  app.use(createAutomodRouter(routeCtx));
  app.use(createHistoryRouter(routeCtx));
  app.use(createChannelsRouter(routeCtx));
  app.use(createSampServersRouter(routeCtx));
  app.use(createGameplayRouter(routeCtx));

  if (hasSpaBuild && !useLegacyPages) {
    app.get(PANEL_BASE, (_req, res) => res.sendFile(spaIndexPath));
    app.get(`${PANEL_BASE}/*`, (req, res, next) => {
      if (req.path.startsWith(`${PANEL_BASE}/api/`)) return next();
      return res.sendFile(spaIndexPath);
    });
  }

  app.use((err, req, res, next) => {
    try {
      panelHttpLogger.error("Unhandled server error", {
        traceId: req?.traceId || null,
        method: req?.method,
        path: req?.originalUrl,
        status: res?.statusCode,
        error: err?.message || String(err),
        stack: err?.stack,
      });
    } catch (_) {
      // ignore
    }

    if (res.headersSent) return next(err);
    return res.status(500).json({ error: "Internal server error", traceId: req?.traceId || null });
  });

  return { app, panelHttpLogger };
}

module.exports = { createPanelApp };
