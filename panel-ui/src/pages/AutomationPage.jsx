import { useEffect, useState } from "react";
import { panelApi } from "../lib/api";

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

  return (
    <div className="page">
      <h1>Automation & Features</h1>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="card form-card">
        <h3>Commands</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Command</th><th>Category</th><th>Status</th><th /></tr></thead>
            <tbody>
              {commands.map((cmd) => (
                <tr key={cmd.name}>
                  <td>/{cmd.name}</td>
                  <td>{cmd.category}</td>
                  <td>{cmd.enabled ? "Enabled" : "Disabled"}</td>
                  <td>
                    <button
                      className={cmd.enabled ? "btn-danger" : ""}
                      onClick={async () => {
                        await panelApi.toggleCommand(bot.key, { commandName: cmd.name, enabled: !cmd.enabled });
                        loadAll();
                      }}
                    >
                      {cmd.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card form-card">
          <h3>AI Engagement</h3>
          {aiSettings ? (
            <>
              <label>Enabled
                <select value={aiSettings.enabled ? "1" : "0"} onChange={(e) => setAiSettings((p) => ({ ...p, enabled: e.target.value === "1" }))}>
                  <option value="1">Enabled</option>
                  <option value="0">Disabled</option>
                </select>
              </label>
              <label>Response Chance (%)
                <input type="number" value={Math.round((aiSettings.response_chance || 0) * 100)} onChange={(e) => setAiSettings((p) => ({ ...p, response_chance: Number(e.target.value) / 100 }))} />
              </label>
              <button onClick={async () => {
                await panelApi.aiSaveSettings(bot.key, { guildId, settings: aiSettings });
                loadAll();
              }}>Save AI settings</button>
              <div className="row-actions">
                <button className="btn-secondary" onClick={async () => { await panelApi.aiTest(bot.key, { guildId }); }}>Run test response</button>
                <button className="btn-secondary" onClick={async () => {
                  const channelId = sendChannels[0]?.id;
                  if (channelId) await panelApi.aiTrain(bot.key, { channelId, messageLimit: 500 });
                  loadAll();
                }}>Train model</button>
              </div>
              <p className="muted">Model stats: {aiStats?.model ? JSON.stringify(aiStats.model) : "n/a"}</p>
            </>
          ) : null}
        </div>

        <div className="card form-card">
          <h3>AI History</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Time</th><th>Input</th><th>Output</th></tr></thead>
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
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card form-card">
          <h3>Holidays</h3>
          <label>View date
            <input type="date" value={holidaysDate} onChange={(e) => setHolidaysDate(e.target.value)} />
          </label>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Title</th><th>Note</th><th /></tr></thead>
              <tbody>
                {holidays.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.title}</td>
                    <td>{item.note || "-"}</td>
                    <td><button className="btn-danger" onClick={async () => { await panelApi.deleteHoliday(bot.key, item.id); loadAll(); }}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="inline-form">
            <input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm((p) => ({ ...p, date: e.target.value }))} />
            <input placeholder="Title" value={holidayForm.title} onChange={(e) => setHolidayForm((p) => ({ ...p, title: e.target.value }))} />
            <input placeholder="Note" value={holidayForm.note} onChange={(e) => setHolidayForm((p) => ({ ...p, note: e.target.value }))} />
            <button onClick={async () => { await panelApi.addHoliday(bot.key, holidayForm); setHolidayForm((p) => ({ ...p, title: "", note: "" })); loadAll(); }}>Add</button>
          </div>
        </div>

        <div className="card form-card">
          <h3>Countdown</h3>
          <label>Channel
            <select value={countdownConfig.channel_id || ""} onChange={(e) => setCountdownConfig((p) => ({ ...p, channel_id: e.target.value }))}>
              <option value="">Select channel</option>
              {sendChannels.map((ch) => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
            </select>
          </label>
          <label>Title template
            <input value={countdownConfig.template_title || ""} onChange={(e) => setCountdownConfig((p) => ({ ...p, template_title: e.target.value }))} />
          </label>
          <label>Text template
            <textarea rows={3} value={countdownConfig.template_text || ""} onChange={(e) => setCountdownConfig((p) => ({ ...p, template_text: e.target.value }))} />
          </label>
          <div className="row-actions">
            <button onClick={async () => { await panelApi.saveCountdownConfig(bot.key, { guildId, config: countdownConfig }); loadAll(); }}>Save countdown</button>
            <button className="btn-secondary" onClick={async () => { await panelApi.testCountdown(bot.key, { guildId }); }}>Send test countdown</button>
          </div>
        </div>
      </div>
    </div>
  );
}