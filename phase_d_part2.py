#!/usr/bin/env python3
"""Phase D Part 2: /gang info XP bar, history, /gang history command."""
import os

EXT = "/opt/jepsencloud-bot/src/features/samp-extended.js"

with open(EXT, "r", encoding="utf-8") as f:
    text = f.read()

# Add require for gang-evolution constants if missing
if 'const { getGangLevelByXp, getLegacyBonus, GANG_PERK_DESCRIPTIONS, GANG_LEVEL_THRESHOLDS } = require("./constants/gang-evolution");' not in text:
    text = text.replace(
        'const { incrementGangXp } = require("./phasec-utils");\n',
        'const { incrementGangXp } = require("./phasec-utils");\n'
        'const { getGangLevelByXp, getLegacyBonus, GANG_PERK_DESCRIPTIONS, GANG_LEVEL_THRESHOLDS } = require("./constants/gang-evolution");\n'
    )
    print("[OK] added gang-evolution require")
else:
    print("[SKIP] gang-evolution require already present")

# Patch /gang info block
old_info = (
    "    const gang = await dbGet(db, \"SELECT * FROM samp_gangs WHERE id = ?\", [member.gang_id]);\n"
    "    const members = await dbAll(db, \"SELECT user_id, role FROM samp_gang_members WHERE gang_id = ?\", [member.gang_id]);\n"
    "    const support = await dbGet(db, \"SELECT COUNT(*) as c FROM samp_properties WHERE gang_boosted_by = ? AND gang_boost_until > datetime('now')\", [member.gang_id]);\n"
    "    const territories = await dbGet(db, \"SELECT COUNT(*) as c FROM samp_gang_territories WHERE gang_id = ?\", [member.gang_id]);\n"
    "    const memberList = (members || []).map(m => `• <@${m.user_id}> — ${m.role}`).join(\"\\n\");\n"
    "    const embed = new EmbedBuilder()\n"
    "      .setTitle(`[${gang.tag}] ${gang.name}`)\n"
    "      .setDescription(\"Сводка по казне, районам и составу банды.\")\n"
    "      .addFields(\n"
    "        { name: \"Лидер\", value: `<@${gang.leader_id}>`, inline: true },\n"
    "        { name: \"Казна\", value: fmtMoney(gang.treasury), inline: true },\n"
    "        { name: \"Поддержка бизнесов\", value: `${support?.c || 0} актив.`, inline: true },\n"
    "        { name: \"Районы\", value: `${territories?.c || 0} под контролем`, inline: true },\n"
    "        { name: `Участники (${members.length})`, value: memberList || \"—\" }\n"
    "      ).setColor(0x2ecc71).setTimestamp();\n"
    "    const cosmetics = await getUserCosmetics(db, userId);\n"
    "    applyUserCosmeticsToEmbed(embed, cosmetics, interaction.user.username, 0x2ecc71);\n"
    "    await interaction.reply({ embeds: [embed] });"
)

