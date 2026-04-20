import { useEffect, useState } from 'react'
import { KeyRound, Trash2, UserPlus } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { Admin } from '@/types'
import {
  BusyPanel,
  Chip,
  EmptyPanel,
  ErrorBanner,
  PageShell,
  SuccessBanner,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

export function AdminsPage({ currentAdmin }: { currentAdmin: Admin | null }) {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'admin' as Admin['role'],
  })

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const next = await api.admin.users.list()
      setAdmins(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function createAdmin(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    try {
      await api.admin.users.create({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
      })
      setForm({ username: '', password: '', role: 'admin' })
      setNotice('Admin account created.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create admin account')
    }
  }

  async function changeRole(id: string, role: Admin['role']) {
    setError(null)
    setNotice(null)

    try {
      await api.admin.users.updateRole(id, role)
      setNotice('Role updated.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update role')
    }
  }

  async function resetPassword(id: string, username: string) {
    const password = window.prompt(`Set a new password for ${username} (minimum 10 characters):`)
    if (!password) return

    setError(null)
    setNotice(null)

    try {
      await api.admin.users.updatePassword(id, password)
      setNotice('Password updated.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update password')
    }
  }

  async function removeAdmin(id: string, username: string) {
    if (!window.confirm(`Delete admin account "${username}"?`)) return

    setError(null)
    setNotice(null)

    try {
      await api.admin.users.delete(id)
      setNotice('Admin account removed.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete admin account')
    }
  }

  return (
    <PageShell
      title="Administrator Accounts"
      description="Control privileged access, roles, and credential lifecycle for the admin control plane."
      action={<button type="button" className="ui-btn-secondary" onClick={() => void load()}>Refresh</button>}
    >
      {error ? <ErrorBanner text={error} /> : null}
      {notice ? <SuccessBanner text={notice} /> : null}

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Surface>
          <SurfaceHeader title="Create Admin" description="New admins can be provisioned with role-based permissions." />

          <form className="space-y-4" onSubmit={createAdmin}>
            <div>
              <label className="ui-label">Username</label>
              <input
                className="ui-input"
                value={form.username}
                onChange={event => setForm(current => ({ ...current, username: event.target.value }))}
                required
              />
            </div>

            <div>
              <label className="ui-label">Initial Password</label>
              <input
                className="ui-input"
                type="password"
                minLength={10}
                value={form.password}
                onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
                required
              />
            </div>

            <div>
              <label className="ui-label">Role</label>
              <select
                className="ui-input"
                value={form.role}
                onChange={event => setForm(current => ({ ...current, role: event.target.value as Admin['role'] }))}
              >
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </div>

            <button type="submit" className="ui-btn-primary w-full">
              <UserPlus size={15} /> Create admin
            </button>
          </form>
        </Surface>

        <Surface>
          <SurfaceHeader title="Current Admin Users" description="Adjust roles, rotate passwords, and remove accounts." />

          {loading ? (
            <BusyPanel text="Loading admin users..." />
          ) : admins.length ? (
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Last Login</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map(item => {
                    const isCurrent = item.id === currentAdmin?.id
                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{item.username}</span>
                            {isCurrent ? <Chip tone="default">You</Chip> : null}
                          </div>
                        </td>
                        <td>
                          <select
                            className="ui-input min-h-9"
                            value={item.role}
                            disabled={isCurrent}
                            onChange={event => void changeRole(item.id, event.target.value as Admin['role'])}
                          >
                            <option value="admin">admin</option>
                            <option value="super_admin">super_admin</option>
                          </select>
                        </td>
                        <td className="text-xs text-slate-600">{item.lastLogin ? formatDate(item.lastLogin) : 'Never'}</td>
                        <td className="text-xs text-slate-600">{formatDate(item.createdAt)}</td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              type="button"
                              className="ui-btn-secondary min-h-8 px-3 text-xs"
                              onClick={() => void resetPassword(item.id, item.username)}
                            >
                              <KeyRound size={12} /> Password
                            </button>
                            <button
                              type="button"
                              className="ui-btn-danger min-h-8 px-3 text-xs"
                              disabled={isCurrent}
                              onClick={() => void removeAdmin(item.id, item.username)}
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyPanel text="No admin accounts found." />
          )}
        </Surface>
      </section>
    </PageShell>
  )
}
