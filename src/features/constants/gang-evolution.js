"use strict";

const GANG_LEVEL_THRESHOLDS = [
  { level: 1, xp: 0,    label: "Шайка",   perMemberMoneyBonus: 0,    captureBonus: 0,  name: "Rabble", perk: null },
  { level: 2, xp: 500,  label: "Экипаж",  perMemberMoneyBonus: 0.02, captureBonus: 5,  name: "Crew",   perk: "underground_network" },
  { level: 3, xp: 1500, label: "Банда",   perMemberMoneyBonus: 0.04, captureBonus: 10, name: "Gang",   perk: "arms_dealer" },
  { level: 4, xp: 4000, label: "Организация", perMemberMoneyBonus: 0.07, captureBonus: 18, name: "Org",   perk: "protection_racket" },
  { level: 5, xp: 8000, label: "Картель",  perMemberMoneyBonus: 0.10, captureBonus: 25, name: "Cartel", perk: "banking" },
  { level: 6, xp: 15000,label: "Синдикат", perMemberMoneyBonus: 0.14, captureBonus: 40, name: "Synd",   perk: "casino_share" },
  { level: 7, xp: 25000,label: "Империя",  perMemberMoneyBonus: 0.20, captureBonus: 60, name: "Empire", perk: "empire_color" },
];

function getGangLevelByXp(xp) { let lvl = GANG_LEVEL_THRESHOLDS[0]; for (const t of GANG_LEVEL_THRESHOLDS) { if (xp >= t.xp) lvl = t; } return lvl; }

const GANG_LEGACY_STAR_COST = 500_000;
const GANG_LEGACY_STAR_CAP = 50;
const GANG_LEGACY_BONUSES = [
  { stars: 1,  label: "Легенда района",   moneyBonus: 0.05 },
  { stars: 5,  label: "Король улиц",      moneyBonus: 0.10 },
  { stars: 10, label: "Неприкасаемый",     moneyBonus: 0.18 },
  { stars: 20, label: "Криминальный бог",  moneyBonus: 0.30 },
  { stars: 30, label: "Теневой правитель", moneyBonus: 0.45 },
  { stars: 50, label: "Миф",              moneyBonus: 0.70 },
];
function getLegacyBonus(stars) { let b = GANG_LEGACY_BONUSES[0]; for (const t of GANG_LEGACY_BONUSES) { if (stars >= t.stars) b = t; } return b; }

const GANG_XP_CAPTURE = 40, GANG_XP_DEFEND = 20, GANG_XP_SUPPORT = 10, GANG_XP_HEIST_WIN = 80;

const GANG_PERK_DESCRIPTIONS = {
  underground_network: "Члены видят список врагов чужой банды (в /gang info).",
  arms_dealer: "−15% на оружие в Blackmarket (включая Prestige).",
  protection_racket: "Пассивный доход: +2% от каждого невладельческого бизнеса в контролируемых районах.",
  banking: "Казначей может снимать 10% от казны раз в день без штрафа.",
  casino_share: "+0.5% к chip-дропу из Prestige Casino для всех членов.",
  empire_color: "Пользовательский цвет тега банды на /gmap.",
};

module.exports = {
  GANG_LEVEL_THRESHOLDS, getGangLevelByXp, GANG_LEGACY_STAR_COST, GANG_LEGACY_STAR_CAP,
  GANG_LEGACY_BONUSES, getLegacyBonus, GANG_XP_CAPTURE, GANG_XP_DEFEND, GANG_XP_SUPPORT,
  GANG_XP_HEIST_WIN, GANG_PERK_DESCRIPTIONS,
};
