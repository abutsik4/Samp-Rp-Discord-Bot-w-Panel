"use strict";

const { EmbedBuilder } = require("discord.js");
const { 
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

  // 1. RATE LIMITING
  const rateLimitCheck = await checkRateLimit(db, guildId, channelId, userId, userRoles);
  
  if (!rateLimitCheck.allowed) {
    const config = rateLimitCheck.config;
    
    // Admin check
    if (config?.ignore_admins !== false) {
      if (message.member && (message.member.permissions.has('Administrator') || message.member.permissions.has('ManageGuild'))) {
        await trackMessage(db, guildId, channelId, userId, message.id);
        return { allowed: true, stop: false };
      }
    }

    try {
      const warningMsg = config?.warning_message || "You have exceeded the message limit.";
      await message.author.send(`⚠️ ${warningMsg}\nLimit: ${rateLimitCheck.limit} per ${config?.time_window_minutes || 60} min.`);
    } catch {}

    if (config?.action === 'delete') {
      try { await message.delete(); } catch {}
    }

    await recordViolation(db, guildId, channelId, userId);
    return { allowed: false, stop: true };
  }

  if (rateLimitCheck.config) {
    await trackMessage(db, guildId, channelId, userId, message.id);
  }

  // 2. AUTOMOD (BANNED WORDS)
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
