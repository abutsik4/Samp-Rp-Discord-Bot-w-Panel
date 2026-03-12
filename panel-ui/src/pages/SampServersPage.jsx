import { useEffect, useState } from "react";
import { panelApi } from "../lib/api";

const EMPTY_FORM = {
  server_id: "",
  server_name: "",
  server_ip: "",
  server_port: 7777,
  channel_id: "",
  emoji: "🎮",
};

export function SampServersPage({ bot }) {
  const [servers, setServers] = useState([]);
  const [channels, setChannels] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");

  async function loadAll() {
    setError("");
    try {
      const [s, c] = await Promise.all([
        panelApi.sampServers(bot.key),
        panelApi.sendableChannels(bot.key),
      ]);
      setServers(s.servers || []);
      setChannels(c.items || []);
    } catch (e) {
      setError(e.message || "Failed to load SAMP servers");
    }
  }

  useEffect(() => {
    loadAll();
  }, [bot.key]);

  return (
    <div className="page">
      <h1>SA-MP Servers</h1>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="card form-card">
        <h3>{editingId ? `Edit server ${editingId}` : "Add server"}</h3>
        <div className="grid grid-2">
          <label>Server ID
            <input value={form.server_id} disabled={!!editingId} onChange={(e) => setForm((p) => ({ ...p, server_id: e.target.value }))} />
          </label>
          <label>Name
            <input value={form.server_name} onChange={(e) => setForm((p) => ({ ...p, server_name: e.target.value }))} />
          </label>
          <label>IP
            <input value={form.server_ip} onChange={(e) => setForm((p) => ({ ...p, server_ip: e.target.value }))} />
          </label>
          <label>Port
            <input type="number" value={form.server_port} onChange={(e) => setForm((p) => ({ ...p, server_port: Number(e.target.value) }))} />
          </label>
          <label>Channel
            <select value={form.channel_id} onChange={(e) => setForm((p) => ({ ...p, channel_id: e.target.value }))}>
              <option value="">Select channel</option>
              {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
          </label>
          <label>Emoji
            <input value={form.emoji} onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))} />
          </label>
        </div>
        <div className="row-actions">
          <button
            onClick={async () => {
              if (editingId) {
                await panelApi.updateSampServer(bot.key, editingId, form);
              } else {
                await panelApi.addSampServer(bot.key, form);
              }
              setEditingId("");
              setForm(EMPTY_FORM);
              loadAll();
            }}
          >
            {editingId ? "Save" : "Create"}
          </button>
          {editingId ? <button className="btn-secondary" onClick={() => { setEditingId(""); setForm(EMPTY_FORM); }}>Cancel</button> : null}
        </div>
      </div>

      <div className="card form-card">
        <h3>Configured Servers</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Name</th><th>Address</th><th>Channel</th><th>Enabled</th><th /></tr></thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.server_id}>
                  <td>{s.server_id}</td>
                  <td>{s.server_name}</td>
                  <td>{s.server_ip}:{s.server_port}</td>
                  <td>{s.channel_id}</td>
                  <td>{s.enabled ? "Yes" : "No"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-secondary" onClick={() => { setEditingId(s.server_id); setForm({ ...s }); }}>Edit</button>
                      <button className="btn-secondary" onClick={async () => { await panelApi.refreshSampServer(bot.key, s.server_id); }}>Refresh</button>
                      <button className="btn-secondary" onClick={async () => {
                        if (s.enabled) await panelApi.stopSampServer(bot.key, s.server_id);
                        else await panelApi.startSampServer(bot.key, s.server_id);
                        loadAll();
                      }}>{s.enabled ? "Stop" : "Start"}</button>
                      <button className="btn-danger" onClick={async () => { await panelApi.removeSampServer(bot.key, s.server_id); loadAll(); }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}