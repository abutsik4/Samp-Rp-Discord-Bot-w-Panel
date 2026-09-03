import { useEffect, useState } from 'react'
import { Bot, Terminal, Cpu, Play, Brain, Calendar, Timer, Save, Trash2, Send, Plus } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { Button, Input, Select, Field, Checkbox } from '../components/ui.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

export default function AutomationPage() {
  const { bot, botKey } = useBot()
  const guildId = bot?.guild_id
  const today = new Date().toISOString().slice(0, 10)

  const [holidaysDate, setHolidaysDate] = useState(today)
  const [holidayForm, setHolidayForm] = useState({ date: today, title: '', note: '' })
  const [localAi, setLocalAi] = useState(null)
  const [localCd, setLocalCd] = useState(null)
  const [actionErr, setActionErr] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const commands = useResource(() => panelApi.commands(botKey, guildId), [botKey, guildId], { enabled: !!botKey })
  const aiSettings = useResource(() => panelApi.aiSettings(botKey, guildId), [botKey, guildId], { enabled: !!botKey && !!guildId })
  const aiModel = useResource(() => panelApi.aiModelStats(botKey), [botKey], { enabled: !!botKey })
  const aiHistory = useResource(() => panelApi.aiHistory(botKey, { guildId, limit: 20 }), [botKey, guildId], { enabled: !!botKey && !!guildId })
  const holidays = useResource(() => panelApi.holidays(botKey, holidaysDate), [botKey, holidaysDate], { enabled: !!botKey })
  const countdown = useResource(() => panelApi.countdownConfig(botKey, guildId), [botKey, guildId], { enabled: !!botKey && !!guildId })
  const sendCh = useResource(() => panelApi.sendableChannels(botKey), [botKey], { enabled: !!botKey })

  useEffect(() => { setLocalAi(null) }, [aiSettings.data])
  useEffect(() => { setLocalCd(null) }, [countdown.data])

  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  const aiEff = localAi ?? aiSettings.data?.settings ?? null
  const cdEff = localCd ?? countdown.data?.config ?? { channel_id: '', template_title: '', template_text: '' }
  const cmdList = commands.data?.commands || []
  const hList = holidays.data?.items || []
  const channels = sendCh.data?.items || []
  const modelStats = aiModel.data?.stats || null

  async function run(fn, label) {
    setBusy(true); setActionErr(''); setActionMsg('')
    try { await fn(); if (label) setActionMsg(`${label} ok.`) }
    catch (e) { setActionErr(formatApiError(e, label ? `${label} failed` : 'Request failed')) }
    finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader icon={Bot} title="Automation & Features" subtitle="Commands, AI engagement, holidays and countdown configuration." />
      {actionErr ? <Alert type="error" className="mb-3">{actionErr}</Alert> : null}
      {actionMsg ? <Alert type="success" className="mb-3">{actionMsg}</Alert> : null}

      <SectionCard title="Slash Commands" icon={Terminal} className="mb-4">
        {commands.loading ? <LoadingSkeleton rows={4} /> : cmdList.length === 0 ? (
          <p className="text-sm text-text-muted">No commands registered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {cmdList.map(cmd => (
                  <tr key={cmd.name} className="border-b border-border-subtle">
                    <td className="py-2 pr-3 whitespace-nowrap"><Terminal className="w-3.5 h-3.5 inline mr-1 text-text-muted" />{cmd.name}</td>
                    <td className="py-2 pr-3 text-text-secondary">{cmd.description}</td>
                    <td className="py-2 w-32">
                      <Checkbox
                        checked={cmd.enabled !== false}
                        onChange={() => run(() => panelApi.toggleCommand(botKey, { commandName: cmd.name, enabled: !(cmd.enabled !== false) }).then(() => commands.refetch()))}
                        label={cmd.enabled !== false ? 'Enabled' : 'Disabled'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="AI Engagement" icon={Cpu}>
          {aiEff ? (
            <div className="space-y-3">
              <Checkbox
                label="AI engagement enabled"
                checked={!!aiEff.enabled}
                onChange={(e) => setLocalAi(p => ({ ...(p || aiSettings.data?.settings || {}), enabled: e.target.checked }))}
              />
              <Field label="Response chance (%)">
                <Input type="number" value={Math.round((aiEff.response_chance || 0) * 100)}
                  onChange={(e) => setLocalAi(p => ({ ...(p || aiSettings.data?.settings || {}), response_chance: Number(e.target.value) / 100 }))} />
              </Field>
              {modelStats ? (
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(modelStats).map(([k, v]) => (
                    <div key={k} className="rounded-md border border-border bg-bg-elevated p-2">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted">{k}</div>
                      <div className="text-sm font-semibold">{String(v)}</div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-text-muted">Model stats: n/a</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="primary" disabled={busy}
                  onClick={() => run(() => panelApi.aiSaveSettings(botKey, { guildId, settings: aiEff }).then(() => { setLocalAi(null); aiSettings.refetch() }), 'Save AI')}>
                  <Save className="w-3.5 h-3.5" />Save
                </Button>
                <Button disabled={busy} onClick={() => run(() => panelApi.aiTest(botKey, { guildId }), 'AI test')}>
                  <Play className="w-3.5 h-3.5" />Test
                </Button>
                <Button disabled={busy} onClick={() => {
                  const channelId = channels[0]?.id
                  if (!channelId) { setActionErr('No sendable channel available'); return }
                  run(() => panelApi.aiTrain(botKey, { channelId, messageLimit: 500 }), 'Train queued')
                }}>
                  <Brain className="w-3.5 h-3.5" />Train
                </Button>
              </div>
            </div>
          ) : aiSettings.loading ? <LoadingSkeleton rows={3} /> : <p className="text-sm text-text-muted">No AI settings.</p>}
        </SectionCard>

        <SectionCard title="AI History" icon={Cpu}>
          {aiHistory.loading ? <LoadingSkeleton rows={4} /> : (aiHistory.data?.history || []).length === 0 ? (
            <p className="text-sm text-text-muted">No history yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-text-muted border-b border-border">
                    <th className="py-2 pr-2">Time</th><th className="py-2 pr-2">Input</th><th className="py-2">Output</th>
                  </tr>
                </thead>
                <tbody>
                  {(aiHistory.data?.history || []).map((row, i) => (
                    <tr key={i} className="border-b border-border-subtle align-top">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-text-muted">{row.timestamp || '—'}</td>
                      <td className="py-1.5 pr-2 max-w-xs truncate" title={row.prompt || row.message}>{row.prompt || row.message || '—'}</td>
                      <td className="py-1.5 max-w-xs truncate" title={row.response || row.output}>{row.response || row.output || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Holidays" icon={Calendar}>
          <Field label="View date" className="mb-3">
            <Input type="date" value={holidaysDate} onChange={(e) => setHolidaysDate(e.target.value)} />
          </Field>
          {holidays.loading ? <LoadingSkeleton rows={3} /> : (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border">
                    <th className="py-2 pr-2">ID</th><th className="py-2 pr-2">Title</th><th className="py-2 pr-2">Note</th><th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {hList.length === 0 ? (
                    <tr><td colSpan={4} className="py-3 text-center text-xs text-text-muted">No holidays on this date.</td></tr>
                  ) : hList.map(item => (
                    <tr key={item.id} className="border-b border-border-subtle">
                      <td className="py-1.5 pr-2 text-xs font-mono text-text-muted">{item.id}</td>
                      <td className="py-1.5 pr-2">{item.title}</td>
                      <td className="py-1.5 pr-2 text-text-secondary">{item.note || '—'}</td>
                      <td className="py-1.5">
                        <Button variant="iconDanger" title="Delete"
                          onClick={() => run(() => panelApi.deleteHoliday(botKey, item.id).then(() => holidays.refetch()), 'Holiday deleted')}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label="Date"><Input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm(p => ({ ...p, date: e.target.value }))} /></Field>
            <Field label="Title"><Input placeholder="Holiday title" value={holidayForm.title} onChange={(e) => setHolidayForm(p => ({ ...p, title: e.target.value }))} /></Field>
            <Field label="Note"><Input placeholder="Optional note" value={holidayForm.note} onChange={(e) => setHolidayForm(p => ({ ...p, note: e.target.value }))} /></Field>
          </div>
          <div className="mt-2">
            <Button variant="primary" disabled={busy || !holidayForm.title}
              onClick={() => run(() => panelApi.addHoliday(botKey, holidayForm).then(() => { setHolidayForm(p => ({ ...p, title: '', note: '' })); holidays.refetch() }), 'Holiday added')}>
              <Plus className="w-3.5 h-3.5" />Add holiday
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Countdown Timer" icon={Timer}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Channel">
              <Select value={cdEff.channel_id || ''} onChange={(e) => setLocalCd({ ...cdEff, channel_id: e.target.value })}>
                <option value="">Select channel</option>
                {channels.map(c => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Title template">
              <Input value={cdEff.template_title || ''} onChange={(e) => setLocalCd({ ...cdEff, template_title: e.target.value })} />
            </Field>
          </div>
          <Field label="Text template" className="mt-3">
            <textarea rows={3} value={cdEff.template_text || ''} onChange={(e) => setLocalCd({ ...cdEff, template_text: e.target.value })}
              className="w-full bg-bg-elevated border border-border rounded-md px-2.5 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent-purple/60" />
          </Field>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button variant="primary" disabled={busy}
              onClick={() => run(() => panelApi.saveCountdownConfig(botKey, { guildId, config: cdEff }).then(() => { setLocalCd(null); countdown.refetch() }), 'Countdown saved')}>
              <Save className="w-3.5 h-3.5" />Save
            </Button>
            <Button disabled={busy} onClick={() => run(() => panelApi.testCountdown(botKey, { guildId }), 'Countdown test sent')}>
              <Send className="w-3.5 h-3.5" />Send test
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
