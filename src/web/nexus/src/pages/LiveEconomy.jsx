import { useState } from 'react'
import { useApi } from '../hooks/useApi.js'
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight,
  ArrowDownRight, Wallet, PiggyBank, Activity
} from 'lucide-react'

function formatMoney(n) {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString()}`
}

export default function LiveEconomy() {
  const [range, setRange] = useState('24h')
  const { data: ledger } = useApi('/panel/api/gameplay/ledger-summary')
  const { data: stocks } = useApi('/panel/api/gameplay/stocks')

  const ranges = ['1h','24h','7d','30d']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Live Economy</h2>
          <p className="text-sm text-text-secondary">Cash flow, stocks, heists, and property markets</p>
        </div>
        <div className="flex gap-1">
          {ranges.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                range === r
                  ? 'bg-accent-purple/10 text-accent-purple border-accent-purple/20'
                  : 'text-text-muted hover:text-text-primary border-transparent hover:bg-bg-hover'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Wallet, label: 'Total Cash', value: formatMoney(ledger?.totalCash), delta: ledger?.cashDelta, tone: 'purple' },
          { icon: PiggyBank, label: 'Bank Deposits', value: formatMoney(ledger?.totalBank), delta: ledger?.bankDelta, tone: 'cyan' },
          { icon: Activity, label: 'Daily Volume', value: formatMoney(ledger?.dailyVolume), delta: ledger?.volumeDelta, tone: 'amber' },
          { icon: DollarSign, label: 'Tax Revenue', value: formatMoney(ledger?.taxRevenue), delta: ledger?.taxDelta, tone: 'rose' }
        ].map((k, i) => (
          <div key={i} className="card p-4 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-muted uppercase tracking-wider">{k.label}</span>
              <k.icon className="w-4 h-4 text-text-muted" />
            </div>
            <div className="text-xl font-bold">{k.value}</div>
            {k.delta != null && (
              <div className={`flex items-center gap-1 text-xs mt-1 ${k.delta >= 0 ? 'text-accent-green' : 'text-accent-rose'}`}>
                {k.delta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(k.delta).toFixed(1)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Stock Ticker</h3>
            <span className="text-xs text-text-muted">Live prices</span>
          </div>
          <div className="space-y-2">
            {(stocks?.list ?? []).length === 0 && (
              <p className="text-sm text-text-muted">No stock data available.</p>
            )}
            {(stocks?.list ?? []).map(s => (
              <div key={s.symbol} className="flex items-center gap-3 py-2 border-b border-border-subtle last:border-0">
                <div className="w-10 h-10 rounded-md bg-bg-elevated flex items-center justify-center text-xs font-bold">
                  {s.symbol}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-[11px] text-text-muted">Vol: {(s.volume ?? 0).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">${(s.price ?? 0).toFixed(2)}</div>
                  <div className={`text-xs flex items-center gap-1 ${(s.change ?? 0) >= 0 ? 'text-accent-green' : 'text-accent-rose'}`}>
                    {(s.change ?? 0) >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(s.change ?? 0).toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Recent Transactions</h3>
            <span className="text-xs text-text-muted">Global ledger</span>
          </div>
          <div className="space-y-2 max-h-[400px] overflow-auto pr-1">
            {(ledger?.recent ?? []).length === 0 && (
              <p className="text-sm text-text-muted">No transactions yet.</p>
            )}
            {(ledger?.recent ?? []).map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-8 rounded-full ${tx.amount >= 0 ? 'bg-accent-green' : 'bg-accent-rose'}`} />
                  <div>
                    <div className="text-sm">{tx.description ?? tx.type}</div>
                    <div className="text-[11px] text-text-muted">{tx.userTag ?? 'System'} · {new Date(tx.createdAt).toLocaleString()}</div>
                  </div>
                </div>
                <span className={`text-sm font-medium ${tx.amount >= 0 ? 'text-accent-green' : 'text-accent-rose'}`}>
                  {tx.amount >= 0 ? '+' : ''}{formatMoney(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
