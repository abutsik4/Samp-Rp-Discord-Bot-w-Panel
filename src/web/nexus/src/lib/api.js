// Centralized fetch wrappers for the Nexus admin panel.
// Mirrors the contracts used by panel-ui/src/lib/api.js so ported pages
// can call the same backend endpoints exposed under /panel/api/*.

const BASE = '/panel/api'

// Server issues an X-CSRF-Token header on every response (double-submit cookie
// pattern). We cache the latest token and echo it back on mutating requests.
let csrfToken = null
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function primeCsrf() {
  if (csrfToken) return
  try {
    const res = await fetch(`${BASE}/auth/me`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    const t = res.headers.get('X-CSRF-Token')
    if (t) csrfToken = t
  } catch { /* ignore */ }
}

async function request(path, { method = 'GET', body, headers } = {}) {
  const upper = method.toUpperCase()
  if (MUTATING.has(upper) && !csrfToken) await primeCsrf()

  const opts = {
    method: upper,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(MUTATING.has(upper) && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(headers || {}),
    },
  }
  if (body !== undefined) opts.body = typeof body === 'string' ? body : JSON.stringify(body)

  let res = await fetch(path, opts)
  // Always refresh cached CSRF from response header
  const newToken = res.headers.get('X-CSRF-Token')
  if (newToken) csrfToken = newToken

  // Auto-retry once on CSRF mismatch (e.g. fresh session after restart)
  if (res.status === 403 && MUTATING.has(upper)) {
    const peek = await res.clone().text()
    if (/csrf/i.test(peek)) {
      try {
        const pj = JSON.parse(peek)
        if (pj?.csrfToken) csrfToken = pj.csrfToken
      } catch { /* ignore */ }
      opts.headers['X-CSRF-Token'] = csrfToken || ''
      res = await fetch(path, opts)
      const t2 = res.headers.get('X-CSRF-Token')
      if (t2) csrfToken = t2
    }
  }

  let payload = null
  const text = await res.text()
  if (text) {
    try { payload = JSON.parse(text) } catch { payload = { raw: text } }
  }
  if (!res.ok) {
    const message = payload?.error || payload?.message || `${res.status} ${res.statusText}`
    const err = new Error(message)
    err.status = res.status
    err.payload = payload
    throw err
  }
  return payload
}

function botUrl(botKey, path) {
  return `${BASE}/${encodeURIComponent(botKey)}${path.startsWith('/') ? path : `/${path}`}`
}

function qs(params) {
  if (!params) return ''
  const cleaned = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    cleaned[k] = v
  }
  const s = new URLSearchParams(cleaned).toString()
  return s ? `?${s}` : ''
}

