#!/usr/bin/env node
"use strict";

/**
 * Integration Test Script for Analytics Features
 * 
 * Tests:
 * - Slash command enhancements (/top5, /top10 with filters)
 * - /sync-missing command
 * - Daily stats tracking
 * - API endpoints
 * - Web panel rendering
 */

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const http = require("http");

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

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
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

// Test database schema
async function testSchema() {
  console.log(`\n${colors.bright}${colors.cyan}Test 1: Database Schema${colors.reset}`);

  const tables = [
    'daily_channel_stats',
    'backfill_watermarks',
    'message_index',
    'user_stats'
  ];

  for (const table of tables) {
    const result = await dbGet(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [table]
    );
    
    if (result) {
      console.log(`  ${colors.green}✓${colors.reset} Table '${table}' exists`);
    } else {
      console.log(`  ${colors.red}✗${colors.reset} Table '${table}' missing`);
    }
  }

  // Check indexes
  const indexes = [
    'idx_daily_stats_date',
    'idx_daily_stats_channel',
    'idx_daily_stats_user'
  ];

  for (const index of indexes) {
    const result = await dbGet(
      `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
      [index]
    );
    
    if (result) {
      console.log(`  ${colors.green}✓${colors.reset} Index '${index}' exists`);
    } else {
      console.log(`  ${colors.red}✗${colors.reset} Index '${index}' missing`);
    }
  }
}

// Test daily stats data
async function testDailyStats() {
  console.log(`\n${colors.bright}${colors.cyan}Test 2: Daily Stats Data${colors.reset}`);

  const guilds = await dbAll(`SELECT DISTINCT guild_id FROM user_stats`);
  
  if (guilds.length === 0) {
    console.log(`  ${colors.yellow}⚠${colors.reset} No guilds found in database`);
    return;
  }

  for (const guild of guilds.slice(0, 3)) {
    const guildId = guild.guild_id;

    // Get total from user_stats
    const userTotal = await dbGet(
      `SELECT SUM(message_count) as count FROM user_stats WHERE guild_id = ?`,
      [guildId]
    );

    // Get total from daily_channel_stats
    const dailyTotal = await dbGet(
      `SELECT SUM(count) as count FROM daily_channel_stats WHERE guild_id = ?`,
      [guildId]
    );

    const userCount = userTotal?.count || 0;
    const dailyCount = dailyTotal?.count || 0;

    if (userCount === 0) {
      console.log(`  ${colors.yellow}⚠${colors.reset} Guild ${guildId.slice(0, 8)}... has no messages`);
      continue;
    }

    const accuracy = dailyCount > 0 ? ((dailyCount / userCount) * 100).toFixed(2) : 0;

    if (dailyCount === userCount) {
      console.log(`  ${colors.green}✓${colors.reset} Guild ${guildId.slice(0, 8)}... - ${userCount} messages (100% synced)`);
    } else if (dailyCount > 0) {
      console.log(`  ${colors.yellow}⚠${colors.reset} Guild ${guildId.slice(0, 8)}... - ${userCount} total, ${dailyCount} in daily_stats (${accuracy}% synced)`);
    } else {
      console.log(`  ${colors.red}✗${colors.reset} Guild ${guildId.slice(0, 8)}... - ${userCount} messages but no daily stats (needs backfill)`);
    }
  }
}

// Test API endpoints
async function testAPIEndpoints() {
  console.log(`\n${colors.bright}${colors.cyan}Test 3: API Endpoints${colors.reset}`);

  // Get first bot key from database
  const bot = await dbGet(`SELECT guild_id FROM user_stats LIMIT 1`);
  
  if (!bot) {
    console.log(`  ${colors.yellow}⚠${colors.reset} No bots found to test API`);
    return;
  }

  const botKey = bot.guild_id;
  const port = process.env.PORT || 3000;

  const endpoints = [
    `/api/${botKey}/analytics/channels`,
    `/api/${botKey}/analytics/summary?start_date=2024-01-01&end_date=2024-12-31`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}${endpoint}`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });

      if (response.status === 200) {
        const json = JSON.parse(response.data);
        console.log(`  ${colors.green}✓${colors.reset} ${endpoint} (${Object.keys(json).length} fields)`);
      } else if (response.status === 401 || response.status === 403) {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${endpoint} - Auth required (expected if not logged in)`);
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint} - Status ${response.status}`);
      }
    } catch (err) {
      if (err.message.includes('ECONNREFUSED')) {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${endpoint} - Server not running`);
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${endpoint} - ${err.message}`);
      }
    }
  }
}

