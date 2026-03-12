import { useEffect, useState } from "react";
import { panelApi } from "../lib/api";

export function ModerationPage({ bot }) {
  const guildId = bot?.guild_id;
  const [channels, setChannels] = useState([]);
  const [automod, setAutomod] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [rateConfig, setRateConfig] = useState(null);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [newWord, setNewWord] = useState("");
  const [newWhitelistChannel, setNewWhitelistChannel] = useState("");
  const [deleteChannelIds, setDeleteChannelIds] = useState([]);
  const [error, setError] = useState("");

  async function loadAll() {
    setError("");
    try {
      const [ch, am, wl, st] = await Promise.all([
        panelApi.channels(bot.key),
        panelApi.automodList(bot.key),
        panelApi.whitelistList(bot.key),
        panelApi.rateLimitStrikes(bot.key, guildId),
      ]);
      setChannels(ch.channels || []);
      setAutomod(am.words || []);
      setWhitelist(wl.channels || []);
      setStrikes(st.users || []);
    } catch (e) {
      setError(e.message || "Failed to load moderation data");
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
      <h1>Moderation</h1>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="card form-card">
        <h3>AutoMod Banned Words</h3>
        <div className="inline-form">
          <input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="word" />
          <button
            onClick={async () => {
              await panelApi.automodAdd(bot.key, { word: newWord, case_sensitive: false });
              setNewWord("");
              loadAll();
            }}
          >
            Add
          </button>
          <button className="btn-danger" onClick={async () => { await panelApi.automodClear(bot.key); loadAll(); }}>
            Clear all
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Word</th><th>Case</th><th /></tr></thead>
            <tbody>
              {automod.map((w) => (
                <tr key={w.word}>
                  <td>{w.word}</td>
                  <td>{w.case_sensitive ? "Yes" : "No"}</td>
                  <td><button className="btn-danger" onClick={async () => { await panelApi.automodDelete(bot.key, w.word); loadAll(); }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card form-card">
        <h3>Channel Whitelist</h3>
        <div className="inline-form">
          <select value={newWhitelistChannel} onChange={(e) => setNewWhitelistChannel(e.target.value)}>
            <option value="">Select channel</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name} ({ch.id})</option>)}
          </select>
          <button onClick={async () => { await panelApi.whitelistAdd(bot.key, { channel_id: newWhitelistChannel }); setNewWhitelistChannel(""); loadAll(); }}>Add</button>
          <button className="btn-danger" onClick={async () => { await panelApi.whitelistClear(bot.key); loadAll(); }}>Clear all</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Channel</th><th>ID</th><th /></tr></thead>
            <tbody>
              {whitelist.map((ch) => (
                <tr key={ch.id}>
                  <td>{ch.name}</td>
                  <td>{ch.id}</td>
                  <td><button className="btn-danger" onClick={async () => { await panelApi.whitelistDelete(bot.key, ch.id); loadAll(); }}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card form-card">
          <h3>Rate Limits</h3>
          <label>
            Channel
            <select value={selectedChannel} onChange={(e) => setSelectedChannel(e.target.value)}>
              <option value="">Select channel</option>
              {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
          </label>

          {rateConfig ? (
            <>
              <label>Max messages
                <input type="number" value={rateConfig.max_messages ?? 5} onChange={(e) => setRateConfig((p) => ({ ...p, max_messages: Number(e.target.value) }))} />
              </label>
              <label>Window seconds
                <input type="number" value={rateConfig.window_seconds ?? 10} onChange={(e) => setRateConfig((p) => ({ ...p, window_seconds: Number(e.target.value) }))} />
              </label>
              <label>Timeout minutes
                <input type="number" value={rateConfig.timeout_minutes ?? 10} onChange={(e) => setRateConfig((p) => ({ ...p, timeout_minutes: Number(e.target.value) }))} />
              </label>
              <button onClick={async () => {
                await panelApi.rateLimitSaveConfig(bot.key, { guildId, channelId: selectedChannel, config: rateConfig });
                loadConfig(selectedChannel);
              }}>Save config</button>
            </>
          ) : null}
        </div>

        <div className="card form-card">
          <h3>Active Strikes</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>User</th><th>Strikes</th><th /></tr></thead>
              <tbody>
                {strikes.map((s) => (
                  <tr key={s.user_id}>
                    <td>{s.username || s.user_id}</td>
                    <td>{s.strikes}</td>
                    <td>
                      <button
                        className="btn-danger"
                        onClick={async () => {
                          await panelApi.rateLimitClearStrikes(bot.key, { guildId, userId: s.user_id });
                          loadAll();
                        }}
                      >
                        Clear
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card form-card">
        <h3>Channel Management</h3>
        <p className="muted">Bulk delete up to 100 channels at once.</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Select</th><th>Name</th><th>ID</th><th>Type</th></tr></thead>
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
        <button
          className="btn-danger"
          onClick={async () => {
            if (!deleteChannelIds.length) return;
            await panelApi.bulkDeleteChannels(bot.key, { channelIds: deleteChannelIds.slice(0, 100) });
            setDeleteChannelIds([]);
            loadAll();
          }}
        >
          Delete selected channels
        </button>
      </div>
    </div>
  );
}