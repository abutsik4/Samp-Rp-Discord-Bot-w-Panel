import { useState } from 'react'
import {
  History, RefreshCw, Download, GitCommit, Undo2, Bug, Search,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { Button, Input, Field } from '../components/ui.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

function opIcon(op) {
  if (!op) return GitCommit
  const o = op.toLowerCase()
  if (o.includes('reconcile')) return RefreshCw
  if (o.includes('fullsync') || o.includes('full_sync')) return Download
  return GitCommit
}

export default function OperationsPage() {
  const { bot, botKey } = useBot()
  const guildId = bot?.guild_id
  const [expandedReport, setExpandedReport] = useState(null)
  const [reportDetail, setReportDetail] = useState(null)
  const [traceMsg, setTraceMsg] = useState('')
  const [traceUid, setTraceUid] = useState('')
  const [traceData, setTraceData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [actionErr, setActionErr] = useState('')

  const history = useResource(() => panelApi.history(botKey, 50), [botKey], { enabled: !!botKey })
  const reports = useResource(() => panelApi.debugReports({ limit: 50, offset: 0 }), [], { enabled: true })

  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  async function undo(op) {
    setBusy(true); setActionErr(''); setActionMsg('')
    try { await panelApi.undoHistory(botKey, op.id); history.refetch(); setActionMsg(`Undone ${op.operation}.`) }
    catch (e) { setActionErr(formatApiError(e, 'Undo failed')) }
    finally { setBusy(false) }
  }
  async function toggleReport(r) {
    if (expandedReport === r.id) { setExpandedReport(null); setReportDetail(null); return }
    setExpandedReport(r.id); setReportDetail(null)
    try {
      const res = await panelApi.debugReport(r.id)
      setReportDetail(res.report || res || null)
    } catch (e) { setActionErr(formatApiError(e, 'Failed to load report')) }
  }
  async function run(fn, label) {
    setBusy(true); setActionMsg(''); setActionErr('')
    try { await fn(); setActionMsg(`${label} queued.`) }
    catch (e) { setActionErr(formatApiError(e, `${label} failed`)) }
    finally { setBusy(false) }
  }
  async function traceMessage() {
    setTraceData(null); setBusy(true); setActionErr('')
    try { setTraceData(await panelApi.accuracyTraceMessage({ guildId, messageId: traceMsg, limit: 100 })) }
    catch (e) { setActionErr(formatApiError(e, 'Trace failed')) }
    finally { setBusy(false) }
  }
  async function traceUser() {
    setTraceData(null); setBusy(true); setActionErr('')
    try { setTraceData(await panelApi.accuracyTraceUser({ guildId, userId: traceUid, limit: 100 })) }
    catch (e) { setActionErr(formatApiError(e, 'Trace failed')) }
    finally { setBusy(false) }
  }

  const ops = history.data?.operations || []
  const reportItems = reports.data?.reports || []

  return (
    <div>
      <PageHeader icon={History} title="Operations" subtitle="Operation history, debug tools and accuracy verification." />
      {actionErr ? <Alert type="error" className="mb-3">{actionErr}</Alert> : null}
      {actionMsg ? <Alert type="success" className="mb-3">{actionMsg}</Alert> : null}

      <SectionCard title="Operation History" icon={History} className="mb-4"
        actions={<Button onClick={history.refetch} disabled={history.loading}><RefreshCw className="w-3.5 h-3.5" />Refresh</Button>}>
        {history.loading ? <LoadingSkeleton rows={4} /> : ops.length === 0 ? (
          <p className="text-sm text-text-muted">No operations yet.</p>
        ) : (
          <div className="space-y-2">
            {ops.map(op => {
              const Icon = opIcon(op.operation)
              return (
                <div key={op.id} className="flex items-center gap-3 p-2 rounded-md border border-border-subtle bg-bg-elevated/40">
                  <Icon className="w-4 h-4 text-accent-purple shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{op.operation}</div>
                    <div className="text-xs text-text-muted">{op.scope || '—'} · {op.timestamp ? new Date(op.timestamp).toLocaleString() : '—'}</div>
                  </div>
                  {op.undone ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-bg-elevated border border-border text-text-secondary">Undone</span>
                  ) : (
                    <Button onClick={() => undo(op)} disabled={busy}><Undo2 className="w-3.5 h-3.5" />Undo</Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Debug Reports" icon={Bug} className="mb-4"
        actions={<Button onClick={reports.refetch} disabled={reports.loading}><RefreshCw className="w-3.5 h-3.5" />Refresh</Button>}>
        {reports.loading ? <LoadingSkeleton rows={3} /> : reportItems.length === 0 ? (
          <p className="text-sm text-text-muted">No debug reports.</p>
        ) : (
          <div className="space-y-2">
            {reportItems.map(r => (
              <div key={r.id}>
                <div className="flex items-center gap-3 p-2 rounded-md border border-border-subtle bg-bg-elevated/40">
                  <Bug className="w-4 h-4 text-accent-amber shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Report #{r.id}</div>
                    <div className="text-xs text-text-muted truncate">{r.updated_by || '—'} · {r.url || '—'}</div>
                  </div>
                  <Button onClick={() => toggleReport(r)}>
                    {expandedReport === r.id
                      ? <><ChevronDown className="w-3.5 h-3.5" />Collapse</>
                      : <><ChevronRight className="w-3.5 h-3.5" />View</>}
                  </Button>
                </div>
                {expandedReport === r.id && reportDetail && (
                  <pre className="mt-1 text-xs bg-bg-elevated border border-border rounded-md p-2 overflow-x-auto max-h-72">
                    {JSON.stringify(reportDetail, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Accuracy Controls" icon={Search}>
        <div className="flex flex-wrap gap-2 mb-3">
          <Button onClick={() => run(() => panelApi.accuracyReconcile({ guildId }), 'Reconcile')} disabled={busy}>
            <RefreshCw className="w-3.5 h-3.5" />Reconcile guild
          </Button>
          <Button onClick={() => run(() => panelApi.accuracyFullsync({ guildId }), 'Full sync')} disabled={busy}>
            <Download className="w-3.5 h-3.5" />Full sync
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Field label="Trace message ID">
              <Input value={traceMsg} onChange={(e) => setTraceMsg(e.target.value)} />
            </Field>
            <Button onClick={traceMessage} disabled={busy || !traceMsg}><Search className="w-3.5 h-3.5" />Trace message</Button>
          </div>
          <div className="space-y-2">
            <Field label="Trace user ID">
              <Input value={traceUid} onChange={(e) => setTraceUid(e.target.value)} />
            </Field>
            <Button onClick={traceUser} disabled={busy || !traceUid}><Search className="w-3.5 h-3.5" />Trace user</Button>
          </div>
        </div>
        {traceData && (
          <pre className="mt-3 text-xs bg-bg-elevated border border-border rounded-md p-2 overflow-x-auto max-h-96">
            {JSON.stringify(traceData, null, 2)}
          </pre>
        )}
      </SectionCard>
    </div>
  )
}
