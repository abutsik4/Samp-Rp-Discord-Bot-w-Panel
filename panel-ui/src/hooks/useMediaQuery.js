import { useState, useEffect } from "react";

/**
 * useMediaQuery — returns true when the given CSS media query matches.
 * Uses matchMedia for efficient listener-based updates.
 *
 * @param {string} query — CSS media query string, e.g. "(max-width: 600px)"
 * @returns {boolean}
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    // Sync in case the initial state was wrong (SSR / late hydration)
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/**
 * useIsMobile — convenience hook: true when viewport < 600px
 */
export function useIsMobile() {
  return useMediaQuery("(max-width: 600px)");
}

/**
 * useIsTablet — convenience hook: true when viewport < 900px
 */
export function useIsTablet() {
  return useMediaQuery("(max-width: 900px)");
}