import { useApi } from '../hooks/useApi.js'
import {
  DollarSign, Sword, MapPin
} from 'lucide-react'

function Kpi({ icon: Icon, label, value, sub, tone = 'purple' }) {
  const toneMap = {
    purple: 'text-accent-purple bg-accent-purple/10 border-accent-purple/20',
    cyan: 'text-accent-cyan bg-accent-cyan/10 border-accent-cyan/20',
    amber: 'text-accent-amber bg-accent-amber/10 border-accent-amber/20',
    rose: 'text-accent-rose bg-accent-rose/10 border-accent-rose/20'
  }
  return (
    <div className="card card-hover p-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn("w-8 h-8 rounded-md flex items-center justify-center border", toneMap[tone])}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value ?? '—'}</div>
      {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
    </div>
  )
}

function cn(...a) { return a.filter(Boolean).join(' ') }

export default function Dashboard() {
  const { data: gangs } = useApi('/panel/api/gameplay/gangs')
  const { data: eco } = useApi('/panel/api/gameplay/ledger-summary')

  const kpis = [
    { icon: DollarSign, label: 'Economy Volume', value: eco?.totalVolume ? `$${eco.totalVolume.toLocaleString()}` : '—', sub: 'All time', tone: 'purple' },
    { icon: Sword, label: 'Gang Wars', value: gangs?.wars?.active ?? 0, sub: 'Active now', tone: 'rose' },
    { icon: MapPin, label: 'Territories', value: gangs?.territories?.total ?? 0, sub: 'Claimed', tone: 'cyan' }
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <p className="text-sm text-text-secondary">Real-time SAMP-Life universe overview</p>
        </div>
        <div className="text-xs text-text-muted">
          {new Date().toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {kpis.map((k, i) => <Kpi key={i} {...k} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Top Gangs</h3>
            <a href="#/gang-hq" className="text-xs text-accent-purple hover:underline">View all →</a>
          </div>
          <div className="space-y-2">
            {(gangs?.top ?? []).length === 0 && (
              <p className="text-sm text-text-muted">No gangs data yet.</p>
            )}
            {(gangs?.top ?? []).map((g, i) => (
              <div key={g.id} className="flex items-center gap-3 py-2 border-b border-border-subtle last:border-0">
                <span className="w-6 text-center text-xs font-bold text-text-muted">#{i + 1}</span>
                <div className="w-2 h-8 rounded-sm" style={{ backgroundColor: g.color || '#6366f1' }} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{g.name}</div>
                  <div className="text-[11px] text-text-muted">Lv{g.level} · {g.xp} XP · ${(g.treasury ?? 0).toLocaleString()}</div>
                </div>
                <span className="text-xs text-text-secondary">{g.territories} territories</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recent Heists</h3>
            <span className="text-xs text-text-muted">Last 24h</span>
          </div>
          <div className="space-y-2">
            {(eco?.recentHeists ?? []).length === 0 && (
              <p className="text-sm text-text-muted">No heists recorded.</p>
            )}
            {(eco?.recentHeists ?? []).map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                <div>
                  <div className="text-sm">{h.gangName ?? 'Unknown'}</div>
                  <div className="text-[11px] text-text-muted">{new Date(h.createdAt).toLocaleString()}</div>
                </div>
                <span className="text-sm font-medium text-accent-green">+${(h.payout ?? 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
