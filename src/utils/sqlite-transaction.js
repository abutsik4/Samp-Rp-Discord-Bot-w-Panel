"use strict";

const { dbRun } = require("./db-helpers");

const transactionQueues = new WeakMap();

async function withSerializedTransaction(db, fn) {
  if (!db || typeof db !== "object") {
    throw new TypeError("A sqlite database handle is required.");
  }

  const previous = transactionQueues.get(db) || Promise.resolve();
  let releaseQueue = null;
  const gate = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  const tail = previous.catch(() => {}).then(() => gate);
  transactionQueues.set(db, tail);

  await previous.catch(() => {});

  try {
    await dbRun(db, "BEGIN IMMEDIATE");
    try {
      const result = await fn();
      await dbRun(db, "COMMIT");
      return result;
    } catch (error) {
      try {
        await dbRun(db, "ROLLBACK");
      } catch (_) {
        // ignore rollback errors
      }
      throw error;
    }
  } finally {
    releaseQueue();
    if (transactionQueues.get(db) === tail) {
      transactionQueues.delete(db);
    }
  }
}

module.exports = {
  withSerializedTransaction,
};