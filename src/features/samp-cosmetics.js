"use strict";

const { SlashCommandBuilder, EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");
const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");

/**
 * SAMP Life — Cosmetics & Gameplay Boosts
 *
 * Catalog is split into categories. Each item belongs to exactly one
 * category. Items with type=boost modify gameplay (work/truck/rob/CD);
 * others are purely cosmetic (title, color, flair, car paint).
 *
 * Ownership vs equipment:
 *   - `samp_cosmetics_inventory` stores everything a user has ever bought
 *   - `samp_cosmetics` stores the ONE equipped item per cosmetic_type
 *   Boosts are ALWAYS active once purchased (they do not need to be
 *   "equipped"), same as the existing Golden Deagle model.
 */

const CATEGORIES = {
  title: { name: "Титулы", emoji: "🏷️" },
  color: { name: "Цвета", emoji: "🎨" },
  flair: { name: "Флейр профиля", emoji: "✨" },
  car_paint: { name: "Покраска тачки", emoji: "🚗" },
  weapon_skin: { name: "Скины оружия", emoji: "🔫" },
  boost: { name: "Бонусы игрока", emoji: "⚡" },
};

const COSMETICS = {
  // --- 🏷️ Titles (displayed as "{title} • username") ---
  title_og: { category: "title", type: "title", name: "Титул: OG", price: 25_000, value: "OG", emoji: "🏷️" },
  title_boss: { category: "title", type: "title", name: "Титул: Босс", price: 50_000, value: "Босс", emoji: "🏷️" },
  title_sheriff: { category: "title", type: "title", name: "Титул: Шериф", price: 75_000, value: "Шериф", emoji: "🏷️" },
  title_legend: { category: "title", type: "title", name: "Титул: Легенда", price: 100_000, value: "Легенда", emoji: "🏷️" },
  title_shadow: { category: "title", type: "title", name: "Титул: Теневой Босс", price: 175_000, value: "Теневой Босс", emoji: "🏷️" },
  title_king: { category: "title", type: "title", name: "Титул: Король SA", price: 250_000, value: "Король SA", emoji: "🏷️" },
  title_god: { category: "title", type: "title", name: "Титул: Бог SA", price: 500_000, value: "Бог SA", emoji: "🏷️" },

  // --- 🎨 Colors ---
  color_gold: { category: "color", type: "color", name: "Цвет: Золотой", price: 30_000, value: "0xf1c40f", emoji: "🟡" },
  color_red: { category: "color", type: "color", name: "Цвет: Красный", price: 30_000, value: "0xe74c3c", emoji: "🔴" },
  color_purple: { category: "color", type: "color", name: "Цвет: Фиолетовый", price: 30_000, value: "0x9b59b6", emoji: "🟣" },
  color_green: { category: "color", type: "color", name: "Цвет: Зелёный", price: 30_000, value: "0x2ecc71", emoji: "🟢" },
  color_blue: { category: "color", type: "color", name: "Цвет: Синий", price: 30_000, value: "0x3498db", emoji: "🔵" },
  color_pink: { category: "color", type: "color", name: "Цвет: Розовый", price: 30_000, value: "0xff6b9d", emoji: "💗" },
  color_black: { category: "color", type: "color", name: "Цвет: Чёрный", price: 50_000, value: "0x2c2f33", emoji: "⚫" },
  color_platinum: { category: "color", type: "color", name: "Цвет: Платиновый", price: 75_000, value: "0xe5e4e2", emoji: "⬜" },

  // --- ✨ Profile flair (adds a decorative line to footer) ---
  flair_fire: { category: "flair", type: "flair", name: "Флейр: Огонь", price: 40_000, value: "🔥🔥🔥", emoji: "🔥" },
  flair_money: { category: "flair", type: "flair", name: "Флейр: Деньги", price: 40_000, value: "💵💰💵", emoji: "💰" },
  flair_skull: { category: "flair", type: "flair", name: "Флейр: Череп", price: 60_000, value: "☠️🔫☠️", emoji: "☠️" },
  flair_diamond: { category: "flair", type: "flair", name: "Флейр: Алмаз", price: 80_000, value: "💎👑💎", emoji: "💎" },

  // --- 🚗 Car paint (decorates active car name in /balance & /garage) ---
  paint_matte: { category: "car_paint", type: "car_paint", name: "Покраска: Матовый чёрный", price: 25_000, value: "Чёрный мат", emoji: "⬛" },
  paint_cherry: { category: "car_paint", type: "car_paint", name: "Покраска: Вишнёвый металлик", price: 25_000, value: "Вишнёвый", emoji: "🍒" },
  paint_ocean: { category: "car_paint", type: "car_paint", name: "Покраска: Океан", price: 25_000, value: "Океан", emoji: "🌊" },
  paint_gold: { category: "car_paint", type: "car_paint", name: "Покраска: Золото", price: 75_000, value: "Золотой", emoji: "🟡" },
  paint_chrome: { category: "car_paint", type: "car_paint", name: "Покраска: Хром", price: 150_000, value: "Хром", emoji: "⬜" },

  // --- 🔫 Weapon skin (pre-existing Golden Deagle) ---
  weapon_skin_deagle_gold: {
    category: "weapon_skin",
    type: "weapon_skin_deagle",
    name: "Скин: Золотой Desert Eagle",
    price: 120_000,
    value: "gold",
    emoji: "🔫",
    description: "+3 урона Desert Eagle в дуэлях и +25% к награде по контракту.",
  },

  // --- ⚡ Gameplay boosts ---
  boost_work: {
    category: "boost",
    type: "boost_work",
    name: "Рабочая лицензия",
    price: 150_000,
    value: "1",
    emoji: "🛠",
    description: "Постоянный +15% к выплатам /work.",
    effect: { workMultiplier: 1.15 },
  },
  boost_truck: {
    category: "boost",
    type: "boost_truck",
    name: "Лицензия дальнобойщика",
    price: 200_000,
    value: "1",
    emoji: "🚚",
    description: "Постоянный +10% к выплатам /truck.",
    effect: { truckMultiplier: 1.10 },
  },
  boost_luck: {
    category: "boost",
    type: "boost_luck",
    name: "Амулет удачи",
    price: 300_000,
    value: "1",
    emoji: "🍀",
    description: "−5 процентных пунктов к шансу сесть при /rob.",
    effect: { robJailBonus: -0.05 },
  },
  boost_cd: {
    category: "boost",
    type: "boost_cd",
    name: "VIP-часы",
    price: 500_000,
    value: "1",
    emoji: "⌚",
    description: "−15% к кулдаунам /work, /truck, /rob.",
    effect: { cooldownMultiplier: 0.85 },
  },
  // Whale-tier sinks
  boost_laundering: {
    category: "boost",
    type: "boost_laundering",
    name: "Сеть отмывания",
    price: 750_000,
    value: "1",
    emoji: "💼",
    description: "−25% к штрафам при провале /rob.",
    effect: { robFinePenalty: -0.25 },
  },
  boost_radio: {
    category: "boost",
    type: "boost_radio",
    name: "Полицейская рация",
    price: 500_000,
    value: "1",
    emoji: "📻",
    description: "Приватное оповещение, когда на тебя ставят /bounty.",
    effect: { bountyAlert: true },
  },
  boost_watch: {
    category: "boost",
    type: "boost_watch",
    name: "Золотые часы",
    price: 1_000_000,
    value: "1",
    emoji: "⌚",
    description: "−25% к кулдаунам /work, /truck, /rob (сильнее VIP-часов).",
    effect: { cooldownMultiplier: 0.75 },
  },
  boost_safe: {
    category: "boost",
    type: "boost_safe",
    name: "Сейф в особняке",
    price: 2_000_000,
    value: "1",
    emoji: "🏦",
    description: "+50,000$ к каждому /daily.",
    effect: { dailyBonus: 50_000 },
  },
};

// -------------------------
// Helpers
// -------------------------

function parseCosmeticColor(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffffff) return null;
  return parsed;
}

