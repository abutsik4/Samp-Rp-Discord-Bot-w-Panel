"use strict";

/**
 * ML Engine for AI Chat Engagement
 * Provides sentiment analysis, topic classification, and response optimization
 * Uses Markov chains for ML-based text generation
 */

const { generateMarkovResponse } = require('./markov-generator');

let pipeline = null;
try {
  const transformers = require("@xenova/transformers");
  pipeline = transformers.pipeline;
} catch (err) {
  console.warn("[ML Engine] @xenova/transformers not available, using Markov-based ML");
}

let brain = null;
try {
  brain = require("brain.js");
} catch (err) {
  console.warn("[ML Engine] brain.js not available, using keyword-only classification");
}

// -------------------------
// ML MODEL INITIALIZATION
// -------------------------

let sentimentAnalyzer = null;
let topicClassifier = null;
let textGenerator = null;
let isInitialized = false;
let initializationPromise = null;

// Topic categories for classification
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

/**
 * Initialize ML models (async, called on bot startup)
 * Downloads models on first run (~150 MB), subsequent runs use cache
 */
async function initializeML() {
  if (isInitialized) return;
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    try {
      console.log("[ML Engine] Initializing ML models...");
      const startTime = Date.now();

      // Try to load sentiment analysis (optional - will fall back if unavailable)
      try {
        if (pipeline) {
          console.log("[ML Engine] Loading sentiment analysis model...");
          sentimentAnalyzer = await pipeline(
            "sentiment-analysis",
            "Xenova/distilbert-base-uncased-finetuned-sst-2-english"
          );
          console.log("[ML Engine] ✅ Sentiment model loaded");
        } else {
          console.log("[ML Engine] Pipeline not available, skipping transformers");
        }
      } catch (err) {
        console.warn("[ML Engine] ⚠️  Transformers not available, using fallback sentiment analysis");
        sentimentAnalyzer = null;
      }

      // Initialize text generation model for Russian responses
      try {
        if (pipeline) {
          console.log("[ML Engine] Loading text generation model (GPT-2 multilingual)...");
          // Use a smaller, faster model for text generation
          textGenerator = await pipeline(
            "text-generation",
            "Xenova/gpt2"
          );
          console.log("[ML Engine] ✅ Text generation model loaded");
        }
      } catch (err) {
        console.warn("[ML Engine] ⚠️  Text generation model not available:", err.message);
        textGenerator = null;
      }

      // Initialize simple topic classifier using brain.js
      try {
        if (brain) {
          console.log("[ML Engine] Initializing topic classifier...");
          topicClassifier = new brain.NeuralNetwork({
            hiddenLayers: [10, 5],
            activation: "sigmoid",
          });

          // Pre-train with basic Russian patterns
          const trainingData = generateTopicTrainingData();
          topicClassifier.train(trainingData, {
            iterations: 2000,
            errorThresh: 0.005,
            log: false,
          });
          console.log("[ML Engine] ✅ Topic classifier trained");
        } else {
          console.log("[ML Engine] Brain.js not available, using keyword-only classification");
        }
      } catch (err) {
        console.warn("[ML Engine] ⚠️  Brain.js not available, using keyword-only classification");
        topicClassifier = null;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[ML Engine] ✅ ML models initialized in ${elapsed}s`);
      console.log(`[ML Engine] Memory usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);

      isInitialized = true;
    } catch (error) {
      console.error("[ML Engine] ❌ Failed to initialize ML models:", error);
      console.warn("[ML Engine] Falling back to keyword-based analysis");
      isInitialized = false;
    }
  })();

  return initializationPromise;
}

/**
 * Generate training data for topic classifier
 */
