#!/usr/bin/env node
/**
 * Gameplay Roles & Perks Setup Script
 *
 * Creates Discord roles for level tiers and badge achievements,
 * seeds default badge definitions, and configures perk rules
 * (badge/level → role auto-grant mappings).
 *
 * Run once:  node scripts/setup-gameplay-roles.js
 *
 * Requires DISCORD_TOKEN and a guild to be available.
 */

require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { dbRun, dbGet, dbAll } = require("../src/utils/db-helpers");
const { ensureBadgesTable, seedDefaultBadgeDefinitions } = require("../src/features/badges");
const { ensurePerksTables, upsertPerkRule, reconcilePerksForGuild } = require("../src/features/perks");
const { ensureLevelsTable } = require("../src/features/levels");
const { ensureWeeklyAwardsTable } = require("../src/features/weekly-awards");

// ── Role Definitions ──────────────────────────────────────────────

const LEVEL_ROLES = [
  { level: 5,  name: "🚶 Бродяга",           color: 0x95A5A6, hoist: false },
  { level: 15, name: "💚 Боец Grove Street",  color: 0x2ECC71, hoist: false },
  { level: 30, name: "👑 Авторитет",          color: 0x9B59B6, hoist: true },
  { level: 50, name: "💎 Дон",                color: 0x3498DB, hoist: true },
  { level: 76, name: "⭐ Бог San Andreas",    color: 0xFFD700, hoist: true },
];

const BADGE_ROLES = [
  { badge: "msg_5000",   name: "🏆 5К Сообщений",         color: 0xE67E22, hoist: false },
  { badge: "msg_25000",  name: "🌟 Легенда San Andreas",  color: 0xF39C12, hoist: false },
  { badge: "streak_30",  name: "🔥 Месяц на Районе",      color: 0xE74C3C, hoist: false },
  { badge: "streak_365", name: "🏅 Годовой Ветеран",      color: 0xC0392B, hoist: true },
  { badge: "recv_200",   name: "❤️ Звезда Сервера",       color: 0xE91E63, hoist: false },
  { badge: "react_500",  name: "🎭 Реакционный Маньяк",   color: 0x8E44AD, hoist: false },
];

const WEEKLY_ROLES = [
  { key: "top_chatter", name: "💬 Чемпион Недели", color: 0x1ABC9C, hoist: true },
  { key: "night_owl",   name: "🦉 Ночная Сова",   color: 0x34495E, hoist: true },
];

const CATEGORY_ID = "542712342522232862";

// ── Main Setup ────────────────────────────────────────────────────

