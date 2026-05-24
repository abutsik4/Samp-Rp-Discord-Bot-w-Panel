import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, Wifi, WifiOff, Activity, Clock,
  MessageSquare, Users, AlertTriangle, Terminal, Server,
  RefreshCw, Download, RotateCcw, Shield, Bot, BarChart2, History,
} from "lucide-react";
import { formatApiError, panelApi } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { SectionCard } from "../components/SectionCard";
import { Alert } from "../components/Alert";
import { LoadingSkeleton } from "../components/LoadingSkeleton";

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
  const isOnline = status?.online;

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title={`${bot.name || bot.key}`}
        subtitle="Bot overview and quick actions"
        actions={
          <button
            type="button"
            className="btn--ghost btn--sm"
            onClick={loadOverview}
            disabled={busyAction !== ""}
          >
            <RotateCcw size={13} />
            Refresh
          </button>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      {loading ? (
        <div className="mb-6">
          <LoadingSkeleton type="grid" rows={8} />
        </div>
      ) : (
        <>
          <div className="grid mb-6">
            <StatCard
              icon={isOnline ? Wifi : WifiOff}
              label="Connection"
              value={isOnline ? "Online" : "Offline"}
              accentColor={isOnline ? "var(--color-success)" : "var(--color-danger)"}
              iconBg={isOnline ? "var(--color-success-subtle)" : "var(--color-danger-subtle)"}
            />
            <StatCard icon={Activity} label="Ping" value={`${status?.ping ?? "—"} ms`} />
            <StatCard icon={Clock} label="Uptime" value={status?.uptime || "—"} />
            <StatCard
              icon={MessageSquare}
              label="7d Messages"
              value={asNumber(analytics?.totalMessages).toLocaleString()}
            />
            <StatCard
              icon={Users}
              label="7d Active Users"
              value={asNumber(analytics?.activeUsers).toLocaleString()}
            />
            <StatCard
              icon={AlertTriangle}
              label="Active Strikes"
              value={asNumber(strikes?.length).toLocaleString()}
              accentColor={strikes?.length > 0 ? "var(--color-warning)" : undefined}
              iconBg={strikes?.length > 0 ? "var(--color-warning-subtle)" : undefined}
            />
            <StatCard icon={Terminal} label="Disabled Commands" value={disabledCommands} />
            <StatCard icon={Server} label="SA-MP Trackers" value={asNumber(servers?.length).toLocaleString()} />
          </div>

          <div className="grid-2 grid mb-6">
            <SectionCard title="Quick Actions" icon={LayoutDashboard}>
              <div className="row-actions mb-3">
                <Link className="btn--ghost btn--sm flex items-center gap-2" to={`${base}/messages`}>
                  <MessageSquare size={13} /> Announcements
                </Link>
                <Link className="btn--ghost btn--sm flex items-center gap-2" to={`${base}/moderation`}>
                  <Shield size={13} /> Moderation
                </Link>
                <Link className="btn--ghost btn--sm flex items-center gap-2" to={`${base}/automation`}>
                  <Bot size={13} /> Automation
                </Link>
                <Link className="btn--ghost btn--sm flex items-center gap-2" to={`${base}/stats`}>
                  <BarChart2 size={13} /> Stats
                </Link>
                <Link className="btn--ghost btn--sm flex items-center gap-2" to={`${base}/samp-servers`}>
                  <Server size={13} /> SA-MP
                </Link>
                <Link className="btn--ghost btn--sm flex items-center gap-2" to={`${base}/operations`}>
                  <History size={13} /> Operations
                </Link>
              </div>
              {isAdmin && (
                <div className="row-actions">
                  <button
                    type="button"
                    onClick={() => runOpsAction("reconcile")}
                    disabled={busyAction !== ""}
                    className="btn--sm"
                  >
                    <RefreshCw size={13} />
                    {busyAction === "reconcile" ? "Running…" : "Reconcile Guild"}
                  </button>
                  <button
                    type="button"
                    className="btn--ghost btn--sm"
                    onClick={() => runOpsAction("fullsync")}
                    disabled={busyAction !== ""}
                  >
                    <Download size={13} />
                    {busyAction === "fullsync" ? "Running…" : "Full Sync"}
                  </button>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Recent Operations" icon={History}>
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
                        <td className="text-muted text-sm">{op.id}</td>
                        <td>{op.operation}</td>
                        <td className="text-muted">{op.scope || "—"}</td>
                        <td className="text-muted text-sm">
                          {op.timestamp ? new Date(op.timestamp).toLocaleString() : "—"}
                        </td>
                      </tr>
                    ))}
                    {history.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: "24px", textAlign: "center" }} className="text-muted">
                          No recent operations
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
