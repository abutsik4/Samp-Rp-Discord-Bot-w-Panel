"use strict";

const assert = require("assert/strict");
const { test } = require("node:test");

const { requireAuth } = require("./panel-helpers");

function createRes() {
  const res = {
    statusCode: 200,
    redirectedTo: null,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      return this;
    },
    redirect(url) {
      this.redirectedTo = url;
      return this;
    },
  };
  return res;
}

test("requireAuth: calls next() when session ok", () => {
  const req = { session: { user: { ok: true } }, headers: {}, originalUrl: "/panel" };
  const res = createRes();
  let nextCalled = false;
  requireAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.redirectedTo, null);
  assert.equal(res.jsonBody, null);
});

test("requireAuth: returns JSON 401 for /panel/api/*", () => {
  const req = {
    session: {},
    headers: { accept: "application/json" },
    originalUrl: "/panel/api/bot/x/stats",
  };
  const res = createRes();
  let nextCalled = false;
  requireAuth(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepStrictEqual(res.jsonBody, { error: "Authentication required" });
  assert.equal(res.redirectedTo, null);
});
