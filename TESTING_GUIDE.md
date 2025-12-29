# Quick Test Reference

## Run All Tests
```bash
cd /opt/jepsencloud-bot
chmod +x scripts/stress-test-*.js scripts/load-test-*.js
node scripts/stress-test-new-features.js && \
  node scripts/load-test-message-processing.js 50 20 && \
  node scripts/stress-test-api-endpoints.js
```

## Individual Tests

### 1. Unit Tests (Database & Features)
```bash
node scripts/stress-test-new-features.js
```
- **Duration:** ~3 seconds
- **Tests:** 40 tests
- **Coverage:** Channel whitelist, AutoMod, Operation history, Database integrity

### 2. Load Test (Message Processing)
```bash
# Realistic load: 50 msg/s for 20 seconds
node scripts/load-test-message-processing.js 50 20

# Heavy load: 100 msg/s for 50 seconds  
node scripts/load-test-message-processing.js 100 50

# Custom: <messages_per_second> <duration_seconds>
node scripts/load-test-message-processing.js 20 10
```
- **Tests:** Race conditions, throughput, filtering efficiency
- **Validates:** No database locks, accurate message counting, filter performance

### 3. API Endpoint Test
```bash
node scripts/stress-test-api-endpoints.js
```
- **Duration:** ~2 seconds
- **Tests:** 8 API endpoint tests
- **Coverage:** Whitelist, AutoMod, History APIs, concurrent requests, response times

## Expected Results

### ✅ Success Criteria
- Unit tests: 39-40/40 passed (minor timing variances acceptable)
- Load test: 0 errors, no race conditions, message count = 100
- API test: All endpoints respond < 1s, proper auth redirects (302)

### ⚠️ Warning Signs
- Database errors (should be 0)
- Race condition failures (count ≠ 100)
- Response times > 2 seconds
- Failed authentication checks

### ❌ Critical Failures
- More than 5 unit test failures
- Race condition detected (count ≠ 100)
- API endpoints returning 500 errors
- Database lock timeouts

## Performance Benchmarks

| Metric | Target | Typical |
|--------|--------|---------|
| Single insert | < 10ms | 2-4ms |
| 100 concurrent inserts | < 1000ms | 80-130ms |
| 1000 sequential inserts | < 5000ms | 1500-1700ms |
| Query 1000 records | < 50ms | 4-8ms |
| Pattern match 1000 words | < 50ms | 9-11ms |
| Message processing avg | < 50ms | 20-35ms |
| API response time | < 1000ms | 3-10ms |
| Concurrent API (20 req) | < 5000ms | 400-450ms |

## Troubleshooting

### If tests fail:
```bash
# Check database
sqlite3 /opt/jepsencloud-bot/data/stats.db "PRAGMA integrity_check;"

# Check WAL mode
sqlite3 /opt/jepsencloud-bot/data/stats.db "PRAGMA journal_mode;"

# Restart bot
pm2 restart jepsencloud-panel

# Clear test data (if stuck)
sqlite3 /opt/jepsencloud-bot/data/stats.db "DELETE FROM channel_whitelist WHERE guild_id LIKE '%test%'; DELETE FROM banned_words WHERE guild_id LIKE '%test%'; DELETE FROM user_stats WHERE guild_id LIKE '%test%';"
```

### Check bot status:
```bash
pm2 status
pm2 logs jepsencloud-panel --lines 50
```

## Test Files Location
- `/opt/jepsencloud-bot/scripts/stress-test-new-features.js`
- `/opt/jepsencloud-bot/scripts/load-test-message-processing.js`
- `/opt/jepsencloud-bot/scripts/stress-test-api-endpoints.js`
- `/opt/jepsencloud-bot/STRESS_TEST_RESULTS.md` (detailed results)
