"use strict";

require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const { dbRun, dbGet } = require("../src/utils/db-helpers");

const DEFAULT_GUILD_ID = process.env.GUILD_ID || "537187880842559499";
const DEFAULT_DB_PATH = process.env.STATS_DB_PATH
  ? path.resolve(process.env.STATS_DB_PATH)
  : path.join(__dirname, "..", "data", "stats.db");

function parseArgs(argv) {
  const options = {
    apply: false,
    days: 30,
    guildId: DEFAULT_GUILD_ID,
    dbPath: DEFAULT_DB_PATH,
    strategy: "latest",
    start: null,
    end: null,
    channelId: "",
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg.startsWith("--days=")) {
      options.days = Math.max(1, Number(arg.slice("--days=".length)) || 30);
      continue;
    }
    if (arg.startsWith("--guild=")) {
      options.guildId = arg.slice("--guild=".length).trim() || options.guildId;
      continue;
    }
    if (arg.startsWith("--db=")) {
      options.dbPath = path.resolve(arg.slice("--db=".length));
      continue;
    }
    if (arg.startsWith("--strategy=")) {
      const strategy = arg.slice("--strategy=".length).trim().toLowerCase();
      if (["latest", "max"].includes(strategy)) {
        options.strategy = strategy;
      }
      continue;
    }
    if (arg.startsWith("--start=")) {
      options.start = arg.slice("--start=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--end=")) {
      options.end = arg.slice("--end=".length).trim() || null;
      continue;
    }
    if (arg.startsWith("--channel=")) {
      options.channelId = arg.slice("--channel=".length).trim();
    }
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

function asDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shouldScanChannel(channel) {
  return [0, 5, 11, 12].includes(Number(channel.type));
}

async function collectLatestBalanceSnapshots(guildId, windowStart, windowEnd, botUserId, options = {}) {
  const channels = await apiRequest(`/guilds/${guildId}/channels`);
  const selectedChannels = options.channelId
    ? channels.filter((channel) => String(channel.id) === String(options.channelId))
    : channels;
  const snapshots = new Map();

  for (const channel of selectedChannels.filter(shouldScanChannel)) {
    let before = null;

    for (;;) {
      const qs = new URLSearchParams({ limit: "100" });
      if (before) qs.set("before", before);

      const batch = await apiRequest(`/channels/${channel.id}/messages?${qs.toString()}`).catch(() => []);
      if (!Array.isArray(batch) || batch.length === 0) break;

      let stopChannel = false;
      for (const message of batch) {
        const messageDate = asDate(message.timestamp);
        if (!messageDate) continue;
        if (messageDate < windowStart) {
          stopChannel = true;
          continue;
        }
        if (messageDate >= windowEnd) continue;

        if (!message.author?.bot || message.author.id !== botUserId) continue;

        const balance = extractBalance(message);
        const userId = extractUserId(message);
        if (!userId || balance == null) continue;

        const current = snapshots.get(userId);
        const shouldReplace = !current
          || (options.strategy === "max"
            ? balance > current.balance || (balance === current.balance && messageDate > current.timestamp)
            : messageDate > current.timestamp);
        if (shouldReplace) {
          snapshots.set(userId, {
            userId,
            balance,
            timestamp: messageDate,
            timestampIso: messageDate.toISOString(),
            channelId: message.channel_id || channel.id,
            messageId: message.id,
            commandName: extractCommandName(message),
          });
        }
      }

      before = batch[batch.length - 1]?.id || null;
      if (!before || stopChannel) break;
      await sleep(200);
    }
  }

  return snapshots;
}

async function ensureUserRow(db, userId) {
  await dbRun(
    db,
    `INSERT OR IGNORE INTO samp_users(user_id, money, car_id, rep, jail_until)
     VALUES(?, 0, 'bicycle', 0, 0)`,
    [String(userId)]
  );
}

async function applyRestorePlan(db, guildId, plan, reportPath) {
  if (!plan.length) return { restoredUsers: 0, totalRestored: 0 };

  let restoredUsers = 0;
  let totalRestored = 0;

  await dbRun(db, "BEGIN IMMEDIATE");
  try {
    for (const item of plan) {
      await ensureUserRow(db, item.userId);
      await dbRun(
        db,
        `UPDATE samp_users SET money = money + ?, updated_at = datetime('now') WHERE user_id = ?`,
        [item.restoreAmount, item.userId]
      );
      await dbRun(
        db,
        `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json)
         VALUES('history_restore', NULL, ?, ?, ?)`,
        [
          item.userId,
          item.restoreAmount,
          JSON.stringify({
            source: "discord_history",
            guildId,
            reportPath,
            previousMoney: item.currentMoney,
            restoredTo: item.confirmedBalance,
            observedAt: item.observedAt,
            messageId: item.messageId,
            channelId: item.channelId,
            commandName: item.commandName,
          }),
        ]
      );
      restoredUsers += 1;
      totalRestored += item.restoreAmount;
    }

    await dbRun(db, "COMMIT");
  } catch (error) {
    try {
      await dbRun(db, "ROLLBACK");
    } catch (_) {
      // ignore rollback failure
    }
    throw error;
  }

  return { restoredUsers, totalRestored };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const botUser = await apiRequest("/users/@me");
  const window = resolveWindow(options);

  console.log(
    `Scanning guild ${options.guildId} for balance messages ` +
      `from ${window.start.toISOString()} to ${window.end.toISOString()} ` +
      `(strategy=${options.strategy}${options.channelId ? `, channel=${options.channelId}` : ""})...`
  );
  const snapshots = await collectLatestBalanceSnapshots(options.guildId, window.start, window.end, botUser.id, options);
  console.log(`Found ${snapshots.size} users with confirmed balances in Discord history.`);

  const db = new sqlite3.Database(options.dbPath);
  const plan = [];

  try {
    for (const snapshot of snapshots.values()) {
      const row = await dbGet(db, `SELECT money FROM samp_users WHERE user_id = ?`, [snapshot.userId]);
      const currentMoney = Number(row?.money || 0);
      if (snapshot.balance > currentMoney) {
        plan.push({
          userId: snapshot.userId,
          currentMoney,
          confirmedBalance: snapshot.balance,
          restoreAmount: snapshot.balance - currentMoney,
          observedAt: snapshot.timestampIso,
          messageId: snapshot.messageId,
          channelId: snapshot.channelId,
          commandName: snapshot.commandName,
        });
      }
    }

    plan.sort((left, right) => right.restoreAmount - left.restoreAmount || left.userId.localeCompare(right.userId));

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const reportDir = path.join(__dirname, "..", "backups", "money-restores");
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `${stamp}_discord_history_restore.json`);
    const report = {
      createdAt: new Date().toISOString(),
      guildId: options.guildId,
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString(),
      strategy: options.strategy,
      channelId: options.channelId || null,
      apply: options.apply,
      matchedUsers: snapshots.size,
      plannedUsers: plan.length,
      totalRestore: plan.reduce((sum, item) => sum + item.restoreAmount, 0),
      plan,
    };
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

    console.log(`Planned restores: ${plan.length} users, total ${report.totalRestore.toLocaleString("ru-RU")} $`);
    console.log(`Report saved to ${reportPath}`);
    for (const item of plan.slice(0, 20)) {
      console.log(
        `${item.userId}: +${item.restoreAmount.toLocaleString("ru-RU")} $ ` +
          `(current=${item.currentMoney.toLocaleString("ru-RU")}, confirmed=${item.confirmedBalance.toLocaleString("ru-RU")}, command=${item.commandName || "unknown"})`
      );
    }

    if (!options.apply) {
      console.log("Dry run only. Re-run with --apply to restore balances.");
      return;
    }

    const result = await applyRestorePlan(db, options.guildId, plan, reportPath);
    console.log(
      `Applied restore: ${result.restoredUsers} users, ` +
        `${result.totalRestored.toLocaleString("ru-RU")} $ restored.`
    );
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});