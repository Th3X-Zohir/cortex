import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  Gauge,
  KeyRound,
  LogOut,
  Monitor,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  TerminalSquare,
  Users,
} from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import type { Admin, Permission } from '@/types'
import { FullScreenLoader, NavButton } from '@/components/shared/AppPrimitives'
import { LoginPage } from '@/pages/LoginPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { AccessPage } from '@/pages/AccessPage'
import { LimitsPage } from '@/pages/LimitsPage'
import { LogsPage } from '@/pages/LogsPage'
import { ProvidersPage } from '@/pages/ProvidersPage'
import { PlaygroundPage } from '@/pages/PlaygroundPage'
import { VncPage } from '@/pages/VncPage'
import { DocsPage } from '@/pages/DocsPage'
import { AdminsPage } from '@/pages/AdminsPage'
import { SettingsPage } from '@/pages/SettingsPage'

type SectionId = 'overview' | 'access' | 'limits' | 'logs' | 'providers' | 'playground' | 'vnc' | 'docs' | 'admins' | 'settings'

const sections: Array<{ id: SectionId; label: string; icon: typeof Activity; permission?: Permission }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3, permission: 'dashboard:read' },
  { id: 'access', label: 'API Access', icon: KeyRound, permission: 'keys:manage' },
  { id: 'limits', label: 'Daily Limits', icon: Gauge, permission: 'dashboard:read' },
  { id: 'logs', label: 'Logs', icon: Activity, permission: 'logs:read' },
  { id: 'providers', label: 'Model Control', icon: Cpu, permission: 'providers:manage' },
  { id: 'playground', label: 'API Playground', icon: TerminalSquare, permission: 'playground:use' },
  { id: 'vnc', label: 'VNC Viewer', icon: Monitor, permission: 'providers:manage' },
  { id: 'docs', label: 'API Docs', icon: BookOpen, permission: 'dashboard:read' },
  { id: 'admins', label: 'Admin Users', icon: Users, permission: 'admins:manage' },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'config:manage' },
]

