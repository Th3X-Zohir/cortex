import { useState } from 'react'
import { Loader2, Lock, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import type { Admin } from '@/types'

export function LoginPage({ onLogin }: { onLogin?: (admin: Admin) => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [persist, setPersist] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await api.auth.login(username, password)
      const storage = persist ? localStorage : sessionStorage
      storage.setItem('cortex_admin_token', response.token)
      if (!persist) localStorage.removeItem('cortex_admin_token')

      if (onLogin) {
        onLogin({ ...response.admin, permissions: response.permissions })
      } else {
        window.location.href = '/'
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-[#080808] lg:grid-cols-[minmax(0,1fr)_520px]">
      <section className="hidden border-r border-white/5 bg-[#0a0a0a]/50 lg:flex lg:flex-col lg:justify-between backdrop-blur-xl">
        <div className="p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <ShieldCheck size={24} className="text-primary" />
            </div>
            <p className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-xl font-bold text-transparent">Cortex Admin</p>
          </div>
          <div className="mt-24 max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Secure operations</p>
            <h1 className="mt-4 bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-bold leading-tight text-transparent">
              Control API access, usage limits, provider sessions, and production logs.
            </h1>
            <p className="mt-5 text-lg text-white/50">
              Token-gated administration for daily service operations.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-white/5">
          {['API keys', 'Rate controls', 'Audit trail'].map(item => (
            <div key={item} className="border-r border-white/5 p-6 text-sm text-white/40 last:border-r-0">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <form className="w-full max-w-sm" onSubmit={submit}>
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <ShieldCheck size={22} className="text-primary" />
              </div>
              <p className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-lg font-bold text-transparent">Cortex Admin</p>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white">Admin sign in</h2>
          <p className="mt-2 text-sm text-white/50">
            Use an admin account to manage keys, limits, logs, and providers.
          </p>
          <div className="mt-8 space-y-4">
            <div>
              <label className="label text-white/60">Username</label>
              <input id="username" className="input mt-2" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" />
            </div>
            <div>
              <label className="label text-white/60">Password</label>
              <input id="password" className="input mt-2" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
            </div>
            <label className="flex items-center gap-2 text-sm text-white/50">
              <input type="checkbox" checked={persist} onChange={event => setPersist(event.target.checked)} className="accent-primary" />
              Keep me signed in on this device
            </label>
            {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive backdrop-blur-xl">{error}</div>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
              Sign in
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
