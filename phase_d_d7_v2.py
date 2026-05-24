#!/usr/bin/env python3
"""Phase D: D7 — Gang War command patch."""
import pathlib, sys

SE = pathlib.Path("/opt/jepsencloud-bot/src/features/samp-extended.js")
if not SE.exists():
    print("ERROR: samp-extended.js not found"); sys.exit(1)

content = SE.read_text()

# ── 1. Insert war subcommand into gang builder after setcolor ──────────
old_setcolor = '''      .addSubcommand(s => s.setName("setcolor").setDescription("Задать цвет банды (ур. 7+)")
        .addStringOption(o => o.setName("hex").setDescription("HEX цвет, например #e3b341").setRequired(true))),'''
new_setcolor = '''      .addSubcommand(s => s.setName("setcolor").setDescription("Задать цвет банды (ур. 7+)")
        .addStringOption(o => o.setName("hex").setDescription("HEX цвет, например #e3b341").setRequired(true)))
      .addSubcommand(s => s.setName("war").setDescription("Бандитские войны")
        .addStringOption(o => o.setName("action").setDescription("Действие").setRequired(true).addChoices(
          { name: "Объявить войну", value: "challenge" },
          { name: "Принять вызов", value: "accept" },
          { name: "Статус", value: "status" },
          { name: "Поставить ставку", value: "bet" }
        ))
        .addStringOption(o => o.setName("target").setDescription("Тег банды (для challenge / bet)").setRequired(false))
        .addIntegerOption(o => o.setName("amount").setDescription("Сумма ставки (для bet)").setRequired(false).setMinValue(1000))),'''
if old_setcolor not in content:
    print("ERROR: setcolor builder not found")
    # Debug
    idx = content.find('setName("setcolor")')
    if idx != -1:
        print("DEBUG:", repr(content[idx-60:idx+300]))
    sys.exit(1)
content = content.replace(old_setcolor, new_setcolor, 1)
print("[OK] added war subcommand to builder")

