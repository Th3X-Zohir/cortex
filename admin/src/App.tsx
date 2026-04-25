import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BookOpen,
  Cpu,
  Gauge,
  KeyRound,
  LogOut,
  Monitor,
  Settings,
  Sparkles,
  TerminalSquare,
  UserCheck,
  Users,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { Admin, Permission, User } from '@/types'
import { AccessPage } from '@/pages/AccessPage'
import { AdminsPage } from '@/pages/AdminsPage'
import { DocsPage } from '@/pages/DocsPage'
import { LimitsPage } from '@/pages/LimitsPage'
import { LoginPage } from '@/pages/LoginPage'
import { LogsPage } from '@/pages/LogsPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { PlaygroundPage } from '@/pages/PlaygroundPage'
import { ProvidersPage } from '@/pages/ProvidersPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { VncPage } from '@/pages/VncPage'
import { UserDashboardPage } from '@/pages/UserDashboardPage'
import { UserLoginPage } from '@/pages/UserLoginPage'
import { UserRegisterPage } from '@/pages/UserRegisterPage'
import { UserRequestsPage } from '@/pages/UserRequestsPage'
import { AdminUsersPage } from '@/pages/AdminUsersPage'

export type SectionId =
  | 'overview'
  | 'access'
  | 'limits'
  | 'logs'
  | 'providers'
  | 'playground'
  | 'vnc'
  | 'docs'
  | 'admins'
  | 'settings'
  | 'user-requests'
  | 'portal-users'

const sections: Array<{
  id: SectionId
  label: string
  icon: typeof Activity
  permission?: Permission
  caption: string
}> = [
  { id: 'overview', label: 'Overview', icon: Sparkles, permission: 'dashboard:read', caption: 'Operations pulse and KPIs' },
  { id: 'access', label: 'API Access', icon: KeyRound, permission: 'keys:manage', caption: 'Issue and rotate API keys' },
  { id: 'portal-users', label: 'Portal Users', icon: Users, permission: 'admins:manage', caption: 'Manage registered user accounts' },
  { id: 'user-requests', label: 'User Requests', icon: UserCheck, permission: 'keys:manage', caption: 'Approve user API key requests' },
  { id: 'limits', label: 'Limits', icon: Gauge, permission: 'dashboard:read', caption: 'Daily quotas and request budgets' },
  { id: 'logs', label: 'Logs', icon: Activity, permission: 'logs:read', caption: 'Request logs and audit trail' },
  { id: 'providers', label: 'Providers', icon: Cpu, permission: 'providers:manage', caption: 'Model providers and sessions' },
  { id: 'playground', label: 'Playground', icon: TerminalSquare, permission: 'playground:use', caption: 'Live request testing' },
  { id: 'vnc', label: 'VNC', icon: Monitor, permission: 'providers:manage', caption: 'Remote browser control' },
  { id: 'docs', label: 'API Docs', icon: BookOpen, permission: 'dashboard:read', caption: 'Developer integration guide' },
  { id: 'admins', label: 'Admins', icon: Users, permission: 'admins:manage', caption: 'Users and permissioning' },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'config:manage', caption: 'Runtime and policy settings' },
]

type AuthView = 'loading' | 'landing' | 'admin-login' | 'user-login' | 'user-register'

