"use strict";

/**
 * High-Stakes Prestige Casino constants.
 * Separate chip currency. 1 chip = 1 000 $
 */

const CHEMIN_DE_FER = {
  name: "Chemin de Fer",
  emoji: "🃏",
  description: "Банковская азартная игра: три пари, один на один с крупье.",
  minBet: 1_000,
  maxBet: 25_000,
  roundsPerSession: 3,
  baseWinChance: 0.42,
  tieChance: 0.09,
  naturalThreshold: 8,
  streakBonus: 0.015,
  maxStreakBonus: 0.075,
  houseEdgePerRound: 0.048,
  cooldownMs: 60 * 1000,
};

const BACCARAT = {
  name: "Золотой Баккара",
  emoji: "🎴",
  description: "Версия для VIP: ставка на Player, Banker или Tie. Комиссия 5% на Banker.",
  minBet: 500,
  maxBet: 50_000,
  playerWinChance: 0.446,
  bankerWinChance: 0.458,
  tieChance: 0.096,
  bankerCommission: 0.05,
  playerPayout: 2.0,
  tiePayout: 9.0,
  cooldownMs: 45 * 1000,
};

const HIGH_ROLLER = {
  name: "High Roller Wheel",
  emoji: "🎡",
  description: "Колесо фортуны для китов. 12 секторов.",
  minBet: 2_000,
  maxBet: 100_000,
  sectors: [
    { label: "Маленький Куш", factor: 0.5, weight: 3000 },
    { label: "Обмен", factor: 1.0, weight: 2500 },
    { label: "Прибыль", factor: 1.35, weight: 2000 },
    { label: "Дубль", factor: 2.0, weight: 1200 },
    { label: "Мега-Куш", factor: 3.5, weight: 800 },
    { label: "Джекпот", factor: 7.0, weight: 350 },
    { label: "Провал", factor: 0.0, weight: 1000 },
    { label: "Налог", factor: 0.15, weight: 700 },
    { label: "Сюрприз", factor: 0.75, weight: 500 },
    { label: "Подарок", factor: 1.15, weight: 800 },
    { label: "Бар", factor: 1.05, weight: 400 },
    { label: "VIP-Сюрприз", factor: 2.75, weight: 250 },
  ],
  maxDailySpins: 10,
  spinCooldownMs: 30 * 1000,
};

const PRESTIGE_CASINO_FREE_SPIN_MONEY_THRESHOLD = 50_000_000;
const PRESTIGE_CASINO_FREE_SPIN_REWARD = { min: 100, max: 500 };
const PRESTIGE_CASINO_ACCESS_MONEY = 10_000_000;
const CHIP_EXCHANGE_RATE = 1_000;

const VIP_MISSIONS = [
  { id: "spin_3", name: "Три спина", description: "Сделай 3 спина High Roller", rewardChips: 500 },
  { id: "win_chemin", name: "Банкир", description: "Выиграй раунд Chemin de Fer ≥5000 chips", rewardChips: 1200 },
  { id: "baccarat_5", name: "Профи", description: "Сыграй 5 раундов Баккара", rewardChips: 800 },
  { id: "capture_1", name: "Захватчик", description: "Захвати 1 район с бандой", rewardChips: 3000 },
  { id: "craft_1", name: "Мастер", description: "Скрафти 1 предмет", rewardChips: 600 },
  { id: "bm_prestige", name: "Теневой босс", description: "Купи 1 предмет Prestige Blackmarket", rewardChips: 400 },
];

module.exports = {
  CHEMIN_DE_FER,
  BACCARAT,
  HIGH_ROLLER,
  PRESTIGE_CASINO_FREE_SPIN_MONEY_THRESHOLD,
  PRESTIGE_CASINO_FREE_SPIN_REWARD,
  PRESTIGE_CASINO_ACCESS_MONEY,
  CHIP_EXCHANGE_RATE,
  VIP_MISSIONS,
};
