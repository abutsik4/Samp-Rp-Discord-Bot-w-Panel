/**
 * JepsenCloud Panel — API layer
 *
 * Refactored to use lib/client.js for fetch, retry, dedup, and abort.
 * All route functions are preserved as-is so existing pages continue working.
 * New pages should prefer the useQuery / useMutation hooks from hooks/useQuery.js.
 */

import { apiFetch, formatApiError } from "../lib/client";

// ── Auth ────────────────────────────────────────────────────
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

// ── Panel (bot-scoped) ─────────────────────────────────────
function botUrl(botKey, path) {
  return `/panel/api/${encodeURIComponent(botKey)}${path}`;
}

export const panelApi = {
  status() {
    return apiFetch("/api/status", { method: "GET" });
  },

  sendableChannels(botKey) {
    return apiFetch(botUrl(botKey, "/sendable-channels"), { method: "GET" });
  },

  // ── Messages ────────────────────────────────────────────
  listMessages(botKey) {
    return apiFetch(botUrl(botKey, "/messages"), { method: "GET" });
  },
  createMessage(botKey, payload) {
    return apiFetch(botUrl(botKey, "/messages"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateMessage(botKey, id, payload) {
    return apiFetch(botUrl(botKey, `/messages/${encodeURIComponent(id)}`), {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  deleteMessage(botKey, id) {
    return apiFetch(botUrl(botKey, `/messages/${encodeURIComponent(id)}`), {
      method: "DELETE",
    });
  },

  // ── Stats ───────────────────────────────────────────────
  statsUsers(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/stats/users${query ? `?${query}` : ""}`), { method: "GET" });
  },
  adjustUserStats(botKey, payload) {
    return apiFetch(botUrl(botKey, "/stats/adjust"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Analytics ───────────────────────────────────────────
  analytics(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/analytics${query ? `?${query}` : ""}`), { method: "GET" });
  },
  analyticsChannels(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/analytics/channels${query ? `?${query}` : ""}`), { method: "GET" });
  },

  // ── Verification ─────────────────────────────────────────
  verifyMessageCounted(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/verify/message-counted${query ? `?${query}` : ""}`), { method: "GET" });
  },
  verifyUserStats(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/verify/user-stats${query ? `?${query}` : ""}`), { method: "GET" });
  },
  verifyResults(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/verify/results${query ? `?${query}` : ""}`), { method: "GET" });
  },

  // ── Discord Message Tools ──────────────────────────────
  discordMessage(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/discord-message${query ? `?${query}` : ""}`), { method: "GET" });
  },
  editDiscordMessage(botKey, payload) {
    return apiFetch(botUrl(botKey, "/discord-message/edit"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Moderation: Automod ─────────────────────────────────
  automodList(botKey) {
    return apiFetch(botUrl(botKey, "/automod"), { method: "GET" });
  },
  automodAdd(botKey, payload) {
    return apiFetch(botUrl(botKey, "/automod"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  automodDelete(botKey, word) {
    return apiFetch(botUrl(botKey, `/automod/${encodeURIComponent(word)}`), { method: "DELETE" });
  },
  automodClear(botKey) {
    return apiFetch(botUrl(botKey, "/automod"), { method: "DELETE" });
  },

  // ── Moderation: Whitelist ───────────────────────────────
  whitelistList(botKey) {
    return apiFetch(botUrl(botKey, "/whitelist"), { method: "GET" });
  },
  whitelistAdd(botKey, payload) {
    return apiFetch(botUrl(botKey, "/whitelist"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  whitelistDelete(botKey, channelId) {
    return apiFetch(botUrl(botKey, `/whitelist/${encodeURIComponent(channelId)}`), {
      method: "DELETE",
    });
  },
  whitelistClear(botKey) {
    return apiFetch(botUrl(botKey, "/whitelist"), { method: "DELETE" });
  },

  // ── Moderation: Command Channels ────────────────────────
  commandChannelList(botKey) {
    return apiFetch(botUrl(botKey, "/command-channels"), { method: "GET" });
  },
  commandChannelSave(botKey, payload) {
    return apiFetch(botUrl(botKey, "/command-channels"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  commandChannelClear(botKey, commandCategory) {
    return apiFetch(botUrl(botKey, `/command-channels/${encodeURIComponent(commandCategory)}`), {
      method: "DELETE",
    });
  },

  // ── Moderation: Rate Limits ─────────────────────────────
  rateLimitConfig(botKey, guildId, channelId) {
    const query = new URLSearchParams({ guildId, channelId }).toString();
    return apiFetch(botUrl(botKey, `/rate-limits/config?${query}`), { method: "GET" });
  },
  rateLimitSaveConfig(botKey, payload) {
    return apiFetch(botUrl(botKey, "/rate-limits/config"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  rateLimitStrikes(botKey, guildId) {
    const query = new URLSearchParams({ guildId }).toString();
    return apiFetch(botUrl(botKey, `/rate-limits/strikes?${query}`), { method: "GET" });
  },
  rateLimitClearStrikes(botKey, payload) {
    return apiFetch(botUrl(botKey, "/rate-limits/strikes/clear"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Moderation: Roles ───────────────────────────────────
  roles(botKey, guildId) {
    const query = new URLSearchParams({ guildId }).toString();
    return apiFetch(botUrl(botKey, `/roles?${query}`), { method: "GET" });
  },
  createRole(botKey, payload) {
    return apiFetch(botUrl(botKey, "/roles"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Automation: Commands ───────────────────────────────
  commands(botKey, guildId) {
    const query = guildId ? `?${new URLSearchParams({ guildId }).toString()}` : "";
    return apiFetch(botUrl(botKey, `/commands${query}`), { method: "GET" });
  },
  toggleCommand(botKey, payload) {
    return apiFetch(botUrl(botKey, "/commands/toggle"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Automation: AI Engagement ──────────────────────────
  aiSettings(botKey, guildId) {
    const query = new URLSearchParams({ guildId }).toString();
    return apiFetch(botUrl(botKey, `/ai-engagement/settings?${query}`), { method: "GET" });
  },
  aiSaveSettings(botKey, payload) {
    return apiFetch(botUrl(botKey, "/ai-engagement/settings"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  aiHistory(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/ai-engagement/history${query ? `?${query}` : ""}`), { method: "GET" });
  },
  aiTest(botKey, payload) {
    return apiFetch(botUrl(botKey, "/ai-engagement/test"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  aiTrain(botKey, payload) {
    return apiFetch(botUrl(botKey, "/ai-engagement/train"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  aiModelStats(botKey) {
    return apiFetch(botUrl(botKey, "/ai-engagement/model-stats"), { method: "GET" });
  },

  // ── Automation: Holidays ────────────────────────────────
  holidays(botKey, date) {
    const query = date ? `?${new URLSearchParams({ date }).toString()}` : "";
    return apiFetch(botUrl(botKey, `/holidays${query}`), { method: "GET" });
  },
  addHoliday(botKey, payload) {
    return apiFetch(botUrl(botKey, "/holidays"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteHoliday(botKey, id) {
    return apiFetch(botUrl(botKey, `/holidays/${encodeURIComponent(id)}`), { method: "DELETE" });
  },

  // ── Automation: Countdown ───────────────────────────────
  countdownConfig(botKey, guildId) {
    const query = new URLSearchParams({ guildId }).toString();
    return apiFetch(botUrl(botKey, `/countdown/config?${query}`), { method: "GET" });
  },
  saveCountdownConfig(botKey, payload) {
    return apiFetch(botUrl(botKey, "/countdown/config"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  testCountdown(botKey, payload) {
    return apiFetch(botUrl(botKey, "/countdown/test"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Operations: History ─────────────────────────────────
  history(botKey, limit = 50) {
    return apiFetch(botUrl(botKey, `/history?${new URLSearchParams({ limit }).toString()}`), { method: "GET" });
  },
  undoHistory(botKey, id) {
    return apiFetch(botUrl(botKey, `/history/${encodeURIComponent(id)}/undo`), {
      method: "POST",
    });
  },

  // ── Operations: Channels ───────────────────────────────
  channels(botKey) {
    return apiFetch(botUrl(botKey, "/channels"), { method: "GET" });
  },
  bulkDeleteChannels(botKey, payload) {
    return apiFetch(botUrl(botKey, "/channels/bulk-delete"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  // ── Debug ───────────────────────────────────────────────
  debugReports(params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(`/panel/api/debug/reports${query ? `?${query}` : ""}`, { method: "GET" });
  },
  debugReport(id) {
    return apiFetch(`/panel/api/debug/reports/${encodeURIComponent(id)}`, { method: "GET" });
  },

  // ── SA-MP Servers ────────────────────────────────────────
  sampServers(botKey) {
    return apiFetch(botUrl(botKey, "/samp-servers"), { method: "GET" });
  },
  addSampServer(botKey, payload) {
    return apiFetch(botUrl(botKey, "/samp-servers"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateSampServer(botKey, serverId, payload) {
    return apiFetch(botUrl(botKey, `/samp-servers/${encodeURIComponent(serverId)}`), {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  removeSampServer(botKey, serverId) {
    return apiFetch(botUrl(botKey, `/samp-servers/${encodeURIComponent(serverId)}`), {
      method: "DELETE",
    });
  },
  startSampServer(botKey, serverId) {
    return apiFetch(botUrl(botKey, `/samp-servers/${encodeURIComponent(serverId)}/start`), {
      method: "POST",
    });
  },
  stopSampServer(botKey, serverId) {
    return apiFetch(botUrl(botKey, `/samp-servers/${encodeURIComponent(serverId)}/stop`), {
      method: "POST",
    });
  },
  refreshSampServer(botKey, serverId) {
    return apiFetch(botUrl(botKey, `/samp-servers/${encodeURIComponent(serverId)}/refresh`), {
      method: "POST",
    });
  },

  // ── Accuracy / Reconciliation ──────────────────────────
  accuracyReconcile(payload) {
    return apiFetch("/panel/api/accuracy/reconcile", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  accuracyFullsync(payload) {
    return apiFetch("/panel/api/accuracy/fullsync", {
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

  // ── Gameplay ─────────────────────────────────────────────
  gameplayLevels(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/gameplay/levels${query ? `?${query}` : ""}`), { method: "GET" });
  },
  setGameplayLevel(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/levels/set"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  badgeDefinitions(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/badges/definitions"), { method: "GET" });
  },
  seedBadgeDefinitions(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/badges/definitions/seed"), { method: "POST" });
  },
  upsertBadgeDefinition(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/badges/definitions/upsert"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteBadgeDefinition(botKey, badgeId) {
    return apiFetch(botUrl(botKey, `/gameplay/badges/definitions/${encodeURIComponent(badgeId)}`), {
      method: "DELETE",
    });
  },

  perkRules(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/perks/rules"), { method: "GET" });
  },
  upsertPerkRule(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/perks/rules"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deletePerkRule(botKey, id) {
    return apiFetch(botUrl(botKey, `/gameplay/perks/rules/${encodeURIComponent(id)}`), {
      method: "DELETE",
    });
  },
  reconcilePerks(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/perks/reconcile"), {
      method: "POST",
      body: JSON.stringify(payload || {}),
    });
  },

  xpMultipliers(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/xp-multipliers"), { method: "GET" });
  },
  upsertXpMultiplier(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/xp-multipliers"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  deleteXpMultiplier(botKey, roleId) {
    return apiFetch(botUrl(botKey, `/gameplay/xp-multipliers/${encodeURIComponent(roleId)}`), {
      method: "DELETE",
    });
  },

  badgeUsers(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/gameplay/badges/users${query ? `?${query}` : ""}`), { method: "GET" });
  },
  userBadges(botKey, userId) {
    return apiFetch(botUrl(botKey, `/gameplay/badges/user/${encodeURIComponent(userId)}`), { method: "GET" });
  },
  grantBadge(botKey, userId, payload) {
    return apiFetch(botUrl(botKey, `/gameplay/badges/user/${encodeURIComponent(userId)}/grant`), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  revokeBadge(botKey, userId, badgeId) {
    return apiFetch(botUrl(botKey, `/gameplay/badges/user/${encodeURIComponent(userId)}/${encodeURIComponent(badgeId)}`), {
      method: "DELETE",
    });
  },

  triviaLeaderboard(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/gameplay/trivia/leaderboard${query ? `?${query}` : ""}`), { method: "GET" });
  },
  triviaUser(botKey, userId) {
    return apiFetch(botUrl(botKey, `/gameplay/trivia/user/${encodeURIComponent(userId)}`), { method: "GET" });
  },
  resetTriviaUser(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/trivia/reset-user"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  wantedList(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/gameplay/wanted${query ? `?${query}` : ""}`), { method: "GET" });
  },
  setWanted(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/wanted/set"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  clearWanted(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/wanted/clear"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  radioResults(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/radio/results"), { method: "GET" });
  },
  resetRadio(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/radio/reset"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  sampLifeUsers(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/gameplay/samp-life/users${query ? `?${query}` : ""}`), { method: "GET" });
  },
  sampLifeUser(botKey, userId) {
    return apiFetch(botUrl(botKey, `/gameplay/samp-life/user/${encodeURIComponent(userId)}`), { method: "GET" });
  },
  sampLifeTruckOverview(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/samp-life/truck/overview"), { method: "GET" });
  },
  sampLifeBusinessOverview(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/samp-life/businesses/overview"), { method: "GET" });
  },
  sampLifeLiveOps(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/samp-life/live-ops"), { method: "GET" });
  },
  saveSampLifeLiveOps(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/samp-life/live-ops"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  sampLifeLiveOpsPresets(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/samp-life/live-ops/presets"), { method: "GET" });
  },
  saveSampLifeLiveOpsPreset(botKey, payload) {
    return apiFetch(botUrl(botKey, "/gameplay/samp-life/live-ops/presets"), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  applySampLifeLiveOpsPreset(botKey, presetId) {
    return apiFetch(botUrl(botKey, `/gameplay/samp-life/live-ops/presets/${encodeURIComponent(presetId)}/apply`), {
      method: "POST",
    });
  },
  deleteSampLifeLiveOpsPreset(botKey, presetId) {
    return apiFetch(botUrl(botKey, `/gameplay/samp-life/live-ops/presets/${encodeURIComponent(presetId)}`), {
      method: "DELETE",
    });
  },
  sampLifeTerritories(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/samp-life/territories/overview"), { method: "GET" });
  },
  sampLifeGangOverview(botKey) {
    return apiFetch(botUrl(botKey, "/gameplay/samp-life/gangs/overview"), { method: "GET" });
  },
  adjustSampLifeUser(botKey, userId, payload) {
    return apiFetch(botUrl(botKey, `/gameplay/samp-life/user/${encodeURIComponent(userId)}/adjust`), {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  sampLifeHistory(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/gameplay/samp-life/history${query ? `?${query}` : ""}`), { method: "GET" });
  },
  sampLifeLedger(botKey, params) {
    const query = new URLSearchParams(params || {}).toString();
    return apiFetch(botUrl(botKey, `/gameplay/samp-life/ledger${query ? `?${query}` : ""}`), { method: "GET" });
  },
};

export { formatApiError };