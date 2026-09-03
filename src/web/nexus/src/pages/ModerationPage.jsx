import { useEffect, useState } from 'react'
import {
  Shield, Ban, Hash, Gauge, AlertOctagon, Layers, Plus, X, Save,
  Gamepad2, Search,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { Button, Input, Select, Field, Checkbox } from '../components/ui.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useBot } from '../lib/BotContext.jsx'
import { cn } from '../lib/utils.js'

function createDefaultRateConfig() {
  return {
    enabled: false,
    default_limit: 10,
    warning_message: 'Вы превысили лимит сообщений в этом канале.',
    action: 'delete',
    role_limits: [],
    user_limits: [],
    strike_reset_days: 7,
    timeouts_enabled: true,
    timeout_duration_per_strike: 1,
    ignore_admins: true,
  }
}

function normalizeRateConfig(config) {
  const defaults = createDefaultRateConfig()
  return {
    ...defaults,
    ...(config || {}),
    enabled: config?.enabled === true,
    default_limit: Math.max(1, Number(config?.default_limit ?? defaults.default_limit) || defaults.default_limit),
    warning_message: String(config?.warning_message || defaults.warning_message),
    action: String(config?.action || defaults.action),
    role_limits: Array.isArray(config?.role_limits)
      ? config.role_limits
          .filter((e) => e?.role_id)
          .map((e) => ({
            role_id: String(e.role_id),
            role_name: e.role_name ? String(e.role_name) : '',
            limit: Math.max(1, Number(e.limit) || defaults.default_limit),
          }))
      : defaults.role_limits,
    user_limits: Array.isArray(config?.user_limits)
      ? config.user_limits
          .filter((e) => e?.user_id)
          .map((e) => ({
            user_id: String(e.user_id),
            username: e.username ? String(e.username) : '',
            limit: Math.max(1, Number(e.limit) || defaults.default_limit),
          }))
      : defaults.user_limits,
    strike_reset_days: Math.max(1, Number(config?.strike_reset_days ?? defaults.strike_reset_days) || defaults.strike_reset_days),
    timeouts_enabled: config?.timeouts_enabled !== false,
    timeout_duration_per_strike: Math.max(1, Number(config?.timeout_duration_per_strike ?? defaults.timeout_duration_per_strike) || defaults.timeout_duration_per_strike),
    ignore_admins: config?.ignore_admins !== false,
  }
}

const TABS = [
  { key: 'automod', label: 'AutoMod Words', icon: Ban },
  { key: 'whitelist', label: 'Whitelist', icon: Hash },
  { key: 'gamecommands', label: 'Game Commands', icon: Gamepad2 },
  { key: 'ratelimits', label: 'Rate Limits', icon: Gauge },
  { key: 'strikes', label: 'Active Strikes', icon: AlertOctagon },
  { key: 'channels', label: 'Channels', icon: Layers },
]

export default function ModerationPage() {
  const { bot, botKey, loading: botLoading } = useBot()
  const guildId = bot?.guild_id

  const [tab, setTab] = useState('automod')
  const [error, setError] = useState('')
  const [rateMessage, setRateMessage] = useState('')

  // Data
  const [channels, setChannels] = useState([])
  const [automod, setAutomod] = useState([])
  const [whitelist, setWhitelist] = useState([])
  const [commandRestrictions, setCommandRestrictions] = useState([])
  const [strikes, setStrikes] = useState([])
  const [guildRoles, setGuildRoles] = useState([])
  const [loading, setLoading] = useState(true)

  // Forms
  const [newWord, setNewWord] = useState('')
  const [newWhitelistChannel, setNewWhitelistChannel] = useState('')
  const [sampGameChannel, setSampGameChannel] = useState('')
  const [deleteChannelIds, setDeleteChannelIds] = useState([])

  // Rate config
  const [selectedChannel, setSelectedChannel] = useState('')
  const [rateConfig, setRateConfig] = useState(createDefaultRateConfig())
  const [savingRateConfig, setSavingRateConfig] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userSearchResults, setUserSearchResults] = useState([])
  const [userSearchLoading, setUserSearchLoading] = useState(false)
  const [newOverrideUserId, setNewOverrideUserId] = useState('')
  const [newOverrideUsername, setNewOverrideUsername] = useState('')
  const [newOverrideLimit, setNewOverrideLimit] = useState('10')
  const [newRoleOverrideId, setNewRoleOverrideId] = useState('')
  const [newRoleOverrideLimit, setNewRoleOverrideLimit] = useState('10')

  // ── Load all reference data when the bot changes
  async function loadAll() {
    if (!botKey) return
    setLoading(true)
    setError('')
    try {
      const results = await Promise.all([
        panelApi.channels(botKey).catch(() => ({ channels: [] })),
        panelApi.automod(botKey).catch(() => ({ words: [] })),
        panelApi.whitelist(botKey).catch(() => ({ channels: [] })),
        panelApi.commandChannels(botKey).catch(() => ({ restrictions: [] })),
        guildId ? panelApi.rateLimitStrikes(botKey, guildId).catch(() => ({ users: [] })) : { users: [] },
        guildId ? panelApi.roles(botKey, guildId).catch(() => ({ roles: [] })) : { roles: [] },
      ])
      setChannels(results[0]?.channels || [])
      setAutomod(results[1]?.words || [])
      setWhitelist(results[2]?.channels || [])
      const restr = results[3]?.restrictions || []
      setCommandRestrictions(restr)
      setStrikes(results[4]?.users || [])
      setGuildRoles(results[5]?.roles || [])
      setSampGameChannel(restr.find((it) => it.command_category === 'samp_game')?.channel_id || '')
    } catch (e) {
      setError(formatApiError(e, 'Failed to load moderation data'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botKey, guildId])

  // ── Rate config loader
  async function loadConfig(channelId) {
    if (!channelId || !botKey || !guildId) return
    try {
      const data = await panelApi.rateLimitConfig(botKey, guildId, channelId)
      setRateConfig(normalizeRateConfig(data?.config))
      setRateMessage('')
    } catch (e) {
      setError(formatApiError(e, 'Failed to load rate config'))
    }
  }

  useEffect(() => {
    if (selectedChannel) loadConfig(selectedChannel)
    setUserSearchResults([])
    setUserSearch('')
    setNewOverrideUserId('')
    setNewOverrideUsername('')
    setNewRoleOverrideId('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel])

  // ── Mutations
  async function automodAdd() {
    if (!newWord.trim()) return
    try {
      await panelApi.automodAdd(botKey, { word: newWord.trim(), case_sensitive: false })
      setNewWord('')
      const data = await panelApi.automod(botKey)
      setAutomod(data?.words || [])
    } catch (e) { setError(formatApiError(e, 'Failed to add automod word')) }
  }
  async function automodDelete(word) {
    try {
      await panelApi.automodDelete(botKey, word)
      setAutomod((prev) => prev.filter((w) => w.word !== word))
    } catch (e) { setError(formatApiError(e, 'Failed to delete word')) }
  }
  async function automodClear() {
    if (!confirm('Clear all banned words?')) return
    try {
      await panelApi.automodClear(botKey)
      setAutomod([])
    } catch (e) { setError(formatApiError(e, 'Failed to clear words')) }
  }

  async function whitelistAdd() {
    if (!newWhitelistChannel) return
    try {
      await panelApi.whitelistAdd(botKey, { channel_id: newWhitelistChannel })
      setNewWhitelistChannel('')
      const data = await panelApi.whitelist(botKey)
      setWhitelist(data?.channels || [])
    } catch (e) { setError(formatApiError(e, 'Failed to add channel')) }
  }
  async function whitelistDelete(id) {
    try {
      await panelApi.whitelistDelete(botKey, id)
      setWhitelist((prev) => prev.filter((c) => c.id !== id))
    } catch (e) { setError(formatApiError(e, 'Failed to remove channel')) }
  }
  async function whitelistClear() {
    if (!confirm('Clear the whole whitelist?')) return
    try {
      await panelApi.whitelistClear(botKey)
      setWhitelist([])
    } catch (e) { setError(formatApiError(e, 'Failed to clear whitelist')) }
  }

  async function commandChannelSave() {
    if (!sampGameChannel) return
    try {
      await panelApi.commandChannelSave(botKey, {
        command_category: 'samp_game',
        channel_id: sampGameChannel,
      })
      const data = await panelApi.commandChannels(botKey)
      setCommandRestrictions(data?.restrictions || [])
    } catch (e) { setError(formatApiError(e, 'Failed to save command channel')) }
  }
  async function commandChannelClear() {
    try {
      await panelApi.commandChannelClear(botKey, 'samp_game')
      setSampGameChannel('')
      const data = await panelApi.commandChannels(botKey)
      setCommandRestrictions(data?.restrictions || [])
    } catch (e) { setError(formatApiError(e, 'Failed to clear command channel')) }
  }

  async function clearStrikes(userId) {
    if (!guildId) return
    try {
      await panelApi.rateLimitClearStrikes(botKey, { guildId, userId })
      setStrikes((prev) => prev.filter((s) => s.user_id !== userId))
    } catch (e) { setError(formatApiError(e, 'Failed to clear strikes')) }
  }

  async function bulkDelete() {
    if (!deleteChannelIds.length) return
    if (!confirm(`Delete ${deleteChannelIds.length} channel(s)? This is irreversible.`)) return
    try {
      await panelApi.bulkDeleteChannels(botKey, { channelIds: deleteChannelIds.slice(0, 100) })
      setDeleteChannelIds([])
      const data = await panelApi.channels(botKey)
      setChannels(data?.channels || [])
    } catch (e) { setError(formatApiError(e, 'Failed to delete channels')) }
  }

  // ── Rate limit user overrides
  async function searchUsers(e) {
    e?.preventDefault?.()
    const query = userSearch.trim()
    if (!query || !guildId) { setUserSearchResults([]); return }
    setUserSearchLoading(true)
    setError('')
    try {
      const data = await panelApi.statsUsers(botKey, {
        guildId, search: query, limit: '10', offset: '0', sortBy: 'count',
      })
      setUserSearchResults(data?.users || [])
    } catch (err) {
      setError(formatApiError(err, 'Failed to search users'))
    } finally {
      setUserSearchLoading(false)
    }
  }

  function addUserOverride(user) {
    const userId = String(user?.user_id || newOverrideUserId || '').trim()
    if (!userId) return
    const username = String(user?.username || newOverrideUsername || '').trim()
    const limit = Math.max(1, Number(newOverrideLimit) || rateConfig.default_limit || 10)
    setRateConfig((current) => {
      const next = normalizeRateConfig(current)
      const idx = next.user_limits.findIndex((e) => e.user_id === userId)
      const entry = { user_id: userId, username, limit }
      if (idx >= 0) {
        const arr = [...next.user_limits]; arr[idx] = entry
        return { ...next, user_limits: arr }
      }
      return { ...next, user_limits: [...next.user_limits, entry] }
    })
    setNewOverrideUserId('')
    setNewOverrideUsername('')
  }

  function updateUserOverride(userId, patch) {
    setRateConfig((current) => ({
      ...current,
      user_limits: current.user_limits.map((e) =>
        e.user_id === userId
          ? { ...e, ...patch, limit: Math.max(1, Number(patch.limit ?? e.limit) || e.limit) }
          : e,
      ),
    }))
  }
  function removeUserOverride(userId) {
    setRateConfig((current) => ({
      ...current,
      user_limits: current.user_limits.filter((e) => e.user_id !== userId),
    }))
  }

  // ── Rate limit role overrides
  function addRoleOverride() {
    const roleId = String(newRoleOverrideId || '').trim()
    if (!roleId) { setError('Select a role first'); return }
    const role = guildRoles.find((r) => String(r.id) === roleId)
    const roleName = role?.name || ''
    const limit = Math.max(1, Number(newRoleOverrideLimit) || rateConfig.default_limit || 10)
    setRateConfig((current) => {
      const next = normalizeRateConfig(current)
      const idx = next.role_limits.findIndex((e) => e.role_id === roleId)
      const entry = { role_id: roleId, role_name: roleName, limit }
      if (idx >= 0) {
        const arr = [...next.role_limits]; arr[idx] = entry
        return { ...next, role_limits: arr }
      }
      return { ...next, role_limits: [...next.role_limits, entry] }
    })
    setNewRoleOverrideId('')
  }
  function updateRoleOverride(roleId, patch) {
    setRateConfig((current) => ({
      ...current,
      role_limits: current.role_limits.map((e) =>
        e.role_id === roleId
          ? { ...e, ...patch, limit: Math.max(1, Number(patch.limit ?? e.limit) || e.limit) }
          : e,
      ),
    }))
  }
  function removeRoleOverride(roleId) {
    setRateConfig((current) => ({
      ...current,
      role_limits: current.role_limits.filter((e) => e.role_id !== roleId),
    }))
  }

  async function saveRateConfig() {
    if (!selectedChannel) { setError('Select a channel first'); return }
    setSavingRateConfig(true)
    setError('')
    setRateMessage('')
    try {
      await panelApi.rateLimitSaveConfig(botKey, {
        guildId,
        channelId: selectedChannel,
        config: normalizeRateConfig(rateConfig),
      })
      setRateMessage('Rate limit settings saved.')
      await loadConfig(selectedChannel)
    } catch (e) {
      setError(formatApiError(e, 'Failed to save rate limit config'))
    } finally {
      setSavingRateConfig(false)
    }
  }

  if (botLoading) {
    return <div className="text-text-secondary text-sm">Loading bot…</div>
  }
  if (!botKey) {
    return (
      <Alert type="warning">
        No bot selected. Use the sidebar to pick one.
      </Alert>
    )
  }

  return (
    <div>
      <PageHeader
        icon={Shield}
        title="Moderation"
        subtitle="AutoMod, whitelist, rate limits, and command-channel restrictions."
      />

      {error ? <Alert type="error" className="mb-3">{error}</Alert> : null}
      {rateMessage ? <Alert type="success" className="mb-3">{rateMessage}</Alert> : null}

      <div className="flex flex-wrap gap-1 mb-4 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-accent-purple text-accent-purple'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'automod' && (
        <SectionCard
          title="AutoMod Banned Words"
          icon={Ban}
          actions={<Button variant="danger" onClick={automodClear}>Clear all</Button>}
        >
          {loading ? <LoadingSkeleton rows={4} /> : (
            <>
              <div className="flex gap-2">
                <Input
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="Add banned word…"
                  onKeyDown={(e) => e.key === 'Enter' && automodAdd()}
                />
                <Button onClick={automodAdd}><Plus className="w-3.5 h-3.5" />Add</Button>
              </div>
              <DataTable
                columns={['Word', 'Case sensitive', '']}
                rows={automod.map((w) => [
                  w.word,
                  w.case_sensitive ? 'Yes' : 'No',
                  <Button key="x" variant="iconDanger" onClick={() => automodDelete(w.word)}><X className="w-3.5 h-3.5" /></Button>,
                ])}
                empty="No banned words configured."
              />
            </>
          )}
        </SectionCard>
      )}

      {tab === 'whitelist' && (
        <SectionCard
          title="Channel Whitelist"
          icon={Hash}
          actions={<Button variant="danger" onClick={whitelistClear}>Clear all</Button>}
        >
          {loading ? <LoadingSkeleton rows={4} /> : (
            <>
              <div className="flex gap-2">
                <Select value={newWhitelistChannel} onChange={(e) => setNewWhitelistChannel(e.target.value)}>
                  <option value="">Select channel</option>
                  {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name} ({ch.id})</option>)}
                </Select>
                <Button onClick={whitelistAdd}><Plus className="w-3.5 h-3.5" />Add</Button>
              </div>
              <DataTable
                columns={['Channel', 'ID', '']}
                rows={whitelist.map((c) => [
                  c.name,
                  <span key="id" className="font-mono text-xs text-text-muted">{c.id}</span>,
                  <Button key="x" variant="iconDanger" onClick={() => whitelistDelete(c.id)}><X className="w-3.5 h-3.5" /></Button>,
                ])}
                empty="Whitelist is empty."
              />
            </>
          )}
        </SectionCard>
      )}

      {tab === 'gamecommands' && (
        <SectionCard
          title="SAMP Game Command Channel"
          icon={Gamepad2}
          actions={<Button variant="danger" onClick={commandChannelClear}>Clear restriction</Button>}
        >
          {loading ? <LoadingSkeleton rows={3} /> : (
            <>
              <Alert type="info">
                Restrict all SAMP Life gameplay commands to one Discord channel. Outside that channel, users get a Russian warning. Non-game stats commands still work everywhere.
              </Alert>
              <div className="flex gap-2">
                <Select value={sampGameChannel} onChange={(e) => setSampGameChannel(e.target.value)}>
                  <option value="">Select channel</option>
                  {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name} ({ch.id})</option>)}
                </Select>
                <Button onClick={commandChannelSave}><Save className="w-3.5 h-3.5" />Save</Button>
              </div>
              <DataTable
                columns={['Category', 'Channel', 'ID']}
                rows={commandRestrictions.map((it) => [
                  it.label || it.command_category,
                  it.channel_name,
                  <span key="id" className="font-mono text-xs text-text-muted">{it.channel_id}</span>,
                ])}
                empty="No command channel restriction configured."
              />
            </>
          )}
        </SectionCard>
      )}

      {tab === 'ratelimits' && (
        <div className="space-y-4">
          <SectionCard title="Per-channel Rate Limits" icon={Gauge}>
            <Alert type="info">
              Configure a per-channel consecutive-message limit. Explicit user overrides take priority over role overrides, which override the channel default.
            </Alert>
            <Field label="Channel">
              <Select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)}>
                <option value="">Select channel</option>
                {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              </Select>
            </Field>

            {selectedChannel ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <Checkbox
                  label="Enable limit"
                  checked={rateConfig.enabled}
                  onChange={(e) => setRateConfig((c) => ({ ...c, enabled: e.target.checked }))}
                />
                <Checkbox
                  label="Enable timeouts"
                  checked={rateConfig.timeouts_enabled !== false}
                  onChange={(e) => setRateConfig((c) => ({ ...c, timeouts_enabled: e.target.checked }))}
                />
                <Checkbox
                  label="Ignore admins"
                  checked={rateConfig.ignore_admins !== false}
                  onChange={(e) => setRateConfig((c) => ({ ...c, ignore_admins: e.target.checked }))}
                />
                <Field label="Default consecutive messages">
                  <Input
                    type="number" min="1"
                    value={rateConfig.default_limit ?? 10}
                    onChange={(e) => setRateConfig((c) => ({ ...c, default_limit: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                </Field>
                <Field label="Action">
                  <Select value={rateConfig.action ?? 'delete'} onChange={(e) => setRateConfig((c) => ({ ...c, action: e.target.value }))}>
                    <option value="delete">Delete message</option>
                    <option value="warn">Warn only</option>
                  </Select>
                </Field>
                <Field label="Warning message">
                  <Input
                    value={rateConfig.warning_message ?? ''}
                    onChange={(e) => setRateConfig((c) => ({ ...c, warning_message: e.target.value }))}
                  />
                </Field>
                <Field label="Strike reset days">
                  <Input
                    type="number" min="1"
                    value={rateConfig.strike_reset_days ?? 7}
                    onChange={(e) => setRateConfig((c) => ({ ...c, strike_reset_days: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                </Field>
                <Field label="Timeout per strike (minutes)">
                  <Input
                    type="number" min="1"
                    value={rateConfig.timeout_duration_per_strike ?? 1}
                    onChange={(e) => setRateConfig((c) => ({ ...c, timeout_duration_per_strike: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                </Field>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Select a channel to configure rate limits.</p>
            )}
          </SectionCard>

          {selectedChannel && (
            <>
              <SectionCard title="Role Overrides" icon={Shield}>
                <Alert type="info">
                  Set a consecutive-message limit for everyone with a given Discord role. When a user has multiple matching roles, the highest limit wins. Per-user overrides still take priority over role overrides.
                </Alert>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 items-end">
                  <Field label="Role">
                    <Select value={newRoleOverrideId} onChange={(e) => setNewRoleOverrideId(e.target.value)}>
                      <option value="">Select role</option>
                      {guildRoles.filter((r) => r.name !== '@everyone').map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Limit">
                    <Input
                      type="number" min="1"
                      value={newRoleOverrideLimit}
                      onChange={(e) => setNewRoleOverrideLimit(e.target.value)}
                    />
                  </Field>
                  <Button onClick={addRoleOverride}><Plus className="w-3.5 h-3.5" />Add</Button>
                </div>

                <DataTable
                  columns={['Role', 'Role ID', 'Limit', '']}
                  rows={rateConfig.role_limits.map((entry) => {
                    const live = guildRoles.find((r) => String(r.id) === entry.role_id)
                    const displayName = live?.name || entry.role_name || 'Unknown role'
                    return [
                      <span key="n">{displayName}{!live && <span className="ml-2 text-[10px] uppercase tracking-wider text-accent-rose">missing</span>}</span>,
                      <span key="id" className="font-mono text-xs text-text-muted">{entry.role_id}</span>,
                      <Input
                        key="lim"
                        type="number" min="1"
                        value={entry.limit}
                        onChange={(e) => updateRoleOverride(entry.role_id, { limit: e.target.value })}
                        className="w-24"
                      />,
                      <Button key="x" variant="iconDanger" onClick={() => removeRoleOverride(entry.role_id)}><X className="w-3.5 h-3.5" /></Button>,
                    ]
                  })}
                  empty="No role-specific limits configured for this channel."
                />
              </SectionCard>

              <SectionCard title="User Overrides" icon={Gauge}>
                <form className="flex flex-col sm:flex-row gap-2 items-end" onSubmit={searchUsers}>
                  <Field label="Search existing users" className="flex-1">
                    <Input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Username or Discord ID"
                    />
                  </Field>
                  <Button type="submit" disabled={userSearchLoading}>
                    <Search className="w-3.5 h-3.5" />{userSearchLoading ? 'Searching…' : 'Search'}
                  </Button>
                </form>

                {userSearchResults.length > 0 && (
                  <DataTable
                    columns={['User', 'User ID', 'Messages', '']}
                    rows={userSearchResults.map((u) => [
                      u.username || 'Unknown',
                      <span key="id" className="font-mono text-xs text-text-muted">{u.user_id}</span>,
                      Number(u.message_count || 0).toLocaleString(),
                      <Button key="add" onClick={() => { setNewOverrideLimit(String(rateConfig.default_limit || 10)); addUserOverride(u) }}>
                        <Plus className="w-3.5 h-3.5" />Add override
                      </Button>,
                    ])}
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px_auto] gap-2 items-end">
                  <Field label="Manual user ID">
                    <Input value={newOverrideUserId} onChange={(e) => setNewOverrideUserId(e.target.value)} placeholder="Discord user ID" />
                  </Field>
                  <Field label="Display name">
                    <Input value={newOverrideUsername} onChange={(e) => setNewOverrideUsername(e.target.value)} placeholder="Optional username" />
                  </Field>
                  <Field label="Limit">
                    <Input type="number" min="1" value={newOverrideLimit} onChange={(e) => setNewOverrideLimit(e.target.value)} />
                  </Field>
                  <Button onClick={() => addUserOverride()}><Plus className="w-3.5 h-3.5" />Add</Button>
                </div>

                <DataTable
                  columns={['User', 'User ID', 'Limit', '']}
                  rows={rateConfig.user_limits.map((entry) => [
                    <Input
                      key="n"
                      value={entry.username || ''}
                      onChange={(e) => updateUserOverride(entry.user_id, { username: e.target.value })}
                      placeholder="Username"
                    />,
                    <span key="id" className="font-mono text-xs text-text-muted">{entry.user_id}</span>,
                    <Input
                      key="l"
                      type="number" min="1" value={entry.limit}
                      onChange={(e) => updateUserOverride(entry.user_id, { limit: e.target.value })}
                      className="w-24"
                    />,
                    <Button key="x" variant="iconDanger" onClick={() => removeUserOverride(entry.user_id)}><X className="w-3.5 h-3.5" /></Button>,
                  ])}
                  empty="No user-specific limits configured for this channel."
                />
              </SectionCard>

              <div className="flex justify-end">
                <Button variant="primary" size="md" onClick={saveRateConfig} disabled={savingRateConfig}>
                  <Save className="w-4 h-4" />{savingRateConfig ? 'Saving…' : 'Save config'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'strikes' && (
        <SectionCard title="Active Strikes" icon={AlertOctagon}>
          {loading ? <LoadingSkeleton rows={4} /> : (
            <DataTable
              columns={['User', 'Strikes', '']}
              rows={strikes.map((s) => [
                s.username || s.user_id,
                <span key="s" className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-accent-rose/10 text-accent-rose border border-accent-rose/30">{s.strikes}</span>,
                <Button key="x" variant="iconDanger" onClick={() => clearStrikes(s.user_id)}><X className="w-3.5 h-3.5" /></Button>,
              ])}
              empty="No active strikes."
            />
          )}
        </SectionCard>
      )}

      {tab === 'channels' && (
        <SectionCard
          title="Channel Management"
          icon={Layers}
          description="Bulk delete up to 100 channels at once."
          actions={<Button variant="danger" disabled={!deleteChannelIds.length} onClick={bulkDelete}>Delete selected ({deleteChannelIds.length})</Button>}
        >
          {loading ? <LoadingSkeleton rows={6} /> : (
            <DataTable
              columns={['Select', 'Name', 'ID', 'Type']}
              rows={channels.map((ch) => [
                <input
                  key="c"
                  type="checkbox"
                  checked={deleteChannelIds.includes(ch.id)}
                  onChange={(e) => {
                    setDeleteChannelIds((prev) => e.target.checked ? [...prev, ch.id] : prev.filter((id) => id !== ch.id))
                  }}
                  className="w-4 h-4 accent-accent-purple"
                />,
                ch.name,
                <span key="id" className="font-mono text-xs text-text-muted">{ch.id}</span>,
                String(ch.type),
              ])}
              empty="No channels."
            />
          )}
        </SectionCard>
      )}
    </div>
  )
}

function DataTable({ columns, rows, empty }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className="text-left text-[10px] uppercase tracking-wider text-text-muted font-medium px-3 py-2 border-b border-border">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="text-center text-text-muted py-6 px-3">{empty || 'No data.'}</td></tr>
          ) : rows.map((cells, r) => (
            <tr key={r} className="hover:bg-bg-hover/40">
              {cells.map((cell, i) => (
                <td key={i} className="px-3 py-2 border-b border-border-subtle align-middle">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
