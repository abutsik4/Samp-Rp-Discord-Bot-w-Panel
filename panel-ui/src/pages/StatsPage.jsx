import { useEffect, useMemo, useState } from "react";
import { panelApi } from "../lib/api";

export function StatsPage({ bot, botKey, user }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustDelta, setAdjustDelta] = useState("");
  const [busy, setBusy] = useState(false);

  const canEdit = user?.role === "admin";

  const query = useMemo(
    () => ({
      guildId: bot?.guild_id || "",
      limit: String(limit),
      offset: String(offset),
      search,
      sortBy: "count",
    }),
    [bot?.guild_id, limit, offset, search]
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await panelApi.statsUsers(botKey, query);
      setRows(data?.users || []);
      setTotal(data?.pagination?.total || 0);
    } catch (err) {
      setError(err.message || "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!bot?.guild_id) return;
    load();
  }, [bot?.guild_id, botKey, offset]);

  async function runSearch(event) {
    event.preventDefault();
    setOffset(0);
    await load();
  }

  async function applyAdjust(event) {
    event.preventDefault();
    if (!canEdit) return;

    const delta = Number(adjustDelta);
    if (!adjustUserId || !Number.isFinite(delta) || delta === 0) {
      setError("Provide valid user ID and non-zero delta");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await panelApi.adjustUserStats(botKey, {
        guildId: bot.guild_id,
        userId: adjustUserId,
        delta,
      });
      setAdjustDelta("");
      await load();
    } catch (err) {
      setError(err.message || "Failed to apply adjustment");
    } finally {
      setBusy(false);
    }
  }

  const pageFrom = total === 0 ? 0 : offset + 1;
  const pageTo = Math.min(offset + limit, total);

  return (
    <div className="page">
      <h1>Statistics</h1>
      <p className="muted">User message leaderboard and manual adjustments.</p>
      {error ? <div className="error-box">{error}</div> : null}

      <div className="card">
        <form className="inline-form" onSubmit={runSearch}>
          <input
            placeholder="Search username or user ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>

        <div className="muted table-meta">
          Showing {pageFrom}–{pageTo} of {total}
        </div>

        {loading ? (
          <div className="muted">Loading…</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>User ID</th>
                  <th>Messages</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id}>
                    <td>{row.username}</td>
                    <td>{row.user_id}</td>
                    <td>{row.message_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row-actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={offset <= 0 || loading}
            onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={offset + limit >= total || loading}
            onClick={() => setOffset((prev) => prev + limit)}
          >
            Next
          </button>
        </div>
      </div>

      <form className="card inline-form" onSubmit={applyAdjust}>
        <h3>Admin adjustment</h3>
        <input
          placeholder="User ID"
          value={adjustUserId}
          onChange={(e) => setAdjustUserId(e.target.value)}
          disabled={!canEdit || busy}
        />
        <input
          type="number"
          placeholder="Delta (e.g. -10 or 50)"
          value={adjustDelta}
          onChange={(e) => setAdjustDelta(e.target.value)}
          disabled={!canEdit || busy}
        />
        <button type="submit" disabled={!canEdit || busy}>
          {busy ? "Applying…" : "Apply"}
        </button>
      </form>
    </div>
  );
}
