<p align="center">
  <img src="public/icons/logo.svg" width="220" alt="SA-MP RP Discord Bot + Panel" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Discord.js-14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Recharts-2-22C55E?style=for-the-badge&logo=chartdotjs&logoColor=white" alt="Recharts" />
  <img src="https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Язык-Русский-blue?style=for-the-badge" alt="Русский" />
</p>

# SA-MP RP Discord Bot with Management Panel

A production-grade, full-stack Discord bot platform for a Russian SA-MP roleplay community — built from scratch as a solo engineering project. Features real-time message analytics, an ML-based conversational AI, a complete roleplay economy, gamification systems, moderation tooling, and a React 19 single-page admin panel backed by a RESTful Express API.

> **🇷🇺 Весь интерфейс бота на русском языке** — команды, описания, уведомления и эмбеды полностью переведены на русский.

## 🆕 Recent Updates (31 Mar 2026)

- Added new feature modules: `src/features/samp-extended.js` and `src/features/seasonal-events.js`.
- Expanded SA-MP gameplay logic and command flow updates in dispatcher/registration.
- Updated automation and engagement paths: schedulers, perks, reactions, streaks, trivia, and weekly awards.
- Refreshed runtime assets/configuration including Markov model data and PM2 ecosystem settings.

---

## 🔑 Technical Highlights

These are the engineering decisions and challenges that characterise this project:

