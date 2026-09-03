import { useState } from 'react'
import { TrendingUp, MessageSquare, Users, Clock, Zap } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { Button } from '../components/ui.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

function fmt(n) { return Number(n || 0).toLocaleString() }

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-bg-card px-2.5 py-1.5 text-xs shadow-lg">
      <div className="text-text-secondary mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="font-semibold">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, tone = 'purple' }) {
  const toneMap = {
    purple: 'text-accent-purple bg-accent-purple/10 border-accent-purple/20',
    cyan: 'text-accent-cyan bg-accent-cyan/10 border-accent-cyan/20',
    amber: 'text-accent-amber bg-accent-amber/10 border-accent-amber/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
  }
  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center border ${toneMap[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

export default function AnalyticsPage() {
  const { botKey } = useBot()
  const [days, setDays] = useState(30)

  const analytics = useResource(() => panelApi.analytics(botKey, { days }), [botKey, days], { enabled: !!botKey })
  const channels = useResource(() => panelApi.analyticsChannels(botKey, { days }), [botKey, days], { enabled: !!botKey })

  const loading = analytics.loading || channels.loading
  const error = analytics.error || channels.error
  const data = analytics.data
  const ch = channels.data?.channels || []

  const topChannels = ch.slice(0, 10).map(c => ({ name: c.name || c.id, count: Number(c.count || 0) }))
  const topUsers = (data?.topUsers || []).slice(0, 10).map(u => ({ name: u.name || u.id, count: Number(u.count || 0) }))

  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  return (
    <div>
      <PageHeader
        icon={TrendingUp} title="Analytics"
        subtitle="Activity overview by day, users, and channels."
        actions={
          <div className="inline-flex rounded-md border border-border bg-bg-elevated overflow-hidden">
            {[7, 30, 90].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                disabled={loading}
                className={`px-3 py-1.5 text-xs ${days === n ? 'bg-accent-purple text-white' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}`}
              >{n}d</button>
            ))}
          </div>
        }
      />

      {error ? <Alert type="error" className="mb-3">{formatApiError(error)}</Alert> : null}

      {loading ? <LoadingSkeleton rows={6} /> : !data ? (
        <p className="text-sm text-text-muted">No analytics data available.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Kpi icon={MessageSquare} label="Total Messages" value={fmt(data.totalMessages)} tone="cyan" />
            <Kpi icon={Users} label="Active Users" value={fmt(data.activeUsers)} tone="green" />
            <Kpi icon={Zap} label="Avg Daily" value={Math.round(Number(data.avgDaily || 0)).toLocaleString()} tone="amber" />
            <Kpi icon={Clock} label="Peak Hour" value={`${String(data.peakHour ?? 0).padStart(2, '0')}:00`} tone="purple" />
          </div>

          {(data.daily || []).length > 0 && (
            <SectionCard title="Daily Trend" icon={TrendingUp} description={`${days}-day message and user activity`} className="mb-4">
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222233" />
                    <XAxis dataKey="date" tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#222233' }} />
                    <YAxis tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip content={<ChartTip />} />
                    <Line type="monotone" dataKey="messages" name="Messages" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="users" name="Users" stroke="#06b6d4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Top Users" icon={Users}>
              {topUsers.length === 0 ? (
                <p className="text-sm text-text-muted">No user data.</p>
              ) : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topUsers} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222233" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#222233' }} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" name="Messages" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>
            <SectionCard title="Top Channels" icon={MessageSquare}>
              {topChannels.length === 0 ? (
                <p className="text-sm text-text-muted">No channel data.</p>
              ) : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topChannels} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#222233" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#222233' }} />
                      <YAxis type="category" dataKey="name" width={90} tick={{ fill: '#8b8b9e', fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="count" name="Messages" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
