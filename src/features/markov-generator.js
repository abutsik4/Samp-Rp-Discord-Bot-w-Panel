"use strict";

const fs = require('fs');
const path = require('path');

/**
 * Markov Chain Text Generator for Russian Responses
 * Pure JavaScript ML implementation - no templates
 */

const MODEL_PATH = path.join(__dirname, '../../data/markov-model.json');
const MAX_STATES = 50000;        // Maximum Markov chain states before pruning
const MAX_MODEL_FILE_SIZE = 5 * 1024 * 1024; // Refuse to load models larger than 5 MB

class MarkovChain {
  constructor(order = 2) {
    this.order = order; // Number of previous words to consider
    this.chain = {};
    this.startWords = [];
  }

  /**
   * Train the model with Russian text corpus
   */
  train(texts) {
    for (const text of texts) {
      this.trainSingle(text);
    }
  }

  /**
   * Train on a single message (for continuous learning)
   */
  trainSingle(text) {
    const words = this.tokenize(text);
    if (words.length < this.order + 1) return;

    // Store starting words
    const start = words.slice(0, this.order).join(' ');
    if (!this.startWords.includes(start)) {
      this.startWords.push(start);
    }

    // Build chain
    for (let i = 0; i < words.length - this.order; i++) {
      const state = words.slice(i, i + this.order).join(' ');
      const next = words[i + this.order];

      if (!this.chain[state]) {
        this.chain[state] = [];
      }
      this.chain[state].push(next);
    }
  }

  /**
   * Get training statistics
   */
  getStats() {
    return {
      states: Object.keys(this.chain).length,
      startWords: this.startWords.length,
      totalTransitions: Object.values(this.chain).reduce((sum, arr) => sum + arr.length, 0)
    };
  }

  /**
   * Reset the model
   */
  reset() {
    this.chain = {};
    this.startWords = [];
  }

