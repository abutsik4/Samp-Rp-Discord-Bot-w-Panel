"use strict";

const LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

function normalizeLevel(input) {
  const raw = String(input || "info").trim().toLowerCase();
  if (raw in LEVELS) return raw;
  // accept numeric
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n <= 0) return "silent";
    if (n === 1) return "error";
    if (n === 2) return "warn";
    if (n === 3) return "info";
    if (n === 4) return "debug";
    return "trace";
  }
  return "info";
}

function safeJson(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v && typeof v === "object") {
      if (seen.has(v)) return "[Circular]";
      seen.add(v);
    }
    return v;
  });
}

function toKeyValue(ctx) {
  if (!ctx || typeof ctx !== "object") return "";
  const parts = [];
  for (const [k, v] of Object.entries(ctx)) {
    if (v === undefined) continue;
    if (v === null) {
      parts.push(`${k}=null`);
      continue;
    }
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}=${String(v)}`);
      continue;
    }
    parts.push(`${k}=${safeJson(v)}`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

function createLogger(component, baseContext = {}) {
  const levelName = normalizeLevel(process.env.LOG_LEVEL);
  const threshold = LEVELS[levelName] ?? LEVELS.info;
  const format = String(process.env.LOG_FORMAT || "pretty").trim().toLowerCase();

  function enabled(level) {
    return (LEVELS[level] ?? 999) <= threshold;
  }

  function emit(level, message, context) {
    if (!enabled(level)) return;

    const ts = new Date().toISOString();
    const ctx = { component, ...baseContext, ...(context || {}) };

    if (format === "json") {
      const payload = {
        ts,
        level,
        message: String(message),
        ...ctx,
      };
      const line = safeJson(payload);
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
      return;
    }

    const prefix = `[${ts}] [${level}] [${component}]`;
    const line = `${prefix} ${String(message)}${toKeyValue(ctx)}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }

  function child(extraContext) {
    return createLogger(component, { ...baseContext, ...(extraContext || {}) });
  }

  return {
    level: levelName,
    child,
    error: (msg, ctx) => emit("error", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    info: (msg, ctx) => emit("info", msg, ctx),
    debug: (msg, ctx) => emit("debug", msg, ctx),
    trace: (msg, ctx) => emit("trace", msg, ctx),
  };
}

function newTraceId() {
  const rand = Math.random().toString(36).slice(2, 10);
  const t = Date.now().toString(36);
  return `${t}-${rand}`;
}

module.exports = {
  createLogger,
  newTraceId,
  LEVELS,
};
