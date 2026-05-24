import { useEffect, useState, useCallback } from "react";
import { formatApiError, panelApi } from "../lib/api";
import { useQuery, useMutation } from "../hooks/useQuery";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import {
  Shield, Ban, Hash, Gauge, AlertOctagon, Layers, Plus, X, Save, Gamepad2, Search,
} from "lucide-react";

function createDefaultRateConfig() {
  return {
    enabled: false,
    default_limit: 10,
    warning_message: "Вы превысили лимит сообщений в этом канале.",
    action: "delete",
    role_limits: [],
    user_limits: [],
    strike_reset_days: 7,
    timeouts_enabled: true,
    timeout_duration_per_strike: 1,
    ignore_admins: true,
  };
}

function normalizeRateConfig(config) {
  const defaults = createDefaultRateConfig();
  return {
    ...defaults,
    ...(config || {}),
    enabled: config?.enabled === true,
    default_limit: Math.max(1, Number(config?.default_limit ?? defaults.default_limit) || defaults.default_limit),
    warning_message: String(config?.warning_message || defaults.warning_message),
    action: String(config?.action || defaults.action),
    role_limits: Array.isArray(config?.role_limits) ? config.role_limits : defaults.role_limits,
    user_limits: Array.isArray(config?.user_limits)
      ? config.user_limits
          .filter((entry) => entry?.user_id)
          .map((entry) => ({
            user_id: String(entry.user_id),
            username: entry.username ? String(entry.username) : "",
            limit: Math.max(1, Number(entry.limit) || defaults.default_limit),
          }))
      : defaults.user_limits,
    strike_reset_days: Math.max(1, Number(config?.strike_reset_days ?? defaults.strike_reset_days) || defaults.strike_reset_days),
    timeouts_enabled: config?.timeouts_enabled !== false,
    timeout_duration_per_strike: Math.max(1, Number(config?.timeout_duration_per_strike ?? defaults.timeout_duration_per_strike) || defaults.timeout_duration_per_strike),
    ignore_admins: config?.ignore_admins !== false,
  };
}

