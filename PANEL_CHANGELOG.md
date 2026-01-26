# Panel + Message Counting Changes (local)

This document summarizes the modifications made in this workspace to support robust message counting observability and the new Stats-page management controls (including channel-centric edits + recount mode **C**).

## Backend (message counting + traceability)

### Structured logging + trace IDs
- Added structured logger utilities and trace IDs for the message counting pipeline.
- Counting operations now emit consistent, searchable logs and attach a `traceId` through retries / error-queue replay.

### Trace APIs
- Added trace endpoints for operational debugging:
  - `GET /panel/api/accuracy/trace/message?guildId=...&messageId=...`
  - `GET /panel/api/accuracy/trace/user?guildId=...&userId=...`
- Added a CLI helper script to query traces directly from the SQLite DB.

### Error queue schema enrichment
- Extended `message_count_errors` to include `channel_id` and `message_created_at` so replays can correctly update channel/day aggregates.
- Error queue replay is more resilient (best-effort metadata lookup rather than hard-failing when tables/rows are missing).

## Backend (manual controls + channel-centric edits)

### New table: per-channel per-user adjustments
- Added `channel_user_adjustments`:
  - `(guild_id, channel_id, user_id)` primary key
  - persistent `adjustment` value
  - audit fields: `updated_by`, `reason`, `updated_at`
- Reconciliation now incorporates **summed channel adjustments** into expected totals.

### New Stats APIs (channel-centric)
- `GET /panel/api/:botKey/stats/channels?guildId=...`
  - Returns channels ordered by activity using `daily_channel_stats`, plus summed channel adjustments.
- `GET /panel/api/:botKey/stats/channel-users?guildId=...&channelId=...&limit=...&offset=...&search=...&sortBy=...`
  - Returns per-user base counts for the channel + per-user channel adjustments + effective counts.
- `POST /panel/api/:botKey/stats/channel-adjust`
  - Applies a channel-level adjustment via `delta` or sets effective count via `setTo`.
  - Updates `user_stats` immediately to keep the leaderboard consistent.

### Recount mode C (DB recalc + Discord backfill)
- `POST /panel/api/:botKey/stats/recalculate`
  - Rebuilds `daily_channel_stats` from `message_index` and rebuilds `user_stats` from `message_index + user_adjustments + channel_user_adjustments`.
- `POST /panel/api/:botKey/stats/backfill-channel`
  - Scans Discord history for a single channel (rate-limited) and inserts via `incrementMessageCountRobust`.

## Website debug + logging

### Request tracing (panel + APIs)
- Added per-request `X-Trace-Id` response header and structured request/response logs (duration, status, user).
- Static assets are logged at `debug` level to reduce noise.

### Debug overlay report pipeline
- Ctrl+Alt+D debug overlay can now submit a report to the server:
  - `POST /panel/api/debug/report`
- Reports are stored in `panel_debug_reports`.

### Debug Reports viewer
- Added a UI page to browse and inspect submitted reports:
  - `/panel/bot/:botKey/debug-reports`
- Added viewer APIs:
  - `GET /panel/api/debug/reports`
  - `GET /panel/api/debug/reports/:id`

## Panel UI

### Stats page: channel-centric management
- The Stats page now includes a channel-centric control panel:
  - Load channels (drop-down)
  - Load per-channel users table (base / adj / effective)
  - Apply adjustments per user for the selected channel
  - Run recount actions:
    - **Recalculate (DB)**
    - **Backfill Channel (Discord)**

### Messages page: edit existing Discord messages
- Added a quick tool to load + edit an already-sent bot message by `channelId` + Discord `messageId`.
- New APIs:
  - `GET /panel/api/:botKey/discord-message?channelId=...&messageId=...`
  - `POST /panel/api/:botKey/discord-message/edit`

## Theme / Color scheme

### New palette applied globally
Mapped the panel design tokens to the requested palette:
- midnight-violet `#160f29ff`
- stormy-teal `#246a73ff`
- dark-cyan `#368f8bff`
- champagne-mist `#f3dfc1ff`
- desert-sand `#ddbea8ff`

Updated remaining pages that had hard-coded old purple/cyan rgba values to use `var(--accent-*)` + `color-mix()` so the palette stays consistent.

### Icons
- Updated the landing icon gradient in `public/icons/panel.svg` to remove the old green stop and match the requested palette.

## Testing
- `npm test` now runs only unit tests (`node --test "src/**/*.test.js"`) and exits cleanly.
- Added `npm run test:integration` (analytics integration script) and `npm run test:all`.

## Files touched

- src/index.js
- src/features/reconciliation.js
- src/features/robust-message-counting.js
- src/features/message-counting-debug.js
- src/utils/logger.js
- src/web/stats-page.js
- src/web/shared-template.js
- public/shared.css
- src/web/accuracy-monitor-page.js
- src/web/messages-page.js
- src/web/whitelist-page.js
- src/web/analytics-page.js
- src/web/ai-engagement-page.js
- src/web/rate-limiter-page.js
- src/web/history-page.js
- scripts/trace-message-counting.js
- README.md

## Notes / operational guidance

- The channel list and channel user breakdown use `daily_channel_stats`. If a guild has not been backfilled historically, you may need to run **Backfill Channel (Discord)** for older channels.
- The DB recalc endpoint rebuilds derived tables from `message_index`; it assumes `message_index.created_at` is ISO-like so the date can be derived via `substr(created_at, 1, 10)`.
