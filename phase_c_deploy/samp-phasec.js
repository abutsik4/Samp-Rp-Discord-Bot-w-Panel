"use strict";

/**
 * Phase C — Prestige Casino, Gang Evolution, Crafting, Blackmarket 2.0
 * Self-contained module, imports helpers from samp-prestige.js
 */

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { dbGet, dbAll } = require("../utils/db-helpers");
const { withSerializedTransaction } = require("../utils/sqlite-transaction");
const { touchSampUserSeenAt } = require("./samp-life");

// Constants
const {
  CHEMIN_DE_FER, BACCARAT, HIGH_ROLLER,
  PRESTIGE_CASINO_ACCESS_MONEY, CHIP_EXCHANGE_RATE, VIP_MISSIONS,
} = require("./constants/prestige-casino");
const { BLACK_MARKET_PRESTIGE_ITEMS, BLACK_MARKET_PRESTIGE_GRANTS } = require("./constants/blackmarket2");
const { MATERIALS, RECIPES, rollMaterialDrops, getMaterialPrice } = require("./constants/crafting");
const {
  getGangLevelByXp, GANG_LEGACY_STAR_COST, GANG_LEGACY_STAR_CAP,
  getLegacyBonus, GANG_PERK_DESCRIPTIONS,
} = require("./constants/gang-evolution");

// Re-use prestige helpers (samp-prestige.js exports these)
const {
  getUserMansion,
  adjustMoney,
  addLedger,
} = require("./samp-prestige");

function fmtMoney(n) { return `${Number(n || 0).toLocaleString("ru-RU")} $`; }
function nowMs() { return Date.now(); }

// ─── Chip helpers ───
async function getUserChips(db, uid) {
  const r = await dbGet(db, "SELECT chips FROM samp_users WHERE user_id = ?", [String(uid)]);
  return Number(r?.chips || 0);
}
async function adjustChips(db, uid, delta, type, meta = {}) {
  await dbRun(db, "UPDATE samp_users SET chips = chips + ?, updated_at = datetime('now') WHERE user_id = ?", [Number(delta), String(uid)]);
  await dbRun(db, "INSERT INTO samp_chip_ledger(user_id, type, amount, meta_json) VALUES(?, ?, ?, ?)", [String(uid), type, Number(delta), JSON.stringify(meta)]);
}

// ─── Generic cooldown helpers (mirror samp-prestige) ───
async function getCooldown(db, uid, action) {
  const r = await dbGet(db, "SELECT ready_at FROM samp_cooldowns WHERE user_id = ? AND action = ?", [String(uid), String(action)]);
  return Number(r?.ready_at || 0);
}
async function setCooldown(db, uid, action, readyAt) {
  await dbRun(db, `INSERT INTO samp_cooldowns(user_id, action, ready_at) VALUES(?, ?, ?) ON CONFLICT(user_id, action) DO UPDATE SET ready_at = excluded.ready_at`, [String(uid), String(action), Number(readyAt)]);
}
function msToHumanShort(ms) { const s = Math.max(1, Math.ceil(ms / 1000)); if (s < 60) return `${s} с`; const m = Math.ceil(s / 60); if (m < 60) return `${m} мин`; const h = Math.floor(m / 60); const r = m - h * 60; return r > 0 ? `${h} ч ${r} мин` : `${h} ч`; }
async function checkAndSetActionCooldown(interaction, db, uid, action, cdMs) {
  const ready = await getCooldown(db, uid, action);
  if (ready > nowMs()) {
    await interaction.reply({ content: `⏳ Подожди **${msToHumanShort(ready - nowMs())}** перед \`${action}\`.`, ephemeral: true });
    return false;
  }
  await setCooldown(db, uid, action, nowMs() + cdMs);
  return true;
}
async function getSampUser(db, uid) { return dbGet(db, "SELECT * FROM samp_users WHERE user_id = ?", [String(uid)]); }
async function withTx(db, fn) { return withSerializedTransaction(db, fn); }

