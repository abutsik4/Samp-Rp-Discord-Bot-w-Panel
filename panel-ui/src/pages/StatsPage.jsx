import { useEffect, useMemo, useState } from "react";
import { BarChart2, ChevronLeft, ChevronRight, Search, Sliders, X } from "lucide-react";
import { panelApi } from "../lib/api";
import { Alert } from "../components/Alert";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";

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
  const [adjustSuccess, setAdjustSuccess] = useState("");
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

  function clearSearch() {
    setSearch("");
    setOffset(0);
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
    setAdjustSuccess("");
    try {
      await panelApi.adjustUserStats(botKey, {
        guildId: bot.guild_id,
        userId: adjustUserId,
        delta,
      });
      setAdjustDelta("");
      setAdjustSuccess("Adjustment applied successfully.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to apply adjustment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        icon={BarChart2}
        title="Statistics"
        subtitle="User message leaderboard and manual adjustments."
      />

      {error && <Alert type="error">{error}</Alert>}
      {adjustSuccess && <Alert type="success">{adjustSuccess}</Alert>}

      <form className="flex items-center gap-2 mb-4" onSubmit={runSearch}>
        <div className="input-group" style={{ flex: 1, maxWidth: 320 }}>
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search username or ID…"
          />
        </div>
        <button type="submit" className="btn--sm">
          <Search size={13} />
          Search
        </button>
        {search && (
          <button type="button" className="btn--ghost btn--sm" onClick={clearSearch}>
            <X size={13} />
            Clear
          </button>
        )}
      </form>

      <SectionCard title="Leaderboard" icon={BarChart2}>
        <div className="table-meta">{total.toLocaleString()} users</div>

        {loading ? (
          <LoadingSkeleton type="table" rows={15} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User</th>
                  <th>User ID</th>
                  <th className="col-num">Messages</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rank = offset + i + 1;
                  return (
                    <tr key={row.user_id}>
                      <td
                        className={
                          rank === 1
                            ? "rank-1"
                            : rank === 2
                            ? "rank-2"
                            : rank === 3
                            ? "rank-3"
                            : "text-muted text-sm"
                        }
                      >
                        {rank === 1 ? "🏆" : rank}
                      </td>
                      <td>{row.username || "Unknown"}</td>
                      <td className="text-muted text-sm font-mono">{row.user_id}</td>
                      <td className="col-num font-medium">
                        {Number(row.message_count || 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <button
            className="btn--ghost btn--sm"
            onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            disabled={offset === 0 || loading}
          >
            <ChevronLeft size={13} />
            Prev
          </button>
          <span className="text-muted text-sm">
            {Math.floor(offset / limit) + 1} of {Math.max(1, Math.ceil(total / limit))}
          </span>
          <button
            className="btn--ghost btn--sm"
            onClick={() => setOffset((prev) => prev + limit)}
            disabled={offset + limit >= total || loading}
          >
            Next
            <ChevronRight size={13} />
          </button>
        </div>
      </SectionCard>

      {canEdit && (
        <SectionCard title="Manual Adjustment" icon={Sliders}>
          <form className="form-grid" onSubmit={applyAdjust}>
            <div className="form-row">
              <label>
                User ID
                <input
                  placeholder="User ID"
                  value={adjustUserId}
                  onChange={(e) => setAdjustUserId(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Delta
                <input
                  type="number"
                  placeholder="e.g. -10 or 50"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  disabled={busy}
                />
              </label>
            </div>
            <div className="row-actions">
              <button type="submit" className="btn--sm" disabled={busy}>
                {busy ? "Applying…" : "Apply"}
              </button>
            </div>
          </form>
        </SectionCard>
      )}
    </div>
  );
}
