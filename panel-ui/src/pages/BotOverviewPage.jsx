import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatApiError, panelApi } from "../lib/api";

function asNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export function BotOverviewPage({ bot, botKey, user }) {
  const [status, setStatus] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [history, setHistory] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [servers, setServers] = useState([]);
  const [commands, setCommands] = useState([]);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === "admin";
  const guildId = String(bot?.guild_id || "");

  const disabledCommands = useMemo(
    () => (commands || []).filter((item) => item?.enabled === false).length,
    [commands]
  );

  async function loadOverview() {
    setLoading(true);
    setError("");

    const results = await Promise.allSettled([
      panelApi.status(),
      panelApi.analytics(botKey, { days: "7" }),
      panelApi.history(botKey, 8),
      panelApi.rateLimitStrikes(botKey, guildId),
      panelApi.sampServers(botKey),
      panelApi.commands(botKey, guildId),
    ]);

    const [statusRes, analyticsRes, historyRes, strikesRes, serversRes, commandsRes] = results;

    if (statusRes.status === "fulfilled") setStatus(statusRes.value?.bot || null);
    if (analyticsRes.status === "fulfilled") setAnalytics(analyticsRes.value || null);
    if (historyRes.status === "fulfilled") setHistory(historyRes.value?.operations || []);
    if (strikesRes.status === "fulfilled") setStrikes(strikesRes.value?.users || []);
    if (serversRes.status === "fulfilled") setServers(serversRes.value?.servers || []);
    if (commandsRes.status === "fulfilled") setCommands(commandsRes.value?.commands || []);

    const firstFailure = results.find((item) => item.status === "rejected");
    if (firstFailure?.reason) {
      setError(formatApiError(firstFailure.reason, "Some overview data failed to load"));
    }

    setLoading(false);
  }

  async function runOpsAction(type) {
    if (!isAdmin) return;
    setBusyAction(type);
    setError("");
    try {
      if (type === "reconcile") {
        await panelApi.accuracyReconcile({ guildId });
      } else {
        await panelApi.accuracyFullsync({ guildId });
      }
      await loadOverview();
    } catch (err) {
      setError(formatApiError(err, "Operation failed"));
    } finally {
      setBusyAction("");
    }
  }

  useEffect(() => {
    loadOverview();
  }, [botKey, guildId]);

  const base = `/bot/${botKey}`;

  return (
    <div className="page">
      <h1>{bot.name || bot.key} Control Center</h1>
      <p className="muted">Guild ID: {bot.guild_id || "n/a"}</p>
      {error ? <div className="error-box">{error}</div> : null}

      {loading ? (
        <div className="muted">Loading bot status…</div>
      ) : (
        <>
        <div className="grid">
          <div className="card">
            <h3>Connection</h3>
            <p>{status?.online ? "Online" : "Offline"}</p>
          </div>
          <div className="card">
            <h3>Ping</h3>
            <p>{status?.ping ?? "n/a"} ms</p>
          </div>
          <div className="card">
            <h3>Uptime</h3>
            <p>{status?.uptime || "n/a"}</p>
          </div>
          <div className="card">
            <h3>7d Messages</h3>
            <p>{asNumber(analytics?.totalMessages).toLocaleString()}</p>
          </div>
          <div className="card">
            <h3>7d Active Users</h3>
            <p>{asNumber(analytics?.activeUsers).toLocaleString()}</p>
          </div>
          <div className="card">
            <h3>Active Strikes</h3>
            <p>{asNumber(strikes?.length).toLocaleString()}</p>
          </div>
          <div className="card">
            <h3>Disabled Commands</h3>
            <p>{disabledCommands}</p>
          </div>
          <div className="card">
            <h3>SA-MP Trackers</h3>
            <p>{asNumber(servers?.length).toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card form-card">
            <h3>Quick Actions</h3>
            <div className="row-actions">
              <Link className="subnav-link" to={`${base}/messages`}>Announcements</Link>
              <Link className="subnav-link" to={`${base}/moderation`}>Moderation</Link>
              <Link className="subnav-link" to={`${base}/automation`}>Automation</Link>
              <Link className="subnav-link" to={`${base}/stats`}>Stats</Link>
              <Link className="subnav-link" to={`${base}/samp-servers`}>SA-MP</Link>
              <Link className="subnav-link" to={`${base}/operations`}>Operations</Link>
            </div>
            <div className="row-actions">
              <button
                type="button"
                onClick={() => runOpsAction("reconcile")}
                disabled={!isAdmin || busyAction !== ""}
              >
                {busyAction === "reconcile" ? "Running…" : "Reconcile Guild"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => runOpsAction("fullsync")}
                disabled={!isAdmin || busyAction !== ""}
              >
                {busyAction === "fullsync" ? "Running…" : "Full Sync"}
              </button>
              <button type="button" className="btn-secondary" onClick={loadOverview} disabled={busyAction !== ""}>
                Refresh
              </button>
            </div>
          </div>

          <div className="card form-card">
            <h3>Recent Operations</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Scope</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {(history || []).slice(0, 8).map((op) => (
                    <tr key={op.id}>
                      <td>{op.id}</td>
                      <td>{op.operation}</td>
                      <td>{op.scope || "-"}</td>
                      <td>{op.timestamp ? new Date(op.timestamp).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
