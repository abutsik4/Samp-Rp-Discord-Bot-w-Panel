/**
 * SAMP Server Status Tracker
 * Queries SA-MP servers and updates Discord embed with server status
 * Version: 29.12.2025-1
 */

const dgram = require("dgram");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

class SAMPQuery {
  constructor(host, port = 7777) {
    this.host = host;
    this.port = port;
    this.timeout = 5000; // 5 second timeout
  }

  /**
   * Create SAMP query packet
   * @param {string} opcode - Query opcode (i, r, c, d, x, p)
   */
  createPacket(opcode) {
    const ip = this.host.split(".").map(Number);
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

  /**
   * Send query and receive response
   */
  async query(opcode) {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      const packet = this.createPacket(opcode);
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

      timeoutHandle = setTimeout(() => {
        socket.close();
        reject(new Error("Query timeout"));
      }, this.timeout);

      socket.send(packet, 0, packet.length, this.port, this.host);
    });
  }

  /**
   * Parse server info (opcode 'i')
   */
  parseInfo(buffer) {
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

    // Hostname length (4 bytes, little endian)
    const hostnameLen = buffer.readUInt32LE(offset);
    offset += 4;

    // Hostname
    const hostname = buffer.toString("utf8", offset, offset + hostnameLen);
    offset += hostnameLen;

    // Gamemode length (4 bytes)
    const gamemodeLen = buffer.readUInt32LE(offset);
    offset += 4;

    // Gamemode
    const gamemode = buffer.toString("utf8", offset, offset + gamemodeLen);
    offset += gamemodeLen;

    // Language length (4 bytes)
    const languageLen = buffer.readUInt32LE(offset);
    offset += 4;

    // Language
    const language = buffer.toString("utf8", offset, offset + languageLen);

    return {
      password,
      players,
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
    this.config = config;
    this.updateInterval = null;
    this.isRunning = false;
    this.lastUpdate = 0; // Track last update time for rate limiting
  }

  /**
   * Update voice channel name with player count
   */
  async updateChannelName() {
    if (!this.isRunning) return;

    try {
      // Discord rate limit: 2 name changes per 10 minutes per channel
      // So we update every 5 minutes to be safe
      const now = Date.now();
      if (now - this.lastUpdate < 5 * 60 * 1000) {
        return; // Too soon, skip this update
      }

      const channel = await this.client.channels.fetch(this.config.channelId);
      if (!channel) {
        console.error(`⚠️ [SAMP] Channel ${this.config.channelId} not found`);
        return;
      }

      let playerCount = 0;
      let maxPlayers = 0;
      let isOnline = false;

      // Query SAMP server
      try {
        const query = new SAMPQuery(this.config.serverIp, this.config.serverPort || 7777);
        const status = await query.getInfo();
        
        playerCount = status.players;
        maxPlayers = status.maxPlayers;
        isOnline = true;
      } catch (error) {
        // Server offline
        isOnline = false;
      }

      // Generate channel name
      const emoji = this.config.emoji || "🎮";
      const serverName = this.config.serverName || `Server`;
      
      let newName;
      if (isOnline) {
        newName = `${emoji} ${serverName} [${playerCount}/${maxPlayers}]`;
      } else {
        newName = `${emoji} ${serverName} [OFFLINE]`;
      }

      // Only update if name actually changed
      if (channel.name !== newName) {
        await channel.setName(newName);
        this.lastUpdate = now;
        console.log(`[SAMP] Updated channel: ${newName}`);
      }

    } catch (error) {
      // Don't log rate limit errors too much
      if (error.code !== 50013 && error.code !== 50035) {
        console.error("❌ [SAMP] Error updating channel name:", error.message);
      }
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
    console.log(`✅ [SAMP] Starting channel tracker for ${this.config.serverIp}:${this.config.serverPort || 7777}`);

    // Initial update
    await this.updateChannelName();

    // Update every 2 minutes (Discord allows 2 changes per 10 minutes)
    this.updateInterval = setInterval(() => {
      this.updateChannelName();
    }, 2 * 60 * 1000);
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

    console.log("🛑 [SAMP] Status tracker stopped");
  }
}

module.exports = { SAMPQuery, SAMPStatusTracker };
