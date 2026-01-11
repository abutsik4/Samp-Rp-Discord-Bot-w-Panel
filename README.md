# Samp-Rp Discord Bot with Management Panel

A comprehensive Discord bot with an advanced web-based administration panel, featuring statistics tracking, AI engagement, rate limiting, and extensive customization options.

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Discord.js](https://img.shields.io/badge/Discord.js-14+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

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
- [License](#-license)

## ✨ Features

### Core Statistics
- **Robust Message Counting** - Real-time message tracking with verification and reconciliation
- **Leaderboards** - Top users by message count (Top 5/10)
- **Weekly Stats** - Automatic weekly leaderboard resets every Monday
- **Message Streaks** - Track consecutive daily activity
- **Reaction Tracking** - Monitor reactions given and received
- **Milestones** - Automatic celebrations at 100, 500, 1000, 5000+ messages

### AI & Engagement
- **ML-Based AI Chat** - Contextual Russian-language responses using Markov chains
- **Smart Engagement** - Configurable AI interaction frequency and modes
- **Sentiment Analysis** - Keyword-based message classification
- **Natural Responses** - Context-aware conversational AI

### Moderation & Rate Limiting
- **Channel-Based Rate Limits** - Customizable message frequency controls
- **Role-Based Limits** - Different limits for different roles
- **Consecutive Message Limiter** - Prevent spam with consecutive message detection
- **Strike System** - Track violations with `/mystrikes`

### Holiday System
- **Automated Daily Posts** - Holiday announcements at 09:00 MSK
- **Calend.ru Integration** - Real-time Russian holiday data
- **Manual Holidays** - Add custom holidays with notes
- **Holiday Commands** - `/holiday today`, `/holiday date`, `/holiday list`

### Advanced Features
- **Message Index Cleanup** - Automatic old message index cleanup (weekly)
- **Full Reconciliation** - Daily message count verification at 03:00 AM
- **Backfill System** - Load historical message data with progress tracking
- **Export Functionality** - Export server stats to CSV
- **User Preferences** - Language settings and customization

### Web Administration Panel
- **Multi-User Authentication** - Database-backed user system with roles
- **User Management** - Create, delete, and manage panel users (Admin)
- **Password Management** - Change your own password or reset others (Admin)
- **Discord OAuth2 Login** - Secure authentication (legacy support)
- **Real-Time Stats Dashboard** - Live server statistics
- **Message Management** - Create and send embed messages
- **AI Configuration** - Control engagement settings
- **Rate Limit Management** - Configure per-channel and per-role limits
- **Accuracy Monitor** - Track message counting accuracy
- **Glassmorphic UI** - Modern dark theme with glassmorphism design

## 🏗 Architecture

### Project Structure

```
/opt/jepsencloud-bot/
├── src/
│   ├── index.js                 # Main entry point
│   ├── runtime.js               # Runtime configuration
│   ├── bot/
│   │   ├── discordClient.js     # Discord client setup
│   │   ├── slashCommands.js     # Command registration
│   │   └── statsDb.js           # Database operations
│   ├── features/
│   │   ├── ai-engagement.js     # ML-based AI responses
│   │   ├── analytics.js         # Advanced analytics
│   │   ├── enhanced-backfill.js # Message history loader
│   │   ├── holidays.js          # Holiday system
│   │   ├── markov-generator.js  # Text generation
│   │   ├── message-index-cleanup.js
│   │   ├── milestones.js        # Achievement system
│   │   ├── ml-engine.js         # Machine learning engine
│   │   ├── rate-limiter.js      # Rate limiting
│   │   ├── reactions.js         # Reaction tracking
│   │   ├── reconciliation.js    # Count verification
│   │   ├── robust-message-counting.js
│   │   ├── streaks.js           # Daily streak tracking
│   │   ├── user-preferences.js  # User settings
│   │   └── weekly-stats.js      # Weekly leaderboards
│   ├── utils/
│   │   ├── db-helpers.js        # Database utilities
│   │   └── i18n.js              # Internationalization
│   ├── views/                   # EJS templates
│   │   ├── accuracy-monitor.ejs
│   │   ├── bot.ejs
│   │   ├── home.ejs
│   │   ├── login.ejs
│   │   ├── users.ejs            # User management page
│   │   └── change-password.ejs  # Password change page
│   └── web/
│       ├── server.js            # Express web server
│       ├── auth.js              # Multi-user authentication
│       ├── botsRegistry.js      # Bot configuration
│       ├── commands-page.js     # Commands documentation
│       ├── ai-engagement-page.js
│       ├── rate-limiter-page.js
│       ├── consecutive-limiter-page.js
│       ├── messages-page.js
│       ├── stats-page.js
│       ├── accuracy-monitor-page.js
│       └── public/
│           ├── app.css
│           ├── bot.js
│           └── snow.js
├── public/
│   ├── index.html              # Landing page
│   ├── shared.css              # Shared styles
│   ├── snow.css                # Snow effect
│   └── snow.js
├── scripts/                    # Utility scripts
├── data/                       # SQLite database
├── logs/                       # Application logs
└── backups/                    # Database backups
```

### Database Schema

**SQLite Database** (`data/stats.db`)

- **user_stats** - Message counts, streaks, reactions
- **weekly_stats** - Weekly leaderboard data
- **milestones** - Achievement tracking
- **message_index** - Indexed messages for verification
- **holidays** - Manual holidays
- **user_preferences** - User settings
- **rate_limit_config** - Rate limit rules
- **consecutive_limit_config** - Consecutive message rules
- **panel_users** - Web panel user accounts and authentication

## 📦 Installation

### Prerequisites

- **Node.js** 18.x or higher
- **npm** or **yarn**
- **PM2** (for process management)
- **Discord Bot Token**
- **Discord OAuth2 Application**

### Step 1: Clone Repository

```bash
git clone https://github.com/abutsik4/Samp-Rp-Discord-Bot-w-Panel.git
cd Samp-Rp-Discord-Bot-w-Panel
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment

Create a `.env` file in the root directory:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
BOT_OWNER_ID=your_discord_user_id

# Web Panel Configuration
PANEL_PORT=3001
PANEL_BASE_URL=http://localhost:3001
SESSION_SECRET=random_secure_string_here

# OAuth Callback
OAUTH_CALLBACK_URL=http://localhost:3001/panel/callback

# Holiday System (optional)
HOLIDAYS_GUILD_ID=your_guild_id
HOLIDAYS_CHANNEL_ID=your_channel_id

# Admin Users (comma-separated Discord user IDs)
ADMIN_IDS=user_id_1,user_id_2
```

### Step 4: Initialize Database

The database will be automatically created on first run. For manual initialization:

```bash
node src/index.js
```

## ⚙️ Configuration

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a New Application
3. Navigate to **Bot** section
4. Click **Add Bot**
5. Enable **Message Content Intent**
6. Enable **Server Members Intent**
7. Copy the bot token to `.env`

### OAuth2 Setup

1. In Discord Developer Portal, go to **OAuth2**
2. Add redirect URL: `http://your-domain:5012/panel/callback`
3. Copy Client ID and Secret to `.env`

### Bot Permissions

Required bot permissions integer: `8` (Administrator) or specific permissions:
- Read Messages/View Channels
- Send Messages
- Embed Links
- Read Message History
- Add Reactions
- Use Slash Commands

### Invite URL

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

## 🌐 Web Panel

### Initial Setup - Panel Users

Before accessing the panel, initialize the default users:

```bash
node scripts/init-panel-users.js
```

This creates two default accounts:
- **Admin**: `admin` / `admin123` (full access)
- **Test**: `test` / `test1234` (standard access)

> ⚠️ **Important**: Change the admin password immediately after first login!

### Standalone Panel Mode

Run the panel without the full bot (useful for testing):

```bash
node src/panel-only.js
```

Panel will be available at: `http://localhost:3001/login`

### Accessing the Panel

1. Start the bot: `pm2 start ecosystem.config.js`
2. Navigate to `http://localhost:3001` (or your configured URL)
3. Login with your panel credentials
4. Select your bot from the dashboard

### User Management (Admin Only)

Admins can manage panel users at `/users`:

| Feature | Description |
|---------|-------------|
| **Create User** | Add new users with username, password, and role |
| **Delete User** | Remove panel users (cannot delete yourself) |
| **Reset Password** | Set new password for any user |
| **Change Role** | Promote users to admin or demote to user |

### Password Management

All users can change their own password at `/change-password`:
1. Enter current password
2. Enter new password (min 8 characters)
3. Confirm new password

### Panel Features

#### Dashboard
- Server statistics overview
- Message count graphs
- Top users display
- Recent activity feed

#### Bot Control Panel
- Quick actions (restart, status)
- Feature toggles
- Configuration settings

#### Message Manager
- Create rich embeds
- Send messages to channels
- Edit existing messages
- Preview before sending

#### AI Engagement Settings
- Enable/disable AI chat
- Set engagement frequency
- Configure allowed channels
- Choose response mode (Markov/Keywords)

#### Rate Limiter
- Set per-channel message limits
- Configure role-based limits
- Set time windows
- View active limits

#### Consecutive Limiter
- Prevent message spam
- Set consecutive message thresholds
- Configure cooldown periods
- Manage strikes

#### Accuracy Monitor
- View message counting accuracy
- Reconciliation status
- Missing messages report
- Verification logs

#### Statistics Page
- Advanced analytics
- Custom date ranges
- User activity charts
- Export to CSV

## 🤖 Bot Commands

### User Commands

| Command | Description |
|---------|-------------|
| `/mystats` | Show your message statistics |
| `/userstats @user` | View another user's statistics |
| `/top5` | Top 5 users by message count |
| `/top10` | Top 10 users by message count |
| `/weekly` | Weekly leaderboard (resets Monday) |
| `/streak [@user]` | View message streak |
| `/reactions [type]` | Reaction leaderboard (given/received) |
| `/mystrikes` | View your violations and strikes |
| `/countdown` | Countdown to New Year 2026 |

### Holiday Commands

| Command | Description |
|---------|-------------|
| `/holiday today` | Show today's holidays |
| `/holiday date <value>` | Holidays for specific date |
| `/holiday list <date>` | List manual holidays |
| `/holiday add` | Add manual holiday (Admin) |
| `/holiday remove <id>` | Remove manual holiday (Admin) |

### Administrator Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/backfill` | Load message history | Owner |
| `/synccommands` | Re-register slash commands | Owner |
| `/export` | Export stats to CSV | Owner |
| `/demoembed` | Send example embed | Admin |

## 🛠 Technologies

### Backend
- **Node.js** - JavaScript runtime
- **Discord.js v14** - Discord API wrapper
- **Express.js** - Web framework
- **SQLite3** - Embedded database
- **EJS** - Template engine
- **PM2** - Process manager

### Frontend
- **Vanilla JavaScript** - Client-side scripting
- **CSS3** - Glassmorphism design
- **Fetch API** - HTTP requests
- **Chart.js** - Data visualization (optional)

### AI/ML
- **Markov Chains** - Text generation
- **Keyword Analysis** - Sentiment classification
- **Natural Language Processing** - Message context

### Authentication
- **BCrypt** - Secure password hashing
- **Express Session** - Session management
- **SQLite Session Store** - Persistent sessions
- **Role-Based Access** - Admin and User roles

## 👨‍💻 Development

### Running Locally

```bash
# Development mode
npm run dev

# Or with PM2
pm2 start ecosystem.config.js --watch

# View logs
pm2 logs jepsencloud-panel
```

### Testing

```bash
# Unit tests (fast, exits cleanly)
npm test

# Analytics integration checks (DB + endpoints)
npm run test:integration

# Run both
npm run test:all

# Run a specific unit test file
node --test src/features/robust-message-counting.test.js
```

### Database Utilities

```bash
# Validate message counts
node scripts/validate-message-counts.js

# Trace a specific message or user (debug)
node scripts/trace-message-counting.js message <message_id> --guild <guild_id>
node scripts/trace-message-counting.js user <user_id> --guild <guild_id>

# Audit specific user
node scripts/audit-user.js <user_id>

# Safe backfill
node scripts/safe-backfill.js

# Verify counts from search
node scripts/verify-counts-from-search.js
```

### Debug Logging

The message-counting pipeline uses structured logging.

- `LOG_LEVEL`: `silent|error|warn|info|debug|trace` (default: `info`)
- `LOG_FORMAT`: `pretty|json` (default: `pretty`)

Example (more detailed logs in development):

```bash
LOG_LEVEL=debug npm run dev
```

Example (JSON logs for PM2):

```bash
LOG_LEVEL=info LOG_FORMAT=json pm2 start ecosystem.config.js
```

### Debug APIs (Panel)

If you’re logged into the panel, you can query deep traces:

- `GET /api/accuracy/trace/message?guildId=...&messageId=...&limit=50`
- `GET /api/accuracy/trace/user?guildId=...&userId=...&limit=50`

These endpoints return the `message_index` row (if present) plus recent `message_count_events` and `message_count_errors`.

### Code Structure

- Follow ESM or CommonJS consistently
- Use async/await for asynchronous operations
- Implement error handling in all features
- Document complex functions
- Keep database operations in transaction blocks

## 🚀 Deployment

### Production Setup with PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start bot
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup auto-restart on boot
pm2 startup
```

### Using the Deploy Script

```bash
chmod +x deploy.sh
./deploy.sh
```

The deploy script:
1. Pulls latest changes from git
2. Installs dependencies
3. Restarts PM2 processes
4. Shows status

### Environment-Specific Configuration

**Development:**
```bash
NODE_ENV=development pm2 start ecosystem.config.js
```

**Production:**
```bash
NODE_ENV=production pm2 start ecosystem.config.js
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL Setup (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 📊 Monitoring

### PM2 Monitoring

```bash
# Status
pm2 status

# Logs
pm2 logs jepsencloud-panel

# Monitor resources
pm2 monit

# Restart
pm2 restart jepsencloud-panel
```

### Database Backups

Automatic backups are created in `backups/` directory. Manual backup:

```bash
sqlite3 data/stats.db ".backup 'backups/manual_$(date +%Y%m%d_%H%M%S)/stats.db.backup'"
```

## 🔒 Security

- Never commit `.env` file
- Use strong session secrets
- Implement rate limiting on web endpoints
- Validate all user inputs
- Use HTTPS in production
- Restrict admin panel access
- Regular dependency updates: `npm audit fix`

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 💬 Support

For support, join our Discord server or open an issue on GitHub.

## 🙏 Acknowledgments

- Discord.js community
- Calend.ru for holiday data
- Contributors and testers

---

**Made with ❤️ for Samp-Rp Community**