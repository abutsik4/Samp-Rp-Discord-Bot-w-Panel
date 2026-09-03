import { useEffect, useRef, useState, useCallback, useContext } from "react";
import { apiFetch } from "../lib/client";
import { useQueryClient } from "../lib/QueryClient";

/**
 * useQuery — data-fetching hook with shared cache, revalidation, and invalidation.
 *
 * Usage:
 *   const { data, loading, error, refresh } = useQuery("/panel/api/auth/bots", { deps: [botKey] });
 *
 * Options:
 *   deps       — extra dependency array (in addition to url). Re-fetch when deps change.
 *   enabled    — set false to skip fetching (default true).
 *   ttl        — cache time-to-live in ms (default 30000 = 30s).
 *   retries    — number of retries on server error (default 1).
 *   onSuccess  — callback with data after successful fetch.
 *   refetchOnInvalidation — refetch when this key is invalidated (default true).
 */
export function useQuery(url, opts = {}) {
  const {
    deps = [],
    enabled = true,
    ttl = 30_000,
    retries = 1,
    onSuccess,
    refetchOnInvalidation = true,
  } = opts;

  const store = useQueryClient();
  const [data, setData] = useState(() => store.get(url));
  const [loading, setLoading] = useState(data === undefined);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const fetchIdRef = useRef(0); // Guard against stale fetches

  const fetch_ = useCallback(async () => {
    if (!url || !enabled) return;

    // Check shared cache first
    const cached = store.get(url);
    if (cached !== undefined) {
      setData(cached);
      setLoading(false);
      setError(null);
      if (onSuccess) onSuccess(cached);
      return cached;
    }

    // Dedup in-flight requests
    let controller = store.getInflight(url);
    if (controller) {
      // Wait for the existing in-flight request
      return;
    }

    controller = new AbortController();
    store.setInflight(url, controller);
    const fetchId = ++fetchIdRef.current;

    setLoading(true);
    setError(null);

    try {
      const result = await apiFetch(url, {
        signal: controller.signal,
        retries,
      });

      // Remove from inflight map
      store.removeInflight(url);

      if (!mountedRef.current || fetchId !== fetchIdRef.current) return result;

      setData(result);
      store.set(url, result, ttl);
      if (onSuccess) onSuccess(result);
      return result;
    } catch (err) {
      store.removeInflight(url);

      if (err.name === "AbortError") return;
      if (!mountedRef.current) return;

      setError(err);
      throw err;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [url, enabled, ttl, retries, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial fetch + refetch on deps change
  useEffect(() => {
    mountedRef.current = true;
    fetch_();
    return () => {
      mountedRef.current = false;
    };
  }, [fetch_]);

  // Subscribe to invalidation events for this key
  useEffect(() => {
    if (!refetchOnInvalidation || !url) return;
    const unsub = store.subscribe(url, () => {
      if (mountedRef.current) {
        store.delete(url); // Clear stale cache
        fetch_(); // Refetch
      }
    });
    return unsub;
  }, [url, refetchOnInvalidation, fetch_]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    store.delete(url);
    return fetch_();
  }, [url, fetch_, store]);

  return { data, loading, error, refresh };
}

/**
 * useMutation — hook for POST/PUT/DELETE calls with invalidation support.
 *
 * Usage:
 *   const [mutate, { loading, error }] = useMutation(panelApi.createMessage, {
 *     invalidate: ['/panel/api/vproject-bot/messages'],
 *     onSuccess: (result) => toast('Created!'),
 *   });
 *   await mutate(botKey, payload);
 *
 * Options:
 *   invalidate  — string or string[] of cache keys to invalidate after success.
 *   onSuccess   — callback after successful mutation.
 *   onError     — callback after failed mutation.
 */
export function useMutation(fn, opts = {}) {
  const { invalidate: invalidateKeys, onSuccess, onError } = opts;
  const store = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const mutate = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn(...args);
      if (!mountedRef.current) return result;

      // Invalidate specified keys so dependent queries refetch
      if (invalidateKeys) {
        store.invalidate(invalidateKeys);
      }

      if (onSuccess) onSuccess(result);
      return result;
    } catch (err) {
      if (!mountedRef.current) throw err;
      setError(err);
      if (onError) onError(err);
      throw err;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fn, invalidateKeys, onSuccess, onError, store]); // eslint-disable-line react-hooks/exhaustive-deps

  return [mutate, { loading, error }];
}