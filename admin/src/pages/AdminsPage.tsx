import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { Admin } from '@/types'
import { Alert, DataTable, Field, Page, Panel, RefreshButton } from '@/components/shared/AppPrimitives'

export function AdminsPage({ currentAdmin }: { currentAdmin: Admin | null }) {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [form, setForm] = useState({ username: '', password: '', role: 'admin' as Admin['role'] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setAdmins(await api.admin.users.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await api.admin.users.create(form)
      setForm({ username: '', password: '', role: 'admin' })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create admin')
    }
  }

  async function updateRole(id: string, role: Admin['role']) {
    await api.admin.users.updateRole(id, role)
    await load()
  }

  async function resetPassword(id: string) {
    const password = window.prompt('New password, minimum 10 characters')
    if (!password) return
    await api.admin.users.updatePassword(id, password)
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this admin account?')) return
    await api.admin.users.delete(id)
    await load()
  }

  return (
    <Page title="Admin Users" description="Manage administrator accounts and role-based access." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Panel title="Create admin" description="Super admins can manage users and system settings.">
          <form className="space-y-4" onSubmit={create}>
            <Field label="Username"><input className="input" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} required /></Field>
            <Field label="Password"><input className="input" type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} minLength={10} required /></Field>
            <Field label="Role">
              <select className="input" value={form.role} onChange={event => setForm({ ...form, role: event.target.value as Admin['role'] })}>
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </Field>
            {error && <Alert tone="bad">{error}</Alert>}
            <button className="btn-primary w-full">Create admin</button>
          </form>
        </Panel>

        <Panel title="Administrators" description="Current admin accounts and their privileges.">
          <DataTable headers={['Username', 'Role', 'Last login', 'Created', 'Actions']}>
            {admins.map(item => (
              <tr key={item.id} className="border-b border-white/5 last:border-0">
                <td className="py-3 pr-4 font-semibold">{item.username}{item.id === currentAdmin?.id ? ' (you)' : ''}</td>
                <td className="py-3 pr-4">
                  <select className="input w-36" value={item.role} onChange={event => updateRole(item.id, event.target.value as Admin['role'])} disabled={item.id === currentAdmin?.id}>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </td>
                <td className="py-3 pr-4 text-white/40">{item.lastLogin ? formatDate(item.lastLogin) : 'Never'}</td>
                <td className="py-3 pr-4 text-white/40">{formatDate(item.createdAt)}</td>
                <td className="py-3 pr-0">
                  <div className="flex justify-end gap-2">
                    <button className="btn-ghost min-h-9 px-3" onClick={() => resetPassword(item.id)}>Password</button>
                    <button className="btn-ghost min-h-9 px-3 text-destructive hover:bg-destructive/10" onClick={() => remove(item.id)} disabled={item.id === currentAdmin?.id}><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      </div>
    </Page>
  )
}
