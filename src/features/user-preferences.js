"use strict";

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * User Preferences Module
 * Tracks user engagement patterns and learns preferences for personalized responses
 */

// -------------------------
// DATABASE FUNCTIONS
// -------------------------

/**
 * Ensure user preferences tables exist
 */
async function ensureUserPreferencesTables(db) {
  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS ai_user_preferences (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      preferred_sentiment TEXT DEFAULT 'NEUTRAL',
      preferred_topics TEXT DEFAULT '[]',
      response_type_weights TEXT DEFAULT '{"simple":0.5,"contextual":0.5}',
      interaction_count INTEGER DEFAULT 0,
      positive_reactions INTEGER DEFAULT 0,
      negative_reactions INTEGER DEFAULT 0,
      last_interaction INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (guild_id, user_id)
    )
  `
  );

  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS ai_ml_training_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      message_text TEXT,
      bot_response TEXT,
      sentiment TEXT,
      topics TEXT,
      response_type TEXT,
      success_score REAL DEFAULT 0,
      user_replied INTEGER DEFAULT 0,
      reactions_positive INTEGER DEFAULT 0,
      reactions_negative INTEGER DEFAULT 0,
      timestamp INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `
  );

  await dbRun(
    db,
    `
    CREATE INDEX IF NOT EXISTS idx_training_data_guild 
    ON ai_ml_training_data(guild_id, timestamp)
  `
  );

  await dbRun(
    db,
    `
    CREATE TABLE IF NOT EXISTS ai_ml_metadata (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `
  );
}

/**
 * Get user preferences
 */
async function getUserPreferences(db, guildId, userId) {
  let prefs = await dbGet(db, `SELECT * FROM ai_user_preferences WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);

  if (!prefs) {
    // Create default preferences
    await dbRun(
      db,
      `
      INSERT INTO ai_user_preferences (guild_id, user_id)
      VALUES (?, ?)
    `,
      [guildId, userId]
    );
    prefs = await dbGet(db, `SELECT * FROM ai_user_preferences WHERE guild_id = ? AND user_id = ?`, [guildId, userId]);
  }

  // Parse JSON fields
  prefs.preferred_topics = JSON.parse(prefs.preferred_topics || "[]");
  prefs.response_type_weights = JSON.parse(prefs.response_type_weights || '{"simple":0.5,"contextual":0.5}');

  return prefs;
}

/**
 * Update user preferences based on interaction
 */
async function updateUserPreferences(db, guildId, userId, interaction) {
  const prefs = await getUserPreferences(db, guildId, userId);

  // Update interaction count
  const newInteractionCount = prefs.interaction_count + 1;

  // Update sentiment preference (weighted average)
  let preferredSentiment = prefs.preferred_sentiment;
  if (interaction.sentiment && interaction.wasPositive) {
    preferredSentiment = interaction.sentiment;
  }

  // Update topic preferences
  const preferredTopics = prefs.preferred_topics;
  if (interaction.topics && interaction.wasPositive) {
    for (const topic of interaction.topics) {
      if (!preferredTopics.includes(topic)) {
        preferredTopics.push(topic);
      }
    }
    // Keep only most recent 5 topics
    if (preferredTopics.length > 5) {
      preferredTopics.shift();
    }
  }

  // Update response type weights based on success
  const weights = prefs.response_type_weights;
  if (interaction.responseType && interaction.successScore !== undefined) {
    const learningRate = 0.1;
    const currentWeight = weights[interaction.responseType] || 0.5;
    weights[interaction.responseType] = currentWeight + learningRate * (interaction.successScore - currentWeight);

    // Normalize weights
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    for (const key in weights) {
      weights[key] = weights[key] / total;
    }
  }

  // Update reaction counts
  const positiveReactions = prefs.positive_reactions + (interaction.positiveReactions || 0);
  const negativeReactions = prefs.negative_reactions + (interaction.negativeReactions || 0);

  await dbRun(
    db,
    `
    UPDATE ai_user_preferences
    SET preferred_sentiment = ?,
        preferred_topics = ?,
        response_type_weights = ?,
        interaction_count = ?,
        positive_reactions = ?,
        negative_reactions = ?,
        last_interaction = strftime('%s', 'now'),
        updated_at = strftime('%s', 'now')
    WHERE guild_id = ? AND user_id = ?
  `,
    [preferredSentiment, JSON.stringify(preferredTopics), JSON.stringify(weights), newInteractionCount, positiveReactions, negativeReactions, guildId, userId]
  );
}

/**
 * Record training data for ML improvement
 */
async function recordTrainingData(db, data) {
  const { guildId, userId, messageText, botResponse, sentiment, topics, responseType, successScore, userReplied, reactionsPositive, reactionsNegative } = data;

  await dbRun(
    db,
    `
    INSERT INTO ai_ml_training_data 
    (guild_id, user_id, message_text, bot_response, sentiment, topics, response_type, 
     success_score, user_replied, reactions_positive, reactions_negative)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [guildId, userId, messageText, botResponse, sentiment, JSON.stringify(topics || []), responseType, successScore || 0, userReplied ? 1 : 0, reactionsPositive || 0, reactionsNegative || 0]
  );
}

/**
 * Get training statistics
 */
async function getTrainingStats(db, guildId) {
  const total = await dbGet(db, `SELECT COUNT(*) as count FROM ai_ml_training_data WHERE guild_id = ?`, [guildId]);

  const avgSuccess = await dbGet(db, `SELECT AVG(success_score) as avg FROM ai_ml_training_data WHERE guild_id = ? AND success_score > 0`, [guildId]);

  const byResponseType = await dbAll(
    db,
    `
    SELECT response_type, COUNT(*) as count, AVG(success_score) as avg_success
    FROM ai_ml_training_data
    WHERE guild_id = ?
    GROUP BY response_type
  `,
    [guildId]
  );

  const sentimentDist = await dbAll(
    db,
    `
    SELECT sentiment, COUNT(*) as count
    FROM ai_ml_training_data
    WHERE guild_id = ?
    GROUP BY sentiment
  `,
    [guildId]
  );

  return {
    totalRecords: total?.count || 0,
    avgSuccessScore: avgSuccess?.avg || 0,
    byResponseType: byResponseType || [],
    sentimentDistribution: sentimentDist || [],
  };
}

/**
 * Calculate success score based on user reactions and replies
 */
function calculateSuccessScore(reactionsPositive, reactionsNegative, userReplied) {
  let score = 0.5; // Neutral baseline

  // Positive reactions increase score
  if (reactionsPositive > 0) {
    score += Math.min(reactionsPositive * 0.2, 0.4);
  }

  // Negative reactions decrease score
  if (reactionsNegative > 0) {
    score -= Math.min(reactionsNegative * 0.2, 0.4);
  }

  // User replying indicates engagement
  if (userReplied) {
    score += 0.1;
  }

  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, score));
}

/**
 * Get personalized response weights for a user
 */
async function getPersonalizedWeights(db, guildId, userId, defaultWeights) {
  const prefs = await getUserPreferences(db, guildId, userId);

  // If user has enough interactions, use their learned weights
  if (prefs.interaction_count >= 5) {
    return prefs.response_type_weights;
  }

  // Otherwise use default
  return defaultWeights;
}

module.exports = {
  ensureUserPreferencesTables,
  getUserPreferences,
  updateUserPreferences,
  recordTrainingData,
  getTrainingStats,
  calculateSuccessScore,
  getPersonalizedWeights,
};