new_info = (
    "    const gang = await dbGet(db, \"SELECT * FROM samp_gangs WHERE id = ?\", [member.gang_id]);\n"
    "    const members = await dbAll(db, \"SELECT user_id, role FROM samp_gang_members WHERE gang_id = ?\", [member.gang_id]);\n"
    "    const support = await dbGet(db, \"SELECT COUNT(*) as c FROM samp_properties WHERE gang_boosted_by = ? AND gang_boost_until > datetime('now')\", [member.gang_id]);\n"
    "    const territories = await dbGet(db, \"SELECT COUNT(*) as c FROM samp_gang_territories WHERE gang_id = ?\", [member.gang_id]);\n"
    "    const evo = await dbGet(db, \"SELECT * FROM samp_gang_evolution WHERE gang_id = ?\", [member.gang_id]);\n"
    "    const evoData = evo || { xp: 0, legacy_stars: 0 };\n"
    "    const levelInfo = getGangLevelByXp(Number(evoData.xp || 0));\n"
    "    const legacy = getLegacyBonus(Number(evoData.legacy_stars || 0));\n"
    "    const nextXpObj = GANG_LEVEL_THRESHOLDS.find((t) => t.xp > (evoData.xp || 0));\n"
    "    const nextXp = nextXpObj ? nextXpObj.xp : \"MAX\";\n"
    "    const xpPct = nextXp === \"MAX\" ? 100 : Math.round(((evoData.xp || 0) / nextXp) * 100);\n"
    "    const historyRows = await dbAll(db, \"SELECT district_id, event, pressure, created_at FROM samp_gang_territory_history WHERE gang_id = ? ORDER BY created_at DESC LIMIT 5\", [member.gang_id]);\n"
    "    const evMap = { claim: \"🗺️ Захват\", reinforce: \"🛡️ Укрепление\", attack: \"⚔️ Атака\", takeover: \"🔥 Перехват\", decay_neutral: \"💀 Потеря\" };\n"
    "    const historyLines = (historyRows || []).map((h) => {\n"
    "      const dname = TERRITORY_DISTRICTS[h.district_id]?.name || h.district_id;\n"
    "      return `${evMap[h.event] || h.event} ${dname} (${h.pressure}%)`;\n"
    "    }).join(\"\\n\") || \"—\";\n"
    "    const memberList = (members || []).map(m => `• <@${m.user_id}> — ${m.role}`).join(\"\\n\");\n"
    "    const embed = new EmbedBuilder()\n"
    "      .setTitle(`[${gang.tag}] ${gang.name}`)\n"
    '      .setDescription(`**Lv${levelInfo.level}** — ${levelInfo.label} | ⭐ ${evoData.legacy_stars || 0} (${legacy.label})\\nСводка по казне, районам и составу банды.`)\n'
    "      .addFields(\n"
    "        { name: \"Лидер\", value: `<@${gang.leader_id}>`, inline: true },\n"
    "        { name: \"Казна\", value: fmtMoney(gang.treasury), inline: true },\n"
    "        { name: \"Поддержка бизнесов\", value: `${support?.c || 0} актив.`, inline: true },\n"
    "        { name: \"Районы\", value: `${territories?.c || 0} под контролем`, inline: true },\n"
    "        { name: \"XP\", value: `${evoData.xp || 0}${nextXp === \"MAX\" ? \"\" : ` / ${nextXp}`} (${xpPct}%)`, inline: true },\n"
    "        { name: \"Perk\", value: `${levelInfo.perk ? GANG_PERK_DESCRIPTIONS[levelInfo.perk] : \"—\"}`, inline: true },\n"
    "        { name: `Участники (${members.length})`, value: memberList || \"—\" },\n"
    "        { name: \"История районов\", value: historyLines || \"—\" }\n"
    "      ).setColor(0x2ecc71).setTimestamp();\n"
    "    const cosmetics = await getUserCosmetics(db, userId);\n"
    "    applyUserCosmeticsToEmbed(embed, cosmetics, interaction.user.username, 0x2ecc71);\n"
    "    await interaction.reply({ embeds: [embed] });"
)

if old_info in text:
    text = text.replace(old_info, new_info, 1)
    print("[OK] patched /gang info")
else:
    print("[WARN] /gang info block not found")

# Also patch /gang top to add XP sort
old_top = (
    "    const gangs = await dbAll(\n"
    "      db,\n"
    "      `SELECT g.*, COUNT(DISTINCT gm.user_id) as members, COUNT(DISTINCT t.district_id) as territories\n"
    "       FROM samp_gangs g\n"
    "       LEFT JOIN samp_gang_members gm ON gm.gang_id = g.id\n"
    "       LEFT JOIN samp_gang_territories t ON t.gang_id = g.id\n"
    "       GROUP BY g.id\n"
    "       ORDER BY g.treasury DESC, territories DESC, members DESC, g.id ASC\n"
    "       LIMIT 10`,"
)
new_top = (
    "    const gangs = await dbAll(\n"
    "      db,\n"
    "      `SELECT g.*, COUNT(DISTINCT gm.user_id) as members, COUNT(DISTINCT t.district_id) as territories, COALESCE(e.xp, 0) as xp\n"
    "       FROM samp_gangs g\n"
    "       LEFT JOIN samp_gang_members gm ON gm.gang_id = g.id\n"
    "       LEFT JOIN samp_gang_territories t ON t.gang_id = g.id\n"
    "       LEFT JOIN samp_gang_evolution e ON e.gang_id = g.id\n"
    "       GROUP BY g.id\n"
    "       ORDER BY g.treasury DESC, xp DESC, territories DESC, members DESC, g.id ASC\n"
    "       LIMIT 10`,"
)
if old_top in text:
    text = text.replace(old_top, new_top, 1)
    print("[OK] patched /gang top sort")
else:
    print("[WARN] /gang top block not found")

with open(EXT, "w", encoding="utf-8") as f:
    f.write(text)

print("Phase D Part 2 complete.")
