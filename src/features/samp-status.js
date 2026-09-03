/**
 * SAMP Server Status Tracker
 * Queries SA-MP servers and updates Discord embed with server status
 * Version: 29.12.2025-1
 */

const dgram = require("dgram");
const dns = require("dns");
const net = require("net");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

class SAMPQuery {
  constructor(host, port = 7777) {
    this.host = host;
    this.port = port;
    this.timeout = 5000; // 5 second timeout

    this._resolvedIp = null;
    this._resolvedAt = 0;
  }

  /**
   * Create SAMP query packet
   * @param {string} opcode - Query opcode (i, r, c, d, x, p)
   */
  createPacket(opcode, ipString) {
    const ip = String(ipString || this.host).split(".").map(Number);
    const portLow = this.port & 0xFF;
    const portHigh = (this.port >> 8) & 0xFF;

    const packet = Buffer.alloc(11);
    packet.write("SAMP", 0); // Header
    packet[4] = ip[0];
    packet[5] = ip[1];
    packet[6] = ip[2];
    packet[7] = ip[3];
    packet[8] = portLow;
    packet[9] = portHigh;
    packet[10] = opcode.charCodeAt(0);

    return packet;
  }

  async resolveHostIp() {
    const host = String(this.host || "").trim();
    if (net.isIPv4(host)) return host;

    const now = Date.now();
    // Cache DNS lookup briefly to avoid repeated lookups in polling loops
    if (this._resolvedIp && now - this._resolvedAt < 5 * 60 * 1000) return this._resolvedIp;

    const { address } = await dns.promises.lookup(host, { family: 4 });
    this._resolvedIp = address;
    this._resolvedAt = now;
    return address;
  }

  /**
   * Send query and receive response
   */
  async query(opcode) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      let packet;
      let timeoutHandle;

      socket.on("message", (msg) => {
        clearTimeout(timeoutHandle);
        socket.close();
        resolve(msg);
      });

      socket.on("error", (err) => {
        clearTimeout(timeoutHandle);
        socket.close();
        reject(err);
      });

      const onTimeout = () => {
        socket.close();
        reject(new Error("Query timeout"));
      };
      timeoutHandle = setTimeout(onTimeout, this.timeout);

      (async () => {
        try {
          const ip = await this.resolveHostIp();
          packet = this.createPacket(opcode, ip);
          socket.send(packet, 0, packet.length, this.port, ip);
        } catch (e) {
          clearTimeout(timeoutHandle);
          socket.close();
          reject(e);
        }
      })();
    });
  }

  /**
   * Parse server info (opcode 'i')
   */
  parseInfo(buffer) {
    // Validate minimum buffer length (header + basic info)
    if (!buffer || buffer.length < 17) {
      throw new Error(`Invalid response buffer length: ${buffer?.length || 0}`);
    }

    // Validate SAMP header
    const header = buffer.toString('ascii', 0, 4);
    if (header !== 'SAMP') {
      throw new Error(`Invalid SAMP header: ${header}`);
    }

    let offset = 11; // Skip header

    // Password protected (1 byte)
    const password = buffer[offset] === 1;
    offset++;

    // Players (2 bytes, little endian)
    const players = buffer.readUInt16LE(offset);
    offset += 2;

    // Max players (2 bytes, little endian)
    const maxPlayers = buffer.readUInt16LE(offset);
    offset += 2;

    // Validate player counts are reasonable (some servers exceed 1000)
    if (players < 0 || players > 5000 || maxPlayers < 0 || maxPlayers > 5000) {
      throw new Error(`Invalid player counts: ${players}/${maxPlayers}`);
    }
    if (players > maxPlayers) {
      // Some servers report this incorrectly, cap it
      console.warn(`[SAMP] Player count ${players} exceeds max ${maxPlayers}, capping`);
    }

    // Hostname length (4 bytes, little endian)
    const hostnameLen = buffer.readUInt32LE(offset);
    if (hostnameLen > 256 || offset + 4 + hostnameLen > buffer.length) {
      throw new Error(`Invalid hostname length: ${hostnameLen}`);
    }
    offset += 4;

    // Hostname
    const hostname = buffer.toString("utf8", offset, offset + hostnameLen);
    offset += hostnameLen;

    // Gamemode length (4 bytes)
    const gamemodeLen = buffer.readUInt32LE(offset);
    if (gamemodeLen > 256 || offset + 4 + gamemodeLen > buffer.length) {
      throw new Error(`Invalid gamemode length: ${gamemodeLen}`);
    }
    offset += 4;

    // Gamemode
    const gamemode = buffer.toString("utf8", offset, offset + gamemodeLen);
    offset += gamemodeLen;

    // Language length (4 bytes)
    const languageLen = buffer.readUInt32LE(offset);
    if (languageLen > 256 || offset + 4 + languageLen > buffer.length) {
      throw new Error(`Invalid language length: ${languageLen}`);
    }
    offset += 4;

    // Language
    const language = buffer.toString("utf8", offset, offset + languageLen);

    return {
      password,
      players: Math.min(players, maxPlayers),
      maxPlayers,
      hostname,
      gamemode,
      language,
    };
  }

  /**
   * Parse detailed player list (opcode 'd')
   */
  parseDetailedPlayers(buffer) {
    let offset = 11; // Skip header

    // Player count (2 bytes)
    const playerCount = buffer.readUInt16LE(offset);
    offset += 2;

    const players = [];

    for (let i = 0; i < playerCount; i++) {
      try {
        // Player ID (1 byte)
        const id = buffer[offset];
        offset++;

        // Name length (1 byte)
        const nameLen = buffer[offset];
        offset++;

        // Name
        const name = buffer.toString("utf8", offset, offset + nameLen);
        offset += nameLen;

        // Score (4 bytes, little endian)
        const score = buffer.readInt32LE(offset);
        offset += 4;

        // Ping (4 bytes, little endian)
        const ping = buffer.readUInt32LE(offset);
        offset += 4;

        players.push({ id, name, score, ping });
      } catch (e) {
        break; // Malformed packet, stop parsing
      }
    }

    return players;
  }

  /**
   * Get server info
   */
  async getInfo() {
    try {
      const response = await this.query("i");
      return this.parseInfo(response);
    } catch (error) {
      throw new Error(`Failed to query server: ${error.message}`);
    }
  }

  /**
   * Get detailed player list
   */
  async getPlayers() {
    try {
      const response = await this.query("d");
      return this.parseDetailedPlayers(response);
    } catch (error) {
      throw new Error(`Failed to query players: ${error.message}`);
    }
  }

  /**
   * Get complete server status
   */
  async getStatus() {
    const info = await this.getInfo();
    let players = [];

    if (info.players > 0) {
      try {
        players = await this.getPlayers();
      } catch (e) {
        // Player query failed, continue with basic info
      }
    }

    return {
      ...info,
      playerList: players,
    };
  }
}

