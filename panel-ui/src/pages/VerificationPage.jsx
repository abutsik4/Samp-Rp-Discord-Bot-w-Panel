import { useEffect, useState } from "react";
import { formatApiError, panelApi } from "../lib/api";

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
        <h1>Verification</h1>
        <div className="error-box">Access denied. Admin role required.</div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Verification</h1>
      <p className="muted">Verify message counting integrity and top-user consistency for this bot.</p>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="grid grid-2">
        <form className="card form-card" onSubmit={checkMessageCounted}>
          <h3>Message counted check</h3>
          <label>
            Message ID
            <input
              value={messageId}
              onChange={(e) => setMessageId(e.target.value)}
              placeholder="Discord message ID"
            />
          </label>
          <div className="row-actions">
            <button type="submit">Check message</button>
          </div>

          {messageResult ? (
            <pre className="code-box">{JSON.stringify(messageResult, null, 2)}</pre>
          ) : null}
        </form>

        <form className="card form-card" onSubmit={checkUserStats}>
          <h3>User stats cross-check</h3>
          <label>
            User ID
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Discord user ID"
            />
          </label>
          <div className="row-actions">
            <button type="submit">Check user</button>
          </div>

          {userResult ? (
            <pre className="code-box">{JSON.stringify(userResult, null, 2)}</pre>
          ) : null}
        </form>
      </div>

      <div className="card form-card">
        <h3>Top users verification snapshot</h3>
        <div className="row-actions">
          <label>
            Limit
            <select
              value={resultsLimit}
              onChange={(e) => setResultsLimit(Number(e.target.value) || 50)}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadResults(resultsLimit)}
            disabled={loadingResults}
          >
            {loadingResults ? "Loading…" : "Refresh"}
          </button>
        </div>

        {summary ? (
          <div className="grid">
            <div className="card">
              <h3>Total checked</h3>
              <p>{summary.total || 0}</p>
            </div>
            <div className="card">
              <h3>Perfect matches</h3>
              <p>{summary.perfect || 0}</p>
            </div>
            <div className="card">
              <h3>Discrepancies</h3>
              <p>{summary.discrepancies || 0}</p>
            </div>
          </div>
        ) : null}

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
              {results.map((item) => (
                <tr key={item.user_id}>
                  <td>{item.username || item.user_id}</td>
                  <td>{item.stored_count}</td>
                  <td>{item.indexed_count}</td>
                  <td>{item.difference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
