"use strict";

/**
 * Stock market price-tick engine.
 *
 * Runs every STOCK_TICK_MINUTES from schedulers.js. Each tick:
 *   1. For each ticker: random walk via Gaussian-ish noise scaled by `volatility`.
 *   2. Small chance to fire a news event for the ticker (delta + flavor text).
 *   3. Clamp price to [basePrice * 0.25, basePrice * 4.0].
 *   4. Persist to samp_stock_prices and append samp_stock_history (capped).
 *
 * Returns array of news events fired this tick so the caller can announce them.
 */

const { dbRun, dbGet, dbAll } = require("../utils/db-helpers");
const {
  STOCKS,
  STOCK_NEWS_CHANCE_PER_TICK,
  STOCK_HISTORY_LIMIT,
} = require("./constants/prestige");

function gauss() {
  // Box-Muller approximation
  const u = 1 - Math.random();
  const v = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function runStockTick(db) {
  const events = [];
  for (const [ticker, meta] of Object.entries(STOCKS)) {
    const row = await dbGet(db, "SELECT price FROM samp_stock_prices WHERE ticker = ?", [ticker]);
    let price = Number(row?.price ?? meta.basePrice);

    // Drift toward base (mean-reverting) + volatility shock
    const driftPct = (meta.basePrice - price) / meta.basePrice * 0.02;
    const shock = gauss() * meta.volatility;
    let newPrice = price * (1 + driftPct + shock);

    // News event roll
    let news = null;
    if (Math.random() < STOCK_NEWS_CHANCE_PER_TICK && meta.news?.length) {
      news = meta.news[Math.floor(Math.random() * meta.news.length)];
      newPrice *= 1 + news.delta;
    }

    // Clamp
    const min = meta.basePrice * 0.25;
    const max = meta.basePrice * 4.0;
    newPrice = Math.max(min, Math.min(max, newPrice));
    newPrice = Math.round(newPrice * 100) / 100;

    await dbRun(
      db,
      `INSERT INTO samp_stock_prices(ticker, price, updated_at) VALUES(?, ?, datetime('now'))
       ON CONFLICT(ticker) DO UPDATE SET price = excluded.price, updated_at = excluded.updated_at`,
      [ticker, newPrice]
    );
    await dbRun(db, "INSERT INTO samp_stock_history(ticker, price) VALUES(?, ?)", [ticker, newPrice]);

    if (news) {
      events.push({ ticker, price: newPrice, text: news.text, delta: news.delta });
    }
  }

  // Trim history per ticker
  await dbRun(
    db,
    `DELETE FROM samp_stock_history
      WHERE id IN (
        SELECT h.id FROM samp_stock_history h
        WHERE h.id NOT IN (
          SELECT id FROM samp_stock_history s
          WHERE s.ticker = h.ticker
          ORDER BY s.ts DESC, s.id DESC
          LIMIT ?
        )
      )`,
    [STOCK_HISTORY_LIMIT]
  );

  return events;
}

/**
 * Run monthly salary collection — pulls salary for any crew whose
 * `paid_through < now`. If the user can't afford the salary the role is
 * fired automatically.
 *
 * Returns { charged: N, fired: N } summary.
 */
async function runCrewSalaryCycle(db) {
  const { CREW_ROLES } = require("./constants/prestige");
  const { withSerializedTransaction } = require("../utils/sqlite-transaction");

  const due = await dbAll(
    db,
    "SELECT user_id, role_id, paid_through FROM samp_crew WHERE paid_through < ?",
    [Date.now()]
  );

  let charged = 0;
  let fired = 0;
  const periodMs = (require("./constants/prestige").CREW_SALARY_PERIOD_DAYS) * 24 * 60 * 60 * 1000;

  for (const row of due || []) {
    const role = CREW_ROLES[row.role_id];
    if (!role) {
      await dbRun(db, "DELETE FROM samp_crew WHERE user_id = ? AND role_id = ?", [row.user_id, row.role_id]);
      continue;
    }
    try {
      await withSerializedTransaction(db, async () => {
        const user = await dbGet(db, "SELECT money FROM samp_users WHERE user_id = ?", [row.user_id]);
        const balance = Number(user?.money || 0);
        if (balance < role.monthlySalary) {
          await dbRun(db, "DELETE FROM samp_crew WHERE user_id = ? AND role_id = ?", [row.user_id, row.role_id]);
          await dbRun(
            db,
            `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json) VALUES(?, ?, ?, ?, ?)`,
            ["crew_salary_default", row.user_id, null, 0, JSON.stringify({ role: row.role_id, reason: "insufficient_funds" })]
          );
          fired += 1;
          return;
        }
        await dbRun(
          db,
          "UPDATE samp_users SET money = money - ?, updated_at = datetime('now') WHERE user_id = ?",
          [role.monthlySalary, row.user_id]
        );
        const nextDue = Number(row.paid_through || Date.now()) + periodMs;
        await dbRun(
          db,
          "UPDATE samp_crew SET paid_through = ? WHERE user_id = ? AND role_id = ?",
          [nextDue, row.user_id, row.role_id]
        );
        await dbRun(
          db,
          `INSERT INTO samp_ledger(type, from_user, to_user, amount, meta_json) VALUES(?, ?, ?, ?, ?)`,
          ["crew_salary", row.user_id, null, role.monthlySalary, JSON.stringify({ role: row.role_id })]
        );
        charged += 1;
      });
    } catch (e) {
      console.error("[stocks-engine] crew salary error", row, e);
    }
  }

  return { charged, fired };
}

module.exports = { runStockTick, runCrewSalaryCycle };
