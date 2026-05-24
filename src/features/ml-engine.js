"use strict";

/**
 * ML Engine for AI Chat Engagement
 * 
 * **Downsized** — transformers and brain.js removed (unusable on this VPS
 * due to 200–400 MB model downloads + OOM risk).  The sentiment and topic
 * analysis now use a lightweight keyword-based classifier.  Text generation
 * still uses the Markov chain (pure JS, no native deps).
 */

const { generateMarkovResponse } = require('./markov-generator');

// -------------------------
// TOPIC DEFINITIONS
// -------------------------

const TOPICS = {
  GAMING: "gaming",
  MUSIC: "music",
  GREETING: "greeting",
  GRATITUDE: "gratitude",
  HUMOR: "humor",
  QUESTION: "question",
  POSITIVE: "positive",
  NEGATIVE: "negative",
  BOT_RELATED: "bot_related",
  NEUTRAL: "neutral",
};

// Russian keyword patterns for topic classification
const TOPIC_KEYWORDS = {
  [TOPICS.GAMING]: ["игра", "играть", "игру", "gta", "samp", "самп", "сервер", "катать", "рп"],
  [TOPICS.MUSIC]: ["музык", "песн", "трек", "альбом", "радио", "слуша", "музон"],
  [TOPICS.GREETING]: ["привет", "хай", "здорово", "hey", "hi", "hello", "доброе утро", "добрый вечер"],
  [TOPICS.GRATITUDE]: ["спасибо", "благодар", "thanks", "thx"],
  [TOPICS.HUMOR]: ["лол", "хаха", "ахах", "смешно", "прикол", "lol", "😂", "🤣"],
  [TOPICS.QUESTION]: ["?", "как", "что", "почему", "зачем", "где", "когда"],
  [TOPICS.POSITIVE]: ["топ", "лучш", "круто", "огонь", "кайф", "супер", "отлично", "класс"],
  [TOPICS.NEGATIVE]: ["плохо", "грустно", "беда", "проблем", "😢", "😭", "ужасно"],
  [TOPICS.BOT_RELATED]: ["бот", "bot", "робот"],
};

// -------------------------
// NO-OP INITIALIZATION
// -------------------------
// Previously loaded Xenova transformers (~150 MB models) and brain.js.
// Now a no-op so callers don't break.

let isInitialized = true; // Always "initialized" since keyword + Markov are always available

async function initializeML() {
  console.log("[ML Engine] Initialized (keyword + Markov mode — transformers/brain.js disabled for memory savings)");
  return;
}

// -------------------------
// SENTIMENT ANALYSIS  (keyword-only)
// -------------------------

const POSITIVE_KW = ["круто", "супер", "отлично", "класс", "топ", "огонь", "кайф", "хорошо", "спасибо", "👍", "😊", "❤️", "🔥"];
const NEGATIVE_KW = ["плохо", "ужасно", "беда", "грустно", "😢", "😭", "👎", "проблем"];

function analyzeSentiment(text) {
  if (!text || text.trim().length === 0) {
    return { label: "NEUTRAL", score: 0.5, method: "empty" };
  }
  const lower = text.toLowerCase();
  let pos = 0, neg = 0;
  for (const kw of POSITIVE_KW) { if (lower.includes(kw)) pos++; }
  for (const kw of NEGATIVE_KW) { if (lower.includes(kw)) neg++; }
  if (pos > neg) return { label: "POSITIVE", score: 0.7, method: "keyword" };
  if (neg > pos) return { label: "NEGATIVE", score: 0.7, method: "keyword" };
  return { label: "NEUTRAL", score: 0.5, method: "keyword" };
}

// -------------------------
// TOPIC CLASSIFICATION  (keyword-only)
// -------------------------

function classifyTopic(text) {
  if (!text || text.trim().length === 0) {
    return { topics: [TOPICS.NEUTRAL], confidence: 0.5, method: "keyword" };
  }

  const detectedTopics = [];
  const lower = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        if (!detectedTopics.includes(topic)) detectedTopics.push(topic);
      }
    }
  }
  if (detectedTopics.length === 0) detectedTopics.push(TOPICS.NEUTRAL);

  return {
    topics: detectedTopics,
    confidence: detectedTopics.length > 0 ? 0.8 : 0.5,
    method: "keyword",
  };
}

// -------------------------
// CONTEXT ANALYSIS + RESPONSE
// -------------------------

async function analyzeContextML(recentMessages) {
  if (!recentMessages || recentMessages.length === 0) {
    return {
      sentiment: { label: "NEUTRAL", score: 0.5 },
      topics: [TOPICS.NEUTRAL],
      context: "",
      messageCount: 0,
    };
  }
  const combinedText = recentMessages.join(" ").slice(0, 1000);
  const sentiment = analyzeSentiment(combinedText);
  const topicResult = classifyTopic(combinedText);
  return {
    sentiment,
    topics: topicResult.topics,
    confidence: topicResult.confidence,
    context: combinedText.slice(0, 200),
    messageCount: recentMessages.length,
  };
}

async function generateContextualResponse(context, mlConfidenceThreshold = 0.3) {
  if (!context || !context.sentiment) return null;

  const sentiment = context.sentiment.label || "NEUTRAL";
  const topics = context.topics || [];
  const mlConfidence = context.confidence || 0;

  const markovResult = generateMarkovResponse({ sentiment, topics, confidence: mlConfidence });
  if (!markovResult) return null;
  if (markovResult.confidence < mlConfidenceThreshold) return null;

  return markovResult;
}

function getMLStatus() {
  return {
    initialized: isInitialized,
    models: {
      sentiment: false,  // no model — keyword-only
      topic: false,       // no model — keyword-only
      markov: true,
    },
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
  };
}

module.exports = {
  initializeML,
  analyzeSentiment,
  classifyTopic,
  analyzeContextML,
  generateContextualResponse,
  getMLStatus,
  TOPICS,
};