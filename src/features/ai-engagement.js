"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const { analyzeSentiment, classifyTopic, analyzeContextML, generateContextualResponse } = require("./ml-engine");
const { getUserPreferences, updateUserPreferences, recordTrainingData, getPersonalizedWeights } = require("./user-preferences");

/**
 * AI Chat Engagement Module
 * Pure ML-based chat engagement - NO hardcoded templates
 * Responses generated only from ML context analysis
 */

// -------------------------
// DATABASE SCHEMA
// -------------------------

async function ensureAIEngagementTables(db) {
  // Settings table - now includes ML confidence threshold
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS ai_engagement_settings (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      probability REAL DEFAULT 3.0,
      cooldown_minutes INTEGER DEFAULT 5,
      target_channels TEXT DEFAULT '[]',
      ml_confidence_threshold REAL DEFAULT 0.3,
      mode TEXT DEFAULT 'ml_only',
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `
  );

  // Engagement history table
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS ai_engagement_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      response_type TEXT NOT NULL,
      response_text TEXT NOT NULL,
      context_keywords TEXT DEFAULT '[]',
      ml_sentiment TEXT,
      ml_topics TEXT DEFAULT '[]',
      ml_confidence REAL DEFAULT 0,
      timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `
  );

  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_ai_engagement_guild ON ai_engagement_history(guild_id)`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_ai_engagement_timestamp ON ai_engagement_history(timestamp)`);
}

// -------------------------
// SETTINGS MANAGEMENT
// -------------------------

async function getEngagementSettings(db, guildId) {
  const row = await dbGet(db, `SELECT * FROM ai_engagement_settings WHERE guild_id = ?`, [guildId]);

  if (!row) {
    return {
      enabled: true,
      probability: 5.0, // Increased from 3.0 for better engagement
      cooldown_minutes: 5,
      target_channels: [],
      ml_confidence_threshold: 0.2, // Lowered from 0.3 for more responses
      mode: "ml_only",
    };
  }

  return {
    ...row,
    enabled: Boolean(row.enabled),
    target_channels: JSON.parse(row.target_channels || "[]"),
    ml_confidence_threshold: row.ml_confidence_threshold || 0.2, // Lowered default
  };
}

