import { useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Shield, TrendingUp, Dice5, Wrench, Settings,
  Menu, X, Zap, ChevronRight, Bot as BotIcon, MessageSquare,
  BarChart2, Activity, Bot, Server, Pencil, CheckCircle2, History,
  Gamepad2, Users, LogOut,
} from 'lucide-react'
import { cn } from '../lib/utils.js'
import { useBot } from '../lib/BotContext.jsx'
import { authApi } from '../lib/api.js'

const NAV_SECTIONS = [
  {
    title: null,
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Overview', exact: true },
    ],
  },
  {
    title: 'Game',
    items: [
      { to: '/gang-hq', icon: Shield, label: 'Gang HQ' },
      { to: '/economy', icon: TrendingUp, label: 'Live Economy' },
      { to: '/casino', icon: Dice5, label: 'Casino' },
      { to: '/crafting', icon: Wrench, label: 'Crafting' },
      { to: '/gameplay', icon: Gamepad2, label: 'Gameplay' },
    ],
  },
  {
    title: 'Discord',
    items: [
      { to: '/messages', icon: MessageSquare, label: 'Messages' },
      { to: '/discord-tools', icon: Pencil, label: 'Message Tools' },
      { to: '/stats', icon: BarChart2, label: 'Stats' },
      { to: '/analytics', icon: Activity, label: 'Analytics' },
      { to: '/moderation', icon: Shield, label: 'Moderation' },
      { to: '/automation', icon: Bot, label: 'Automation' },
    ],
  },
  {
    title: 'Ops',
    items: [
      { to: '/samp-servers', icon: Server, label: 'SA-MP Servers' },
      { to: '/verification', icon: CheckCircle2, label: 'Verification' },
      { to: '/operations', icon: History, label: 'Operations' },
      { to: '/users', icon: Users, label: 'User Management' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { bots, botKey, setBotKey, loading: botLoading, error: botError, user } = useBot()

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  async function logout() {
    try { await authApi.logout() } catch {}
    window.location.replace('/nexus/login')
  }

  return (
    <div className="flex min-h-screen bg-bg-main">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-bg-card border-r border-border flex flex-col transition-transform',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
      )}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-purple to-accent-cyan flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-sm tracking-wide">NEXUS</h1>
            <p className="text-[10px] text-text-muted uppercase tracking-wider">JepsenCloud Panel</p>
          </div>
          <button className="ml-auto lg:hidden p-1 text-text-secondary hover:text-text-primary" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-3 overflow-y-auto">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={idx} className="space-y-0.5">
              {section.title && (
                <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wider text-text-muted">{section.title}</div>
              )}
              {section.items.map(({ to, icon: Icon, label, exact }) => {
                const active = exact ? location.pathname === to : (location.pathname === to || location.pathname.startsWith(to + '/'))
                return (
                  <NavLink key={to} to={to} className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                    active
                      ? 'bg-accent-purple/10 text-accent-purple border border-accent-purple/20'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
                  )}>
                    <Icon className="w-4 h-4" />
                    <span className="truncate">{label}</span>
                    {active && <ChevronRight className="w-3 h-3 ml-auto opacity-60" />}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2 text-[10px] text-text-muted uppercase tracking-wider">
            <BotIcon className="w-3 h-3" />Bot
          </div>
          {botLoading ? (
            <div className="text-xs text-text-muted">Loading…</div>
          ) : botError ? (
            <div className="text-xs text-accent-rose">{botError}</div>
          ) : bots.length === 0 ? (
            <div className="text-xs text-text-muted">No bots configured.</div>
          ) : (
            <select
              value={botKey || ''}
              onChange={(e) => setBotKey(e.target.value)}
              className="w-full bg-bg-elevated border border-border rounded-md px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-purple/60"
            >
              {bots.map((b) => (<option key={b.key} value={b.key}>{b.name || b.key}</option>))}
            </select>
          )}
          {user && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-subtle">
              <span className="text-xs text-text-secondary truncate">{user.username} <span className="text-text-muted">· {user.role}</span></span>
              <button onClick={logout} title="Sign out" className="p-1 text-text-secondary hover:text-accent-rose">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-bg-card/80 backdrop-blur flex items-center px-4 lg:px-6 gap-4">
          <button className="lg:hidden p-2 text-text-secondary hover:text-text-primary" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-text-secondary">Live</span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
