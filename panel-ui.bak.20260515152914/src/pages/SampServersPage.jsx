import { useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, Save, Server, Square, Trash2, X } from "lucide-react";
import { panelApi } from "../lib/api";
import { Alert } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";

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
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

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

  function handleEdit(s) {
    setEditingId(s.server_id);
    setForm({ ...s });
  }

  function handleCancelEdit() {
    setEditingId("");
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    setError("");
    try {
      if (editingId) {
        await panelApi.updateSampServer(bot.key, editingId, form);
      } else {
        await panelApi.addSampServer(bot.key, form);
      }
      setEditingId("");
      setForm(EMPTY_FORM);
      loadAll();
    } catch (e) {
      setError(e.message || "Failed to save server");
    }
  }

  async function handleDelete(serverId) {
    setError("");
    try {
      await panelApi.removeSampServer(bot.key, serverId);
      setConfirmDeleteId(null);
      loadAll();
    } catch (e) {
      setError(e.message || "Failed to delete server");
    }
  }

  async function handleToggle(s) {
    setError("");
    try {
      if (s.enabled) {
        await panelApi.stopSampServer(bot.key, s.server_id);
      } else {
        await panelApi.startSampServer(bot.key, s.server_id);
      }
      loadAll();
    } catch (e) {
      setError(e.message || "Failed to toggle server");
    }
  }

  async function handleRefresh(serverId) {
    setError("");
    try {
      await panelApi.refreshSampServer(bot.key, serverId);
    } catch (e) {
      setError(e.message || "Failed to refresh server");
    }
  }

  return (
    <div className="page">
      <PageHeader
        icon={Server}
        title="SA-MP Servers"
        subtitle="Track and manage SA-MP game server status."
      />

      {error && <Alert type="error">{error}</Alert>}

      {servers.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No servers configured"
          message="Add your first SA-MP server below."
        />
      ) : (
        <div className="grid mb-6">
          {servers.map((s) => (
            <div key={s.server_id} className="card">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">
                  {s.emoji} {s.server_name || s.server_ip}
                </span>
                <StatusBadge status={s.enabled ? "enabled" : "disabled"} />
              </div>
              <p className="text-muted text-sm font-mono">
                {s.server_ip}:{s.server_port}
              </p>
              {s.channel_id && (
                <p className="text-muted text-sm mt-1">#{s.channel_id}</p>
              )}
              <div className="row-actions mt-3">
                <button
                  className="btn--icon"
                  onClick={() => handleEdit(s)}
                  title="Edit"
                >
                  <Pencil size={13} />
                </button>
                <button
                  className="btn--icon"
                  onClick={() => handleRefresh(s.server_id)}
                  title="Refresh"
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  className="btn--icon"
                  onClick={() => handleToggle(s)}
                  title={s.enabled ? "Stop" : "Start"}
                >
                  <Square size={13} />
                </button>
                {confirmDeleteId === s.server_id ? (
                  <span className="flex items-center gap-1 text-muted text-sm">
                    Delete?
                    <button
                      className="btn--sm btn--danger"
                      onClick={() => handleDelete(s.server_id)}
                    >
                      Yes
                    </button>
                    <button
                      className="btn--ghost btn--sm"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn--icon btn--danger"
                    onClick={() => setConfirmDeleteId(s.server_id)}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionCard
        title={editingId ? "Edit Server" : "Add Server"}
        icon={editingId ? Pencil : Plus}
      >
        <div className="grid grid-2">
          <label>
            Server ID
            <input
              value={form.server_id}
              disabled={!!editingId}
              onChange={(e) => setForm((p) => ({ ...p, server_id: e.target.value }))}
            />
          </label>
          <label>
            Name
            <input
              value={form.server_name}
              onChange={(e) => setForm((p) => ({ ...p, server_name: e.target.value }))}
            />
          </label>
          <label>
            IP
            <input
              value={form.server_ip}
              onChange={(e) => setForm((p) => ({ ...p, server_ip: e.target.value }))}
            />
          </label>
          <label>
            Port
            <input
              type="number"
              value={form.server_port}
              onChange={(e) =>
                setForm((p) => ({ ...p, server_port: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Channel
            <select
              value={form.channel_id}
              onChange={(e) => setForm((p) => ({ ...p, channel_id: e.target.value }))}
            >
              <option value="">Select channel</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Emoji
            <input
              value={form.emoji}
              onChange={(e) => setForm((p) => ({ ...p, emoji: e.target.value }))}
            />
          </label>
        </div>
        <div className="row-actions mt-3">
          <button className="btn--sm" onClick={handleSave}>
            <Save size={13} />
            {editingId ? "Save" : "Create"}
          </button>
          {editingId && (
            <button className="btn--ghost btn--sm" onClick={handleCancelEdit}>
              <X size={13} />
              Cancel
            </button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