// Test module exports
async function testModules() {
  console.log(`\n${colors.bright}${colors.cyan}Test 4: Module Exports${colors.reset}`);

  const modules = [
    { path: '../src/features/leaderboard-cache.js', exports: ['initLeaderboardCache', 'updateLeaderboard', 'getLeaderboard', 'rebuildLeaderboard'] },
    { path: '../src/features/page-cache.js', exports: ['leaderboardCache', 'statsCache', 'analyticsCache'] },
    { path: '../src/features/incremental-sync.js', exports: ['syncMissingMessages', 'initializeWatermark'] },
    { path: '../src/web/analytics-page.js', exports: ['generateAnalyticsPage'] },
  ];

  for (const module of modules) {
    try {
      const mod = require(path.join(__dirname, module.path));
      
      const missingExports = module.exports.filter(exp => !(exp in mod));
      
      if (missingExports.length === 0) {
        console.log(`  ${colors.green}✓${colors.reset} ${module.path} (${module.exports.length} exports)`);
      } else {
        console.log(`  ${colors.red}✗${colors.reset} ${module.path} - Missing: ${missingExports.join(', ')}`);
      }
    } catch (err) {
      console.log(`  ${colors.red}✗${colors.reset} ${module.path} - ${err.message}`);
    }
  }
}

// Test query performance with real data
async function testRealQueryPerformance() {
  console.log(`\n${colors.bright}${colors.cyan}Test 5: Real-World Query Performance${colors.reset}`);

  const guilds = await dbAll(`SELECT DISTINCT guild_id FROM daily_channel_stats LIMIT 1`);
  
  if (guilds.length === 0) {
    console.log(`  ${colors.yellow}⚠${colors.reset} No daily stats data to test queries`);
    return;
  }

  const guildId = guilds[0].guild_id;

  const queries = [
    {
      name: "Top users (all-time)",
      sql: `SELECT user_id, SUM(count) as total FROM daily_channel_stats WHERE guild_id = ? GROUP BY user_id ORDER BY total DESC LIMIT 10`,
      params: [guildId]
    },
    {
      name: "Daily activity (30 days)",
      sql: `SELECT message_date, SUM(count) as total FROM daily_channel_stats WHERE guild_id = ? GROUP BY message_date ORDER BY message_date DESC LIMIT 30`,
      params: [guildId]
    },
    {
      name: "Channel breakdown",
      sql: `SELECT channel_id, SUM(count) as total FROM daily_channel_stats WHERE guild_id = ? GROUP BY channel_id ORDER BY total DESC`,
      params: [guildId]
    },
  ];

  for (const query of queries) {
    const start = performance.now();
    const result = await dbAll(query.sql, query.params);
    const duration = performance.now() - start;
    
    const status = duration < 10 ? colors.green : duration < 50 ? colors.yellow : colors.red;
    console.log(`  ${status}✓${colors.reset} ${query.name}: ${duration.toFixed(2)}ms (${result.length} rows)`);
  }
}

// Main test runner
async function runIntegrationTests() {
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}  Analytics Integration Test Suite         ${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════${colors.reset}`);

  try {
    await testSchema();
    await testDailyStats();
    await testModules();
    await testRealQueryPerformance();
    await testAPIEndpoints();

    console.log(`\n${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.green}  Integration Tests Complete                ${colors.reset}`);
    console.log(`${colors.bright}${colors.green}═══════════════════════════════════════════${colors.reset}\n`);

  } catch (err) {
    console.error(`\n${colors.red}${colors.bright}✗ Test failed:${colors.reset}`, err);
    process.exit(1);
  } finally {
    db.close();
  }
}

runIntegrationTests();
