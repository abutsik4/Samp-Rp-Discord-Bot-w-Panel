import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, Wifi, WifiOff, Activity, Clock,
  MessageSquare, Users, AlertTriangle, Terminal, Server,
  RefreshCw, Download, RotateCcw, Shield, Bot, BarChart2, History,
} from "lucide-react";
import { formatApiError, panelApi } from "../lib/api";
import { useQuery, useMutation } from "../hooks/useQuery";
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
  const isAdmin = user?.role === "admin";
  const guildId = String(bot?.guild_id || "");
  const enc = encodeURIComponent;

  const statusUrl = '/api/status';
  const analyticsUrl = `/panel/api/${enc(botKey)}/analytics?days=7`;
  const historyUrl = `/panel/api/${enc(botKey)}/history?limit=8`;
  const strikesUrl = `/panel/api/${enc(botKey)}/rate-limits/strikes?guildId=${guildId}`;
  const serversUrl = `/panel/api/${enc(botKey)}/samp-servers`;
  const commandsUrl = `/panel/api/${enc(botKey)}/commands?guildId=${guildId}`;

  const deps = [botKey, guildId];
  const queryOpts = { deps, enabled: !!botKey };

  const {
    data: statusData, loading: loadingStatus, error: errorStatus, refresh: refreshStatus,
  } = useQuery(statusUrl, queryOpts);

  const {
    data: analyticsData, loading: loadingAnalytics, error: errorAnalytics, refresh: refreshAnalytics,
  } = useQuery(analyticsUrl, queryOpts);

  const {
    data: historyData, loading: loadingHistory, error: errorHistory, refresh: refreshHistory,
  } = useQuery(historyUrl, queryOpts);

  const {
    data: strikesData, loading: loadingStrikes, error: errorStrikes, refresh: refreshStrikes,
  } = useQuery(strikesUrl, queryOpts);

  const {
    data: serversData, loading: loadingServers, error: errorServers, refresh: refreshServers,
  } = useQuery(serversUrl, queryOpts);

  const {
    data: commandsData, loading: loadingCommands, error: errorCommands, refresh: refreshCommands,
  } = useQuery(commandsUrl, queryOpts);

  const [reconcile, { loading: loadingReconcile, error: errorReconcile }] = useMutation(
    () => panelApi.accuracyReconcile({ guildId }),
    {
      invalidate: [statusUrl, analyticsUrl, historyUrl, strikesUrl, serversUrl, commandsUrl],
    }
  );

  const [fullsync, { loading: loadingFullsync, error: errorFullsync }] = useMutation(
    () => panelApi.accuracyFullsync({ guildId }),
    {
      invalidate: [statusUrl, analyticsUrl, historyUrl, strikesUrl, serversUrl, commandsUrl],
    }
  );

  const status = statusData?.bot || null;
  const analytics = analyticsData || null;
  const history = historyData?.operations || [];
  const strikes = strikesData?.users || [];
  const servers = serversData?.servers || [];
  const commands = commandsData?.commands || [];

  const loading = loadingStatus || loadingAnalytics || loadingHistory || loadingStrikes || loadingServers || loadingCommands;
  const busyAction = loadingReconcile ? "reconcile" : loadingFullsync ? "fullsync" : "";

  const firstError = [errorStatus, errorAnalytics, errorHistory, errorStrikes, errorServers, errorCommands, errorReconcile, errorFullsync].find(Boolean);
  const error = firstError ? formatApiError(firstError, "Some overview data failed to load") : "";

  const disabledCommands = useMemo(
    () => (commands || []).filter((item) => item?.enabled === false).length,
    [commands]
  );

  function refreshAll() {
    refreshStatus();
    refreshAnalytics();
    refreshHistory();
    refreshStrikes();
    refreshServers();
    refreshCommands();
  }

  async function runOpsAction(type) {
    if (!isAdmin) return;
    try {
      if (type === "reconcile") {
        await reconcile();
      } else {
        await fullsync();
      }
    } catch (_err) {
      // error handled by useMutation
    }
  }

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
            onClick={refreshAll}
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