function formatCosmeticAuthorName(username, title) {
  return title ? `${title} • ${username}` : username;
}

function getCosmeticBenefitText(cosmetic) {
  if (!cosmetic) return "";
  if (cosmetic.description) return cosmetic.description;
  if (cosmetic.type === "title") return "Показывается в author-строке твоих профильных embed'ов.";
  if (cosmetic.type === "color") return "Используется как цвет твоих профильных embed'ов.";
  if (cosmetic.type === "flair") return "Добавляет декоративную строку в футер твоих профильных embed'ов.";
  if (cosmetic.type === "car_paint") return "Украшает название тачки в /balance и /garage.";
  return "";
}

async function ensureCosmeticsTables(db) {
  // Equipped slot (legacy table — already exists).
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_cosmetics (
      user_id TEXT NOT NULL,
      cosmetic_type TEXT NOT NULL,
      cosmetic_value TEXT NOT NULL,
      PRIMARY KEY (user_id, cosmetic_type)
    )`
  );
  // Ownership table — every purchase creates one row, equip state is separate.
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS samp_cosmetics_inventory (
      user_id TEXT NOT NULL,
      cosmetic_id TEXT NOT NULL,
      acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, cosmetic_id)
    )`
  );
  await dbRun(
    db,
    `CREATE INDEX IF NOT EXISTS idx_samp_cosmetics_inv_user
     ON samp_cosmetics_inventory(user_id)`
  );

  // Backfill inventory from pre-existing equipped rows so veterans don't
  // lose access to their old purchases.
  try {
    const legacy = await dbAll(
      db,
      `SELECT user_id, cosmetic_type, cosmetic_value FROM samp_cosmetics`
    );
    for (const row of legacy || []) {
      const match = findCosmeticIdByTypeAndValue(row.cosmetic_type, row.cosmetic_value);
      if (!match) continue;
      await dbRun(
        db,
        `INSERT OR IGNORE INTO samp_cosmetics_inventory(user_id, cosmetic_id, acquired_at)
         VALUES(?, ?, datetime('now'))`,
        [String(row.user_id), match]
      );
    }
  } catch (err) {
    console.error("[samp-cosmetics] inventory backfill skipped", err?.message || err);
  }
}