// ─── /prestige ───
async function handlePrestige(interaction, db) {
  const uid = interaction.user.id;
  const user = await getSampUser(db, uid);
  if (!user) { await interaction.reply({ content: "Сначала /reg", ephemeral: true }); return; }
  const chips = await getUserChips(db, uid);
  const hasAccess = Number(user.money) >= PRESTIGE_CASINO_ACCESS_MONEY || (await getUserMansion(db, uid));
  const embed = new EmbedBuilder()
    .setTitle("👑 Престиж")
    .setDescription(`💎 **Chips:** ${chips.toLocaleString("ru-RU")}\n🎰 Доступ: ${hasAccess ? "Открыт (VIP)" : `Закрыт (${PRESTIGE_CASINO_ACCESS_MONEY.toLocaleString("ru-RU")}$)`}`)
    .addFields(
      { name: "/prestigecasino", value: "Chemin de Fer, Баккара, High Roller", inline: true },
      { name: "/exchangechips", value: `Обмен $→chips (1 chip = ${CHIP_EXCHANGE_RATE.toLocaleString("ru-RU")}$)`, inline: true },
      { name: "/craft", value: "Крафт предметов", inline: true },
    )
    .setColor(0xf1c40f);
  await interaction.reply({ embeds: [embed] });
}

// ─── /exchangechips ───
async function handleExchangeChips(interaction, db) {
  const uid = interaction.user.id;
  const qty = interaction.options.getInteger("chips", true);
  const cost = qty * CHIP_EXCHANGE_RATE;
  const user = await getSampUser(db, uid);
  if (!user) { await interaction.reply({ content: "Сначала /reg", ephemeral: true }); return; }
  if (Number(user.money) < cost) { await interaction.reply({ content: `Нужно ${fmtMoney(cost)}`, ephemeral: true }); return; }
  await withTx(db, async () => { await adjustMoney(db, uid, -cost); await adjustChips(db, uid, qty, "exchange", { rate: CHIP_EXCHANGE_RATE, cost }); });
  await interaction.reply({ content: `💎 Обменял **${fmtMoney(cost)}** → **${qty} chips**` });
}

// ─── /market (Gini + supply) ───
async function handleMarket(interaction, db) {
  const rows = await dbAll(db, "SELECT money FROM samp_users");
  const balances = rows.map((r) => Number(r.money || 0)).filter((m) => m > 0).sort((a, b) => a - b);
  const total = balances.reduce((s, m) => s + m, 0);
  const count = balances.length;
  if (count === 0) { await interaction.reply({ content: "Нет данных.", ephemeral: true }); return; }
  let num = 0;
  for (let i = 0; i < count; i++) num += (2 * (i + 1) - count - 1) * balances[i];
  const gini = total > 0 ? Math.max(0, Math.min(1, num / (count * total))) : 0;
  const gPct = Math.round(gini * 100);
  const mean = Math.round(total / count);
  const median = balances[Math.floor(count / 2)];
  const embed = new EmbedBuilder()
    .setTitle("📊 Рынок San Andreas")
    .addFields(
      { name: "💵 Денежная масса", value: fmtMoney(total), inline: true },
      { name: "👤 Игроков", value: `${count}`, inline: true },
      { name: "⌀ Средний баланс", value: fmtMoney(mean), inline: true },
      { name: "📈 Медиана", value: fmtMoney(median), inline: true },
      { name: "📉 Индекс Джини", value: `${gPct}% ${gPct > 60 ? "⚠️" : gPct > 40 ? "📊" : "✅"}`, inline: false },
    )
    .setColor(gPct > 60 ? 0xe74c3c : gPct > 40 ? 0xf39c12 : 0x2ecc71)
    .setTimestamp(new Date());
  await interaction.reply({ embeds: [embed] });
}

