import { useState } from 'react'
import {
  Settings, Moon, Sun, Bell, Shield, Save, RotateCcw
} from 'lucide-react'

export default function SettingsPage() {
  const [theme, setTheme] = useState('dark')
  const [compact, setCompact] = useState(false)
  const [refreshRate, setRefreshRate] = useState(30)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Settings</h2>
          <p className="text-sm text-text-secondary">Appearance, notifications, and system prefs</p>
        </div>
      </div>

      <div className="card p-4 animate-fade-in space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? <Moon className="w-5 h-5 text-text-muted" /> : <Sun className="w-5 h-5 text-text-muted" />}
            <div>
              <div className="text-sm font-medium">Theme</div>
              <div className="text-xs text-text-muted">Dark mode is always on for now</div>
            </div>
          </div>
          <div className="flex gap-2">
            {['dark','light','auto'].map(t => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                  theme === t
                    ? 'bg-accent-purple/10 text-accent-purple border-accent-purple/20'
                    : 'text-text-muted border-transparent hover:bg-bg-hover'
                }`}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border-subtle" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-text-muted" />
            <div>
              <div className="text-sm font-medium">Notifications</div>
              <div className="text-xs text-text-muted">Push on gang wars, heists, stock alerts</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" defaultChecked />
            <div className="w-9 h-5 bg-bg-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-purple"></div>
          </label>
        </div>

        <div className="h-px bg-border-subtle" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RotateCcw className="w-5 h-5 text-text-muted" />
            <div>
              <div className="text-sm font-medium">Auto Refresh</div>
              <div className="text-xs text-text-muted">Dashboard poll interval in seconds</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={5}
              max={120}
              value={refreshRate}
              onChange={e => setRefreshRate(Number(e.target.value))}
              className="w-24 accent-accent-purple"
            />
            <span className="text-xs text-text-muted w-8">{refreshRate}s</span>
          </div>
        </div>

        <div className="h-px bg-border-subtle" />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-text-muted" />
            <div>
              <div className="text-sm font-medium">Admin Mode</div>
              <div className="text-xs text-text-muted">Show destructive actions and raw data</div>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" />
            <div className="w-9 h-5 bg-bg-elevated peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent-rose"></div>
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-purple text-white text-sm font-medium hover:bg-accent-purple/90 transition-colors">
          <Save className="w-4 h-4" /> Save Preferences
        </button>
      </div>
    </div>
  )
}
