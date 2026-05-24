/**
 * JepsenCloud Panel — HTTP client
 *
 * Wraps `fetch` with:
 *  - Automatic JSON handling
 *  - CSRF token management (double-submit cookie pattern)
 *  - Request deduplication (in-flight requests with the same key are shared)
 *  - Abort-controller integration (cancel on unmount)
 *  - Configurable retry with exponential back-off
 *  - Normalised error objects
 */

const DEFAULT_JSON_HEADERS = { "Content-Type": "application/json" };

// ── CSRF token management ────────────────────────────────
// The server sets X-CSRF-Token on every response. We read it and send it
// back on state-changing requests (POST, PUT, PATCH, DELETE).
let csrfToken = "";

function updateCsrfFromResponse(response) {
  const token = response.headers.get("X-CSRF-Token");
  if (token) csrfToken = token;
}

// ── In-flight request deduplication ─────────────────────
const pendingRequests = new Map();

function dedupKey(method, url, body) {
  if (method !== "GET") return null; // only dedup reads
  return `GET:${url}`;
}

// ── Error normalisation ──────────────────────────────────
function normalizeErrorPayload(payload, status) {
  const rawError = payload?.error;
  if (typeof rawError === "string") {
    return {
      code: payload?.code || payload?.errorCode || `HTTP_${status}`,
      message: rawError,
      traceId: payload?.traceId || payload?.trace_id || null,
      details: payload?.details || null,
    };
  }
  if (rawError && typeof rawError === "object") {
    return {
      code: rawError.code || payload?.code || payload?.errorCode || `HTTP_${status}`,
      message: rawError.message || payload?.message || `HTTP ${status}`,
      traceId: rawError.traceId || payload?.traceId || payload?.trace_id || null,
      details: rawError.details || payload?.details || null,
    };
  }
  return {
    code: payload?.code || payload?.errorCode || `HTTP_${status}`,
    message: payload?.message || `HTTP ${status}`,
    traceId: payload?.traceId || payload?.trace_id || null,
    details: payload?.details || null,
  };
}

function tryParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// ── Core fetch with retry + dedup + CSRF ──────────────────
export async function apiFetch(path, options = {}) {
  const {
    retries = 1,
    retryDelay = 800,
    signal: externalSignal,
    ...fetchOptions
  } = options;

  const method = (fetchOptions.method || "GET").toUpperCase();
  const dedup = dedupKey(method, path, fetchOptions.body);

  // --- Dedup: reuse in-flight GET -----------------------------------------
  if (dedup && pendingRequests.has(dedup)) {
    return pendingRequests.get(dedup);
  }

  const controller = new AbortController();
  const combinedSignal = externalSignal
    ? composeSignals(externalSignal, controller.signal)
    : controller.signal;

  const promise = (async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (combinedSignal.aborted) throw new DOMException("Aborted", "AbortError");

      try {
        // Build headers: include CSRF token on state-changing requests
        const headers = {
          ...DEFAULT_JSON_HEADERS,
          ...(fetchOptions.headers || {}),
        };
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && csrfToken) {
          headers["X-CSRF-Token"] = csrfToken;
        }

        const response = await fetch(path, {
          credentials: "same-origin",
          ...fetchOptions,
          headers,
          signal: combinedSignal,
        });

        // Capture CSRF token from every response
        updateCsrfFromResponse(response);

        const text = await response.text();
        const payload = text ? tryParseJson(text) : null;

        if (!response.ok) {
          const normalized = normalizeErrorPayload(payload, response.status);
          const error = new Error(normalized.message || `HTTP ${response.status}`);
          error.status = response.status;
          error.payload = payload;
          error.code = normalized.code;
          error.traceId = normalized.traceId;
          error.details = normalized.details;
          throw error;
        }

        return payload;
      } catch (err) {
        if (err.name === "AbortError") throw err;
        // Don't retry 4xx
        if (err.status >= 400 && err.status < 500) throw err;
        lastError = err;
        if (attempt < retries) {
          await sleep(retryDelay * Math.pow(2, attempt));
        }
      }
    }
    throw lastError;
  })();

  if (dedup) {
    pendingRequests.set(dedup, promise);
    promise.finally(() => pendingRequests.delete(dedup));
  }

  return promise;
}

// ── Helpers ──────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compose two AbortSignals so aborting either aborts the request. */
function composeSignals(a, b) {
  const controller = new AbortController();
  if (a.aborted || b.aborted) controller.abort();
  a.addEventListener("abort", () => controller.abort());
  b.addEventListener("abort", () => controller.abort());
  return controller.signal;
}

export function formatApiError(err, fallback = "Request failed") {
  const message = err?.message || fallback;
  const code = err?.code ? `[${err.code}] ` : "";
  const traceSuffix = err?.traceId ? ` (trace: ${err.traceId})` : "";
  return `${code}${message}${traceSuffix}`;
}

export { tryParseJson, normalizeErrorPayload };