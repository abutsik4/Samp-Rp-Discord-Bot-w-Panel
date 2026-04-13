"use strict";

function createWhitelistSet(rows = []) {
  const set = new Set();

  for (const row of rows) {
    const channelId = row?.channel_id || row;
    if (channelId) {
      set.add(String(channelId));
    }
  }

  return set;
}

function getParentChannelId(channel) {
  return channel?.parentId || channel?.parent?.id || null;
}

function getCountableChannelIds(channel) {
  const ids = [];

  if (channel?.id) {
    ids.push(String(channel.id));
  }

  const parentId = getParentChannelId(channel);
  if (parentId && !ids.includes(String(parentId))) {
    ids.push(String(parentId));
  }

  return ids;
}

function isChannelWhitelistedForCounting(channel, whitelistSet) {
  if (!whitelistSet || whitelistSet.size === 0) {
    return true;
  }

  return getCountableChannelIds(channel).some((channelId) => whitelistSet.has(channelId));
}

module.exports = {
  createWhitelistSet,
  getCountableChannelIds,
  getParentChannelId,
  isChannelWhitelistedForCounting,
};