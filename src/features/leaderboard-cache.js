"use strict";

/**
 * Leaderboard Cache Module
 * 
 * Optional Redis-based caching for fast leaderboard queries.
 * Gracefully degrades to SQL if Redis is not available.
 */

const { dbAll, dbGet } = require("../utils/db-helpers");

let redis = null;
let redisAvailable = false;

/**
 * Initialize Redis connection (optional)
 * Call this at bot startup with Redis configuration
 */
function initLeaderboardCache(redisConfig = null) {
  if (!redisConfig || !redisConfig.url) {
    console.log('[Leaderboard Cache] Redis not configured - using SQL fallback');
    return false;
  }

  try {
    const Redis = require('ioredis');
    
    redis = new Redis(redisConfig.url, {
      retryStrategy(times) {
        if (times > 3) {
          console.log('[Leaderboard Cache] Redis retry limit reached - using SQL fallback');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });

    redis.on('connect', () => {
      console.log('[Leaderboard Cache] ✅ Redis connected');
      redisAvailable = true;
    });

    redis.on('error', (err) => {
      console.error('[Leaderboard Cache] Redis error:', err.message);
      redisAvailable = false;
    });

    redis.on('close', () => {
      console.log('[Leaderboard Cache] Redis connection closed');
      redisAvailable = false;
    });

    // Attempt connection
    redis.connect().catch(err => {
      console.error('[Leaderboard Cache] Failed to connect to Redis:', err.message);
      redisAvailable = false;
    });

    return true;
  } catch (err) {
    console.error('[Leaderboard Cache] Failed to initialize Redis:', err.message);
    console.log('[Leaderboard Cache] Install with: npm install ioredis');
    redis = null;
    redisAvailable = false;
    return false;
  }
}

/**
 * Update leaderboard cache when message count changes
 * Non-blocking, won't fail if Redis is down
 */
async function updateLeaderboard(guildId, userId, delta) {
  if (!redis || !redisAvailable) return;

  try {
    const key = `leaderboard:${guildId}`;
    await redis.zincrby(key, delta, userId);
    
    // Set TTL to 5 minutes - auto-expiration instead of aggressive invalidation
    await redis.expire(key, 300);
  } catch (err) {
    // Non-critical - log and continue
    console.error('[Leaderboard Cache] Update failed:', err.message);
  }
}

/**
 * Get leaderboard from cache or database
 * Returns: { source: 'redis'|'sqlite', data: [...] }
 */
async function getLeaderboard(db, guildId, limit = 10, offset = 0) {
  // Try Redis first if available
  if (redis && redisAvailable) {
    try {
      const key = `leaderboard:${guildId}`;
      const results = await redis.zrevrange(
        key,
        offset,
        offset + limit - 1,
        'WITHSCORES'
      );

      if (results && results.length > 0) {
        // Parse [userId, score, userId, score, ...]
        const leaderboard = [];
        for (let i = 0; i < results.length; i += 2) {
          leaderboard.push({
            user_id: results[i],
            message_count: parseInt(results[i + 1], 10),
          });
        }
        return { source: 'redis', data: leaderboard };
      }
    } catch (err) {
      console.error('[Leaderboard Cache] Redis query failed, falling back to SQL:', err.message);
    }
  }

  // Fallback to reliable SQL
  const rows = await dbAll(
    db,
    `SELECT user_id, message_count 
     FROM user_stats 
     WHERE guild_id = ? 
     ORDER BY message_count DESC 
     LIMIT ? OFFSET ?`,
    [guildId, limit, offset]
  );

  return { source: 'sqlite', data: rows || [] };
}

/**
 * Get user's rank in leaderboard
 */
async function getUserRank(db, guildId, userId) {
  // Try Redis first
  if (redis && redisAvailable) {
    try {
      const key = `leaderboard:${guildId}`;
      const rank = await redis.zrevrank(key, userId);
      if (rank !== null) {
        return rank + 1; // Redis ranks are 0-indexed
      }
    } catch (err) {
      console.error('[Leaderboard Cache] Redis rank query failed:', err.message);
    }
  }

  // Fallback to SQL
  const result = await dbGet(
    db,
    `SELECT COUNT(*) + 1 as rank
     FROM user_stats
     WHERE guild_id = ? AND message_count > (
       SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?
     )`,
    [guildId, guildId, userId]
  );

  return result?.rank || null;
}

/**
 * Rebuild leaderboard cache from database
 * Call this after backfill or major data changes
 */
async function rebuildLeaderboard(db, guildId) {
  if (!redis || !redisAvailable) {
    console.log('[Leaderboard Cache] Redis not available - skipping rebuild');
    return false;
  }

  try {
    const users = await dbAll(
      db,
      `SELECT user_id, message_count FROM user_stats WHERE guild_id = ?`,
      [guildId]
    );

    if (users.length === 0) {
      console.log(`[Leaderboard Cache] No users found for guild ${guildId}`);
      return false;
    }

    const key = `leaderboard:${guildId}`;
    
    // Clear existing cache
    await redis.del(key);

    // Batch add all users (Redis ZADD can handle thousands at once)
    const args = users.flatMap(u => [u.message_count, u.user_id]);
    await redis.zadd(key, ...args);
    await redis.expire(key, 300); // 5 min TTL

    console.log(`[Leaderboard Cache] ✅ Rebuilt ${guildId} with ${users.length} users`);
    return true;
  } catch (err) {
    console.error('[Leaderboard Cache] Rebuild failed:', err.message);
    return false;
  }
}

/**
 * Clear all leaderboard caches
 */
async function clearAllCaches() {
  if (!redis || !redisAvailable) return false;

  try {
    const keys = await redis.keys('leaderboard:*');
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Leaderboard Cache] Cleared ${keys.length} cached leaderboards`);
    }
    return true;
  } catch (err) {
    console.error('[Leaderboard Cache] Clear failed:', err.message);
    return false;
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  if (!redis || !redisAvailable) {
    return { available: false };
  }

  try {
    const keys = await redis.keys('leaderboard:*');
    const stats = {
      available: true,
      cachedGuilds: keys.length,
      totalKeys: keys.length,
    };

    // Sample size of first cached guild
    if (keys.length > 0) {
      const size = await redis.zcard(keys[0]);
      stats.sampleSize = size;
    }

    return stats;
  } catch (err) {
    return { available: false, error: err.message };
  }
}

module.exports = {
  initLeaderboardCache,
  updateLeaderboard,
  getLeaderboard,
  getUserRank,
  rebuildLeaderboard,
  clearAllCaches,
  getCacheStats,
};