  /**
   * Prune least-used states to keep the model under MAX_STATES.
   * Keeps the most frequently used states (longest transition arrays = most trained).
   */
  prune(maxStates = MAX_STATES) {
    const stateCount = Object.keys(this.chain).length;
    if (stateCount <= maxStates) return 0;

    // Sort states by number of transitions ascending (least-used first)
    const entries = Object.entries(this.chain)
      .sort((a, b) => a[1].length - b[1].length);

    const toRemove = stateCount - maxStates;
    let removed = 0;
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      const state = entries[i][0];
      delete this.chain[state];
      // Also remove from startWords if present
      const swIdx = this.startWords.indexOf(state);
      if (swIdx !== -1) this.startWords.splice(swIdx, 1);
      removed++;
    }
    return removed;
  }

  /**
   * Serialize model to JSON
   */
  toJSON() {
    return {
      order: this.order,
      chain: this.chain,
      startWords: this.startWords
    };
  }

  /**
   * Load model from JSON
   */
  fromJSON(data) {
    this.order = data.order || 2;
    this.chain = data.chain || {};
    this.startWords = data.startWords || [];
  }

  /**
   * Generate text based on context
   */
  generate(context = {}, maxLength = 15) {
    if (this.startWords.length === 0) {
      return null;
    }

    // Select starting point based on context
    let current = this.selectStart(context);
    const words = current.split(' ');
    let attempts = 0;
    const maxAttempts = 50;

    while (words.length < maxLength && attempts < maxAttempts) {
      attempts++;
      const state = words.slice(-this.order).join(' ');
      const options = this.chain[state];

      if (!options || options.length === 0) break;

      // Pick next word
      const next = options[Math.floor(Math.random() * options.length)];
      words.push(next);

      // Stop at punctuation if we have enough words
      if (words.length >= 5 && /[.!?]/.test(next)) {
        break;
      }
    }

    let result = words.join(' ');
    
    // Clean up
    result = this.cleanup(result);
    
    return result.length > 3 ? result : null;
  }

  /**
   * Select starting words based on context
   */
  selectStart(context) {
    const { sentiment, topics } = context;
    
    // Filter start words by context if possible
    let candidates = [...this.startWords];
    
    // Try to match sentiment/topics
    if (topics && topics.length > 0) {
      const filtered = candidates.filter(start => {
        return topics.some(topic => {
          const keywords = this.getKeywordsForTopic(topic);
          return keywords.some(kw => start.toLowerCase().includes(kw));
        });
      });
      if (filtered.length > 0) candidates = filtered;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Get keywords for topic matching
   */
  getKeywordsForTopic(topic) {
    const keywords = {
      greeting: ['привет', 'здоров', 'хай', 'добр'],
      positive: ['круто', 'топ', 'класс', 'супер', 'отлично'],
      negative: ['плох', 'грустн', 'беда'],
      gaming: ['игр', 'самп', 'сервер'],
      music: ['музык', 'песн', 'трек'],
      question: ['как', 'что', 'почему'],
    };
    return keywords[topic] || [];
  }

  /**
   * Tokenize Russian text
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[«»]/g, '"')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  /**
   * Clean up generated text
   */
  cleanup(text) {
    // Capitalize first letter
    text = text.charAt(0).toUpperCase() + text.slice(1);
    
    // Ensure it ends with punctuation
    if (!/[.!?]$/.test(text)) {
      text += Math.random() > 0.5 ? '!' : '.';
    }

    return text;
  }
}

// Russian training corpus for chat responses
const RUSSIAN_CORPUS = [
  // Greetings
  "Привет всем! Как дела у вас?",
  "Здорово! Рад вас видеть здесь.",
  "Хай! Что нового у вас сегодня?",
  "Доброе утро! Отличный день для общения.",
  "Здравствуйте! Как ваше настроение?",
  
  // Positive responses
  "Это действительно круто! Продолжайте в том же духе.",
  "Отлично получилось! Вы молодцы.",
  "Супер! Это именно то что нужно.",
  "Круто! Мне нравится ваш подход.",
  "Класс! Так держать дальше.",
  "Топ! Очень интересная тема для обсуждения.",
  
  // Engagement
  "Интересно! Расскажите подробнее об этом.",
  "Ого! Никогда не слышал о таком раньше.",
  "Да ладно! Это правда очень необычно.",
  "Вау! Впечатляет меня ваша история.",
  "Хм! Надо будет подумать об этом.",
  
  // Gaming
  "Игра отличная! Давно в неё играете?",
  "Сервер классный! Много людей онлайн сейчас?",
  "РП проекты интересные! Какая у вас роль там?",
  "ГТА топ! Самая любимая игра моя.",
  "Катаем вместе! Всегда рад новым друзьям в команде.",
  
  // Music
  "Музыка огонь! Какой жанр предпочитаете слушать?",
  "Трек классный! Кто исполнитель этой песни?",
  "Песня топ! Добавлю в свой плейлист обязательно.",
  "Альбом интересный! Слушали все треки подряд?",
  
  // Questions & Help
  "Как дела? Всё хорошо у вас сегодня?",
  "Что нового? Есть интересные новости поделиться?",
  "Почему так? Можете объяснить подробнее пожалуйста?",
  "Где это? Не могу найти нужную информацию.",
  
  // Gratitude
  "Спасибо большое! Очень помогли мне сейчас.",
  "Благодарю вас! Это было очень полезно для меня.",
  "Спасибо! Отличная работа проделали вы.",
  
  // Humor
  "Ахах! Прикольно получилось у вас.",
  "Лол! Смешно очень это всё.",
  "Хаха! Хороший юмор у вас точно.",
  
  // General chat
  "Понял вас! Согласен с вашим мнением полностью.",
  "Ага! Вижу о чём вы говорите сейчас.",
  "Окей! Сделаем так как предлагаете вы.",
  "Хорошо! Звучит как отличный план действий.",
  "Точно! Это правильное решение проблемы определённо.",
  
  // Neutral/Discussion
  "Интересный вопрос! Давайте обсудим это вместе подробнее.",
  "Хорошая тема! Мне нравится ваш взгляд на вещи.",
  "Отличное замечание! Не подумал об этом раньше.",
  "Справедливо сказано! Соглашусь с вашим мнением тут.",
];

// Initialize global Markov model (load from disk if available)
const markovModel = new MarkovChain(2);

/**
 * Save model to disk
 */
function saveModel() {
  try {
    // Prune before saving to prevent unbounded growth
    const pruned = markovModel.prune(MAX_STATES);
    if (pruned > 0) {
      console.log();
    }

    const dataDir = path.dirname(MODEL_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(MODEL_PATH, JSON.stringify(markovModel.toJSON(), null, 2));
    console.log('[Markov] Model saved to disk');
  } catch (err) {
    console.error('[Markov] Failed to save model:', err);
  }
}

/**
 * Load model from disk
 */
function loadModel() {
  try {
    if (fs.existsSync(MODEL_PATH)) {
      // Refuse to load overly large model files
      const stat = fs.statSync(MODEL_PATH);
      const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
      const maxMB = (MAX_MODEL_FILE_SIZE / 1024 / 1024).toFixed(0);
      if (stat.size > MAX_MODEL_FILE_SIZE) {
        console.warn("[Markov] Model file too large (" + sizeMB + " MB > " + maxMB + " MB) - resetting to empty model");
        markovModel.reset();
        return false;
      }
      const data = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
      markovModel.fromJSON(data);
      // Prune if loaded model exceeds state limit
      const pruned = markovModel.prune(MAX_STATES);
      if (pruned > 0) {
        console.log("[Markov] Pruned " + pruned + " excess states after loading");
      }
      const stats = markovModel.getStats();
      console.log("[Markov] Model loaded from disk: " + stats.states + " states, " + stats.totalTransitions + " transitions");
      return true;
    }
  } catch (err) {
    console.error('[Markov] Failed to load model:', err);
  }
  return false;
}

// Load existing model on startup
loadModel();

/**
 * Generate ML-based response using Markov chains
 */
function generateMarkovResponse(context) {
  const response = markovModel.generate(context, 12);
  
  if (response) {
    // Calculate confidence based on model training state
    const stats = markovModel.getStats();
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on model size
    if (stats.states > 1000) confidence = 0.85;
    else if (stats.states > 500) confidence = 0.75;
    else if (stats.states > 200) confidence = 0.65;
    else if (stats.states > 50) confidence = 0.55;
    
    // Bonus for good topic match
    if (context.topics && context.topics.length > 0) {
      confidence += 0.05;
    }
    
    confidence = Math.min(confidence, 0.95); // Cap at 0.95
    
    console.log(`[Markov] Generated response (confidence: ${confidence.toFixed(2)}, states: ${stats.states}):`, response);
    return {
      response,
      confidence,
      method: 'markov_ml'
    };
  }
  
  return null;
}

/**
 * Train model with Discord chat history
 */
async function trainFromDiscordChannel(client, channelId, limit = 500) {
  try {
    console.log(`[Markov] Fetching up to ${limit} messages from channel ${channelId}...`);
    
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error('Invalid channel or channel is not text-based');
    }

    const messages = [];
    let lastId = null;
    let totalFetched = 0;

    // Fetch messages in batches with rate-limit retry
    while (totalFetched < limit) {
      const batchSize = Math.min(100, limit - totalFetched);
      const options = { limit: batchSize };
      if (lastId) options.before = lastId;

      let batch;
      let retries = 0;
      const MAX_RETRIES = 3;
      while (true) {
        try {
          batch = await channel.messages.fetch(options);
          break; // success
        } catch (fetchErr) {
          const isRateLimit = fetchErr.status === 429 || fetchErr.code === 429 || /rate\s*limit/i.test(fetchErr.message || '');
          if (!isRateLimit || retries >= MAX_RETRIES) throw fetchErr;
          const delay = Math.min(1000 * 2 ** retries, 8000); // 1s, 2s, 4s
          console.warn(`[Markov] Rate limited fetching messages (retry ${retries + 1}/${MAX_RETRIES}), waiting ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retries++;
        }
      }

      if (batch.size === 0) break;

      batch.forEach(msg => {
        // Filter out bot messages, commands, and very short messages
        if (!msg.author.bot && !msg.content.startsWith('!') && 
            !msg.content.startsWith('/') && msg.content.length > 10) {
          messages.push(msg.content);
        }
      });

      lastId = batch.last().id;
      totalFetched += batch.size;
      
      // Respect rate limits — 1s between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[Markov] Collected ${messages.length} valid messages for training`);

    if (messages.length < 20) {
      throw new Error('Not enough messages to train (minimum 20 required)');
    }

    // Reset and retrain model with ONLY chat history (pure learning)
    markovModel.reset();
    markovModel.train(messages);

    const stats = markovModel.getStats();
    console.log(`[Markov] Training complete! States: ${stats.states}, Start words: ${stats.startWords}, Transitions: ${stats.totalTransitions}`);

    // Save trained model to disk
    saveModel();

    return {
      messagesProcessed: messages.length,
      stats
    };
  } catch (error) {
    console.error('[Markov] Training failed:', error);
    throw error;
  }
}

/**
 * Get model statistics
 */
function getMarkovStats() {
  return markovModel.getStats();
}

/**
 * Learn from a new message (continuous learning)
 */
function learnFromMessage(message) {
  // Filter out bot messages, commands, and very short messages
  if (message.author.bot || 
      message.content.startsWith('!') || 
      message.content.startsWith('/') || 
      message.content.length < 10) {
    return false;
  }

  markovModel.trainSingle(message.content);
  
  // Save model periodically (every 10 new messages)
  if (Math.random() < 0.1) {
    saveModel();
  }
  
  return true;
}

module.exports = {
  MarkovChain,
  generateMarkovResponse,
  trainFromDiscordChannel,
  getMarkovStats,
  learnFromMessage,
  saveModel,
  loadModel,
};
