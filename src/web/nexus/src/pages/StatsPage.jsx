import { useState } from 'react'
import { BarChart2, ChevronLeft, ChevronRight, Search, Sliders, X } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { Button, Input, Field } from '../components/ui.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

export default function StatsPage() {
  const { bot, botKey, user } = useBot()
  const guildId = bot?.guild_id
  const isAdmin = (user?.role || 'admin') === 'admin'

  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const limit = 50

  const [adjUid, setAdjUid] = useState('')
  const [adjDelta, setAdjDelta] = useState('')
  const [adjSuccess, setAdjSuccess] = useState('')
  const [adjBusy, setAdjBusy] = useState(false)
  const [adjErr, setAdjErr] = useState('')

  const stats = useResource(
    () => panelApi.statsUsers(botKey, { guildId, limit, offset, search: appliedSearch, sortBy: 'count' }),
    [botKey, guildId, offset, appliedSearch],
    { enabled: !!botKey && !!guildId },
  )

  const rows = stats.data?.users || []
  const total = stats.data?.pagination?.total || 0
  const pages = Math.max(1, Math.ceil(total / limit))
  const pageNo = Math.floor(offset / limit) + 1

  function runSearch(ev) {
    ev.preventDefault()
    setOffset(0)
    setAppliedSearch(search.trim())
  }
  function clearSearch() {
    setSearch(''); setAppliedSearch(''); setOffset(0)
  }

  async function adjust(ev) {
    ev.preventDefault()
    if (!isAdmin) return
    const delta = Number(adjDelta)
    if (!adjUid || !Number.isFinite(delta) || delta === 0) return
    setAdjBusy(true); setAdjErr(''); setAdjSuccess('')
    try {
      await panelApi.adjustUserStats(botKey, { guildId, userId: adjUid, delta })
      setAdjDelta('')
      setAdjSuccess('Adjustment applied successfully.')
      stats.refetch()
    } catch (e) {
      setAdjErr(formatApiError(e, 'Adjust failed'))
    } finally { setAdjBusy(false) }
  }

  if (!botKey) return <Alert type="warning">No bot selected.</Alert>
  if (!guildId) return <Alert type="warning">This bot has no guild configured.</Alert>

  return (
    <div>
      <PageHeader icon={BarChart2} title="Statistics" subtitle="Message leaderboard and manual adjustments." />

      {stats.error ? <Alert type="error" className="mb-3">{formatApiError(stats.error)}</Alert> : null}
      {adjErr ? <Alert type="error" className="mb-3">{adjErr}</Alert> : null}
      {adjSuccess ? <Alert type="success" className="mb-3">{adjSuccess}</Alert> : null}

      <form onSubmit={runSearch} className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search username or ID…" className="pl-8" />
        </div>
        <Button type="submit"><Search className="w-3.5 h-3.5" />Search</Button>
        {appliedSearch && <Button onClick={clearSearch}><X className="w-3.5 h-3.5" />Clear</Button>}
      </form>

      <SectionCard title="Leaderboard" icon={BarChart2} className="mb-4">
        <div className="text-xs text-text-muted mb-2">{total.toLocaleString()} users</div>
        {stats.loading ? <LoadingSkeleton rows={8} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border">
                  <th className="py-2 pr-3 w-12">#</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">User ID</th>
                  <th className="py-2 text-right">Messages</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const rank = offset + i + 1
                  const rankCls = rank === 1 ? 'text-accent-amber font-bold' :
                    rank === 2 ? 'text-text-secondary font-semibold' :
                    rank === 3 ? 'text-orange-400 font-semibold' : 'text-text-muted'
                  return (
                    <tr key={row.user_id} className="border-b border-border-subtle hover:bg-bg-elevated/40">
                      <td className={`py-2 pr-3 ${rankCls}`}>{rank === 1 ? '🏆' : rank}</td>
                      <td className="py-2 pr-3">{row.username || 'Unknown'}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-text-muted">{row.user_id}</td>
                      <td className="py-2 text-right font-medium">{Number(row.message_count || 0).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <Button onClick={() => setOffset(p => Math.max(0, p - limit))} disabled={offset === 0 || stats.loading}>
            <ChevronLeft className="w-3.5 h-3.5" />Prev
          </Button>
          <span className="text-xs text-text-muted">Page {pageNo} of {pages}</span>
          <Button onClick={() => setOffset(p => p + limit)} disabled={offset + limit >= total || stats.loading}>
            Next<ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </SectionCard>

      {isAdmin && (
        <SectionCard title="Manual Adjustment" icon={Sliders}>
          <form onSubmit={adjust} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <Field label="User ID">
              <Input value={adjUid} onChange={(e) => setAdjUid(e.target.value)} disabled={adjBusy} placeholder="User ID" />
            </Field>
            <Field label="Delta">
              <Input type="number" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} disabled={adjBusy} placeholder="e.g. -10 or 50" />
            </Field>
            <Button type="submit" variant="primary" disabled={adjBusy}>{adjBusy ? 'Applying…' : 'Apply'}</Button>
          </form>
        </SectionCard>
      )}
    </div>
  )
}
