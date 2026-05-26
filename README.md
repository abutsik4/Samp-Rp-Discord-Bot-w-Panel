# SA-MP RP Discord Bot with Admin Panel

A production Discord bot platform for SA-MP roleplay communities, with a web-based administration panel, analytics, moderation tooling, and game economy systems.

This repository is designed for real operations: reliability, maintainability, and clear ownership of full-stack functionality.

## Project Overview

The platform combines:

- Discord bot runtime (slash commands, events, moderation, gameplay)
- Express API backend for admin operations and data access
- React admin panel for configuration and monitoring
- SQLite persistence with automatic schema initialization
- Operational scripts for backup, restore, verification, and audits

## Core Capabilities

- Real-time message statistics and leaderboard tracking
- Verification and reconciliation of message counting accuracy
- Moderation controls: rate limits, strike handling, banned words
- AI engagement controls and automation utilities
- SA-MP gameplay systems: economy, PvP, businesses, gangs, territories, prestige, casino, crafting, and blackmarket
- Persistent panel user management with role-based access
- Operational diagnostics and troubleshooting routes

## Technical Scope

- Node.js 20+ runtime
- Discord.js bot architecture
- Express-based API layer
- React panel application
- SQLite datastore
- 85+ database tables across bot, panel, and gameplay subsystems

## Quick Start

```bash
git clone https://github.com/abutsik4/Samp-Rp-Discord-Bot-w-Panel.git
cd Samp-Rp-Discord-Bot-w-Panel
npm install
npm run build
```

Create a local .env file:

```env
DISCORD_TOKEN=your_token_here
OWNER_ID=your_discord_user_id
PANEL_PORT=3001
SESSION_SECRET=replace_with_a_long_random_secret
```

Initialize panel users:

```bash
node scripts/init-panel-users.js
```

Run the application:

```bash
node src/index.js
```

Run with PM2 (recommended for production):

```bash
pm2 start ecosystem.config.js
```

## Professional Summary

Built and maintained a full-stack Discord bot platform for SA-MP roleplay communities, including a Node.js/Discord.js bot, Express API backend, React admin panel, and SQLite data layer. Implemented analytics, moderation workflows, game economy systems, and operational verification/reconciliation tooling to support production reliability.

## Delivery Highlights

Delivered an end-to-end community operations platform by owning backend, frontend, and data architecture. Developed user-facing gameplay and moderation features while also implementing reliability-focused engineering controls (verification, reconciliation, and diagnostics). Ensured maintainability through modular feature design, operational scripts, and practical deployment workflows.

## Key Engineering Themes

- Full-stack ownership (bot, API, panel, database)
- Production operations mindset (verification, recovery, diagnostics)
- Feature modularity and maintainable structure
- Practical automation and admin tooling
- Security-minded configuration and access control

## Repository Structure

```text
src/
  bot/              # Discord runtime, command dispatch, event handling
  features/         # Gameplay, analytics, moderation, AI, and support modules
  features/constants/  # Gameplay configuration constants (crafting, prestige, etc.)
  web/              # Express app and API routes
  db/               # Schema and initialization
  utils/            # Shared helpers and logging
  views/            # EJS templates for server-rendered panel pages
panel-ui/           # React admin panel source
public/panel/       # Built frontend assets
scripts/            # Operations and maintenance scripts (32+)
data/               # Runtime data and SQLite files
logs/               # Runtime logs
```

## Admin Panel

The panel supports:

- dashboard and analytics
- message and announcement management
- moderation and automation settings
- gameplay configuration and monitoring
- verification and operational troubleshooting
- panel user administration

Standalone panel mode:

```bash
node src/panel-only.js
```

## Useful Commands

```bash
npm run build
npm test
npm run docs:commands-channel
```

## Deployment Notes

- Recommended host: Linux
- Required runtime: Node.js 20+
- Suggested process manager: PM2
- Keep secrets in local environment variables
- Back up data and backups directories regularly

## License

MIT (see LICENSE).