// ─── /prestigecasino ───
async function handlePrestigeCasino(interaction, db) {
  const sub = interaction.options.getSubcommand(false) || "menu";
  const uid = interaction.user.id;
  const user = await getSampUser(db, uid);
  if (!user) { await interaction.reply({ content: "Сначала /reg", ephemeral: true }); return; }
  const chips = await getUserChips(db, uid);
  const hasAccess = Number(user.money) >= PRESTIGE_CASINO_ACCESS_MONEY || (await getUserMansion(db, uid));
  if (!hasAccess) { await interaction.reply({ content: `❌ VIP при ${PRESTIGE_CASINO_ACCESS_MONEY.toLocaleString("ru-RU")}$`, ephemeral: true }); return; }

  if (sub === "menu") {
    const embed = new EmbedBuilder()
      .setTitle("🎰 VIP-казино Four Dragons")
      .setDescription("Ставки в **chips** (1 chip = 1 000$).")
      .addFields(
        { name: "🃏 chemin", value: `RTP ~${Math.round((1 - CHEMIN_DE_FER.houseEdgePerRound)*100)}%`, inline: true },
        { name: "🎴 baccarat", value: "RTP ~99% (Banker)", inline: true },
        { name: "🎡 highroller", value: "RTP ~96%", inline: true },
      )
      .setFooter({ text: `💎 ${chips} chips` })
      .setColor(0x1abc9c);
    await interaction.reply({ embeds: [embed] });
    return;
  }
  if (sub === "top") {
    const rows = await dbAll(db, `SELECT user_id, SUM(amount) AS win FROM samp_chip_ledger WHERE type = 'casino_win' GROUP BY user_id ORDER BY win DESC LIMIT 10`);
    const lines = (rows || []).map((r, i) => `${i+1}. <@${r.user_id}> — ${Number(r.win).toLocaleString("ru-RU")} chips`);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏆 VIP Casino Top").setDescription(lines.join("\n") || "Пока никто не играл.").setColor(0xf1c40f)] });
    return;
  }
  if (sub === "chemin") {
    const bet = interaction.options.getInteger("bet", true);
    if (chips < bet) { await interaction.reply({ content: `Нужно ${bet} chips.`, ephemeral: true }); return; }
    if (!(await checkAndSetActionCooldown(interaction, db, uid, "prestigecasino_chemin", CHEMIN_DE_FER.cooldownMs))) return;
    let net = -bet, wins = 0, ties = 0;
    for (let r = 0; r < CHEMIN_DE_FER.roundsPerSession; r++) {
      const roll = Math.random();
      if (roll < CHEMIN_DE_FER.tieChance) { ties++; continue; }
      const wc = CHEMIN_DE_FER.baseWinChance + Math.min((user.consecutive_casino_losses || 0) * CHEMIN_DE_FER.streakBonus, CHEMIN_DE_FER.maxStreakBonus);
      if (Math.random() < wc) { wins++; net += Math.floor(bet / CHEMIN_DE_FER.roundsPerSession * 2); }
    }
    await withTx(db, async () => {
      await adjustChips(db, uid, net, net < 0 ? "casino_loss" : "casino_win", { game: "chemin", bet, wins, ties });
      await dbRun(db, "UPDATE samp_users SET consecutive_casino_losses = CASE WHEN ? < 0 THEN consecutive_casino_losses + 1 ELSE 0 END WHERE user_id = ?", [net, uid]);
    });
    await interaction.reply({ content: `🃏 Chemin de Fer | ${bet} chips | ${wins}W ${ties}T ${CHEMIN_DE_FER.roundsPerSession - wins - ties}L | **${net > 0 ? '+' : ''}${net} chips**` });
    return;
  }
  if (sub === "baccarat") {
    const bet = interaction.options.getInteger("bet", true);
    const target = interaction.options.getString("target", true);
    if (chips < bet) { await interaction.reply({ content: `Нужно ${bet} chips`, ephemeral: true }); return; }
    if (!(await checkAndSetActionCooldown(interaction, db, uid, "prestigecasino_baccarat", BACCARAT.cooldownMs))) return;
    const roll = Math.random();
    let mult = 0, res = "lose";
    if (target === "tie") { if (roll < BACCARAT.tieChance) { mult = BACCARAT.tiePayout; res = "tie"; } }
    else if (target === "banker") { if (roll < BACCARAT.tieChance) { mult = 1; res = "tie_refund"; } else if (roll < BACCARAT.tieChance + BACCARAT.bankerWinChance) { mult = BACCARAT.playerPayout * (1 - BACCARAT.bankerCommission); res = "banker"; } }
    else { if (roll < BACCARAT.tieChance) { mult = 1; res = "tie_refund"; } else if (roll < BACCARAT.tieChance + BACCARAT.playerWinChance) { mult = BACCARAT.playerPayout; res = "player"; } }
    const net = Math.floor(bet * mult) - bet;
    await adjustChips(db, uid, net, net >= 0 ? "casino_win" : "casino_loss", { game: "baccarat", bet, target, result: res });
    const lbl = { tie: "🤝 Tie!", banker: "🏦 Banker!", player: "👤 Player!", lose: "💀", tie_refund: "🤝 Ничья" };
    await interaction.reply({ content: `🎴 Баккара | ${bet} → ${lbl[res] || res} | **${net > 0 ? '+' : ''}${net} chips**` });
    return;
  }
  if (sub === "highroller") {
    const bet = interaction.options.getInteger("bet", true);
    if (chips < bet) { await interaction.reply({ content: `Нужно ${bet} chips`, ephemeral: true }); return; }
    if (!(await checkAndSetActionCooldown(interaction, db, uid, "prestigecasino_highroller", HIGH_ROLLER.cooldownMs))) return;
    const totalW = HIGH_ROLLER.sectors.reduce((s, x) => s + x.weight, 0);
    let pr = Math.random() * totalW, sec;
    for (const s of HIGH_ROLLER.sectors) { pr -= s.weight; if (pr <= 0) { sec = s; break; } }
    if (!sec) sec = HIGH_ROLLER.sectors[HIGH_ROLLER.sectors.length - 1];
    const net = Math.floor(bet * sec.factor) - bet;
    await adjustChips(db, uid, net, net >= 0 ? "casino_win" : "casino_loss", { game: "highroller", bet, sector: sec.label });
    await interaction.reply({ content: `🎡 High Roller | **${sec.label}** (x${sec.factor}) | **${net > 0 ? '+' : ''}${net} chips**` });
    return;
  }
}

