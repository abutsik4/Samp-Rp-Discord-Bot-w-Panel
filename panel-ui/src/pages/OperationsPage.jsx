import { useEffect, useState } from "react";
import { panelApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import {
  History, RefreshCw, Download, GitCommit, Undo2, Bug, Search,
  ChevronDown, ChevronRight,
} from "lucide-react";

function opIcon(operation) {
  if (!operation) return <GitCommit size={14} />;
  const op = operation.toLowerCase();
  if (op.includes("reconcile")) return <RefreshCw size={14} />;
  if (op.includes("fullsync") || op.includes("full_sync")) return <Download size={14} />;
  return <GitCommit size={14} />;
}

export function OperationsPage({ bot }) {
  const guildId = bot?.guild_id;
  const [history, setHistory] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportDetail, setReportDetail] = useState(null);
  const [expandedReportId, setExpandedReportId] = useState(null);
  const [traceMessageId, setTraceMessageId] = useState("");
  const [traceUserId, setTraceUserId] = useState("");
  const [traceData, setTraceData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [bot.key]);

  async function undoOperation(op) {
    await panelApi.undoHistory(bot.key, op.id);
    loadAll();
  }

  async function toggleReport(r) {
    if (expandedReportId === r.id) {
      setExpandedReportId(null);
      setReportDetail(null);
      return;
    }
    setExpandedReportId(r.id);
    const detail = await panelApi.debugReport(r.id);
    setReportDetail(detail.report || null);
  }

  return (
    <div className="page">
      <PageHeader
        icon={History}
        title="Operations"
        subtitle="Operation history, debug tools and accuracy verification."
      />

      {error ? <Alert type="error">{error}</Alert> : null}

      <SectionCard title="Operation History" icon={History}>
        {loading ? (
          <LoadingSkeleton type="table" rows={6} />
        ) : (
          <div className="timeline">
            {history.map((op) => (
              <div key={op.id} className="timeline-item">
                <div className="timeline-icon">
                  {opIcon(op.operation)}
                </div>
                <div className="timeline-content">
                  <div className="timeline-type">{op.operation}</div>
                  <div className="timeline-meta">
                    {op.scope || "—"} · {op.timestamp ? new Date(op.timestamp).toLocaleString() : "—"}
                  </div>
                </div>
                <div className="timeline-actions">
                  {op.undone ? (
                    <span className="badge">Undone</span>
                  ) : (
                    <button
                      className="btn--ghost btn--sm"
                      onClick={() => undoOperation(op)}
                    >
                      <Undo2 size={13} />Undo
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Debug Reports" icon={Bug}>
        {loading ? (
          <LoadingSkeleton type="table" rows={4} />
        ) : (
          <div className="section-card">
            {reports.map((r) => (
              <div key={r.id}>
                <div className="timeline-item">
                  <div className="timeline-icon">
                    <Bug size={14} />
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-type">Report #{r.id}</div>
                    <div className="timeline-meta">
                      {r.updated_by || "—"} · {r.url || "—"}
                    </div>
                  </div>
                  <div className="timeline-actions">
                    <button
                      className="btn--ghost btn--sm"
                      onClick={() => toggleReport(r)}
                    >
                      {expandedReportId === r.id
                        ? <><ChevronDown size={13} />Collapse</>
                        : <><ChevronRight size={13} />View</>
                      }
                    </button>
                  </div>
                </div>
                {expandedReportId === r.id && reportDetail && (
                  <pre className="code-box">{JSON.stringify(reportDetail, null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Accuracy Controls" icon={Search}>
        <div className="row-actions">
          <button
            className="btn--ghost btn--sm"
            onClick={async () => { await panelApi.accuracyReconcile({ guildId }); }}
          >
            <RefreshCw size={13} />Reconcile guild
          </button>
          <button
            className="btn--ghost btn--sm"
            onClick={async () => { await panelApi.accuracyFullsync({ guildId }); }}
          >
            <Download size={13} />Full sync
          </button>
        </div>

        <div className="form-grid">
          <div>
            <label>
              Trace message ID
              <input
                value={traceMessageId}
                onChange={(e) => setTraceMessageId(e.target.value)}
              />
            </label>
            <div className="row-actions" style={{ marginTop: "0.5rem" }}>
              <button
                className="btn--ghost btn--sm"
                onClick={async () => {
                  const out = await panelApi.accuracyTraceMessage({ guildId, messageId: traceMessageId, limit: 100 });
                  setTraceData(out);
                }}
              >
                <Search size={13} />Trace message
              </button>
            </div>
          </div>

          <div>
            <label>
              Trace user ID
              <input
                value={traceUserId}
                onChange={(e) => setTraceUserId(e.target.value)}
              />
            </label>
            <div className="row-actions" style={{ marginTop: "0.5rem" }}>
              <button
                className="btn--ghost btn--sm"
                onClick={async () => {
                  const out = await panelApi.accuracyTraceUser({ guildId, userId: traceUserId, limit: 100 });
                  setTraceData(out);
                }}
              >
                <Search size={13} />Trace user
              </button>
            </div>
          </div>
        </div>

        {traceData ? <pre className="code-box">{JSON.stringify(traceData, null, 2)}</pre> : null}
      </SectionCard>
    </div>
  );
}
