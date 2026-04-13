"use strict";

const assert = require("assert/strict");
const { test } = require("node:test");

const {
  createWhitelistSet,
  getCountableChannelIds,
  isChannelWhitelistedForCounting,
} = require("./message-counting-rules");

test("count rules: empty whitelist allows all channels", () => {
  const channel = { id: "channel-1", parentId: null };
  assert.equal(isChannelWhitelistedForCounting(channel, createWhitelistSet()), true);
});

test("count rules: thread inherits parent whitelist", () => {
  const whitelist = createWhitelistSet([{ channel_id: "parent-1" }]);
  const threadChannel = { id: "thread-1", parentId: "parent-1" };

  assert.deepEqual(getCountableChannelIds(threadChannel), ["thread-1", "parent-1"]);
  assert.equal(isChannelWhitelistedForCounting(threadChannel, whitelist), true);
});

test("count rules: unrelated thread is not whitelisted", () => {
  const whitelist = createWhitelistSet([{ channel_id: "parent-2" }]);
  const threadChannel = { id: "thread-1", parentId: "parent-1" };

  assert.equal(isChannelWhitelistedForCounting(threadChannel, whitelist), false);
});