// ─── /gang evolve ───
async function handleGangEvolve(interaction, db) {
  const uid = interaction.user.id;
  const mem = await dbGet(db, "SELECT gang_id, role FROM samp_gang_members WHERE user_id = ?", [uid]);
  if (!mem) { await interaction.reply({ content: "Ты не в банде.", ephemeral: true }); return; }
  const evo = await dbGet(db, "SELECT * FROM samp_gang_evolution WHERE gang_id = ?", [mem.gang_id]) || { level: 1, xp: 0, legacy_stars: 0 };
  const gang = await dbGet(db, "SELECT name FROM samp_gangs WHERE id = ?", [mem.gang_id]);
  const levelInfo = getGangLevelByXp(Number(evo.xp || 0));
  const legacy = getLegacyBonus(Number(evo.legacy_stars || 0));
  const next = [500,1500,4000,8000,15000,25000].find((x) => x > (evo.xp || 0));
  const embed = new EmbedBuilder()
    .setTitle(`🏴 Эволюция банды «${gang?.name || '?'}»`)
    .setDescription(`**Lv${levelInfo.level}** — ${levelInfo.label}\n⭐ Legacy: ${evo.legacy_stars || 0} (${legacy.label})\n💰 Бонус: +${Math.round((levelInfo.perMemberMoneyBonus + legacy.moneyBonus)*100)}%`)
    .addFields(
      { name: "XP", value: `${evo.xp || 0}${next ? ` / ${next}` : ""}`, inline: true },
      { name: "Perk", value: `${levelInfo.perk ? GANG_PERK_DESCRIPTIONS[levelInfo.perk] : "—"}`, inline: false },
    )
    .setColor(0x9b59b6);
  await interaction.reply({ embeds: [embed] });
}

