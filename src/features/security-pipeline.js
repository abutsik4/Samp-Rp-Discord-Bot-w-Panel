"use strict";

const { 
  checkRateLimit,
  noteConsecutiveMessage,
  getRateLimitConfig,
  recordViolationWithStrikes,
  getViolationStrikes,
  calculateTimeoutDuration
} = require("./rate-limiter");
const { addWantedStar } = require("./wanted-stars");
const { dbAll } = require("../utils/db-helpers");

// guildId -> { expiresAt: number, words: Array<{word: string, case_sensitive: number|boolean}> }
const bannedWordsCache = new Map();
const BANNED_WORDS_TTL_MS = 60_000;

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getBannedWordsCached(db, guildId) {
  const now = Date.now();
  const cached = bannedWordsCache.get(guildId);
  if (cached && cached.expiresAt > now) return cached.words;

  const words = (await dbAll(db, `SELECT word, case_sensitive FROM banned_words WHERE guild_id = ?`, [guildId])) || [];
  bannedWordsCache.set(guildId, { expiresAt: now + BANNED_WORDS_TTL_MS, words });

  // Best-effort pruning to avoid unbounded growth.
  if (bannedWordsCache.size > 5000) {
    for (const [k, v] of bannedWordsCache.entries()) {
      if (!v || typeof v.expiresAt !== "number" || v.expiresAt <= now) bannedWordsCache.delete(k);
    }
  }

  return words;
}

/**
 * Executes all security checks (rate limits, automod)
 * Returns { allowed: boolean, stop: boolean }
 */
async function runSecurityPipeline(db, message, userRoles) {
  // Do not count bots/webhooks in spam prevention.
  // Also: bot messages should not reset human turn-taking state.
  if (message?.author?.bot || message?.webhookId) {
    return { allowed: true, stop: false };
  }

  const guildId = message.guild.id;
  const userId = message.author.id;
  const channelId = message.channel.id;

  // Fetch config once so we can correctly bypass admins without
  // incrementing turn-taking counters.
  const config = await getRateLimitConfig(db, guildId, channelId);
  if (!config || !config.enabled) {
    return { allowed: true, stop: false };
  }

  // Admin bypass (optional): never limit admins, but still count their message as a "turn"
  // so it resets other users.
  if (config.ignore_admins !== false) {
    if (message.member && (message.member.permissions.has('Administrator') || message.member.permissions.has('ManageGuild'))) {
      try { noteConsecutiveMessage(guildId, channelId, userId); } catch (_) {}
      return { allowed: true, stop: false };
    }
  }

  // 1. SPAM LIMITS (Turn-taking / Consecutive)
  const rateLimitCheck = await checkRateLimit(db, guildId, channelId, userId, userRoles, config);
  
  if (!rateLimitCheck.allowed) {
    const config = rateLimitCheck.config;

    try {
      const warningMsg = config?.warning_message || "Вы превысили лимит сообщений.";
      await message.author.send(`⚠️ ${warningMsg}\nЛимит: ${rateLimitCheck.limit} сообщений подряд (сбрасывается, когда напишет кто-то другой).`);
    } catch {}

    if (config?.action === 'delete') {
      console.log(`[Security] Deleting message from ${userId} in ${channelId} due to spam limit (${rateLimitCheck.current}/${rateLimitCheck.limit})`);
      try { await message.delete(); } catch {}
    }

    // Strikes + optional timeouts
    try {
      await recordViolationWithStrikes(db, guildId, channelId, userId, userRoles, config);
      const strikes = await getViolationStrikes(db, guildId, userId);

      // D-track: add GTA-style wanted star for each spam violation
      try { await addWantedStar(db, guildId, userId); } catch (_) {}

      if (config?.timeouts_enabled !== false && message.member && typeof message.member.timeout === 'function') {
        const timeoutMinutes = calculateTimeoutDuration(strikes, config);
        if (timeoutMinutes > 0) {
          try {
            await message.member.timeout(timeoutMinutes * 60 * 1000, `Spam prevention: ${strikes} strikes`);
          } catch (e) {
            // Missing permissions / hierarchy errors are common; ignore.
          }
        }
      }
    } catch (_) {}

    return { allowed: false, stop: true };
  }

  // 2. AUTOMOD (BANNED WORDS)
  // Cached to reduce DB pressure on busy servers.
  const bannedWords = await getBannedWordsCached(db, guildId);
  
  if (bannedWords?.length > 0 && message.content) {
    const content = message.content;
    for (const { word, case_sensitive } of bannedWords) {
      if (!word) continue;
      const safeWord = escapeRegExp(word);
      const pattern = new RegExp(`\\b${safeWord}\\b`, case_sensitive ? "g" : "gi");
      if (pattern.test(content)) {
        try {
          await message.delete();
          await message.author.send(`⚠️ Ваше сообщение было удалено, так как содержит запрещённое слово: "${word}"`);
        } catch {}
        return { allowed: false, stop: true };
      }
    }
  }

  return { allowed: true, stop: false };
}

module.exports = { runSecurityPipeline };
