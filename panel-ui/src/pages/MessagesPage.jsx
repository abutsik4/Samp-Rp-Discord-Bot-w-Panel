import { useEffect, useMemo, useState } from "react";
import { panelApi } from "../lib/api";

function parseEmbed(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

  async function removeMessage(id) {
    if (!isAdmin) return;
    if (!window.confirm("Delete this message record?")) return;

    setError("");
    try {
      await panelApi.deleteMessage(botKey, id);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to delete message");
    }
  }

  return (
    <div className="page">
      <h1>Messages</h1>
      <p className="muted">Create, edit and send panel messages.</p>
      {error ? <div className="error-box">{error}</div> : null}

      <form className="card form-card" onSubmit={submit}>
        <h3>{form.id ? `Edit #${form.id}` : "New message"}</h3>

        <label>
          Channel
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
          </select>
        </label>

        <label>
          Status
          <select
            value={form.status}
            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            disabled={!isAdmin}
          >
            <option value="draft">Draft</option>
            <option value="sent">Send now</option>
          </select>
        </label>

        <label>
          Content
          <textarea
            rows={4}
            value={form.content}
            onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
            disabled={!isAdmin}
          />
        </label>

        <div className="grid grid-2">
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

        <label>
          Embed description
          <textarea
            rows={4}
            value={form.embedDescription}
            onChange={(e) => setForm((prev) => ({ ...prev, embedDescription: e.target.value }))}
            disabled={!isAdmin}
          />
        </label>

        <label>
          Embed footer
          <input
            value={form.embedFooter}
            onChange={(e) => setForm((prev) => ({ ...prev, embedFooter: e.target.value }))}
            disabled={!isAdmin}
          />
        </label>

        <div className="row-actions">
          <button type="submit" disabled={!isAdmin || saving}>
            {saving ? "Saving…" : form.id ? "Update" : "Create"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setForm(emptyForm)}
            disabled={saving}
          >
            Clear
          </button>
        </div>
      </form>

      <div className="card">
        <h3>Saved messages</h3>
        {loading ? (
          <div className="muted">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="muted">No messages yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Channel</th>
                  <th>Content</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.status}</td>
                    <td>{item.channel_id || "-"}</td>
                    <td className="truncate-cell">{item.content || "(embed only)"}</td>
                    <td>{item.updated_at || item.created_at || "-"}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn-secondary" onClick={() => editMessage(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => removeMessage(item.id)}
                          disabled={!isAdmin}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