// ─── /blackmarket prestige ───
async function handleBlackmarketPrestige(interaction, db) {
  const sub = interaction.options.getSubcommand(false);
  const uid = interaction.user.id;
  const user = await getSampUser(db, uid);
  if (!user) { await interaction.reply({ content: "Сначала /reg", ephemeral: true }); return; }
  if (sub === "prestige") {
    const lines = BLACK_MARKET_PRESTIGE_ITEMS.map((it) => `**${it.name}**\n_${it.description}_`);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🕴️ Prestige Blackmarket").setDescription(lines.join("\n\n")).setColor(0x2c3e50)] });
    return;
  }
  if (sub === "buy_prestige") {
    const itType = interaction.options.getString("item", true);
    const deal = BLACK_MARKET_PRESTIGE_ITEMS.find((x) => x.type === itType);
    if (!deal) { await interaction.reply({ content: "Не найдено.", ephemeral: true }); return; }
    const price = Math.round((deal.basePrice[0] + deal.basePrice[1]) / 2 + (Math.random() - 0.5) * (deal.basePrice[1] - deal.basePrice[0]));
    if (Number(user.money) < price) { await interaction.reply({ content: `Нужно ${fmtMoney(price)}`, ephemeral: true }); return; }
    const grant = BLACK_MARKET_PRESTIGE_GRANTS[deal.type];
    if (grant && !grant.isInstant && grant.maxInventoryQty) {
      const cur = await dbGet(db, "SELECT qty FROM samp_inventory WHERE user_id = ? AND item_id = ?", [uid, grant.inventoryItemId]);
      if (Number(cur?.qty || 0) >= grant.maxInventoryQty) { await interaction.reply({ content: "Максимум этого предмета.", ephemeral: true }); return; }
    }
    await withTx(db, async () => {
      await adjustMoney(db, uid, -price);
      await addLedger(db, "blackmarket_prestige", uid, null, price, { item: deal.name, type: deal.type });
      if (grant && !grant.isInstant && grant.inventoryItemId) {
        await dbRun(db, `INSERT INTO samp_inventory(user_id, item_id, qty, durability) VALUES(?, ?, ?, 100)
          ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`, [uid, grant.inventoryItemId, grant.inventoryQty]);
      }
    });
    await interaction.reply({ content: `🕴️ **${deal.name}** за **${fmtMoney(price)}**\n_${grant?.summary || deal.description}_` });
    return;
  }
}

// ─── /craft ───
async function handleCraft(interaction, db) {
  const sub = interaction.options.getSubcommand(false);
  const uid = interaction.user.id;
  if (sub === "list") {
    const lines = Object.values(RECIPES).map((r) => {
      const reqLine = Object.entries(r.reqs).map(([k, v]) => `${MATERIALS[k]?.emoji || '?'} ${v}`).join(" ");
      return `**${r.emoji} ${r.name}** — ${reqLine} — ${Math.round(r.successChance*100)}%`;
    });
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🔨 Рецепты").setDescription(lines.join("\n")).setColor(0x34495e)] });
    return;
  }
  if (sub === "stash") {
    const rows = await dbAll(db, "SELECT material_id, qty FROM samp_crafting_inventory WHERE user_id = ?", [uid]);
    const lines = (rows || []).map((r) => `${MATERIALS[r.material_id]?.emoji || '?'} ${MATERIALS[r.material_id]?.name || r.material_id}: ${r.qty}`);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("📦 Материалы").setDescription(lines.join("\n") || "Пусто").setColor(0x7f8c8d)] });
    return;
  }
  if (sub === "start") {
    const rid = interaction.options.getString("recipe", true);
    const recipe = RECIPES[rid];
    if (!recipe) { await interaction.reply({ content: "Рецепт не найден.", ephemeral: true }); return; }
    for (const [mid, need] of Object.entries(recipe.reqs)) {
      const row = await dbGet(db, "SELECT qty FROM samp_crafting_inventory WHERE user_id = ? AND material_id = ?", [uid, mid]);
      if (!row || Number(row.qty) < need) {
        await interaction.reply({ content: `❌ Не хватает ${MATERIALS[mid]?.name || mid}`, ephemeral: true }); return;
      }
    }
    await withTx(db, async () => {
      for (const [mid, need] of Object.entries(recipe.reqs)) {
        await dbRun(db, "UPDATE samp_crafting_inventory SET qty = qty - ?, updated_at = datetime('now') WHERE user_id = ? AND material_id = ?", [need, uid, mid]);
      }
    });
    const success = Math.random() < recipe.successChance;
    const outQty = recipe.outputQtyOverride || recipe.outputQty;
    if (success && recipe.outputItemId) {
      await dbRun(db, `INSERT INTO samp_inventory(user_id, item_id, qty, durability) VALUES(?, ?, ?, 100)
        ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + excluded.qty`, [uid, recipe.outputItemId, outQty]);
    }
    await dbRun(db, "INSERT INTO samp_crafting_ledger(user_id, recipe_id, crafted_qty, success, meta_json) VALUES(?, ?, ?, ?, ?)",
      [uid, rid, success ? outQty : 0, success ? 1 : 0, JSON.stringify({ recipeName: recipe.name })]);
    await interaction.reply({ content: success ? `🔨 **${recipe.name}** создан! x${outQty}` : `💥 Провал. **${recipe.name}** — материалы потеряны.` });
    return;
  }
}

