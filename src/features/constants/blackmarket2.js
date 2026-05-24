"use strict";

const BLACK_MARKET_PRESTIGE_ITEMS = [
  { name: "🧨 C4 Charge", type: "c4_charge", basePrice: [200_000, 400_000],
    description: "Разблокирует Secret Heist с +25% выплаты (одноразовый)", },
  { name: "🎭 Nullifier", type: "nullifier", basePrice: [300_000, 600_000],
    description: "1 час иммунитета к /rob. Не защищает от дуэлей.", },
  { name: "📱 Police Scanner", type: "police_scanner", basePrice: [150_000, 300_000],
    description: "Показывает таймер следующего захвата каждого района (одноразовый)", },
  { name: "🏎️ Ghost Plates", type: "ghost_plates", basePrice: [100_000, 200_000],
    description: "48ч защиты от угона машины и подрыва", },
  { name: "🧪 Adrenaline Shot", type: "adrenaline_shot", basePrice: [500_000, 1_000_000],
    description: "Мгновенный джейл-брейк (1 использование)", },
  { name: "📡 Signal Jammer", type: "signal_jammer", basePrice: [250_000, 500_000],
    description: "Блокирует Wiretap цели на 2ч (одноразовый, используется на @user)", },
  { name: "💣 Flashbang", type: "flashbang", basePrice: [80_000, 160_000],
    description: "У цели сбрасывается активное оружие. Применяется перед PvP /rob.", },
];

const BLACK_MARKET_PRESTIGE_GRANTS = {
  c4_charge: { inventoryItemId: "bm_c4_charge", inventoryQty: 1, maxInventoryQty: 1,
    summary: "C4 Charge добавлена. Используй /secretheist для бонуса.", isInstant: false },
  nullifier: { inventoryItemId: "bm_nullifier", inventoryQty: 1, maxInventoryQty: 1,
    durationHours: 1, summary: "Nullifier активен 1ч — /rob не срабатывает.", isInstant: false },
  police_scanner: { inventoryItemId: "bm_police_scanner", inventoryQty: 1, maxInventoryQty: 3,
    summary: "Scanner добавлен. Используй /scan для разведки.", isInstant: false },
  ghost_plates: { inventoryItemId: "bm_ghost_plates", inventoryQty: 1, maxInventoryQty: 1,
    durationHours: 48, summary: "Ghost Plates 48ч — защита от угона/подрыва.", isInstant: false },
  adrenaline_shot: { inventoryItemId: "bm_adrenaline", inventoryQty: 1, maxInventoryQty: 2,
    summary: "Adrenaline в инвентаре. /jailbreak для выхода.", isInstant: false },
  signal_jammer: { inventoryItemId: "bm_jammer", inventoryQty: 1, maxInventoryQty: 2,
    summary: "Signal Jammer. /jammer @user.", isInstant: false },
  flashbang: { inventoryItemId: "bm_flashbang", inventoryQty: 1, maxInventoryQty: 3,
    summary: "Flashbang. /flashbang @user перед /rob.", isInstant: false },
};

module.exports = { BLACK_MARKET_PRESTIGE_ITEMS, BLACK_MARKET_PRESTIGE_GRANTS };
