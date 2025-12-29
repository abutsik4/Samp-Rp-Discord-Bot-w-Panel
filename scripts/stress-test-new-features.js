#!/usr/bin/env node

/**
 * Stress Test for New Features
 * Tests: Channel Whitelist, AutoMod, Operation History
 * 
 * Usage: node scripts/stress-test-new-features.js
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { performance } = require("perf_hooks");

const DB_PATH = path.join(__dirname, "../data/stats.db");
const TEST_GUILD_ID = "test_guild_stress_" + Date.now();

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

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
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
// TEST SUITE
// ================================

class StressTest {
  constructor(db) {
    this.db = db;
    this.results = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async assert(condition, testName) {
    if (condition) {
      this.results.passed++;
      log(`✓ ${testName}`, "green");
    } else {
      this.results.failed++;
      this.results.errors.push(testName);
      log(`✗ ${testName}`, "red");
    }
  }

  async cleanup() {
    log("\n🧹 Cleaning up test data...", "cyan");
    await dbRun(this.db, "DELETE FROM channel_whitelist WHERE guild_id = ?", [TEST_GUILD_ID]);
    await dbRun(this.db, "DELETE FROM banned_words WHERE guild_id = ?", [TEST_GUILD_ID]);
    await dbRun(this.db, "DELETE FROM operation_history WHERE guild_id = ?", [TEST_GUILD_ID]);
    await dbRun(this.db, "DELETE FROM user_stats WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  // ================================
  // CHANNEL WHITELIST TESTS
  // ================================

  async testWhitelistBasicOperations() {
    log("\n📋 Testing Channel Whitelist - Basic Operations", "blue");

    // Test 1: Insert channel
    const start1 = performance.now();
    await dbRun(this.db, 
      "INSERT OR IGNORE INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)",
      [TEST_GUILD_ID, "channel_001"]
    );
    const time1 = performance.now() - start1;
    await this.assert(time1 < 10, `Insert channel (${time1.toFixed(2)}ms < 10ms)`);

    // Test 2: Verify inserted
    const row = await dbGet(this.db,
      "SELECT * FROM channel_whitelist WHERE guild_id = ? AND channel_id = ?",
      [TEST_GUILD_ID, "channel_001"]
    );
    await this.assert(row !== undefined, "Channel exists in whitelist");

    // Test 3: Duplicate insert (should be ignored)
    const result = await dbRun(this.db,
      "INSERT OR IGNORE INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)",
      [TEST_GUILD_ID, "channel_001"]
    );
    await this.assert(result.changes === 0, "Duplicate insert ignored");

    // Test 4: Delete channel
    await dbRun(this.db,
      "DELETE FROM channel_whitelist WHERE guild_id = ? AND channel_id = ?",
      [TEST_GUILD_ID, "channel_001"]
    );
    const deleted = await dbGet(this.db,
      "SELECT * FROM channel_whitelist WHERE guild_id = ? AND channel_id = ?",
      [TEST_GUILD_ID, "channel_001"]
    );
    await this.assert(deleted === undefined, "Channel deleted successfully");
  }

  async testWhitelistConcurrency() {
    log("\n📋 Testing Channel Whitelist - Concurrent Operations", "blue");

    const channelIds = Array.from({ length: 100 }, (_, i) => `channel_${i.toString().padStart(3, '0')}`);
    
    // Test 1: Concurrent inserts
    const start = performance.now();
    const promises = channelIds.map(channelId =>
      dbRun(this.db,
        "INSERT OR IGNORE INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)",
        [TEST_GUILD_ID, channelId]
      )
    );
    await Promise.all(promises);
    const insertTime = performance.now() - start;
    
    await this.assert(insertTime < 1000, `100 concurrent inserts (${insertTime.toFixed(2)}ms < 1000ms)`);

    // Test 2: Verify all inserted
    const rows = await dbAll(this.db,
      "SELECT COUNT(*) as count FROM channel_whitelist WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );
    await this.assert(rows[0].count === 100, `All 100 channels inserted (got ${rows[0].count})`);

    // Test 3: Concurrent reads
    const readStart = performance.now();
    const readPromises = Array.from({ length: 50 }, () =>
      dbAll(this.db,
        "SELECT * FROM channel_whitelist WHERE guild_id = ?",
        [TEST_GUILD_ID]
      )
    );
    await Promise.all(readPromises);
    const readTime = performance.now() - readStart;
    
    await this.assert(readTime < 500, `50 concurrent reads (${readTime.toFixed(2)}ms < 500ms)`);

    // Cleanup
    await dbRun(this.db, "DELETE FROM channel_whitelist WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  async testWhitelistPerformance() {
    log("\n📋 Testing Channel Whitelist - Performance", "blue");

    // Test 1: Large whitelist (1000 channels)
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      await dbRun(this.db,
        "INSERT OR IGNORE INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)",
        [TEST_GUILD_ID, `channel_${i}`]
      );
    }
    const insertTime = performance.now() - start;
    
    await this.assert(insertTime < 5000, `1000 sequential inserts (${insertTime.toFixed(2)}ms < 5000ms)`);

    // Test 2: Query from large whitelist
    const queryStart = performance.now();
    const rows = await dbAll(this.db,
      "SELECT * FROM channel_whitelist WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );
    const queryTime = performance.now() - queryStart;
    
    await this.assert(queryTime < 50, `Query 1000 channels (${queryTime.toFixed(2)}ms < 50ms)`);
    await this.assert(rows.length === 1000, `Retrieved all 1000 channels (got ${rows.length})`);

    // Cleanup
    await dbRun(this.db, "DELETE FROM channel_whitelist WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  // ================================
  // AUTOMOD TESTS
  // ================================

  async testAutoModBasicOperations() {
    log("\n🛡️ Testing AutoMod - Basic Operations", "blue");

    // Test 1: Insert banned word
    const start1 = performance.now();
    await dbRun(this.db,
      "INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, ?)",
      [TEST_GUILD_ID, "badword", 0]
    );
    const time1 = performance.now() - start1;
    await this.assert(time1 < 10, `Insert banned word (${time1.toFixed(2)}ms < 10ms)`);

    // Test 2: Verify inserted
    const row = await dbGet(this.db,
      "SELECT * FROM banned_words WHERE guild_id = ? AND word = ?",
      [TEST_GUILD_ID, "badword"]
    );
    await this.assert(row !== undefined, "Banned word exists");
    await this.assert(row.case_sensitive === 0, "Case sensitivity flag correct");

    // Test 3: Update to case sensitive
    await dbRun(this.db,
      "INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, ?)",
      [TEST_GUILD_ID, "badword", 1]
    );
    const updated = await dbGet(this.db,
      "SELECT * FROM banned_words WHERE guild_id = ? AND word = ?",
      [TEST_GUILD_ID, "badword"]
    );
    await this.assert(updated.case_sensitive === 1, "Case sensitivity updated");

    // Test 4: Delete word
    await dbRun(this.db,
      "DELETE FROM banned_words WHERE guild_id = ? AND word = ?",
      [TEST_GUILD_ID, "badword"]
    );
    const deleted = await dbGet(this.db,
      "SELECT * FROM banned_words WHERE guild_id = ? AND word = ?",
      [TEST_GUILD_ID, "badword"]
    );
    await this.assert(deleted === undefined, "Banned word deleted");
  }

  async testAutoModConcurrency() {
    log("\n🛡️ Testing AutoMod - Concurrent Operations", "blue");

    const words = Array.from({ length: 100 }, (_, i) => `badword${i}`);
    
    // Test 1: Concurrent inserts
    const start = performance.now();
    const promises = words.map(word =>
      dbRun(this.db,
        "INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, ?)",
        [TEST_GUILD_ID, word, Math.random() > 0.5 ? 1 : 0]
      )
    );
    await Promise.all(promises);
    const insertTime = performance.now() - start;
    
    await this.assert(insertTime < 1000, `100 concurrent inserts (${insertTime.toFixed(2)}ms < 1000ms)`);

    // Test 2: Verify all inserted
    const rows = await dbAll(this.db,
      "SELECT COUNT(*) as count FROM banned_words WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );
    await this.assert(rows[0].count === 100, `All 100 words inserted (got ${rows[0].count})`);

    // Test 3: Pattern matching test (simulate message check)
    const testMessage = "This message contains badword42 and should be detected";
    const bannedWords = await dbAll(this.db,
      "SELECT word, case_sensitive FROM banned_words WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );
    
    const matchStart = performance.now();
    let matched = false;
    for (const { word, case_sensitive } of bannedWords) {
      const pattern = case_sensitive 
        ? new RegExp(`\\b${word}\\b`, 'g')
        : new RegExp(`\\b${word}\\b`, 'gi');
      if (pattern.test(testMessage)) {
        matched = true;
        break;
      }
    }
    const matchTime = performance.now() - matchStart;
    
    await this.assert(matched, "Pattern matching detected banned word");
    await this.assert(matchTime < 10, `Pattern matching 100 words (${matchTime.toFixed(2)}ms < 10ms)`);

    // Cleanup
    await dbRun(this.db, "DELETE FROM banned_words WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  async testAutoModPerformance() {
    log("\n🛡️ Testing AutoMod - Performance with Large List", "blue");

    // Test 1: Large banned words list (1000 words)
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      await dbRun(this.db,
        "INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, ?)",
        [TEST_GUILD_ID, `badword${i}`, i % 2]
      );
    }
    const insertTime = performance.now() - start;
    
    await this.assert(insertTime < 5000, `1000 sequential inserts (${insertTime.toFixed(2)}ms < 5000ms)`);

    // Test 2: Pattern matching performance with large list
    const testMessage = "This is a clean message that contains badword500 somewhere in it";
    const bannedWords = await dbAll(this.db,
      "SELECT word, case_sensitive FROM banned_words WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );
    
    const matchStart = performance.now();
    let matched = false;
    for (const { word, case_sensitive } of bannedWords) {
      const pattern = case_sensitive 
        ? new RegExp(`\\b${word}\\b`, 'g')
        : new RegExp(`\\b${word}\\b`, 'gi');
      if (pattern.test(testMessage)) {
        matched = true;
        break;
      }
    }
    const matchTime = performance.now() - matchStart;
    
    await this.assert(matched, "Detected banned word in large list");
    await this.assert(matchTime < 50, `Pattern matching 1000 words (${matchTime.toFixed(2)}ms < 50ms)`);

    // Test 3: Query performance
    const queryStart = performance.now();
    const rows = await dbAll(this.db,
      "SELECT * FROM banned_words WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );
    const queryTime = performance.now() - queryStart;
    
    await this.assert(queryTime < 50, `Query 1000 words (${queryTime.toFixed(2)}ms < 50ms)`);

    // Cleanup
    await dbRun(this.db, "DELETE FROM banned_words WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  // ================================
  // OPERATION HISTORY TESTS
  // ================================

  async testOperationHistoryBasic() {
    log("\n📜 Testing Operation History - Basic Operations", "blue");

    // Test 1: Record operation
    const before = { user_id: "user1", message_count: 100 };
    const after = { user_id: "user1", message_count: 0 };
    
    const start = performance.now();
    const result = await dbRun(this.db,
      `INSERT INTO operation_history (guild_id, actor_id, operation, scope, target_id, payload_before, payload_after, timestamp) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [TEST_GUILD_ID, "admin1", "reset_user", "user", "user1", JSON.stringify(before), JSON.stringify(after), Math.floor(Date.now() / 1000)]
    );
    const time = performance.now() - start;
    
    await this.assert(time < 10, `Record operation (${time.toFixed(2)}ms < 10ms)`);
    await this.assert(result.lastID > 0, "Operation recorded with ID");

    // Test 2: Retrieve operation
    const row = await dbGet(this.db,
      "SELECT * FROM operation_history WHERE id = ?",
      [result.lastID]
    );
    await this.assert(row !== undefined, "Operation retrieved");
    await this.assert(row.operation === "reset_user", "Operation type correct");
    await this.assert(row.undone === 0, "Operation not undone");

    // Test 3: Mark as undone
    await dbRun(this.db,
      "UPDATE operation_history SET undone = 1 WHERE id = ?",
      [result.lastID]
    );
    const updated = await dbGet(this.db,
      "SELECT * FROM operation_history WHERE id = ?",
      [result.lastID]
    );
    await this.assert(updated.undone === 1, "Operation marked as undone");

    // Cleanup
    await dbRun(this.db, "DELETE FROM operation_history WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  async testOperationHistoryConcurrency() {
    log("\n📜 Testing Operation History - Concurrent Operations", "blue");

    // Test 1: Record 100 operations concurrently
    const start = performance.now();
    const promises = Array.from({ length: 100 }, (_, i) => {
      const before = { user_id: `user${i}`, message_count: i * 10 };
      const after = { user_id: `user${i}`, message_count: 0 };
      return dbRun(this.db,
        `INSERT INTO operation_history (guild_id, actor_id, operation, scope, target_id, payload_before, payload_after, timestamp) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [TEST_GUILD_ID, "admin1", "reset_user", "user", `user${i}`, JSON.stringify(before), JSON.stringify(after), Math.floor(Date.now() / 1000)]
      );
    });
    await Promise.all(promises);
    const insertTime = performance.now() - start;
    
    await this.assert(insertTime < 1000, `100 concurrent operations (${insertTime.toFixed(2)}ms < 1000ms)`);

    // Test 2: Verify all recorded
    const rows = await dbAll(this.db,
      "SELECT COUNT(*) as count FROM operation_history WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );
    await this.assert(rows[0].count === 100, `All 100 operations recorded (got ${rows[0].count})`);

    // Test 3: Query with ORDER BY
    const queryStart = performance.now();
    const ordered = await dbAll(this.db,
      "SELECT * FROM operation_history WHERE guild_id = ? ORDER BY timestamp DESC LIMIT 50",
      [TEST_GUILD_ID]
    );
    const queryTime = performance.now() - queryStart;
    
    await this.assert(queryTime < 50, `Query 50 operations (${queryTime.toFixed(2)}ms < 50ms)`);
    await this.assert(ordered.length === 50, "Retrieved 50 operations");

    // Cleanup
    await dbRun(this.db, "DELETE FROM operation_history WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  async testOperationHistoryUndo() {
    log("\n📜 Testing Operation History - Undo Functionality", "blue");

    // Test 1: Create user stats
    await dbRun(this.db,
      "INSERT INTO user_stats (guild_id, user_id, message_count) VALUES (?, ?, ?)",
      [TEST_GUILD_ID, "user_test", 500]
    );

    // Test 2: Record reset operation
    const before = { user_id: "user_test", message_count: 500 };
    const after = { user_id: "user_test", message_count: 0 };
    
    const opResult = await dbRun(this.db,
      `INSERT INTO operation_history (guild_id, actor_id, operation, scope, target_id, payload_before, payload_after, timestamp) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [TEST_GUILD_ID, "admin1", "reset_user", "user", "user_test", JSON.stringify(before), JSON.stringify(after), Math.floor(Date.now() / 1000)]
    );

    // Test 3: Reset the user stats
    await dbRun(this.db,
      "UPDATE user_stats SET message_count = 0 WHERE guild_id = ? AND user_id = ?",
      [TEST_GUILD_ID, "user_test"]
    );

    const resetted = await dbGet(this.db,
      "SELECT * FROM user_stats WHERE guild_id = ? AND user_id = ?",
      [TEST_GUILD_ID, "user_test"]
    );
    await this.assert(resetted.message_count === 0, "User stats reset to 0");

    // Test 4: Undo operation (restore from before payload)
    const operation = await dbGet(this.db,
      "SELECT * FROM operation_history WHERE id = ?",
      [opResult.lastID]
    );
    
    const beforePayload = JSON.parse(operation.payload_before);
    await dbRun(this.db,
      "UPDATE user_stats SET message_count = ? WHERE guild_id = ? AND user_id = ?",
      [beforePayload.message_count, TEST_GUILD_ID, beforePayload.user_id]
    );

    const restored = await dbGet(this.db,
      "SELECT * FROM user_stats WHERE guild_id = ? AND user_id = ?",
      [TEST_GUILD_ID, "user_test"]
    );
    await this.assert(restored.message_count === 500, "User stats restored via undo");

    // Mark operation as undone
    await dbRun(this.db,
      "UPDATE operation_history SET undone = 1 WHERE id = ?",
      [opResult.lastID]
    );

    // Cleanup
    await dbRun(this.db, "DELETE FROM operation_history WHERE guild_id = ?", [TEST_GUILD_ID]);
    await dbRun(this.db, "DELETE FROM user_stats WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  // ================================
  // INTEGRATION TESTS
  // ================================

  async testIntegrationScenario() {
    log("\n🔄 Testing Integration Scenario", "blue");

    // Scenario: User posts message with banned word in non-whitelisted channel
    
    // Step 1: Setup whitelist
    await dbRun(this.db,
      "INSERT OR IGNORE INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)",
      [TEST_GUILD_ID, "allowed_channel"]
    );

    // Step 2: Setup banned words
    await dbRun(this.db,
      "INSERT OR REPLACE INTO banned_words (guild_id, word, case_sensitive) VALUES (?, ?, ?)",
      [TEST_GUILD_ID, "spam", 0]
    );

    // Step 3: Simulate message in non-whitelisted channel
    const whitelistCheck = await dbAll(this.db,
      "SELECT channel_id FROM channel_whitelist WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );
    
    const channelId = "other_channel";
    const isWhitelisted = whitelistCheck.some(row => row.channel_id === channelId);
    
    await this.assert(!isWhitelisted, "Channel correctly identified as non-whitelisted");

    // Step 4: Check for banned words
    const message = "This is spam content";
    const bannedWords = await dbAll(this.db,
      "SELECT word, case_sensitive FROM banned_words WHERE guild_id = ?",
      [TEST_GUILD_ID]
    );

    let containsBannedWord = false;
    for (const { word, case_sensitive } of bannedWords) {
      const pattern = case_sensitive 
        ? new RegExp(`\\b${word}\\b`, 'g')
        : new RegExp(`\\b${word}\\b`, 'gi');
      if (pattern.test(message)) {
        containsBannedWord = true;
        break;
      }
    }

    await this.assert(containsBannedWord, "Banned word correctly detected");

    // Step 5: Message should not be counted (banned word + non-whitelisted)
    await this.assert(!isWhitelisted && containsBannedWord, "Message correctly filtered by both systems");

    // Cleanup
    await dbRun(this.db, "DELETE FROM channel_whitelist WHERE guild_id = ?", [TEST_GUILD_ID]);
    await dbRun(this.db, "DELETE FROM banned_words WHERE guild_id = ?", [TEST_GUILD_ID]);
  }

  async testDatabaseIntegrity() {
    log("\n🔍 Testing Database Integrity", "blue");

    // Test 1: Primary key constraints
    try {
      await dbRun(this.db,
        "INSERT INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)",
        [TEST_GUILD_ID, "dup_channel"]
      );
      await dbRun(this.db,
        "INSERT INTO channel_whitelist (guild_id, channel_id) VALUES (?, ?)",
        [TEST_GUILD_ID, "dup_channel"]
      );
      await this.assert(false, "Duplicate primary key should fail");
    } catch (e) {
      await this.assert(true, "Primary key constraint enforced");
    }

    // Test 2: Foreign key behavior (cascading deletes should be manual)
    await dbRun(this.db,
      "INSERT INTO user_stats (guild_id, user_id, message_count) VALUES (?, ?, ?)",
      [TEST_GUILD_ID, "user1", 100]
    );
    
    const before = { user_id: "user1", message_count: 100 };
    await dbRun(this.db,
      `INSERT INTO operation_history (guild_id, actor_id, operation, scope, target_id, payload_before, payload_after, timestamp) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [TEST_GUILD_ID, "admin", "test", "user", "user1", JSON.stringify(before), JSON.stringify({}), Math.floor(Date.now() / 1000)]
    );

    // Delete user stats
    await dbRun(this.db, "DELETE FROM user_stats WHERE guild_id = ? AND user_id = ?", [TEST_GUILD_ID, "user1"]);

    // Operation history should still exist (no cascade)
    const history = await dbAll(this.db,
      "SELECT * FROM operation_history WHERE guild_id = ? AND target_id = ?",
      [TEST_GUILD_ID, "user1"]
    );
    await this.assert(history.length > 0, "Operation history preserved after user deletion");

    // Cleanup
    await this.cleanup();
  }

  // ================================
  // RUN ALL TESTS
  // ================================

  async runAll() {
    log("\n" + "=".repeat(60), "cyan");
    log("  STRESS TEST - NEW FEATURES", "cyan");
    log("=".repeat(60) + "\n", "cyan");

    const start = performance.now();

    try {
      // Whitelist tests
      await this.testWhitelistBasicOperations();
      await this.testWhitelistConcurrency();
      await this.testWhitelistPerformance();

      // AutoMod tests
      await this.testAutoModBasicOperations();
      await this.testAutoModConcurrency();
      await this.testAutoModPerformance();

      // Operation History tests
      await this.testOperationHistoryBasic();
      await this.testOperationHistoryConcurrency();
      await this.testOperationHistoryUndo();

      // Integration tests
      await this.testIntegrationScenario();
      await this.testDatabaseIntegrity();

    } catch (error) {
      log(`\n❌ Fatal error: ${error.message}`, "red");
      console.error(error);
      this.results.failed++;
      this.results.errors.push(`Fatal: ${error.message}`);
    }

    const totalTime = performance.now() - start;

    // Final cleanup
    await this.cleanup();

    // Results
    log("\n" + "=".repeat(60), "cyan");
    log("  TEST RESULTS", "cyan");
    log("=".repeat(60), "cyan");
    log(`\n✓ Passed: ${this.results.passed}`, "green");
    log(`✗ Failed: ${this.results.failed}`, this.results.failed > 0 ? "red" : "green");
    log(`⏱️  Total Time: ${totalTime.toFixed(2)}ms`, "blue");

    if (this.results.errors.length > 0) {
      log("\n❌ Failed Tests:", "red");
      this.results.errors.forEach(err => log(`  - ${err}`, "red"));
    }

    log("\n" + "=".repeat(60) + "\n", "cyan");

    return this.results.failed === 0;
  }
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

  const test = new StressTest(db);
  const success = await test.runAll();

  db.close();

  process.exit(success ? 0 : 1);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
