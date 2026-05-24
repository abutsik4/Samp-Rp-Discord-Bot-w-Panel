import { useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import {
  Shield, Swords, MapPin, TrendingUp, Users, Crown,
  ChevronDown, ChevronUp, Hexagon
} from 'lucide-react'

function TerritoryBar({ t }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border-subtle last:border-0 animate-fade-in">
      <div className="w-2 h-10 rounded-sm" style={{ backgroundColor: t.color || '#6366f1' }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{t.name}</div>
        <div className="text-[11px] text-text-muted">
          Pressure: {(t.pressure ?? 0).toFixed(1)}% · Revenue: ${(t.revenue ?? 0).toLocaleString()}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs font-semibold" style={{ color: t.color || '#6366f1' }}>{t.gangName ?? 'Neutral'}</div>
        <div className="text-[10px] text-text-muted">{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '—'}</div>
      </div>
    </div>
  )
}

export default function GangHQ() {
  const [tab, setTab] = useState('overview')
  const { data: gangs, loading } = useApi('/panel/api/gameplay/gangs')
  const { data: territories } = useApi('/panel/api/gameplay/territories')
  const { data: wars } = useApi('/panel/api/gameplay/wars')

  const tabs = [
    { key: 'overview', label: 'Gangs', icon: Shield },
    { key: 'territories', label: 'Territories', icon: MapPin },
    { key: 'wars', label: 'Wars', icon: Swords }
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gang HQ</h2>
          <p className="text-sm text-text-secondary">Territories, wars, and hierarchy</p>
        </div>
      </div>

      <div className="flex gap-2">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors border ${
              tab === key
                ? 'bg-accent-purple/10 text-accent-purple border-accent-purple/20'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover border-transparent'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="card p-4 animate-fade-in">
          {loading && <p className="text-sm text-text-muted">Loading gangs...</p>}
          {(gangs?.list ?? []).length === 0 && !loading && (
            <p className="text-sm text-text-muted">No gangs found.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(gangs?.list ?? []).map(g => (
              <div key={g.id} className="card-hover border border-border-subtle rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: g.color || '#6366f1' }}
                  >
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{g.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted border border-border">Lv{g.level}</span>
                    </div>
                    <div className="text-xs text-text-muted mt-1">
                      {g.xp} XP · {(g.memberCount ?? 0)} members · ${(g.treasury ?? 0).toLocaleString()} treasury
                    </div>
                    <div className="mt-3 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (g.xp / (g.xpToNext ?? 1)) * 100)}%`, backgroundColor: g.color || '#6366f1' }}
                      />
                    </div>
                    <div className="text-[10px] text-text-muted mt-1">
                      {g.xp} / {g.xpToNext ?? '—'} XP to next level
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'territories' && (
        <div className="card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Territory Map</h3>
            <span className="text-xs text-text-muted">{(territories?.list ?? []).length} zones</span>
          </div>
          {(territories?.list ?? []).map(t => <TerritoryBar key={t.id} t={t} />)}
        </div>
      )}

      {tab === 'wars' && (
        <div className="card p-4 animate-fade-in space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Active Wars</h3>
            <span className="text-xs text-text-muted">{(wars?.active ?? []).length} ongoing</span>
          </div>
          {(wars?.active ?? []).length === 0 && (
            <p className="text-sm text-text-muted">No active wars.</p>
          )}
          {(wars?.active ?? []).map(w => (
            <div key={w.id} className="flex items-center gap-3 border border-border-subtle rounded-lg p-3">
              <div className="w-2 h-10 rounded-sm bg-accent-rose" />
              <div className="flex-1">
                <div className="text-sm font-medium">{w.attackerName} vs {w.defenderName}</div>
                <div className="text-[11px] text-text-muted">Started {new Date(w.startedAt).toLocaleString()} · Stake ${(w.stake ?? 10000).toLocaleString()}</div>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-accent-rose/10 text-accent-rose border border-accent-rose/20">{w.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