export const authApi = {
  me: () => request(`${BASE}/auth/me`),
  login: (username, password) => request(`${BASE}/auth/login`, { method: 'POST', body: { username, password } }),
  logout: () => request(`${BASE}/auth/logout`, { method: 'POST' }),
  bots: () => request(`${BASE}/auth/bots`),
  users: () => request(`${BASE}/auth/users`),
  createUser: (username, password, role) => request(`${BASE}/auth/users`, { method: 'POST', body: { username, password, role } }),
  deleteUser: (username) => request(`${BASE}/auth/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),
  updateUserRole: (username, role) => request(`${BASE}/auth/users/${encodeURIComponent(username)}/role`, { method: 'POST', body: { role } }),
  adminResetPassword: (username, newPassword) => request(`${BASE}/auth/users/${encodeURIComponent(username)}/password`, { method: 'POST', body: { newPassword } }),
  changeSelfPassword: (currentPassword, newPassword) => request(`${BASE}/auth/me/password`, { method: 'POST', body: { currentPassword, newPassword } }),
}

export const panelApi = {
  // ── Core
  status: () => request(`/api/status`),
  sendableChannels: (botKey) => request(botUrl(botKey, '/sendable-channels')),
  channels: (botKey) => request(botUrl(botKey, '/channels')),
  roles: (botKey, guildId) => request(botUrl(botKey, `/roles${qs({ guildId })}`)),
  createRole: (botKey, payload) => request(botUrl(botKey, '/roles'), { method: 'POST', body: payload }),

  // ── Messages
  listMessages: (botKey) => request(botUrl(botKey, '/messages')),
  createMessage: (botKey, payload) => request(botUrl(botKey, '/messages'), { method: 'POST', body: payload }),
  updateMessage: (botKey, id, payload) => request(botUrl(botKey, `/messages/${encodeURIComponent(id)}`), { method: 'PUT', body: payload }),
  deleteMessage: (botKey, id) => request(botUrl(botKey, `/messages/${encodeURIComponent(id)}`), { method: 'DELETE' }),

  // ── Stats
  statsUsers: (botKey, params) => request(botUrl(botKey, `/stats/users${qs(params)}`)),
  adjustUserStats: (botKey, payload) => request(botUrl(botKey, '/stats/adjust'), { method: 'POST', body: payload }),

  // ── Analytics
  analytics: (botKey, params) => request(botUrl(botKey, `/analytics${qs(params)}`)),
  analyticsChannels: (botKey, params) => request(botUrl(botKey, `/analytics/channels${qs(params)}`)),

  // ── Verification
  verifyMessageCounted: (botKey, params) => request(botUrl(botKey, `/verify/message-counted${qs(params)}`)),
  verifyUserStats: (botKey, params) => request(botUrl(botKey, `/verify/user-stats${qs(params)}`)),
  verifyResults: (botKey, params) => request(botUrl(botKey, `/verify/results${qs(params)}`)),

  // ── Discord message tools
  discordMessage: (botKey, params) => request(botUrl(botKey, `/discord-message${qs(params)}`)),
  editDiscordMessage: (botKey, payload) => request(botUrl(botKey, '/discord-message/edit'), { method: 'POST', body: payload }),
  discordSendableChannels: (botKey) => request(`${BASE}/discord/sendable-channels${qs({ botKey })}`),

  // ── Automod
  automod: (botKey) => request(botUrl(botKey, '/automod')),
  automodAdd: (botKey, payload) => request(botUrl(botKey, '/automod'), { method: 'POST', body: payload }),
  automodDelete: (botKey, word) => request(botUrl(botKey, `/automod/${encodeURIComponent(word)}`), { method: 'DELETE' }),
  automodClear: (botKey) => request(botUrl(botKey, '/automod'), { method: 'DELETE' }),

  // ── Whitelist
  whitelist: (botKey) => request(botUrl(botKey, '/whitelist')),
  whitelistAdd: (botKey, payload) => request(botUrl(botKey, '/whitelist'), { method: 'POST', body: payload }),
  whitelistDelete: (botKey, channelId) => request(botUrl(botKey, `/whitelist/${encodeURIComponent(channelId)}`), { method: 'DELETE' }),
  whitelistClear: (botKey) => request(botUrl(botKey, '/whitelist'), { method: 'DELETE' }),

  // ── Command channels
  commandChannels: (botKey) => request(botUrl(botKey, '/command-channels')),
  commandChannelSave: (botKey, payload) => request(botUrl(botKey, '/command-channels'), { method: 'POST', body: payload }),
  commandChannelClear: (botKey, category) => request(botUrl(botKey, `/command-channels/${encodeURIComponent(category)}`), { method: 'DELETE' }),

  // ── Rate limits
  rateLimitConfig: (botKey, guildId, channelId) => request(botUrl(botKey, `/rate-limits/config${qs({ guildId, channelId })}`)),
  rateLimitSaveConfig: (botKey, payload) => request(botUrl(botKey, '/rate-limits/config'), { method: 'POST', body: payload }),
  rateLimitStrikes: (botKey, guildId) => request(botUrl(botKey, `/rate-limits/strikes${qs({ guildId })}`)),
  rateLimitClearStrikes: (botKey, payload) => request(botUrl(botKey, '/rate-limits/strikes/clear'), { method: 'POST', body: payload }),

  // ── Channel bulk ops
  bulkDeleteChannels: (botKey, payload) => request(botUrl(botKey, '/channels/bulk-delete'), { method: 'POST', body: payload }),

  // ── Automation: commands
  commands: (botKey, guildId) => request(botUrl(botKey, `/commands${qs({ guildId })}`)),
  toggleCommand: (botKey, payload) => request(botUrl(botKey, '/commands/toggle'), { method: 'POST', body: payload }),

  // ── Automation: AI engagement
  aiSettings: (botKey, guildId) => request(botUrl(botKey, `/ai-engagement/settings${qs({ guildId })}`)),
  aiSaveSettings: (botKey, payload) => request(botUrl(botKey, '/ai-engagement/settings'), { method: 'POST', body: payload }),
  aiHistory: (botKey, params) => request(botUrl(botKey, `/ai-engagement/history${qs(params)}`)),
  aiTest: (botKey, payload) => request(botUrl(botKey, '/ai-engagement/test'), { method: 'POST', body: payload }),
  aiTrain: (botKey, payload) => request(botUrl(botKey, '/ai-engagement/train'), { method: 'POST', body: payload }),
  aiModelStats: (botKey) => request(botUrl(botKey, '/ai-engagement/model-stats')),

  // ── Automation: holidays
  holidays: (botKey, date) => request(botUrl(botKey, `/holidays${qs({ date })}`)),
  addHoliday: (botKey, payload) => request(botUrl(botKey, '/holidays'), { method: 'POST', body: payload }),
  deleteHoliday: (botKey, id) => request(botUrl(botKey, `/holidays/${encodeURIComponent(id)}`), { method: 'DELETE' }),

  // ── Automation: countdown
  countdownConfig: (botKey, guildId) => request(botUrl(botKey, `/countdown/config${qs({ guildId })}`)),
  saveCountdownConfig: (botKey, payload) => request(botUrl(botKey, '/countdown/config'), { method: 'POST', body: payload }),
  testCountdown: (botKey, payload) => request(botUrl(botKey, '/countdown/test'), { method: 'POST', body: payload }),

  // ── Operations: history
  history: (botKey, limit = 50) => request(botUrl(botKey, `/history${qs({ limit })}`)),
  undoHistory: (botKey, id) => request(botUrl(botKey, `/history/${encodeURIComponent(id)}/undo`), { method: 'POST' }),

  // ── Debug
  debugReports: (params) => request(`${BASE}/debug/reports${qs(params)}`),
  debugReport: (id) => request(`${BASE}/debug/reports/${encodeURIComponent(id)}`),

  // ── SA-MP servers
  sampServers: (botKey) => request(botUrl(botKey, '/samp-servers')),
  addSampServer: (botKey, payload) => request(botUrl(botKey, '/samp-servers'), { method: 'POST', body: payload }),
  updateSampServer: (botKey, id, payload) => request(botUrl(botKey, `/samp-servers/${encodeURIComponent(id)}`), { method: 'PUT', body: payload }),
  removeSampServer: (botKey, id) => request(botUrl(botKey, `/samp-servers/${encodeURIComponent(id)}`), { method: 'DELETE' }),
  startSampServer: (botKey, id) => request(botUrl(botKey, `/samp-servers/${encodeURIComponent(id)}/start`), { method: 'POST' }),
  stopSampServer: (botKey, id) => request(botUrl(botKey, `/samp-servers/${encodeURIComponent(id)}/stop`), { method: 'POST' }),
  refreshSampServer: (botKey, id) => request(botUrl(botKey, `/samp-servers/${encodeURIComponent(id)}/refresh`), { method: 'POST' }),

  // ── Accuracy / reconciliation
  accuracyReconcile: (payload) => request(`${BASE}/accuracy/reconcile`, { method: 'POST', body: payload }),
  accuracyFullsync: (payload) => request(`${BASE}/accuracy/fullsync`, { method: 'POST', body: payload }),
  accuracyTraceMessage: (params) => request(`${BASE}/accuracy/trace/message${qs(params)}`),
  accuracyTraceUser: (params) => request(`${BASE}/accuracy/trace/user${qs(params)}`),

  // ── Gameplay: levels
  gameplayLevels: (botKey, params) => request(botUrl(botKey, `/gameplay/levels${qs(params)}`)),
  setGameplayLevel: (botKey, payload) => request(botUrl(botKey, '/gameplay/levels/set'), { method: 'POST', body: payload }),

  // ── Gameplay: badges
  badgeDefinitions: (botKey) => request(botUrl(botKey, '/gameplay/badges/definitions')),
  seedBadgeDefinitions: (botKey) => request(botUrl(botKey, '/gameplay/badges/definitions/seed'), { method: 'POST' }),
  upsertBadgeDefinition: (botKey, payload) => request(botUrl(botKey, '/gameplay/badges/definitions/upsert'), { method: 'POST', body: payload }),
  deleteBadgeDefinition: (botKey, badgeId) => request(botUrl(botKey, `/gameplay/badges/definitions/${encodeURIComponent(badgeId)}`), { method: 'DELETE' }),
  badgeUsers: (botKey, params) => request(botUrl(botKey, `/gameplay/badges/users${qs(params)}`)),
  userBadges: (botKey, userId) => request(botUrl(botKey, `/gameplay/badges/user/${encodeURIComponent(userId)}`)),
  grantBadge: (botKey, userId, payload) => request(botUrl(botKey, `/gameplay/badges/user/${encodeURIComponent(userId)}/grant`), { method: 'POST', body: payload }),
  revokeBadge: (botKey, userId, badgeId) => request(botUrl(botKey, `/gameplay/badges/user/${encodeURIComponent(userId)}/${encodeURIComponent(badgeId)}`), { method: 'DELETE' }),

  // ── Gameplay: perks
  perkRules: (botKey) => request(botUrl(botKey, '/gameplay/perks/rules')),
  upsertPerkRule: (botKey, payload) => request(botUrl(botKey, '/gameplay/perks/rules'), { method: 'POST', body: payload }),
  deletePerkRule: (botKey, id) => request(botUrl(botKey, `/gameplay/perks/rules/${encodeURIComponent(id)}`), { method: 'DELETE' }),
  reconcilePerks: (botKey, payload) => request(botUrl(botKey, '/gameplay/perks/reconcile'), { method: 'POST', body: payload }),

  // ── Gameplay: xp multipliers
  xpMultipliers: (botKey) => request(botUrl(botKey, '/gameplay/xp-multipliers')),
  upsertXpMultiplier: (botKey, payload) => request(botUrl(botKey, '/gameplay/xp-multipliers'), { method: 'POST', body: payload }),
  deleteXpMultiplier: (botKey, roleId) => request(botUrl(botKey, `/gameplay/xp-multipliers/${encodeURIComponent(roleId)}`), { method: 'DELETE' }),

  // ── Gameplay: trivia
  triviaLeaderboard: (botKey, params) => request(botUrl(botKey, `/gameplay/trivia/leaderboard${qs(params)}`)),
  triviaUser: (botKey, userId) => request(botUrl(botKey, `/gameplay/trivia/user/${encodeURIComponent(userId)}`)),
  resetTriviaUser: (botKey, payload) => request(botUrl(botKey, '/gameplay/trivia/reset-user'), { method: 'POST', body: payload }),

  // ── Gameplay: wanted
  wantedList: (botKey, params) => request(botUrl(botKey, `/gameplay/wanted${qs(params)}`)),
  setWanted: (botKey, payload) => request(botUrl(botKey, '/gameplay/wanted/set'), { method: 'POST', body: payload }),
  clearWanted: (botKey, payload) => request(botUrl(botKey, '/gameplay/wanted/clear'), { method: 'POST', body: payload }),

  // ── Gameplay: radio
  radioResults: (botKey) => request(botUrl(botKey, '/gameplay/radio/results')),
  resetRadio: (botKey, payload) => request(botUrl(botKey, '/gameplay/radio/reset'), { method: 'POST', body: payload }),

  // ── Gameplay: SA-MP Life
  sampLifeUsers: (botKey, params) => request(botUrl(botKey, `/gameplay/samp-life/users${qs(params)}`)),
  sampLifeUser: (botKey, userId) => request(botUrl(botKey, `/gameplay/samp-life/user/${encodeURIComponent(userId)}`)),
  sampLifeTruckOverview: (botKey) => request(botUrl(botKey, '/gameplay/samp-life/truck/overview')),
  sampLifeBusinessOverview: (botKey) => request(botUrl(botKey, '/gameplay/samp-life/businesses/overview')),
  sampLifeLiveOps: (botKey) => request(botUrl(botKey, '/gameplay/samp-life/live-ops')),
  saveSampLifeLiveOps: (botKey, payload) => request(botUrl(botKey, '/gameplay/samp-life/live-ops'), { method: 'POST', body: payload }),
  sampLifeLiveOpsPresets: (botKey) => request(botUrl(botKey, '/gameplay/samp-life/live-ops/presets')),
  saveSampLifeLiveOpsPreset: (botKey, payload) => request(botUrl(botKey, '/gameplay/samp-life/live-ops/presets'), { method: 'POST', body: payload }),
  applySampLifeLiveOpsPreset: (botKey, id) => request(botUrl(botKey, `/gameplay/samp-life/live-ops/presets/${encodeURIComponent(id)}/apply`), { method: 'POST' }),
  deleteSampLifeLiveOpsPreset: (botKey, id) => request(botUrl(botKey, `/gameplay/samp-life/live-ops/presets/${encodeURIComponent(id)}`), { method: 'DELETE' }),
  sampLifeTerritories: (botKey) => request(botUrl(botKey, '/gameplay/samp-life/territories/overview')),
  sampLifeGangOverview: (botKey) => request(botUrl(botKey, '/gameplay/samp-life/gangs/overview')),
  adjustSampLifeUser: (botKey, userId, payload) => request(botUrl(botKey, `/gameplay/samp-life/user/${encodeURIComponent(userId)}/adjust`), { method: 'POST', body: payload }),
  sampLifeHistory: (botKey, params) => request(botUrl(botKey, `/gameplay/samp-life/history${qs(params)}`)),
  sampLifeLedger: (botKey, params) => request(botUrl(botKey, `/gameplay/samp-life/ledger${qs(params)}`)),
}

export function formatApiError(err, fallback = 'Request failed') {
  if (!err) return fallback
  if (typeof err === 'string') return err
  if (err.payload?.error) return err.payload.error
  if (err.message) return err.message
  return fallback
}

export { request, botUrl, BASE, qs }
