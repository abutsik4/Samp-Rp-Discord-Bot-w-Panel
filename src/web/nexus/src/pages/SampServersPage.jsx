import { useState } from 'react'
import { Pencil, Plus, RefreshCw, Save, Server, Square, Trash2, X, Play } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { Button, Input, Select, Field } from '../components/ui.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

const EMPTY = { server_id: '', server_name: '', server_ip: '', server_port: 7777, channel_id: '', emoji: '🎮' }

function StatusBadge({ enabled }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${enabled ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-bg-elevated text-text-secondary border-border'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-400' : 'bg-text-muted'}`} />
      {enabled ? 'Enabled' : 'Disabled'}
    </span>
  )
}

export default function SampServersPage() {
  const { botKey } = useBot()
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const servers = useResource(() => panelApi.sampServers(botKey), [botKey], { enabled: !!botKey })
  const channels = useResource(() => panelApi.sendableChannels(botKey), [botKey], { enabled: !!botKey })

  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  async function save() {
    setBusy(true); setErr('')
    try {
      if (editingId) await panelApi.updateSampServer(botKey, editingId, form)
      else await panelApi.addSampServer(botKey, form)
      setEditingId(''); setForm(EMPTY); servers.refetch()
    } catch (e) { setErr(formatApiError(e, 'Save failed')) }
    finally { setBusy(false) }
  }
  async function remove(id) {
    setBusy(true); setErr('')
    try { await panelApi.removeSampServer(botKey, id); setConfirmDel(null); servers.refetch() }
    catch (e) { setErr(formatApiError(e, 'Delete failed')) }
    finally { setBusy(false) }
  }
  async function toggle(s) {
    setBusy(true); setErr('')
    try {
      if (s.enabled) await panelApi.stopSampServer(botKey, s.server_id)
      else await panelApi.startSampServer(botKey, s.server_id)
      servers.refetch()
    } catch (e) { setErr(formatApiError(e, 'Toggle failed')) }
    finally { setBusy(false) }
  }
  async function refresh(id) {
    setBusy(true); setErr('')
    try { await panelApi.refreshSampServer(botKey, id); servers.refetch() }
    catch (e) { setErr(formatApiError(e, 'Refresh failed')) }
    finally { setBusy(false) }
  }

  const items = servers.data?.servers || []
  const channelList = channels.data?.items || []

  return (
    <div>
      <PageHeader icon={Server} title="SA-MP Servers" subtitle="Track and manage SA-MP game server status." />
      {err ? <Alert type="error" className="mb-3">{err}</Alert> : null}
      {servers.error ? <Alert type="error" className="mb-3">{formatApiError(servers.error)}</Alert> : null}

      {servers.loading ? <LoadingSkeleton rows={3} /> : items.length === 0 ? (
        <p className="text-sm text-text-muted mb-4">No SA-MP servers configured.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {items.map(s => (
            <div key={s.server_id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold">{s.emoji} {s.server_name || s.server_ip}</span>
                <StatusBadge enabled={s.enabled} />
              </div>
              <p className="text-xs text-text-muted font-mono">{s.server_ip}:{s.server_port}</p>
              {s.channel_id && <p className="text-xs text-text-muted mt-1">channel: {s.channel_id}</p>}
              <div className="flex items-center gap-1 mt-3">
                <Button variant="icon" onClick={() => { setEditingId(s.server_id); setForm({ ...EMPTY, ...s }) }} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="icon" onClick={() => refresh(s.server_id)} disabled={busy} title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></Button>
                <Button variant="icon" onClick={() => toggle(s)} disabled={busy} title={s.enabled ? 'Stop' : 'Start'}>
                  {s.enabled ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </Button>
                {confirmDel === s.server_id ? (
                  <span className="flex items-center gap-1 text-xs">
                    <span className="text-text-secondary">Delete?</span>
                    <Button variant="danger" disabled={busy} onClick={() => remove(s.server_id)}>Yes</Button>
                    <Button onClick={() => setConfirmDel(null)}>No</Button>
                  </span>
                ) : (
                  <Button variant="iconDanger" onClick={() => setConfirmDel(s.server_id)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <SectionCard
        title={editingId ? 'Edit Server' : 'Add Server'}
        icon={editingId ? Pencil : Plus}
        actions={editingId && <Button onClick={() => { setEditingId(''); setForm(EMPTY) }}><X className="w-3.5 h-3.5" />Cancel</Button>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Server ID">
            <Input value={form.server_id} disabled={!!editingId} onChange={(e) => setForm(p => ({ ...p, server_id: e.target.value }))} />
          </Field>
          <Field label="Name">
            <Input value={form.server_name} onChange={(e) => setForm(p => ({ ...p, server_name: e.target.value }))} />
          </Field>
          <Field label="IP">
            <Input value={form.server_ip} onChange={(e) => setForm(p => ({ ...p, server_ip: e.target.value }))} />
          </Field>
          <Field label="Port">
            <Input type="number" value={form.server_port} onChange={(e) => setForm(p => ({ ...p, server_port: Number(e.target.value) }))} />
          </Field>
          <Field label="Channel">
            <Select value={form.channel_id} onChange={(e) => setForm(p => ({ ...p, channel_id: e.target.value }))}>
              <option value="">Select channel…</option>
              {channelList.map(ch => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
            </Select>
          </Field>
          <Field label="Emoji">
            <Input value={form.emoji} onChange={(e) => setForm(p => ({ ...p, emoji: e.target.value }))} />
          </Field>
        </div>
        <div className="flex gap-2 mt-3">
          <Button variant="primary" onClick={save} disabled={busy}><Save className="w-3.5 h-3.5" />{editingId ? 'Save' : 'Create'}</Button>
        </div>
      </SectionCard>
    </div>
  )
}
