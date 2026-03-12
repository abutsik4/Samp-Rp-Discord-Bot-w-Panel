#!/usr/bin/env node

// Prints recent chat IDs that have interacted with the bot.
//
// Usage:
//   TELEGRAM_BOT_TOKEN=... node scripts/telegram-get-chatid.js
// Or put TELEGRAM_BOT_TOKEN in .env and run:
//   node scripts/telegram-get-chatid.js
//
// Helpful modes:
//   node scripts/telegram-get-chatid.js --poll
//     Poll getUpdates for ~60s (so you can send /start while it runs)
//
//   node scripts/telegram-get-chatid.js --delete-webhook
//     If getUpdates is blocked by a webhook, remove it without exposing token in shell history

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const axios = require("axios");

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN (set it in .env or env var).");
  process.exit(1);
}

const apiBase = `https://api.telegram.org/bot${token}`;

const args = new Set(process.argv.slice(2));
const shouldPoll = args.has("--poll");
const shouldDeleteWebhook = args.has("--delete-webhook");

async function getWebhookInfo() {
  const r = await axios.get(`${apiBase}/getWebhookInfo`, { timeout: 15000 });
  return r.data?.result || null;
}

async function deleteWebhook() {
  // drop_pending_updates=true clears queued updates that might be huge/noisy
  const r = await axios.post(`${apiBase}/deleteWebhook?drop_pending_updates=true`, null, { timeout: 15000 });
  return r.data;
}

function summarizeUpdate(u) {
  const msg = u?.message || u?.channel_post || u?.edited_message || u?.edited_channel_post;
  const chat = msg?.chat;
  if (!chat?.id) return null;

  const from = msg?.from;
  const label = [
    chat.type,
    chat.title,
    [chat.first_name, chat.last_name].filter(Boolean).join(" ") || null,
    chat.username ? `@${chat.username}` : null,
  ].filter(Boolean).join(" | ");

  return {
    chat_id: chat.id,
    chat_type: chat.type || null,
    chat_title: chat.title || null,
    chat_name: [chat.first_name, chat.last_name].filter(Boolean).join(" ") || null,
    chat_username: chat.username || null,
    from_username: from?.username || null,
    from_name: [from?.first_name, from?.last_name].filter(Boolean).join(" ") || null,
    last_text: msg?.text || msg?.caption || null,
    label,
  };
}

(async () => {
  try {
    if (shouldDeleteWebhook) {
      const info = await getWebhookInfo();
      if (info?.url) {
        await deleteWebhook();
        console.log("Webhook deleted. Now send your bot /start (DM) or /start@YourBot (group) and re-run.");
      } else {
        console.log("No webhook configured.");
      }
      process.exit(0);
    }

    const pollUntil = shouldPoll ? (Date.now() + 60_000) : Date.now();
    let updates = [];
    while (true) {
      const r = await axios.get(`${apiBase}/getUpdates`, { timeout: 15000 });
      updates = Array.isArray(r.data?.result) ? r.data.result : [];
      if (updates.length) break;
      if (!shouldPoll || Date.now() >= pollUntil) break;
      await new Promise((res) => setTimeout(res, 2500));
    }

    if (!updates.length) {
      // Common pitfall: webhook configured => getUpdates returns conflict. If it's just empty, still helpful to show webhook status.
      const info = await getWebhookInfo().catch(() => null);
      if (info?.url) {
        console.log("No updates via getUpdates because a webhook is configured.");
        console.log("Run: node scripts/telegram-get-chatid.js --delete-webhook");
        process.exit(0);
      }

      console.log("No updates yet.");
      console.log("- DM: open your bot chat and send /start (or any text), then re-run.");
      console.log("- Group: add the bot and send /start@YourBot or mention it, then re-run (privacy mode may hide normal messages).");
      console.log("Tip: run with --poll to wait ~60s while you send /start.");
      process.exit(0);
    }

    const seen = new Map();
    for (const u of updates) {
      const s = summarizeUpdate(u);
      if (!s) continue;
      // Keep the most recent summary for each chat.
      seen.set(String(s.chat_id), s);
    }

    const chats = Array.from(seen.values()).sort((a, b) => Number(a.chat_id) - Number(b.chat_id));

    console.log("Chat IDs found (set TELEGRAM_CHAT_ID to one of these):\n");
    for (const c of chats) {
      console.log(`- ${c.chat_id}    (${c.label})`);
    }

    console.log("\nTip: group/supergroup chat_ids are typically negative (often start with -100...).");
  } catch (e) {
    const status = e?.response?.status;
    const data = e?.response?.data;
    const errText = data?.description || data?.error || (typeof data === "string" ? data : null) || e?.message || String(e);
    if (String(errText).includes("Conflict") && String(errText).includes("getUpdates")) {
      console.error("Telegram getUpdates conflict: webhook is likely configured.");
      console.error("Fix: node scripts/telegram-get-chatid.js --delete-webhook");
      process.exit(2);
    }

    console.error(`Telegram getUpdates failed${status ? ` (HTTP ${status})` : ""}:`, data || e?.message || String(e));
    process.exit(2);
  }
})();