function findCosmeticIdByTypeAndValue(type, value) {
  for (const [id, def] of Object.entries(COSMETICS)) {
    if (def.type === type && String(def.value) === String(value)) return id;
  }
  return null;
}

// -------------------------
// Inventory / equip helpers
// -------------------------

async function getOwnedCosmeticIds(db, userId) {
  try {
    const rows = await dbAll(
      db,
      `SELECT cosmetic_id FROM samp_cosmetics_inventory WHERE user_id = ?`,
      [String(userId)]
    );
    return (rows || []).map((r) => r.cosmetic_id);
  } catch (err) {
    if (String(err?.message || "").includes("no such table")) return [];
    throw err;
  }
}

async function ownsCosmetic(db, userId, cosmeticId) {
  const owned = await getOwnedCosmeticIds(db, userId);
  return owned.includes(cosmeticId);
}

async function addCosmeticToInventory(db, userId, cosmeticId) {
  await dbRun(
    db,
    `INSERT OR IGNORE INTO samp_cosmetics_inventory(user_id, cosmetic_id, acquired_at)
     VALUES(?, ?, datetime('now'))`,
    [String(userId), String(cosmeticId)]
  );
}

async function equipCosmetic(db, userId, cosmeticId) {
  const def = COSMETICS[cosmeticId];
  if (!def) return { ok: false, reason: "UNKNOWN" };
  if (def.category === "boost") {
    // Boosts are always active — equipping is a no-op.
    await dbRun(
      db,
      `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value)
       VALUES(?, ?, ?)
       ON CONFLICT(user_id, cosmetic_type) DO UPDATE SET cosmetic_value = excluded.cosmetic_value`,
      [String(userId), def.type, String(def.value)]
    );
    return { ok: true, def, alwaysActive: true };
  }
  const owns = await ownsCosmetic(db, userId, cosmeticId);
  if (!owns) return { ok: false, reason: "NOT_OWNED" };
  await dbRun(
    db,
    `INSERT INTO samp_cosmetics(user_id, cosmetic_type, cosmetic_value)
     VALUES(?, ?, ?)
     ON CONFLICT(user_id, cosmetic_type) DO UPDATE SET cosmetic_value = excluded.cosmetic_value`,
    [String(userId), def.type, String(def.value)]
  );
  return { ok: true, def };
}

