#!/usr/bin/env python3
"""Phase D: D6 (empire_color) + D8 (protection_racket) patch script."""
import pathlib, sys, re

SE = pathlib.Path("/opt/jepsencloud-bot/src/features/samp-extended.js")
SCH = pathlib.Path("/opt/jepsencloud-bot/src/features/schema.js")
SCHE = pathlib.Path("/opt/jepsencloud-bot/src/bot/schedulers.js")

if not SE.exists(): print("ERROR: samp-extended.js not found"); sys.exit(1)
if not SCH.exists(): print("ERROR: schema.js not found"); sys.exit(1)
if not SCHE.exists(): print("ERROR: schedulers.js not found"); sys.exit(1)

content = SE.read_text()

# ── 1. Add setcolor subcommand to SlashCommandBuilder ──────────────────
old_gang_builder_end = '''      .addSubcommand(s => s.setName("info").setDescription("Инфо о банде"))
      .addSubcommand(s => s.setName("top").setDescription("Топ банд")),'''
new_gang_builder_end = '''      .addSubcommand(s => s.setName("info").setDescription("Инфо о банде"))
      .addSubcommand(s => s.setName("top").setDescription("Топ банд"))
      .addSubcommand(s => s.setName("setcolor").setDescription("Задать цвет банды (ур. 7+)")
        .addStringOption(o => o.setName("hex").setDescription("HEX цвет, например #e3b341").setRequired(true))),'''
if old_gang_builder_end not in content:
    print("ERROR: could not find gang builder end"); sys.exit(1)
content = content.replace(old_gang_builder_end, new_gang_builder_end, 1)

# ── 2. Add setcolor handler in handleGangCommand ───────────────────────
old_top_end = '''  } else if (sub === "top") {'''
new_top_end = '''  } else if (sub === "setcolor") {
    const userId = interaction.user.id;
    const member = await dbGet(db, "SELECT gm.gang_id, gm.role, g.name, g.tag, g.treasury FROM samp_gang_members gm JOIN samp_gangs g ON g.id = gm.gang_id WHERE gm.user_id = ?", [userId]);
    if (!member || member.role !== "leader") { await interaction.reply({ content: "Только лидер может менять цвет.", ephemeral: true }); return; }
    const evo = await dbGet(db, "SELECT xp FROM samp_gang_evolution WHERE gang_id = ?", [member.gang_id]);
    const levelInfo = getGangLevelByXp(Number(evo?.xp || 0));
    if (levelInfo.level < 7) { await interaction.reply({ content: "Цвет доступен только банде уровня **Империя (7)**.", ephemeral: true }); return; }
    const hexRaw = String(interaction.options.getString("hex", true)).trim();
    const hex = hexRaw.startsWith("#") ? hexRaw : "#" + hexRaw;
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) { await interaction.reply({ content: "Неверный HEX. Пример: **#e3b341**", ephemeral: true }); return; }
    await dbRun(db, "UPDATE samp_gang_evolution SET color = ? WHERE gang_id = ?", [hex, member.gang_id]);
    await interaction.reply(`🎨 Цвет банды **[${member.tag}] ${member.name}** обновлён на **${hex}**.`);

  } else if (sub === "top") {'''
if old_top_end not in content:
    print("ERROR: could not find top handler start"); sys.exit(1)
content = content.replace(old_top_end, new_top_end, 1)

# ── 3. Update listGangTerritories SQL to LEFT JOIN color ───────────────
old_sql = '''    `SELECT t.district_id, t.gang_id, t.pressure, t.claimed_at, t.updated_at, g.name AS gang_name, g.tag AS gang_tag
     FROM samp_gang_territories t
     LEFT JOIN samp_gangs g ON g.id = t.gang_id`,'''
new_sql = '''    `SELECT t.district_id, t.gang_id, t.pressure, t.claimed_at, t.updated_at, g.name AS gang_name, g.tag AS gang_tag, COALESCE(e.color, '#30363d') AS gang_color
     FROM samp_gang_territories t
     LEFT JOIN samp_gangs g ON g.id = t.gang_id
     LEFT JOIN samp_gang_evolution e ON e.gang_id = t.gang_id`,'''
if old_sql not in content:
    print("ERROR: could not find listGangTerritories SQL"); sys.exit(1)
content = content.replace(old_sql, new_sql, 1)

# ── 4. Propagate color through listGangTerritories ─────────────────────
old_map = '''      gang_id: control?.gang_id || null,
      gang_name: control?.gang_name || null,
      gang_tag: control?.gang_tag || null,
      pressure: control?.pressure || 0,'''
new_map = '''      gang_id: control?.gang_id || null,
      gang_name: control?.gang_name || null,
      gang_tag: control?.gang_tag || null,
      gang_color: control?.gang_color || '#30363d',
      pressure: control?.pressure || 0,'''
if old_map not in content:
    print("ERROR: could not find control map for territories"); sys.exit(1)
content = content.replace(old_map, new_map, 1)