// ─── /craftshop ───
async function handleCraftShop(interaction, db) {
  const sub = interaction.options.getSubcommand(false);
  const uid = interaction.user.id;
  if (sub === "menu") {
    const lines = Object.values(MATERIALS).map((m) => `${m.emoji} **${m.name}** — ${m.price.toLocaleString("ru-RU")}$/шт`);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🛒 Магазин материалов").setDescription(lines.join("\n")).setColor(0x27ae60)] });
    return;
  }
  if (sub === "buy") {
    const mid = interaction.options.getString("material", true);
    const qty = interaction.options.getInteger("qty", true);
    const mat = MATERIALS[mid];
    if (!mat) { await interaction.reply({ content: "Не найдено.", ephemeral: true }); return; }
    const cost = mat.price * qty;
    const user = await getSampUser(db, uid);
    if (Number(user.money) < cost) { await interaction.reply({ content: `Нужно ${fmtMoney(cost)}`, ephemeral: true }); return; }
    await withTx(db, async () => {
      await adjustMoney(db, uid, -cost);
      await dbRun(db, `INSERT INTO samp_crafting_inventory(user_id, material_id, qty) VALUES(?, ?, ?)
        ON CONFLICT(user_id, material_id) DO UPDATE SET qty = qty + excluded.qty, updated_at = datetime('now')`, [uid, mid, qty]);
    });
    await interaction.reply({ content: `🛒 ${mat.emoji} **${mat.name}** x${qty} — **${fmtMoney(cost)}**` });
    return;
  }
}

