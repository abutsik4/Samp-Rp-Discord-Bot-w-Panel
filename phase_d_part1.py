#!/usr/bin/env python3
"""Phase D Part 1: XP injection, territory decay, perk wiring.
Idempotent — safe to run multiple times."""
import re
import os

EXT = "/opt/jepsencloud-bot/src/features/samp-extended.js"
PHC = "/opt/jepsencloud-bot/src/features/samp-phasec.js"
PUT = "/opt/jepsencloud-bot/src/features/phasec-utils.js"
SCH = "/opt/jepsencloud-bot/src/bot/schedulers.js"

def readf(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def writef(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)

# ─── phasec-utils.js: add incrementGangXp ───
text = readf(PUT)
if "incrementGangXp" not in text:
    insert = """

async function incrementGangXp(db, userId, amount) {
  try {
    const row = await dbGet(db, "SELECT gang_id FROM samp_gang_members WHERE user_id = ?", [String(userId)]);
    if (!row || !row.gang_id) return;
    await dbRun(db,
      `INSERT INTO samp_gang_evolution(gang_id, xp, level, updated_at)
       VALUES(?, ?, 1, datetime('now'))
       ON CONFLICT(gang_id) DO UPDATE SET xp = xp + excluded.xp, updated_at = datetime('now')`,
      [row.gang_id, amount]
    );
  } catch (_e) {}
}
"""
    # Actually dbGet is not imported in phasec-utils.js! We need to import it.
    text = text.replace(
        'const { dbRun } = require("../utils/db-helpers");',
        'const { dbRun, dbGet } = require("../utils/db-helpers");'
    )
    text = text.replace(
        'module.exports = { awardMaterialDrops };',
        'module.exports = { awardMaterialDrops, incrementGangXp };'
    )
    text = text.rstrip() + insert
    writef(PUT, text)
    print("[OK] phasec-utils.js: added incrementGangXp")
else:
    print("[SKIP] phasec-utils.js: incrementGangXp already present")

# ─── samp-extended.js: add require ───
text = readf(EXT)
if 'const { incrementGangXp } = require("./phasec-utils");' not in text:
    text = text.replace(
        'const { processStarDecay } = require("../features/wanted-stars");\n',
        'const { processStarDecay } = require("../features/wanted-stars");\nconst { incrementGangXp } = require("./phasec-utils");\n'
    )
    writef(EXT, text)
    print("[OK] samp-extended.js: added require")
else:
    print("[SKIP] samp-extended.js: require already present")

# reload after write
text = readf(EXT)

# ─── claimterritory neutral: XP + history ───
old = (
    "        );\n"
    "        summary = `🗺️ Банда **[${member.tag}] ${member.name}** взяла район **${district.name}** под контроль.\\n"
    "Давление: **${TERRITORY_CAPTURE_PRESSURE}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;\n"
)
new = (
    "        );\n"
    "        try { await incrementGangXp(db, userId, 40); } catch (_e) {}\n"
    "        try { await dbRun(db, 'INSERT INTO samp_gang_territory_history(district_id, gang_id, event, pressure) VALUES(?,?,?,?)', [districtId, member.gang_id, 'claim', TERRITORY_CAPTURE_PRESSURE]); } catch (_e) {}\n"
    "        summary = `🗺️ Банда **[${member.tag}] ${member.name}** взяла район **${district.name}** под контроль.\\n"
    "Давление: **${TERRITORY_CAPTURE_PRESSURE}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;\n"
)
if old in text:
    text = text.replace(old, new, 1)
    print("[OK] claimterritory neutral: XP + history")
else:
    print("[WARN] claimterritory neutral: block not found")

# ─── claimterritory reinforce: XP + history ───
old = (
    "        );\n"
    "        summary = `🛡️ Банда **[${member.tag}] ${member.name}** укрепила район **${district.name}**.\\n"
    "Давление: **${nextPressure}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;\n"
)
new = (
    "        );\n"
    "        try { await incrementGangXp(db, userId, 20); } catch (_e) {}\n"
    "        try { await dbRun(db, 'INSERT INTO samp_gang_territory_history(district_id, gang_id, event, pressure) VALUES(?,?,?,?)', [districtId, member.gang_id, 'reinforce', nextPressure]); } catch (_e) {}\n"
    "        summary = `🛡️ Банда **[${member.tag}] ${member.name}** укрепила район **${district.name}**.\\n"
    "Давление: **${nextPressure}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;\n"
)
if old in text:
    text = text.replace(old, new, 1)
    print("[OK] claimterritory reinforce: XP + history")
else:
    print("[WARN] claimterritory reinforce: block not found")

# ─── claimterritory takeover: XP + history ───
old = (
    "          );\n"
    "          summary = `🔥 Банда **[${member.tag}] ${member.name}** перехватила район **${district.name}**.\\n"
    "Новый контроль: **${TERRITORY_CAPTURE_PRESSURE}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;\n"
)
new = (
    "          );\n"
    "          try { await incrementGangXp(db, userId, 80); } catch (_e) {}\n"
    "          try { await dbRun(db, 'INSERT INTO samp_gang_territory_history(district_id, gang_id, event, pressure) VALUES(?,?,?,?)', [districtId, member.gang_id, 'takeover', TERRITORY_CAPTURE_PRESSURE]); } catch (_e) {}\n"
    "          summary = `🔥 Банда **[${member.tag}] ${member.name}** перехватила район **${district.name}**.\\n"
    "Новый контроль: **${TERRITORY_CAPTURE_PRESSURE}%** | Бонус бизнесам района: **+${Math.round(district.businessBuff * 100)}%**`;\n"
)
if old in text:
    text = text.replace(old, new, 1)
    print("[OK] claimterritory takeover: XP + history")
else:
    print("[WARN] claimterritory takeover: block not found")

# ─── claimterritory attack: XP + history ───
old = (
    "          const defender = current?.gang_name && current?.gang_tag\n"
    "            ? `**[${current.gang_tag}] ${current.gang_name}**`\n"
    "            : \"соперников\";\n"
    "          summary = `⚔️ Банда **[${member.tag}] ${member.name}** продавила защиту района **${district.name}**.\\n"
    "Контроль ${defender} упал до **${nextPressure}%**. Район ещё не захвачен.`;\n"
)
new = (
    "          try { await incrementGangXp(db, userId, 30); } catch (_e) {}\n"
    "          try { await dbRun(db, 'INSERT INTO samp_gang_territory_history(district_id, gang_id, event, pressure) VALUES(?,?,?,?)', [districtId, member.gang_id, 'attack', nextPressure]); } catch (_e) {}\n"
    "          const defender = current?.gang_name && current?.gang_tag\n"
    "            ? `**[${current.gang_tag}] ${current.gang_name}**`\n"
    "            : \"соперников\";\n"
    "          summary = `⚔️ Банда **[${member.tag}] ${member.name}** продавила защиту района **${district.name}**.\\n"
    "Контроль ${defender} упал до **${nextPressure}%**. Район ещё не захвачен.`;\n"
)
if old in text:
    text = text.replace(old, new, 1)
    print("[OK] claimterritory attack: XP + history")
else:
    print("[WARN] claimterritory attack: block not found")

# ─── heist success: XP ───
old = (
    '            try { const { awardMaterialDrops } = require("./phasec-utils"); await awardMaterialDrops(db, pid, "heist"); } catch (_e) {}\n'
    '          }\n'
    '        });\n'
)
new = (
    '            try { const { awardMaterialDrops } = require("./phasec-utils"); await awardMaterialDrops(db, pid, "heist"); } catch (_e) {}\n'
    '            try { const { incrementGangXp } = require("./phasec-utils"); await incrementGangXp(db, pid, 80); } catch (_e) {}\n'
    '          }\n'
    '        });\n'
)
if old in text:
    text = text.replace(old, new, 1)
    print("[OK] heist success: XP")
else:
    print("[WARN] heist success: block not found")

# ─── supportbiz: XP ───
old = (
    "      );\n"
    "    });\n"
    "\n"
    "    await interaction.reply(\n"
)
# Need to be more specific — find the supportbiz interaction.reply block
marker = "    await interaction.reply(\n      `🛡️ Банда **[${member.tag}] ${member.name}** поддержала бизнес"
if marker in text:
    text = text.replace(
        "    await interaction.reply(\n      `🛡️ Банда **[${member.tag}] ${member.name}** поддержала бизнес",
        "    try { await incrementGangXp(db, userId, 10); } catch (_e) {}\n    await interaction.reply(\n      `🛡️ Банда **[${member.tag}] ${member.name}** поддержала бизнес"
    )
    print("[OK] supportbiz: XP")
else:
    print("[WARN] supportbiz: block not found")

writef(EXT, text)

# ─── samp-phasec.js: casino_share perk ───
text = readf(PHC)
# Find casino win payout block — look for "🎉 Выигрыш" or similar
if "casino_share" not in text:
    # In handlePrestigeCasino, after win calculation add chip bonus
    old_casino = (
        "      await dbRun(db, `UPDATE samp_users SET chips = chips + ? WHERE user_id = ?`, [winChips, uid]);\n"
        "      await dbRun(db, `UPDATE samp_users SET consecutive_casino_losses = 0 WHERE user_id = ?`, [uid]);\n"
    )
    new_casino = (
        "      let bonusChips = winChips;\n"
        '      try { const gm = await dbGet(db, "SELECT gang_id FROM samp_gang_members WHERE user_id = ?", [uid]);'
        " if (gm?.gang_id) { const evo = await dbGet(db, 'SELECT * FROM samp_gang_evolution WHERE gang_id = ?', [gm.gang_id]);"
        " const lvl = getGangLevelByXp(Number(evo?.xp || 0)); if (lvl.level >= 5) bonusChips = Math.round(winChips * 1.005); } } catch (_e) {}\n"
        "      await dbRun(db, `UPDATE samp_users SET chips = chips + ? WHERE user_id = ?`, [bonusChips, uid]);\n"
        "      await dbRun(db, `UPDATE samp_users SET consecutive_casino_losses = 0 WHERE user_id = ?`, [uid]);\n"
    )
    if old_casino in text:
        text = text.replace(old_casino, new_casino, 1)
        print("[OK] casino_share: wired")
    else:
        print("[WARN] casino_share: winChips block not found")
else:
    print("[SKIP] casino_share: already wired")

# ─── blackmarket arms_dealer perk ───
if "arms_dealer" not in text:
    # Find price calculation in handleBlackmarketPrestige
    old_bm = (
        "    if (Number(user.money) < price) { await interaction.reply({ content: `Нужно ${fmtMoney(price)}`, ephemeral: true }); return; }\n"
        "    const grant = BLACK_MARKET_PRESTIGE_GRANTS[deal.type];\n"
    )
    new_bm = (
        "    let finalPrice = price;\n"
        "    try { const gm = await dbGet(db, \"SELECT gang_id FROM samp_gang_members WHERE user_id = ?\", [uid]);"
        " if (gm?.gang_id) { const evo = await dbGet(db, 'SELECT * FROM samp_gang_evolution WHERE gang_id = ?', [gm.gang_id]);"
        " const lvl = getGangLevelByXp(Number(evo?.xp || 0)); if (lvl.level >= 3) finalPrice = Math.round(price * 0.85); } } catch (_e) {}\n"
        "    if (Number(user.money) < finalPrice) { await interaction.reply({ content: `Нужно ${fmtMoney(finalPrice)}`, ephemeral: true }); return; }\n"
        "    const grant = BLACK_MARKET_PRESTIGE_GRANTS[deal.type];\n"
    )
    if old_bm in text:
        text = text.replace(old_bm, new_bm, 1)
        print("[OK] arms_dealer: wired")
    else:
        print("[WARN] arms_dealer: price block not found")
else:
    print("[SKIP] arms_dealer: already wired")

writef(PHC, text)

# ─── schedulers.js: territory decay ───
text = readf(SCH)
if "gang-territory-decay" not in text:
    insert = """

  // ── Gang Territory Decay (every 6 hours) ───────────────────────
  const scheduleGangTerritoryDecay = () => {
    const decayMs = 6 * 60 * 60 * 1000;
    setInterval(async () => {
      try {
        await runExclusiveTask("gang-territory-decay", async () => {
          const rows = await dbAll(db, "SELECT district_id, gang_id, pressure, updated_at FROM samp_gang_territories");
          let decayed = 0, neutralized = 0;
          for (const row of (rows || [])) {
            const evo = await dbGet(db, "SELECT updated_at FROM samp_gang_evolution WHERE gang_id = ?", [row.gang_id]);
            const lastActivity = evo?.updated_at ? new Date(evo.updated_at).getTime() : Date.now();
            const hoursSinceActivity = (Date.now() - lastActivity) / 3600000;
            const decayRate = hoursSinceActivity > 6 ? 3 : 1.5; // 3%/h if inactive 6h+, 1.5%/h otherwise
            const hoursSinceUpdate = (Date.now() - new Date(row.updated_at).getTime()) / 3600000;
            const loss = Math.round(decayRate * hoursSinceUpdate);
            const next = Math.max(0, (row.pressure || 100) - loss);
            if (next <= 0) {
              await dbRun(db, "DELETE FROM samp_gang_territories WHERE district_id = ?", [row.district_id]);
              await dbRun(db, "INSERT INTO samp_gang_territory_history(district_id, gang_id, event, pressure) VALUES(?,?,?,?)", [row.district_id, row.gang_id, "decay_neutral", 0]);
              neutralized++;
            } else {
              await dbRun(db, "UPDATE samp_gang_territories SET pressure = ?, updated_at = datetime('now') WHERE district_id = ?", [next, row.district_id]);
              decayed++;
            }
          }
          if (decayed > 0 || neutralized > 0) {
            console.log(`[GangDecay] processed ${decayed} territories, neutralized ${neutralized}`);
          }
        });
      } catch (err) { console.error("[GangDecay] error:", err); }
    }, decayMs);
  };
  scheduleGangTerritoryDecay();
"""
    # Find a safe insertion point — after the stock tick interval
    marker = "  }, Math.max(5, Number(STOCK_TICK_MINUTES) || 15) * 60 * 1000);\n"
    if marker in text:
        # Insert after the crew salary interval block which follows
        marker2 = "  }, 60 * 60 * 1000);\n\n"
        # Find the crew salary interval end
        idx = text.find("// Crew salary collection — hourly check")
        if idx == -1:
            idx = text.find("// ── SAMP Prestige: stock market ticks")
        if idx > 0:
            # Find the end of that section
            crew_end = text.find("// ── Register guild commands", idx)
            if crew_end > 0:
                text = text[:crew_end] + insert + text[crew_end:]
                print("[OK] schedulers.js: added gang territory decay")
            else:
                print("[WARN] schedulers.js: could not find insertion point")
        else:
            print("[WARN] schedulers.js: markers not found")
    else:
        print("[WARN] schedulers.js: stock tick marker not found")
else:
    print("[SKIP] schedulers.js: decay already present")

writef(SCH, text)

print("\nPhase D Part 1 complete.")
