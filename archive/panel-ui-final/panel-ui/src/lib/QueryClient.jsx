/**
 * QueryClient — shared cache + invalidation store for useQuery/useMutation.
 *
 * Provides:
 *  - Global cache shared across all components
 *  - `invalidate(keys)` — marks cached entries as stale and notifies subscribers
 *  - `subscribe(keys, callback)` — watch for invalidation events
 *  - Stable reference via React Context so hooks don't re-create it
 *
 * Usage:
 *   import { QueryClientProvider, useQueryClient } from '../lib/QueryClient';
 *   // Wrap App:
 *   <QueryClientProvider> ... </QueryClientProvider>
 *   // In any component:
 *   const qc = useQueryClient();
 *   qc.invalidate(['/panel/api/vproject-bot/messages']);
 */

import { createContext, useContext, useRef, useCallback } from "react";

class QueryClientStore {
  constructor() {
    /** @type {Map<string, { data: any, ts: number, ttl: number }>} */
    this.cache = new Map();
    /** @type {Map<string, Set<() => void>>} key -> set of subscriber callbacks */
    this.subscribers = new Map();
    /** @type {Map<string, AbortController>} key -> in-flight abort controller */
    this.inflight = new Map();
  }

  // ── Cache operations ─────────────────────────────────────

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key, data, ttl = 30_000) {
    this.cache.set(key, { data, ts: Date.now(), ttl });
  }

  delete(key) {
    this.cache.delete(key);
  }

  // ── In-flight dedup ──────────────────────────────────────

  getInflight(key) {
    return this.inflight.get(key) || null;
  }

  setInflight(key, controller) {
    this.inflight.set(key, controller);
  }

  removeInflight(key) {
    this.inflight.delete(key);
  }

  // ── Invalidation + subscribers ────────────────────────────

  /**
   * Invalidate one or more cache keys (prefix matching).
   * All keys that start with any of the provided prefixes will be evicted
   * and their subscribers notified.
   */
  invalidate(prefixes) {
    const prefixList = Array.isArray(prefixes) ? prefixes : [prefixes];
    const toEvict = [];

    for (const cacheKey of this.cache.keys()) {
      if (prefixList.some((p) => cacheKey.startsWith(p))) {
        toEvict.push(cacheKey);
      }
    }

    for (const key of toEvict) {
      this.cache.delete(key);
    }

    // Notify subscribers for any key matching the prefix
    const toNotify = new Set();
    for (const subKey of this.subscribers.keys()) {
      if (prefixList.some((p) => subKey.startsWith(p) || p.startsWith(subKey))) {
        toNotify.add(subKey);
      }
    }

    for (const key of toNotify) {
      const cbs = this.subscribers.get(key);
      if (cbs) {
        for (const cb of cbs) {
          try { cb(); } catch { /* ignore */ }
        }
      }
    }
  }

  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);
    return () => {
      const set = this.subscribers.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.subscribers.delete(key);
      }
    };
  }

  /** Clear all caches and abort all in-flight requests */
  clear() {
    for (const controller of this.inflight.values()) {
      try { controller.abort(); } catch { /* ignore */ }
    }
    this.inflight.clear();
    this.cache.clear();
    // Notify all subscribers
    for (const [, cbs] of this.subscribers) {
      for (const cb of cbs) {
        try { cb(); } catch { /* ignore */ }
      }
    }
  }
}

// ── React Context ────────────────────────────────────────────
const QueryClientContext = createContext(null);

// Singleton — safe because we create it at module level
const globalStore = new QueryClientStore();

export function QueryClientProvider({ children }) {
  // Use a ref so the store is stable across renders without causing context
  // value changes (prevents unnecessary re-renders of consumers)
  const storeRef = useRef(globalStore);
  return (
    <QueryClientContext.Provider value={storeRef.current}>
      {children}
    </QueryClientContext.Provider>
  );
}

export function useQueryClient() {
  const store = useContext(QueryClientContext);
  if (!store) {
    throw new Error("useQueryClient must be used within a QueryClientProvider");
  }
  return store;
}

// Export the class for testing
export { QueryClientStore };