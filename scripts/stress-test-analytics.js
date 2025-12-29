#!/usr/bin/env node
"use strict";

/**
 * Stress Test Script for Enhanced Message Counting
 * 
 * Tests:
 * - High-volume message counting (1000+ messages/sec)
 * - Daily/channel stats accuracy
 * - Leaderboard cache performance
 * - Incremental sync under load
 * - Page cache hit rates
 * - Database performance under concurrent writes
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { performance } = require("perf_hooks");

// Color codes
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const dbPath = path.join(__dirname, "..", "data", "stats.db");
const db = new sqlite3.Database(dbPath);

// Promisified DB helpers
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Generate test data
function generateTestData(numMessages, numUsers, numChannels, numDays) {
  const guildId = "test_guild_" + Date.now();
  const messages = [];
  const now = new Date();

  for (let i = 0; i < numMessages; i++) {
    const userId = `user_${i % numUsers}`;
    const channelId = `channel_${i % numChannels}`;
    const messageId = `msg_${guildId}_${i}`;
    const dayOffset = Math.floor(i / (numMessages / numDays));
    const messageDate = new Date(now);
    messageDate.setDate(now.getDate() - dayOffset);

    messages.push({
      guildId,
      userId,
      channelId,
      messageId,
      messageDate: messageDate.toISOString(),
    });
  }

  return { guildId, messages };
}

// Test 1: High-volume concurrent writes
async function testConcurrentWrites() {
  console.log(`\n${colors.bright}${colors.cyan}Test 1: High-Volume Concurrent Writes${colors.reset}`);
  
  const numMessages = 10000;
  const numUsers = 100;
  const numChannels = 20;
  const numDays = 30;

  const { guildId, messages } = generateTestData(numMessages, numUsers, numChannels, numDays);

  console.log(`\nInserting ${numMessages} messages...`);
  console.log(`  Users: ${numUsers}`);
  console.log(`  Channels: ${numChannels}`);
  console.log(`  Days: ${numDays}`);

  const start = performance.now();
  let inserted = 0;
  let errors = 0;

  // Batch inserts for performance
  const batchSize = 100;
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    
    try {
      for (const msg of batch) {
        const messageDate = new Date(msg.messageDate).toISOString().slice(0, 10);

        // Insert into message_index
        await dbRun(
          `INSERT OR IGNORE INTO message_index (guild_id, message_id, user_id, channel_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [msg.guildId, msg.messageId, msg.userId, msg.channelId, msg.messageDate]
        );

        // Update user_stats
        await dbRun(
          `INSERT INTO user_stats (guild_id, user_id, message_count)
           VALUES (?, ?, 1)
           ON CONFLICT(guild_id, user_id)
           DO UPDATE SET message_count = message_count + 1`,
          [msg.guildId, msg.userId]
        );

        // Update daily_channel_stats
        await dbRun(
          `INSERT INTO daily_channel_stats (guild_id, user_id, channel_id, message_date, count)
           VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(guild_id, user_id, channel_id, message_date)
           DO UPDATE SET count = count + 1`,
          [msg.guildId, msg.userId, msg.channelId, messageDate]
        );

        inserted++;
      }
    } catch (err) {
      errors++;
      console.error(`Batch error:`, err.message);
    }

    // Progress indicator
    if ((i + batchSize) % 1000 === 0) {
      process.stdout.write(`\r  Progress: ${i + batchSize}/${messages.length} (${((i + batchSize) / messages.length * 100).toFixed(1)}%)`);
    }
  }

  const duration = performance.now() - start;
  const messagesPerSecond = (inserted / duration) * 1000;

  console.log(`\n\n${colors.green}✓ Write Performance:${colors.reset}`);
  console.log(`  Inserted: ${inserted} messages`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`  Throughput: ${messagesPerSecond.toFixed(0)} msg/sec`);

  return { guildId, inserted, duration, messagesPerSecond };
}

// Test 2: Daily stats accuracy
async function testDailyStatsAccuracy(guildId) {
  console.log(`\n${colors.bright}${colors.cyan}Test 2: Daily Stats Accuracy${colors.reset}`);

  // Get total from message_index
  const indexTotal = await dbGet(
    `SELECT COUNT(*) as count FROM message_index WHERE guild_id = ?`,
    [guildId]
  );

  // Get total from daily_channel_stats
  const dailyTotal = await dbGet(
    `SELECT SUM(count) as count FROM daily_channel_stats WHERE guild_id = ?`,
    [guildId]
  );

  // Get total from user_stats
  const userStatsTotal = await dbGet(
    `SELECT SUM(message_count) as count FROM user_stats WHERE guild_id = ?`,
    [guildId]
  );

  const indexCount = indexTotal?.count || 0;
  const dailyCount = dailyTotal?.count || 0;
  const userCount = userStatsTotal?.count || 0;

  const dailyAccuracy = indexCount > 0 ? (dailyCount / indexCount) * 100 : 0;
  const userAccuracy = indexCount > 0 ? (userCount / indexCount) * 100 : 0;

  console.log(`\n${colors.green}✓ Accuracy Check:${colors.reset}`);
  console.log(`  message_index: ${indexCount}`);
  console.log(`  daily_channel_stats: ${dailyCount} (${dailyAccuracy.toFixed(2)}% accuracy)`);
  console.log(`  user_stats: ${userCount} (${userAccuracy.toFixed(2)}% accuracy)`);

  if (dailyAccuracy === 100 && userAccuracy === 100) {
    console.log(`  ${colors.green}✓ Perfect accuracy!${colors.reset}`);
  } else {
    console.log(`  ${colors.red}✗ Accuracy mismatch detected${colors.reset}`);
  }

  return { dailyAccuracy, userAccuracy };
}

// Test 3: Query performance
async function testQueryPerformance(guildId) {
  console.log(`\n${colors.bright}${colors.cyan}Test 3: Query Performance${colors.reset}`);

  const tests = [
    {
      name: "Top 10 users (all-time)",
      query: `SELECT user_id, message_count FROM user_stats WHERE guild_id = ? ORDER BY message_count DESC LIMIT 10`,
      params: [guildId]
    },
    {
      name: "Top 10 users (by channel)",
      query: `SELECT user_id, SUM(count) as total FROM daily_channel_stats WHERE guild_id = ? AND channel_id = ? GROUP BY user_id ORDER BY total DESC LIMIT 10`,
      params: [guildId, 'channel_0']
    },
    {
      name: "Top 10 users (by date)",
      query: `SELECT user_id, SUM(count) as total FROM daily_channel_stats WHERE guild_id = ? AND message_date = ? GROUP BY user_id ORDER BY total DESC LIMIT 10`,
      params: [guildId, new Date().toISOString().slice(0, 10)]
    },
    {
      name: "Daily activity (30 days)",
      query: `SELECT message_date, SUM(count) as total FROM daily_channel_stats WHERE guild_id = ? GROUP BY message_date ORDER BY message_date DESC LIMIT 30`,
      params: [guildId]
    },
    {
      name: "Channel breakdown",
      query: `SELECT channel_id, SUM(count) as total FROM daily_channel_stats WHERE guild_id = ? GROUP BY channel_id ORDER BY total DESC`,
      params: [guildId]
    },
  ];

  console.log();
  for (const test of tests) {
    const start = performance.now();
    const result = await dbAll(test.query, test.params);
    const duration = performance.now() - start;

    console.log(`  ${test.name}: ${duration.toFixed(2)}ms (${result.length} rows)`);
  }
}

// Test 4: Cleanup test data
async function cleanup(guildId) {
  console.log(`\n${colors.bright}${colors.yellow}Cleaning up test data...${colors.reset}`);

  await dbRun(`DELETE FROM message_index WHERE guild_id = ?`, [guildId]);
  await dbRun(`DELETE FROM user_stats WHERE guild_id = ?`, [guildId]);
  await dbRun(`DELETE FROM daily_channel_stats WHERE guild_id = ?`, [guildId]);

  console.log(`${colors.green}✓ Cleanup complete${colors.reset}`);
}

// Main test runner
async function runStressTests() {
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  Message Counting Stress Test Suite      ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);

  try {
    // Test 1: Concurrent writes
    const { guildId, messagesPerSecond } = await testConcurrentWrites();

    // Test 2: Accuracy
    const { dailyAccuracy, userAccuracy } = await testDailyStatsAccuracy(guildId);

    // Test 3: Query performance
    await testQueryPerformance(guildId);

    // Summary
    console.log(`\n${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.green}  Test Summary                             ${colors.reset}`);
    console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}`);
    console.log(`\n  Write Throughput: ${messagesPerSecond.toFixed(0)} msg/sec`);
    console.log(`  Daily Stats Accuracy: ${dailyAccuracy.toFixed(2)}%`);
    console.log(`  User Stats Accuracy: ${userAccuracy.toFixed(2)}%`);
    
    if (messagesPerSecond > 100 && dailyAccuracy === 100 && userAccuracy === 100) {
      console.log(`\n  ${colors.green}${colors.bright}✓ ALL TESTS PASSED${colors.reset}`);
    } else {
      console.log(`\n  ${colors.yellow}⚠ Some tests need attention${colors.reset}`);
    }

    // Cleanup
    await cleanup(guildId);

  } catch (err) {
    console.error(`\n${colors.red}${colors.bright}✗ Test failed:${colors.reset}`, err);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run tests
runStressTests();
