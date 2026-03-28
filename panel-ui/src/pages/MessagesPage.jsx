import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Hash, FileText, FileEdit, Plus, Save, X, Pencil, Trash2 } from "lucide-react";
import { panelApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";
import { StatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";

function parseEmbed(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Build a short preview string from content + embed for the table */
function messagePreview(item) {
  if (item.content) return item.content;
  const embed = parseEmbed(item.embed);
  if (!embed) return "-";
  const parts = [embed.title, embed.description].filter(Boolean);
  if (!parts.length) return "-";
  // Take first meaningful line
  const firstLine = parts.join(" — ").split("\n")[0];
  return firstLine.length > 100 ? firstLine.slice(0, 100) + "…" : firstLine;
}

const emptyForm = {
  id: null,
  channelId: "",
  status: "draft",
  content: "",
  embedTitle: "",
  embedDescription: "",
  embedFooter: "",
  embedColor: "#00aeff",
};

export function MessagesPage({ botKey, user }) {
  const [messages, setMessages] = useState([]);
  const [channels, setChannels] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const isAdmin = user?.role === "admin";

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [msgs, ch] = await Promise.all([
        panelApi.listMessages(botKey),
        panelApi.sendableChannels(botKey),
      ]);
      setMessages(msgs?.messages || []);
      setChannels(ch?.items || []);
    } catch (err) {
      setError(err.message || "Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [botKey]);

  const channelOptions = useMemo(
    () => channels.map((c) => ({ id: c.id || c.channelId || c.value, name: c.name || c.label || c.id })),
    [channels]
  );

  /** Resolve channel name from ID, falling back to the raw ID */
  function channelName(channelId) {
    if (!channelId) return "-";
    const found = channelOptions.find((c) => c.id === channelId);
    return found ? `#${found.name}` : channelId;
  }

  function editMessage(item) {
    const embed = parseEmbed(item.embed);
    setForm({
      id: item.id,
      channelId: item.channel_id || "",
      status: item.status || "draft",
      content: item.content || "",
      embedTitle: embed?.title || "",
      embedDescription: embed?.description || "",
      embedFooter: embed?.footer || "",
      embedColor: embed?.color || "#00aeff",
    });
    // Scroll to the form
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event) {
    event.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    setError("");

    const payload = {
      channelId: form.channelId || null,
      status: form.status,
      content: form.content || "",
      embed:
        form.embedTitle || form.embedDescription || form.embedFooter
          ? {
              title: form.embedTitle,
              description: form.embedDescription,
              footer: form.embedFooter,
              color: form.embedColor,
            }
          : null,
    };

    try {
      if (form.id) {
        await panelApi.updateMessage(botKey, form.id, payload);
      } else {
        await panelApi.createMessage(botKey, payload);
      }
      setForm(emptyForm);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to save message");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMessage(id) {
    if (!isAdmin) return;

    setError("");
    try {
      await panelApi.deleteMessage(botKey, id);
      setDeleteConfirmId(null);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to delete message");
    }
  }

  return (
    <div className="page">
      <PageHeader
        icon={MessageSquare}
        title="Messages"
        subtitle="Create, edit and send announcements to Discord channels."
      />

      {error ? <Alert type="error">{error}</Alert> : null}

      <SectionCard
        title={form.id ? "Edit Message" : "New Message"}
        icon={form.id ? FileEdit : Plus}
      >
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>
              Channel
              <div className="input-group">
                <Hash size={14} />
                <select
                  value={form.channelId}
                  onChange={(e) => setForm((prev) => ({ ...prev, channelId: e.target.value }))}
                  required={form.status === "sent"}
                  disabled={!isAdmin}
                >
                  <option value="">Select channel</option>
                  {channelOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                  {/* Keep current channel visible even if not in sendable list */}
                  {form.channelId && !channelOptions.some((c) => c.id === form.channelId) && (
                    <option value={form.channelId}>{form.channelId} (current)</option>
                  )}
                </select>
              </div>
            </label>

            <label>
              Status
              <div className="input-group">
                <FileText size={14} />
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  disabled={!isAdmin}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Send now</option>
                </select>
              </div>
            </label>
          </div>

          <label style={{ marginTop: 12, display: "block" }}>
            Content
            <textarea
              rows={4}
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              disabled={!isAdmin}
            />
          </label>

          <div className="grid grid-2" style={{ marginTop: 12 }}>
            <label>
              Embed title
              <input
                value={form.embedTitle}
                onChange={(e) => setForm((prev) => ({ ...prev, embedTitle: e.target.value }))}
                disabled={!isAdmin}
              />
            </label>

            <label>
              Embed color
              <input
                type="color"
                value={form.embedColor}
                onChange={(e) => setForm((prev) => ({ ...prev, embedColor: e.target.value }))}
                disabled={!isAdmin}
              />
            </label>
          </div>

          <label style={{ marginTop: 12, display: "block" }}>
            Embed description
            <textarea
              rows={4}
              value={form.embedDescription}
              onChange={(e) => setForm((prev) => ({ ...prev, embedDescription: e.target.value }))}
              disabled={!isAdmin}
            />
          </label>

          <label style={{ marginTop: 12, display: "block" }}>
            Embed footer
            <input
              value={form.embedFooter}
              onChange={(e) => setForm((prev) => ({ ...prev, embedFooter: e.target.value }))}
              disabled={!isAdmin}
            />
          </label>

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button type="submit" disabled={!isAdmin || saving}>
              <Save size={13} /> {saving ? "Saving..." : form.id ? "Update" : "Create"}
            </button>
            <button
              type="button"
              className="btn--ghost btn--sm"
              onClick={() => setForm(emptyForm)}
              disabled={saving}
            >
              <X size={13} /> Clear
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="All Messages" icon={MessageSquare}>
        {loading ? (
          <p className="text-muted">Loading...</p>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="No messages yet"
            message="Create your first announcement above."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Preview</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{channelName(item.channel_id)}</td>
                    <td className="truncate-cell" title={messagePreview(item)}>
                      {messagePreview(item)}
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{item.updated_at || item.created_at || "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn--icon"
                          title="Edit"
                          onClick={() => editMessage(item)}
                        >
                          <Pencil size={13} />
                        </button>
                        {deleteConfirmId === item.id ? (
                          <div className="inline-confirm">
                            Delete?
                            <button
                              className="btn--sm btn--danger"
                              onClick={() => deleteMessage(item.id)}
                            >
                              Yes
                            </button>
                            <button
                              className="btn--ghost btn--sm"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn--icon btn--danger-icon"
                            title="Delete"
                            disabled={!isAdmin}
                            onClick={() => setDeleteConfirmId(item.id)}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
