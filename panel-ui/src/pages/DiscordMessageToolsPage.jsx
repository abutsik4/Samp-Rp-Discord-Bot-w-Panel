import { useEffect, useMemo, useState } from "react";
import { Pencil, Hash, MessageSquare, Download, RefreshCw, Save, X, Trash2, Copy } from "lucide-react";
import { formatApiError, panelApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";

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

  const messageLoaded = result?.message != null;

  return (
    <div className="page">
      <PageHeader
        icon={Pencil}
        title="Discord Message Tools"
        subtitle="Load and edit existing bot messages by ID."
      />

      {error ? <Alert type="error">{error}</Alert> : null}

      <SectionCard
        title="Select Message"
        icon={Hash}
        description="Choose a channel and enter the message ID to load an existing bot message."
      >
        <div className="form-grid">
          <div className="form-row">
            <label>Channel</label>
            <div className="input-group">
              <Hash size={14} />
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
            </div>
          </div>

          <div className="form-row">
            <label>Message ID</label>
            <div className="input-group">
              <MessageSquare size={14} />
              <input
                value={form.messageId}
                onChange={(e) => setForm((prev) => ({ ...prev, messageId: e.target.value }))}
                placeholder="Discord message ID"
              />
            </div>
          </div>
        </div>

        <div className="row-actions" style={{ marginTop: "0.75rem" }}>
          <button type="button" onClick={loadMessage} disabled={loadingMessage}>
            <Download size={13} /> {loadingMessage ? "Loading…" : "Load message"}
          </button>
          <button
            type="button"
            className="btn--ghost btn--sm"
            onClick={loadChannels}
            disabled={loadingChannels}
          >
            <RefreshCw size={13} /> Refresh channels
          </button>
        </div>
      </SectionCard>

      {(messageLoaded || form.content || form.embedTitle || form.embedDescription || form.embedFooter) ? (
        <SectionCard title="Edit Message" icon={Pencil}>
          <form onSubmit={saveMessageEdit}>
            <div className="form-row">
              <label>Content</label>
              <textarea
                rows={4}
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                disabled={!isAdmin}
              />
            </div>

            <div className="form-grid" style={{ marginTop: "1rem" }}>
              <div className="form-row">
                <label>Embed title</label>
                <input
                  value={form.embedTitle}
                  onChange={(e) => setForm((prev) => ({ ...prev, embedTitle: e.target.value, clearEmbed: false }))}
                  disabled={!isAdmin}
                />
              </div>

              <div className="form-row">
                <label>Embed color</label>
                <input
                  type="color"
                  value={form.embedColor}
                  onChange={(e) => setForm((prev) => ({ ...prev, embedColor: e.target.value, clearEmbed: false }))}
                  disabled={!isAdmin}
                />
              </div>
            </div>

            <div className="form-row" style={{ marginTop: "0.75rem" }}>
              <label>Embed description</label>
              <textarea
                rows={4}
                value={form.embedDescription}
                onChange={(e) => setForm((prev) => ({ ...prev, embedDescription: e.target.value, clearEmbed: false }))}
                disabled={!isAdmin}
              />
            </div>

            <div className="form-row" style={{ marginTop: "0.75rem" }}>
              <label>Embed footer</label>
              <input
                value={form.embedFooter}
                onChange={(e) => setForm((prev) => ({ ...prev, embedFooter: e.target.value, clearEmbed: false }))}
                disabled={!isAdmin}
              />
            </div>

            {(form.embedTitle || form.embedDescription || form.embedFooter) && (
              <div
                className="embed-preview"
                style={{ borderLeftColor: form.embedColor || "var(--color-accent)", marginTop: "0.75rem" }}
              >
                {form.embedTitle && <div className="embed-preview__title">{form.embedTitle}</div>}
                {form.embedDescription && <p>{form.embedDescription}</p>}
                {form.embedFooter && <div className="embed-preview__footer">{form.embedFooter}</div>}
              </div>
            )}

            <label className="checkbox-row" style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={form.clearEmbed}
                onChange={(e) => setForm((prev) => ({ ...prev, clearEmbed: e.target.checked }))}
                disabled={!isAdmin}
              />
              Clear embed when saving
            </label>

            <div className="row-actions" style={{ marginTop: "1rem" }}>
              <button type="submit" disabled={!isAdmin || saving}>
                <Save size={13} /> {saving ? "Saving…" : "Save edit"}
              </button>
              <button
                type="button"
                className="btn--ghost btn--sm"
                onClick={() => setForm(emptyForm)}
                disabled={saving}
              >
                <Trash2 size={13} /> Clear embed
              </button>
              <button
                type="button"
                className="btn--ghost btn--sm"
                onClick={() => setForm(emptyForm)}
                disabled={saving}
              >
                <X size={13} /> Reset
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {result ? (
        <SectionCard title="Result" icon={Copy}>
          <div style={{ position: "relative" }}>
            <pre className="code-box">{JSON.stringify(result, null, 2)}</pre>
            <button
              type="button"
              className="btn--ghost btn--icon"
              style={{ position: "absolute", top: "0.5rem", right: "0.5rem" }}
              onClick={() => navigator.clipboard?.writeText(JSON.stringify(result, null, 2))}
              title="Copy to clipboard"
            >
              <Copy size={13} />
            </button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
