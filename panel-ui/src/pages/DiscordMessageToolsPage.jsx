import { useEffect, useMemo, useState } from "react";
import { formatApiError, panelApi } from "../lib/api";

const emptyForm = {
  channelId: "",
  messageId: "",
  content: "",
  embedTitle: "",
  embedDescription: "",
  embedFooter: "",
  embedColor: "#00aeff",
  clearEmbed: false,
};

export function DiscordMessageToolsPage({ botKey, user }) {
  const [channels, setChannels] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";

  const channelOptions = useMemo(
    () => channels.map((item) => ({ id: item.id || item.channelId || item.value, name: item.name || item.id })),
    [channels]
  );

  async function loadChannels() {
    setLoadingChannels(true);
    setError("");
    try {
      const data = await panelApi.sendableChannels(botKey);
      setChannels(data?.items || []);
    } catch (err) {
      setError(formatApiError(err, "Failed to load channels"));
    } finally {
      setLoadingChannels(false);
    }
  }

  useEffect(() => {
    loadChannels();
  }, [botKey]);

  async function loadMessage(event) {
    event.preventDefault();
    if (!form.channelId.trim() || !form.messageId.trim()) {
      setError("Channel ID and message ID are required");
      return;
    }

    setLoadingMessage(true);
    setError("");
    setResult(null);

    try {
      const data = await panelApi.discordMessage(botKey, {
        channelId: form.channelId.trim(),
        messageId: form.messageId.trim(),
      });

      const msg = data?.message;
      setForm((prev) => ({
        ...prev,
        content: msg?.content || "",
        embedTitle: msg?.embed?.title || "",
        embedDescription: msg?.embed?.description || "",
        embedFooter: msg?.embed?.footer || "",
        embedColor: msg?.embed?.color || "#00aeff",
        clearEmbed: false,
      }));
      setResult(data || null);
    } catch (err) {
      setError(formatApiError(err, "Failed to load Discord message"));
    } finally {
      setLoadingMessage(false);
    }
  }

  async function saveMessageEdit(event) {
    event.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    setError("");
    setResult(null);

    const hasEmbedFields =
      form.embedTitle.trim() || form.embedDescription.trim() || form.embedFooter.trim();

    const payload = {
      channelId: form.channelId.trim(),
      messageId: form.messageId.trim(),
      content: form.content,
      embed: form.clearEmbed
        ? { clear: true }
        : hasEmbedFields
          ? {
              title: form.embedTitle,
              description: form.embedDescription,
              footer: form.embedFooter,
              color: form.embedColor,
            }
          : null,
    };

    try {
      const data = await panelApi.editDiscordMessage(botKey, payload);
      setResult(data || null);
    } catch (err) {
      setError(formatApiError(err, "Failed to edit Discord message"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Discord Message Tools</h1>
      <p className="muted">Load and edit existing bot messages directly by channel and message ID.</p>
      {error ? <div className="error-box">{error}</div> : null}

      <form className="card form-card" onSubmit={saveMessageEdit}>
        <div className="grid grid-2">
          <label>
            Channel
            <select
              value={form.channelId}
              onChange={(e) => setForm((prev) => ({ ...prev, channelId: e.target.value }))}
              disabled={loadingChannels}
            >
              <option value="">Select sendable channel</option>
              {channelOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Message ID
            <input
              value={form.messageId}
              onChange={(e) => setForm((prev) => ({ ...prev, messageId: e.target.value }))}
              placeholder="Discord message ID"
            />
          </label>
        </div>

        <div className="row-actions">
          <button type="button" className="btn-secondary" onClick={loadMessage} disabled={loadingMessage}>
            {loadingMessage ? "Loading…" : "Load message"}
          </button>
          <button type="button" className="btn-secondary" onClick={loadChannels} disabled={loadingChannels}>
            Refresh channels
          </button>
        </div>

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
              onChange={(e) => setForm((prev) => ({ ...prev, embedTitle: e.target.value, clearEmbed: false }))}
              disabled={!isAdmin}
            />
          </label>

          <label>
            Embed color
            <input
              type="color"
              value={form.embedColor}
              onChange={(e) => setForm((prev) => ({ ...prev, embedColor: e.target.value, clearEmbed: false }))}
              disabled={!isAdmin}
            />
          </label>
        </div>

        <label>
          Embed description
          <textarea
            rows={4}
            value={form.embedDescription}
            onChange={(e) => setForm((prev) => ({ ...prev, embedDescription: e.target.value, clearEmbed: false }))}
            disabled={!isAdmin}
          />
        </label>

        <label>
          Embed footer
          <input
            value={form.embedFooter}
            onChange={(e) => setForm((prev) => ({ ...prev, embedFooter: e.target.value, clearEmbed: false }))}
            disabled={!isAdmin}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.clearEmbed}
            onChange={(e) => setForm((prev) => ({ ...prev, clearEmbed: e.target.checked }))}
            disabled={!isAdmin}
          />
          Clear embed when saving
        </label>

        <div className="row-actions">
          <button type="submit" disabled={!isAdmin || saving}>
            {saving ? "Saving…" : "Save edit"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setForm(emptyForm)}
            disabled={saving}
          >
            Reset
          </button>
        </div>

        {result ? <pre className="code-box">{JSON.stringify(result, null, 2)}</pre> : null}
      </form>
    </div>
  );
}