function App() {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [active, setActive] = useState<SectionId>('overview')
  const [loading, setLoading] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  useEffect(() => {
    api.auth.me()
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

  if (loading) return <FullScreenLoader />
  if (!admin) return <LoginPage onLogin={setAdmin} />

  return (
    <div className="relative min-h-screen overflow-hidden text-[#e9eeff]">
      <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-36 left-[140px] h-[28rem] w-[28rem] rounded-full bg-secondary/12 blur-3xl" />
      <div className="pointer-events-none absolute left-[48%] top-[24%] h-80 w-80 rounded-full bg-accent/10 blur-3xl" />

      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/10 bg-[#0e111b]/80 shadow-[0_24px_64px_rgba(0,0,0,0.52)] backdrop-blur-xl transition-all duration-300 lg:flex ${sidebarCollapsed ? 'w-[92px]' : 'w-[292px]'}`}>
        <div className={`relative flex h-[70px] items-center border-b border-white/10 ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-5'}`}>
          <div className="absolute inset-0 bg-gradient-to-r from-primary/18 via-secondary/10 to-transparent" />
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-primary/35 bg-primary/15 shadow-[0_0_22px_rgba(79,141,255,0.34)]">
            <ShieldCheck size={20} className="text-primary" />
          </div>
          {!sidebarCollapsed && (
            <div className="relative min-w-0 flex-1">
              <p className="truncate bg-gradient-to-r from-primary to-secondary bg-clip-text text-sm font-bold text-transparent">Cortex Workspace</p>
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">Operations Console</p>
            </div>
          )}
          <button
            className={`relative hidden h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.03] text-white/55 transition-all hover:bg-white/[0.08] hover:text-white lg:flex ${sidebarCollapsed ? 'absolute -right-4' : ''}`}
            onClick={() => setSidebarCollapsed(state => !state)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className={`flex-1 space-y-1.5 overflow-y-auto py-5 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          {visibleSections.map(section => (
            <NavButton
              key={section.id}
              active={active === section.id}
              icon={section.icon}
              label={section.label}
              collapsed={sidebarCollapsed}
              onClick={() => setActive(section.id)}
            />
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl">
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/15 text-sm font-bold text-primary">
                {admin.username.slice(0, 2).toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white/95">{admin.username}</p>
                  <p className="text-xs capitalize text-white/50">{admin.role.replace('_', ' ')}</p>
                </div>
              )}
              <button className="rounded-lg p-2 text-white/45 transition-all hover:bg-white/10 hover:text-destructive" onClick={() => logout(setAdmin)}>
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className={`relative transition-all duration-300 ${sidebarCollapsed ? 'lg:pl-[92px]' : 'lg:pl-[292px]'}`}>
        <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0d1018]/80 backdrop-blur-xl">
          <div className="mx-auto flex h-[66px] w-full max-w-[1540px] items-center gap-3 px-4 md:px-8">
            <div className="hidden min-w-[220px] items-center gap-3 lg:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/15">
                <ShieldCheck size={17} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Admin Dashboard</p>
                <p className="text-[11px] text-white/45">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
              </div>
            </div>

            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45" size={16} />
              <input
                className="input h-10 w-full rounded-lg pl-9 text-sm"
                placeholder="Search metrics, logs, models..."
                value={searchValue}
                onChange={event => setSearchValue(event.target.value)}
              />
            </div>

            <div className="hidden items-center gap-2 md:flex">
              <button className="btn-ghost min-h-9 px-3 text-xs">
                <Plus size={14} /> Quick Action
              </button>
              <button className="btn-ghost min-h-9 px-3 text-xs">
                <Download size={14} /> Export
              </button>
              <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-white/65 transition hover:bg-white/[0.1] hover:text-white">
                <Bell size={16} />
              </button>
            </div>

            <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 lg:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/30 bg-primary/15 text-xs font-semibold text-primary">
                {admin.username.slice(0, 2).toUpperCase()}
              </div>
              <span className="max-w-[140px] truncate text-xs text-white/75">{admin.username}</span>
            </div>

            <button className="rounded-lg p-2 text-white/55 transition-all hover:bg-white/[0.08] hover:text-white lg:hidden" onClick={() => logout(setAdmin)}>
              <LogOut size={16} />
            </button>
          </div>

          <div className="mx-auto w-full max-w-[1540px] px-4 pb-3 md:px-8 lg:hidden">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visibleSections.map(section => (
                <button
                  key={section.id}
                  className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${active === section.id ? 'border-primary/35 bg-primary/15 text-primary shadow-[0_8px_20px_rgba(79,141,255,0.28)]' : 'border-white/12 bg-white/[0.04] text-white/65 hover:bg-white/[0.08]'}`}
                  onClick={() => setActive(section.id)}
                >
                  {section.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="relative mx-auto w-full max-w-[1540px] px-4 py-6 md:px-8 md:py-8">
          {admin.mustChangePassword && (
            <div className="mb-5 rounded-2xl border border-warning/35 bg-warning/12 p-4 text-sm text-warning backdrop-blur-xl">
              Default credentials are active. Change the admin password before exposing this service.
            </div>
          )}
          {active === 'overview' && <OverviewPage adminName={admin.username} />}
          {active === 'access' && <AccessPage />}
          {active === 'limits' && <LimitsPage />}
          {active === 'logs' && <LogsPage />}
          {active === 'providers' && <ProvidersPage />}
          {active === 'playground' && <PlaygroundPage />}
          {active === 'vnc' && <VncPage />}
          {active === 'docs' && <DocsPage />}
          {active === 'admins' && <AdminsPage currentAdmin={admin} />}
          {active === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}

async function logout(setAdmin: (admin: Admin | null) => void) {
  try {
    await api.auth.logout()
  } catch (err) {
    if (!(err instanceof ApiError)) console.warn(err)
  }
  sessionStorage.removeItem('cortex_admin_token')
  localStorage.removeItem('cortex_admin_token')
  setAdmin(null)
}

export default App
