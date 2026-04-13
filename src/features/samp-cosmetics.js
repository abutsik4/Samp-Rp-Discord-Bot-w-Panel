"use strict";

const { dbAll } = require("../utils/db-helpers");

const COSMETICS = {
  title_og: { name: "Титул: OG", type: "title", price: 25_000, value: "OG" },
  title_legend: { name: "Титул: Легенда", type: "title", price: 100_000, value: "Легенда" },
  title_king: { name: "Титул: Король SA", type: "title", price: 250_000, value: "Король SA" },
  color_gold: { name: "Цвет: Золотой", type: "color", price: 30_000, value: "0xf1c40f" },
  color_red: { name: "Цвет: Красный", type: "color", price: 30_000, value: "0xe74c3c" },
  color_purple: { name: "Цвет: Фиолетовый", type: "color", price: 30_000, value: "0x9b59b6" },
  color_green: { name: "Цвет: Зелёный", type: "color", price: 30_000, value: "0x2ecc71" },
};

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
  if (cosmetic.type === "title") return "Показывается в author-строке твоих профильных embed'ов.";
  if (cosmetic.type === "color") return "Используется как цвет твоих профильных embed'ов.";
  return "";
}

async function getUserCosmetics(db, userId) {
  try {
    const rows = await dbAll(
      db,
      "SELECT cosmetic_type, cosmetic_value FROM samp_cosmetics WHERE user_id = ?",
      [String(userId)]
    );
    const profile = {
      title: null,
      color: null,
      raw: {},
    };
    for (const row of rows || []) {
      profile.raw[row.cosmetic_type] = row.cosmetic_value;
      if (row.cosmetic_type === "title") profile.title = String(row.cosmetic_value || "").trim() || null;
      if (row.cosmetic_type === "color") profile.color = parseCosmeticColor(row.cosmetic_value);
    }
    return profile;
  } catch (error) {
    if (String(error?.message || error).includes("no such table")) {
      return { title: null, color: null, raw: {} };
    }
    throw error;
  }
}

function applyUserCosmeticsToEmbed(embed, cosmeticProfile, username, fallbackColor) {
  if (fallbackColor != null) embed.setColor(fallbackColor);
  if (cosmeticProfile?.color != null) embed.setColor(cosmeticProfile.color);
  if (username) {
    embed.setAuthor({ name: formatCosmeticAuthorName(username, cosmeticProfile?.title || null) });
  }
  return embed;
}

module.exports = {
  COSMETICS,
  getUserCosmetics,
  applyUserCosmeticsToEmbed,
  getCosmeticBenefitText,
  formatCosmeticAuthorName,
};