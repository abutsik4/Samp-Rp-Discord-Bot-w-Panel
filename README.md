<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Discord.js-14-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord.js" />
  <img src="https://img.shields.io/badge/Express-4-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License" />
</p>

# SA-MP RP Discord Bot with Management Panel

A comprehensive Discord bot for SA-MP roleplay communities with an advanced web administration panel. Features real-time statistics, AI engagement, game economy, rate limiting, holiday system, and a modern glassmorphic UI — all in a clean modular architecture.

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
- [Contributing](#-contributing)

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
- **Channel Rate Limits** — Customizable frequency controls
- **Role-Based Limits** — Per-role rate configurations
- **Strike System** — Violation tracking with `/mystrikes`
- **Automod** — Banned words and security pipeline

</td>
<td width="50%" valign="top">

### 🎄 Holiday System
- **Automated Posts** — Daily holiday announcements at 09:00 MSK
- **Calend.ru Integration** — Real-time Russian holiday data
- **Manual Holidays** — Custom holidays with notes
- **Holiday Commands** — `/holiday today`, `/holiday date`, `/holiday list`

### 🎮 Game & Economy (SA-MP RP)
- **SA-MP Life** — Roleplay economy (`/reg`, `/work`, `/rob`, `/car`, `/house`)
- **Levels & XP** — Experience system with rank tiers
- **Badges** — Collectible user badges
- **Wanted Stars** — GTA-style wanted system with decay
- **Trivia** — Interactive quiz game with streaks
- **Radio Vote** — Song voting system
- **Weekly Awards** — Automated leaderboard posts
- **SA-MP Server Status** — Live server monitoring

### ⚙️ Advanced Systems
- **Full Reconciliation** — Daily count verification (03:00 AM)
- **Message Index Cleanup** — Weekly old index purging
- **Backfill System** — Historical data loading with progress
- **Incremental Sync** — Efficient message synchronization
- **CSV Export** — Full statistics export

</td>
</tr>
</table>

### 🖥️ Web Administration Panel
- **Multi-User Auth** — Database-backed users with admin/user roles
- **User Management** — Create, delete, promote/demote users
- **Real-Time Dashboard** — Live server statistics & graphs
- **Message Manager** — Create and send rich embeds
- **AI Configuration** — Control engagement settings & channels
- **Rate Limit Manager** — Per-channel and per-role config
- **Channel Manager** — Bulk channel operations with safety confirmation
- **Accuracy Monitor** — Message counting accuracy & reconciliation status
- **Glassmorphic UI** — Modern dark theme with glassmorphism design

---

## 🏗 Architecture

### Design Principles

The codebase follows a **thin orchestrator** pattern. The entry point (`src/index.js`, ~480 lines) creates resources and wires together self-contained modules. Each module imports its own dependencies directly — no pass-through imports.

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
│   │   ├── slashCommands.js     # Slash command registration
│   │   ├── statsDb.js           # Database query operations
│   │   ├── commands/
│   │   │   └── dispatcher.js    # Slash command dispatch (30+ commands)
│   │   └── events/
│   │       └── handlers.js      # Discord event handlers
│   │
│   ├── features/                # Self-contained feature modules (25+)
│   │   ├── robust-message-counting.js  # Core counting pipeline
│   │   ├── ai-engagement.js     # AI responses & settings
│   │   ├── analytics.js         # Advanced analytics & daily stats
│   │   ├── holidays.js          # Holiday system (calend.ru + manual)
│   │   ├── samp-life.js         # SA-MP roleplay economy
│   │   ├── levels.js            # XP & leveling system
│   │   ├── badges.js            # User badge system
│   │   ├── wanted-stars.js      # GTA-style wanted stars
│   │   ├── trivia.js            # Quiz game
│   │   ├── radio-vote.js        # Song voting
│   │   ├── weekly-awards.js     # Automated weekly posts
│   │   ├── ...                  # + 14 more modules
│   │   └── *.test.js            # Unit tests (26 tests, 3 suites)
│   │
│   ├── db/
│   │   └── schema.js            # Schema initialization (45+ tables)
│   │
│   ├── utils/
│   │   ├── db-helpers.js        # DB utilities (dbRun, dbGet, dbAll, KV store)
│   │   └── logger.js            # Structured logging
│   │
│   ├── views/                   # EJS templates (login, users, password)
│   │
│   └── web/
│       ├── shared-template.js   # Unified HTML generator for all pages
│       ├── panel-helpers.js     # Panel utility functions
│       ├── auth.js              # Authentication (bcrypt + sessions)
│       ├── *-page.js            # Page generators (13 files)
│       ├── public/              # Client-side assets (CSS, JS)
│       └── routes/              # Express route modules (17 files)
│
├── public/                      # Static landing page
├── scripts/                     # Maintenance & debug scripts
├── data/                        # SQLite database
├── logs/                        # Application logs
└── backups/                     # Database backups
```

### Database Schema

**SQLite** with WAL mode — 45+ tables including:

| Category | Tables |
|----------|--------|
| **Core** | `user_stats`, `weekly_stats`, `message_index`, `user_cache`, `bot_kv` |
| **Counting** | `message_count_events`, `message_count_errors`, `message_count_reference` |
| **Features** | `user_streaks`, `user_milestones`, `user_reactions`, `user_badges`, `user_levels` |
| **Game** | `samp_users`, `samp_garage`, `samp_inventory`, `samp_cooldowns`, `samp_ledger` |
| **AI/ML** | `ai_engagement_settings`, `ai_ml_training_data`, `ai_ml_metadata` |
| **Moderation** | `rate_limit_config`, `rate_limit_violations`, `banned_words`, `disabled_commands` |
| **Panel** | `panel_users`, `panel_messages`, `panel_sent_items`, `panel_debug_reports` |
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

# Configure environment (see next section)
cp .env.example .env   # then edit with your values

# Initialize panel users
node scripts/init-panel-users.js

# Start
node src/index.js
# or with PM2:
pm2 start ecosystem.config.js
```

The SQLite database is created automatically on first run.

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Discord Bot
DISCORD_TOKEN=<your_bot_token>
DISCORD_CLIENT_ID=<your_client_id>
DISCORD_CLIENT_SECRET=<your_client_secret>
BOT_OWNER_ID=<your_discord_user_id>

# Web Panel
PANEL_PORT=3001
PANEL_BASE_URL=http://localhost:3001
SESSION_SECRET=<generate_a_random_string>

# OAuth Callback (optional)
OAUTH_CALLBACK_URL=http://localhost:3001/panel/callback

# Holiday System (optional)
HOLIDAYS_GUILD_ID=<your_guild_id>
HOLIDAYS_CHANNEL_ID=<target_channel_id>

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
- Read/Send Messages, Embed Links, Read Message History, Add Reactions, Use Slash Commands

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

Run the panel independently (without the Discord bot), for testing or panel-only access:

```bash
node src/panel-only.js
```

### Panel Pages

| Page | Description |
|------|-------------|
| **Dashboard** | Server stats overview, message graphs, top users |
| **Bot Control** | Quick actions, feature toggles, configuration |
| **Messages** | Create/edit/send rich embeds to channels |
| **AI Engagement** | Enable/disable AI, set frequency, channel config |
| **Rate Limiter** | Per-channel/role limits and time windows |
| **Channels** | Bulk channel operations with safety confirmation |
| **Holidays** | Manage custom holidays, view upcoming |
| **Statistics** | Advanced analytics, date ranges, CSV export |
| **Accuracy** | Message counting accuracy & reconciliation |
| **Commands** | Auto-generated command documentation |
| **User Management** | Create/delete users, roles, password resets (Admin) |
| **SA-MP Servers** | Live SA-MP server status monitoring |
| **Automod** | Banned words, security pipeline config |

---

## 🤖 Bot Commands

### User Commands

| Command | Description |
|---------|-------------|
| `/mystats` | Your message statistics |
| `/userstats @user` | Another user's statistics |
| `/top5` / `/top10` | Top users by message count |
| `/weekly` | Weekly leaderboard (resets Monday) |
| `/streak [@user]` | View message streak |
| `/reactions [type]` | Reaction leaderboard (given/received) |
| `/mystrikes` | Your rate-limit violations & strikes |
| `/countdown` | Countdown to New Year |
| `/history` | Your message history summary |

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
| `/work` | Earn money (cooldown-based) |
| `/rob @user` | Attempt to rob another player |
| `/car` | View/buy cars |
| `/level` | View your level & XP |
| `/levels-top` | XP leaderboard |
| `/trivia` | Start a trivia question |
| `/trivia-stats` | Your trivia statistics |
| `/trivia-top` | Trivia leaderboard |
| `/radio <song>` | Vote for a song |
| `/radio-top` | Top voted songs |
| `/awards` | View weekly awards |
| `/sampstatus` | SA-MP server status |
| `/whitelist` | Whitelist management |
| `/automod` | Automod config *(Admin)* |

### Admin / Owner Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/backfill` | Load message history | Owner |
| `/synccommands` | Re-register slash commands | Owner |
| `/sync-missing` | Sync missing messages | Owner |
| `/export` | Export stats to CSV | Owner |
| `/demoembed` | Send example embed | Admin |
| `/undo` | Undo last operation | Owner |

---

## 🛠 Technologies

| Layer | Stack |
|-------|-------|
| **Runtime** | Node.js 20+, PM2 |
| **Discord** | discord.js v14 |
| **Web** | Express 4, EJS, express-session, connect-sqlite3 |
| **Database** | SQLite3 (WAL mode) |
| **Auth** | bcryptjs, role-based access (Admin/User) |
| **AI/ML** | Markov chains, keyword-based sentiment analysis |
| **Frontend** | Vanilla JS, CSS3 glassmorphism, Fetch API |

---

## 👨‍💻 Development

### Running Locally

```bash
# Development mode
npm run dev

# With PM2 (auto-restart on changes)
pm2 start ecosystem.config.js --watch
```

### Testing

```bash
# Run all unit tests — 26 tests across 3 suites
npm test

# Or directly:
node --test src/features/*.test.js

# Run a specific suite
node --test src/features/robust-message-counting.test.js
node --test src/features/samp-life.test.js
node --test src/features/new-features.test.js

# Integration tests (DB + endpoints)
npm run test:integration

# Everything
npm run test:all
```

### Debug Logging

Structured logging via the built-in logger:

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
node scripts/verify-counts-from-search.js         # Verify from Discord search
node scripts/trace-message-counting.js user <id> --guild <gid>   # Trace user
node scripts/trace-message-counting.js message <id> --guild <gid> # Trace message
```

### Debug APIs (Panel)

When logged into the panel:

```
GET /api/accuracy/trace/message?guildId=...&messageId=...&limit=50
GET /api/accuracy/trace/user?guildId=...&userId=...&limit=50
```

---

## 🚀 Deployment

### Production with PM2

```bash
npm install -g pm2

pm2 start ecosystem.config.js
pm2 save
pm2 startup   # auto-restart on boot
```

### Deploy Script

```bash
chmod +x deploy.sh
./deploy.sh
```

Pulls latest changes → installs deps → restarts PM2 → shows status.

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

---

## 📊 Monitoring

```bash
pm2 status                    # Process status
pm2 logs                      # Live logs
pm2 monit                     # Resource monitor
```

### Database Backups

Automatic backups are stored in `backups/`. Manual backup:

```bash
sqlite3 data/stats.db ".backup 'backups/stats_$(date +%Y%m%d_%H%M%S).db'"
```

---

## 🔒 Security

- **`.env` is gitignored** — never commit tokens or secrets
- **Session secrets** — use a strong random string (32+ chars)
- **Default passwords** — change immediately after `init-panel-users.js`
- **Rate limiting** — built-in on both bot and web endpoints
- **Input validation** — all user inputs sanitized
- **HTTPS** — always use TLS in production
- **Dependencies** — run `npm audit fix` regularly

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
- Contributors and testers

---

<p align="center"><strong>Made with ❤️ for the SA-MP RP Community</strong></p>