class SAMPStatusTracker {
  constructor(client, config) {
    this.client = client;
    this.config = { ...config };
    this.updateInterval = null;
    this.isRunning = false;
    this.lastChannelUpdate = 0; // Track last Discord channel rename time for rate limiting
    // Discord allows only a small number of channel renames per 10 minutes.
    // Per-tracker override: config.rename_cooldown_ms (default 2 minutes).
    const renameCooldown = Number(config?.rename_cooldown_ms) || Number(config?.minRenameIntervalMs) || 2 * 60 * 1000;
    this.minRenameIntervalMs = Math.max(60 * 1000, renameCooldown);
    this.nextAllowedRenameAt = 0;
    this.lastSkipLogAt = 0;
    this._updateInFlight = false;
    this._renameRetryTimer = null;  // Scheduled retry when rename skipped due to cooldown
    this.consecutiveFailures = 0;
    this.lastStatus = null; // Cache last status for comparison
  }

  /**
   * Per-tracker poll interval (ms). Configurable via config.poll_interval_ms.
   * Default: 2 minutes. Min: 10s, Max: 1h.
   */
  _getPollIntervalMs() {
    const v = Number(this.config?.poll_interval_ms);
    if (!Number.isFinite(v) || v <= 0) return 2 * 60 * 1000;
    return Math.max(10 * 1000, Math.min(60 * 60 * 1000, v));
  }

  /**
   * Build the channel name from a custom format template, or fall back to defaults.
   * Template tokens: {emoji} {name} {players} {max} {online} {status}
   * If no template, defaults to: "<emoji> <name> [<players>/<max>]" or "<emoji> <name> [<offlineText>]"
   */
  _buildChannelName({ emoji, serverName, playerCount, maxPlayers, isOnline }) {
    const offlineText = this.config?.custom_offline_text || "ОФФЛАЙН";
    const onlineText = this.config?.custom_online_text || null;
    const fmt = this.config?.name_format;

    if (fmt && typeof fmt === "string" && fmt.trim().length > 0) {
      const statusText = isOnline
        ? (onlineText && onlineText.trim().length > 0 ? onlineText : `${playerCount}/${maxPlayers}`)
        : offlineText;
      return fmt
        .replace(/\{emoji\}/g, emoji)
        .replace(/\{name\}/g, serverName)
        .replace(/\{players\}/g, String(playerCount))
        .replace(/\{max\}/g, String(maxPlayers))
        .replace(/\{status\}/g, statusText)
        .replace(/\{online\}/g, isOnline ? (onlineText || "online") : offlineText);
    }

    if (isOnline) {
      if (onlineText && onlineText.trim().length > 0) {
        return `${emoji} ${serverName} [${onlineText}]`;
      }
      return `${emoji} ${serverName} [${playerCount}/${maxPlayers}]`;
    }
    return `${emoji} ${serverName} [${offlineText}]`;
  }

