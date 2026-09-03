import { useMemo, useState } from 'react'
import { MessageSquare, Hash, Plus, Save, X, Pencil, Trash2, FileEdit } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { Button, Input, Select, Field } from '../components/ui.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

function parseEmbed(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return null }
}
function preview(item) {
  if (item.content) return item.content
  const e = parseEmbed(item.embed)
  if (!e) return '—'
  const parts = [e.title, e.description].filter(Boolean)
  if (!parts.length) return '—'
  const f = parts.join(' — ').split('\n')[0]
  return f.length > 100 ? f.slice(0, 100) + '…' : f
}
const emptyForm = {
  id: null, channelId: '', status: 'draft', content: '',
  embedTitle: '', embedDescription: '', embedFooter: '', embedColor: '#6366f1',
}

function StatusBadge({ status }) {
  const map = {
    draft: 'bg-bg-elevated text-text-secondary border-border',
    sent: 'bg-green-500/10 text-green-400 border-green-500/20',
    scheduled: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${map[status] || map.draft}`}>{status || 'draft'}</span>
}

export default function MessagesPage() {
  const { botKey, user } = useBot()
  const isAdmin = (user?.role || 'admin') === 'admin'
  const [form, setForm] = useState(emptyForm)
  const [confirmId, setConfirmId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const messages = useResource(() => panelApi.listMessages(botKey), [botKey], { enabled: !!botKey })
  const channels = useResource(() => panelApi.sendableChannels(botKey), [botKey], { enabled: !!botKey })

  const channelOpts = useMemo(() => (channels.data?.items || []).map(c => ({
    id: c.id || c.channelId || c.value, name: c.name || c.label || c.id,
  })), [channels.data])

  function channelName(id) {
    if (!id) return '—'
    const f = channelOpts.find(c => c.id === id)
    return f ? `#${f.name}` : id
  }

  function editItem(item) {
    const e = parseEmbed(item.embed)
    setForm({
      id: item.id,
      channelId: item.channel_id || '',
      status: item.status || 'draft',
      content: item.content || '',
      embedTitle: e?.title || '',
      embedDescription: e?.description || '',
      embedFooter: e?.footer || '',
      embedColor: e?.color || '#6366f1',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit(ev) {
    ev.preventDefault()
    if (!isAdmin) return
    const payload = {
      channelId: form.channelId || null,
      status: form.status,
      content: form.content || '',
      embed: (form.embedTitle || form.embedDescription || form.embedFooter)
        ? { title: form.embedTitle, description: form.embedDescription, footer: form.embedFooter, color: form.embedColor }
        : null,
    }
    setBusy(true); setError('')
    try {
      if (form.id) await panelApi.updateMessage(botKey, form.id, payload)
      else await panelApi.createMessage(botKey, payload)
      setForm(emptyForm)
      messages.refetch()
    } catch (e) {
      setError(formatApiError(e, 'Failed to save message'))
    } finally { setBusy(false) }
  }

  async function doDelete(id) {
    setBusy(true); setError('')
    try {
      await panelApi.deleteMessage(botKey, id)
      setConfirmId(null)
      messages.refetch()
    } catch (e) {
      setError(formatApiError(e, 'Failed to delete'))
    } finally { setBusy(false) }
  }

  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  return (
    <div>
      <PageHeader icon={MessageSquare} title="Messages" subtitle="Create, edit and send announcements." />
      {error ? <Alert type="error" className="mb-3">{error}</Alert> : null}

      <SectionCard
        title={form.id ? 'Edit Message' : 'New Message'}
        icon={form.id ? FileEdit : Plus}
        className="mb-4"
        actions={
          form.id && <Button onClick={() => setForm(emptyForm)}><X className="w-3.5 h-3.5" />Clear</Button>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Channel">
              <Select
                value={form.channelId}
                onChange={(e) => setForm(p => ({ ...p, channelId: e.target.value }))}
                required={form.status === 'sent'}
                disabled={!isAdmin}
              >
                <option value="">Select channel…</option>
                {channelOpts.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
                {form.channelId && !channelOpts.some(c => c.id === form.channelId) && (
                  <option value={form.channelId}>{form.channelId} (current)</option>
                )}
              </Select>
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={(e) => setForm(p => ({ ...p, status: e.target.value }))}
                disabled={!isAdmin}
              >
                <option value="draft">Draft</option>
                <option value="sent">Send now</option>
              </Select>
            </Field>
          </div>
          <Field label="Content">
            <textarea
              rows={4}
              value={form.content}
              onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))}
              disabled={!isAdmin}
              className="w-full bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-purple/60"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <Field label="Embed title">
              <Input value={form.embedTitle} onChange={(e) => setForm(p => ({ ...p, embedTitle: e.target.value }))} disabled={!isAdmin} />
            </Field>
            <Field label="Embed color">
              <input
                type="color"
                value={form.embedColor}
                onChange={(e) => setForm(p => ({ ...p, embedColor: e.target.value }))}
                disabled={!isAdmin}
                className="h-8 w-16 rounded border border-border bg-bg-elevated"
              />
            </Field>
          </div>
          <Field label="Embed description">
            <textarea
              rows={4}
              value={form.embedDescription}
              onChange={(e) => setForm(p => ({ ...p, embedDescription: e.target.value }))}
              disabled={!isAdmin}
              className="w-full bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-purple/60"
            />
          </Field>
          <Field label="Embed footer">
            <Input value={form.embedFooter} onChange={(e) => setForm(p => ({ ...p, embedFooter: e.target.value }))} disabled={!isAdmin} />
          </Field>
          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" disabled={!isAdmin || busy}>
              <Save className="w-3.5 h-3.5" />{busy ? 'Saving…' : form.id ? 'Update' : 'Create'}
            </Button>
            <Button type="button" onClick={() => setForm(emptyForm)} disabled={busy}>
              <X className="w-3.5 h-3.5" />Clear
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="All Messages" icon={MessageSquare}>
        {messages.loading ? <LoadingSkeleton rows={4} /> :
         messages.error ? <Alert type="error">{formatApiError(messages.error)}</Alert> :
         (messages.data?.messages || []).length === 0 ? (
            <p className="text-sm text-text-muted">No messages yet. Create your first one above.</p>
         ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border">
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3">Preview</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Updated</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(messages.data?.messages || []).map(item => (
                  <tr key={item.id} className="border-b border-border-subtle hover:bg-bg-elevated/40">
                    <td className="py-2 pr-3 whitespace-nowrap text-text-secondary">{channelName(item.channel_id)}</td>
                    <td className="py-2 pr-3 max-w-md truncate" title={preview(item)}>{preview(item)}</td>
                    <td className="py-2 pr-3"><StatusBadge status={item.status} /></td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-text-muted">{item.updated_at || item.created_at || '—'}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-1">
                        <Button variant="icon" title="Edit" onClick={() => editItem(item)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {confirmId === item.id ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <span className="text-text-secondary">Delete?</span>
                            <Button variant="danger" disabled={busy} onClick={() => doDelete(item.id)}>Yes</Button>
                            <Button onClick={() => setConfirmId(null)}>No</Button>
                          </span>
                        ) : (
                          <Button variant="iconDanger" title="Delete" disabled={!isAdmin} onClick={() => setConfirmId(item.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
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
