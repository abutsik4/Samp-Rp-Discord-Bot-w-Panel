"use strict";

const PART_STAT_KEYS = ["topSpeed", "launch", "grip", "stability", "durability"];
const TUNE_LEVEL_MAX = 10;
const TUNE_LEVEL_XP_STEP = 6;
const TUNE_REMOVE_REFUND_RATIO = 0.6;

const CAR_TUNING_PARTS = {
  hydraulics: {
    id: "hydraulics",
    name: "Гидравлика Street Bounce",
    category: "style",
    slot: "stance",
    price: 10_000,
    minLevel: 1,
    modifiers: { launch: 6, grip: -3, stability: -8 },
    wearLoss: 3,
    legacySpeedBonus: 0,
    summary: "Резкий старт и шоу-эффект, но машина становится менее стабильной.",
  },
  wheels: {
    id: "wheels",
    name: "Chrome Wheels",
    category: "wheels",
    slot: "wheel_setup",
    price: 8_000,
    minLevel: 1,
    modifiers: { launch: 3, grip: 6, stability: 2 },
    wearLoss: 2,
    legacySpeedBonus: 3,
    summary: "Стритовый комплект дисков с небольшим бонусом к сцеплению.",
  },
  bodykit: {
    id: "bodykit",
    name: "Aero Bodykit",
    category: "aero",
    slot: "aero_package",
    price: 20_000,
    minLevel: 2,
    modifiers: { topSpeed: -2, grip: 8, stability: 9 },
    wearLoss: 2,
    legacySpeedBonus: 5,
    summary: "Добавляет зацеп и устойчивость, но тяжёлый обвес чуть режет максималку.",
  },
  sport_suspension: {
    id: "sport_suspension",
    name: "Sport Suspension",
    category: "chassis",
    slot: "suspension",
    price: 18_000,
    minLevel: 2,
    modifiers: { launch: 2, grip: 10, stability: 6 },
    wearLoss: 2,
    summary: "Сбалансированная подвеска для уличных и кольцевых заездов.",
  },
  short_gearbox: {
    id: "short_gearbox",
    name: "Short Gearbox",
    category: "powertrain",
    slot: "transmission",
    price: 18_000,
    minLevel: 2,
    modifiers: { topSpeed: -4, launch: 12, stability: -1 },
    wearLoss: 2,
    summary: "Рвёт с места, но режет верхнюю скорость.",
  },
  nos: {
    id: "nos",
    name: "NOS Bottle",
    category: "utility",
    slot: "nitrous",
    price: 15_000,
    minLevel: 3,
    modifiers: { topSpeed: 10, launch: 8, durability: -4 },
    wearLoss: 4,
    legacySpeedBonus: 10,
    summary: "Короткий агрессивный буст. Сильно ускоряет, но нагружает машину.",
  },
  slicks: {
    id: "slicks",
    name: "Slick Tires",
    category: "wheels",
    slot: "wheel_setup",
    price: 22_000,
    minLevel: 3,
    modifiers: { launch: 8, grip: 12, durability: -3 },
    wearLoss: 3,
    summary: "Лучшее сцепление для гонок, но изнашиваются быстрее обычных колёс.",
  },
  brake_kit: {
    id: "brake_kit",
    name: "Brake Kit",
    category: "utility",
    slot: "brake_package",
    price: 16_000,
    minLevel: 3,
    modifiers: { grip: 4, stability: 9, durability: 5 },
    wearLoss: 1,
    summary: "Стабилизирует машину и бережёт остальной билд.",
  },
  cooling_kit: {
    id: "cooling_kit",
    name: "Cooling Kit",
    category: "utility",
    slot: "cooling_system",
    price: 24_000,
    minLevel: 3,
    modifiers: { topSpeed: 4, stability: 3, durability: 12 },
    wearLoss: 1,
    summary: "Небольшой прирост скорости и заметно лучшая живучесть сборки.",
  },
  drag_suspension: {
    id: "drag_suspension",
    name: "Drag Suspension",
    category: "chassis",
    slot: "suspension",
    price: 28_000,
    minLevel: 4,
    modifiers: { topSpeed: 5, launch: 14, grip: -5, stability: -6 },
    wearLoss: 4,
    summary: "Для драг-сборок: бешеный старт, но хуже контроль на скорости.",
  },
  turbo: {
    id: "turbo",
    name: "Turbo Kit",
    category: "powertrain",
    slot: "forced_induction",
    price: 30_000,
    minLevel: 4,
    requirement: { type: "races_total", value: 3 },
    modifiers: { topSpeed: 15, launch: 6, stability: -3, durability: -5 },
    wearLoss: 4,
    legacySpeedBonus: 15,
    summary: "Высокая максималка с ценой в виде меньшей стабильности и ресурса.",
  },
  roll_cage: {
    id: "roll_cage",
    name: "Roll Cage",
    category: "chassis",
    slot: "reinforcement",
    price: 24_000,
    minLevel: 4,
    requirement: { type: "races_total", value: 5 },
    modifiers: { topSpeed: -3, launch: -2, stability: 10, durability: 12 },
    wearLoss: 1,
    summary: "Тяжёлая, но надёжная рама для выносливых и безопасных билдов.",
  },
  engine: {
    id: "engine",
    name: "Forged Engine V8",
    category: "powertrain",
    slot: "engine_core",
    price: 50_000,
    minLevel: 5,
    requirement: { type: "races_won", value: 3 },
    modifiers: { topSpeed: 20, launch: 7, durability: -2 },
    wearLoss: 3,
    legacySpeedBonus: 20,
    summary: "Главный апгрейд для быстрых билдов. Даёт сырую мощность без бесплатной управляемости.",
  },
};

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  if (numeric < min) return min;
  if (numeric > max) return max;
  return numeric;
}

