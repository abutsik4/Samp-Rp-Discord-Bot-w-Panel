# SA-MP RP Discord Bot + Panel

> Welcome to Los Santos Ops.
> One bot. One panel. Full control of your SA-MP RP Discord city.

A production Discord bot for SA-MP roleplay communities with a web control panel, analytics, moderation tools, game economy systems, AI engagement, and operations tooling.

## What This Project Is

Think of it like your in-game control room:

- Streets: message activity, leaderboards, XP, badges
- Economy: SA-MP money flow, jobs, races, duels, garages, businesses
- Law: moderation, rate limits, strikes, banned words
- City Hall: admin web panel for live management
- Dispatch: logs, reconciliation, verification, and recovery scripts

## Main Features

- Discord slash-command bot (Russian-first UX)
- React-based admin panel for multi-user management
- SQLite-backed persistence (auto schema init)
- Message counting with verification and reconciliation
- SA-MP gameplay systems (economy, PvP, properties, gangs, events)
- AI engagement and automation controls
- Holiday, countdown, weekly rewards, and giveaway systems
- Operational scripts for backups, restores, audits, and stress tests

## Quick Start

```bash
git clone https://github.com/abutsik4/Samp-Rp-Discord-Bot-w-Panel.git
cd Samp-Rp-Discord-Bot-w-Panel
npm install
npm run build
```

Create `.env` and fill required values:

```env
DISCORD_TOKEN=your_token_here
OWNER_ID=your_discord_user_id
PANEL_PORT=3001
SESSION_SECRET=change_me_to_a_long_random_string
```

Initialize panel users:

```bash
node scripts/init-panel-users.js
```

Run bot + panel:

```bash
node src/index.js
```

Or with PM2:

```bash
pm2 start ecosystem.config.js
```

## Project Layout

```text
src/
  bot/           # Discord runtime, commands, event handlers
  features/      # Game systems, analytics, moderation, AI, etc.
  web/           # Express API + panel integration
  db/            # Schema/init
  utils/         # Shared helpers and logger
panel-ui/        # React panel source
public/panel/    # Built panel assets
scripts/         # Maintenance and ops scripts
data/            # Runtime data and sqlite files
logs/            # Runtime logs
```

## Web Panel

Main capabilities:

- Dashboard and analytics
- Message/announcement management
- Gameplay controls (levels, badges, perks, SA-MP systems)
- Moderation and automation settings
- Verification and operations views
- Panel user management (admin role)

Standalone panel mode:

```bash
node src/panel-only.js
```

## Useful Commands

```bash
npm run build            # Build panel assets
npm test                 # Run tests
npm run docs:commands-channel   # Sync command docs channel content
```

## Deployment Notes

- Recommended runtime: Linux + Node.js 20+
- Process manager: PM2
- Keep `.env` secrets out of git
- Back up `data/` and `backups/` regularly

## GTA SA Vibe, Real Ops Discipline

This repo keeps the RP flavor in user-facing features, but under the hood it is engineered for reliability:

- Idempotent operations where possible
- Reconciliation paths for message/stat consistency
- Debug and verification routes for incident response
- Extensive scripts for backups, restores, and audits

## License

MIT (see `LICENSE`).
