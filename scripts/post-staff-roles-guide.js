/**
 * Posts the channel guide (intro embed) in the staff-role requests hub.
 * Idempotent: if a guide from this bot already exists, edits that one;
 * otherwise posts a fresh message and pins it.
 */
const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require("discord.js");

const HUB_CHANNEL_ID = "1524528906869280920";
const GUIDE_FOOTER = "Bot staff-role-requests guide";

(async () => {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.Channel],
  });
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("DISCORD_TOKEN env required");
    process.exit(1);
  }

  client.once("ready", async () => {
    try {
      const channel = await client.channels.fetch(HUB_CHANNEL_ID);
      if (!channel || !channel.isTextBased()) {
        console.error("Hub channel not found / not text-based");
        process.exit(2);
      }

      const messages = await channel.messages.fetch({ limit: 20 });
      const existing = messages.find(
        (m) => m.author.id === client.user.id &&
               m.embeds?.[0]?.footer?.text === GUIDE_FOOTER,
      );

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Заявки на staff-роли")
        .setDescription(
          "Этот канал — для подачи заявок на роли **Администратор** или **Саппорт** (серверы Legacy и Home). " +
          "Заявки рассматривают модераторы Discord (роль 👑 Модератор Discord).",
        )
        .addFields(
          {
            name: "Как подать заявку",
            value:
              "1. В любом канале сервера введите `/request-staff-role`.\n" +
              "2. Выберите роль (Админ Legacy / Админ Home / Саппорт Legacy / Саппорт Home) — сервер определяется автоматически.\n" +
              "3. Заполните форму: игровой ник, ссылка на форумник, ссылка на VK или Telegram.\n" +
              "4. Бот создаст приватный тред с вашей заявкой и пинганёт модераторов.",
          },
          {
            name: "Правила",
            value:
              "• Подавать заявку может любой участник сервера, у которого ещё нет такой роли.\n" +
              "• В треде будут кнопки Одобрить / Отклонить / Переоформить.\n" +
              "• При отклонении модератор обязан указать причину — она придёт вам в ЛС.\n" +
              "• После отклонения действует кулдаун 5 минут на повторную заявку на ту же роль.\n" +
              "• Одобренная заявка выдаёт роль автоматически, тред закрывается.",
          },
          {
            name: "Конфиденциальность",
            value:
              "Треды в этом канале приватные — их видят только вы, модераторы Discord и бот. " +
              "Другие участники сервера содержимого не видят.",
          },
          {
            name: "Если что-то пошло не так",
            value:
              "• Не получилось подать заявку — напишите владельцу сервера.\n" +
              "• Не пришёл ЛС об отклонении — проверьте настройки приватности Discord.\n" +
              "• Хотите отозвать открытую заявку — нажмите Переоформить в её треде.",
          },
        )
        .setFooter({ text: GUIDE_FOOTER })
        .setTimestamp();

      if (existing) {
        await existing.edit({ embeds: [embed] });
        console.log("Edited existing guide message:", existing.id);
      } else {
        const msg = await channel.send({ embeds: [embed] });
        try { await msg.pin(); } catch (_) { /* pin perms might be missing */ }
        console.log("Posted new guide message:", msg.id);
      }
    } catch (e) {
      console.error("post-guide failed:", e);
      process.exitCode = 3;
    } finally {
      client.destroy();
    }
  });

  await client.login(token);
})();