# ── 2. Insert war handler before sub === "top" ───────────────────────────
old_top = '  } else if (sub === "top") {'
new_top = '''  } else if (sub === "war") {
    // ── GANG WAR ─────────────────────────────────────────
    const warSub = String(interaction.options.getString("action", true)).toLowerCase();
    const WAR_DECLARATION_COST = 10_000;
    const WAR_PREP_HOURS = 48;

    if (warSub === "challenge") {
      const userId = interaction.user.id;
      const member = await dbGet(db, "SELECT gm.gang_id, gm.role, g.name, g.tag, g.treasury FROM samp_gang_members gm JOIN samp_gangs g ON g.id = gm.gang_id WHERE gm.user_id = ?", [userId]);
      if (!member || member.role !== "leader") { await interaction.reply({ content: "Только лидер может объявлять войну.", ephemeral: true }); return; }
      const evo = await dbGet(db, "SELECT xp FROM samp_gang_evolution WHERE gang_id = ?", [member.gang_id]);
      const levelInfo = getGangLevelByXp(Number(evo?.xp || 0));
      if (levelInfo.level < 3) { await interaction.reply({ content: "Война доступна с уровня **Банда (3)**.", ephemeral: true }); return; }
      const targetTag = String(interaction.options.getString("target") || "").trim().toUpperCase();
      if (!targetTag) { await interaction.reply({ content: "Укажи тег банды через `target:`.", ephemeral: true }); return; }
      const targetGang = await dbGet(db, "SELECT * FROM samp_gangs WHERE tag = ?", [targetTag]);
      if (!targetGang) { await interaction.reply({ content: "Такой банды не существует.", ephemeral: true }); return; }
      if (Number(targetGang.id) === Number(member.gang_id)) { await interaction.reply({ content: "Нельзя объявить войну самой себе.", ephemeral: true }); return; }
      const existing = await dbGet(db, `SELECT * FROM samp_gang_wars WHERE (challenger_gang_id = ? OR defender_gang_id = ? OR challenger_gang_id = ? OR defender_gang_id = ?) AND status IN ('pending','active')`, [member.gang_id, member.gang_id, targetGang.id, targetGang.id]);
      if (existing) { await interaction.reply({ content: "Между вашими бандами уже идёт война или ожидается.", ephemeral: true }); return; }
      if (Number(member.treasury || 0) < WAR_DECLARATION_COST) {
        await interaction.reply({ content: `Для объявления нужно **${fmtMoney(WAR_DECLARATION_COST)}** в казне.`, ephemeral: true }); return;
      }
      const startsAt = new Date(Date.now() + WAR_PREP_HOURS * 3600_000);
      await dbRun(db, "UPDATE samp_gangs SET treasury = treasury - ? WHERE id = ?", [WAR_DECLARATION_COST, member.gang_id]);
      await dbRun(db, `INSERT INTO samp_gang_wars(challenger_gang_id, defender_gang_id, bet, status, created_at) VALUES(?, ?, ?, 'pending', datetime('now'))`, [member.gang_id, targetGang.id, WAR_DECLARATION_COST]);
      const warRow = await dbGet(db, "SELECT id FROM samp_gang_wars WHERE challenger_gang_id = ? AND defender_gang_id = ? ORDER BY id DESC LIMIT 1", [member.gang_id, targetGang.id]);
      if (warRow) {
        await dbRun(db, "UPDATE samp_gang_wars SET starts_at = ? WHERE id = ?", [startsAt.toISOString(), warRow.id]);
      }
      await interaction.reply(`⚔️ **[${member.tag}] ${member.name}** объявила войну **[${targetGang.tag}] ${targetGang.name}**!\nПодготовка: **48 часов**. Старт: **${startsAt.toUTCString()}**.\nИз казны списано **${fmtMoney(WAR_DECLARATION_COST)}** на призовой фонд.`);

    } else if (warSub === "accept") {
      const userId = interaction.user.id;
      const member = await dbGet(db, "SELECT gm.gang_id, gm.role, g.name, g.tag FROM samp_gang_members gm JOIN samp_gangs g ON g.id = gm.gang_id WHERE gm.user_id = ?", [userId]);
      if (!member || member.role !== "leader") { await interaction.reply({ content: "Только лидер может принять вызов.", ephemeral: true }); return; }
      const war = await dbGet(db, "SELECT * FROM samp_gang_wars WHERE defender_gang_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1", [member.gang_id]);
      if (!war) { await interaction.reply({ content: "Нет активных вызовов для твоей банды.", ephemeral: true }); return; }
      await dbRun(db, "UPDATE samp_gang_wars SET status = 'active' WHERE id = ?", [war.id]);
      const challenger = await dbGet(db, "SELECT * FROM samp_gangs WHERE id = ?", [war.challenger_gang_id]);
      await interaction.reply(`🛡️ **[${member.tag}] ${member.name}** приняла вызов!\nВойна с **[${challenger.tag}] ${challenger.name}** начинается после окончания подготовки.`);

    } else if (warSub === "bet") {
      const userId = interaction.user.id;
      const targetTag = String(interaction.options.getString("target") || "").trim().toUpperCase();
      const amount = interaction.options.getInteger("amount", false);
      if (!targetTag || !amount) { await interaction.reply({ content: "Укажи `target:` (тег банды) и `amount:`.", ephemeral: true }); return; }
      const user = await getSampUser(db, userId);
      if (!user || Number(user.money) < amount) { await interaction.reply({ content: "Не хватает виртов.", ephemeral: true }); return; }
      const betGang = await dbGet(db, "SELECT * FROM samp_gangs WHERE tag = ?", [targetTag]);
      if (!betGang) { await interaction.reply({ content: "Такой банды не существует.", ephemeral: true }); return; }
      const war = await dbGet(db, "SELECT * FROM samp_gang_wars WHERE (challenger_gang_id = ? OR defender_gang_id = ?) AND status IN ('pending','active') ORDER BY id DESC LIMIT 1", [betGang.id, betGang.id]);
      if (!war) { await interaction.reply({ content: "На эту банду сейчас нет открытой войны.", ephemeral: true }); return; }
      if (Number(war.challenger_gang_id) !== Number(betGang.id) && Number(war.defender_gang_id) !== Number(betGang.id)) {
        await interaction.reply({ content: "Эта банда не участвует в текущей войне.", ephemeral: true }); return;
      }
      const opKey = makeInteractionOpKey(interaction, "gang_war_bet");
      await withTx(db, async () => {
        const inserted = await addLedgerUnique(db, "gang_war_bet", userId, null, amount, opKey, { war_id: war.id, gang_id: betGang.id });
        if (!inserted) throw new Error("DUPLICATE_OPERATION");
        await adjustMoney(db, userId, -amount);
        await dbRun(db, `CREATE TABLE IF NOT EXISTS samp_gang_war_bets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          war_id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          gang_id INTEGER NOT NULL,
          amount INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (war_id) REFERENCES samp_gang_wars(id) ON DELETE CASCADE
        )`);
        await dbRun(db, "INSERT INTO samp_gang_war_bets(war_id, user_id, gang_id, amount) VALUES(?,?,?,?)", [war.id, userId, betGang.id, amount]);
        await dbRun(db, "UPDATE samp_gang_wars SET bet = bet + ? WHERE id = ?", [amount, war.id]);
      });
      await interaction.reply(`🎲 <@${userId}> поставил **${fmtMoney(amount)}** на **[${betGang.tag}] ${betGang.name}**!`);

    } else if (warSub === "status") {
      const userId = interaction.user.id;
      const member = await dbGet(db, "SELECT gang_id FROM samp_gang_members WHERE user_id = ?", [userId]);
      const gid = member?.gang_id;
      if (!gid) { await interaction.reply({ content: "Ты не в банде.", ephemeral: true }); return; }
      const wars = await dbAll(db, `SELECT * FROM samp_gang_wars WHERE (challenger_gang_id = ? OR defender_gang_id = ?) AND status IN ('pending','active') ORDER BY id DESC LIMIT 5`, [gid, gid]);
      if (!wars || wars.length === 0) { await interaction.reply("⚔️ У твоей банды нет активных войн."); return; }
      const lines = [];
      for (const w of wars) {
        const c = await dbGet(db, "SELECT name, tag FROM samp_gangs WHERE id = ?", [w.challenger_gang_id]);
        const d = await dbGet(db, "SELECT name, tag FROM samp_gangs WHERE id = ?", [w.defender_gang_id]);
        const bets = await dbGet(db, "SELECT COALESCE(SUM(amount),0) AS total FROM samp_gang_war_bets WHERE war_id = ?", [w.id]);
        lines.push(`**[${c?.tag}] ${c?.name}** vs **[${d?.tag}] ${d?.name}** — \`${w.status.toUpperCase()}\` | Приз: **${fmtMoney(w.bet)}** | Ставки: **${fmtMoney(bets?.total || 0)}**`);
      }
      const embed = new EmbedBuilder().setTitle("⚔️ Войны банд").setDescription(lines.join("\n\n")).setColor(0xe74c3c).setTimestamp();
      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply({ content: "Действие: `challenge`, `accept`, `status`, `bet`.", ephemeral: true });
    }

  } else if (sub === "top") {'''
if old_top not in content:
    print("ERROR: sub === top not found"); sys.exit(1)
content = content.replace(old_top, new_top, 1)
print("[OK] added war handler")

# ── 3. Add war autocomplete ────────────────────────────────────────────
old_ac = '  } else if ((name === "gang" || name === "gcapture") '
new_ac = '''  } else if (name === "gang" && focused.name === "target") {
    choices = Object.values(await dbAll(db, "SELECT DISTINCT tag FROM samp_gangs ORDER BY tag LIMIT 50")).map((g) => ({ name: g.tag, value: g.tag }));
  } else if ((name === "gang" || name === "gcapture") '''
if old_ac not in content:
    print("ERROR: autocomplete insertion point not found"); sys.exit(1)
content = content.replace(old_ac, new_ac, 1)
print("[OK] added war autocomplete")

SE.write_text(content)
print("[OK] wrote samp-extended.js")
print("DONE: D7 applied.")
