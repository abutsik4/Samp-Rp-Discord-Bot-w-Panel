import { useEffect, useState } from "react";
import { panelApi } from "../lib/api";

function formatNumber(value) {
  const n = Number(value || 0);
  return n.toLocaleString();
}

export function AnalyticsPage({ botKey }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(currentDays) {
    setLoading(true);
    setError("");
    try {
      const [analytics, byChannel] = await Promise.all([
        panelApi.analytics(botKey, { days: String(currentDays) }),
        panelApi.analyticsChannels(botKey, { days: String(currentDays) }),
      ]);
      setData(analytics || null);
      setChannels(byChannel?.channels || []);
    } catch (err) {
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(days);
  }, [botKey, days]);

  return (
    <div className="page">
      <h1>Analytics</h1>
      <p className="muted">Activity overview by day, users, and channels.</p>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="row-actions">
        {[7, 30, 90].map((n) => (
          <button
            key={n}
            type="button"
            className={days === n ? "" : "btn-secondary"}
            onClick={() => setDays(n)}
            disabled={loading}
          >
            {n}d
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="muted">Loading analytics…</div>
      ) : (
        <>
          <div className="grid">
            <div className="card">
              <h3>Total messages</h3>
              <p>{formatNumber(data.totalMessages)}</p>
            </div>
            <div className="card">
              <h3>Active users</h3>
              <p>{formatNumber(data.activeUsers)}</p>
            </div>
            <div className="card">
              <h3>Avg daily</h3>
              <p>{Math.round(Number(data.avgDaily || 0)).toLocaleString()}</p>
            </div>
            <div className="card">
              <h3>Peak hour</h3>
              <p>{String(data.peakHour).padStart(2, "0")}:00</p>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card">
              <h3>Top users</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.topUsers || []).map((item) => (
                      <tr key={item.id}>
                        <td>{item.name || item.id}</td>
                        <td>{formatNumber(item.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <h3>Top channels</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(channels.slice(0, 10) || []).map((item) => (
                      <tr key={item.id}>
                        <td>{item.name || item.id}</td>
                        <td>{formatNumber(item.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Daily trend</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Messages</th>
                    <th>Users</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.daily || []).map((item) => (
                    <tr key={item.date}>
                      <td>{item.date}</td>
                      <td>{formatNumber(item.messages)}</td>
                      <td>{formatNumber(item.users)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
