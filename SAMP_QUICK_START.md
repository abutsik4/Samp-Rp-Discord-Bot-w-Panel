# SAMP Voice Channel Status - Quick Start

## ✅ Voice Channel Player Counter - Ready!

Your bot now updates **voice channel names** to show player counts in real-time!

## Setup (For 3 Servers)

### Step 1: Create Voice Channels
In Discord, create 3 voice channels (or use existing ones):
```
📁 SAMP SERVERS
  🎮 Server #1
  🎮 Server #2
  🎮 Server #3
```

### Step 2: Add Each Server
Run these commands (replace with your actual IPs):

```
/sampstatus add server_id:server1 server_name:Samp-Rp #1 ip:YOUR_IP_1 port:7777 channel:@Server-#1

/sampstatus add server_id:server2 server_name:Samp-Rp #2 ip:YOUR_IP_2 port:7777 channel:@Server-#2

/sampstatus add server_id:server3 server_name:Samp-Rp #3 ip:YOUR_IP_3 port:7777 channel:@Server-#3
```

### Step 3: Done!
Channel names will automatically update every 2 minutes:
```
🎮 Samp-Rp #1 [45/100]
🎮 Samp-Rp #2 [32/100]
🎮 Samp-Rp #3 [OFFLINE]
```

## Commands

### Add Server
```
/sampstatus add 
  server_id: server1         (unique ID)
  server_name: Samp-Rp #1    (display name)
  ip: 92.63.96.220           (server IP)
  port: 7777                 (optional, default 7777)
  channel: @Voice-Channel    (select voice channel)
  emoji: 🎮                  (optional, default 🎮)
```

### List All Servers
```
/sampstatus list
```

### Remove Server
```
/sampstatus remove server_id:server1
```

### Stop All Trackers
```
/sampstatus stop
```

### Start All Trackers
```
/sampstatus start
```

## Example Setup

```
/sampstatus add server_id:rp1 server_name:RolePlay #1 ip:92.63.96.220 port:7777 channel:@RP-Server-1

/sampstatus add server_id:rp2 server_name:RolePlay #2 ip:92.63.96.221 port:7777 channel:@RP-Server-2

/sampstatus add server_id:dm server_name:DeathMatch ip:92.63.96.222 port:7778 channel:@DM-Server emoji:💀
```

## How It Works

- ✅ Updates voice channel names every **2 minutes**
- ✅ Shows format: `🎮 Server Name [ONLINE_PLAYERS/MAX_PLAYERS]`
- ✅ Shows `[OFFLINE]` when server is down
- ✅ Survives bot restarts (saved in database)
- ✅ Respects Discord rate limits (2 name changes per 10 minutes per channel)

## Test Your Server

Before adding, test if your server responds:

```bash
node scripts/test-samp-query.js YOUR_IP 7777
```

## Troubleshooting

**Channel not updating?**
- Wait 2-5 minutes for first update
- Check server is responding: `node scripts/test-samp-query.js IP PORT`
- Verify bot has permission to "Manage Channels"

**Rate limit errors?**
- Normal! Discord limits 2 name changes per 10 minutes
- Bot updates every 2 minutes (safe limit)

**Need different emoji?**
```
/sampstatus add ... emoji:🔫
/sampstatus add ... emoji:🏎️
/sampstatus add ... emoji:⚡
```

## Requirements

✅ Bot needs "Manage Channels" permission  
✅ SAMP server must have `query 1` in server.cfg  
✅ Server port must be accessible (UDP, not blocked)

That's it! Your voice channels will now show live player counts! 🎮

