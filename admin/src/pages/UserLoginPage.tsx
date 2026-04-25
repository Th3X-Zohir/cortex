import { useState } from 'react'
import { ArrowRight, Loader2, UserRound } from 'lucide-react'
import { api } from '@/lib/api'
import type { User } from '@/types'

export function UserLoginPage({
  onLogin,
  onGoRegister,
  onGoAdmin,
}: {
  onLogin: (user: User) => void
  onGoRegister: () => void
  onGoAdmin: () => void
}) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [persist, setPersist] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await api.user.login(login, password)
      const storage = persist ? localStorage : sessionStorage
      storage.setItem('cortex_user_token', response.token)
      if (!persist) localStorage.removeItem('cortex_user_token')
      onLogin(response.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-transparent lg:grid-cols-[minmax(0,1fr)_560px]">
      <section className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#0f766e_0%,#0f172a_45%,#1d4ed8_100%)]" />
        <div className="absolute left-[-8%] top-[-16%] h-[34rem] w-[34rem] rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-8%] h-[30rem] w-[30rem] rounded-full bg-teal-300/30 blur-3xl" />
        <div className="relative z-10 flex h-full flex-col justify-between p-14 text-white">
          <div>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-3 py-2 backdrop-blur">
              <img src="/favicon.svg" alt="Cortex" className="h-4 w-4" />
              <span className="text-sm font-semibold">Cortex User Portal</span>
            </div>
            <h1 className="mt-8 max-w-lg text-5xl font-semibold leading-tight tracking-tight">
              Your gateway to powerful AI models.
            </h1>
            <p className="mt-5 max-w-lg text-base text-teal-100">
              Register, request API keys, and access Grok, Claude, Gemini, and ChatGPT through your approved credentials.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Request Keys', 'Submit and track API key requests'],
              ['Usage Dashboard', 'Monitor your quota and requests'],
              ['Request Logs', 'Full history of your API calls'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-xs text-teal-100">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-6 md:p-10">
        <form
          className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/92 p-7 shadow-[0_18px_46px_rgba(15,23,42,0.12)] backdrop-blur"
          onSubmit={submit}
        >
          <div className="mb-6">
            <img src="/logo.svg" alt="Cortex" className="h-8 w-auto" />
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <UserRound size={16} className="text-teal-700" />
              <span className="text-sm font-semibold text-slate-700">User Sign In</span>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-600">Sign in to your user account to manage your API keys.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="ui-label">Username or Email</label>
              <input
                className="ui-input"
                value={login}
                onChange={e => setLogin(e.target.value)}
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
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={persist}
                onChange={e => setPersist(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Keep me signed in
            </label>
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            ) : null}
            <button type="submit" className="ui-btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Sign in
            </button>
          </div>

          <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
            <p className="text-sm text-slate-600">
              Don&apos;t have an account?{' '}
              <button type="button" className="font-semibold text-teal-700 hover:underline" onClick={onGoRegister}>
                Register here
              </button>
            </p>
            <p className="text-sm text-slate-600">
              Are you an admin?{' '}
              <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={onGoAdmin}>
                Admin sign in
              </button>
            </p>
          </div>
        </form>
      </section>
    </div>
  )
}
