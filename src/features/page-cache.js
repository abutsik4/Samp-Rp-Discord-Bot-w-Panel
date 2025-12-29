"use strict";

/**
 * Page Cache Module
 * 
 * In-memory caching for web route responses
 * with TTL-based expiration and pattern matching
 */

class PageCache {
  constructor(ttlSeconds = 300) {
    this.cache = new Map();
    this.ttl = ttlSeconds * 1000;
    this.hits = 0;
    this.misses = 0;
    this.cleanupInterval = null;
  }

  /**
   * Store value in cache with TTL
   */
  set(key, value) {
    this.cache.set(key, {
      data: value,
      expires: Date.now() + this.ttl,
    });
  }

  /**
   * Get value from cache (returns null if expired or missing)
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data;
  }

  /**
   * Invalidate cache entries matching pattern
   * Pattern: "guild:123:*" matches "guild:123:page:1", "guild:123:page:2", etc.
   */
  invalidate(pattern) {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    let deleted = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    return size;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expired = 0;

    for (const entry of this.cache.values()) {
      if (now > entry.expires) {
        expired++;
      }
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? ((this.hits / totalRequests) * 100).toFixed(2) : 0;

    return {
      size: this.cache.size,
      active: this.cache.size - expired,
      expired,
      hits: this.hits,
      misses: this.misses,
      hitRate: `${hitRate}%`,
      ttlSeconds: this.ttl / 1000,
    };
  }

  /**
   * Start automatic cleanup of expired entries
   * Runs every 5 minutes by default
   */
  startCleanup(intervalMs = 300000) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expires) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[Page Cache] Cleaned ${cleaned} expired entries`);
      }
    }, intervalMs);

    console.log('[Page Cache] Auto-cleanup started');
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[Page Cache] Auto-cleanup stopped');
    }
  }
}

// Global cache instances for different content types
const leaderboardCache = new PageCache(300); // 5 minutes for leaderboard pages
const statsCache = new PageCache(60); // 1 minute for stats pages
const analyticsCache = new PageCache(600); // 10 minutes for analytics

// Start auto-cleanup
leaderboardCache.startCleanup();
statsCache.startCleanup();
analyticsCache.startCleanup();

module.exports = {
  PageCache,
  leaderboardCache,
  statsCache,
  analyticsCache,
};
