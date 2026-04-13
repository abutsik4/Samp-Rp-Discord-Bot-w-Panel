"use strict";

require("dotenv").config();

function parseArgs(argv) {
  const options = {
    guildId: process.env.GUILD_ID || "537187880842559499",
    userId: "",
    days: 60,
    limit: 100,
    channelId: "",
    start: "",
    end: "",
  };

  for (const arg of argv) {
    if (arg.startsWith("--guild=")) {
      options.guildId = arg.slice("--guild=".length).trim() || options.guildId;
      continue;
    }
    if (arg.startsWith("--user=")) {
      options.userId = arg.slice("--user=".length).trim();
      continue;
    }
    if (arg.startsWith("--days=")) {
      options.days = Math.max(1, Number(arg.slice("--days=".length)) || options.days);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      options.limit = Math.max(1, Number(arg.slice("--limit=".length)) || options.limit);
      continue;
    }
    if (arg.startsWith("--channel=")) {
      options.channelId = arg.slice("--channel=".length).trim();
      continue;
    }
    if (arg.startsWith("--start=")) {
      options.start = arg.slice("--start=".length).trim();
      continue;
    }
    if (arg.startsWith("--end=")) {
      options.end = arg.slice("--end=".length).trim();
    }
  }

  if (!options.userId) {
    throw new Error("--user=<discordUserId> is required");
  }

  return options;
}

function resolveWindow(options) {
  const start = options.start ? new Date(options.start) : new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
  const end = options.end ? new Date(options.end) : new Date();
  if (Number.isNaN(start.getTime())) throw new Error("Invalid --start value");
  if (Number.isNaN(end.getTime())) throw new Error("Invalid --end value");
  if (end <= start) throw new Error("--end must be after --start");
  return { start, end };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiRequest(route) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN is required");

  const res = await fetch(`https://discord.com/api/v10${route}`, {
    headers: { Authorization: `Bot ${token}` },
  });

  if (res.status === 429) {
    const body = await res.json().catch(() => ({}));
    const retryMs = Math.ceil(Number(body.retry_after || 1) * 1000);
    await sleep(retryMs);
    return apiRequest(route);
  }

  const text = await res.text();
  if (!res.ok) throw new Error(`Discord API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function normalizeMoney(raw) {
  const digits = String(raw || "").replace(/[^0-9-]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

function extractBalanceFromText(text) {
  if (!text) return null;
  const match = String(text).match(/Баланс:\s*\*\*([^*]+)\$\*\*/u);
  return match ? normalizeMoney(match[1]) : null;
}

function extractBalance(message) {
  const contentBalance = extractBalanceFromText(message.content);
  if (contentBalance != null) return contentBalance;

  for (const embed of message.embeds || []) {
    const descBalance = extractBalanceFromText(embed.description);
    if (descBalance != null) return descBalance;
    for (const field of embed.fields || []) {
      const fieldBalance = extractBalanceFromText(field.value);
      if (fieldBalance != null) return fieldBalance;
    }
  }

  return null;
}

function extractUserId(message) {
  return message.interaction_metadata?.user?.id || message.interaction?.user?.id || null;
}

function extractCommandName(message) {
  return message.interaction_metadata?.name || message.interaction?.name || null;
}

function shouldScanChannel(channel) {
  return [0, 5, 11, 12].includes(Number(channel.type));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const botUser = await apiRequest("/users/@me");
  const channels = await apiRequest(`/guilds/${options.guildId}/channels`);
  const window = resolveWindow(options);
  const rows = [];

  const selectedChannels = options.channelId
    ? channels.filter((channel) => String(channel.id) === String(options.channelId))
    : channels.filter(shouldScanChannel);

  for (const channel of selectedChannels) {
    let before = null;

    for (;;) {
      const qs = new URLSearchParams({ limit: "100" });
      if (before) qs.set("before", before);

      const batch = await apiRequest(`/channels/${channel.id}/messages?${qs.toString()}`).catch(() => []);
      if (!Array.isArray(batch) || batch.length === 0) break;

      let stopChannel = false;
      for (const message of batch) {
        const messageDate = new Date(message.timestamp);
        if (Number.isNaN(messageDate.getTime())) continue;
        if (messageDate < window.start) {
          stopChannel = true;
          continue;
        }
        if (messageDate >= window.end) continue;

        if (!message.author?.bot || message.author.id !== botUser.id) continue;
        if (extractUserId(message) !== options.userId) continue;

        const balance = extractBalance(message);
        if (balance == null) continue;

        rows.push({
          ts: message.timestamp,
          channelId: channel.id,
          channelName: channel.name,
          messageId: message.id,
          command: extractCommandName(message),
          balance,
          content: message.content || null,
        });
      }

      before = batch[batch.length - 1]?.id || null;
      if (!before || stopChannel) break;
      await sleep(150);
    }
  }

  rows.sort((left, right) => new Date(left.ts) - new Date(right.ts));
  const maxBalance = rows.reduce((best, row) => (!best || row.balance > best.balance ? row : best), null);
  const latest = rows[rows.length - 1] || null;
  const output = {
    userId: options.userId,
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    count: rows.length,
    maxBalance,
    latest,
    rows: rows.slice(-options.limit),
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});