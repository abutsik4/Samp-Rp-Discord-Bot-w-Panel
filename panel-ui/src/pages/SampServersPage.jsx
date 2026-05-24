import { useState } from "react";
import { Pencil, Plus, RefreshCw, Save, Server, Square, Trash2, X } from "lucide-react";
import { panelApi } from "../lib/api";
import { useQuery, useMutation } from "../hooks/useQuery";
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
  const serversUrl = `/panel/api/${encodeURIComponent(bot.key)}/samp-servers`;
  const channelsUrl = `/panel/api/${encodeURIComponent(bot.key)}/sendable-channels`;

  const { data: serversData, loading: serversLoading, error: serversError, refresh: refreshServers } = useQuery(serversUrl, { deps: [bot.key] });
  const { data: channelsData, loading: channelsLoading, error: channelsError } = useQuery(channelsUrl, { deps: [bot.key] });

  const servers = serversData?.servers || [];
  const channels = channelsData?.items || [];

  const loading = serversLoading || channelsLoading;
  const queryError = serversError || channelsError;

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const error = queryError?.message || mutationError;

  const [addServer, { loading: adding }] = useMutation(
    (payload) => panelApi.addSampServer(bot.key, payload),
    {
      invalidate: [serversUrl],
      onSuccess: () => {
        setEditingId("");
        setForm(EMPTY_FORM);
        setMutationError("");
      },
      onError: (err) => {
        setMutationError(err.message || "Failed to add server");
      },
    }
  );

  const [updateServer, { loading: updating }] = useMutation(
    ({ serverId, payload }) => panelApi.updateSampServer(bot.key, serverId, payload),
    {
      invalidate: [serversUrl],
      onSuccess: () => {
        setEditingId("");
        setForm(EMPTY_FORM);
        setMutationError("");
      },
      onError: (err) => {
        setMutationError(err.message || "Failed to update server");
      },
    }
  );

  const [removeServer, { loading: removing }] = useMutation(
    (serverId) => panelApi.removeSampServer(bot.key, serverId),
    {
      invalidate: [serversUrl],
      onSuccess: () => {
        setConfirmDeleteId(null);
        setMutationError("");
      },
      onError: (err) => {
        setMutationError(err.message || "Failed to delete server");
      },
    }
  );

  const [startServer, { loading: starting }] = useMutation(
    (serverId) => panelApi.startSampServer(bot.key, serverId),
    {
      invalidate: [serversUrl],
      onError: (err) => {
        setMutationError(err.message || "Failed to start server");
      },
    }
  );

  const [stopServer, { loading: stopping }] = useMutation(
    (serverId) => panelApi.stopSampServer(bot.key, serverId),
    {
      invalidate: [serversUrl],
      onError: (err) => {
        setMutationError(err.message || "Failed to stop server");
      },
    }
  );

  const [refreshServer, { loading: refreshing }] = useMutation(
    (serverId) => panelApi.refreshSampServer(bot.key, serverId),
    {
      invalidate: [serversUrl],
      onError: (err) => {
        setMutationError(err.message || "Failed to refresh server");
      },
    }
  );

  function handleEdit(s) {
    setEditingId(s.server_id);
    setForm({ ...s });
  }

  function handleCancelEdit() {
    setEditingId("");
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    setMutationError("");
    try {
      if (editingId) {
        await updateServer({ serverId: editingId, payload: form });
      } else {
        await addServer(form);
      }
    } catch {
      // error handled in onError callback
    }
  }

  async function handleDelete(serverId) {
    setMutationError("");
    try {
      await removeServer(serverId);
    } catch {
      // error handled in onError callback
    }
  }

  async function handleToggle(s) {
    setMutationError("");
    try {
      if (s.enabled) {
        await stopServer(s.server_id);
      } else {
        await startServer(s.server_id);
      }
    } catch {
      // error handled in onError callback
    }
  }

  async function handleRefresh(serverId) {
    setMutationError("");
    try {
      await refreshServer(serverId);
    } catch {
      // error handled in onError callback
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

      {servers.length === 0 && !loading ? (
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
                  disabled={refreshing}
                >
                  <RefreshCw size={13} />
                </button>
                <button
                  className="btn--icon"
                  onClick={() => handleToggle(s)}
                  title={s.enabled ? "Stop" : "Start"}
                  disabled={starting || stopping}
                >
                  <Square size={13} />
                </button>
                {confirmDeleteId === s.server_id ? (
                  <span className="flex items-center gap-1 text-muted text-sm">
                    Delete?
                    <button
                      className="btn--sm btn--danger"
                      onClick={() => handleDelete(s.server_id)}
                      disabled={removing}
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
          <button className="btn--sm" onClick={handleSave} disabled={adding || updating}>
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