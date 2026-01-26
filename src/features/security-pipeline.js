"use strict";

const { EmbedBuilder } = require("discord.js");
const { 
  getLastMessageAuthor, 
  resetConsecutiveCount, 
  checkConsecutiveLimit, 
  trackConsecutiveMessage,
  recordViolationWithStrikes,
  getViolationStrikes,
  calculateTimeoutDuration,
  formatTimeoutDuration,
  checkRateLimit,
  trackMessage,
  recordViolation
} = require("./rate-limiter");
const { dbAll } = require("../utils/db-helpers");

/**
 * Executes all security checks (rate limits, consecutive, automod)
 * Returns { allowed: boolean, stop: boolean }
 */
async function runSecurityPipeline(db, message, userRoles) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  const channelId = message.channel.id;

  // 1. CONSECUTIVE MESSAGE LIMITING
  const lastAuthor = await getLastMessageAuthor(db, guildId, channelId);
  if (lastAuthor && lastAuthor !== userId) {
    await resetConsecutiveCount(db, guildId, channelId, lastAuthor);
  }

  const consecutiveCheck = await checkConsecutiveLimit(db, guildId, channelId, userId, userRoles);
  
  if (!consecutiveCheck.allowed) {
    // Admin check
    if (consecutiveCheck.config?.ignore_admins !== false) {
      if (message.member && (message.member.permissions.has('Administrator') || message.member.permissions.has('ManageGuild'))) {
        await trackConsecutiveMessage(db, guildId, channelId, userId, message.id, Math.floor(Date.now() / 1000));
        return { allowed: true, stop: false };
      }
    }
    
    console.log(`[Consecutive Limit] User ${userId} exceeded limit in ${channelId}`);
    
    try { await message.delete(); } catch {}
    try {
      await message.author.send(`⚠️ Не флудите! Вы отправили более ${consecutiveCheck.limit} сообщений подряд. Подождите, пока другие пользователи ответят.`);
    } catch {}

    await recordViolationWithStrikes(db, guildId, channelId, userId, userRoles, consecutiveCheck.config);
    const totalStrikes = await getViolationStrikes(db, guildId, userId);
    
    if (consecutiveCheck.config?.timeouts_enabled !== false && totalStrikes >= 5) {
      const timeoutMinutes = calculateTimeoutDuration(totalStrikes, consecutiveCheck.config || {});
      const cappedMinutes = Math.min(timeoutMinutes, 120);
      try {
        await message.member.timeout(cappedMinutes * 60 * 1000, `Rate limit violation: ${totalStrikes} strikes`);
        await message.author.send(`⏱️ Вы получили тайм-аут на ${formatTimeoutDuration(cappedMinutes)} за ${totalStrikes} нарушений.`);
      } catch (err) {
        console.warn(`[Timeout] Failed:`, err.message);
      }
    }
    return { allowed: false, stop: true };
  }

  await trackConsecutiveMessage(db, guildId, channelId, userId, message.id, Math.floor(Date.now() / 1000));

  // 2. TIME-WINDOW RATE LIMITING
  const rateLimitCheck = await checkRateLimit(db, guildId, channelId, userId, userRoles);
  
  if (!rateLimitCheck.allowed) {
    const config = rateLimitCheck.config;
    try {
      const warningMsg = config.warning_message || "You have exceeded the message limit.";
      await message.author.send(`⚠️ ${warningMsg}\nLimit: ${rateLimitCheck.limit} per ${config.time_window_minutes} min.`);
    } catch {}

    if (config.action === 'delete') {
      try { await message.delete(); } catch {}
    }

    await recordViolation(db, guildId, channelId, userId);
    return { allowed: false, stop: true };
  }

  if (rateLimitCheck.config) {
    await trackMessage(db, guildId, channelId, userId, message.id);
  }

  // 3. AUTOMOD (BANNED WORDS)
  // This could also be cached or moved, but for now we'll just keep it here
  const bannedWords = await dbAll(db, `SELECT word, case_sensitive FROM banned_words WHERE guild_id = ?`, [guildId]);
  
  if (bannedWords?.length > 0 && message.content) {
    const content = message.content;
    for (const { word, case_sensitive } of bannedWords) {
      const pattern = new RegExp(`\\b${word}\\b`, case_sensitive ? 'g' : 'gi');
      if (pattern.test(content)) {
        try {
          await message.delete();
          await message.author.send(`⚠️ Your message was deleted because it contained a banned word: "${word}"`);
        } catch {}
        return { allowed: false, stop: true };
      }
    }
  }

  return { allowed: true, stop: false };
}

module.exports = { runSecurityPipeline };
