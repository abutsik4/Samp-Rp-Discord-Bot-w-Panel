import { useState } from "react";
import { Bot, Terminal, Cpu, Play, Brain, Calendar, Timer, Save, Trash2, Send, Plus } from "lucide-react";
import { useQuery, useMutation } from "../hooks/useQuery";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";
import { panelApi } from "../lib/api";

function botUrl(botKey, path) {
  return `/panel/api/${encodeURIComponent(botKey)}${path}`;
}

export function AutomationPage({ bot }) {
  const guildId = bot?.guild_id;

  const [holidaysDate, setHolidaysDate] = useState(new Date().toISOString().slice(0, 10));
  const [holidayForm, setHolidayForm] = useState({ date: new Date().toISOString().slice(0, 10), title: "", note: "" });
  const [countdownConfig, setCountdownConfig] = useState({ channel_id: "", template_title: "", template_text: "" });

  // ── Queries ──────────────────────────────────────────────
  const { data: commandsData, error: commandsError } = useQuery(
    bot ? botUrl(bot.key, `/commands${guildId ? `?guildId=${encodeURIComponent(guildId)}` : ""}`) : null,
    { deps: [bot?.key, guildId] }
  );

  const { data: aiSettingsData, error: aiSettingsError } = useQuery(
    bot ? botUrl(bot.key, `/ai-engagement/settings?guildId=${encodeURIComponent(guildId)}`) : null,
    { deps: [bot?.key, guildId] }
  );

  const { data: aiModelData } = useQuery(
    bot ? botUrl(bot.key, "/ai-engagement/model-stats") : null,
    { deps: [bot?.key] }
  );

  const { data: aiHistoryData, error: aiHistoryError } = useQuery(
    bot ? botUrl(bot.key, `/ai-engagement/history?guildId=${encodeURIComponent(guildId)}&limit=20`) : null,
    { deps: [bot?.key, guildId] }
  );

  const { data: holidaysData, error: holidaysError } = useQuery(
    bot ? botUrl(bot.key, `/holidays${holidaysDate ? `?date=${encodeURIComponent(holidaysDate)}` : ""}`) : null,
    { deps: [bot?.key, holidaysDate] }
  );

  const { data: countdownData } = useQuery(
    bot ? botUrl(bot.key, `/countdown/config?guildId=${encodeURIComponent(guildId)}`) : null,
    { deps: [bot?.key, guildId] }
  );

  const { data: sendChannelsData } = useQuery(
    bot ? botUrl(bot.key, "/sendable-channels") : null,
    { deps: [bot?.key] }
  );

  // ── Derived data ──────────────────────────────────────────
  const commands = commandsData?.commands || [];
  const aiSettings = aiSettingsData?.settings ?? null;
  const aiStats = aiSettingsData
    ? { ...(aiSettingsData.stats || {}), model: aiModelData?.stats || null }
    : null;
  const aiHistory = aiHistoryData?.history || [];
  const holidays = holidaysData?.items || [];
  const sendChannels = sendChannelsData?.items || [];

  // Sync countdown config from server data
  const effectiveCountdownConfig = countdownData?.config ?? countdownConfig;

  const queryError = commandsError || aiSettingsError || aiHistoryError || holidaysError;

  // ── Mutations ─────────────────────────────────────────────
  const invalidateAutomation = [
    bot ? botUrl(bot.key, `/commands${guildId ? `?guildId=${encodeURIComponent(guildId)}` : ""}`) : null,
    bot ? botUrl(bot.key, `/ai-engagement/settings?guildId=${encodeURIComponent(guildId)}`) : null,
    bot ? botUrl(bot.key, `/ai-engagement/history?guildId=${encodeURIComponent(guildId)}&limit=20`) : null,
    bot ? botUrl(bot.key, `/holidays${holidaysDate ? `?date=${encodeURIComponent(holidaysDate)}` : ""}`) : null,
    bot ? botUrl(bot.key, `/countdown/config?guildId=${encodeURIComponent(guildId)}`) : null,
  ].filter(Boolean);

  const invalidateHolidays = [
    bot ? botUrl(bot.key, `/holidays${holidaysDate ? `?date=${encodeURIComponent(holidaysDate)}` : ""}`) : null,
  ].filter(Boolean);

  const [toggleCommandMut] = useMutation(
    (args) => panelApi.toggleCommand(bot.key, args),
    { invalidate: invalidateAutomation }
  );

  const [saveAiSettingsMut] = useMutation(
    (args) => panelApi.aiSaveSettings(bot.key, args),
    { invalidate: invalidateAutomation }
  );

  const [aiTestMut] = useMutation(
    (args) => panelApi.aiTest(bot.key, args),
  );

  const [aiTrainMut] = useMutation(
    (args) => panelApi.aiTrain(bot.key, args),
    { invalidate: invalidateAutomation }
  );

  const [addHolidayMut] = useMutation(
    (args) => panelApi.addHoliday(bot.key, args),
    {
      invalidate: invalidateHolidays,
      onSuccess: () => setHolidayForm((p) => ({ ...p, title: "", note: "" })),
    }
  );

  const [deleteHolidayMut] = useMutation(
    (id) => panelApi.deleteHoliday(bot.key, id),
    { invalidate: invalidateHolidays }
  );

  const [saveCountdownMut] = useMutation(
    (args) => panelApi.saveCountdownConfig(bot.key, args),
    { invalidate: invalidateAutomation }
  );

  const [testCountdownMut] = useMutation(
    (args) => panelApi.testCountdown(bot.key, args),
  );

  // ── Local state for editable AI settings ──────────────────
  const [localAiSettings, setLocalAiSettings] = useState(null);

  // Sync local AI settings from query data
  const effectiveAiSettings = localAiSettings ?? aiSettings;

  return (
    <div className="page">
      <PageHeader
        icon={Bot}
        title="Automation & Features"
        subtitle="Commands, AI engagement, holidays and countdown configuration."
      />

      {queryError ? <Alert type="error">{queryError.message || "Failed to load automation data"}</Alert> : null}

      <SectionCard title="Slash Commands" icon={Terminal}>
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              {commands.map((cmd) => (
                <tr key={cmd.name}>
                  <td>
                    <Terminal size={13} style={{ marginRight: 6, color: "var(--color-text-tertiary)" }} />
                    {cmd.name}
                  </td>
                  <td>{cmd.description}</td>
                  <td>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={cmd.enabled !== false}
                        onChange={() => toggleCommandMut({ commandName: cmd.name, enabled: !(cmd.enabled !== false) })}
                      />
                      <div className="toggle-track">
                        <div className="toggle-thumb"></div>
                      </div>
                      <span className="toggle-label">{cmd.enabled !== false ? "Enabled" : "Disabled"}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid grid-2">
        <SectionCard title="AI Engagement" icon={Cpu}>
          {effectiveAiSettings ? (
            <>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={!!effectiveAiSettings.enabled}
                    onChange={(e) => setLocalAiSettings((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  <div className="toggle-track">
                    <div className="toggle-thumb"></div>
                  </div>
                  <span className="toggle-label">AI Engagement Enabled</span>
                </label>
              </div>

              <div className="form-grid">
                <label>
                  Response Chance (%)
                  <input
                    type="number"
                    value={Math.round((effectiveAiSettings.response_chance || 0) * 100)}
                    onChange={(e) =>
                      setLocalAiSettings((p) => ({ ...p, response_chance: Number(e.target.value) / 100 }))
                    }
                  />
                </label>
              </div>

              {aiStats?.model && (
                <div className="grid grid-2" style={{ marginTop: 12 }}>
                  {Object.entries(aiStats.model).map(([k, v]) => (
                    <div key={k} className="card" style={{ padding: "8px 12px" }}>
                      <div className="text-muted" style={{ fontSize: 11, marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{String(v)}</div>
                    </div>
                  ))}
                </div>
              )}

              {!aiStats?.model && (
                <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Model stats: n/a</p>
              )}

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button
                  className="btn--ghost btn--sm"
                  onClick={() => {
                    saveAiSettingsMut({ guildId, settings: effectiveAiSettings });
                    setLocalAiSettings(null);
                  }}
                >
                  <Save size={13} /> Save AI Settings
                </button>
                <button
                  className="btn--ghost btn--sm"
                  onClick={() => aiTestMut({ guildId })}
                >
                  <Play size={13} /> Test
                </button>
                <button
                  className="btn--ghost btn--sm"
                  onClick={() => {
                    const channelId = sendChannels[0]?.id;
                    if (channelId) aiTrainMut({ channelId, messageLimit: 500 });
                  }}
                >
                  <Brain size={13} /> Train
                </button>
              </div>
            </>
          ) : null}
        </SectionCard>

        <SectionCard title="AI History" icon={Cpu}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Input</th>
                  <th>Output</th>
                </tr>
              </thead>
              <tbody>
                {aiHistory.map((row, idx) => (
                  <tr key={`${row.timestamp || idx}`}>
                    <td>{row.timestamp || "-"}</td>
                    <td className="truncate-cell">{row.prompt || row.message || "-"}</td>
                    <td className="truncate-cell">{row.response || row.output || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-2">
        <SectionCard title="Holidays" icon={Calendar}>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <label>
              View date
              <input type="date" value={holidaysDate} onChange={(e) => setHolidaysDate(e.target.value)} />
            </label>
          </div>

          <div className="table-wrap" style={{ marginBottom: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {holidays.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.title}</td>
                    <td>{item.note || "-"}</td>
                    <td>
                      <button
                        className="btn--icon btn--danger-icon"
                        title="Delete"
                        onClick={() => deleteHolidayMut(item.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-grid">
            <label>
              Date
              <input
                type="date"
                value={holidayForm.date}
                onChange={(e) => setHolidayForm((p) => ({ ...p, date: e.target.value }))}
              />
            </label>
            <label>
              Title
              <input
                placeholder="Holiday title"
                value={holidayForm.title}
                onChange={(e) => setHolidayForm((p) => ({ ...p, title: e.target.value }))}
              />
            </label>
            <label>
              Note
              <input
                placeholder="Optional note"
                value={holidayForm.note}
                onChange={(e) => setHolidayForm((p) => ({ ...p, note: e.target.value }))}
              />
            </label>
          </div>
          <div className="row-actions" style={{ marginTop: 10 }}>
            <button
              className="btn--ghost btn--sm"
              onClick={() => addHolidayMut(holidayForm)}
            >
              <Plus size={13} /> Add Holiday
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Countdown Timer" icon={Timer}>
          <div className="form-grid">
            <label>
              Channel
              <select
                value={effectiveCountdownConfig.channel_id || ""}
                onChange={(e) => setCountdownConfig((p) => ({ ...p, channel_id: e.target.value }))}
              >
                <option value="">Select channel</option>
                {sendChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            </label>
            <label>
              Title template
              <input
                value={effectiveCountdownConfig.template_title || ""}
                onChange={(e) => setCountdownConfig((p) => ({ ...p, template_title: e.target.value }))}
              />
            </label>
          </div>
          <label style={{ marginTop: 10, display: "block" }}>
            Text template
            <textarea
              rows={3}
              value={effectiveCountdownConfig.template_text || ""}
              onChange={(e) => setCountdownConfig((p) => ({ ...p, template_text: e.target.value }))}
            />
          </label>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button
              className="btn--ghost btn--sm"
              onClick={() => saveCountdownMut({ guildId, config: effectiveCountdownConfig })}
            >
              <Save size={13} /> Save
            </button>
            <button
              className="btn--ghost btn--sm"
              onClick={() => testCountdownMut({ guildId })}
            >
              <Send size={13} /> Send test countdown
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}