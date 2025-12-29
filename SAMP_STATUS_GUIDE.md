# SA-MP Server Status Tracker

Automatic SA-MP server status monitoring with Discord embeds, similar to the Minecraft server status bot.

## Features

✅ **Real-time Status Monitoring**
- Server online/offline detection
- Player count tracking
- Online player list with scores
- Server name and gamemode display
- Password protection indicator

✅ **Auto-Updating Discord Embed**
- 🔴 Red = Server Offline
- 🟣 Purple = Server Online (0 players)
- 🟢 Green = Server Online (players online)
- Updates every 30 seconds
- Only updates when status changes (efficient)

✅ **Professional Embeds**
- Shows server hostname
- Player count (current/max)
- Gamemode information
- Online player names and scores
- Timestamp of last update

## Setup

### 1. Start Tracking a Server

```
/sampstatus start ip:<server_ip> port:<port> channel:<channel>
```

**Parameters:**
- `ip` - Server IP address (required)
- `port` - Server port (default: 7777)
- `channel` - Discord channel for status updates (required)

**Example:**
```
/sampstatus start ip:92.63.96.220 port:7777 channel:#samp-status
```

### 2. Check Tracker Status

```
/sampstatus status
```

Shows current tracker configuration and status.

### 3. Stop Tracking

```
/sampstatus stop
```

Stops the tracker and disables auto-updates.

## How It Works

### Query Protocol

The tracker uses the official SA-MP query protocol (UDP):

1. **Server Info Query (opcode 'i')**
   - Hostname
   - Player count (current/max)
   - Gamemode
   - Language
   - Password protection status

2. **Detailed Player Query (opcode 'd')**
   - Player IDs
   - Player names
   - Player scores
   - Player pings

### Update Cycle

- Queries server every 30 seconds
- Only updates Discord embed if status changed
- Automatically handles server offline/online transitions
- Survives bot restarts (config stored in database)

## Status Indicators

### 🔴 Server Offline
```
Server is Offline!
```
- Cannot connect to server
- Server may be down or restarting
- Network issues

### 🟣 Server Online (Empty)
```
Server is Online
Players: 0/100
Gamemode: RolePlay
```
- Server is running
- No players online
- Ready to join

### 🟢 Server Online (Active)
```
Server is Online!
Players: 25/100
Gamemode: RolePlay

Online Players:
Player1 (1250), Player2 (980), Player3 (750)...
```
- Server is running
- Players online
- Shows up to 30 player names

## Testing

Test server connectivity before enabling tracker:

```bash
node scripts/test-samp-query.js <server_ip> [port]
```

**Example:**
```bash
node scripts/test-samp-query.js 92.63.96.220 7777
```

**Output:**
```
🔍 Testing SAMP Query...
Server: 92.63.96.220:7777

📡 Querying server info...

✅ Server Info:
   Hostname: [RUS] RolePlay Server
   Players: 15/100
   Gamemode: RolePlay v1.2
   Language: Russian
   Password: No

📡 Querying player list...

✅ Online Players (15):
   - Ivanov_Ivan (ID: 0, Score: 1250, Ping: 45ms)
   - Petrov_Petr (ID: 1, Score: 980, Ping: 62ms)
   ...

✅ Query successful!
```

## Database

Tracker configuration is stored in `samp_trackers` table:

```sql
CREATE TABLE samp_trackers (
  guild_id TEXT PRIMARY KEY,
  server_ip TEXT NOT NULL,
  server_port INTEGER DEFAULT 7777,
  channel_id TEXT NOT NULL,
  message_id TEXT,
  enabled INTEGER DEFAULT 1,
  created_at TEXT
)
```

## Permissions Required

- **Bot Permissions:**
  - View Channel
  - Send Messages
  - Embed Links
  - Read Message History

- **User Permissions:**
  - Server Owner only (for security)

## Troubleshooting

### Server not responding

**Possible causes:**
1. Server is offline
2. Server has query disabled
3. Firewall blocking UDP port
4. Wrong IP/port

**Solution:**
- Test with `test-samp-query.js`
- Verify server IP and port
- Check server `server.cfg` has `query 1`
- Ensure UDP port is accessible

### Tracker not updating

**Possible causes:**
1. Bot restarted
2. Channel deleted
3. Bot lacks permissions

**Solution:**
- Run `/sampstatus status` to check
- Restart tracker with `/sampstatus start`
- Verify bot permissions

### Player list not showing

**Possible causes:**
1. Server doesn't support detailed query
2. Query packet malformed

**Note:** Some servers only support basic info query. The tracker will still show player count but may not show individual names.

## Examples

### Basic Setup
```
/sampstatus start ip:92.63.96.220 channel:#server-status
```

### Custom Port
```
/sampstatus start ip:192.168.1.100 port:7778 channel:#samp-1
```

### Multiple Servers
Each guild can track one server. For multiple servers, use different Discord servers (guilds).

## Comparison with Minecraft Version

| Feature | Minecraft Bot | SA-MP Tracker |
|---------|--------------|---------------|
| Protocol | mcstatus (TCP) | SA-MP query (UDP) |
| Server Icon | ✅ Yes | ❌ No (SA-MP has no icons) |
| Player List | ✅ Yes | ✅ Yes (if supported) |
| Query Method | Java Status + Query | SA-MP Protocol |
| Update Interval | 30s | 30s |
| Offline Detection | ✅ Yes | ✅ Yes |
| Player Scores | ❌ No | ✅ Yes |

## Advanced Configuration

### Change Update Interval

Edit `src/features/samp-status.js`:

```javascript
// Line ~30
this.updateInterval = setInterval(() => {
  this.updateStatus();
}, 30000); // Change this value (in milliseconds)
```

### Customize Embed Colors

Edit `src/features/samp-status.js` in `createStatusEmbed()`:

```javascript
.setColor(0xFF0000)  // Red for offline
.setColor(0x800080)  // Purple for empty
.setColor(0x00FF00)  // Green for active
```

## Future Enhancements

Potential features:
- [ ] Player join/leave notifications
- [ ] Server restart alerts
- [ ] Historical player count graphs
- [ ] Multiple server tracking per guild
- [ ] Server rules/ping query
- [ ] Player stats tracking

## Credits

Based on the Minecraft server status bot by the original developer.

Adapted for SA-MP by JepsenCloud Bot Team.

Version: 29.12.2025-1
