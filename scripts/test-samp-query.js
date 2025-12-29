#!/usr/bin/env node

/**
 * Test SAMP Server Query
 * Usage: node scripts/test-samp-query.js <server_ip> [port]
 */

const { SAMPQuery } = require("../src/features/samp-status");

const serverIp = process.argv[2] || "127.0.0.1";
const serverPort = parseInt(process.argv[3]) || 7777;

async function testQuery() {
  console.log(`\n🔍 Testing SAMP Query...`);
  console.log(`Server: ${serverIp}:${serverPort}\n`);

  const query = new SAMPQuery(serverIp, serverPort);

  try {
    console.log("📡 Querying server info...");
    const info = await query.getInfo();
    
    console.log("\n✅ Server Info:");
    console.log(`   Hostname: ${info.hostname}`);
    console.log(`   Players: ${info.players}/${info.maxPlayers}`);
    console.log(`   Gamemode: ${info.gamemode}`);
    console.log(`   Language: ${info.language}`);
    console.log(`   Password: ${info.password ? "Yes" : "No"}`);

    if (info.players > 0) {
      console.log("\n📡 Querying player list...");
      try {
        const players = await query.getPlayers();
        
        console.log(`\n✅ Online Players (${players.length}):`);
        players.slice(0, 10).forEach(p => {
          console.log(`   - ${p.name} (ID: ${p.id}, Score: ${p.score}, Ping: ${p.ping}ms)`);
        });

        if (players.length > 10) {
          console.log(`   ... and ${players.length - 10} more`);
        }
      } catch (error) {
        console.log(`\n⚠️  Player query failed: ${error.message}`);
        console.log(`   (Server may not support detailed player query)`);
      }
    }

    console.log("\n✅ Query successful!\n");
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ Query failed: ${error.message}\n`);
    console.error("Possible reasons:");
    console.error("  - Server is offline");
    console.error("  - Invalid IP/port");
    console.error("  - Firewall blocking UDP");
    console.error("  - Server query is disabled\n");
    process.exit(1);
  }
}

testQuery();
