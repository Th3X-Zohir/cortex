import { useState } from 'react'
import { ArrowRight, Loader2, UserPlus } from 'lucide-react'
import { api } from '@/lib/api'
import type { User } from '@/types'

export function UserRegisterPage({
  onRegister,
  onGoLogin,
  onGoAdmin,
}: {
  onRegister: (user: User) => void
  onGoLogin: () => void
  onGoAdmin: () => void
}) {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const response = await api.user.register(form.username, form.email, form.password)
      sessionStorage.setItem('cortex_user_token', response.token)
      localStorage.removeItem('cortex_user_token')
      onRegister(response.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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
              Get access to the AI gateway in minutes.
            </h1>
            <p className="mt-5 max-w-lg text-base text-teal-100">
              Create your account, request an API key, and start making requests once your admin approves.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              ['1. Register', 'Create your user account'],
              ['2. Request', 'Submit an API key request'],
              ['3. Build', 'Use your approved key'],
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
              <UserPlus size={16} className="text-teal-700" />
              <span className="text-sm font-semibold text-slate-700">Create Account</span>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Get started</h2>
            <p className="mt-2 text-sm text-slate-600">
              Register to request API access. Your admin will review and approve your key request.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="ui-label">Username</label>
              <input
                className="ui-input"
                value={form.username}
                onChange={set('username')}
                autoComplete="username"
                placeholder="3–32 alphanumeric chars"
                required
              />
            </div>
            <div>
              <label className="ui-label">Email</label>
              <input
                className="ui-input"
                type="email"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="ui-label">Password</label>
              <input
                className="ui-input"
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div>
              <label className="ui-label">Confirm Password</label>
              <input
                className="ui-input"
                type="password"
                value={form.confirm}
                onChange={set('confirm')}
                autoComplete="new-password"
                required
              />
            </div>
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            ) : null}
            <button type="submit" className="ui-btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Create account
            </button>
          </div>

          <div className="mt-6 space-y-3 border-t border-slate-200 pt-5">
            <p className="text-sm text-slate-600">
              Already have an account?{' '}
              <button type="button" className="font-semibold text-teal-700 hover:underline" onClick={onGoLogin}>
                Sign in
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