async function main() {
  const TOKEN = process.env.DISCORD_TOKEN;
  if (!TOKEN) {
    console.error("❌ DISCORD_TOKEN not set in .env");
    process.exit(1);
  }

  // Open database
  const dbPath = process.env.STATS_DB_PATH
    ? path.resolve(process.env.STATS_DB_PATH)
    : path.join(__dirname, "..", "data", "stats.db");
  const db = new sqlite3.Database(dbPath);

  console.log("📦 Ensuring database tables...");
  await ensureBadgesTable(db);
  await ensurePerksTables(db);
  await ensureLevelsTable(db);
  await ensureWeeklyAwardsTable(db);

  // Connect Discord
  console.log("🔌 Connecting to Discord...");
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });

  await client.login(TOKEN);

  await new Promise((resolve) => {
    if (client.isReady()) return resolve();
    client.once("ready", resolve);
  });

  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  if (!guild) {
    console.error("❌ Bot is not in any guild");
    process.exit(1);
  }
  console.log(`🏠 Working with guild: ${guild.name} (${guild.id})`);

  // ── Step 1: Seed badge definitions ──
  console.log("\n━━━ Step 1: Seed Badge Definitions ━━━");
  try {
    const seeded = await seedDefaultBadgeDefinitions(db, guild.id);
    console.log(`✅ Badge definitions seeded: ${seeded} badges`);
  } catch (err) {
    console.log(`ℹ️  Badge seeding: ${err.message} (may already exist)`);
  }

  // Verify badges exist
  const badges = await dbAll(db, `SELECT badge_id, name FROM badge_definitions WHERE guild_id = ?`, [guild.id]);
  console.log(`   ${badges.length} badge definitions in database`);

  // ── Step 2: Create channel for weekly awards ──
  console.log("\n━━━ Step 2: Create Weekly Awards Channel ━━━");
  let awardsChannel = guild.channels.cache.find(
    (c) => c.name === "награды-недели" && c.parentId === CATEGORY_ID
  );
  if (!awardsChannel) {
    try {
      awardsChannel = await guild.channels.create({
        name: "награды-недели",
        parent: CATEGORY_ID,
        topic: "📊 Еженедельные награды San Andreas Awards — обновляется каждый понедельник",
      });
      console.log(`✅ Created #${awardsChannel.name} (${awardsChannel.id})`);
    } catch (err) {
      console.error(`⚠️  Failed to create channel: ${err.message}`);
    }
  } else {
    console.log(`ℹ️  Channel #${awardsChannel.name} already exists (${awardsChannel.id})`);
  }

  // ── Step 3: Create Discord roles ──
  console.log("\n━━━ Step 3: Create Discord Roles ━━━");
  const createdRoles = {};

  // Find bot's highest role position to place new roles below it
  const botMember = await guild.members.fetchMe();
  const botHighestRole = botMember.roles.highest;
  let nextPosition = Math.max(1, botHighestRole.position - 1);

  // Create level roles (lowest to highest)
  console.log("\n  Level Tier Roles:");
  for (const def of LEVEL_ROLES) {
    const existing = guild.roles.cache.find((r) => r.name === def.name);
    if (existing) {
      createdRoles[`level_${def.level}`] = existing.id;
      console.log(`  ℹ️  "${def.name}" already exists (${existing.id})`);
      continue;
    }

    try {
      const role = await guild.roles.create({
        name: def.name,
        color: def.color,
        hoist: def.hoist,
        mentionable: false,
        reason: "Gameplay setup: level tier role",
      });
      createdRoles[`level_${def.level}`] = role.id;
      console.log(`  ✅ Created "${def.name}" → ${role.id}`);
    } catch (err) {
      console.error(`  ❌ Failed to create "${def.name}": ${err.message}`);
    }
  }

  // Create badge achievement roles
  console.log("\n  Badge Achievement Roles:");
  for (const def of BADGE_ROLES) {
    const existing = guild.roles.cache.find((r) => r.name === def.name);
    if (existing) {
      createdRoles[`badge_${def.badge}`] = existing.id;
      console.log(`  ℹ️  "${def.name}" already exists (${existing.id})`);
      continue;
    }

    try {
      const role = await guild.roles.create({
        name: def.name,
        color: def.color,
        hoist: def.hoist,
        mentionable: false,
        reason: "Gameplay setup: badge achievement role",
      });
      createdRoles[`badge_${def.badge}`] = role.id;
      console.log(`  ✅ Created "${def.name}" → ${role.id}`);
    } catch (err) {
      console.error(`  ❌ Failed to create "${def.name}": ${err.message}`);
    }
  }

  // Create weekly spotlight roles
  console.log("\n  Weekly Award Roles:");
  for (const def of WEEKLY_ROLES) {
    const existing = guild.roles.cache.find((r) => r.name === def.name);
    if (existing) {
      createdRoles[`weekly_${def.key}`] = existing.id;
      console.log(`  ℹ️  "${def.name}" already exists (${existing.id})`);
      continue;
    }

    try {
      const role = await guild.roles.create({
        name: def.name,
        color: def.color,
        hoist: def.hoist,
        mentionable: true,
        reason: "Gameplay setup: weekly award spotlight role",
      });
      createdRoles[`weekly_${def.key}`] = role.id;
      console.log(`  ✅ Created "${def.name}" → ${role.id}`);
    } catch (err) {
      console.error(`  ❌ Failed to create "${def.name}": ${err.message}`);
    }
  }

  console.log(`\n  Total roles created/found: ${Object.keys(createdRoles).length}`);

  // ── Step 4: Configure perk rules ──
  console.log("\n━━━ Step 4: Configure Perk Rules ━━━");

  // Level → Role rules
  for (const def of LEVEL_ROLES) {
    const roleId = createdRoles[`level_${def.level}`];
    if (!roleId) {
      console.log(`  ⚠️  Skipping level ${def.level} rule — no role ID`);
      continue;
    }

    try {
      // Check if a matching rule already exists
      const existingRule = await dbGet(
        db,
        `SELECT id FROM perk_rules WHERE guild_id = ? AND trigger_type = 'level' AND trigger_value = ? AND action_value = ?`,
        [guild.id, String(def.level), roleId]
      );
      if (existingRule) {
        console.log(`  ℹ️  Level ${def.level} → "${def.name}" rule already exists`);
        continue;
      }

      await upsertPerkRule(db, guild.id, {
        trigger_type: "level",
        trigger_value: String(def.level),
        action_type: "grant_role",
        action_value: roleId,
        enabled: true,
      });
      console.log(`  ✅ Level ${def.level} → "${def.name}" (${roleId})`);
    } catch (err) {
      console.error(`  ❌ Failed to set rule for level ${def.level}: ${err.message}`);
    }
  }

  // Badge → Role rules
  for (const def of BADGE_ROLES) {
    const roleId = createdRoles[`badge_${def.badge}`];
    if (!roleId) {
      console.log(`  ⚠️  Skipping badge ${def.badge} rule — no role ID`);
      continue;
    }

    try {
      const existingRule = await dbGet(
        db,
        `SELECT id FROM perk_rules WHERE guild_id = ? AND trigger_type = 'badge' AND trigger_value = ? AND action_value = ?`,
        [guild.id, def.badge, roleId]
      );
      if (existingRule) {
        console.log(`  ℹ️  Badge ${def.badge} → "${def.name}" rule already exists`);
        continue;
      }

      await upsertPerkRule(db, guild.id, {
        trigger_type: "badge",
        trigger_value: def.badge,
        action_type: "grant_role",
        action_value: roleId,
        enabled: true,
      });
      console.log(`  ✅ Badge ${def.badge} → "${def.name}" (${roleId})`);
    } catch (err) {
      console.error(`  ❌ Failed to set rule for badge ${def.badge}: ${err.message}`);
    }
  }

  // Verify all rules
  const rules = await dbAll(
    db,
    `SELECT trigger_type, trigger_value, action_value, enabled FROM perk_rules WHERE guild_id = ?`,
    [guild.id]
  );
  console.log(`\n  Total perk rules: ${rules.length}`);

  // ── Step 5: Reconcile perks for existing users ──
  console.log("\n━━━ Step 5: Reconcile Perks for Existing Users ━━━");
  try {
    const result = await reconcilePerksForGuild({ db, guild, limit: 200 });
    console.log(`  ✅ Reconciliation complete:`);
    console.log(`     Users processed: ${result.usersProcessed}`);
    console.log(`     Roles granted:   ${result.rolesGranted}`);
    console.log(`     Errors:          ${result.errors}`);
  } catch (err) {
    console.error(`  ❌ Reconciliation failed: ${err.message}`);
  }

  // ── Summary ──
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ GAMEPLAY SETUP COMPLETE\n");
  console.log("Add these to your .env file:\n");

  if (awardsChannel) {
    console.log(`WEEKLY_AWARDS_CHANNEL_ID=${awardsChannel.id}`);
  }
  if (createdRoles.weekly_top_chatter) {
    console.log(`WEEKLY_TOP_CHATTER_ROLE_ID=${createdRoles.weekly_top_chatter}`);
  }
  if (createdRoles.weekly_night_owl) {
    console.log(`WEEKLY_NIGHT_OWL_ROLE_ID=${createdRoles.weekly_night_owl}`);
  }

  console.log("\nAll role IDs created:");
  for (const [key, id] of Object.entries(createdRoles)) {
    console.log(`  ${key} = ${id}`);
  }

  console.log("\n⚠️  IMPORTANT: Verify the bot's role is positioned ABOVE all");
  console.log("   gameplay roles in Server Settings → Roles. Otherwise role");
  console.log("   assignment will silently fail.\n");

  // Cleanup
  client.destroy();
  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
