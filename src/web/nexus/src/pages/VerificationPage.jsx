import { useState } from 'react'
import { CheckCircle2, ShieldOff, MessageSquare, User, Search, RefreshCw, AlertTriangle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { Button, Input, Field, Select } from '../components/ui.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

function Kpi({ icon: Icon, label, value, tone }) {
  const toneMap = {
    purple: 'text-accent-purple bg-accent-purple/10 border-accent-purple/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    rose: 'text-accent-rose bg-accent-rose/10 border-accent-rose/20',
  }
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${toneMap[tone].split(' ')[0]}`} />
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold m-0">{value}</p>
    </div>
  )
}

export default function VerificationPage() {
  const { bot, botKey, user } = useBot()
  const isAdmin = (user?.role || 'admin') === 'admin'
  const [messageId, setMessageId] = useState('')
  const [userId, setUserId] = useState('')
  const [resultsLimit, setResultsLimit] = useState(50)
  const [messageResult, setMessageResult] = useState(null)
  const [userResult, setUserResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionErr, setActionErr] = useState('')

  const results = useResource(
    () => panelApi.verifyResults(botKey, { limit: resultsLimit }),
    [botKey, resultsLimit],
    { enabled: !!botKey && isAdmin },
  )

  if (!isAdmin) {
    return (
      <div>
        <PageHeader icon={CheckCircle2} title="Verification" subtitle="Data integrity checks." />
        <Alert type="error"><ShieldOff className="w-3.5 h-3.5 inline mr-1" />Access denied. Administrator role required.</Alert>
      </div>
    )
  }
  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  async function checkMessage(ev) {
    ev.preventDefault()
    if (!messageId.trim()) return
    setBusy(true); setActionErr(''); setMessageResult(null)
    try {
      const r = await panelApi.verifyMessageCounted(botKey, { messageId: messageId.trim() })
      setMessageResult(r || null)
    } catch (e) { setActionErr(formatApiError(e, 'Verify message failed')) }
    finally { setBusy(false) }
  }
  async function checkUser(ev) {
    ev.preventDefault()
    if (!userId.trim()) return
    setBusy(true); setActionErr(''); setUserResult(null)
    try {
      const r = await panelApi.verifyUserStats(botKey, { userId: userId.trim(), guildId: String(bot?.guild_id || '') })
      setUserResult(r || null)
    } catch (e) { setActionErr(formatApiError(e, 'Verify user failed')) }
    finally { setBusy(false) }
  }

  const summary = results.data?.summary
  const rows = results.data?.results || []

  return (
    <div>
      <PageHeader icon={CheckCircle2} title="Verification" subtitle="Data integrity checks and discrepancy detection." />

      {results.error ? <Alert type="error" className="mb-3">{formatApiError(results.error)}</Alert> : null}
      {actionErr ? <Alert type="error" className="mb-3">{actionErr}</Alert> : null}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <Kpi icon={CheckCircle2} label="Total Checked" value={summary.total || 0} tone="purple" />
          <Kpi icon={CheckCircle2} label="Perfect Matches" value={summary.perfect || 0} tone="green" />
          <Kpi icon={AlertTriangle} label="Discrepancies" value={summary.discrepancies || 0} tone="rose" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Message Counted Check" icon={MessageSquare}>
          <form onSubmit={checkMessage} className="space-y-3">
            <Field label="Message ID">
              <Input value={messageId} onChange={(e) => setMessageId(e.target.value)} placeholder="Discord message ID" />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}><Search className="w-3.5 h-3.5" />{busy ? 'Checking…' : 'Check message'}</Button>
            {messageResult && (
              <pre className="mt-2 text-xs bg-bg-elevated border border-border rounded-md p-2 overflow-x-auto max-h-72">
                {JSON.stringify(messageResult, null, 2)}
              </pre>
            )}
          </form>
        </SectionCard>

        <SectionCard title="User Stats Cross-Check" icon={User}>
          <form onSubmit={checkUser} className="space-y-3">
            <Field label="User ID">
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Discord user ID" />
            </Field>
            <Button type="submit" variant="primary" disabled={busy}><Search className="w-3.5 h-3.5" />{busy ? 'Checking…' : 'Check user'}</Button>
            {userResult && (
              <pre className="mt-2 text-xs bg-bg-elevated border border-border rounded-md p-2 overflow-x-auto max-h-72">
                {JSON.stringify(userResult, null, 2)}
              </pre>
            )}
          </form>
        </SectionCard>
      </div>

      <SectionCard
        title="Top Users Verification Snapshot" icon={CheckCircle2}
        actions={
          <>
            <Select value={resultsLimit} onChange={(e) => setResultsLimit(Number(e.target.value) || 50)} className="w-auto">
              <option value={25}>25</option><option value={50}>50</option>
              <option value={100}>100</option><option value={200}>200</option>
            </Select>
            <Button onClick={results.refetch} disabled={results.loading}>
              <RefreshCw className="w-3.5 h-3.5" />{results.loading ? 'Loading…' : 'Refresh'}
            </Button>
          </>
        }
      >
        {results.loading ? <LoadingSkeleton rows={6} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3 text-right">Stored</th>
                  <th className="py-2 pr-3 text-right">Indexed</th>
                  <th className="py-2 text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 text-center text-sm text-text-muted">No results — refresh to load.</td></tr>
                ) : rows.map(item => (
                  <tr key={item.user_id} className={`border-b border-border-subtle ${item.difference !== 0 ? 'bg-accent-rose/5' : ''}`}>
                    <td className="py-2 pr-3">{item.username || item.user_id}</td>
                    <td className="py-2 pr-3 text-right">{item.stored_count}</td>
                    <td className="py-2 pr-3 text-right">{item.indexed_count}</td>
                    <td className={`py-2 text-right ${item.difference !== 0 ? 'text-accent-rose font-semibold' : ''}`}>{item.difference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
