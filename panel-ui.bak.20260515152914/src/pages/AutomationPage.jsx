import { useEffect, useState } from "react";
import { Bot, Terminal, Cpu, Play, Brain, Calendar, Timer, Save, Trash2, Send, Plus } from "lucide-react";
import { panelApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";

export function AutomationPage({ bot }) {
  const guildId = bot?.guild_id;
  const [commands, setCommands] = useState([]);
  const [aiSettings, setAiSettings] = useState(null);
  const [aiStats, setAiStats] = useState(null);
  const [aiHistory, setAiHistory] = useState([]);
  const [holidaysDate, setHolidaysDate] = useState(new Date().toISOString().slice(0, 10));
  const [holidays, setHolidays] = useState([]);
  const [holidayForm, setHolidayForm] = useState({ date: new Date().toISOString().slice(0, 10), title: "", note: "" });
  const [countdownConfig, setCountdownConfig] = useState({ channel_id: "", template_title: "", template_text: "" });
  const [sendChannels, setSendChannels] = useState([]);
  const [error, setError] = useState("");

  async function loadAll() {
    setError("");
    try {
      const [cmd, ai, aiModel, hist, h, cd, channels] = await Promise.all([
        panelApi.commands(bot.key, guildId),
        panelApi.aiSettings(bot.key, guildId),
        panelApi.aiModelStats(bot.key),
        panelApi.aiHistory(bot.key, { guildId, limit: 20 }),
        panelApi.holidays(bot.key, holidaysDate),
        panelApi.countdownConfig(bot.key, guildId),
        panelApi.sendableChannels(bot.key),
      ]);
      setCommands(cmd.commands || []);
      setAiSettings(ai.settings || {});
      setAiStats({ ...(ai.stats || {}), model: aiModel.stats || null });
      setAiHistory(hist.history || []);
      setHolidays(h.items || []);
      setCountdownConfig(cd.config || {});
      setSendChannels(channels.items || []);
    } catch (e) {
      setError(e.message || "Failed to load automation data");
    }
  }

  useEffect(() => {
    loadAll();
  }, [bot.key, holidaysDate]);

  async function toggleCommand(name, currentEnabled) {
    await panelApi.toggleCommand(bot.key, { commandName: name, enabled: !currentEnabled });
    loadAll();
  }

  return (
    <div className="page">
      <PageHeader
        icon={Bot}
        title="Automation & Features"
        subtitle="Commands, AI engagement, holidays and countdown configuration."
      />

      {error ? <Alert type="error">{error}</Alert> : null}

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
                        onChange={() => toggleCommand(cmd.name, cmd.enabled !== false)}
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
          {aiSettings ? (
            <>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={!!aiSettings.enabled}
                    onChange={(e) => setAiSettings((p) => ({ ...p, enabled: e.target.checked }))}
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
                    value={Math.round((aiSettings.response_chance || 0) * 100)}
                    onChange={(e) =>
                      setAiSettings((p) => ({ ...p, response_chance: Number(e.target.value) / 100 }))
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
                  onClick={async () => {
                    await panelApi.aiSaveSettings(bot.key, { guildId, settings: aiSettings });
                    loadAll();
                  }}
                >
                  <Save size={13} /> Save AI Settings
                </button>
                <button
                  className="btn--ghost btn--sm"
                  onClick={async () => { await panelApi.aiTest(bot.key, { guildId }); }}
                >
                  <Play size={13} /> Test
                </button>
                <button
                  className="btn--ghost btn--sm"
                  onClick={async () => {
                    const channelId = sendChannels[0]?.id;
                    if (channelId) await panelApi.aiTrain(bot.key, { channelId, messageLimit: 500 });
                    loadAll();
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
                        onClick={async () => {
                          await panelApi.deleteHoliday(bot.key, item.id);
                          loadAll();
                        }}
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
              onClick={async () => {
                await panelApi.addHoliday(bot.key, holidayForm);
                setHolidayForm((p) => ({ ...p, title: "", note: "" }));
                loadAll();
              }}
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
                value={countdownConfig.channel_id || ""}
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
                value={countdownConfig.template_title || ""}
                onChange={(e) => setCountdownConfig((p) => ({ ...p, template_title: e.target.value }))}
              />
            </label>
          </div>
          <label style={{ marginTop: 10, display: "block" }}>
            Text template
            <textarea
              rows={3}
              value={countdownConfig.template_text || ""}
              onChange={(e) => setCountdownConfig((p) => ({ ...p, template_text: e.target.value }))}
            />
          </label>
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button
              className="btn--ghost btn--sm"
              onClick={async () => {
                await panelApi.saveCountdownConfig(bot.key, { guildId, config: countdownConfig });
                loadAll();
              }}
            >
              <Save size={13} /> Save
            </button>
            <button
              className="btn--ghost btn--sm"
              onClick={async () => { await panelApi.testCountdown(bot.key, { guildId }); }}
            >
              <Send size={13} /> Send test countdown
            </button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
