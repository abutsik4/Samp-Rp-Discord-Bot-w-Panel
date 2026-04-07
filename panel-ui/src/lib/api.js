const DEFAULT_JSON_HEADERS = {
  "Content-Type": "application/json",
};

function normalizeErrorPayload(payload, status) {
  const rawError = payload?.error;
  if (typeof rawError === "string") {
    return {
      code: payload?.code || payload?.errorCode || `HTTP_${status}`,
      message: rawError,
      traceId: payload?.traceId || payload?.trace_id || null,
      details: payload?.details || null,
    };
  }

  if (rawError && typeof rawError === "object") {
    return {
      code: rawError.code || payload?.code || payload?.errorCode || `HTTP_${status}`,
      message: rawError.message || payload?.message || `HTTP ${status}`,
      traceId: rawError.traceId || payload?.traceId || payload?.trace_id || null,
      details: rawError.details || payload?.details || null,
    };
  }

  return {
    code: payload?.code || payload?.errorCode || `HTTP_${status}`,
    message: payload?.message || `HTTP ${status}`,
    traceId: payload?.traceId || payload?.trace_id || null,
    details: payload?.details || null,
  };
}

export async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...DEFAULT_JSON_HEADERS,
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? tryParseJson(text) : null;

  if (!response.ok) {
    const normalized = normalizeErrorPayload(payload, response.status);
    const error = new Error(normalized.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    error.code = normalized.code;
    error.traceId = normalized.traceId;
    error.details = normalized.details;
    throw error;
  }

  return payload;
}

export function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function formatApiError(err, fallback = "Request failed") {
  const message = err?.message || fallback;
  const code = err?.code ? `[${err.code}] ` : "";
  const traceSuffix = err?.traceId ? ` (trace: ${err.traceId})` : "";
  return `${code}${message}${traceSuffix}`;
}

