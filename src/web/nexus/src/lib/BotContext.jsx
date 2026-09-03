import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { authApi, formatApiError } from './api.js'

const BotContext = createContext(null)

const STORAGE_KEY = 'nexus.selectedBotKey'

export function BotProvider({ children }) {
  const [bots, setBots] = useState([])
  const [user, setUser] = useState(null)
  const [botKey, setBotKeyState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null } catch { return null }
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [data, meData] = await Promise.all([
        authApi.bots(),
        authApi.me().catch(() => null),
      ])
      setUser(meData?.user || null)
      const items = data?.items || []
      setBots(items)
      // Validate stored key still exists; otherwise fall back to first.
      setBotKeyState((prev) => {
        if (prev && items.some((b) => b.key === prev)) return prev
        return items[0]?.key || null
      })
    } catch (e) {
      setError(formatApiError(e, 'Failed to load bots'))
      setBots([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const setBotKey = useCallback((key) => {
    setBotKeyState(key)
    try {
      if (key) localStorage.setItem(STORAGE_KEY, key)
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore */ }
  }, [])

  const bot = useMemo(() => bots.find((b) => b.key === botKey) || null, [bots, botKey])

  const value = useMemo(() => ({
    bots, botKey, bot, user, loading, error, setBotKey, reload,
  }), [bots, botKey, bot, user, loading, error, setBotKey, reload])

  return <BotContext.Provider value={value}>{children}</BotContext.Provider>
}

export function useBot() {
  const ctx = useContext(BotContext)
  if (!ctx) throw new Error('useBot must be used within a <BotProvider>')
  return ctx
}