// ─── COMMAND BUILDERS ───
function getPhaseCCommandBuilders() {
  const { SlashCommandBuilder } = require("discord.js");
  const chipRate = CHIP_EXCHANGE_RATE.toLocaleString("ru-RU");
  return [
    new SlashCommandBuilder().setName("prestige").setDescription("SAMP Life: престиж, чипы, VIP"),
    new SlashCommandBuilder().setName("market").setDescription("SAMP Life: экономика сервера"),
    new SlashCommandBuilder()
      .setName("exchangechips").setDescription("SAMP Life: обмен $→chips")
      .addIntegerOption((o) => o.setName("chips").setDescription(`Сколько (1 chip = ${chipRate} $)`).setRequired(true).setMinValue(10).setMaxValue(100_000)),
    new SlashCommandBuilder()
      .setName("prestigecasino").setDescription("SAMP Life: VIP-казино")
      .addSubcommand((sc) => sc.setName("menu").setDescription("Меню"))
      .addSubcommand((sc) => sc.setName("chemin").setDescription("Chemin de Fer").addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(CHEMIN_DE_FER.minBet).setMaxValue(CHEMIN_DE_FER.maxBet)))
      .addSubcommand((sc) => sc.setName("baccarat").setDescription("Баккара").addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(BACCARAT.minBet).setMaxValue(BACCARAT.maxBet)).addStringOption((o) => o.setName("target").setDescription("Ставка на...").setRequired(true).addChoices({name:"Player x2",value:"player"},{name:"Banker x2−5%",value:"banker"},{name:"Tie x9",value:"tie"})))
      .addSubcommand((sc) => sc.setName("highroller").setDescription("High Roller").addIntegerOption((o) => o.setName("bet").setDescription("Ставка").setRequired(true).setMinValue(HIGH_ROLLER.minBet).setMaxValue(HIGH_ROLLER.maxBet)))
      .addSubcommand((sc) => sc.setName("top").setDescription("Топ побед")),
    new SlashCommandBuilder().setName("evolvegang").setDescription("SAMP Life: эволюция банды"),
    new SlashCommandBuilder()
      .setName("craft").setDescription("SAMP Life: крафт")
      .addSubcommand((sc) => sc.setName("list").setDescription("Рецепты"))
      .addSubcommand((sc) => sc.setName("start").setDescription("Начать").addStringOption((o) => o.setName("recipe").setDescription("ID рецепта").setRequired(true)))
      .addSubcommand((sc) => sc.setName("stash").setDescription("Материалы")),
    new SlashCommandBuilder()
      .setName("craftshop").setDescription("SAMP Life: покупка материалов")
      .addSubcommand((sc) => sc.setName("menu").setDescription("Ассортимент"))
      .addSubcommand((sc) => sc.setName("buy").setDescription("Купить").addStringOption((o) => { o.setName("material").setDescription("Материал").setRequired(true); for (const m of Object.values(MATERIALS)) o.addChoices({name:`${m.emoji} ${m.name} — ${m.price.toLocaleString("ru-RU")}$`,value:m.id}); return o; }).addIntegerOption((o) => o.setName("qty").setDescription("Количество").setRequired(true).setMinValue(1).setMaxValue(99))),
    new SlashCommandBuilder()
      .setName("blackmarket")
      .setDescription("SAMP Life: blackmarket")
      .addSubcommand((sc) => sc.setName("prestige").setDescription("Теневой рынок"))
      .addSubcommand((sc) => sc.setName("buy_prestige").setDescription("Купить prestige-предмет").addStringOption((o) => { o.setName("item").setDescription("Предмет").setRequired(true); for (const it of BLACK_MARKET_PRESTIGE_ITEMS) { const mid = Math.round((it.basePrice[0]+it.basePrice[1])/2); o.addChoices({name:`${it.name} — ~${mid.toLocaleString("ru-RU")}$`,value:it.type}); } return o; })),
  ];
}

const PHASEC_COMMAND_NAMES = [
  "prestige", "exchangechips", "market",
  "prestigecasino", "evolvegang",
  "craft", "craftshop", "blackmarket",
];

// ─── ROUTER ───
async function handlePhaseCCommand({ interaction, db }) {
  const name = interaction.commandName;
  const sub = interaction.options.getSubcommand(false);
  try {
    if (name === "prestige") await handlePrestige(interaction, db);
    else if (name === "exchangechips") await handleExchangeChips(interaction, db);
    else if (name === "market") await handleMarket(interaction, db);
    else if (name === "prestigecasino") await handlePrestigeCasino(interaction, db);
    else if (name === "evolvegang") await handleGangEvolve(interaction, db);
    else if (name === "craft") await handleCraft(interaction, db);
    else if (name === "craftshop") await handleCraftShop(interaction, db);
    else if (name === "blackmarket" && (sub === "prestige" || sub === "buy_prestige")) await handleBlackmarketPrestige(interaction, db);
    else return;
  } catch (e) {
    console.error("[samp-phasec] error:", name, e);
    try { await interaction.reply({ content: "❌ Ошибка. Попробуй позже.", ephemeral: true }); } catch (_) {}
  }
  try { await touchSampUserSeenAt(db, interaction.user?.id); } catch (_) {}
}

module.exports = {
  getPhaseCCommandBuilders,
  handlePhaseCCommand,
  PHASEC_COMMAND_NAMES,
  rollMaterialDrops,
  getMaterialPrice,
  MATERIALS,
  RECIPES,
};
