import { useState } from "react";
import { CheckCircle2, ShieldOff, MessageSquare, User, Search, RefreshCw, AlertTriangle } from "lucide-react";
import { formatApiError, panelApi } from "../lib/api";
import { useQuery, useMutation } from "../hooks/useQuery";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";

export function VerificationPage({ bot, user }) {
  const [messageId, setMessageId] = useState("");
  const [userId, setUserId] = useState("");
  const [resultsLimit, setResultsLimit] = useState(50);

  const [messageResult, setMessageResult] = useState(null);
  const [userResult, setUserResult] = useState(null);

  const isAdmin = user?.role === "admin";
  const botKey = bot?.key;

  const resultsUrl = isAdmin && botKey
    ? `/panel/api/${encodeURIComponent(botKey)}/verify/results?limit=${resultsLimit}`
    : null;

  const {
    data: resultsData,
    loading: loadingResults,
    error: resultsError,
    refresh: refreshResults,
  } = useQuery(resultsUrl, {
    deps: [botKey, isAdmin],
    enabled: isAdmin && !!botKey,
  });

  const summary = resultsData?.summary || null;
  const results = resultsData?.results || [];

  const [checkMessage, { loading: checkingMessage, error: messageError }] = useMutation(
    panelApi.verifyMessageCounted,
    {
      onSuccess: (data) => setMessageResult(data || null),
      onError: (err) => setMessageResult(null),
    }
  );

  const [checkUser, { loading: checkingUser, error: userError }] = useMutation(
    panelApi.verifyUserStats,
    {
      onSuccess: (data) => setUserResult(data || null),
      onError: (err) => setUserResult(null),
    }
  );

  // Determine which error to show (results fetch error takes priority, then mutation errors)
  const error = resultsError
    ? formatApiError(resultsError, "Failed to load verification results")
    : messageError
    ? formatApiError(messageError, "Failed to verify message")
    : userError
    ? formatApiError(userError, "Failed to verify user stats")
    : "";

  function handleCheckMessage(event) {
    event.preventDefault();
    if (!messageId.trim()) return;
    setMessageResult(null);
    checkMessage(botKey, { messageId: messageId.trim() });
  }

  function handleCheckUser(event) {
    event.preventDefault();
    if (!userId.trim()) return;
    setUserResult(null);
    checkUser(botKey, {
      userId: userId.trim(),
      guildId: String(bot?.guild_id || ""),
    });
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
          <form onSubmit={handleCheckMessage}>
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
              <button type="submit" disabled={checkingMessage}>
                <Search size={13} /> {checkingMessage ? "Checking…" : "Check message"}
              </button>
            </div>
            {messageResult ? (
              <pre className="code-box" style={{ marginTop: "0.75rem" }}>{JSON.stringify(messageResult, null, 2)}</pre>
            ) : null}
          </form>
        </SectionCard>

        <SectionCard title="User Stats Cross-Check" icon={User}>
          <form onSubmit={handleCheckUser}>
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
              <button type="submit" disabled={checkingUser}>
                <Search size={13} /> {checkingUser ? "Checking…" : "Check user"}
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
              onClick={refreshResults}
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