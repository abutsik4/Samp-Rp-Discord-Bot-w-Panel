import { useEffect, useState } from "react";
import { TrendingUp, MessageSquare, Users, Clock, Zap } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { panelApi } from "../lib/api";
import { Alert } from "../components/Alert";
import { LoadingSkeleton } from "../components/LoadingSkeleton";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatCard } from "../components/StatCard";
import { SectionCard } from "../components/SectionCard";

function formatNumber(value) {
  const n = Number(value || 0);
  return n.toLocaleString();
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="chart-tooltip__row">
          {p.name}: <strong>{formatNumber(p.value)}</strong>
        </p>
      ))}
    </div>
  );
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

  const topChannelsData = channels.slice(0, 10).map((ch) => ({
    name: ch.name || ch.id,
    count: Number(ch.count || 0),
  }));

  const topUsersData = (data?.topUsers || []).slice(0, 10).map((u) => ({
    name: u.name || u.id,
    count: Number(u.count || 0),
  }));

  return (
    <div className="page">
      <PageHeader
        icon={TrendingUp}
        title="Analytics"
        subtitle="Activity overview by day, users, and channels."
        actions={
          <div className="btn-group">
            {[7, 30, 90].map((n) => (
              <button
                key={n}
                type="button"
                className={days === n ? "btn-group__item active" : "btn-group__item"}
                onClick={() => setDays(n)}
                disabled={loading}
              >
                {n}d
              </button>
            ))}
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      {loading ? (
        <LoadingSkeleton type="grid" rows={4} />
      ) : !data ? (
        <EmptyState icon={TrendingUp} title="No analytics data" message="No activity recorded for this period." />
      ) : (
        <>
          <div className="grid mb-6">
            <StatCard
              icon={MessageSquare}
              label="Total Messages"
              value={formatNumber(data.totalMessages)}
              accentColor="var(--color-accent)"
            />
            <StatCard
              icon={Users}
              label="Active Users"
              value={formatNumber(data.activeUsers)}
              accentColor="var(--color-success)"
            />
            <StatCard
              icon={Zap}
              label="Avg Daily"
              value={Math.round(Number(data.avgDaily || 0)).toLocaleString()}
              accentColor="var(--color-warning)"
            />
            <StatCard
              icon={Clock}
              label="Peak Hour"
              value={`${String(data.peakHour).padStart(2, "0")}:00`}
              accentColor="var(--color-info)"
            />
          </div>

          {(data.daily || []).length > 0 && (
            <SectionCard title="Daily Trend" icon={TrendingUp} description={`${days}-day message and user activity`}>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-border)" }}
                    />
                    <YAxis
                      tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="messages"
                      name="Messages"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="users"
                      name="Users"
                      stroke="var(--color-success)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          <div className="grid grid-2">
            <SectionCard title="Top Users" icon={Users}>
              {topUsersData.length === 0 ? (
                <EmptyState icon={Users} title="No user data" />
              ) : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topUsersData}
                      layout="vertical"
                      margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--color-border)" }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={80}
                        tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Messages" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Top Channels" icon={MessageSquare}>
              {topChannelsData.length === 0 ? (
                <EmptyState icon={MessageSquare} title="No channel data" />
              ) : (
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topChannelsData}
                      layout="vertical"
                      margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--color-border)" }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={80}
                        tick={{ fill: "var(--color-text-secondary)", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Messages" fill="var(--color-info)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