function App() {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [view, setView] = useState<AuthView>('loading')
  const [active, setActive] = useState<SectionId>('overview')

  useEffect(() => {
    const hasAdminToken = !!(
      sessionStorage.getItem('cortex_admin_token') ||
      localStorage.getItem('cortex_admin_token')
    )
    const hasUserToken = !!(
      sessionStorage.getItem('cortex_user_token') ||
      localStorage.getItem('cortex_user_token')
    )

    if (!hasAdminToken && !hasUserToken) {
      setView('landing')
      return
    }

    const checks: Promise<void>[] = []

    if (hasAdminToken) {
      checks.push(
        api.auth.me()
          .then(a => setAdmin(a))
          .catch(() => {
            sessionStorage.removeItem('cortex_admin_token')
            localStorage.removeItem('cortex_admin_token')
          })
      )
    }

    if (hasUserToken) {
      checks.push(
        api.user.me()
          .then(u => setUser(u))
          .catch(() => {
            sessionStorage.removeItem('cortex_user_token')
            localStorage.removeItem('cortex_user_token')
          })
      )
    }

    Promise.all(checks).then(() => setView('landing'))
  }, [])

  const visibleSections = useMemo(() => {
    const permissions = new Set<Permission>(admin?.permissions ?? [])
    return sections.filter(section => !section.permission || permissions.has(section.permission))
  }, [admin])

  useEffect(() => {
    if (admin && !visibleSections.some(section => section.id === active)) {
      setActive(visibleSections[0]?.id ?? 'overview')
    }
  }, [active, visibleSections, admin])

  // Loading spinner
  if (view === 'loading') {
    return (
      <div className="ui-app-shell grid min-h-screen place-items-center p-6">
        <div className="ui-surface w-full max-w-sm text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" />
          <p className="text-sm text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  // User is authenticated → show user dashboard
  if (user && !admin) {
    return (
      <UserDashboardPage
        user={user}
        onLogout={() => {
          api.user.logout().catch(() => {})
          sessionStorage.removeItem('cortex_user_token')
          localStorage.removeItem('cortex_user_token')
          setUser(null)
          setView('landing')
        }}
      />
    )
  }

  // Admin is authenticated → show admin panel
  if (admin) {
    return (
      <div className="ui-app-shell">
        <div className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:pl-0">
          <aside className="ui-surface hidden h-[calc(100vh-2rem)] flex-col lg:sticky lg:top-4 lg:flex">
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white/92 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <img src="/logo.svg" alt="Cortex Admin" className="h-9 w-auto" />
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">CorteX</p>
                </div>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Control</span>
              </div>
              <div className="mt-3 h-1.5 w-16 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500" />
            </div>

            <nav className="ui-scroll flex-1 space-y-1 overflow-y-auto pr-1">
              {visibleSections.map(section => {
                const activeItem = section.id === active
                return (
                  <button
                    key={section.id}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      activeItem
                        ? 'border-blue-200 bg-blue-50 text-blue-800 shadow-sm'
                        : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                    onClick={() => setActive(section.id)}
                  >
                    <div className="flex items-center gap-2.5">
                      <section.icon size={16} />
                      <span className="text-sm font-semibold">{section.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{section.caption}</p>
                  </button>
                )
              })}
            </nav>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-xs font-semibold text-slate-600">Signed in</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{admin.username}</p>
              <p className="text-xs capitalize text-slate-500">{admin.role.replace('_', ' ')}</p>
              <button type="button" className="ui-btn-secondary mt-3 w-full" onClick={() => logoutAdmin(setAdmin, setView)}>
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </aside>

          <div className="space-y-4">
            {admin.mustChangePassword ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Default admin credentials are still active. Update the account password immediately.
              </div>
            ) : null}

            <main className="pb-6">
              {active === 'overview' ? <OverviewPage adminName={admin.username} /> : null}
              {active === 'access' ? <AccessPage /> : null}
              {active === 'portal-users' ? <AdminUsersPage /> : null}
              {active === 'user-requests' ? <UserRequestsPage /> : null}
              {active === 'limits' ? <LimitsPage /> : null}
              {active === 'logs' ? <LogsPage /> : null}
              {active === 'providers' ? <ProvidersPage /> : null}
              {active === 'playground' ? <PlaygroundPage /> : null}
              {active === 'vnc' ? <VncPage /> : null}
              {active === 'docs' ? <DocsPage /> : null}
              {active === 'admins' ? <AdminsPage currentAdmin={admin} /> : null}
              {active === 'settings' ? <SettingsPage /> : null}
            </main>
          </div>
        </div>
      </div>
    )
  }

  // Auth views (landing / login / register)
  if (view === 'admin-login') {
    return (
      <LoginPage
        onLogin={a => {
          setAdmin(a)
          setView('landing')
        }}
      />
    )
  }

  if (view === 'user-login') {
    return (
      <UserLoginPage
        onLogin={u => {
          setUser(u)
          setView('landing')
        }}
        onGoRegister={() => setView('user-register')}
        onGoAdmin={() => setView('admin-login')}
      />
    )
  }

  if (view === 'user-register') {
    return (
      <UserRegisterPage
        onRegister={u => {
          setUser(u)
          setView('landing')
        }}
        onGoLogin={() => setView('user-login')}
        onGoAdmin={() => setView('admin-login')}
      />
    )
  }

  // Landing page — choose admin or user portal
  return (
    <div className="grid min-h-screen grid-cols-1 bg-transparent lg:grid-cols-2">
      {/* Admin side */}
      <button
        type="button"
        className="group relative flex flex-col items-center justify-center overflow-hidden p-14 text-left transition-all hover:brightness-105"
        onClick={() => setView('admin-login')}
      >
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#1d4ed8_0%,#0f172a_60%)]" />
        <div className="absolute left-[-8%] top-[-16%] h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 max-w-sm text-white">
          <img src="/logo.svg" alt="Cortex" className="mb-6 h-10 w-auto" />
          <span className="inline-block rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
            Admin Portal
          </span>
          <h2 className="mt-4 text-3xl font-semibold leading-tight">
            Operations &amp; Control
          </h2>
          <p className="mt-3 text-blue-100">
            Manage providers, API keys, and platform configuration.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur group-hover:bg-white/20">
            Sign in as admin →
          </div>
        </div>
      </button>

      {/* User side */}
      <button
        type="button"
        className="group relative flex flex-col items-center justify-center overflow-hidden p-14 text-left transition-all hover:brightness-105"
        onClick={() => setView('user-login')}
      >
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#0f766e_0%,#0f172a_60%)]" />
        <div className="absolute bottom-[-16%] right-[-8%] h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div className="relative z-10 max-w-sm text-white">
          <img src="/favicon.svg" alt="Cortex" className="mb-6 h-10 w-10" />
          <span className="inline-block rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold backdrop-blur">
            User Portal
          </span>
          <h2 className="mt-4 text-3xl font-semibold leading-tight">
            API Access &amp; Usage
          </h2>
          <p className="mt-3 text-teal-100">
            Request API keys, track usage, and view your request history.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur group-hover:bg-white/20">
            Sign in / Register →
          </div>
        </div>
      </button>
    </div>
  )
}

async function logoutAdmin(
  setAdmin: (a: Admin | null) => void,
  setView: (v: AuthView) => void,
) {
  try {
    await api.auth.logout()
  } catch (err) {
    if (!(err instanceof ApiError)) console.warn(err)
  }
  sessionStorage.removeItem('cortex_admin_token')
  localStorage.removeItem('cortex_admin_token')
  setAdmin(null)
  setView('landing')
}

export default App
