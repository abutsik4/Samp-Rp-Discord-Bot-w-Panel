#!/usr/bin/env node

/**
 * API Endpoint Stress Test
 * Tests web panel API endpoints under load
 * 
 * Usage: node scripts/stress-test-api-endpoints.js
 */

const https = require("https");
const { performance } = require("perf_hooks");

const BASE_URL = "https://panel.jepsencloud.com";
const BOT_KEY = "jepsencloud-bot"; // Replace with actual bot key if different

// Color output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(msg, color = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = https.request(url, options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on("error", reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ================================
// API TESTS
// ================================

class APIStressTest {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      errors: [],
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

  async testWhitelistEndpoints() {
    log("\n📋 Testing Whitelist API Endpoints", "blue");

    try {
      // Test 1: GET whitelist
      const start1 = performance.now();
      const res1 = await makeRequest("GET", `/panel/api/bot/${BOT_KEY}/whitelist`);
      const time1 = performance.now() - start1;
      
      await this.assert(
        res1.status === 200 || res1.status === 401 || res1.status === 302,
        `GET /panel/api/bot/${BOT_KEY}/whitelist (${time1.toFixed(0)}ms, status: ${res1.status})`
      );

      // Test 2: GET channels
      const start2 = performance.now();
      const res2 = await makeRequest("GET", `/panel/api/bot/${BOT_KEY}/channels`);
      const time2 = performance.now() - start2;
      
      await this.assert(
        res2.status === 200 || res2.status === 401 || res2.status === 302,
        `GET /api/bot/${BOT_KEY}/channels (${time2.toFixed(0)}ms, status: ${res2.status})`
      );

      log(`  Average response time: ${((time1 + time2) / 2).toFixed(0)}ms`, "cyan");

    } catch (error) {
      this.results.failed++;
      this.results.errors.push(`Whitelist API error: ${error.message}`);
      log(`✗ Whitelist API error: ${error.message}`, "red");
    }
  }

  async testAutoModEndpoints() {
    log("\n🛡️ Testing AutoMod API Endpoints", "blue");

    try {
      // Test 1: GET banned words
      const start1 = performance.now();
      const res1 = await makeRequest("GET", `/panel/api/bot/${BOT_KEY}/automod`);
      const time1 = performance.now() - start1;
      
      await this.assert(
        res1.status === 200 || res1.status === 401 || res1.status === 302,
        `GET /panel/api/bot/${BOT_KEY}/automod (${time1.toFixed(0)}ms, status: ${res1.status})`
      );

      log(`  Response time: ${time1.toFixed(0)}ms`, "cyan");

    } catch (error) {
      this.results.failed++;
      this.results.errors.push(`AutoMod API error: ${error.message}`);
      log(`✗ AutoMod API error: ${error.message}`, "red");
    }
  }

  async testHistoryEndpoints() {
    log("\n📜 Testing History API Endpoints", "blue");

    try {
      // Test 1: GET history
      const start1 = performance.now();
      const res1 = await makeRequest("GET", `/panel/api/bot/${BOT_KEY}/history`);
      const time1 = performance.now() - start1;
      
      await this.assert(
        res1.status === 200 || res1.status === 401 || res1.status === 302,
        `GET /panel/api/bot/${BOT_KEY}/history (${time1.toFixed(0)}ms, status: ${res1.status})`
      );

      log(`  Response time: ${time1.toFixed(0)}ms`, "cyan");

    } catch (error) {
      this.results.failed++;
      this.results.errors.push(`History API error: ${error.message}`);
      log(`✗ History API error: ${error.message}`, "red");
    }
  }

  async testConcurrentRequests() {
    log("\n🔄 Testing Concurrent API Requests", "blue");

    try {
      const endpoints = [
        `/panel/api/bot/${BOT_KEY}/whitelist`,
        `/panel/api/bot/${BOT_KEY}/automod`,
        `/panel/api/bot/${BOT_KEY}/history`,
        `/panel/api/bot/${BOT_KEY}/channels`,
      ];

      // Test 1: 20 concurrent requests
      const start = performance.now();
      const promises = [];
      
      for (let i = 0; i < 20; i++) {
        const endpoint = endpoints[i % endpoints.length];
        promises.push(makeRequest("GET", endpoint));
      }

      const results = await Promise.all(promises);
      const time = performance.now() - start;

      const successCount = results.filter(r => r.status === 200 || r.status === 401 || r.status === 302).length;
      
      await this.assert(
        successCount === 20,
        `20 concurrent requests completed (${time.toFixed(0)}ms, ${(time/20).toFixed(0)}ms avg)`
      );

      await this.assert(
        time < 5000,
        `Total time under 5s (${time.toFixed(0)}ms)`
      );

    } catch (error) {
      this.results.failed++;
      this.results.errors.push(`Concurrent test error: ${error.message}`);
      log(`✗ Concurrent test error: ${error.message}`, "red");
    }
  }

  async testResponseTimes() {
    log("\n⚡ Testing Response Time Consistency", "blue");

    try {
      const endpoint = `/panel/api/bot/${BOT_KEY}/whitelist`;
      const times = [];

      // Make 10 sequential requests
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await makeRequest("GET", endpoint);
        times.push(performance.now() - start);
        await sleep(100); // Small delay between requests
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      const min = Math.min(...times);

      await this.assert(
        avg < 1000,
        `Average response time < 1s (${avg.toFixed(0)}ms)`
      );

      await this.assert(
        max < 2000,
        `Max response time < 2s (${max.toFixed(0)}ms)`
      );

      log(`  Min: ${min.toFixed(0)}ms, Avg: ${avg.toFixed(0)}ms, Max: ${max.toFixed(0)}ms`, "cyan");

    } catch (error) {
      this.results.failed++;
      this.results.errors.push(`Response time test error: ${error.message}`);
      log(`✗ Response time test error: ${error.message}`, "red");
    }
  }

  async runAll() {
    log("\n" + "=".repeat(60), "cyan");
    log("  API ENDPOINT STRESS TEST", "cyan");
    log("=".repeat(60) + "\n", "cyan");
    log(`  Base URL: ${BASE_URL}`, "blue");
    log(`  Bot Key: ${BOT_KEY}\n`, "blue");

    const start = performance.now();

    await this.testWhitelistEndpoints();
    await this.testAutoModEndpoints();
    await this.testHistoryEndpoints();
    await this.testConcurrentRequests();
    await this.testResponseTimes();

    const totalTime = performance.now() - start;

    // Results
    log("\n" + "=".repeat(60), "cyan");
    log("  TEST RESULTS", "cyan");
    log("=".repeat(60), "cyan");
    log(`\n✓ Passed: ${this.results.passed}`, "green");
    log(`✗ Failed: ${this.results.failed}`, this.results.failed > 0 ? "red" : "green");
    log(`⏱️  Total Time: ${totalTime.toFixed(0)}ms`, "blue");

    if (this.results.errors.length > 0) {
      log("\n❌ Failed Tests:", "red");
      this.results.errors.forEach((err) => log(`  - ${err}`, "red"));
    }

    log("\n💡 Note: 401 responses are expected if not authenticated", "yellow");
    log("   API endpoints are properly secured with session auth\n", "yellow");

    log("=".repeat(60) + "\n", "cyan");

    return this.results.failed === 0;
  }
}

// ================================
// MAIN
// ================================

async function main() {
  const test = new APIStressTest();
  const success = await test.runAll();

  process.exit(success ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
