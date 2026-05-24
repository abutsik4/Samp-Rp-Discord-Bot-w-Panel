import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Shield, TrendingUp, Dice5, Wrench, Settings,
  Menu, X, Zap, ChevronRight
} from 'lucide-react'
import { cn } from '../lib/utils.js'

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/gang-hq', icon: Shield, label: 'Gang HQ' },
  { to: '/economy', icon: TrendingUp, label: 'Live Economy' },
  { to: '/casino', icon: Dice5, label: 'Casino' },
  { to: '/crafting', icon: Wrench, label: 'Crafting' },
  { to: '/settings', icon: Settings, label: 'Settings' }
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [botKey, setBotKey] = useState(null)
  const location = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    // Try to infer bot key from panel session or fallback
    fetch('/panel/api/bots', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.bots?.length) setBotKey(d.bots[0].key)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="flex min-h-screen bg-bg-main">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-bg-card border-r border-border flex flex-col transition-transform",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide">NEXUS</h1>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">SAMP-Life Control</p>
          </div>
          <button
            className="ml-auto lg:hidden p-1 text-text-secondary hover:text-text-primary"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-accent-purple/10 text-accent-purple border border-accent-purple/20"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              {isActive && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-border text-[11px] text-text-muted">
          {botKey ? `Bot: ${botKey}` : 'No bot selected'}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-bg-card/80 backdrop-blur flex items-center px-4 lg:px-6 gap-4">
          <button
            className="lg:hidden p-2 text-text-secondary hover:text-text-primary"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-green"></span>
            </span>
            <span className="text-xs text-text-secondary">Live</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