async function updateEngagementSettings(db, guildId, settings) {
  const existing = await dbGet(db, `SELECT guild_id FROM ai_engagement_settings WHERE guild_id = ?`, [guildId]);

  const enabled = settings.enabled !== undefined ? (settings.enabled ? 1 : 0) : 1;
  const probability = settings.probability !== undefined ? settings.probability : 3.0;
  const cooldownMinutes = settings.cooldown_minutes !== undefined ? settings.cooldown_minutes : 5;
  const targetChannels = JSON.stringify(settings.target_channels || []);
  const mlConfidenceThreshold = settings.ml_confidence_threshold !== undefined ? settings.ml_confidence_threshold : 0.3;
  const mode = settings.mode || "ml_only";

  if (existing) {
    await dbRun(
      db,
      `
      UPDATE ai_engagement_settings
      SET enabled = ?, probability = ?, cooldown_minutes = ?, 
          target_channels = ?, ml_confidence_threshold = ?, mode = ?, updated_at = strftime('%s', 'now')
      WHERE guild_id = ?
    `,
      [enabled, probability, cooldownMinutes, targetChannels, mlConfidenceThreshold, mode, guildId]
    );
  } else {
    await dbRun(
      db,
      `
      INSERT INTO ai_engagement_settings 
      (guild_id, enabled, probability, cooldown_minutes, target_channels, ml_confidence_threshold, mode)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [guildId, enabled, probability, cooldownMinutes, targetChannels, mlConfidenceThreshold, mode]
    );
  }
}

// -------------------------
// ML CONTEXT ANALYSIS
// -------------------------

async function analyzeContext(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 10 });
    const recentMessages = Array.from(messages.values())
      .reverse()
      .map((m) => m.content)
      .filter((c) => c && c.length > 0);

    if (recentMessages.length === 0) {
      return { keywords: [], sentiment: { label: "NEUTRAL", score: 0.5 }, topics: [], confidence: 0 };
    }

    const fullText = recentMessages.join(" ");
    const sentiment = await analyzeSentiment(fullText);
    const topicResult = await classifyTopic(fullText);

    return {
      keywords: [],
      sentiment: sentiment || { label: "NEUTRAL", score: 0.5 },
      topics: topicResult.topics || [],
      confidence: topicResult.confidence || 0,
      recentMessages: recentMessages.slice(-5), // Keep last 5 for context
    };
  } catch (err) {
    console.error("[AI Engagement] Context analysis error:", err);
    return { keywords: [], sentiment: { label: "NEUTRAL", score: 0.5 }, topics: [], confidence: 0 };
  }
}

// -------------------------
// ENGAGEMENT LOGIC
// -------------------------

async function shouldEngage(db, guildId, channelId, settings) {
  if (!settings.enabled) return false;

  // Check channel whitelist
  if (settings.target_channels.length > 0 && !settings.target_channels.includes(channelId)) {
    return false;
  }

  // Check probability
  if (Math.random() * 100 > settings.probability) {
    return false;
  }

  // Check cooldown
  const lastEngagement = await dbGet(
    db,
    `SELECT timestamp FROM ai_engagement_history 
     WHERE guild_id = ? AND channel_id = ? 
     ORDER BY timestamp DESC LIMIT 1`,
    [guildId, channelId]
  );

  if (lastEngagement) {
    const elapsed = Math.floor(Date.now() / 1000) - lastEngagement.timestamp;
    if (elapsed < settings.cooldown_minutes * 60) {
      return false;
    }
  }

  return true;
}

/**
 * Main engagement handler - ML with intelligent fallback
 * Bot will respond using ML when available, or context-aware templates as fallback
 */
async function tryEngageWithMessage(db, message, settings) {
  try {
    const guildId = message.guild.id;
    const channelId = message.channel.id;
    const userId = message.author.id;

    // CONTINUOUS LEARNING: Learn from every valid message in target channels
    const targetChannels = settings.target_channels || [];
    const isTargetChannel = targetChannels.length === 0 || targetChannels.includes(channelId);
    
    if (isTargetChannel) {
      const { learnFromMessage } = require("./markov-generator");
      const learned = learnFromMessage(message);
      if (learned) {
        console.log(`[AI Engagement] 📚 Learned from message in channel ${channelId}`);
      }
    }

    console.log(`[AI Engagement] Checking engagement for message in channel ${channelId}`);

    // Check if should engage (probability + cooldown check)
    const shouldRespond = await shouldEngage(db, guildId, channelId, settings);
    if (!shouldRespond) {
      console.log(`[AI Engagement] Skipping - shouldEngage returned false`);
      return;
    }

    console.log(`[AI Engagement] Will attempt to engage - analyzing context...`);

    // ALWAYS analyze context with ML
    const context = await analyzeContext(message.channel);
    console.log(`[AI Engagement] Context analyzed - Sentiment: ${context.sentiment?.label}, Topics: ${context.topics?.join(", ")}, Confidence: ${context.confidence}`);

    // Check cooldown (time since last engagement in this channel)
    const cooldownCheck = await dbGet(
      db,
      `SELECT timestamp FROM ai_engagement_history 
       WHERE guild_id = ? AND channel_id = ? 
       ORDER BY timestamp DESC LIMIT 1`,
      [guildId, channelId]
    );

    if (cooldownCheck) {
      const lastEngagement = cooldownCheck.timestamp;
      const now = Math.floor(Date.now() / 1000);
      const elapsedMinutes = (now - lastEngagement) / 60;

      if (elapsedMinutes < settings.cooldown_minutes) {
        console.log(`[AI Engagement] Cooldown active: ${elapsedMinutes.toFixed(1)}/${settings.cooldown_minutes} min`);
        return; // Skip - still in cooldown
      }
    }

    // Try to get ML-generated response (with fallback support)
    const mlResult = await generateContextualResponse(context, settings.ml_confidence_threshold || 0.2);

    // If ML has no response, skip
    if (!mlResult || !mlResult.response) {
      console.log(`[AI Engagement] Skipping - No response generated (confidence: ${context.confidence || 0})`);
      return;
    }

    const responseText = mlResult.response;
    const responseType = mlResult.method; // 'ml_generation' or 'ml_fallback'

    console.log(`[AI Engagement] Responding via ${responseType}, confidence: ${mlResult.confidence.toFixed(2)}, text: "${responseText}"`);

    // Send response
    const sentMessage = await message.channel.send(responseText);

    // Log engagement
    await dbRun(
      db,
      `INSERT INTO ai_engagement_history 
       (guild_id, channel_id, message_id, response_type, response_text, context_keywords, ml_sentiment, ml_topics, ml_confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        guildId,
        channelId,
        sentMessage.id,
        responseType,
        responseText,
        JSON.stringify(context.keywords || []),
        context.sentiment?.label || "NEUTRAL",
        JSON.stringify(context.topics || []),
        mlResult.confidence || 0,
      ]
    );

    // Record ML training data for future improvements
    await recordTrainingData(db, {
      guildId,
      userId,
      messageText: message.content,
      botResponse: responseText,
      sentiment: context.sentiment?.label || "NEUTRAL",
      topics: context.topics || [],
      responseType,
      successScore: mlResult.confidence,
      userReplied: 0,
      reactionsPositive: 0,
      reactionsNegative: 0,
    });

    console.log(`[AI Engagement] ✅ Successfully sent response`);
  } catch (err) {
    console.error("[AI Engagement] Error:", err);
  }
}

// -------------------------
// STATISTICS
// -------------------------

async function getEngagementStats(db, guildId) {
  const totalEngagements = await dbGet(db, `SELECT COUNT(*) as count FROM ai_engagement_history WHERE guild_id = ?`, [guildId]);

  const last24h = await dbGet(
    db,
    `SELECT COUNT(*) as count FROM ai_engagement_history 
     WHERE guild_id = ? AND timestamp > strftime('%s', 'now', '-1 day')`,
    [guildId]
  );

  const byType = await dbAll(
    db,
    `SELECT response_type, COUNT(*) as count 
     FROM ai_engagement_history 
     WHERE guild_id = ? 
     GROUP BY response_type`,
    [guildId]
  );

  return {
    totalEngagements: totalEngagements?.count || 0,
    last24h: last24h?.count || 0,
    byType: byType || [],
  };
}

// -------------------------
// EXPORTS
// -------------------------

module.exports = {
  ensureAIEngagementTables,
  getEngagementSettings,
  updateEngagementSettings,
  tryEngageWithMessage,
  getEngagementStats,
};