export const authApi = {
  me() {
    return apiFetch("/panel/api/auth/me", { method: "GET" });
  },
  login(username, password) {
    return apiFetch("/panel/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
  },
  logout() {
    return apiFetch("/panel/api/auth/logout", { method: "POST" });
  },
  bots() {
    return apiFetch("/panel/api/auth/bots", { method: "GET" });
  },
  users() {
    return apiFetch("/panel/api/auth/users", { method: "GET" });
  },
  createUser(username, password, role) {
    return apiFetch("/panel/api/auth/users", {
      method: "POST",
      body: JSON.stringify({ username, password, role }),
    });
  },
  deleteUser(username) {
    return apiFetch(`/panel/api/auth/users/${encodeURIComponent(username)}`, { method: "DELETE" });
  },
  updateUserRole(username, role) {
    return apiFetch(`/panel/api/auth/users/${encodeURIComponent(username)}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  },
  adminResetPassword(username, newPassword) {
    return apiFetch(`/panel/api/auth/users/${encodeURIComponent(username)}/password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
  },
  changeSelfPassword(currentPassword, newPassword) {
    return apiFetch("/panel/api/auth/me/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

export const panelApi = {
  status() {
    return apiFetch("/api/status", { method: "GET" });
  },

  sendableChannels(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/sendable-channels`, { method: "GET" });
  },

  listMessages(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/messages`, { method: "GET" });
  },

  createMessage(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/messages`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updateMessage(botKey, id, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/messages/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deleteMessage(botKey, id) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/messages/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  statsUsers(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/stats/users${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  },

  adjustUserStats(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/stats/adjust`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  analytics(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/analytics${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  },

  analyticsChannels(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/analytics/channels${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  },

  verifyMessageCounted(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/verify/message-counted${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  },
  verifyUserStats(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/verify/user-stats${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  },
  verifyResults(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/verify/results${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  },

  discordMessage(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/discord-message${query ? `?${query}` : ""}`, {
      method: "GET",
    });
  },
  editDiscordMessage(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/discord-message/edit`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  automodList(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/automod`, { method: "GET" });
  },
  automodAdd(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/automod`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  automodDelete(botKey, word) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/automod/${encodeURIComponent(word)}`, {
      method: "DELETE",
    });
  },
  automodClear(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/automod`, { method: "DELETE" });
  },

  whitelistList(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/whitelist`, { method: "GET" });
  },
  whitelistAdd(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/whitelist`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  whitelistDelete(botKey, channelId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/whitelist/${encodeURIComponent(channelId)}`, {
      method: "DELETE",
    });
  },
  whitelistClear(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/whitelist`, { method: "DELETE" });
  },

  rateLimitConfig(botKey, guildId, channelId) {
    const query = new URLSearchParams({ guildId, channelId }).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/rate-limits/config?${query}`, { method: "GET" });
  },
  rateLimitSaveConfig(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/rate-limits/config`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  rateLimitStrikes(botKey, guildId) {
    const query = new URLSearchParams({ guildId }).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/rate-limits/strikes?${query}`, { method: "GET" });
  },
  rateLimitClearStrikes(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/rate-limits/strikes/clear`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  roles(botKey, guildId) {
    const query = new URLSearchParams({ guildId }).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/roles?${query}`, { method: "GET" });
  },

  createRole(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/roles`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  commands(botKey, guildId) {
    const query = guildId ? `?${new URLSearchParams({ guildId }).toString()}` : "";
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/commands${query}`, { method: "GET" });
  },
  toggleCommand(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/commands/toggle`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  aiSettings(botKey, guildId) {
    const query = new URLSearchParams({ guildId }).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/ai-engagement/settings?${query}`, { method: "GET" });
  },
  aiSaveSettings(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/ai-engagement/settings`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  aiHistory(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/ai-engagement/history${query ? `?${query}` : ""}`, { method: "GET" });
  },
  aiTest(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/ai-engagement/test`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  aiTrain(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/ai-engagement/train`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  aiModelStats(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/ai-engagement/model-stats`, { method: "GET" });
  },

  holidays(botKey, date) {
    const query = date ? `?${new URLSearchParams({ date }).toString()}` : "";
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/holidays${query}`, { method: "GET" });
  },
  addHoliday(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/holidays`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteHoliday(botKey, id) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/holidays/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  history(botKey, limit = 50) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/history?${new URLSearchParams({ limit }).toString()}`, { method: "GET" });
  },
  undoHistory(botKey, id) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/history/${encodeURIComponent(id)}/undo`, {
      method: "POST",
    });
  },

  channels(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/channels`, { method: "GET" });
  },
  bulkDeleteChannels(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/channels/bulk-delete`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  debugReports(params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/debug/reports${query ? `?${query}` : ""}`, { method: "GET" });
  },
  debugReport(id) {
    return apiFetch(`/panel/api/debug/reports/${encodeURIComponent(id)}`, { method: "GET" });
  },

  sampServers(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/samp-servers`, { method: "GET" });
  },
  addSampServer(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/samp-servers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateSampServer(botKey, serverId, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/samp-servers/${encodeURIComponent(serverId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  removeSampServer(botKey, serverId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/samp-servers/${encodeURIComponent(serverId)}`, {
      method: "DELETE",
    });
  },
  startSampServer(botKey, serverId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/samp-servers/${encodeURIComponent(serverId)}/start`, {
      method: "POST",
    });
  },
  stopSampServer(botKey, serverId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/samp-servers/${encodeURIComponent(serverId)}/stop`, {
      method: "POST",
    });
  },
  refreshSampServer(botKey, serverId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/samp-servers/${encodeURIComponent(serverId)}/refresh`, {
      method: "POST",
    });
  },

  accuracyReconcile(payload) {
    return apiFetch(`/panel/api/accuracy/reconcile`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  accuracyFullsync(payload) {
    return apiFetch(`/panel/api/accuracy/fullsync`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  accuracyTraceMessage(params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/accuracy/trace/message${query ? `?${query}` : ""}`, { method: "GET" });
  },
  accuracyTraceUser(params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/accuracy/trace/user${query ? `?${query}` : ""}`, { method: "GET" });
  },

  countdownConfig(botKey, guildId) {
    const query = new URLSearchParams({ guildId }).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/countdown/config?${query}`, { method: "GET" });
  },
  saveCountdownConfig(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/countdown/config`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  testCountdown(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/countdown/test`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  gameplayLevels(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/levels${query ? `?${query}` : ""}`, { method: "GET" });
  },
  setGameplayLevel(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/levels/set`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  badgeDefinitions(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/badges/definitions`, { method: "GET" });
  },
  seedBadgeDefinitions(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/badges/definitions/seed`, { method: "POST" });
  },
  upsertBadgeDefinition(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/badges/definitions/upsert`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteBadgeDefinition(botKey, badgeId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/badges/definitions/${encodeURIComponent(badgeId)}`, {
      method: "DELETE",
    });
  },

  perkRules(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/perks/rules`, { method: "GET" });
  },
  upsertPerkRule(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/perks/rules`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deletePerkRule(botKey, id) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/perks/rules/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  reconcilePerks(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/perks/reconcile`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  xpMultipliers(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/xp-multipliers`, { method: "GET" });
  },
  upsertXpMultiplier(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/xp-multipliers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteXpMultiplier(botKey, roleId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/xp-multipliers/${encodeURIComponent(roleId)}`, {
      method: "DELETE",
    });
  },
  badgeUsers(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/badges/users${query ? `?${query}` : ""}`, { method: "GET" });
  },
  userBadges(botKey, userId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/badges/user/${encodeURIComponent(userId)}`, { method: "GET" });
  },
  grantBadge(botKey, userId, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/badges/user/${encodeURIComponent(userId)}/grant`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  revokeBadge(botKey, userId, badgeId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/badges/user/${encodeURIComponent(userId)}/${encodeURIComponent(badgeId)}`, {
      method: "DELETE",
    });
  },
  triviaLeaderboard(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/trivia/leaderboard${query ? `?${query}` : ""}`, { method: "GET" });
  },
  triviaUser(botKey, userId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/trivia/user/${encodeURIComponent(userId)}`, { method: "GET" });
  },
  resetTriviaUser(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/trivia/reset-user`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  wantedList(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/wanted${query ? `?${query}` : ""}`, { method: "GET" });
  },
  setWanted(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/wanted/set`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  clearWanted(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/wanted/clear`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  radioResults(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/radio/results`, { method: "GET" });
  },
  resetRadio(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/radio/reset`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  sampLifeUsers(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/users${query ? `?${query}` : ""}`, { method: "GET" });
  },
  sampLifeUser(botKey, userId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/user/${encodeURIComponent(userId)}`, { method: "GET" });
  },
  sampLifeBusinessOverview(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/businesses/overview`, { method: "GET" });
  },
  sampLifeLiveOps(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/live-ops`, { method: "GET" });
  },
  saveSampLifeLiveOps(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/live-ops`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  sampLifeLiveOpsPresets(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/live-ops/presets`, { method: "GET" });
  },
  saveSampLifeLiveOpsPreset(botKey, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/live-ops/presets`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  applySampLifeLiveOpsPreset(botKey, presetId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/live-ops/presets/${encodeURIComponent(presetId)}/apply`, {
      method: "POST",
    });
  },
  deleteSampLifeLiveOpsPreset(botKey, presetId) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/live-ops/presets/${encodeURIComponent(presetId)}`, {
      method: "DELETE",
    });
  },
  sampLifeTerritories(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/territories/overview`, { method: "GET" });
  },
  sampLifeGangOverview(botKey) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/gangs/overview`, { method: "GET" });
  },
  adjustSampLifeUser(botKey, userId, payload) {
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/user/${encodeURIComponent(userId)}/adjust`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  sampLifeHistory(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/history${query ? `?${query}` : ""}`, { method: "GET" });
  },
  sampLifeLedger(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/${encodeURIComponent(botKey)}/gameplay/samp-life/ledger${query ? `?${query}` : ""}`, { method: "GET" });
  },
};