export function ModerationPage({ bot }) {
  const guildId = bot?.guild_id;
  const botKey = bot?.key;
  const botApiBase = `/panel/api/${encodeURIComponent(botKey)}`;

  // ── Queries ──────────────────────────────────────────────
  const channelsQuery = useQuery(`${botApiBase}/channels`, {
    deps: [botKey],
    enabled: !!botKey,
  });
  const automodQuery = useQuery(`${botApiBase}/automod`, {
    deps: [botKey],
    enabled: !!botKey,
  });
  const whitelistQuery = useQuery(`${botApiBase}/whitelist`, {
    deps: [botKey],
    enabled: !!botKey,
  });
  const commandChannelsQuery = useQuery(`${botApiBase}/command-channels`, {
    deps: [botKey],
    enabled: !!botKey,
  });
  const strikesQuery = useQuery(`${botApiBase}/rate-limits/strikes?guildId=${encodeURIComponent(guildId || "")}`, {
    deps: [botKey, guildId],
    enabled: !!botKey && !!guildId,
  });

  // ── Derived data from queries ────────────────────────────
  const channels = channelsQuery.data?.channels || [];
  const automod = automodQuery.data?.words || [];
  const whitelist = whitelistQuery.data?.channels || [];
  const commandRestrictions = commandChannelsQuery.data?.restrictions || [];
  const strikes = strikesQuery.data?.users || [];

  const loading = channelsQuery.loading || automodQuery.loading || whitelistQuery.loading || commandChannelsQuery.loading || strikesQuery.loading;

  // ── Local state ──────────────────────────────────────────
  const [rateConfig, setRateConfig] = useState(createDefaultRateConfig());
  const [selectedChannel, setSelectedChannel] = useState("");
  const [newWord, setNewWord] = useState("");
  const [newWhitelistChannel, setNewWhitelistChannel] = useState("");
  const [sampGameChannel, setSampGameChannel] = useState("");
  const [deleteChannelIds, setDeleteChannelIds] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [newOverrideUserId, setNewOverrideUserId] = useState("");
  const [newOverrideUsername, setNewOverrideUsername] = useState("");
  const [newOverrideLimit, setNewOverrideLimit] = useState("10");
  const [rateMessage, setRateMessage] = useState("");
  const [savingRateConfig, setSavingRateConfig] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("automod");

  // ── Invalidation key helpers ─────────────────────────────
  const invalidateKeys = {
    automod: [`${botApiBase}/automod`],
    whitelist: [`${botApiBase}/whitelist`],
    commandChannels: [`${botApiBase}/command-channels`],
    strikes: [`${botApiBase}/rate-limits/strikes?guildId=${encodeURIComponent(guildId || "")}`],
    rateConfig: selectedChannel
      ? [`${botApiBase}/rate-limits/config?guildId=${encodeURIComponent(guildId || "")}&channelId=${encodeURIComponent(selectedChannel)}`]
      : [],
    channels: [`${botApiBase}/channels`],
  };

  // ── Mutations ────────────────────────────────────────────
  const [automodAddMut, automodAddState] = useMutation(panelApi.automodAdd, {
    invalidate: invalidateKeys.automod,
    onSuccess: () => setNewWord(""),
    onError: (e) => setError(formatApiError(e, "Failed to add automod word")),
  });
  const [automodDeleteMut] = useMutation(panelApi.automodDelete, {
    invalidate: invalidateKeys.automod,
    onError: (e) => setError(formatApiError(e, "Failed to delete automod word")),
  });
  const [automodClearMut] = useMutation(panelApi.automodClear, {
    invalidate: invalidateKeys.automod,
    onError: (e) => setError(formatApiError(e, "Failed to clear automod words")),
  });
  const [whitelistAddMut] = useMutation(panelApi.whitelistAdd, {
    invalidate: invalidateKeys.whitelist,
    onSuccess: () => setNewWhitelistChannel(""),
    onError: (e) => setError(formatApiError(e, "Failed to add whitelist channel")),
  });
  const [whitelistDeleteMut] = useMutation(panelApi.whitelistDelete, {
    invalidate: invalidateKeys.whitelist,
    onError: (e) => setError(formatApiError(e, "Failed to delete whitelist channel")),
  });
  const [whitelistClearMut] = useMutation(panelApi.whitelistClear, {
    invalidate: invalidateKeys.whitelist,
    onError: (e) => setError(formatApiError(e, "Failed to clear whitelist")),
  });
  const [commandChannelSaveMut] = useMutation(panelApi.commandChannelSave, {
    invalidate: invalidateKeys.commandChannels,
    onError: (e) => setError(formatApiError(e, "Failed to save command channel")),
  });
  const [commandChannelClearMut] = useMutation(panelApi.commandChannelClear, {
    invalidate: invalidateKeys.commandChannels,
    onSuccess: () => setSampGameChannel(""),
    onError: (e) => setError(formatApiError(e, "Failed to clear command channel")),
  });
  const [rateLimitSaveMut] = useMutation(panelApi.rateLimitSaveConfig, {
    invalidate: invalidateKeys.rateConfig,
    onSuccess: () => setRateMessage("Rate limit settings saved."),
    onError: (e) => setError(formatApiError(e, "Failed to save rate limit config")),
  });
  const [clearStrikesMut] = useMutation(panelApi.rateLimitClearStrikes, {
    invalidate: invalidateKeys.strikes,
    onError: (e) => setError(formatApiError(e, "Failed to clear strikes")),
  });
  const [bulkDeleteMut] = useMutation(panelApi.bulkDeleteChannels, {
    invalidate: invalidateKeys.channels,
    onSuccess: () => setDeleteChannelIds([]),
    onError: (e) => setError(formatApiError(e, "Failed to delete channels")),
  });

  // ── Load rate config when channel changes ────────────────
  async function loadConfig(channelId) {
    if (!channelId) return;
    try {
      const data = await panelApi.rateLimitConfig(botKey, guildId, channelId);
      setRateConfig(normalizeRateConfig(data?.config));
      setRateMessage("");
    } catch (e) {
      setError(formatApiError(e, "Failed to load rate config"));
    }
  }

  useEffect(() => {
    if (selectedChannel) loadConfig(selectedChannel);
  }, [selectedChannel]);

  // ── Sync sampGameChannel from commandRestrictions on first load ─
  const [sampGameInit, setSampGameInit] = useState(false);
  useEffect(() => {
    if (!sampGameInit && commandChannelsQuery.data) {
      const restrictions = commandChannelsQuery.data.restrictions || [];
      setSampGameChannel(restrictions.find((item) => item.command_category === "samp_game")?.channel_id || "");
      setSampGameInit(true);
    }
  }, [commandChannelsQuery.data, sampGameInit]);

  // ── Reset user search when channel changes ──────────────
  useEffect(() => {
    setUserSearchResults([]);
    setUserSearch("");
    setNewOverrideUserId("");
    setNewOverrideUsername("");
    setNewOverrideLimit(String(rateConfig.default_limit || 10));
  }, [selectedChannel]);

  // ── User search ──────────────────────────────────────────
  async function searchUsers(event) {
    event?.preventDefault?.();
    const query = userSearch.trim();
    if (!query || !guildId) {
      setUserSearchResults([]);
      return;
    }

    setUserSearchLoading(true);
    setError("");
    try {
      const data = await panelApi.statsUsers(botKey, {
        guildId,
        search: query,
        limit: "10",
        offset: "0",
        sortBy: "count",
      });
      setUserSearchResults(data?.users || []);
    } catch (e) {
      setError(formatApiError(e, "Failed to search users"));
    } finally {
      setUserSearchLoading(false);
    }
  }

  function addUserOverride(user) {
    const userId = String(user?.user_id || newOverrideUserId || "").trim();
    if (!userId) return;

    const username = String(user?.username || newOverrideUsername || "").trim();
    const limit = Math.max(1, Number(newOverrideLimit) || rateConfig.default_limit || 10);

    setRateConfig((current) => {
      const next = normalizeRateConfig(current);
      const existingIndex = next.user_limits.findIndex((entry) => entry.user_id === userId);
      const entry = { user_id: userId, username, limit };

      if (existingIndex >= 0) {
        const userLimits = [...next.user_limits];
        userLimits[existingIndex] = entry;
        return { ...next, user_limits: userLimits };
      }

      return { ...next, user_limits: [...next.user_limits, entry] };
    });

    setNewOverrideUserId("");
    setNewOverrideUsername("");
    setNewOverrideLimit(String(limit));
    setRateMessage("");
  }

  function updateUserOverride(userId, patch) {
    setRateConfig((current) => ({
      ...current,
      user_limits: current.user_limits.map((entry) =>
        entry.user_id === userId
          ? {
              ...entry,
              ...patch,
              limit: Math.max(1, Number(patch.limit ?? entry.limit) || entry.limit),
            }
          : entry
      ),
    }));
    setRateMessage("");
  }

  function removeUserOverride(userId) {
    setRateConfig((current) => ({
      ...current,
      user_limits: current.user_limits.filter((entry) => entry.user_id !== userId),
    }));
    setRateMessage("");
  }

  async function saveRateConfig() {
    if (!selectedChannel) {
      setError("Select a channel first");
      return;
    }

    setSavingRateConfig(true);
    setError("");
    setRateMessage("");
    try {
      await rateLimitSaveMut(botKey, {
        guildId,
        channelId: selectedChannel,
        config: normalizeRateConfig(rateConfig),
      });
      await loadConfig(selectedChannel);
    } catch (e) {
      // Error already handled by mutation onError
    } finally {
      setSavingRateConfig(false);
    }
  }

  // ── Combine query errors ─────────────────────────────────
  const queryError = channelsQuery.error || automodQuery.error || whitelistQuery.error || commandChannelsQuery.error || strikesQuery.error;
  const displayError = error || (queryError ? queryError.message || String(queryError) : "");

  return (
    <div className="page">
      <PageHeader
        icon={Shield}
        title="Moderation"
        subtitle="AutoMod, whitelist, rate limits, and command-channel restrictions."
      />

      {displayError ? <Alert type="error">{displayError}</Alert> : null}
      {rateMessage ? <Alert type="success">{rateMessage}</Alert> : null}

      <div className="page-tabs">
        <button
          className={`page-tab${tab === "automod" ? " active" : ""}`}
          onClick={() => setTab("automod")}
        >
          <Ban size={13} />AutoMod Words
        </button>
        <button
          className={`page-tab${tab === "whitelist" ? " active" : ""}`}
          onClick={() => setTab("whitelist")}
        >
          <Hash size={13} />Whitelist
        </button>
        <button
          className={`page-tab${tab === "gamecommands" ? " active" : ""}`}
          onClick={() => setTab("gamecommands")}
        >
          <Gamepad2 size={13} />Game Commands
        </button>
        <button
          className={`page-tab${tab === "ratelimits" ? " active" : ""}`}
          onClick={() => setTab("ratelimits")}
        >
          <Gauge size={13} />Rate Limits
        </button>
        <button
          className={`page-tab${tab === "strikes" ? " active" : ""}`}
          onClick={() => setTab("strikes")}
        >
          <AlertOctagon size={13} />Strikes
        </button>
        <button
          className={`page-tab${tab === "channels" ? " active" : ""}`}
          onClick={() => setTab("channels")}
        >
          <Layers size={13} />Channels
        </button>
      </div>

      {tab === "automod" && (
        <SectionCard
          title="AutoMod Banned Words"
          icon={Ban}
          actions={
            <button
              className="btn--ghost btn--sm btn--danger"
              onClick={() => automodClearMut(botKey)}
            >
              Clear all
            </button>
          }
        >
          {loading ? (
            <LoadingSkeleton type="table" rows={4} />
          ) : (
            <>
              <div className="form-row">
                <input
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  placeholder="Add banned word…"
                />
                <button
                  className="btn--ghost btn--sm"
                  onClick={() => automodAddMut(botKey, { word: newWord, case_sensitive: false })}
                >
                  <Plus size={13} />Add
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Word</th>
                      <th>Case sensitive</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {automod.map((w) => (
                      <tr key={w.word}>
                        <td>{w.word}</td>
                        <td>{w.case_sensitive ? "Yes" : "No"}</td>
                        <td>
                          <button
                            className="btn--icon btn--danger-icon"
                            onClick={() => automodDeleteMut(botKey, w.word)}
                          >
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {tab === "whitelist" && (
        <SectionCard
          title="Channel Whitelist"
          icon={Hash}
          actions={
            <button
              className="btn--ghost btn--sm btn--danger"
              onClick={() => whitelistClearMut(botKey)}
            >
              Clear all
            </button>
          }
        >
          {loading ? (
            <LoadingSkeleton type="table" rows={4} />
          ) : (
            <>
              <div className="form-row">
                <select
                  value={newWhitelistChannel}
                  onChange={(e) => setNewWhitelistChannel(e.target.value)}
                >
                  <option value="">Select channel</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.name} ({ch.id})</option>
                  ))}
                </select>
                <button
                  className="btn--ghost btn--sm"
                  onClick={() => whitelistAddMut(botKey, { channel_id: newWhitelistChannel })}
                >
                  <Plus size={13} />Add
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>ID</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {whitelist.map((ch) => (
                      <tr key={ch.id}>
                        <td>{ch.name}</td>
                        <td>{ch.id}</td>
                        <td>
                          <button
                            className="btn--icon btn--danger-icon"
                            onClick={() => whitelistDeleteMut(botKey, ch.id)}
                          >
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {tab === "gamecommands" && (
        <SectionCard
          title="SAMP Game Command Channel"
          icon={Gamepad2}
          actions={
            <button
              className="btn--ghost btn--sm btn--danger"
              onClick={() => commandChannelClearMut(botKey, "samp_game")}
            >
              Clear restriction
            </button>
          }
        >
          {loading ? (
            <LoadingSkeleton type="card" rows={3} />
          ) : (
            <>
              <Alert type="info">
                Restrict all SAMP Life gameplay commands to one Discord channel. Outside that channel, users get a Russian warning in Discord. Non-game stats commands still work everywhere.
              </Alert>
              <div className="form-row">
                <select
                  value={sampGameChannel}
                  onChange={(e) => setSampGameChannel(e.target.value)}
                >
                  <option value="">Select channel</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.name} ({ch.id})</option>
                  ))}
                </select>
                <button
                  className="btn--ghost btn--sm"
                  onClick={() => {
                    if (!sampGameChannel) return;
                    commandChannelSaveMut(botKey, {
                      command_category: "samp_game",
                      channel_id: sampGameChannel,
                    });
                  }}
                >
                  <Save size={13} />Save channel
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Channel</th>
                      <th>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commandRestrictions.length > 0 ? commandRestrictions.map((item) => (
                      <tr key={item.command_category}>
                        <td>{item.label}</td>
                        <td>{item.channel_name}</td>
                        <td>{item.channel_id}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="text-muted" style={{ padding: "18px", textAlign: "center" }}>
                          No command channel restriction configured. SAMP commands are currently usable in any channel.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>
      )}

      {tab === "ratelimits" && (
        <SectionCard title="Rate Limits" icon={Gauge}>
          <Alert type="info">
            Configure a per-channel consecutive-message limit. Explicit user overrides take priority over role overrides and the channel default.
          </Alert>
          <div className="form-row">
            <label>
              Channel
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
              >
                <option value="">Select channel</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            </label>
          </div>

          {rateConfig ? (
            <div className="form-grid">
              <label>
                <input
                  type="checkbox"
                  checked={rateConfig.enabled}
                  onChange={(e) => setRateConfig((current) => ({ ...current, enabled: e.target.checked }))}
                  style={{ marginRight: "0.5rem" }}
                />
                Enable limit
              </label>
              <label>
                Default consecutive messages
                <input
                  type="number"
                  min="1"
                  value={rateConfig.default_limit ?? 10}
                  onChange={(e) => setRateConfig((current) => ({ ...current, default_limit: Math.max(1, Number(e.target.value) || 1) }))}
                />
              </label>
              <label>
                Warning message
                <input
                  value={rateConfig.warning_message ?? ""}
                  onChange={(e) => setRateConfig((current) => ({ ...current, warning_message: e.target.value }))}
                />
              </label>
              <label>
                Action
                <select
                  value={rateConfig.action ?? "delete"}
                  onChange={(e) => setRateConfig((current) => ({ ...current, action: e.target.value }))}
                >
                  <option value="delete">Delete message</option>
                  <option value="warn">Warn only</option>
                </select>
              </label>
              <label>
                Strike reset days
                <input
                  type="number"
                  min="1"
                  value={rateConfig.strike_reset_days ?? 7}
                  onChange={(e) => setRateConfig((current) => ({ ...current, strike_reset_days: Math.max(1, Number(e.target.value) || 1) }))}
                />
              </label>
              <label>
                Timeout per strike (minutes)
                <input
                  type="number"
                  min="1"
                  value={rateConfig.timeout_duration_per_strike ?? 1}
                  onChange={(e) => setRateConfig((current) => ({ ...current, timeout_duration_per_strike: Math.max(1, Number(e.target.value) || 1) }))}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={rateConfig.timeouts_enabled !== false}
                  onChange={(e) => setRateConfig((current) => ({ ...current, timeouts_enabled: e.target.checked }))}
                  style={{ marginRight: "0.5rem" }}
                />
                Enable timeouts
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={rateConfig.ignore_admins !== false}
                  onChange={(e) => setRateConfig((current) => ({ ...current, ignore_admins: e.target.checked }))}
                  style={{ marginRight: "0.5rem" }}
                />
                Ignore admins
              </label>
            </div>
          ) : (
            selectedChannel ? <LoadingSkeleton type="card" /> : null
          )}

          {selectedChannel ? (
            <>
              <SectionCard title="User Overrides" icon={Gauge}>
                <form className="form-row" onSubmit={searchUsers}>
                  <div style={{ flex: 1 }}>
                    <label>
                      Search existing users
                      <input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Username or Discord ID"
                      />
                    </label>
                  </div>
                  <div className="row-actions" style={{ alignSelf: "end" }}>
                    <button type="submit" className="btn--ghost btn--sm" disabled={userSearchLoading}>
                      <Search size={13} />{userSearchLoading ? "Searching…" : "Search"}
                    </button>
                  </div>
                </form>

                {userSearchResults.length > 0 ? (
                  <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>User ID</th>
                          <th>Messages</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {userSearchResults.map((user) => (
                          <tr key={user.user_id}>
                            <td>{user.username || "Unknown"}</td>
                            <td className="text-muted text-sm font-mono">{user.user_id}</td>
                            <td>{Number(user.message_count || 0).toLocaleString()}</td>
                            <td>
                              <button
                                className="btn--ghost btn--sm"
                                onClick={() => {
                                  setNewOverrideLimit(String(rateConfig.default_limit || 10));
                                  addUserOverride(user);
                                }}
                                type="button"
                              >
                                <Plus size={13} />Add override
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                <div className="form-grid" style={{ marginTop: "1rem" }}>
                  <label>
                    Manual user ID
                    <input
                      value={newOverrideUserId}
                      onChange={(e) => setNewOverrideUserId(e.target.value)}
                      placeholder="Discord user ID"
                    />
                  </label>
                  <label>
                    Display name
                    <input
                      value={newOverrideUsername}
                      onChange={(e) => setNewOverrideUsername(e.target.value)}
                      placeholder="Optional username label"
                    />
                  </label>
                  <label>
                    Limit
                    <input
                      type="number"
                      min="1"
                      value={newOverrideLimit}
                      onChange={(e) => setNewOverrideLimit(e.target.value)}
                    />
                  </label>
                  <div className="row-actions" style={{ alignSelf: "end" }}>
                    <button className="btn--ghost btn--sm" type="button" onClick={() => addUserOverride()}>
                      <Plus size={13} />Add by ID
                    </button>
                  </div>
                </div>

                <div className="table-wrap" style={{ marginTop: "1rem" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>User ID</th>
                        <th>Limit</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rateConfig.user_limits.length > 0 ? rateConfig.user_limits.map((entry) => (
                        <tr key={entry.user_id}>
                          <td>
                            <input
                              value={entry.username || ""}
                              onChange={(e) => updateUserOverride(entry.user_id, { username: e.target.value })}
                              placeholder="Username"
                            />
                          </td>
                          <td className="text-muted text-sm font-mono">{entry.user_id}</td>
                          <td style={{ width: "9rem" }}>
                            <input
                              type="number"
                              min="1"
                              value={entry.limit}
                              onChange={(e) => updateUserOverride(entry.user_id, { limit: e.target.value })}
                            />
                          </td>
                          <td>
                            <button
                              className="btn--icon btn--danger-icon"
                              onClick={() => removeUserOverride(entry.user_id)}
                              type="button"
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="text-muted" style={{ padding: "18px", textAlign: "center" }}>
                            No user-specific limits configured for this channel.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <div className="row-actions">
                <button
                  className="btn--ghost btn--sm"
                  onClick={saveRateConfig}
                  disabled={savingRateConfig}
                >
                  <Save size={13} />{savingRateConfig ? "Saving…" : "Save config"}
                </button>
              </div>
            </>
          ) : null}
        </SectionCard>
      )}

      {tab === "strikes" && (
        <SectionCard title="Active Strikes" icon={AlertOctagon}>
          {loading ? (
            <LoadingSkeleton type="table" rows={4} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Strikes</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {strikes.map((s) => (
                    <tr key={s.user_id}>
                      <td>{s.username || s.user_id}</td>
                      <td>
                        <span className="badge badge--danger">{s.strikes}</span>
                      </td>
                      <td>
                        <button
                          className="btn--icon btn--danger-icon"
                          onClick={() => clearStrikesMut(botKey, { guildId, userId: s.user_id })}
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {tab === "channels" && (
        <SectionCard
          title="Channel Management"
          icon={Layers}
          description="Bulk delete up to 100 channels at once."
          actions={
            <button
              className="btn--ghost btn--sm btn--danger"
              onClick={() => {
                if (!deleteChannelIds.length) return;
                bulkDeleteMut(botKey, { channelIds: deleteChannelIds.slice(0, 100) });
              }}
            >
              Delete selected
            </button>
          }
        >
          {loading ? (
            <LoadingSkeleton type="table" rows={6} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((ch) => (
                    <tr key={ch.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={deleteChannelIds.includes(ch.id)}
                          onChange={(e) => {
                            setDeleteChannelIds((prev) =>
                              e.target.checked ? [...prev, ch.id] : prev.filter((id) => id !== ch.id)
                            );
                          }}
                        />
                      </td>
                      <td>{ch.name}</td>
                      <td>{ch.id}</td>
                      <td>{String(ch.type)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}