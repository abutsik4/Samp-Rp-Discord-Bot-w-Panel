import { useEffect, useState } from 'react'
import { authApi } from './api.js'

function isLoginRoute() {
  return typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/nexus/login'
}

function redirectToLogin() {
  const here = window.location.pathname + window.location.search
  const next = here.startsWith('/nexus') ? (here.slice('/nexus'.length) || '/') : here
  window.location.replace(`/nexus/login?next=${encodeURIComponent(next)}`)
}

export function AuthGuard({ children }) {
  const [state, setState] = useState({ loading: true, user: null })

  useEffect(() => {
    if (isLoginRoute()) {
      setState({ loading: false, user: { _login: true } })
      return
    }
    let cancelled = false
    authApi.me()
      .then((data) => {
        if (cancelled) return
        if (data?.authenticated) setState({ loading: false, user: data.user })
        else redirectToLogin()
      })
      .catch((err) => {
        if (cancelled) return
        if (err?.status === 401) redirectToLogin()
        else setState({ loading: false, user: null, error: err?.message || 'Auth check failed' })
      })
    return () => { cancelled = true }
  }, [])

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary text-sm">
        Checking session…
      </div>
    )
  }

  if (!state.user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-accent-rose text-sm">
        {state.error || 'Not signed in'}
      </div>
    )
  }

  return children
}
