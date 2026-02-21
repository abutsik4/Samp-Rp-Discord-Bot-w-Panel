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

function invalidateBannedWordsCache(guildId) {
  if (guildId === undefined || guildId === null) return;
  bannedWordsCache.delete(String(guildId));
}

function invalidateAllBannedWordsCache() {
  bannedWordsCache.clear();
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAutomodText(input, caseSensitive) {
  let out = String(input || "").normalize("NFKC");
  if (!caseSensitive) {
    out = out.toLowerCase();
    // Common RU equivalence in chats: treat "ё" ~ "е" for matching.
    out = out.replaceAll("ё", "е");
  }
  return out;
}

function compileBannedWord(wordRaw, caseSensitive) {
  const original = String(wordRaw || "").trim();
  if (!original) return null;

  const needle = normalizeAutomodText(original, caseSensitive);
  if (!needle) return null;

  // If the entry contains spaces/punctuation, treat it as a simple substring.
  // If it's a single word/token, apply Unicode-aware boundaries.
  const isToken = /^[\p{L}\p{N}_]+$/u.test(needle);
  if (!isToken) {
    return { word: original, case_sensitive: !!caseSensitive, mode: "substr", needle, regex: null };
  }

  // Unicode-aware boundary check (Cyrillic-safe):
  //   (^|non-word) + needle + ($|non-word)
  // where "word" is letters/numbers/underscore.
  const safe = escapeRegExp(needle);
  const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${safe}(?:$|[^\\p{L}\\p{N}_])`, "u");
  return { word: original, case_sensitive: !!caseSensitive, mode: "boundary", needle, regex };
}

async function getBannedWordsCached(db, guildId) {
  const now = Date.now();
  const cached = bannedWordsCache.get(guildId);
  if (cached && cached.expiresAt > now) return cached.words;

  const rows = (await dbAll(db, `SELECT word, case_sensitive FROM banned_words WHERE guild_id = ?`, [guildId])) || [];
  const words = [];
  for (const r of rows) {
    const compiled = compileBannedWord(r?.word, !!r?.case_sensitive);
    if (compiled) words.push(compiled);
  }
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
    const contentN = normalizeAutomodText(message.content, true);
    const contentL = normalizeAutomodText(message.content, false);

    for (const entry of bannedWords) {
      if (!entry?.word) continue;
      const hay = entry.case_sensitive ? contentN : contentL;
      const hit = entry.mode === "substr" ? hay.includes(entry.needle) : entry.regex?.test(hay);
      if (hit) {
        try {
          await message.delete();
          await message.author.send(`⚠️ Ваше сообщение было удалено, так как содержит запрещённое слово: "${entry.word}"`);
        } catch {}
        return { allowed: false, stop: true };
      }
    }
  }

  return { allowed: true, stop: false };
}

module.exports = {
  runSecurityPipeline,
  invalidateBannedWordsCache,
  invalidateAllBannedWordsCache,
};
