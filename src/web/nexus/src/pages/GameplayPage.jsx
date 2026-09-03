import { useState } from 'react'
import {
  Gamepad2, TrendingUp, Award, Zap, Star, Users,
  HelpCircle, Target, Radio, Map as MapIcon, Save, Trash2, Plus, RefreshCw,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { Button, Input, Select, Field, Checkbox } from '../components/ui.jsx'
import { LoadingSkeleton } from '../components/LoadingSkeleton.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { panelApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

const TABS = [
  { key: 'levels', icon: TrendingUp, label: 'Levels' },
  { key: 'badges', icon: Award, label: 'Badges' },
  { key: 'perks', icon: Zap, label: 'Perks' },
  { key: 'boosts', icon: Star, label: 'XP Boosts' },
  { key: 'roles', icon: Users, label: 'Roles' },
  { key: 'trivia', icon: HelpCircle, label: 'Trivia' },
  { key: 'wanted', icon: Target, label: 'Wanted' },
  { key: 'radio', icon: Radio, label: 'Radio' },
  { key: 'samplife', icon: MapIcon, label: 'SA-MP Life' },
]

export default function GameplayPage() {
  const { bot, botKey } = useBot()
  const [tab, setTab] = useState('levels')

  if (!botKey) return <Alert type="warning">No bot selected.</Alert>

  return (
    <div>
      <PageHeader icon={Gamepad2} title="Gameplay Systems" subtitle="Manage levels, badges, perks, and in-game features." />
      <div className="flex flex-wrap gap-1 mb-4 border-b border-border">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${tab === key ? 'border-accent-purple text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>
      {tab === 'levels' && <LevelsTab botKey={botKey} />}
      {tab === 'badges' && <BadgesTab botKey={botKey} />}
      {tab === 'perks' && <PerksTab botKey={botKey} />}
      {(tab === 'boosts' || tab === 'roles') && <BoostsTab botKey={botKey} guildId={bot?.guild_id} />}
      {tab === 'trivia' && <TriviaTab botKey={botKey} />}
      {tab === 'wanted' && <WantedTab botKey={botKey} />}
      {tab === 'radio' && <RadioTab botKey={botKey} />}
      {tab === 'samplife' && <SampLifeTab botKey={botKey} />}
    </div>
  )
}

// ─── Levels ────────────────────────────────────────────────
function LevelsTab({ botKey }) {
  const r = useResource(() => panelApi.gameplayLevels(botKey, { limit: 100 }), [botKey])
  const [uid, setUid] = useState(''); const [xp, setXp] = useState(0)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function setLevel() {
    setBusy(true); setErr('')
    try { await panelApi.setGameplayLevel(botKey, { userId: uid, xp: Number(xp) }); r.refetch() }
    catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      {err && <Alert type="error" className="mb-3">{err}</Alert>}
      {r.error && <Alert type="error" className="mb-3">{formatApiError(r.error)}</Alert>}
      <SectionCard title="Set User XP" icon={TrendingUp} className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
          <Field label="User ID"><Input value={uid} onChange={(e) => setUid(e.target.value)} /></Field>
          <Field label="XP"><Input type="number" value={xp} onChange={(e) => setXp(e.target.value)} /></Field>
          <Button variant="primary" onClick={setLevel} disabled={!uid || busy}><Save className="w-3.5 h-3.5" />Set</Button>
        </div>
      </SectionCard>
      <SectionCard title="Top Players" icon={TrendingUp}>
        {r.loading ? <LoadingSkeleton rows={6} /> : (
          <DataTable cols={['#', 'User', 'XP', 'Level']} rows={(r.data?.items || []).map((u, i) => [i + 1, u.username || u.user_id, u.xp ?? 0, u.level ?? 0])} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── Badges ────────────────────────────────────────────────
function BadgesTab({ botKey }) {
  const users = useResource(() => panelApi.badgeUsers(botKey, { limit: 100 }), [botKey])
  const defs = useResource(() => panelApi.badgeDefinitions(botKey), [botKey])
  const [grantUid, setGrantUid] = useState(''); const [grantBadge, setGrantBadge] = useState('')
  const [edit, setEdit] = useState({ id: '', type: 'messages', threshold: 0, name: '', emoji: '🏅', description: '', enabled: true, sort_order: 0 })
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  async function run(fn, msg) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); if (msg) setOk(msg); users.refetch(); defs.refetch() }
    catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      {err && <Alert type="error" className="mb-3">{err}</Alert>}
      {ok && <Alert type="success" className="mb-3">{ok}</Alert>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Grant Badge" icon={Award}>
          <div className="space-y-2">
            <Field label="User ID"><Input value={grantUid} onChange={(e) => setGrantUid(e.target.value)} /></Field>
            <Field label="Badge">
              <Select value={grantBadge} onChange={(e) => setGrantBadge(e.target.value)}>
                <option value="">Select badge…</option>
                {(defs.data?.items || []).map(b => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
              </Select>
            </Field>
            <Button variant="primary" disabled={!grantUid || !grantBadge || busy}
              onClick={() => run(() => panelApi.grantBadge(botKey, grantUid, { badgeId: grantBadge }), 'Badge granted.')}>
              <Plus className="w-3.5 h-3.5" />Grant
            </Button>
          </div>
        </SectionCard>
        <SectionCard title="Definition Editor" icon={Award} actions={
          <Button onClick={() => run(() => panelApi.seedBadgeDefinitions(botKey), 'Seeded defaults.')} disabled={busy}>
            <RefreshCw className="w-3.5 h-3.5" />Seed defaults
          </Button>
        }>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ID"><Input value={edit.id} onChange={(e) => setEdit(p => ({ ...p, id: e.target.value }))} /></Field>
            <Field label="Name"><Input value={edit.name} onChange={(e) => setEdit(p => ({ ...p, name: e.target.value }))} /></Field>
            <Field label="Emoji"><Input value={edit.emoji} onChange={(e) => setEdit(p => ({ ...p, emoji: e.target.value }))} /></Field>
            <Field label="Type">
              <Select value={edit.type} onChange={(e) => setEdit(p => ({ ...p, type: e.target.value }))}>
                <option value="messages">messages</option>
                <option value="manual">manual</option>
                <option value="trivia">trivia</option>
              </Select>
            </Field>
            <Field label="Threshold"><Input type="number" value={edit.threshold} onChange={(e) => setEdit(p => ({ ...p, threshold: Number(e.target.value) }))} /></Field>
            <Field label="Sort order"><Input type="number" value={edit.sort_order} onChange={(e) => setEdit(p => ({ ...p, sort_order: Number(e.target.value) }))} /></Field>
          </div>
          <Field label="Description" className="mt-2"><Input value={edit.description} onChange={(e) => setEdit(p => ({ ...p, description: e.target.value }))} /></Field>
          <div className="mt-2 flex items-center gap-2">
            <Checkbox label="Enabled" checked={edit.enabled} onChange={(e) => setEdit(p => ({ ...p, enabled: e.target.checked }))} />
            <Button variant="primary" disabled={busy || !edit.id || !edit.name}
              onClick={() => run(() => panelApi.upsertBadgeDefinition(botKey, edit), 'Saved.')}>
              <Save className="w-3.5 h-3.5" />Save
            </Button>
          </div>
        </SectionCard>
      </div>
      <SectionCard title="Badge Definitions" icon={Award} className="mb-4">
        {defs.loading ? <LoadingSkeleton rows={4} /> : (
          <DataTable cols={['Emoji', 'ID', 'Name', 'Type', 'Threshold', 'Enabled', '']}
            rows={(defs.data?.items || []).map(b => [
              b.emoji, b.id, b.name, b.type, b.threshold, b.enabled ? '✓' : '—',
              <Button key="d" variant="iconDanger" onClick={() => run(() => panelApi.deleteBadgeDefinition(botKey, b.id))}><Trash2 className="w-3.5 h-3.5" /></Button>,
            ])} />
        )}
      </SectionCard>
      <SectionCard title="User Badges" icon={Award}>
        {users.loading ? <LoadingSkeleton rows={4} /> : (
          <DataTable cols={['User', 'Badges']}
            rows={(users.data?.items || []).map(u => [u.username || u.user_id, (u.badges || []).map(b => b.badge_id).join(', ') || '—'])} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── Perks ────────────────────────────────────────────────
function PerksTab({ botKey }) {
  const rules = useResource(() => panelApi.perkRules(botKey), [botKey])
  const [form, setForm] = useState({ trigger_type: 'badge', trigger_value: '', action_type: 'grant_role', action_value: '', enabled: true })
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  async function run(fn, msg) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); if (msg) setOk(msg); rules.refetch() }
    catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      {err && <Alert type="error" className="mb-3">{err}</Alert>}
      {ok && <Alert type="success" className="mb-3">{ok}</Alert>}
      <SectionCard title="Add Perk Rule" icon={Zap} actions={
        <Button onClick={() => run(() => panelApi.reconcilePerks(botKey, { limit: 200 }), 'Reconciled.')} disabled={busy}>
          <RefreshCw className="w-3.5 h-3.5" />Reconcile
        </Button>
      } className="mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Field label="Trigger type"><Select value={form.trigger_type} onChange={(e) => setForm(p => ({ ...p, trigger_type: e.target.value }))}>
            <option value="badge">badge</option><option value="level">level</option>
          </Select></Field>
          <Field label="Trigger value"><Input value={form.trigger_value} onChange={(e) => setForm(p => ({ ...p, trigger_value: e.target.value }))} /></Field>
          <Field label="Action"><Select value={form.action_type} onChange={(e) => setForm(p => ({ ...p, action_type: e.target.value }))}>
            <option value="grant_role">grant_role</option>
          </Select></Field>
          <Field label="Action value"><Input value={form.action_value} onChange={(e) => setForm(p => ({ ...p, action_value: e.target.value }))} /></Field>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Checkbox label="Enabled" checked={form.enabled} onChange={(e) => setForm(p => ({ ...p, enabled: e.target.checked }))} />
          <Button variant="primary" onClick={() => run(() => panelApi.upsertPerkRule(botKey, form), 'Rule saved.')} disabled={busy}>
            <Save className="w-3.5 h-3.5" />Save
          </Button>
        </div>
      </SectionCard>
      <SectionCard title="Perk Rules" icon={Zap}>
        {rules.loading ? <LoadingSkeleton rows={4} /> : (
          <DataTable cols={['ID', 'Trigger', 'Action', 'Enabled', '']}
            rows={(rules.data?.items || []).map(r => [
              r.id, `${r.trigger_type}=${r.trigger_value}`, `${r.action_type}=${r.action_value}`, r.enabled ? '✓' : '—',
              <Button key="d" variant="iconDanger" onClick={() => run(() => panelApi.deletePerkRule(botKey, r.id))}><Trash2 className="w-3.5 h-3.5" /></Button>,
            ])} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── Boosts + Roles ────────────────────────────────────────
function BoostsTab({ botKey, guildId }) {
  const mults = useResource(() => panelApi.xpMultipliers(botKey), [botKey])
  const roles = useResource(() => panelApi.roles(botKey, guildId), [botKey, guildId], { enabled: !!guildId })
  const [form, setForm] = useState({ roleId: '', multiplier: 1.0 })
  const [roleForm, setRoleForm] = useState({ name: '', mentionable: false, hoist: false })
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)
  async function run(fn, msg, refetchRoles) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); if (msg) setOk(msg); mults.refetch(); if (refetchRoles) roles.refetch() }
    catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      {err && <Alert type="error" className="mb-3">{err}</Alert>}
      {ok && <Alert type="success" className="mb-3">{ok}</Alert>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Set XP Multiplier" icon={Star}>
          <div className="space-y-2">
            <Field label="Role">
              <Select value={form.roleId} onChange={(e) => setForm(p => ({ ...p, roleId: e.target.value }))}>
                <option value="">Select role…</option>
                {(roles.data?.roles || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Multiplier"><Input type="number" step="0.1" value={form.multiplier} onChange={(e) => setForm(p => ({ ...p, multiplier: Number(e.target.value) }))} /></Field>
            <Button variant="primary" disabled={!form.roleId || busy}
              onClick={() => run(() => panelApi.upsertXpMultiplier(botKey, form), 'Saved.')}>
              <Save className="w-3.5 h-3.5" />Save
            </Button>
          </div>
        </SectionCard>
        <SectionCard title="Create Role" icon={Users}>
          <div className="space-y-2">
            <Field label="Name"><Input value={roleForm.name} onChange={(e) => setRoleForm(p => ({ ...p, name: e.target.value }))} /></Field>
            <Checkbox label="Mentionable" checked={roleForm.mentionable} onChange={(e) => setRoleForm(p => ({ ...p, mentionable: e.target.checked }))} />
            <Checkbox label="Hoisted" checked={roleForm.hoist} onChange={(e) => setRoleForm(p => ({ ...p, hoist: e.target.checked }))} />
            <Button variant="primary" disabled={!roleForm.name || !guildId || busy}
              onClick={() => run(() => panelApi.createRole(botKey, { guildId, ...roleForm }), `Role "${roleForm.name}" created.`, true)}>
              <Plus className="w-3.5 h-3.5" />Create role
            </Button>
          </div>
        </SectionCard>
      </div>
      <SectionCard title="XP Multipliers" icon={Star}>
        {mults.loading ? <LoadingSkeleton rows={4} /> : (
          <DataTable cols={['Role ID', 'Role Name', 'Multiplier', '']}
            rows={(mults.data?.items || []).map(m => {
              const r = (roles.data?.roles || []).find(x => x.id === m.role_id || x.id === m.roleId)
              return [m.role_id || m.roleId, r?.name || '—', `${m.multiplier}×`,
                <Button key="d" variant="iconDanger" onClick={() => run(() => panelApi.deleteXpMultiplier(botKey, m.role_id || m.roleId))}><Trash2 className="w-3.5 h-3.5" /></Button>]
            })} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── Trivia ────────────────────────────────────────────────
function TriviaTab({ botKey }) {
  const r = useResource(() => panelApi.triviaLeaderboard(botKey, { limit: 100 }), [botKey])
  const [uid, setUid] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function reset() {
    setBusy(true); setErr('')
    try { await panelApi.resetTriviaUser(botKey, { userId: uid }); r.refetch() }
    catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      {err && <Alert type="error" className="mb-3">{err}</Alert>}
      <SectionCard title="Reset Trivia User" icon={HelpCircle} className="mb-4">
        <div className="flex gap-2 items-end">
          <Field label="User ID" className="flex-1"><Input value={uid} onChange={(e) => setUid(e.target.value)} /></Field>
          <Button variant="danger" onClick={reset} disabled={!uid || busy}><RefreshCw className="w-3.5 h-3.5" />Reset</Button>
        </div>
      </SectionCard>
      <SectionCard title="Trivia Leaderboard" icon={HelpCircle}>
        {r.loading ? <LoadingSkeleton rows={4} /> : (
          <DataTable cols={['#', 'User', 'Correct', 'Streak']}
            rows={(r.data?.items || []).map((u, i) => [i + 1, u.username || u.user_id, u.correct ?? 0, u.streak ?? 0])} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── Wanted ────────────────────────────────────────────────
function WantedTab({ botKey }) {
  const r = useResource(() => panelApi.wantedList(botKey, { limit: 100 }), [botKey])
  const [uid, setUid] = useState(''); const [stars, setStars] = useState(0)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function run(fn) {
    setBusy(true); setErr('')
    try { await fn(); r.refetch() } catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      {err && <Alert type="error" className="mb-3">{err}</Alert>}
      <SectionCard title="Set Wanted Stars" icon={Target} className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
          <Field label="User ID"><Input value={uid} onChange={(e) => setUid(e.target.value)} /></Field>
          <Field label="Stars"><Input type="number" min={0} max={6} value={stars} onChange={(e) => setStars(Number(e.target.value))} /></Field>
          <Button variant="primary" disabled={!uid || busy} onClick={() => run(() => panelApi.setWanted(botKey, { userId: uid, stars }))}>
            <Save className="w-3.5 h-3.5" />Set
          </Button>
          <Button variant="danger" disabled={!uid || busy} onClick={() => run(() => panelApi.clearWanted(botKey, { userId: uid }))}>
            Clear
          </Button>
        </div>
      </SectionCard>
      <SectionCard title="Most Wanted" icon={Target}>
        {r.loading ? <LoadingSkeleton rows={4} /> : (
          <DataTable cols={['#', 'User', 'Stars']}
            rows={(r.data?.items || []).map((u, i) => [i + 1, u.username || u.user_id, '⭐'.repeat(u.stars || 0)])} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── Radio ────────────────────────────────────────────────
function RadioTab({ botKey }) {
  const r = useResource(() => panelApi.radioResults(botKey), [botKey])
  const [uid, setUid] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function reset() {
    setBusy(true); setErr('')
    try { await panelApi.resetRadio(botKey, { userId: uid || undefined }); r.refetch() }
    catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      {err && <Alert type="error" className="mb-3">{err}</Alert>}
      <SectionCard title="Reset Radio Votes" icon={Radio} className="mb-4">
        <div className="flex gap-2 items-end">
          <Field label="User ID (empty = all)" className="flex-1"><Input value={uid} onChange={(e) => setUid(e.target.value)} /></Field>
          <Button variant="danger" onClick={reset} disabled={busy}><RefreshCw className="w-3.5 h-3.5" />Reset</Button>
        </div>
      </SectionCard>
      <SectionCard title="Radio Vote Results" icon={Radio}>
        <p className="text-xs text-text-muted mb-2">Total votes: {r.data?.totalVotes || 0}</p>
        {r.loading ? <LoadingSkeleton rows={4} /> : (
          <DataTable cols={['Station', 'Votes']}
            rows={(r.data?.items || []).map(s => [s.name || s.id, s.votes ?? 0])} />
        )}
      </SectionCard>
    </div>
  )
}

// ─── SA-MP Life ───────────────────────────────────────────
function SampLifeTab({ botKey }) {
  const users = useResource(() => panelApi.sampLifeUsers(botKey, { limit: 100 }), [botKey])
  const liveOps = useResource(() => panelApi.sampLifeLiveOps(botKey), [botKey])
  const presets = useResource(() => panelApi.sampLifeLiveOpsPresets(botKey), [botKey])
  const territories = useResource(() => panelApi.sampLifeTerritories(botKey), [botKey])
  const business = useResource(() => panelApi.sampLifeBusinessOverview(botKey), [botKey])
  const truck = useResource(() => panelApi.sampLifeTruckOverview(botKey), [botKey])
  const gang = useResource(() => panelApi.sampLifeGangOverview(botKey), [botKey])
  const [localOps, setLocalOps] = useState(null)
  const [uid, setUid] = useState('')
  const [adjust, setAdjust] = useState({ moneyDelta: 0, repDelta: 0, jailMinutes: 0 })
  const [details, setDetails] = useState(null)
  const [err, setErr] = useState(''); const [ok, setOk] = useState(''); const [busy, setBusy] = useState(false)

  const ops = localOps ?? liveOps.data?.config ?? {
    active_event_name: '', active_event_message: '',
    business_income_multiplier: 1, business_run_multiplier: 1,
    gang_support_cost_multiplier: 1, rep_multiplier: 1,
  }
  async function run(fn, msg, refetchAll) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); if (msg) setOk(msg); if (refetchAll) { liveOps.refetch(); presets.refetch(); users.refetch() } }
    catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }
  async function inspect() {
    if (!uid) return
    setBusy(true); setErr(''); setDetails(null)
    try { setDetails(await panelApi.sampLifeUser(botKey, uid)) }
    catch (e) { setErr(formatApiError(e)) } finally { setBusy(false) }
  }

  return (
    <div>
      {err && <Alert type="error" className="mb-3">{err}</Alert>}
      {ok && <Alert type="success" className="mb-3">{ok}</Alert>}

      <SectionCard title="Live Ops" icon={Zap} className="mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Active event name"><Input value={ops.active_event_name || ''} onChange={(e) => setLocalOps({ ...ops, active_event_name: e.target.value })} /></Field>
          <Field label="Active event message"><Input value={ops.active_event_message || ''} onChange={(e) => setLocalOps({ ...ops, active_event_message: e.target.value })} /></Field>
          <Field label="Business income ×"><Input type="number" step="0.1" value={ops.business_income_multiplier} onChange={(e) => setLocalOps({ ...ops, business_income_multiplier: Number(e.target.value) })} /></Field>
          <Field label="Business run ×"><Input type="number" step="0.1" value={ops.business_run_multiplier} onChange={(e) => setLocalOps({ ...ops, business_run_multiplier: Number(e.target.value) })} /></Field>
          <Field label="Gang support cost ×"><Input type="number" step="0.1" value={ops.gang_support_cost_multiplier} onChange={(e) => setLocalOps({ ...ops, gang_support_cost_multiplier: Number(e.target.value) })} /></Field>
          <Field label="Rep ×"><Input type="number" step="0.1" value={ops.rep_multiplier} onChange={(e) => setLocalOps({ ...ops, rep_multiplier: Number(e.target.value) })} /></Field>
        </div>
        <Button variant="primary" className="mt-3" onClick={() => run(() => panelApi.saveSampLifeLiveOps(botKey, ops).then(() => setLocalOps(null)), 'Saved.', true)} disabled={busy}>
          <Save className="w-3.5 h-3.5" />Save live ops
        </Button>
      </SectionCard>

      <SectionCard title="Presets" icon={Star} className="mb-4">
        {presets.loading ? <LoadingSkeleton rows={3} /> : (
          <DataTable cols={['Name', 'Type', '']}
            rows={(presets.data?.items || []).map(p => [
              p.name, p.preset_type,
              <span key="a" className="flex gap-1">
                <Button onClick={() => run(() => panelApi.applySampLifeLiveOpsPreset(botKey, p.id), 'Applied.', true)}>Apply</Button>
                <Button variant="iconDanger" onClick={() => run(() => panelApi.deleteSampLifeLiveOpsPreset(botKey, p.id), 'Deleted.', true)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </span>,
            ])} />
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Inspect / Adjust User" icon={Users}>
          <div className="space-y-2">
            <div className="flex gap-2 items-end">
              <Field label="User ID" className="flex-1"><Input value={uid} onChange={(e) => setUid(e.target.value)} /></Field>
              <Button onClick={inspect} disabled={!uid || busy}>Inspect</Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="$ delta"><Input type="number" value={adjust.moneyDelta} onChange={(e) => setAdjust(p => ({ ...p, moneyDelta: Number(e.target.value) }))} /></Field>
              <Field label="Rep delta"><Input type="number" value={adjust.repDelta} onChange={(e) => setAdjust(p => ({ ...p, repDelta: Number(e.target.value) }))} /></Field>
              <Field label="Jail mins"><Input type="number" value={adjust.jailMinutes} onChange={(e) => setAdjust(p => ({ ...p, jailMinutes: Number(e.target.value) }))} /></Field>
            </div>
            <Button variant="primary" disabled={!uid || busy}
              onClick={() => run(() => panelApi.adjustSampLifeUser(botKey, uid, adjust), 'Adjusted.', true)}>
              <Save className="w-3.5 h-3.5" />Apply adjustment
            </Button>
            {details && (
              <pre className="text-xs bg-bg-elevated border border-border rounded-md p-2 overflow-x-auto max-h-64">{JSON.stringify(details, null, 2)}</pre>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Top Users" icon={Users}>
          {users.loading ? <LoadingSkeleton rows={4} /> : (
            <DataTable cols={['User', 'Money', 'Rep']}
              rows={(users.data?.items || []).slice(0, 20).map(u => [u.username || u.user_id, `$${(u.money ?? 0).toLocaleString?.() ?? u.money ?? 0}`, u.rep ?? 0])} />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Business Overview" icon={MapIcon}>
          {business.loading ? <LoadingSkeleton rows={3} /> : (
            <pre className="text-xs bg-bg-elevated border border-border rounded-md p-2 overflow-x-auto max-h-64">{JSON.stringify(business.data?.summary || {}, null, 2)}</pre>
          )}
        </SectionCard>
        <SectionCard title="Truck Overview" icon={MapIcon}>
          {truck.loading ? <LoadingSkeleton rows={3} /> : (
            <pre className="text-xs bg-bg-elevated border border-border rounded-md p-2 overflow-x-auto max-h-64">{JSON.stringify(truck.data?.summary || {}, null, 2)}</pre>
          )}
        </SectionCard>
        <SectionCard title="Gangs">
          {gang.loading ? <LoadingSkeleton rows={3} /> : (
            <DataTable cols={['Gang', 'Members', 'Territories']}
              rows={(gang.data?.items || []).map(g => [g.name || g.id, g.members ?? 0, g.territories ?? 0])} />
          )}
        </SectionCard>
        <SectionCard title="Territories">
          {territories.loading ? <LoadingSkeleton rows={3} /> : (
            <DataTable cols={['Name', 'Owner']}
              rows={(territories.data?.items || []).map(t => [t.name || t.id, t.owner_gang || t.owner || '—'])} />
          )}
        </SectionCard>
      </div>
    </div>
  )
}

// ─── Reusable DataTable ──────────────────────────────────
function DataTable({ cols, rows }) {
  if (!rows || rows.length === 0) return <p className="text-sm text-text-muted">No data.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border">
            {cols.map((c, i) => <th key={i} className="py-2 pr-3">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border-subtle hover:bg-bg-elevated/40">
              {row.map((cell, j) => <td key={j} className="py-1.5 pr-3 align-top">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