function roundStat(value) {
  return Math.round(clampNumber(value, -999, 999));
}

function getTuningPart(partId) {
  return CAR_TUNING_PARTS[String(partId || "").toLowerCase()] || null;
}

function listTuningParts() {
  return Object.values(CAR_TUNING_PARTS);
}

function getTuningLevelFromExp(exp) {
  const numericExp = Math.max(0, Math.floor(Number(exp) || 0));
  return Math.min(TUNE_LEVEL_MAX, 1 + Math.floor(numericExp / TUNE_LEVEL_XP_STEP));
}

function getTuningLevelThreshold(level) {
  const safeLevel = clampNumber(level, 1, TUNE_LEVEL_MAX);
  return (safeLevel - 1) * TUNE_LEVEL_XP_STEP;
}

function getNextTuningLevelProgress(exp) {
  const numericExp = Math.max(0, Math.floor(Number(exp) || 0));
  const level = getTuningLevelFromExp(numericExp);
  if (level >= TUNE_LEVEL_MAX) {
    return {
      level,
      currentExp: numericExp,
      currentLevelExp: numericExp,
      nextLevelExp: numericExp,
      remainingExp: 0,
    };
  }
  const currentLevelExp = getTuningLevelThreshold(level);
  const nextLevelExp = getTuningLevelThreshold(level + 1);
  return {
    level,
    currentExp: numericExp,
    currentLevelExp,
    nextLevelExp,
    remainingExp: Math.max(0, nextLevelExp - numericExp),
  };
}

function getBaseCarTuningStats(car) {
  const speed = clampNumber(car?.speed || 0, 1, 220);
  const price = clampNumber(car?.price || 0, 0, 2_000_000);
  return {
    topSpeed: roundStat(speed),
    launch: roundStat(clampNumber(speed * 0.58 + 8, 6, 110)),
    grip: roundStat(clampNumber(speed * 0.45 + 12, 8, 110)),
    stability: roundStat(clampNumber(speed * 0.48 + 10, 8, 110)),
    durability: roundStat(clampNumber(65 + speed * 0.12 + Math.min(10, price / 100_000), 50, 100)),
  };
}

function getPartEffectiveness(durability) {
  const safeDurability = clampNumber(durability, 0, 100);
  return clampNumber(0.25 + (safeDurability / 100) * 0.75, 0.25, 1);
}

function applyPartModifiers(stats, modifiers, effectiveness) {
  const next = { ...stats };
  for (const key of PART_STAT_KEYS) {
    const delta = Number(modifiers?.[key] || 0);
    if (!delta) continue;
    next[key] += delta > 0 ? delta * effectiveness : delta;
  }
  return next;
}

function summarizeTuningPartModifiers(part) {
  const pieces = [];
  for (const key of PART_STAT_KEYS) {
    const delta = Number(part?.modifiers?.[key] || 0);
    if (!delta) continue;
    const sign = delta > 0 ? "+" : "";
    pieces.push(`${key}:${sign}${delta}`);
  }
  return pieces.join(", ");
}

function formatTuningPartStatSummary(part) {
  const labels = {
    topSpeed: "скорость",
    launch: "старт",
    grip: "зацеп",
    stability: "стабильность",
    durability: "ресурс",
  };
  return PART_STAT_KEYS
    .map((key) => {
      const delta = Number(part?.modifiers?.[key] || 0);
      if (!delta) return null;
      return `${labels[key]} ${delta > 0 ? "+" : ""}${delta}`;
    })
    .filter(Boolean)
    .join(", ");
}

function detectBuildType(profile) {
  const partIds = new Set((profile?.installedParts || []).map((part) => part.id));
  if (partIds.has("hydraulics") && partIds.has("bodykit")) return "Шоукар";
  if (profile.launch - profile.topSpeed >= 10) return "Драг";
  if (profile.grip + profile.stability - profile.topSpeed >= 18) return "Грип";
  if (profile.durability >= 88 && profile.stability >= 72) return "Танк";
  return "Стрит";
}

