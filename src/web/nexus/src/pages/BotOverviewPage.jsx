import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard, Users, MessageSquare, Server, Activity, AlertOctagon,
  Bot, ArrowRight, RefreshCw, ShieldCheck,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { Button } from '../components/ui.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'
import { useState } from 'react'

function Kpi({ icon: Icon, label, value, sub, tone = 'purple' }) {
  const toneMap = {
    purple: 'text-accent-purple bg-accent-purple/10 border-accent-purple/20',
    cyan: 'text-accent-cyan bg-accent-cyan/10 border-accent-cyan/20',
    amber: 'text-accent-amber bg-accent-amber/10 border-accent-amber/20',
    rose: 'text-accent-rose bg-accent-rose/10 border-accent-rose/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
  }
  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center border ${toneMap[tone]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value ?? '—'}</div>
      {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
    </div>
  )
}

function formatUptime(ms) {
  if (!ms || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const QUICK_LINKS = [
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/stats', label: 'Stats', icon: Users },
  { to: '/analytics', label: 'Analytics', icon: Activity },
  { to: '/moderation', label: 'Moderation', icon: ShieldCheck },
  { to: '/automation', label: 'Automation', icon: Bot },
  { to: '/samp-servers', label: 'SA-MP Servers', icon: Server },
]

export default function BotOverviewPage() {
  const { bot, botKey, loading: botLoading } = useBot()
  const guildId = bot?.guild_id
  const [actionMsg, setActionMsg] = useState('')
  const [actionErr, setActionErr] = useState('')
  const [busy, setBusy] = useState(false)

  const status = useResource(() => panelApi.status(), [], { enabled: true })
  const analytics = useResource(
    () => panelApi.analytics(botKey, { days: 7 }),
    [botKey],
    { enabled: !!botKey },
  )
  const strikes = useResource(
    () => panelApi.rateLimitStrikes(botKey, guildId),
    [botKey, guildId],
    { enabled: !!botKey && !!guildId },
  )
  const samp = useResource(
    () => panelApi.sampServers(botKey),
    [botKey],
    { enabled: !!botKey },
  )
  const commands = useResource(
    () => panelApi.commands(botKey, guildId),
    [botKey, guildId],
    { enabled: !!botKey && !!guildId },
  )

  const kpis = useMemo(() => {
    const messages = analytics.data?.totals?.messages
    const activeUsers = analytics.data?.totals?.uniqueUsers
    const strikesCount = strikes.data?.users?.length || 0
    const sampCount = samp.data?.servers?.length || 0
    const disabledCount = (commands.data?.commands || []).filter((c) => c.enabled === false).length
    const ping = status.data?.discordPing
    const upMs = status.data?.uptimeMs
    return [
      { icon: Activity, label: 'Bot status', value: status.data?.ok ? 'Online' : 'Offline', sub: ping != null ? `Ping ${ping}ms` : '', tone: status.data?.ok ? 'green' : 'rose' },
      { icon: MessageSquare, label: 'Messages (7d)', value: messages?.toLocaleString?.() ?? messages, sub: 'Past week', tone: 'cyan' },
      { icon: Users, label: 'Active users (7d)', value: activeUsers?.toLocaleString?.() ?? activeUsers, sub: 'Unique senders', tone: 'purple' },
      { icon: AlertOctagon, label: 'Active strikes', value: strikesCount, sub: 'Users currently flagged', tone: 'amber' },
      { icon: Server, label: 'SA-MP trackers', value: sampCount, sub: 'Configured', tone: 'cyan' },
      { icon: Bot, label: 'Disabled commands', value: disabledCount, sub: 'Toggled off', tone: 'rose' },
      { icon: Activity, label: 'Uptime', value: formatUptime(upMs), sub: 'Since restart', tone: 'green' },
    ]
  }, [analytics.data, strikes.data, samp.data, commands.data, status.data])

  async function reconcile() {
    setBusy(true); setActionMsg(''); setActionErr('')
    try {
      await panelApi.accuracyReconcile({ guildId })
      setActionMsg('Reconciliation queued.')
    } catch (e) {
      setActionErr(formatApiError(e, 'Reconcile failed'))
    } finally { setBusy(false) }
  }
  async function fullsync() {
    if (!confirm('Run a full sync? This rescans all tracked channels and can take several minutes.')) return
    setBusy(true); setActionMsg(''); setActionErr('')
    try {
      await panelApi.accuracyFullsync({ guildId })
      setActionMsg('Full sync queued.')
    } catch (e) {
      setActionErr(formatApiError(e, 'Full sync failed'))
    } finally { setBusy(false) }
  }

  if (botLoading) return <div className="text-text-secondary text-sm">Loading bot…</div>
  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Bot Overview"
        subtitle={bot ? `${bot.name || bot.key} · ${guildId || 'no guild'}` : 'Pick a bot from the sidebar'}
        actions={
          <>
            <Button onClick={reconcile} disabled={busy}>
              <RefreshCw className="w-3.5 h-3.5" />Reconcile
            </Button>
            <Button variant="primary" onClick={fullsync} disabled={busy}>
              Full sync
            </Button>
          </>
        }
      />

      {actionErr ? <Alert type="error" className="mb-3">{actionErr}</Alert> : null}
      {actionMsg ? <Alert type="success" className="mb-3">{actionMsg}</Alert> : null}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
        {kpis.map((k, i) => <Kpi key={i} {...k} />)}
      </div>

      <SectionCard title="Quick navigation" icon={ArrowRight}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {QUICK_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-bg-elevated hover:border-accent-purple/40 hover:bg-bg-hover transition-colors text-sm"
            >
              <Icon className="w-4 h-4 text-accent-purple" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </div>
      </SectionCard>

      {(analytics.loading || strikes.loading || samp.loading || commands.loading) && (
        <div className="mt-4"><LoadingSkeleton rows={2} /></div>
      )}
    </div>
  )
}
