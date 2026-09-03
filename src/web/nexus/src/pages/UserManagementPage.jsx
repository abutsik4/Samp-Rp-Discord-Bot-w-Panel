import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Users, Key, Trash2, UserPlus, Lock, Save, X, Shield } from 'lucide-react'
import { PageHeader } from '../components/PageHeader.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { Alert } from '../components/Alert.jsx'
import { Button, Input, Select, Field } from '../components/ui.jsx'
import { useBot } from '../lib/BotContext.jsx'
import { authApi, formatApiError } from '../lib/api.js'
import { useResource } from '../hooks/useResource.js'

export default function UserManagementPage() {
  const { user } = useBot()
  if (user && user.role !== 'admin') return <Navigate to="/" replace />

  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPw, setResetPw] = useState('')
  const [selfCur, setSelfCur] = useState('')
  const [selfNew, setSelfNew] = useState('')
  const [delConfirm, setDelConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const users = useResource(() => authApi.users(), [])

  function flash(msg) { setSuccess(msg); setTimeout(() => setSuccess(''), 4000) }
  async function run(fn, onOk) {
    setBusy(true); setError(''); setSuccess('')
    try { const r = await fn(); onOk?.(r); return r }
    catch (e) { setError(formatApiError(e)) }
    finally { setBusy(false) }
  }

  const list = users.data?.users || []

  return (
    <div>
      <PageHeader icon={Users} title="User Management" subtitle="Manage panel accounts and access levels." />
      {error ? <Alert type="error" className="mb-3">{error}</Alert> : null}
      {success ? <Alert type="success" className="mb-3">{success}</Alert> : null}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => { setResetTarget(null); setResetPw('') }}>
          <div className="card p-4 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-semibold"><Key className="w-4 h-4" />Reset Password: {resetTarget}</div>
              <Button variant="icon" onClick={() => { setResetTarget(null); setResetPw('') }}><X className="w-3.5 h-3.5" /></Button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); run(() => authApi.adminResetPassword(resetTarget, resetPw), () => { flash(`Password reset for "${resetTarget}".`); setResetTarget(null); setResetPw('') }) }}>
              <Field label="New Password">
                <Input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} minLength={8} required placeholder="Min 8 characters" />
              </Field>
              <div className="flex gap-2 mt-3">
                <Button type="submit" variant="primary" disabled={busy}><Key className="w-3.5 h-3.5" />{busy ? 'Resetting…' : 'Reset Password'}</Button>
                <Button onClick={() => { setResetTarget(null); setResetPw('') }}>Cancel</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <SectionCard title="Panel Users" icon={Users} className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border">
                <th className="py-2 pr-3 w-10"></th>
                <th className="py-2 pr-3">Username</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-center text-sm text-text-muted">No users found.</td></tr>
              ) : list.map(u => (
                <tr key={u.username} className="border-b border-border-subtle hover:bg-bg-elevated/40">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent-purple/20 text-accent-purple text-xs font-bold">
                      {u.username[0]?.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {u.username}
                    {u.username === user?.username && (
                      <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-accent-purple/20 text-accent-purple border border-accent-purple/30">you</span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {u.username === user?.username ? (
                      <span className={`text-xs px-2 py-0.5 rounded border ${u.role === 'admin' ? 'bg-accent-amber/10 text-accent-amber border-accent-amber/30' : 'bg-bg-elevated text-text-secondary border-border'}`}>{u.role}</span>
                    ) : (
                      <Select value={u.role} onChange={(e) => run(() => authApi.updateUserRole(u.username, e.target.value), () => { flash('Role updated.'); users.refetch() })} className="w-auto">
                        <option value="admin">admin</option>
                        <option value="user">user</option>
                      </Select>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      <Button variant="icon" onClick={() => { setResetTarget(u.username); setResetPw('') }} title="Reset Password"><Key className="w-3.5 h-3.5" /></Button>
                      {u.username !== user?.username && (
                        delConfirm === u.username ? (
                          <span className="flex items-center gap-1 text-xs">
                            <span className="text-text-secondary">Delete?</span>
                            <Button variant="danger" disabled={busy} onClick={() => run(() => authApi.deleteUser(u.username), () => { flash('User deleted.'); setDelConfirm(null); users.refetch() })}>Yes</Button>
                            <Button onClick={() => setDelConfirm(null)}>No</Button>
                          </span>
                        ) : (
                          <Button variant="iconDanger" onClick={() => setDelConfirm(u.username)} title="Delete user"><Trash2 className="w-3.5 h-3.5" /></Button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Create New User" icon={UserPlus} className="mb-4">
        <form onSubmit={(e) => { e.preventDefault(); run(() => authApi.createUser(newUsername, newPassword, newRole), () => { flash(`User "${newUsername}" created.`); setNewUsername(''); setNewPassword(''); setNewRole('user'); users.refetch() }) }} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Username">
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="Letters, digits, _ and -" pattern="[a-zA-Z0-9_-]+" required />
            </Field>
            <Field label="Password">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} required />
            </Field>
            <Field label="Role">
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={busy}><UserPlus className="w-3.5 h-3.5" />{busy ? 'Creating…' : 'Create'}</Button>
        </form>
      </SectionCard>

      <SectionCard title="Change Your Password" icon={Lock}>
        <form onSubmit={(e) => { e.preventDefault(); run(() => authApi.changeSelfPassword(selfCur, selfNew), () => { flash('Your password has been changed.'); setSelfCur(''); setSelfNew('') }) }} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Current Password">
              <Input type="password" value={selfCur} onChange={(e) => setSelfCur(e.target.value)} required />
            </Field>
            <Field label="New Password">
              <Input type="password" value={selfNew} onChange={(e) => setSelfNew(e.target.value)} placeholder="Min 8 characters" minLength={8} required />
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={busy}><Save className="w-3.5 h-3.5" />{busy ? 'Saving…' : 'Save'}</Button>
        </form>
      </SectionCard>
    </div>
  )
}