| Area | Detail |
|------|--------|
| **Full-stack solo build** | End-to-end ownership: Discord bot, REST API (17 route modules), React SPA (13 pages), DB schema (45+ tables), CI scripts, deployment |
| **Real-time event pipeline** | Discord gateway events → security checks (automod, rate-limit) → atomic DB writes → XP/badge/perk side-effects, all within a single message handler |
| **Robust message counting** | Custom reconciliation system that cross-references a `message_index` shadow table against `user_stats` to catch and repair discrepancies caused by deleted messages, bulk deletes, or Discord API gaps |
| **Incremental & full backfill** | Resumable backfill engine with adaptive rate-limiting, thread support, and SQLite batch inserts — processes thousands of historical messages without data loss or duplication |
| **Modular architecture** | Thin orchestrator pattern: `src/index.js` wires together 25+ self-contained feature modules. No module imports another via the orchestrator — each is independently testable |
| **Hybrid API/SPA server** | Same Express app serves both a React SPA (served at `/panel`) and a legacy server-rendered fallback, controlled by env flag. API routes are normalised at middleware level for backward compatibility |
| **Per-role XP multipliers & perks** | Database-driven rule engine: badge/level triggers → Discord role grants, evaluated on each XP award event |
| **AI engagement** | Markov chain NLP model (order-2) trained on Russian community messages; keyword sentiment classification for context-aware responses |
| **Security hardening** | bcrypt password hashing, express-session with SQLite store, Content Security Policy via Helmet, rate-limiting on login and API endpoints, admin-only route guards |
| **Observability** | Structured JSON logging (custom logger), per-request trace IDs propagated through all HTTP logs and error responses |

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Web Panel](#-web-panel)
- [Bot Commands](#-bot-commands)
- [Technologies](#-technologies)
- [Development](#-development)
- [Deployment](#-deployment)
- [Security](#-security)
- [License](#-license)

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 📊 Core Statistics
- **Robust Message Counting** — Real-time tracking with verification & reconciliation
- **Leaderboards** — Top 5/10 users by message count
- **Weekly Stats** — Automatic resets every Monday
- **Message Streaks** — Consecutive daily activity tracking
- **Reaction Tracking** — Reactions given & received
- **Milestones** — Celebrations at 100 / 500 / 1K / 5K+ messages

### 🤖 AI & Engagement
- **ML-Based AI Chat** — Russian-language Markov chain responses
- **Smart Engagement** — Configurable frequency & modes
- **Sentiment Analysis** — Keyword-based classification
- **Context-Aware Responses** — Natural conversational AI

### 🛡️ Moderation & Rate Limiting
- **Channel Rate Limits** — Customizable frequency controls per channel and per role
- **Strike System** — Violation tracking with `/mystrikes`
- **Automod** — Banned words and security pipeline
- **Bulk Channel Operations** — Mass channel management with safety confirmation

</td>
<td width="50%" valign="top">

### 🎄 Holiday System
- **Automated Posts** — Daily holiday announcements at 09:00 MSK
- **Calend.ru Integration** — Real-time Russian holiday data
- **Manual Holidays** — Custom holidays with notes
- **Holiday Commands** — `/holiday today`, `/holiday date`, `/holiday list`

### 🎮 Game & Economy (SA-MP RP)
- **SA-MP Life** — Roleplay economy (`/reg`, `/work`, `/truck`, `/rob`, `/balance`)
- **Dealership & Arsenal** — Buy cars and weapons (`/dealership`, `/buy`, `/weapon`)
- **PvP & Trading** — Races, duels, and car sales (`/race`, `/duel`, `/sellcar`)
- **Daily Bonus** — Streak-based daily rewards up to $50K (`/daily`)
- **Bail System** — Pay to leave jail early (`/bail`)
- **Richest Players** — Top 10 wealthiest leaderboard (`/richest`)
- **Levels & XP** — Experience system with rank tiers and role-based XP multipliers
- **Badges** — 24 collectible achievement badges with `/badges` viewer
- **Perk Rules** — Automatic Discord role grants on badge/level milestones
- **Wanted Stars** — GTA-style wanted system with decay
- **Trivia** — Interactive quiz game with streaks
- **Radio Vote** — Song voting system
- **Weekly Awards** — Automated leaderboard posts with SAMP money & XP rewards
- **SA-MP Server Status** — Live server monitoring

### ⚙️ Advanced Systems
- **Full Reconciliation** — Daily count verification (03:00 AM)
- **Message Index Cleanup** — Weekly old index purging
- **Resumable Backfill** — Historical data loading with checkpoint system
- **Incremental Sync** — Efficient message synchronization
- **CSV Export** — Full statistics export

</td>
</tr>
</table>

### 🖥️ Web Administration Panel
- **Multi-User Auth** — Database-backed users with bcrypt passwords and admin/user roles
- **User Management** — Create, delete, promote/demote panel users via JSON API
- **Real-Time Dashboard** — Live server statistics & graphs
- **Message Manager** — Create and send rich Discord embeds with full preview
- **AI Configuration** — Control engagement settings, channels, and model stats
- **Gameplay Management** — Full CRUD for levels, badges, perk rules, XP multipliers, trivia, wanted stars, radio votes, SA-MP Life economy
- **Accuracy Monitor** — Message counting accuracy, reconciliation status, per-user trace debugging
- **Redesigned React SPA** — Full ground-up dark UI: lucide-react icons, recharts analytics, 8-component shared library (PageHeader, StatCard, SectionCard, DataTable, Alert, EmptyState, LoadingSkeleton, StatusBadge), page-level tab navigation throughout

---

## 🏗 Architecture

### Design Principles

The codebase follows a **thin orchestrator** pattern. The entry point (`src/index.js`, ~480 lines) creates resources and wires together self-contained modules — no pass-through imports between feature modules. Each module owns its own DB table schema, queries, and business logic, making it independently testable.

The web layer uses a **parallel API + SPA** approach: the same Express app serves a React 19 SPA at `/panel` (built by Vite) while also exposing 17 route modules under `/panel/api/:botKey/*`. A backward-compatibility middleware normalises legacy URL patterns at the request level so existing clients continue to work transparently.

### Project Structure

```
├── src/
│   ├── index.js                 # Thin orchestrator (~480 lines)
│   ├── runtime.js               # Runtime configuration
│   ├── panel-only.js            # Standalone panel entry point
│   │
│   ├── bot/                     # Discord bot layer
│   │   ├── helpers.js           # Shared utilities (formatting, plurals, etc.)
│   │   ├── schedulers.js        # All periodic tasks (ML, reconciliation, cleanup)
│   │   ├── discordClient.js     # Discord client factory
│   │   ├── slashCommands.js     # Slash command registration (30+ commands)
│   │   ├── statsDb.js           # Database query operations
│   │   ├── commands/
│   │   │   └── dispatcher.js    # Slash command dispatch
│   │   └── events/
│   │       └── handlers.js      # Discord event handlers (message, reaction, delete)
│   │
│   ├── features/                # Self-contained feature modules (25+)
│   │   ├── robust-message-counting.js  # Core counting pipeline with reconciliation
│   │   ├── ai-engagement.js     # AI responses & settings
│   │   ├── analytics.js         # Advanced analytics & daily stats
│   │   ├── holidays.js          # Holiday system (calend.ru + manual)
│   │   ├── samp-life.js         # SA-MP roleplay economy
│   │   ├── levels.js            # XP & leveling system
│   │   ├── badges.js            # User badge system (24 achievements)
│   │   ├── perks.js             # Badge/level → Discord role rule engine
│   │   ├── xp-multipliers.js    # Per-role XP multiplier config
│   │   ├── wanted-stars.js      # GTA-style wanted stars
│   │   ├── trivia.js            # Quiz game
│   │   ├── radio-vote.js        # Song voting
│   │   ├── weekly-awards.js     # Automated weekly posts
│   │   ├── ...                  # + 11 more modules
│   │   └── *.test.js            # Unit tests (26 tests, 3 suites)
│   │
│   ├── db/
│   │   └── schema.js            # Schema initialization (45+ tables)
│   │
│   ├── utils/
│   │   ├── db-helpers.js        # DB utilities (dbRun, dbGet, dbAll, KV store)
│   │   └── logger.js            # Structured logging with trace IDs
│   │
│   └── web/
│       ├── panel-app.js         # Express app factory (CSP, sessions, route wiring)
│       ├── panel-helpers.js     # Auth, bcrypt, role guards
│       └── routes/              # 17 Express route modules
│           ├── auth.js          # Login/logout + full user CRUD JSON API
│           ├── gameplay.js      # Levels, badges, perks, XP multipliers, trivia, etc.
│           ├── analytics.js     # Stats aggregation and verification
│           ├── messages.js      # Discord embed creation & editing
│           └── ...              # + 13 more route modules
│
├── panel-ui/                    # React 19 + Vite SPA
│   └── src/
│       ├── App.jsx              # Router, auth guard, sidebar nav with icons
│       ├── components/          # 8 shared UI components
│       │   ├── Alert.jsx        # Error/success/warning/info banners
│       │   ├── DataTable.jsx    # Generic table with loading/empty states
│       │   ├── EmptyState.jsx   # Empty content placeholder
│       │   ├── LoadingSkeleton.jsx  # Shimmer skeleton loaders
│       │   ├── PageHeader.jsx   # Page title + icon + actions header
│       │   ├── SectionCard.jsx  # Card with header, icon, actions slot
│       │   ├── StatCard.jsx     # Metric card with large value display
│       │   └── StatusBadge.jsx  # Status → badge variant mapper
│       ├── pages/               # 13 page components
│       │   ├── AnalyticsPage.jsx        # LineChart + BarChart via recharts
│       │   ├── GameplayPage.jsx         # 9-tab gameplay management
│       │   ├── UserManagementPage.jsx   # Full user CRUD panel
│       │   └── ...
│       ├── lib/api.js           # 70+ REST client methods
│       └── styles.css           # Dark-only design system (CSS custom properties)
│
├── public/panel/                # Built SPA (Vite output)
├── scripts/                     # 12 maintenance & debug scripts
├── data/                        # SQLite database + session store
└── logs/                        # Structured application logs
```

### Database Schema

**SQLite** with WAL mode — 45+ tables across all subsystems:

| Category | Tables |
|----------|--------|
| **Core** | `user_stats`, `weekly_stats`, `message_index`, `user_cache`, `bot_kv` |
| **Counting** | `message_count_events`, `message_count_errors`, `message_count_reference` |
| **Features** | `user_streaks`, `user_milestones`, `user_reactions`, `user_badges`, `user_levels` |
| **Gamification** | `badge_definitions`, `perk_rules`, `xp_role_multipliers` |
| **Game** | `samp_users`, `samp_garage`, `samp_inventory`, `samp_cooldowns`, `samp_ledger` |
| **AI/ML** | `ai_engagement_settings`, `ai_ml_training_data`, `ai_ml_metadata` |
| **Moderation** | `rate_limit_config`, `rate_limit_violations`, `banned_words`, `disabled_commands` |
| **Panel** | `panel_users`, `panel_messages`, `panel_sent_items`, `panel_debug_reports`, `sessions` |
| **Other** | `holidays`, `countdown_config`, `wanted_stars`, `trivia_scores`, `radio_votes`, `weekly_awards` |

---

## 📦 Installation

### Prerequisites

- **Node.js** 20.x or higher
- **npm**
- **PM2** (recommended for production)
- A **Discord Bot Token** ([Developer Portal](https://discord.com/developers/applications))

### Quick Start

```bash
# Clone
git clone https://github.com/abutsik4/Samp-Rp-Discord-Bot-w-Panel.git
cd Samp-Rp-Discord-Bot-w-Panel

# Install dependencies
npm install

# Build the admin panel SPA
npm run build

# Configure environment
cp .env.example .env   # then edit with your values

# Initialize panel users
node scripts/init-panel-users.js

# Start
node src/index.js
# or with PM2:
pm2 start ecosystem.config.js
```

The SQLite database schema is created automatically on first run.

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Discord Bot
DISCORD_TOKEN=<your_bot_token>
OWNER_ID=<your_discord_user_id>

# Optional Redis leaderboard cache (requires: npm install ioredis)
REDIS_URL=redis://localhost:6379

# Web Panel
PANEL_PORT=3001
SESSION_SECRET=<strong_random_string_32+_chars>

# Holiday System (optional)
HOLIDAYS_GUILD_ID=<your_guild_id>
HOLIDAYS_CHANNEL_ID=<target_channel_id>

# Levels / XP (optional)
LEVELS_XP_COOLDOWN_SEC=60
LEVELS_ANNOUNCE=0
LEVELS_ANNOUNCE_CHANNEL_ID=

# Admin Discord IDs (comma-separated)
ADMIN_IDS=<user_id_1>,<user_id_2>
```

> **Never commit your `.env` file.** It is already listed in `.gitignore`.

### Discord Bot Setup

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. **Bot** section → Add Bot → enable **Message Content Intent** & **Server Members Intent**
3. Copy token to `DISCORD_TOKEN`

### Bot Permissions

Recommended: **Administrator** (`permissions=8`), or grant individually:
- Read/Send Messages, Embed Links, Read Message History, Add Reactions, Use Slash Commands, Manage Roles

### Invite URL

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your bot's client ID.

---

## 🌐 Web Panel

### First-Time Setup

```bash
node scripts/init-panel-users.js
```

Creates default accounts for initial access. **Change all passwords immediately after first login.**

### Standalone Panel Mode

Run the panel independently (without the Discord bot):

```bash
node src/panel-only.js
```

### Panel Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Server stats overview, message graphs, top users |
| **Messages** | Create/edit/send rich Discord embeds to channels |
| **Discord Tools** | Load and edit existing Discord messages |
| **Statistics** | Advanced user analytics, date ranges, search |
| **Analytics** | 7/30/90-day breakdowns, channel heatmaps, peak hours |
| **Verification** | Message counting accuracy, per-user trace debugging |
| **Moderation** | Automod, whitelist, rate limits per channel/role, strike controls |
| **Automation** | Command toggles, holidays, countdown, AI engagement config |
| **Operations** | History/undo, debug reports, accuracy reconcile & trace |
| **SA-MP Servers** | Live SA-MP server status monitoring |
| **Gameplay Systems** | Levels, badges (definitions + user grants), perk rules, XP multipliers, trivia, wanted stars, radio votes, SA-MP Life economy |
| **User Management** | Create/delete panel users, role assignment, password resets *(Admin only)* |

### API Design

- Canonical prefix: `GET|POST|DELETE /panel/api/:botKey/...`
- Backward-compatible: `/panel/api/bot/:botKey/...` is rewritten transparently at middleware
- All endpoints return `{ ok: true, ... }` on success or `{ ok: false, error: "..." }` on failure
- Error responses include a `traceId` for log correlation
- Set `PANEL_LEGACY_PAGES=1` to force server-rendered pages during rollback

---

## 🤖 Bot Commands

> All slash command descriptions and responses are in Russian. English descriptions shown for reference.

### User Commands

| Command | Description |
|---------|-------------|
| `/mystats` | Your message statistics |
| `/userstats @user` | Another user's statistics |
| `/top5` / `/top10` | Top users by message count |
| `/weekly` | Weekly leaderboard (resets Monday) |
| `/streak [@user]` | View message streak |
| `/reactions [type]` | Reaction leaderboard (given/received) |
| `/badges [@user]` | View earned and available badges |
| `/mystrikes` | Your rate-limit violations & strikes |
| `/level` | Your XP, level, and rank |
| `/levels-top` | XP leaderboard |
| `/trivia` | Start a trivia question |
| `/trivia-top` | Trivia leaderboard |
| `/trivia-stats [@user]` | Trivia statistics |
| `/countdown` | Countdown to New Year |
| `/awards` | View weekly awards |

### Holiday Commands

| Command | Description |
|---------|-------------|
| `/holiday today` | Today's holidays |
| `/holiday date <value>` | Holidays for a specific date |
| `/holiday list [date]` | List manual holidays |
| `/holiday add` | Add manual holiday *(Admin)* |
| `/holiday remove <id>` | Remove manual holiday *(Admin)* |

### Game & Economy Commands

| Command | Description |
|---------|-------------|
| `/reg` | Register SA-MP Life profile |
| `/balance` | View your profile (money, car, weapon, status) |
| `/work` | Quick job (100–500$) |
| `/truck` | Trucking run (2.5–6.5K$, risk of crash) |
| `/rob` | Robbery attempt (2–10K$, risk of jail) |
| `/daily` | Claim daily bonus (streak-based, up to $50K) |
| `/bail` | Pay bail to leave jail early |
| `/dealership` | Browse available cars and prices |
| `/buy type:(car\|weapon) id:<id>` | Purchase a car or weapon |
| `/weapon id:<id>` | Equip a weapon |
| `/race @user bet:<amount>` | Street race for money |
| `/duel @user bet:<amount>` | Armed duel for money |
| `/sellcar user:@user car:<id> price:<$>` | Sell a car to another player |
| `/buycar offer:<id>` | Accept a car purchase offer |
| `/richest` | Top 10 wealthiest players |

### Radio Commands

| Command | Description |
|---------|-------------|
| `/radio station:<station>` | Vote for a radio station |
| `/radio-top` | Radio station leaderboard |
| `/radio-info station:<station>` | Station info: DJ, tracks, description |
| `/radio-fans station:<station>` | Who listens to a station |



---

## 🛠 Technologies

| Layer | Stack |
|-------|-------|
| **Runtime** | Node.js 20+, PM2 |
| **Discord** | discord.js v14 |
| **API** | Express 4, express-session, connect-sqlite3, Helmet (CSP) |
| **Auth** | bcryptjs, role-based access control (Admin/User) |
| **Database** | SQLite3 (WAL mode), 45+ tables |
| **AI/ML** | Markov chains (order-2), keyword-based sentiment analysis |
| **Frontend** | React 19, React Router 7, Vite 7, lucide-react (icons), recharts (charts), dark-only CSS custom property design system |
| **Logging** | Custom structured logger, per-request trace IDs |
| **Testing** | Node.js built-in test runner, 33 unit tests + integration suite |

---

## 👨‍💻 Development

### Running Locally

```bash
# Development mode (bot + panel)
npm run dev

# Panel SPA dev server (hot-reload, proxies API)
npm run ui:dev

# With PM2 auto-restart
pm2 start ecosystem.config.js --watch
```

### NPM Scripts

| Command | What it does |
|--------:|--------------|
| `npm run dev` | Start in development mode |
| `npm start` | Start in production mode |
| `npm run ui:dev` | Start Vite dev server for panel SPA |
| `npm run ui:build` | Build panel SPA into `public/panel` |
| `npm run build` | Alias for `ui:build` |
| `npm run check` | Syntax-check entrypoint (`node --check`) |
| `npm test` | Run unit tests (`node --test`) |
| `npm run test:integration` | Run DB/query integration checks |
| `npm run test:all` | Run unit + integration tests |
| `npm run make:hash` | Generate bcrypt password hash |
| `npm run audit:user` | Audit a specific user by ID |

### Testing

```bash
# Unit tests
npm test

# Specific suite
node --test src/features/robust-message-counting.test.js
node --test src/features/samp-life.test.js

# Integration tests (requires server running)
npm run test:integration

# Full suite
npm run test:all
```

### Debug Logging

| Variable | Values | Default |
|----------|--------|---------|
| `LOG_LEVEL` | `silent` · `error` · `warn` · `info` · `debug` · `trace` | `info` |
| `LOG_FORMAT` | `pretty` · `json` | `pretty` |

```bash
LOG_LEVEL=debug npm run dev
LOG_LEVEL=info LOG_FORMAT=json pm2 start ecosystem.config.js
```

### Utility Scripts

```bash
node scripts/validate-message-counts.js          # Validate counts
node scripts/audit-user.js <user_id>              # Audit specific user
node scripts/safe-backfill.js                     # Safe historical backfill
node scripts/backfill-daily-stats.js              # Backfill daily_channel_stats
node scripts/migrate-analytics-schema.js          # Apply analytics schema migrations
node scripts/verify-counts-from-search.js         # Verify from Discord search
node scripts/verify-analytics.js                  # Verify analytics data quality
node scripts/trace-message-counting.js user <id> --guild <gid>   # Trace user
node scripts/trace-message-counting.js message <id> --guild <gid> # Trace message
```

---

## 🚀 Deployment

### Production with PM2

```bash
npm install -g pm2

pm2 start ecosystem.config.js
pm2 save
pm2 startup   # auto-restart on reboot
```

### Deploy Script

```bash
chmod +x deploy.sh
./deploy.sh
```

Pulls latest changes → installs deps → builds SPA → health-checks port and `/api/status` → restarts PM2.

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d example.com
```

### Monitoring

```bash
pm2 status                    # Process status
pm2 logs                      # Live logs
pm2 monit                     # Resource monitor
```

### Database Backups

```bash
sqlite3 data/stats.db ".backup 'backups/stats_$(date +%Y%m%d_%H%M%S).db'"
```

---

## 🔒 Security

- **`.env` is gitignored** — tokens and secrets never committed
- **bcrypt password hashing** — cost factor 10 for panel user passwords
- **Session hardening** — HTTPOnly, SameSite=Lax cookies; SQLite-backed session store
- **Content Security Policy** — Helmet CSP restricts script/style/image sources
- **Rate limiting** — login endpoint (10 req/min) and API endpoints (40 req/10s)
- **Role-based access control** — admin-only routes enforced server-side
- **Input validation** — all user inputs validated before DB writes
- **HTTPS** — always use TLS in production via Nginx + Let's Encrypt

---

## 📝 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 🙏 Acknowledgments

- [Discord.js](https://discord.js.org/) community
- [Calend.ru](https://calend.ru/) for Russian holiday data

---

<p align="center"><strong>Built end-to-end as a solo full-stack project for the SA-MP RP Community</strong></p>
