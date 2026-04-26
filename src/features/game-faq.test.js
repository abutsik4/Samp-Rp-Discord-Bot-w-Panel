"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getGameFaqTopic,
  searchGameFaq,
  buildGameFaqMarkdown,
  handleGameFaqCommand,
  buildGameFaqDocsPosts,
  tryAnswerGameFaqInChat,
} = require("./game-faq");

test("game faq topic lookup returns known section", () => {
  const topic = getGameFaqTopic("badges");

  assert.ok(topic);
  assert.equal(topic.title, "Бейджи, перки и XP-бусты");
});

test("game faq search finds level-up guidance", () => {
  const [match] = searchGameFaq("как повышать уровень на сервере");

  assert.ok(match);
  assert.equal(match.entry.id, "levels-up");
});

test("game faq search finds badge purpose guidance", () => {
  const [match] = searchGameFaq("зачем нужны бейджи");

  assert.ok(match);
  assert.equal(match.entry.id, "badges-purpose");
});

test("game faq search finds tune leveling guidance", () => {
  const [match] = searchGameFaq("как повысить уровень тюнинга авто");

  assert.ok(match);
  assert.equal(match.entry.id, "cars-tuning-level");
});

test("game faq markdown includes core sections", () => {
  const markdown = buildGameFaqMarkdown();

  assert.match(markdown, /# Игровой FAQ JepsenCloud Bot/);
  assert.match(markdown, /## Старт и первые деньги/);
  assert.match(markdown, /## Бейджи, перки и XP-бусты/);
  assert.match(markdown, /### Как повышать уровень\?/);
  assert.match(markdown, /### Как повысить уровень тюнинга авто\?/);
});

test("game faq docs posts build multiple Discord-friendly messages", () => {
  const posts = buildGameFaqDocsPosts();

  function countEmbedChars(embed) {
    let total = 0;
    total += String(embed.title || "").length;
    total += String(embed.description || "").length;
    total += String(embed.footer?.text || "").length;
    for (const field of embed.fields || []) {
      total += String(field.name || "").length;
      total += String(field.value || "").length;
    }
    return total;
  }

  assert.ok(posts.length >= 4);
  assert.equal(posts[0].lookupTitle, "📘 FAQ — Старт, деньги и базовый цикл");
  assert.ok(posts.every((post) => Array.isArray(post.embeds) && post.embeds.length >= 2));
  assert.ok(posts.every((post) => post.embeds.every((embed) => countEmbedChars(embed) <= 6000)));
  assert.ok(posts.every((post) => post.embeds.reduce((sum, embed) => sum + countEmbedChars(embed), 0) <= 6000));
  assert.ok(posts.every((post) => post.embeds.every((embed) => (embed.fields || []).every((field) => field.value.length <= 1024))));
  assert.ok(posts.every((post) => post.embeds.every((embed) => !JSON.stringify(embed).includes("…"))));
  assert.match(JSON.stringify(posts[0]), /активный стартовый транспорт `Велосипед` и автоматически запускается квест новичка\./);
});

test("game faq handler returns overview embed with no options", async () => {
  const replies = [];
  const interaction = {
    options: {
      getString: () => null,
    },
    reply: async (payload) => {
      replies.push(payload);
    },
  };

  await handleGameFaqCommand(interaction);

  assert.equal(replies.length, 1);
  assert.equal(replies[0].embeds[0].data.title, "📘 Игровой FAQ");
});

test("game faq handler returns matched answer embed", async () => {
  const replies = [];
  const interaction = {
    options: {
      getString: (name) => {
        if (name === "question") return "как выйти из тюрьмы";
        return null;
      },
    },
    reply: async (payload) => {
      replies.push(payload);
    },
  };

  await handleGameFaqCommand(interaction);

  assert.equal(replies.length, 1);
  assert.match(replies[0].embeds[0].data.description, /`\/bail`/);
});

test("game faq chat autoanswer replies to strong gameplay question", async () => {
  const replies = [];
  const message = {
    content: "как выйти из тюрьмы?",
    guild: { id: "g1" },
    channel: { id: "541024085283700741" },
    author: { id: "u1", bot: false },
    client: { user: { id: "bot1" } },
    mentions: { users: { has: () => false } },
    reply: async (payload) => {
      replies.push(payload);
    },
  };

  const handled = await tryAnswerGameFaqInChat(message);

  assert.equal(handled, true);
  assert.equal(replies.length, 1);
  assert.match(replies[0].embeds[0].data.description, /\/bail/);
});

test("game faq chat autoanswer ignores ambiguous low-signal text", async () => {
  const replies = [];
  const message = {
    content: "как это работает",
    guild: { id: "g1" },
    channel: { id: "1492082119466287114" },
    author: { id: "u1", bot: false },
    client: { user: { id: "bot1" } },
    mentions: { users: { has: () => false } },
    reply: async (payload) => {
      replies.push(payload);
    },
  };

  const handled = await tryAnswerGameFaqInChat(message);

  assert.equal(handled, false);
  assert.equal(replies.length, 0);
});

test("game faq chat autoanswer ignores disallowed channels", async () => {
  const replies = [];
  const message = {
    content: "как выйти из тюрьмы?",
    guild: { id: "g1" },
    channel: { id: "c-disallowed" },
    author: { id: "u1", bot: false },
    client: { user: { id: "bot1" } },
    mentions: { users: { has: () => false } },
    reply: async (payload) => {
      replies.push(payload);
    },
  };

  const handled = await tryAnswerGameFaqInChat(message);

  assert.equal(handled, false);
  assert.equal(replies.length, 0);
});

test("game faq answer embed dedupes repeated command suggestions", async () => {
  const replies = [];
  const interaction = {
    options: {
      getString: (name) => {
        if (name === "question") return "для чего нужны косметика лотерея и черный рынок";
        return null;
      },
    },
    reply: async (payload) => {
      replies.push(payload);
    },
  };

  await handleGameFaqCommand(interaction);

  assert.equal(replies.length, 1);
  const commandsField = replies[0].embeds[0].data.fields.find((field) => field.name === "Полезные команды");
  const commands = String(commandsField?.value || "").trim().split(/\s+/).filter(Boolean);
  assert.equal(commands.length, new Set(commands).size, "FAQ command suggestions should not repeat commands");
});