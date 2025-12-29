#!/usr/bin/env node

/**
 * Load Test - Message Processing Pipeline
 * Simulates high message volume with whitelist + automod filtering
 * 
 * Usage: node scripts/load-test-message-processing.js [messages_per_second]
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { performance } = require("perf_hooks");

const DB_PATH = path.join(__dirname, "../data/stats.db");
const TEST_GUILD_ID = "load_test_guild_" + Date.now();
const MESSAGES_PER_SECOND = parseInt(process.argv[2]) || 50;
const TEST_DURATION_SECONDS = parseInt(process.argv[3]) || 10;

// Color output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

function log(msg, color = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================
// MESSAGE PROCESSOR SIMULATOR
// ================================

class MessageProcessor {
  constructor(db, guildId) {
    this.db = db;
    this.guildId = guildId;
    this.whitelistedChannels = [];
    this.bannedWords = [];
    this.stats = {
      processed: 0,
      filtered_whitelist: 0,
      filtered_automod: 0,
      counted: 0,
      errors: 0,
      totalTime: 0
    };
  }

  async loadFilters() {
    // Load whitelisted channels
    const whitelist = await dbAll(this.db,
      "SELECT channel_id FROM channel_whitelist WHERE guild_id = ?",
      [this.guildId]
    );
    this.whitelistedChannels = whitelist.map(row => row.channel_id);

    // Load banned words
    const banned = await dbAll(this.db,
      "SELECT word, case_sensitive FROM banned_words WHERE guild_id = ?",
      [this.guildId]
    );
    this.bannedWords = banned.map(row => ({
      word: row.word,
      pattern: row.case_sensitive 
        ? new RegExp(`\\b${row.word}\\b`, 'g')
        : new RegExp(`\\b${row.word}\\b`, 'gi')
    }));
  }

  async processMessage(channelId, userId, content) {
    const start = performance.now();
    this.stats.processed++;

    try {
      // Check 1: Whitelist filter
      if (this.whitelistedChannels.length > 0 && !this.whitelistedChannels.includes(channelId)) {
        this.stats.filtered_whitelist++;
        this.stats.totalTime += performance.now() - start;
        return { filtered: true, reason: "whitelist" };
      }

      // Check 2: AutoMod filter
      for (const { word, pattern } of this.bannedWords) {
        if (pattern.test(content)) {
          this.stats.filtered_automod++;
          this.stats.totalTime += performance.now() - start;
          return { filtered: true, reason: "automod", word };
        }
      }

      // Count message
      await dbRun(this.db,
        `INSERT INTO user_stats (guild_id, user_id, message_count) 
         VALUES (?, ?, 1) 
         ON CONFLICT(guild_id, user_id) 
         DO UPDATE SET 
           message_count = message_count + 1`,
        [this.guildId, userId]
      );

      this.stats.counted++;
      this.stats.totalTime += performance.now() - start;
      return { filtered: false };

    } catch (error) {
      this.stats.errors++;
      this.stats.totalTime += performance.now() - start;
      return { error: error.message };
    }
  }

  getStats() {
    return {
      ...this.stats,
      avgProcessingTime: this.stats.processed > 0 ? this.stats.totalTime / this.stats.processed : 0
    };
  }
}

// ================================
// TEST SCENARIOS
// ================================

async function setupTestData(db, guildId) {
  log("\n🔧 Setting up test environment...", "cyan");

  // Create 20 whitelisted channels
  const whitelistPromises = Array.from({ length: 20 }, (_, i) => 
    dbRun(db,
      "INSERT OR IGNORE INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)",
      [guildId, `channel_${i}`]
    )
  );
  await Promise.all(whitelistPromises);
  log("  ✓ Created 20 whitelisted channels", "green");

  // Create 50 banned words
  const bannedWordsPromises = Array.from({ length: 50 }, (_, i) => 
    dbRun(db,
      "INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, ?)",
      [guildId, `banned${i}`, i % 3 === 0 ? 1 : 0]
    )
  );
  await Promise.all(bannedWordsPromises);
  log("  ✓ Created 50 banned words", "green");
}

async function cleanup(db, guildId) {
  log("\n🧹 Cleaning up test data...", "cyan");
  await dbRun(db, "DELETE FROM channel_whitelist WHERE guild_id = ?", [guildId]);
  await dbRun(db, "DELETE FROM banned_words WHERE guild_id = ?", [guildId]);
  await dbRun(db, "DELETE FROM user_stats WHERE guild_id = ?", [guildId]);
  await dbRun(db, "DELETE FROM operation_history WHERE guild_id = ?", [guildId]);
  log("  ✓ Cleanup complete", "green");
}

function generateMessage() {
  const templates = [
    "Hello everyone! How are you doing today?",
    "This is a normal message",
    "Just chatting with friends",
    "What a great day!",
    "Love this server",
    "Anyone want to play?",
    "Good morning!",
    "Thanks for the help",
    "See you later",
    "Have a nice day"
  ];

  // 5% chance of banned word
  if (Math.random() < 0.05) {
    const bannedIdx = Math.floor(Math.random() * 50);
    return `This message contains banned${bannedIdx} content`;
  }

  return templates[Math.floor(Math.random() * templates.length)];
}

async function runLoadTest(db, guildId, messagesPerSecond, durationSeconds) {
  log(`\n🚀 Starting load test...`, "cyan");
  log(`  Messages/second: ${messagesPerSecond}`, "blue");
  log(`  Duration: ${durationSeconds}s`, "blue");
  log(`  Total messages: ${messagesPerSecond * durationSeconds}`, "blue");

  const processor = new MessageProcessor(db, guildId);
  await processor.loadFilters();

  const startTime = performance.now();
  const targetMessages = messagesPerSecond * durationSeconds;
  const intervalMs = 1000 / messagesPerSecond;

  let messagesSent = 0;
  const channels = Array.from({ length: 30 }, (_, i) => `channel_${i}`); // 20 whitelisted + 10 non-whitelisted
  const users = Array.from({ length: 100 }, (_, i) => `user_${i}`);

  log(`\n⏳ Processing messages...`, "yellow");

  // Simulate message burst
  const promises = [];
  for (let i = 0; i < targetMessages; i++) {
    const channelId = channels[Math.floor(Math.random() * channels.length)];
    const userId = users[Math.floor(Math.random() * users.length)];
    const content = generateMessage();

    promises.push(processor.processMessage(channelId, userId, content));
    messagesSent++;

    // Log progress every second
    if (messagesSent % messagesPerSecond === 0) {
      const elapsed = (performance.now() - startTime) / 1000;
      process.stdout.write(`\r  Progress: ${messagesSent}/${targetMessages} messages (${elapsed.toFixed(1)}s)`);
    }

    // Throttle to achieve target rate
    if (i > 0 && i % messagesPerSecond === 0) {
      await sleep(100); // Small delay to prevent overwhelming
    }
  }

  // Wait for all to complete
  await Promise.all(promises);

  const totalTime = performance.now() - startTime;
  const stats = processor.getStats();

  // Results
  log("\n\n" + "=".repeat(60), "cyan");
  log("  LOAD TEST RESULTS", "cyan");
  log("=".repeat(60), "cyan");

  log(`\n📊 Processing Stats:`, "blue");
  log(`  Total messages: ${stats.processed}`, "white");
  log(`  Successfully counted: ${stats.counted} (${(stats.counted / stats.processed * 100).toFixed(1)}%)`, "green");
  log(`  Filtered by whitelist: ${stats.filtered_whitelist} (${(stats.filtered_whitelist / stats.processed * 100).toFixed(1)}%)`, "yellow");
  log(`  Filtered by AutoMod: ${stats.filtered_automod} (${(stats.filtered_automod / stats.processed * 100).toFixed(1)}%)`, "yellow");
  log(`  Errors: ${stats.errors}`, stats.errors > 0 ? "red" : "green");

  log(`\n⚡ Performance:`, "blue");
  log(`  Total time: ${(totalTime / 1000).toFixed(2)}s`, "white");
  log(`  Avg processing time: ${stats.avgProcessingTime.toFixed(2)}ms/message`, "white");
  log(`  Actual throughput: ${(stats.processed / (totalTime / 1000)).toFixed(2)} messages/second`, "white");
  log(`  Target throughput: ${messagesPerSecond} messages/second`, "white");

  // Check performance thresholds
  log(`\n✅ Performance Checks:`, "blue");
  
  const avgOk = stats.avgProcessingTime < 50; // Realistic for DB writes
  log(`  Avg < 50ms: ${avgOk ? "PASS" : "FAIL"} (${stats.avgProcessingTime.toFixed(2)}ms)`, avgOk ? "green" : "red");

  const throughputOk = (stats.processed / (totalTime / 1000)) >= messagesPerSecond * 0.9; // Allow 10% variance
  log(`  Throughput >= 90% target: ${throughputOk ? "PASS" : "FAIL"}`, throughputOk ? "green" : "red");

  const errorOk = stats.errors === 0;
  log(`  Zero errors: ${errorOk ? "PASS" : "FAIL"}`, errorOk ? "green" : "red");

  log("\n" + "=".repeat(60) + "\n", "cyan");

  return avgOk && throughputOk && errorOk;
}

// ================================
// RACE CONDITION TEST
// ================================

async function testRaceConditions(db, guildId) {
  log("\n🏁 Testing for Race Conditions...", "cyan");

  const userId = "race_test_user";
  const channelId = "channel_0"; // Whitelisted channel
  
  // Simulate 100 concurrent message increments for same user
  const promises = Array.from({ length: 100 }, () => 
    dbRun(db,
      `INSERT INTO user_stats (guild_id, user_id, message_count) 
       VALUES (?, ?, 1) 
       ON CONFLICT(guild_id, user_id) 
       DO UPDATE SET 
         message_count = message_count + 1`,
      [guildId, userId]
    )
  );

  await Promise.all(promises);

  // Verify count
  const result = await dbAll(db,
    "SELECT message_count FROM user_stats WHERE guild_id = ? AND user_id = ?",
    [guildId, userId]
  );

  const actualCount = result[0].message_count;
  const expected = 100;
  const isCorrect = actualCount === expected;

  log(`  Expected count: ${expected}`, "white");
  log(`  Actual count: ${actualCount}`, isCorrect ? "green" : "red");
  log(`  Result: ${isCorrect ? "PASS - No race conditions detected" : "FAIL - Race condition detected!"}`, isCorrect ? "green" : "red");

  return isCorrect;
}

// ================================
// MAIN
// ================================

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  
  // Enable WAL mode
  await new Promise((resolve, reject) => {
    db.run("PRAGMA journal_mode = WAL", (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  log("\n" + "=".repeat(60), "magenta");
  log("  MESSAGE PROCESSING LOAD TEST", "magenta");
  log("=".repeat(60) + "\n", "magenta");

  try {
    // Setup
    await setupTestData(db, TEST_GUILD_ID);

    // Run load test
    const loadTestPassed = await runLoadTest(db, TEST_GUILD_ID, MESSAGES_PER_SECOND, TEST_DURATION_SECONDS);

    // Race condition test
    const raceTestPassed = await testRaceConditions(db, TEST_GUILD_ID);

    // Cleanup
    await cleanup(db, TEST_GUILD_ID);

    // Final verdict
    const allPassed = loadTestPassed && raceTestPassed;
    log(`\n🎯 Final Result: ${allPassed ? "ALL TESTS PASSED ✅" : "SOME TESTS FAILED ❌"}`, allPassed ? "green" : "red");

    db.close();
    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    log(`\n❌ Fatal error: ${error.message}`, "red");
    console.error(error);
    await cleanup(db, TEST_GUILD_ID);
    db.close();
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
