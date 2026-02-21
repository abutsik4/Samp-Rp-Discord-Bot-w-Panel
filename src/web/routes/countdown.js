const { Router } = require("express");
const { EmbedBuilder } = require("discord.js");
const { getCountdownConfig, setCountdownConfig, updateCountdownLastPosted } = require("../../features/rate-limiter");

function createCountdownRouter(ctx) {
  const router = Router();
  const {
    PANEL_BASE, requireAuth, requireAdmin, apiLimiter, bots, db, client,
    ruPlural,
  } = ctx;

  router.get(`${PANEL_BASE}/api/:botKey/countdown/config`, requireAuth, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.query?.guildId || "");
    if (!guildId) return res.status(400).json({ error: "guildId required" });

    try {
      const config = await getCountdownConfig(db, guildId);
      return res.json({ config });
    } catch (e) {
      console.error("Get countdown config error:", e);
      return res.status(500).json({ error: e?.message || "Failed to get config" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/countdown/config`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.body?.guildId || "");
    const config = req.body?.config;

    if (!guildId) return res.status(400).json({ error: "guildId required" });
    if (!config) return res.status(400).json({ error: "config required" });

    try {
      await setCountdownConfig(db, guildId, config);
      return res.json({ ok: true });
    } catch (e) {
      console.error("Set countdown config error:", e);
      return res.status(500).json({ error: e?.message || "Failed to set config" });
    }
  });

  router.post(`${PANEL_BASE}/api/:botKey/countdown/test`, requireAuth, requireAdmin, apiLimiter, async (req, res) => {
    const bot = bots.find((b) => b.key === req.params.botKey);
    if (!bot) return res.status(404).json({ error: "Bot not found" });

    const guildId = String(req.body?.guildId || "");
    if (!guildId) return res.status(400).json({ error: "guildId required" });

    try {
      const config = await getCountdownConfig(db, guildId);
      if (!config.channel_id) return res.status(400).json({ error: "No channel configured" });

      const now = new Date();
      const nextYear = now.getMonth() === 11 && now.getDate() === 31 && now.getHours() >= 21
        ? now.getFullYear() + 1
        : (now.getMonth() === 0 && now.getDate() === 1 ? now.getFullYear() : now.getFullYear() + 1);
      const newYear = new Date(`${nextYear}-01-01T00:00:00+03:00`);
      const diff = newYear.getTime() - now.getTime();

      let description;
      if (diff <= 0) {
        description = "С Новым Годом! 🎉";
      } else {
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        description = `**${days}** ${ruPlural(days, "день", "дня", "дней")}, **${hours}** ${ruPlural(hours, "час", "часа", "часов")}, **${minutes}** ${ruPlural(minutes, "минута", "минуты", "минут")}, **${seconds}** ${ruPlural(seconds, "секунда", "секунды", "секунд")}`;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎆 Обратный отсчёт до Нового Года ${nextYear}!`)
        .setDescription(description)
        .setColor(0xfbbf24)
        .setTimestamp();

      const channel = await client.channels.fetch(config.channel_id);
      if (!channel || !channel.isTextBased()) return res.status(400).json({ error: "Invalid channel" });

      await channel.send({ embeds: [embed] });
      await updateCountdownLastPosted(db, guildId);

      return res.json({ ok: true });
    } catch (e) {
      console.error("Test countdown error:", e);
      return res.status(500).json({ error: e?.message || "Failed to send countdown" });
    }
  });

  return router;
}

module.exports = { createCountdownRouter };
