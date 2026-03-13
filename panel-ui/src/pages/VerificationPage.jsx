import { useEffect, useState } from "react";
import { CheckCircle2, ShieldOff, MessageSquare, User, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { formatApiError, panelApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";

export function VerificationPage({ bot, user }) {
  const [messageId, setMessageId] = useState("");
  const [userId, setUserId] = useState("");
  const [resultsLimit, setResultsLimit] = useState(50);

  const [messageResult, setMessageResult] = useState(null);
  const [userResult, setUserResult] = useState(null);
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);

  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";
  const botKey = bot?.key;

  async function loadResults(limit = resultsLimit) {
    setLoadingResults(true);
    setError("");
    try {
      const data = await panelApi.verifyResults(botKey, { limit: String(limit) });
      setSummary(data?.summary || null);
      setResults(data?.results || []);
    } catch (err) {
      setError(formatApiError(err, "Failed to load verification results"));
    } finally {
      setLoadingResults(false);
    }
  }

  useEffect(() => {
    if (isAdmin && botKey) {
      loadResults(50);
    }
  }, [botKey, isAdmin]);

  async function checkMessageCounted(event) {
    event.preventDefault();
    if (!messageId.trim()) return;

    setError("");
    setMessageResult(null);
    try {
      const data = await panelApi.verifyMessageCounted(botKey, { messageId: messageId.trim() });
      setMessageResult(data || null);
    } catch (err) {
      setError(formatApiError(err, "Failed to verify message"));
    }
  }

  async function checkUserStats(event) {
    event.preventDefault();
    if (!userId.trim()) return;

    setError("");
    setUserResult(null);
    try {
      const data = await panelApi.verifyUserStats(botKey, {
        userId: userId.trim(),
        guildId: String(bot?.guild_id || ""),
      });
      setUserResult(data || null);
    } catch (err) {
      setError(formatApiError(err, "Failed to verify user stats"));
    }
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <PageHeader
          icon={CheckCircle2}
          title="Verification"
          subtitle="Data integrity checks and discrepancy detection."
        />
        <Alert type="error">
          <ShieldOff size={14} /> Access denied. Administrator role required.
        </Alert>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        icon={CheckCircle2}
        title="Verification"
        subtitle="Data integrity checks and discrepancy detection."
      />

      {error ? <Alert type="error">{error}</Alert> : null}

      {summary ? (
        <div className="grid">
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <CheckCircle2 size={14} className="text-accent" />
              <span style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Checked</span>
            </div>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{summary.total || 0}</p>
          </div>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <CheckCircle2 size={14} style={{ color: "var(--color-success)" }} />
              <span style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Perfect Matches</span>
            </div>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{summary.perfect || 0}</p>
          </div>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
              <AlertTriangle size={14} style={{ color: "var(--color-danger)" }} />
              <span style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Discrepancies</span>
            </div>
            <p style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>{summary.discrepancies || 0}</p>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <SectionCard title="Message Counted Check" icon={MessageSquare}>
          <form onSubmit={checkMessageCounted}>
            <div className="form-row">
              <label>Message ID</label>
              <div className="input-group">
                <MessageSquare size={14} />
                <input
                  value={messageId}
                  onChange={(e) => setMessageId(e.target.value)}
                  placeholder="Discord message ID"
                />
              </div>
            </div>
            <div className="row-actions" style={{ marginTop: "0.75rem" }}>
              <button type="submit">
                <Search size={13} /> Check message
              </button>
            </div>
            {messageResult ? (
              <pre className="code-box" style={{ marginTop: "0.75rem" }}>{JSON.stringify(messageResult, null, 2)}</pre>
            ) : null}
          </form>
        </SectionCard>

        <SectionCard title="User Stats Cross-Check" icon={User}>
          <form onSubmit={checkUserStats}>
            <div className="form-row">
              <label>User ID</label>
              <div className="input-group">
                <User size={14} />
                <input
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="Discord user ID"
                />
              </div>
            </div>
            <div className="row-actions" style={{ marginTop: "0.75rem" }}>
              <button type="submit">
                <Search size={13} /> Check user
              </button>
            </div>
            {userResult ? (
              <pre className="code-box" style={{ marginTop: "0.75rem" }}>{JSON.stringify(userResult, null, 2)}</pre>
            ) : null}
          </form>
        </SectionCard>
      </div>

      <SectionCard
        title="Top Users Verification Snapshot"
        icon={CheckCircle2}
        actions={
          <>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8rem" }}>
              Limit
              <select
                value={resultsLimit}
                onChange={(e) => setResultsLimit(Number(e.target.value) || 50)}
                style={{ fontSize: "0.8rem" }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </label>
            <button
              type="button"
              className="btn--ghost btn--sm"
              onClick={() => loadResults(resultsLimit)}
              disabled={loadingResults}
            >
              <RefreshCw size={13} /> {loadingResults ? "Loading…" : "Refresh"}
            </button>
          </>
        }
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Stored</th>
                <th>Indexed</th>
                <th>Difference</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "var(--muted)" }}>
                    No results — run a refresh to load data.
                  </td>
                </tr>
              ) : null}
              {results.map((item) => (
                <tr key={item.user_id} className={item.difference !== 0 ? "row-danger" : ""}>
                  <td>{item.username || item.user_id}</td>
                  <td>{item.stored_count}</td>
                  <td>{item.indexed_count}</td>
                  <td>{item.difference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
