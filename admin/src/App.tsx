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
  Users,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { Admin, Permission } from '@/types'
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

const sections: Array<{
  id: SectionId
  label: string
  icon: typeof Activity
  permission?: Permission
  caption: string
}> = [
  { id: 'overview', label: 'Overview', icon: Sparkles, permission: 'dashboard:read', caption: 'Operations pulse and KPIs' },
  { id: 'access', label: 'API Access', icon: KeyRound, permission: 'keys:manage', caption: 'Issue and rotate API keys' },
  { id: 'limits', label: 'Limits', icon: Gauge, permission: 'dashboard:read', caption: 'Daily quotas and request budgets' },
  { id: 'logs', label: 'Logs', icon: Activity, permission: 'logs:read', caption: 'Request logs and audit trail' },
  { id: 'providers', label: 'Providers', icon: Cpu, permission: 'providers:manage', caption: 'Model providers and sessions' },
  { id: 'playground', label: 'Playground', icon: TerminalSquare, permission: 'playground:use', caption: 'Live request testing' },
  { id: 'vnc', label: 'VNC', icon: Monitor, permission: 'providers:manage', caption: 'Remote browser control' },
  { id: 'docs', label: 'API Docs', icon: BookOpen, permission: 'dashboard:read', caption: 'Developer integration guide' },
  { id: 'admins', label: 'Admins', icon: Users, permission: 'admins:manage', caption: 'Users and permissioning' },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'config:manage', caption: 'Runtime and policy settings' },
]

function App() {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<SectionId>('overview')

  useEffect(() => {
    api.auth
      .me()
      .then(setAdmin)
      .catch(() => {
        sessionStorage.removeItem('cortex_admin_token')
        localStorage.removeItem('cortex_admin_token')
      })
      .finally(() => setLoading(false))
  }, [])

  const visibleSections = useMemo(() => {
    const permissions = new Set<Permission>(admin?.permissions ?? [])
    return sections.filter(section => !section.permission || permissions.has(section.permission))
  }, [admin])

  useEffect(() => {
    if (!visibleSections.some(section => section.id === active)) {
      setActive(visibleSections[0]?.id ?? 'overview')
    }
  }, [active, visibleSections])

  if (loading) {
    return (
      <div className="ui-app-shell grid min-h-screen place-items-center p-6">
        <div className="ui-surface w-full max-w-sm text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-slate-300 border-t-blue-700" />
          <p className="text-sm text-slate-600">Loading admin workspace...</p>
        </div>
      </div>
    )
  }

  if (!admin) {
    return <LoginPage onLogin={setAdmin} />
  }

  const current = visibleSections.find(section => section.id === active)

  return (
    <div className="ui-app-shell">
      <div className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:pl-0">
        <aside className="ui-surface hidden h-[calc(100vh-2rem)] flex-col lg:sticky lg:top-4 lg:flex">
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white/92 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Conduit Bridge</p>
                <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Cortex Admin</p>
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
            <button type="button" className="ui-btn-secondary mt-3 w-full" onClick={() => logout(setAdmin)}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </aside>

        <div className="space-y-4">
          <header className="ui-surface">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Command Center</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{current?.label ?? 'Overview'}</h1>
                <p className="mt-1 text-sm text-slate-600">{current?.caption ?? ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="ui-pill-neutral">{new Date().toLocaleDateString()}</span>
                <button type="button" className="ui-btn-secondary lg:hidden" onClick={() => logout(setAdmin)}>
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>

            <div className="ui-scroll mt-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {visibleSections.map(section => (
                <button
                  key={section.id}
                  type="button"
                  className={section.id === active ? 'ui-btn-primary min-h-9 whitespace-nowrap px-3 text-xs' : 'ui-btn-secondary min-h-9 whitespace-nowrap px-3 text-xs'}
                  onClick={() => setActive(section.id)}
                >
                  <section.icon size={14} />
                  {section.label}
                </button>
              ))}
            </div>
          </header>

          {admin.mustChangePassword ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Default admin credentials are still active. Update the account password immediately.
            </div>
          ) : null}

          <main className="pb-6">
            {active === 'overview' ? <OverviewPage adminName={admin.username} /> : null}
            {active === 'access' ? <AccessPage /> : null}
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

async function logout(setAdmin: (admin: Admin | null) => void) {
  try {
    await api.auth.logout()
  } catch (err) {
    if (!(err instanceof ApiError)) {
      console.warn(err)
    }
  }

  sessionStorage.removeItem('cortex_admin_token')
  localStorage.removeItem('cortex_admin_token')
  setAdmin(null)
}

export default App