SE.write_text(content)
print("[OK] patched samp-extended.js")

# ── 5. Add color column to samp_gang_evolution in schema.js ────────────
sch = SCH.read_text()
old_evo = '''CREATE TABLE IF NOT EXISTS samp_gang_evolution (
      gang_id INTEGER PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      legacy_stars INTEGER NOT NULL DEFAULT 0,
      total_territories_captured INTEGER NOT NULL DEFAULT 0,
      total_heists_won INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (gang_id) REFERENCES samp_gangs(id) ON DELETE CASCADE
    );'''
new_evo = '''CREATE TABLE IF NOT EXISTS samp_gang_evolution (
      gang_id INTEGER PRIMARY KEY,
      level INTEGER NOT NULL DEFAULT 1,
      xp INTEGER NOT NULL DEFAULT 0,
      legacy_stars INTEGER NOT NULL DEFAULT 0,
      total_territories_captured INTEGER NOT NULL DEFAULT 0,
      total_heists_won INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (gang_id) REFERENCES samp_gangs(id) ON DELETE CASCADE
    );'''
if old_evo not in sch:
    print("ERROR: could not find samp_gang_evolution schema"); sys.exit(1)
sch = sch.replace(old_evo, new_evo, 1)

# Also make sure the ALTER TABLE is added for existing tables
# If the table already exists, we need to safely add the column
if "IF NOT EXISTS" in old_evo:
    # Add column via ALTER TABLE if not exists (SQLite doesn't have IF NOT EXISTS on ALTER)
    # We will add a simple migration block after the schema def
    mig_block = '''
    // Ensure color column exists in samp_gang_evolution (migration)
    try { await dbRun(db, "ALTER TABLE samp_gang_evolution ADD COLUMN color TEXT"); } catch (e) { /* already exists */ }
'''
    # Find the end of bootstrap schema init
    if "await initFeatureTables" in sch:
        sch = sch.replace("await initFeatureTables", mig_block + "    await initFeatureTables", 1)
        print("[OK] added migration block for color column")

SCH.write_text(sch)
print("[OK] patched schema.js")

# ── 6. Patch schedulers.js — add protection_racket tick ────────────────
sche = SCHE.read_text()

# Add import for getGangLevelByXp at top
old_imports = '''const { runStockTick, runCrewSalaryCycle } = require("../features/samp-stocks-engine");'''
new_imports = '''const { runStockTick, runCrewSalaryCycle } = require("../features/samp-stocks-engine");
const { getGangLevelByXp } = require("../features/constants/gang-evolution");'''
if old_imports not in sche:
    print("ERROR: could not find stock engine import in schedulers.js"); sys.exit(1)
sche = sche.replace(old_imports, new_imports, 1)

# Find location right after scheduleGangTerritoryDecay(); and before // ── Register guild commands
old_decay = '''  scheduleGangTerritoryDecay();
// ── Register guild commands ─────────────────────────────────────'''
new_decay = '''  scheduleGangTerritoryDecay();

  // ── Protection Racket passive income ────────────────────────────
  const scheduleProtectionRacket = () => {
    const intervalMs = 6 * 60 * 60 * 1000; // every 6 hours
    setInterval(async () => {
      try {
        await runExclusiveTask("protection-racket", async () => {
          const gangs = await dbAll(db, `SELECT g.id, g.name, g.tag, g.treasury, e.xp, COUNT(t.district_id) AS territory_count
            FROM samp_gangs g
            JOIN samp_gang_evolution e ON e.gang_id = g.id
            LEFT JOIN samp_gang_territories t ON t.gang_id = g.id
            GROUP BY g.id`);
          let totalPayout = 0;
          for (const gang of (gangs || [])) {
            const levelInfo = getGangLevelByXp(Number(gang.xp || 0));
            if (levelInfo.level < 4) continue; // protection_racket unlocks at Lv4
            const territories = Number(gang.territory_count || 0);
            if (territories === 0) continue;
            const basePerTerritory = 2_500;
            const racketIncome = Math.round(territories * basePerTerritory * (1 + levelInfo.perMemberMoneyBonus));
            await dbRun(db, "UPDATE samp_gangs SET treasury = treasury + ? WHERE id = ?", [racketIncome, gang.id]);
            totalPayout += racketIncome;
          }
          if (totalPayout > 0) {
            console.log(`[ProtectionRacket] paid out ${fmtMoney(totalPayout)} across controlled territories.`);
          }
        });
      } catch (err) { console.error("[ProtectionRacket] error:", err); }
    }, intervalMs);
  };
  scheduleProtectionRacket();

// ── Register guild commands ─────────────────────────────────────'''
if old_decay not in sche:
    print("ERROR: could not find decay insertion point in schedulers.js"); sys.exit(1)
sche = sche.replace(old_decay, new_decay, 1)

SCHE.write_text(sche)
print("[OK] patched schedulers.js")

print("\nAll patches applied successfully.")
