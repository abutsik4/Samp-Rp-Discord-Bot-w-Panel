import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, User, Lock, LogIn } from 'lucide-react'
import { authApi, formatApiError } from '../lib/api.js'
import { Alert } from '../components/Alert.jsx'
import { Button, Input, Field } from '../components/ui.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(ev) {
    ev.preventDefault()
    setPending(true); setError('')
    try {
      await authApi.login(username, password)
      const params = new URLSearchParams(window.location.search)
      const next = params.get('next') || '/'
      // BrowserRouter basename is /nexus, so use relative path
      window.location.replace(next.startsWith('/nexus') ? next : `/nexus${next.startsWith('/') ? next : '/' + next}`)
    } catch (err) {
      setError(formatApiError(err, 'Login failed'))
    } finally { setPending(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg-main">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 space-y-4 animate-fade-in">
        <div className="text-center mb-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent-purple/10 text-accent-purple border border-accent-purple/20 mb-3">
            <Bot className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold">JepsenCloud Panel</h1>
          <p className="text-xs text-text-muted">Sign in to manage your Discord bot</p>
        </div>

        <Field label="Username">
          <div className="relative">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus placeholder="Enter username" className="pl-8" />
          </div>
        </Field>
        <Field label="Password">
          <div className="relative">
            <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="Enter password" className="pl-8" />
          </div>
        </Field>

        {error && <Alert type="error">{error}</Alert>}

        <Button type="submit" variant="primary" disabled={pending} className="w-full justify-center">
          <LogIn className="w-4 h-4" />{pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
