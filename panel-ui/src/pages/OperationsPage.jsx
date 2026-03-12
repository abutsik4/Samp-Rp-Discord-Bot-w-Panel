import { useEffect, useState } from "react";
import { panelApi } from "../lib/api";

export function OperationsPage({ bot }) {
  const guildId = bot?.guild_id;
  const [history, setHistory] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportDetail, setReportDetail] = useState(null);
  const [traceMessageId, setTraceMessageId] = useState("");
  const [traceUserId, setTraceUserId] = useState("");
  const [traceData, setTraceData] = useState(null);
  const [error, setError] = useState("");

  async function loadAll() {
    setError("");
    try {
      const [h, r] = await Promise.all([
        panelApi.history(bot.key, 50),
        panelApi.debugReports({ limit: 50, offset: 0 }),
      ]);
      setHistory(h.operations || []);
      setReports(r.reports || []);
    } catch (e) {
      setError(e.message || "Failed to load ops data");
    }
  }

  useEffect(() => {
    loadAll();
  }, [bot.key]);

  return (
    <div className="page">
      <h1>Operations</h1>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="card form-card">
        <h3>Operation History</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Type</th><th>Scope</th><th>Time</th><th>Undone</th><th /></tr></thead>
            <tbody>
              {history.map((op) => (
                <tr key={op.id}>
                  <td>{op.id}</td>
                  <td>{op.operation}</td>
                  <td>{op.scope}</td>
                  <td>{op.timestamp ? new Date(op.timestamp).toLocaleString() : "-"}</td>
                  <td>{op.undone ? "Yes" : "No"}</td>
                  <td>
                    <button
                      className="btn-secondary"
                      disabled={!!op.undone}
                      onClick={async () => {
                        await panelApi.undoHistory(bot.key, op.id);
                        loadAll();
                      }}
                    >
                      Undo
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
          <h3>Debug Reports</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>ID</th><th>User</th><th>URL</th><th /></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.updated_by || "-"}</td>
                    <td className="truncate-cell">{r.url || "-"}</td>
                    <td>
                      <button
                        className="btn-secondary"
                        onClick={async () => {
                          const detail = await panelApi.debugReport(r.id);
                          setReportDetail(detail.report || null);
                        }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reportDetail ? <pre className="code-box">{JSON.stringify(reportDetail, null, 2)}</pre> : null}
        </div>

        <div className="card form-card">
          <h3>Accuracy Controls</h3>
          <div className="row-actions">
            <button onClick={async () => { await panelApi.accuracyReconcile({ guildId }); }}>Reconcile guild</button>
            <button className="btn-secondary" onClick={async () => { await panelApi.accuracyFullsync({ guildId }); }}>Full sync</button>
          </div>

          <label>Trace message ID
            <input value={traceMessageId} onChange={(e) => setTraceMessageId(e.target.value)} />
          </label>
          <button className="btn-secondary" onClick={async () => {
            const out = await panelApi.accuracyTraceMessage({ guildId, messageId: traceMessageId, limit: 100 });
            setTraceData(out);
          }}>Trace message</button>

          <label>Trace user ID
            <input value={traceUserId} onChange={(e) => setTraceUserId(e.target.value)} />
          </label>
          <button className="btn-secondary" onClick={async () => {
            const out = await panelApi.accuracyTraceUser({ guildId, userId: traceUserId, limit: 100 });
            setTraceData(out);
          }}>Trace user</button>

          {traceData ? <pre className="code-box">{JSON.stringify(traceData, null, 2)}</pre> : null}
        </div>
      </div>
    </div>
  );
}