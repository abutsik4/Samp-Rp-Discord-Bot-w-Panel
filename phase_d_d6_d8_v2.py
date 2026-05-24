#!/usr/bin/env python3
"""Phase D: D6 (empire_color) + D8 (protection_racket) — manual patch v2."""
import pathlib, sys, re

SE = pathlib.Path("/opt/jepsencloud-bot/src/features/samp-extended.js")
SCHE = pathlib.Path("/opt/jepsencloud-bot/src/bot/schedulers.js")

if not SE.exists(): print("ERROR: samp-extended.js not found"); sys.exit(1)
if not SCHE.exists(): print("ERROR: schedulers.js not found"); sys.exit(1)

content = SE.read_text()

# ── 1. Insert setcolor subcommand before .addSubcommand(s => s.setName("info") in gang builder
pat1 = '      .addSubcommand(s => s.setName("info").setDescription("Инфо о банде"))\n      .addSubcommand(s => s.setName("top").setDescription("Топ банд")),'
rep1 = '''      .addSubcommand(s => s.setName("info").setDescription("Инфо о банде"))
      .addSubcommand(s => s.setName("top").setDescription("Топ банд"))
      .addSubcommand(s => s.setName("setcolor").setDescription("Задать цвет банды (ур. 7+)")
        .addStringOption(o => o.setName("hex").setDescription("HEX цвет, например #e3b341").setRequired(true))),'''
if pat1 not in content:
    # Try alternate variant with extra spaces?
    print("ERROR: could not find gang builder tail. Trying alternate...")
    pat1_alt = '      .addSubcommand(s => s.setName("info").setDescription("Инфо о банде"))\n      .addSubcommand(s => s.setName("top").setDescription("Топ банд")),'
    if pat1_alt not in content:
        # Dump surrounding lines for debug
        idx = content.find('.addSubcommand(s => s.setName("info")')
        if idx != -1:
            print("DEBUG near info:", repr(content[idx-50:idx+200]))
        print("FATAL: pattern not found"); sys.exit(1)
    else:
        content = content.replace(pat1_alt, rep1, 1)
else:
    content = content.replace(pat1, rep1, 1)
print("[OK] added setcolor subcommand")

# ── 2. Insert setcolor handler before sub === "top" branch ─────────────────
pat2 = '  } else if (sub === "top") {'
rep2 = '''  } else if (sub === "setcolor") {
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
if pat2 not in content:
    print("ERROR: could not find top handler start"); sys.exit(1)
content = content.replace(pat2, rep2, 1)
print("[OK] added setcolor handler")

# ── 3. Update listGangTerritories SQL ────────────────────────────────────
pat3 = '''    `SELECT t.district_id, t.gang_id, t.pressure, t.claimed_at, t.updated_at, g.name AS gang_name, g.tag AS gang_tag
     FROM samp_gang_territories t
     LEFT JOIN samp_gangs g ON g.id = t.gang_id`,'''
rep3 = '''    `SELECT t.district_id, t.gang_id, t.pressure, t.claimed_at, t.updated_at, g.name AS gang_name, g.tag AS gang_tag, COALESCE(e.color, '#30363d') AS gang_color
     FROM samp_gang_territories t
     LEFT JOIN samp_gangs g ON g.id = t.gang_id
     LEFT JOIN samp_gang_evolution e ON e.gang_id = t.gang_id`,'''
if pat3 not in content:
    print("ERROR: could not find listGangTerritories SQL"); sys.exit(1)
content = content.replace(pat3, rep3, 1)
print("[OK] updated listGangTerritories SQL")

# ── 4. Add gang_color to map ─────────────────────────────────────────────
pat4 = '''      gang_id: control?.gang_id || null,
      gang_name: control?.gang_name || null,
      gang_tag: control?.gang_tag || null,
      pressure: control?.pressure || 0,'''
rep4 = '''      gang_id: control?.gang_id || null,
      gang_name: control?.gang_name || null,
      gang_tag: control?.gang_tag || null,
      gang_color: control?.gang_color || '#30363d',
      pressure: control?.pressure || 0,'''
if pat4 not in content:
    print("ERROR: could not find control map fields"); sys.exit(1)
content = content.replace(pat4, rep4, 1)
print("[OK] added gang_color field")

SE.write_text(content)
print("[OK] wrote samp-extended.js")

# ── 5. Patch schedulers.js ──────────────────────────────────────────────
sche = SCHE.read_text()

# Add import
pat5 = 'const { runStockTick, runCrewSalaryCycle } = require("../features/samp-stocks-engine");'
rep5 = '''const { runStockTick, runCrewSalaryCycle } = require("../features/samp-stocks-engine");
const { getGangLevelByXp } = require("../features/constants/gang-evolution");'''
if pat5 not in sche:
    print("ERROR: stock engine import not found"); sys.exit(1)
sche = sche.replace(pat5, rep5, 1)
print("[OK] added getGangLevelByXp import")

# Insert protection_racket scheduler after decay block
pat6 = '  scheduleGangTerritoryDecay();\n// ── Register guild commands ─────────────────────────────────────'
rep6 = '''  scheduleGangTerritoryDecay();

  // ── Protection Racket passive income ────────────────────────────────
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
            if (levelInfo.level < 4) continue;
            const territories = Number(gang.territory_count || 0);
            if (territories === 0) continue;
            const basePerTerritory = 2_500;
            const racketIncome = Math.round(territories * basePerTerritory * (1 + levelInfo.perMemberMoneyBonus));
            await dbRun(db, "UPDATE samp_gangs SET treasury = treasury + ? WHERE id = ?", [racketIncome, gang.id]);
            totalPayout += racketIncome;
          }
          if (totalPayout > 0) {
            console.log(`[ProtectionRacket] paid out total ${totalPayout} across controlled territories.`);
          }
        });
      } catch (err) { console.error("[ProtectionRacket] error:", err); }
    }, intervalMs);
  };
  scheduleProtectionRacket();

// ── Register guild commands ─────────────────────────────────────'''
if pat6 not in sche:
    print("ERROR: decay insertion point not found"); sys.exit(1)
sche = sche.replace(pat6, rep6, 1)
print("[OK] added protection_racket scheduler")

SCHE.write_text(sche)
print("[OK] wrote schedulers.js")

print("\nAll patches applied.")