  /**
   * Hot-update tracker config (used by settings PUT endpoint).
   * Restarts the poll interval if running and the value changed.
   */
  setConfig(newConfig) {
    if (!newConfig || typeof newConfig !== "object") return;
    this.config = { ...this.config, ...newConfig };
    if (typeof newConfig.rename_cooldown_ms === "number" || typeof newConfig.minRenameIntervalMs === "number") {
      const cooldown = Number(newConfig.rename_cooldown_ms) || Number(newConfig.minRenameIntervalMs) || 2 * 60 * 1000;
      this.minRenameIntervalMs = Math.max(60 * 1000, cooldown);
    }
    if (this.isRunning && this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = setInterval(() => {
        this.updateChannelName();
      }, this._getPollIntervalMs());
      console.log(`[SAMP] Tracker config updated, poll interval reset to ${Math.round(this._getPollIntervalMs() / 1000)}s`);
    }
  }

  /**
   * Update voice channel name with player count
   */
  async updateChannelName() {
    if (!this.isRunning) return;

    // Prevent overlapping updates from the same tracker instance.
    if (this._updateInFlight) return;
    this._updateInFlight = true;

    const serverAddr = `${this.config.serverIp}:${this.config.serverPort || 7777}`;

    try {
      console.log(`[SAMP] Fetching channel ${this.config.channelId} for ${serverAddr}...`);
      const channel = await this.client.channels.fetch(this.config.channelId);
      if (!channel) {
        console.error(`⚠️ [SAMP] Channel ${this.config.channelId} not found for ${serverAddr}`);
        return;
      }
      console.log(`[SAMP] Channel fetched: "${channel.name}" for ${serverAddr}`);

      let playerCount = 0;
      let maxPlayers = 0;
      let isOnline = false;

      // Query SAMP server with retry
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const query = new SAMPQuery(this.config.serverIp, this.config.serverPort || 7777);
          const status = await query.getInfo();
          
          playerCount = status.players;
          maxPlayers = status.maxPlayers;
          isOnline = true;
          this.consecutiveFailures = 0;
          break;
        } catch (error) {
          if (attempt === 2) {
            this.consecutiveFailures++;
            // Log failures but not too frequently
            if (this.consecutiveFailures <= 3 || this.consecutiveFailures % 10 === 0) {
              console.warn(`⚠️ [SAMP] Query failed for ${serverAddr}: ${error.message} (failures: ${this.consecutiveFailures})`);
            }
            isOnline = false;
          } else {
            // Wait 1 second before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      // Generate channel name
      const emoji = this.config.emoji || "🎮";
      const serverName = this.config.serverName || `Server`;

      const newName = this._buildChannelName({
        emoji,
        serverName,
        playerCount,
        maxPlayers,
        isOnline,
      });

      console.log(`[SAMP] ${serverAddr}: old="${channel.name}" new="${newName}" match=${channel.name === newName}`);

      // Always keep lastStatus up to date (even if we skip rename)
      const prev = this.lastStatus;
      this.lastStatus = { isOnline, playerCount, maxPlayers };

      // Only update Discord channel if name actually changed
      if (channel.name === newName) return;

      const now = Date.now();
      const statusChanged = !prev || prev.isOnline !== isOnline;
      const withinCooldown = this.lastChannelUpdate && (now - this.lastChannelUpdate) < this.minRenameIntervalMs;

      // Respect a backoff window (e.g., after rate limiting)
      if (now < this.nextAllowedRenameAt && !statusChanged) {
        if (now - this.lastSkipLogAt > 10 * 60 * 1000) {
          console.warn(`[SAMP] Skipping rename for ${serverAddr} due to backoff until ${new Date(this.nextAllowedRenameAt).toISOString()}`);
          this.lastSkipLogAt = now;
        }
        // Schedule a retry when cooldown expires instead of waiting for next poll
        this._scheduleRenameRetry(this.nextAllowedRenameAt - now);
        return;
      }

      // Discord channel renames are aggressively rate limited; avoid thrashing.
      if (withinCooldown && !statusChanged) {
        if (now - this.lastSkipLogAt > 10 * 60 * 1000) {
          console.warn(`[SAMP] Skipping rename for ${serverAddr} (cooldown ${Math.round(this.minRenameIntervalMs / 60000)}m)`);
          this.lastSkipLogAt = now;
        }
        // Schedule a retry when cooldown expires
        this._scheduleRenameRetry(this.minRenameIntervalMs - (now - this.lastChannelUpdate));
        return;
      }
      
      console.log(`[SAMP] Calling setName for ${serverAddr}...`);
      try {
        await channel.setName(newName);
        this.lastChannelUpdate = Date.now();
        this.nextAllowedRenameAt = this.lastChannelUpdate + this.minRenameIntervalMs;
        console.log(`[SAMP] Updated channel for ${serverAddr}: ${newName}`);
      } catch (setNameError) {
        console.error(`[SAMP] setName error for ${serverAddr}:`, setNameError.code, setNameError.message);
        // Handle Discord rate limit (error code 50013 or rate limit headers)
        if (setNameError.code === 50013) {
          console.warn(`⚠️ [SAMP] Missing permissions for channel ${this.config.channelId}`);
        } else if (setNameError.status === 429 || setNameError.code === 429 || /rate\s*limit/i.test(setNameError.message || "")) {
          // Back off to avoid repeatedly hitting the same route limit
          this.nextAllowedRenameAt = Math.max(this.nextAllowedRenameAt, Date.now() + this.minRenameIntervalMs);
          console.warn(`⚠️ [SAMP] Discord rate limit hit for ${serverAddr}, backing off for ${Math.round(this.minRenameIntervalMs / 60000)}m`);
        } else {
          throw setNameError; // Re-throw to outer catch
        }
      }

    } catch (error) {
      // Don't log permission errors too much (50013 = Missing Permissions, 50035 = Invalid Form Body)
      if (error.code !== 50013 && error.code !== 50035) {
        console.error(`❌ [SAMP] Error updating channel for ${serverAddr}:`, error.message);
      } else if (error.code === 50013) {
        // Log permission errors occasionally
        if (this.consecutiveFailures % 10 === 0) {
          console.error(`❌ [SAMP] Missing permissions to update channel ${this.config.channelId}`);
        }
      }
    } finally {
      this._updateInFlight = false;
    }
  }

  /**
   * Start tracking
   */
  async start() {
    if (this.isRunning) {
      console.log("⚠️ [SAMP] Status tracker already running");
      return;
    }

    this.isRunning = true;
    const serverAddr = `${this.config.serverIp}:${this.config.serverPort || 7777}`;
    console.log(`✅ [SAMP] Starting channel tracker for ${serverAddr}`);

    // Initial update in background (don't block startup)
    this.updateChannelName().catch(error => {
      console.error(`❌ [SAMP] Initial update failed for ${serverAddr}: ${error.message}`);
    });

    // Update on a per-tracker interval - Discord handles rate limiting internally
    // If channel name hasn't changed, no API call is made anyway
    this.updateInterval = setInterval(() => {
      this.updateChannelName();
    }, this._getPollIntervalMs());
  }

  /**
   * Stop tracking
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this._renameRetryTimer) {
      clearTimeout(this._renameRetryTimer);
      this._renameRetryTimer = null;
    }

    const serverAddr = `${this.config.serverIp}:${this.config.serverPort || 7777}`;
    console.log(`[SAMP] Status tracker stopped for ${serverAddr}`);
  }

  /**
   * Check if tracker is enabled/running
   */
  get enabled() {
    return this.isRunning;
  }

  /**
   * Schedule a delayed rename retry after cooldown expires.
   * Prevents stale channel names when a rename was skipped.
   */
  _scheduleRenameRetry(delayMs) {
    if (this._renameRetryTimer) {
      clearTimeout(this._renameRetryTimer);
    }
    const delay = Math.max(1000, Math.min(delayMs + 500, 10 * 60 * 1000)); // 1s-10min, add 500ms buffer
    this._renameRetryTimer = setTimeout(() => {
      this._renameRetryTimer = null;
      this.updateChannelName();
    }, delay);
  }

  /**
   * Force an immediate update, bypassing rate limit (use sparingly)
   */
  async forceUpdate() {
    if (!this.isRunning) {
      console.log("⚠️ [SAMP] Cannot force update - tracker not running");
      return false;
    }
    
    // Reset rate limit timer to allow immediate update
    this.lastChannelUpdate = 0;
    this.nextAllowedRenameAt = 0;
    await this.updateChannelName();
    return true;
  }

  /**
   * Get current status without updating channel
   */
  async getStatus() {
    const query = new SAMPQuery(this.config.serverIp, this.config.serverPort || 7777);
    try {
      const status = await query.getInfo();
      return {
        online: true,
        players: status.players,
        maxPlayers: status.maxPlayers,
        hostname: status.hostname,
        gamemode: status.gamemode,
      };
    } catch (error) {
      return {
        online: false,
        error: error.message,
      };
    }
  }
}

module.exports = { SAMPQuery, SAMPStatusTracker };