async function unequipCosmetic(db, userId, cosmeticId) {
  const def = COSMETICS[cosmeticId];
  if (!def) return { ok: false, reason: "UNKNOWN" };
  if (def.category === "boost" || def.category === "weapon_skin") {
    return { ok: false, reason: "PERMANENT" };
  }
  await dbRun(
    db,
    `DELETE FROM samp_cosmetics WHERE user_id = ? AND cosmetic_type = ? AND cosmetic_value = ?`,
    [String(userId), def.type, String(def.value)]
  );
  return { ok: true, def };
}

// -------------------------
// Profile / effects lookup
// -------------------------

async function getUserCosmetics(db, userId) {
  const profile = {
    title: null,
    color: null,
    flair: null,
    carPaint: null,
    raw: {},
  };
  try {
    const rows = await dbAll(
      db,
      "SELECT cosmetic_type, cosmetic_value FROM samp_cosmetics WHERE user_id = ?",
      [String(userId)]
    );
    for (const row of rows || []) {
      profile.raw[row.cosmetic_type] = row.cosmetic_value;
      if (row.cosmetic_type === "title") profile.title = String(row.cosmetic_value || "").trim() || null;
      else if (row.cosmetic_type === "color") profile.color = parseCosmeticColor(row.cosmetic_value);
      else if (row.cosmetic_type === "flair") profile.flair = String(row.cosmetic_value || "").trim() || null;
      else if (row.cosmetic_type === "car_paint") profile.carPaint = String(row.cosmetic_value || "").trim() || null;
    }
  } catch (err) {
    if (!String(err?.message || "").includes("no such table")) throw err;
  }
  return profile;
}

/**
 * Aggregate numeric effects from all boost items the user owns.
 * Ownership alone enables the effect.
 */
async function getUserBoostEffects(db, userId) {
  const effects = {
    workMultiplier: 1.0,
    truckMultiplier: 1.0,
    robJailBonus: 0,
    robFinePenalty: 0,
    cooldownMultiplier: 1.0,
    dailyBonus: 0,
    bountyAlert: false,
  };
  const owned = await getOwnedCosmeticIds(db, userId);
  for (const id of owned) {
    const def = COSMETICS[id];
    if (!def?.effect) continue;
    const eff = def.effect;
    if (typeof eff.workMultiplier === "number") effects.workMultiplier *= eff.workMultiplier;
    if (typeof eff.truckMultiplier === "number") effects.truckMultiplier *= eff.truckMultiplier;
    if (typeof eff.robJailBonus === "number") effects.robJailBonus += eff.robJailBonus;
    if (typeof eff.robFinePenalty === "number") effects.robFinePenalty += eff.robFinePenalty;
    if (typeof eff.cooldownMultiplier === "number") {
      // Take the strongest reduction — do not stack (keeps Gold Watch 25% ≥ VIP Watch 15%).
      effects.cooldownMultiplier = Math.min(effects.cooldownMultiplier, eff.cooldownMultiplier);
    }
    if (typeof eff.dailyBonus === "number") effects.dailyBonus += eff.dailyBonus;
    if (eff.bountyAlert) effects.bountyAlert = true;
  }
  effects.workMultiplier = Math.max(1.0, Math.min(4.0, effects.workMultiplier));
  effects.truckMultiplier = Math.max(1.0, Math.min(4.0, effects.truckMultiplier));
  effects.robJailBonus = Math.max(-0.5, Math.min(0.5, effects.robJailBonus));
  effects.robFinePenalty = Math.max(-0.75, Math.min(0, effects.robFinePenalty));
  effects.cooldownMultiplier = Math.max(0.25, Math.min(1.0, effects.cooldownMultiplier));
  effects.dailyBonus = Math.max(0, Math.min(500_000, effects.dailyBonus));
  return effects;
}

