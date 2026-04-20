import { useState } from 'react'
import { ArrowRight, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import type { Admin } from '@/types'

export function LoginPage({ onLogin }: { onLogin?: (admin: Admin) => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [persist, setPersist] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <div className="grid min-h-screen grid-cols-1 bg-transparent lg:grid-cols-[minmax(0,1fr)_560px]">
      <section className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#1d4ed8_0%,#0f172a_45%,#0f766e_100%)]" />
        <div className="absolute left-[-8%] top-[-16%] h-[34rem] w-[34rem] rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-8%] h-[30rem] w-[30rem] rounded-full bg-cyan-300/30 blur-3xl" />

        <div className="relative z-10 flex h-full flex-col justify-between p-14 text-white">
          <div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-3 py-2 backdrop-blur">
              <ShieldCheck size={16} />
              <span className="text-sm font-semibold">Cortex Admin Platform</span>
            </div>

            <h1 className="mt-8 max-w-lg text-5xl font-semibold leading-tight tracking-tight">
              Professional operations cockpit for AI gateway management.
            </h1>
            <p className="mt-5 max-w-lg text-base text-blue-100">
              Review live traffic, control provider sessions, secure API keys, and manage administrators from one modern control surface.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ['Access Control', 'Issue and rotate keys'],
              ['Provider Control', 'Live login and status'],
              ['Audit Coverage', 'Complete event history'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-blue-100">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 md:p-10">
        <form className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/92 p-7 shadow-[0_18px_46px_rgba(15,23,42,0.12)] backdrop-blur" onSubmit={submit}>
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <LockKeyhole size={16} className="text-blue-700" />
              <span className="text-sm font-semibold text-slate-700">Admin Sign In</span>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-600">Authenticate to access the Cortex operations dashboard.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="ui-label">Username</label>
              <input
                className="ui-input"
                value={username}
                onChange={event => setUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label className="ui-label">Password</label>
              <input
                className="ui-input"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={persist}
                onChange={event => setPersist(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              Keep me signed in on this device
            </label>

            {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

            <button type="submit" className="ui-btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Continue to dashboard
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
