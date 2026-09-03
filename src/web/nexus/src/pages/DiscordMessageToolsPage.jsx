import { useMemo, useState } from 'react'
import { Pencil, Hash, MessageSquare, Download, RefreshCw, Save, X, Trash2, Copy } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { Button, Input, Select, Field, Checkbox } from '../components/ui.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

const emptyForm = {
  channelId: '', messageId: '', content: '',
  embedTitle: '', embedDescription: '', embedFooter: '', embedColor: '#6366f1',
  clearEmbed: false,
}

export default function DiscordMessageToolsPage() {
  const { botKey, user } = useBot()
  const isAdmin = (user?.role || 'admin') === 'admin'
  const [form, setForm] = useState(emptyForm)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const channels = useResource(() => panelApi.discordSendableChannels(botKey), [botKey], { enabled: !!botKey })

  const channelOpts = useMemo(() => (channels.data?.items || []).map(c => ({
    id: c.id || c.channelId || c.value, name: c.name || c.id,
  })), [channels.data])

  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  async function loadMessage(ev) {
    ev.preventDefault()
    if (!form.channelId.trim() || !form.messageId.trim()) {
      setError('Channel ID and message ID are required')
      return
    }
    setBusy(true); setError(''); setResult(null)
    try {
      const data = await panelApi.discordMessage(botKey, { channelId: form.channelId.trim(), messageId: form.messageId.trim() })
      const msg = data?.message
      setForm(p => ({
        ...p,
        content: msg?.content || '',
        embedTitle: msg?.embed?.title || '',
        embedDescription: msg?.embed?.description || '',
        embedFooter: msg?.embed?.footer || '',
        embedColor: msg?.embed?.color || '#6366f1',
        clearEmbed: false,
      }))
      setResult(data || null)
    } catch (e) { setError(formatApiError(e, 'Failed to load Discord message')) }
    finally { setBusy(false) }
  }

  async function saveEdit(ev) {
    ev.preventDefault()
    if (!isAdmin) return
    setBusy(true); setError(''); setResult(null)
    const hasEmbed = form.embedTitle.trim() || form.embedDescription.trim() || form.embedFooter.trim()
    const payload = {
      channelId: form.channelId.trim(),
      messageId: form.messageId.trim(),
      content: form.content,
      embed: form.clearEmbed
        ? { clear: true }
        : hasEmbed
        ? { title: form.embedTitle, description: form.embedDescription, footer: form.embedFooter, color: form.embedColor }
        : null,
    }
    try {
      const data = await panelApi.editDiscordMessage(botKey, payload)
      setResult(data || null)
    } catch (e) { setError(formatApiError(e, 'Failed to edit Discord message')) }
    finally { setBusy(false) }
  }

  const loaded = result?.message != null

  return (
    <div>
      <PageHeader icon={Pencil} title="Discord Message Tools" subtitle="Load and edit existing bot messages by ID." />
      {error ? <Alert type="error" className="mb-3">{error}</Alert> : null}

      <SectionCard title="Select Message" icon={Hash} description="Choose a channel and enter the message ID to load an existing bot message." className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Channel">
            <Select value={form.channelId} onChange={(e) => setForm(p => ({ ...p, channelId: e.target.value }))} disabled={channels.loading}>
              <option value="">Select sendable channel…</option>
              {channelOpts.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Message ID">
            <Input value={form.messageId} onChange={(e) => setForm(p => ({ ...p, messageId: e.target.value }))} placeholder="Discord message ID" />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="primary" onClick={loadMessage} disabled={busy}><Download className="w-3.5 h-3.5" />{busy ? 'Loading…' : 'Load message'}</Button>
          <Button onClick={channels.refetch} disabled={channels.loading}><RefreshCw className="w-3.5 h-3.5" />Refresh channels</Button>
        </div>
      </SectionCard>

      {(loaded || form.content || form.embedTitle || form.embedDescription || form.embedFooter) && (
        <SectionCard title="Edit Message" icon={Pencil} className="mb-4">
          <form onSubmit={saveEdit} className="space-y-3">
            <Field label="Content">
              <textarea rows={4} value={form.content} onChange={(e) => setForm(p => ({ ...p, content: e.target.value }))} disabled={!isAdmin}
                className="w-full bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-purple/60" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <Field label="Embed title">
                <Input value={form.embedTitle} onChange={(e) => setForm(p => ({ ...p, embedTitle: e.target.value, clearEmbed: false }))} disabled={!isAdmin} />
              </Field>
              <Field label="Embed color">
                <input type="color" value={form.embedColor} onChange={(e) => setForm(p => ({ ...p, embedColor: e.target.value, clearEmbed: false }))} disabled={!isAdmin}
                  className="h-8 w-16 rounded border border-border bg-bg-elevated" />
              </Field>
            </div>
            <Field label="Embed description">
              <textarea rows={4} value={form.embedDescription} onChange={(e) => setForm(p => ({ ...p, embedDescription: e.target.value, clearEmbed: false }))} disabled={!isAdmin}
                className="w-full bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-purple/60" />
            </Field>
            <Field label="Embed footer">
              <Input value={form.embedFooter} onChange={(e) => setForm(p => ({ ...p, embedFooter: e.target.value, clearEmbed: false }))} disabled={!isAdmin} />
            </Field>
            {(form.embedTitle || form.embedDescription || form.embedFooter) && (
              <div className="rounded-md border-l-4 bg-bg-elevated p-3" style={{ borderLeftColor: form.embedColor || '#6366f1' }}>
                {form.embedTitle && <div className="font-semibold mb-1">{form.embedTitle}</div>}
                {form.embedDescription && <p className="text-sm text-text-secondary whitespace-pre-wrap">{form.embedDescription}</p>}
                {form.embedFooter && <div className="text-xs text-text-muted mt-2">{form.embedFooter}</div>}
              </div>
            )}
            <Checkbox label="Clear embed when saving" checked={form.clearEmbed} onChange={(e) => setForm(p => ({ ...p, clearEmbed: e.target.checked }))} disabled={!isAdmin} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={!isAdmin || busy}><Save className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Save edit'}</Button>
              <Button onClick={() => setForm(emptyForm)} disabled={busy}><X className="w-3.5 h-3.5" />Reset</Button>
            </div>
          </form>
        </SectionCard>
      )}

      {result && (
        <SectionCard title="Result" icon={Copy}>
          <div className="relative">
            <pre className="text-xs bg-bg-elevated border border-border rounded-md p-3 overflow-x-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
            <Button variant="icon" className="absolute top-2 right-2"
              onClick={() => navigator.clipboard?.writeText(JSON.stringify(result, null, 2))}
              title="Copy to clipboard">
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