function applyUserCosmeticsToEmbed(embed, cosmeticProfile, username, fallbackColor) {
  if (fallbackColor != null) embed.setColor(fallbackColor);
  if (cosmeticProfile?.color != null) embed.setColor(cosmeticProfile.color);
  if (username) {
    embed.setAuthor({ name: formatCosmeticAuthorName(username, cosmeticProfile?.title || null) });
  }
  if (cosmeticProfile?.flair) {
    const existing = embed.data?.footer?.text;
    const suffix = existing ? `${existing} • ${cosmeticProfile.flair}` : cosmeticProfile.flair;
    embed.setFooter({ text: suffix });
  }
  return embed;
}

function decorateCarName(carName, carPaint) {
  if (!carPaint) return carName;
  return `${carName} «${carPaint}»`;
}

// -------------------------
// Commands
// -------------------------

function findCosmeticsByCategory(category) {
  return Object.entries(COSMETICS)
    .filter(([, def]) => def.category === category)
    .map(([id, def]) => ({ id, ...def }));
}

function getCosmeticsCommandBuilders() {
  return [
    new SlashCommandBuilder()
      .setName("shop")
      .setDescription("SAMP Life: магазин косметики и бонусов")
      .addStringOption((o) =>
        o
          .setName("category")
          .setDescription("Категория (необязательно)")
          .setRequired(false)
          .addChoices(
            { name: "🏷️ Титулы", value: "title" },
            { name: "🎨 Цвета", value: "color" },
            { name: "✨ Флейр профиля", value: "flair" },
            { name: "🚗 Покраска тачки", value: "car_paint" },
            { name: "🔫 Скины оружия", value: "weapon_skin" },
            { name: "⚡ Бонусы игрока", value: "boost" }
          )
      ),
    new SlashCommandBuilder()
      .setName("mycollection")
      .setDescription("SAMP Life: твоя коллекция косметики"),
    new SlashCommandBuilder()
      .setName("equip")
      .setDescription("SAMP Life: надеть косметику из коллекции")
      .addStringOption((o) =>
        o.setName("id").setDescription("ID предмета").setRequired(true).setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName("unequip")
      .setDescription("SAMP Life: снять косметику")
      .addStringOption((o) =>
        o.setName("id").setDescription("ID предмета").setRequired(true).setAutocomplete(true)
      ),
  ];
}

function buildShopEmbed(category, ownedIds, equippedMap) {
  const items = findCosmeticsByCategory(category);
  const catMeta = CATEGORIES[category] || { name: category, emoji: "🛍" };
  const ownedSet = new Set(ownedIds);
  const lines = items.map((item) => {
    const owned = ownedSet.has(item.id);
    const equippedValue = equippedMap[item.type];
    const equipped = String(equippedValue) === String(item.value);
    const price = item.price === 0 ? "бесплатно" : `${item.price.toLocaleString("ru-RU")}$`;
    const marker = equipped ? "✅" : owned ? "🎒" : "⬜";
    const desc = item.description ? ` — ${item.description}` : "";
    return `${marker} **\`${item.id}\`** • ${item.emoji || "•"} ${item.name} — **${price}**${desc}`;
  });
  return new EmbedBuilder()
    .setTitle(`${catMeta.emoji} ${catMeta.name}`)
    .setDescription(lines.length ? lines.join("\n") : "Пока ничего.")
    .setColor(0x9b59b6)
    .setFooter({
      text: "⬜ не куплено • 🎒 в коллекции • ✅ активно. Купить: /buycosmetic id:<id> • Надеть/снять: /equip /unequip.",
    });
}

async function handleShopCommand(interaction, db) {
  const userId = interaction.user.id;
  await ensureCosmeticsTables(db);
  const owned = await getOwnedCosmeticIds(db, userId);
  const equipped = await getUserCosmetics(db, userId);
  const equippedMap = equipped.raw || {};

  const category = interaction.options.getString("category");
  if (category) {
    const embed = buildShopEmbed(category, owned, equippedMap);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const overview = new EmbedBuilder()
    .setTitle("🛍 Магазин SAMP Life")
    .setDescription(
      Object.entries(CATEGORIES)
        .map(([key, meta]) => {
          const items = findCosmeticsByCategory(key);
          const prices = items.map((i) => i.price).filter((p) => p > 0);
          const range = prices.length
            ? `${Math.min(...prices).toLocaleString("ru-RU")}$ – ${Math.max(...prices).toLocaleString("ru-RU")}$`
            : "—";
          return `${meta.emoji} **${meta.name}** — ${items.length} предметов • ${range}`;
        })
        .join("\n") +
        "\n\nВыбери категорию ниже, чтобы посмотреть предметы и цены, или зови `/shop category:<...>` напрямую.",
    )
    .setColor(0x9b59b6);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cosmetics_shop_cat:${userId}`)
    .setPlaceholder("Выбери категорию")
    .addOptions(
      Object.entries(CATEGORIES).map(([key, meta]) => ({
        label: meta.name,
        value: key,
        emoji: meta.emoji,
      }))
    );

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.reply({ embeds: [overview], components: [row], ephemeral: true });
}

async function handleShopSelectMenu(interaction, db) {
  const [prefix, ownerId] = String(interaction.customId || "").split(":");
  if (prefix !== "cosmetics_shop_cat") return false;
  if (ownerId && ownerId !== interaction.user.id) {
    await interaction.reply({ content: "Это не твоё меню магазина.", ephemeral: true });
    return true;
  }
  const category = interaction.values?.[0];
  if (!category) return true;
  await ensureCosmeticsTables(db);
  const owned = await getOwnedCosmeticIds(db, interaction.user.id);
  const equipped = await getUserCosmetics(db, interaction.user.id);
  const embed = buildShopEmbed(category, owned, equipped.raw || {});
  await interaction.update({ embeds: [embed], components: interaction.message.components });
  return true;
}

async function handleMyCollectionCommand(interaction, db) {
  const userId = interaction.user.id;
  await ensureCosmeticsTables(db);
  const owned = await getOwnedCosmeticIds(db, userId);
  const equipped = await getUserCosmetics(db, userId);
  const equippedMap = equipped.raw || {};

  if (owned.length === 0) {
    await interaction.reply({
      content: "В твоей коллекции пока пусто. Посмотри магазин через **/shop** и купи что-нибудь через **/buycosmetic**.",
      ephemeral: true,
    });
    return;
  }

  const grouped = new Map();
  for (const id of owned) {
    const def = COSMETICS[id];
    if (!def) continue;
    if (!grouped.has(def.category)) grouped.set(def.category, []);
    grouped.get(def.category).push({ id, def });
  }

  const fields = [];
  for (const [category, items] of grouped) {
    const meta = CATEGORIES[category] || { name: category, emoji: "•" };
    const lines = items.map(({ id, def }) => {
      const equippedValue = equippedMap[def.type];
      const isEquipped = String(equippedValue) === String(def.value);
      const marker = def.category === "boost" ? "⚡" : isEquipped ? "⭐" : "•";
      return `${marker} \`${id}\` — ${def.name}`;
    });
    fields.push({ name: `${meta.emoji} ${meta.name} (${items.length})`, value: lines.join("\n"), inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle("🎒 Твоя коллекция")
    .setDescription(
      `Всего предметов: **${owned.length}** / ${Object.keys(COSMETICS).length}\n` +
        "⭐ — надето • ⚡ — бонус всегда активен • надеть/снять — **/equip** / **/unequip**.",
    )
    .addFields(fields)
    .setColor(0x9b59b6);
  applyUserCosmeticsToEmbed(embed, equipped, interaction.user.username, 0x9b59b6);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleEquipCommand(interaction, db, { equip = true } = {}) {
  const userId = interaction.user.id;
  const id = interaction.options.getString("id", true);
  await ensureCosmeticsTables(db);
  const def = COSMETICS[id];
  if (!def) {
    await interaction.reply({ content: `Неизвестный предмет: \`${id}\`.`, ephemeral: true });
    return;
  }

  if (equip) {
    const res = await equipCosmetic(db, userId, id);
    if (!res.ok) {
      if (res.reason === "NOT_OWNED") {
        await interaction.reply({ content: `У тебя нет \`${id}\` в коллекции. Купи через **/buycosmetic**.`, ephemeral: true });
      } else {
        await interaction.reply({ content: `Не получилось надеть \`${id}\`.`, ephemeral: true });
      }
      return;
    }
    if (res.alwaysActive) {
      await interaction.reply({ content: `⚡ \`${def.name}\` — это постоянный бонус, он уже активен.`, ephemeral: true });
      return;
    }
    await interaction.reply({ content: `⭐ Ты надел **${def.name}**.`, ephemeral: true });
    return;
  }

  const res = await unequipCosmetic(db, userId, id);
  if (!res.ok) {
    if (res.reason === "PERMANENT") {
      await interaction.reply({ content: `\`${def.name}\` нельзя снять — это постоянный бонус.`, ephemeral: true });
      return;
    }
    await interaction.reply({ content: `Не получилось снять \`${id}\`.`, ephemeral: true });
    return;
  }
  await interaction.reply({ content: `Ты снял **${def.name}**.`, ephemeral: true });
}

async function handleCosmeticsAutocomplete(interaction, db) {
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value || "").toLowerCase();
  const userId = interaction.user.id;

  const owned = await getOwnedCosmeticIds(db, userId).catch(() => []);
  const ownedSet = new Set(owned);

  const pool = Object.entries(COSMETICS).filter(([id, def]) => {
    if (def.category === "boost" || def.category === "weapon_skin") return false;
    return ownedSet.has(id);
  });

  const choices = pool
    .filter(([id, def]) => id.includes(query) || def.name.toLowerCase().includes(query))
    .slice(0, 25)
    .map(([id, def]) => ({ name: `${def.name} (${id})`, value: id }));

  await interaction.respond(choices);
}

module.exports = {
  COSMETICS,
  CATEGORIES,
  ensureCosmeticsTables,
  findCosmeticIdByTypeAndValue,
  getOwnedCosmeticIds,
  ownsCosmetic,
  addCosmeticToInventory,
  equipCosmetic,
  unequipCosmetic,
  getUserCosmetics,
  getUserBoostEffects,
  applyUserCosmeticsToEmbed,
  formatCosmeticAuthorName,
  getCosmeticBenefitText,
  decorateCarName,
  findCosmeticsByCategory,
  getCosmeticsCommandBuilders,
  handleShopCommand,
  handleShopSelectMenu,
  handleMyCollectionCommand,
  handleEquipCommand,
  handleCosmeticsAutocomplete,
};