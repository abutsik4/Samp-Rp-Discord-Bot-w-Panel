import { useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import {
  Dice5, Trophy, TrendingUp, History, ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'

function GameCard({ title, icon: Icon, players, maxWin, color }) {
  return (
    <div className="card p-4 card-hover animate-fade-in">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '20', color }}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-text-muted">{(players ?? 0)} playing now</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">Max win</span>
        <span className="font-medium">${(maxWin ?? 0).toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function Casino() {
  const [tab, setTab] = useState('games')
  const { data: games } = useApi('/panel/api/gameplay/casino-games')
  const { data: leaderboard } = useApi('/panel/api/gameplay/casino-leaderboard')
  const { data: history } = useApi('/panel/api/gameplay/casino-history')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Casino</h2>
          <p className="text-sm text-text-secondary">Games, jackpots, and high rollers</p>
        </div>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'games', label: 'Games' },
          { key: 'leaderboard', label: 'Leaderboard' },
          { key: 'history', label: 'History' }
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 rounded-md text-sm border transition-colors ${
              tab === key
                ? 'bg-accent-purple/10 text-accent-purple border-accent-purple/20'
                : 'text-text-secondary hover:text-text-primary border-transparent hover:bg-bg-hover'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'games' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(games?.list ?? []).length === 0 && (
            <>
              <GameCard title="Roulette" icon={Dice5} players={12} maxWin={50000} color="#f59e0b" />
              <GameCard title="Slots" icon={Dice5} players={34} maxWin={250000} color="#f43f5e" />
              <GameCard title="Blackjack" icon={Dice5} players={8} maxWin={15000} color="#6366f1" />
              <GameCard title="Craps" icon={Dice5} players={5} maxWin={10000} color="#06b6d4" />
              <GameCard title="Horse Racing" icon={Dice5} players={0} maxWin={5000} color="#16a34a" />
            </>
          )}
          {(games?.list ?? []).map(g => <GameCard key={g.id} {...g} />)}
        </div>
      )}

      {tab === 'leaderboard' && (
        <div className="card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-accent-amber" />
            <h3 className="font-semibold">High Rollers</h3>
          </div>
          {(leaderboard?.list ?? []).length === 0 && (
            <p className="text-sm text-text-muted">No casino data yet.</p>
          )}
          {(leaderboard?.list ?? []).map((p, i) => (
            <div key={p.userId} className="flex items-center gap-3 py-2 border-b border-border-subtle last:border-0">
              <span className="w-6 text-center text-sm font-bold">{i + 1}</span>
              <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-xs font-bold">
                {p.avatar ?? '?'}
              </div>
              <div className="flex-1">
                <div className="text-sm">{p.userTag}</div>
                <div className="text-[11px] text-text-muted">{(p.wins ?? 0)} wins · {(p.losses ?? 0)} losses</div>
              </div>
              <span className="text-sm font-semibold">${(p.profit ?? 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'history' && (
        <div className="card p-4 animate-fade-in">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-text-muted" />
            <h3 className="font-semibold">Recent Bets</h3>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-auto pr-1">
            {(history?.list ?? []).length === 0 && (
              <p className="text-sm text-text-muted">No bet history.</p>
            )}
            {(history?.list ?? []).map(h => (
              <div key={h.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                <div>
                  <div className="text-sm">{h.userTag} · {h.game}</div>
                  <div className="text-[11px] text-text-muted">{new Date(h.createdAt).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">${(h.amount ?? 0).toLocaleString()}</div>
                  <div className={`text-xs flex items-center gap-1 ${(h.result ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-rose'}`}>
                    {(h.result ?? 0) >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(h.result ?? 0) >= 0 ? '+' : ''}{formatMoney(h.result)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatMoney(n) {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString()}`
}
