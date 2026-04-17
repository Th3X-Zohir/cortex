import * as React from "react"
import { RefreshCcw } from "lucide-react"
import { PageHeader } from "~/components/shared/PageHeader"
import type { Admin } from "~/types"
import { api } from "~/lib/api"
import { formatDate } from "~/lib/utils"

export function AdminsPage({ currentAdmin }: { currentAdmin: Admin | null }) {
  const [admins, setAdmins] = React.useState<Admin[]>([])
  const [form, setForm] = React.useState({ username: "", password: "", role: "admin" as Admin["role"] })
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const adminId = currentAdmin?.id ?? ""

  async function load() {
    setLoading(true)
    try {
      setAdmins(await api.admin.users.list())
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    try {
      await api.admin.users.create(form)
      setForm({ username: "", password: "", role: "admin" })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create admin")
    }
  }

  async function updateRole(id: string, role: Admin["role"]) {
    await api.admin.users.updateRole(id, role)
    await load()
  }

  async function resetPassword(id: string) {
    const password = window.prompt("New password, minimum 10 characters")
    if (!password) return
    await api.admin.users.updatePassword(id, password)
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this admin account?")) return
    await api.admin.users.delete(id)
    await load()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Admin Users"
        description="Manage administrator accounts and role-based access."
        actions={
          <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        {/* Create form */}
        <div className="panel p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold">Create admin</h3>
            <p className="text-xs text-muted-foreground mt-1">Super admins can manage users and system settings.</p>
          </div>

          <form className="space-y-4" onSubmit={create}>
            <div>
              <label className="label" htmlFor="username">Username</label>
              <input id="username" className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} minLength={10} required />
            </div>
            <div>
              <label className="label" htmlFor="role">Role</label>
              <select id="role" className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Admin["role"] })}>
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </div>
            {error && <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>}
            <button type="submit" className="btn-primary w-full">Create admin</button>
          </form>
        </div>

        {/* Admins list */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold mb-4">Administrators</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  {["Username", "Role", "Last login", "Created", "Actions"].map(h => (
                    <th key={h} className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {admins.map(item => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4">
                      <span className="font-medium">{item.username}</span>
                      {item.id === adminId && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        className="input w-36"
                        value={item.role}
                        onChange={e => updateRole(item.id, e.target.value as Admin["role"])}
                        disabled={item.id === adminId}
                      >
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{item.lastLogin ? formatDate(item.lastLogin) : "Never"}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{formatDate(item.createdAt)}</td>
                    <td className="py-3 pr-0">
                      <div className="flex justify-end gap-2">
                        <button className="btn-ghost text-xs" onClick={() => resetPassword(item.id)}>Password</button>
                        <button className="btn-ghost text-xs text-destructive hover:bg-destructive/10" onClick={() => remove(item.id)} disabled={item.id === adminId}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}