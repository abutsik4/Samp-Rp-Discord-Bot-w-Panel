import { useEffect, useState } from "react";
import { panelApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import {
  Shield, Ban, Hash, Gauge, AlertOctagon, Layers, Plus, X, Save, Gamepad2,
} from "lucide-react";

export function ModerationPage({ bot }) {
  const guildId = bot?.guild_id;
  const [channels, setChannels] = useState([]);
  const [automod, setAutomod] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [commandRestrictions, setCommandRestrictions] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [rateConfig, setRateConfig] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [newWord, setNewWord] = useState("");
  const [newWhitelistChannel, setNewWhitelistChannel] = useState("");
  const [sampGameChannel, setSampGameChannel] = useState("");
  const [deleteChannelIds, setDeleteChannelIds] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("automod");

  async function loadAll() {
    setError("");
    try {
      const [ch, am, wl, cc, st] = await Promise.all([
        panelApi.channels(bot.key),
        panelApi.automodList(bot.key),
        panelApi.whitelistList(bot.key),
        panelApi.commandChannelList(bot.key),
        panelApi.rateLimitStrikes(bot.key, guildId),
      ]);
      setChannels(ch.channels || []);
      setAutomod(am.words || []);
      setWhitelist(wl.channels || []);
      const restrictions = cc.restrictions || [];
      setCommandRestrictions(restrictions);
      setSampGameChannel(restrictions.find((item) => item.command_category === "samp_game")?.channel_id || "");
      setStrikes(st.users || []);
    } catch (e) {
      setError(e.message || "Failed to load moderation data");
    } finally {
      setLoading(false);
    }
  }

  async function loadConfig(channelId) {
    if (!channelId) return;
    try {
      const data = await panelApi.rateLimitConfig(bot.key, guildId, channelId);
      setRateConfig(data.config || {});
    } catch (e) {
      setError(e.message || "Failed to load rate config");
    }
  }

  useEffect(() => {
    loadAll();
  }, [bot.key]);

  useEffect(() => {
    if (selectedChannel) loadConfig(selectedChannel);
  }, [selectedChannel]);

  return (
    <div className="page">
      <PageHeader
        icon={Shield}
        title="Moderation"
        subtitle="AutoMod, whitelist, rate limits, and command-channel restrictions."
      />

      {error ? <Alert type="error">{error}</Alert> : null}

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
              onClick={async () => { await panelApi.automodClear(bot.key); loadAll(); }}
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
                  onClick={async () => {
                    await panelApi.automodAdd(bot.key, { word: newWord, case_sensitive: false });
                    setNewWord("");
                    loadAll();
                  }}
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
                            onClick={async () => { await panelApi.automodDelete(bot.key, w.word); loadAll(); }}
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
              onClick={async () => { await panelApi.whitelistClear(bot.key); loadAll(); }}
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
                  onClick={async () => {
                    await panelApi.whitelistAdd(bot.key, { channel_id: newWhitelistChannel });
                    setNewWhitelistChannel("");
                    loadAll();
                  }}
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
                            onClick={async () => { await panelApi.whitelistDelete(bot.key, ch.id); loadAll(); }}
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
              onClick={async () => {
                await panelApi.commandChannelClear(bot.key, "samp_game");
                setSampGameChannel("");
                loadAll();
              }}
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
                  onClick={async () => {
                    if (!sampGameChannel) return;
                    await panelApi.commandChannelSave(bot.key, {
                      command_category: "samp_game",
                      channel_id: sampGameChannel,
                    });
                    loadAll();
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
                Max messages
                <input
                  type="number"
                  value={rateConfig.max_messages ?? 5}
                  onChange={(e) => setRateConfig((p) => ({ ...p, max_messages: Number(e.target.value) }))}
                />
              </label>
              <label>
                Window seconds
                <input
                  type="number"
                  value={rateConfig.window_seconds ?? 10}
                  onChange={(e) => setRateConfig((p) => ({ ...p, window_seconds: Number(e.target.value) }))}
                />
              </label>
              <label>
                Timeout minutes
                <input
                  type="number"
                  value={rateConfig.timeout_minutes ?? 10}
                  onChange={(e) => setRateConfig((p) => ({ ...p, timeout_minutes: Number(e.target.value) }))}
                />
              </label>
              <div className="row-actions">
                <button
                  className="btn--ghost btn--sm"
                  onClick={async () => {
                    await panelApi.rateLimitSaveConfig(bot.key, { guildId, channelId: selectedChannel, config: rateConfig });
                    loadConfig(selectedChannel);
                  }}
                >
                  <Save size={13} />Save config
                </button>
              </div>
            </div>
          ) : (
            selectedChannel ? <LoadingSkeleton type="card" /> : null
          )}
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
                          onClick={async () => {
                            await panelApi.rateLimitClearStrikes(bot.key, { guildId, userId: s.user_id });
                            loadAll();
                          }}
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
              onClick={async () => {
                if (!deleteChannelIds.length) return;
                await panelApi.bulkDeleteChannels(bot.key, { channelIds: deleteChannelIds.slice(0, 100) });
                setDeleteChannelIds([]);
                loadAll();
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
