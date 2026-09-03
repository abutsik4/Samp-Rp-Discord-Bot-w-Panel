"use strict";

const MATERIALS = {
  scrap_metal:       { id: "scrap_metal",      name: "Металлолом",          emoji: "🔩", price: 1_000,  sources: ["work","truck","rob"],    dropChance: 0.12 },
  electronic_parts:  { id: "electronic_parts", name: "Электронные детали",  emoji: "🔌", price: 3_000,  sources: ["work","airjob","heist"], dropChance: 0.08 },
  chemicals:         { id: "chemicals",        name: "Химикаты",            emoji: "🧪", price: 5_000,  sources: ["blackmarket","bizrun"],  dropChance: 0.05 },
  rare_alloy:        { id: "rare_alloy",       name: "Редкий сплав",        emoji: "⚙️", price: 10_000, sources: ["heist","truck"],         dropChance: 0.03 },
  diamonds:          { id: "diamonds",         name: "Алмазы",              emoji: "💎", price: 50_000, sources: ["blackmarket","heist"],   dropChance: 0.015 },
  blueprint:         { id: "blueprint",        name: "Фрагмент чертежа",    emoji: "📐", price: 2_500,  sources: ["work","daily","prestige_casino"], dropChance: 0.06 },
  gang_emblem:       { id: "gang_emblem",      name: "Эмблема банды",      emoji: "🏴", price: 7_500,  sources: ["gcapture","gangtop"],    dropChance: 0.10 },
  casino_token:      { id: "casino_token",     name: "Жетон казино",        emoji: "🎰", price: 5_000,  sources: ["prestige_casino"],       dropChance: 0.20 },
};

function getMaterialPrice(id) { return MATERIALS[id]?.price || 0; }

function rollMaterialDrops(action, rng = Math.random) {
  const drops = [];
  for (const m of Object.values(MATERIALS)) {
    if (!m.sources.includes(action)) continue;
    if (rng() < m.dropChance) {
      const qty = (action === "heist" && rng() < 0.3) ? 2 :
                  (action === "gcapture" && rng() < 0.2) ? 2 : 1;
      drops.push({ materialId: m.id, qty });
    }
  }
  return drops;
}

function buildCraftChoices(o) {
  for (const m of Object.values(MATERIALS)) {
    o.addChoices({ name: `${m.emoji} ${m.name} — ${m.price.toLocaleString("ru-RU")} $`, value: m.id });
  }
  return o;
}

const RECIPES = {
  medkit_pro:       { id: "medkit_pro",       name: "Продвинутая аптечка", emoji: "🩹", description: "+10% сопротивления 1ч.",      reqs: { scrap_metal: 3, electronic_parts: 1, chemicals: 1 }, outputQty: 1, baseCraftTimeMs: 5*60*1000, successChance: 0.95, outputItemId: "craft_medkit_pro" },
  kevlar_pro:       { id: "kevlar_pro",       name: "Кевлар Pro",          emoji: "🦺", description: "−40% урона /rob 2ч.",           reqs: { scrap_metal: 5, rare_alloy: 2, chemicals: 1 }, outputQty: 1, baseCraftTimeMs: 10*60*1000, successChance: 0.88, outputItemId: "craft_kevlar_pro" },
  nitro_x5:         { id: "nitro_x5",         name: "Нитро x5",            emoji: "🚀", description: "Пакет 5 баллонов.",             reqs: { scrap_metal: 2, electronic_parts: 2, chemicals: 2, rare_alloy: 1 }, outputQty: 1, baseCraftTimeMs: 8*60*1000, successChance: 0.90, outputItemId: "bm_nos_boost", outputQtyOverride: 5 },
  golden_deagle_kit:{ id: "golden_deagle_kit",name: "Набор 'Золотой DE'",emoji: "🟡", description: "Golden DE навсегда.",          reqs: { scrap_metal: 10, diamonds: 3, blueprint: 5, electronic_parts: 3 }, outputQty: 1, baseCraftTimeMs: 60*60*1000, successChance: 0.75, outputItemId: "weapon_skin_deagle", isPermanentCosmetic: true },
  gang_banner:      { id: "gang_banner",      name: "Боевой стяг",        emoji: "🚩", description: "+15% к /gang supportbiz.",           reqs: { scrap_metal: 5, gang_emblem: 3, blueprint: 2 }, outputQty: 1, baseCraftTimeMs: 15*60*1000, successChance: 0.85, outputItemId: "craft_gang_banner" },
  stock_hacker:     { id: "stock_hacker",     name: "Взломщик Биржи",    emoji: "📘", description: "12% шанс предсказать тик.",    reqs: { electronic_parts: 10, rare_alloy: 5, blueprint: 3, diamonds: 1 }, outputQty: 1, baseCraftTimeMs: 30*60*1000, successChance: 0.65, outputItemId: "craft_stock_hacker" },
  heist_drill:      { id: "heist_drill",      name: "Бур Сейфа",          emoji: "🔨", description: "−30% время Secret Heist.",     reqs: { scrap_metal: 8, rare_alloy: 4, electronic_parts: 2 }, outputQty: 1, baseCraftTimeMs: 20*60*1000, successChance: 0.82, outputItemId: "craft_heist_drill" },
};

module.exports = { MATERIALS, RECIPES, getMaterialPrice, rollMaterialDrops, buildCraftChoices };