function generateTopicTrainingData() {
  const data = [];

  // Gaming examples
  data.push(
    { input: normalizeForNN("давайте играть в gta"), output: { gaming: 1 } },
    { input: normalizeForNN("кто на сервере"), output: { gaming: 1 } },
    { input: normalizeForNN("игра классная"), output: { gaming: 1 } }
  );

  // Music examples
  data.push(
    { input: normalizeForNN("какую музыку слушаете"), output: { music: 1 } },
    { input: normalizeForNN("песня огонь"), output: { music: 1 } },
    { input: normalizeForNN("трек классный"), output: { music: 1 } }
  );

  // Greeting examples
  data.push(
    { input: normalizeForNN("привет всем"), output: { greeting: 1 } },
    { input: normalizeForNN("здорово народ"), output: { greeting: 1 } },
    { input: normalizeForNN("хай"), output: { greeting: 1 } }
  );

  // Positive examples
  data.push(
    { input: normalizeForNN("это круто"), output: { positive: 1 } },
    { input: normalizeForNN("супер отлично"), output: { positive: 1 } },
    { input: normalizeForNN("топ"), output: { positive: 1 } }
  );

  // Negative examples
  data.push(
    { input: normalizeForNN("плохо все"), output: { negative: 1 } },
    { input: normalizeForNN("грустно"), output: { negative: 1 } },
    { input: normalizeForNN("ужасно"), output: { negative: 1 } }
  );

  return data;
}

/**
 * Normalize text for neural network input
 */
function normalizeForNN(text) {
  // Convert text to character frequency vector
  const chars = "абвгдежзийклмнопрстуфхцчшщъыьэюяabcdefghijklmnopqrstuvwxyz ";
  const vector = {};

  const normalized = text.toLowerCase().slice(0, 100); // Limit length
  for (const char of normalized) {
    if (chars.includes(char)) {
      vector[char] = (vector[char] || 0) + 1;
    }
  }

  // Normalize frequencies
  const total = Object.values(vector).reduce((a, b) => a + b, 0);
  for (const char in vector) {
    vector[char] = vector[char] / total;
  }

  return vector;
}

// -------------------------
// ML ANALYSIS FUNCTIONS
// -------------------------

/**
 * Analyze sentiment of text using ML
 * Returns: { label: 'POSITIVE'|'NEGATIVE'|'NEUTRAL', score: 0-1, method: 'ml'|'fallback' }
 */
async function analyzeSentiment(text) {
  if (!text || text.trim().length === 0) {
    return { label: "NEUTRAL", score: 0.5, method: "empty" };
  }

  // Try ML-based sentiment analysis
  if (isInitialized && sentimentAnalyzer) {
    try {
      const result = await sentimentAnalyzer(text.slice(0, 512)); // Limit length
      const sentiment = result[0];

      // Map to our format
      let label = "NEUTRAL";
      if (sentiment.label === "POSITIVE" && sentiment.score > 0.6) label = "POSITIVE";
      else if (sentiment.label === "NEGATIVE" && sentiment.score > 0.6) label = "NEGATIVE";

      return {
        label,
        score: sentiment.score,
        method: "ml",
      };
    } catch (err) {
      console.warn("[ML Engine] Sentiment analysis failed, using fallback:", err.message);
    }
  }

  // Fallback: keyword-based sentiment
  return analyzeSentimentFallback(text);
}

/**
 * Fallback sentiment analysis using keywords
 */
function analyzeSentimentFallback(text) {
  const lowerText = text.toLowerCase();

  const positiveKeywords = ["круто", "супер", "отлично", "класс", "топ", "огонь", "кайф", "хорошо", "спасибо", "👍", "😊", "❤️", "🔥"];
  const negativeKeywords = ["плохо", "ужасно", "беда", "грустно", "😢", "😭", "👎", "проблем"];

  let positiveCount = 0;
  let negativeCount = 0;

  for (const kw of positiveKeywords) {
    if (lowerText.includes(kw)) positiveCount++;
  }
  for (const kw of negativeKeywords) {
    if (lowerText.includes(kw)) negativeCount++;
  }

  if (positiveCount > negativeCount) {
    return { label: "POSITIVE", score: 0.7, method: "fallback" };
  } else if (negativeCount > positiveCount) {
    return { label: "NEGATIVE", score: 0.7, method: "fallback" };
  }

  return { label: "NEUTRAL", score: 0.5, method: "fallback" };
}

/**
 * Classify topic of text using ML + keywords
 * Returns: { topics: ['gaming', 'positive'], confidence: 0.8, method: 'ml'|'fallback' }
 */