function buildCarTuningProfile(car, installedRows = [], tuningLevel = 1) {
  const baseStats = getBaseCarTuningStats(car);
  let computedStats = { ...baseStats };
  const installedParts = [];
  const slotMap = {};

  for (const row of installedRows || []) {
    const part = getTuningPart(row?.upgrade_id || row?.part_id || row?.id);
    if (!part) continue;
    const durability = clampNumber(row?.durability ?? 100, 0, 100);
    const effectiveness = getPartEffectiveness(durability);
    computedStats = applyPartModifiers(computedStats, part.modifiers, effectiveness);
    const summary = {
      ...part,
      durability: roundStat(durability),
      effectiveness,
    };
    installedParts.push(summary);
    slotMap[part.slot] = summary;
  }

  const averageDurability = installedParts.length
    ? roundStat(installedParts.reduce((sum, part) => sum + part.durability, 0) / installedParts.length)
    : 100;
  const wearPenalty = averageDurability < 55 ? Math.round((55 - averageDurability) / 6) : 0;

  const topSpeed = roundStat(clampNumber(computedStats.topSpeed, 1, 260));
  const launch = roundStat(clampNumber(computedStats.launch, 1, 140));
  const grip = roundStat(clampNumber(computedStats.grip, 1, 140));
  const stability = roundStat(clampNumber(computedStats.stability, 1, 140));
  const durability = roundStat(clampNumber(computedStats.durability, 1, 100));
  const raceScore = roundStat(topSpeed * 0.57 + launch * 0.18 + grip * 0.14 + stability * 0.11 - wearPenalty);
  const topSpeedBonus = topSpeed - baseStats.topSpeed;

  const profile = {
    name: car?.name || "Unknown",
    price: Number(car?.price || 0),
    baseTopSpeed: baseStats.topSpeed,
    baseStats,
    topSpeed,
    launch,
    grip,
    stability,
    durability,
    tuningLevel: clampNumber(tuningLevel, 1, TUNE_LEVEL_MAX),
    raceScore,
    averageDurability,
    topSpeedBonus,
    installedParts,
    installedBySlot: slotMap,
  };
  return {
    ...profile,
    buildType: detectBuildType(profile),
  };
}

function getTuningRequirementStatus(part, tuningProgress = {}, raceStats = {}) {
  const level = clampNumber(tuningProgress.level || 1, 1, TUNE_LEVEL_MAX);
  if (level < clampNumber(part?.minLevel || 1, 1, TUNE_LEVEL_MAX)) {
    return {
      ok: false,
      code: "level",
      current: level,
      required: clampNumber(part?.minLevel || 1, 1, TUNE_LEVEL_MAX),
    };
  }

  const requirement = part?.requirement || null;
  if (!requirement) {
    return { ok: true, code: null, current: level, required: level };
  }

  const required = Math.max(0, Math.floor(Number(requirement.value) || 0));
  let current = 0;

  if (requirement.type === "races_total") {
    current = Math.max(0, Math.floor(Number(raceStats.races_total || 0)));
  } else if (requirement.type === "races_won") {
    current = Math.max(0, Math.floor(Number(raceStats.races_won || 0)));
  } else if (requirement.type === "max_speed") {
    current = Math.max(0, Math.floor(Number(raceStats.max_speed_reached || 0)));
  }

  return {
    ok: current >= required,
    code: requirement.type,
    current,
    required,
  };
}

function formatTuningRequirementStatus(part, status) {
  if (!status || status.ok) return null;
  if (status.code === "level") {
    return `Нужен уровень тюнинга ${status.required}. Сейчас: ${status.current}.`;
  }
  if (status.code === "races_total") {
    return `Нужно гонок: ${status.required}. Сейчас: ${status.current}.`;
  }
  if (status.code === "races_won") {
    return `Нужно побед в гонках: ${status.required}. Сейчас: ${status.current}.`;
  }
  if (status.code === "max_speed") {
    return `Нужно достичь скорости ${status.required}. Сейчас: ${status.current}.`;
  }
  return `Требование для ${part?.name || "детали"} не выполнено.`;
}

module.exports = {
  CAR_TUNING_PARTS,
  PART_STAT_KEYS,
  TUNE_LEVEL_MAX,
  TUNE_LEVEL_XP_STEP,
  TUNE_REMOVE_REFUND_RATIO,
  buildCarTuningProfile,
  formatTuningPartStatSummary,
  formatTuningRequirementStatus,
  getBaseCarTuningStats,
  getNextTuningLevelProgress,
  getPartEffectiveness,
  getTuningLevelFromExp,
  getTuningLevelThreshold,
  getTuningPart,
  getTuningRequirementStatus,
  listTuningParts,
  summarizeTuningPartModifiers,
};