async function classifyTopic(text) {
  if (!text || text.trim().length === 0) {
    return { topics: [TOPICS.NEUTRAL], confidence: 0.5, method: "empty" };
  }

  const detectedTopics = [];

  // Keyword-based topic detection (always run for coverage)
  const lowerText = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        if (!detectedTopics.includes(topic)) {
          detectedTopics.push(topic);
        }
      }
    }
  }

  // ML-based classification (if available)
  if (isInitialized && topicClassifier) {
    try {
      const input = normalizeForNN(text.slice(0, 200));
      const nnResult = topicClassifier.run(input);

      // Add high-confidence topics from neural network
      for (const [topic, score] of Object.entries(nnResult)) {
        if (score > 0.6 && !detectedTopics.includes(topic)) {
          detectedTopics.push(topic);
        }
      }
    } catch (err) {
      console.warn("[ML Engine] Topic classification failed:", err.message);
    }
  }

  // Default to neutral if nothing detected
  if (detectedTopics.length === 0) {
    detectedTopics.push(TOPICS.NEUTRAL);
  }

  return {
    topics: detectedTopics,
    confidence: detectedTopics.length > 0 ? 0.8 : 0.5,
    method: isInitialized ? "hybrid" : "fallback",
  };
}

/**
 * Analyze context with ML enhancement
 * Combines sentiment and topic analysis
 */
async function analyzeContextML(recentMessages) {
  if (!recentMessages || recentMessages.length === 0) {
    return {
      sentiment: { label: "NEUTRAL", score: 0.5 },
      topics: [TOPICS.NEUTRAL],
      context: "",
      messageCount: 0,
    };
  }

  // Combine recent messages
  const combinedText = recentMessages.join(" ").slice(0, 1000); // Limit total length

  // Parallel analysis
  const [sentiment, topicResult] = await Promise.all([analyzeSentiment(combinedText), classifyTopic(combinedText)]);

  return {
    sentiment,
    topics: topicResult.topics,
    confidence: topicResult.confidence,
    context: combinedText.slice(0, 200),
    messageCount: recentMessages.length,
  };
}

/**
 * Generate contextual Russian response using ML
 * Returns: { response: string, confidence: number, method: string } or null if unable to generate
 */
async function generateContextualResponse(context, mlConfidenceThreshold = 0.3) {
  if (!context || !context.sentiment) {
    return null;
  }

  const sentiment = context.sentiment.label || "NEUTRAL";
  const topics = context.topics || [];
  const mlConfidence = context.confidence || 0;

  console.log(`[ML Engine] Generating response - Sentiment: ${sentiment}, Topics: ${topics.join(", ")}, Confidence: ${mlConfidence}, Threshold: ${mlConfidenceThreshold}`);

  // MARKOV ML: Use Markov chain-based generation (pure ML, no templates)
  // This generates statistically probable responses based on trained corpus
  const markovResult = generateMarkovResponse({
    sentiment,
    topics,
    confidence: mlConfidence
  });
  
  if (!markovResult) {
    console.log('[ML Engine] No ML response generated - Markov chain produced no output');
    return null;
  }

  // Apply ML confidence threshold check
  if (markovResult.confidence < mlConfidenceThreshold) {
    console.log(`[ML Engine] Response rejected - confidence ${markovResult.confidence.toFixed(2)} below threshold ${mlConfidenceThreshold}`);
    return null;
  }
  
  console.log("[ML Engine] Generated response via Markov ML:", markovResult.response);
  return markovResult;
}

/**
 * Get ML engine status
 */
function getMLStatus() {
  return {
    initialized: isInitialized,
    models: {
      sentiment: sentimentAnalyzer !== null,
      topic: topicClassifier !== null,
      markov: true, // Markov is always available
    },
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
  };
}

// -------------------------
// EXPORTS
// -------------------------

module.exports = {
  initializeML,
  analyzeSentiment,
  classifyTopic,
  analyzeContextML,
  generateContextualResponse,
  getMLStatus,
  TOPICS,
};
