import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Copy,
  Cpu,
  ExternalLink,
  Gauge,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Maximize2,
  Minimize2,
  Monitor,
  PlugZap,
  Radio,
  RefreshCcw,
  RotateCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, ApiError } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type {
  Admin,
  ApiKey,
  AuditLog,
  BridgeStatus,
  Config,
  ModelCatalog,
  PlaygroundResponse,
  RequestLog,
  Stats,
  UsageSummary,
  Permission,
} from '@/types'

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

const providerColors = ['hsl(174, 100%, 50%)', 'hsl(270, 80%, 60%)', 'hsl(210, 100%, 65%)', 'hsl(0, 72%, 50%)', 'hsl(142, 68%, 45%)', 'hsl(38, 92%, 50%)']

const emptyStats: Stats = {
  overview: {
    totalRequests: 0,
    requestsLast1h: 0,
    requestsLast24h: 0,
    requestsLast7d: 0,
    avgResponseTime: 0,
    errorCount: 0,
    errorRate: '0%',
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    tokensLast24h: 0,
  },
  byProvider: [],
  byModel: [],
  hourlyData: [],
  providerDistribution: [],
  recentErrors: [],
}

function App() {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [active, setActive] = useState<SectionId>('overview')
  const [loading, setLoading] = useState(true)

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
  if (!admin) return <LoginScreen onLogin={setAdmin} />

  return (
    <div className="min-h-screen bg-[#080808] text-[#f2f2f2]">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col border-r border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl lg:flex">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <ShieldCheck size={20} className="text-primary" />
          </div>
          <div>
            <p className="font-bold text-base bg-gradient-to-r from-primary to-[hsl(270,80%,60%)] bg-clip-text text-transparent">Cortex</p>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Admin</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleSections.map(section => (
            <NavButton
              key={section.id}
              active={active === section.id}
              icon={section.icon}
              label={section.label}
              onClick={() => setActive(section.id)}
            />
          ))}
        </nav>

        {/* User Panel */}
        <div className="border-t border-white/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary font-semibold text-sm shrink-0">
              {admin.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{admin.username}</p>
              <p className="text-xs text-white/40 capitalize">{admin.role.replace('_', ' ')}</p>
            </div>
            <button className="p-2 rounded-lg text-white/40 hover:text-destructive hover:bg-white/5 transition-all" onClick={() => logout(setAdmin)}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-[280px]">
        {/* Mobile Header */}
        <header className="sticky top-0 z-20 border-b border-white/5 bg-[#080808]/80 backdrop-blur-xl px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <ShieldCheck size={18} className="text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm bg-gradient-to-r from-primary to-[hsl(270,80%,60%)] bg-clip-text text-transparent">Cortex</p>
                <p className="text-[10px] text-white/40">{admin.username}</p>
              </div>
            </div>
            <button className="p-2 rounded-lg text-white/40 hover:text-foreground hover:bg-white/5 transition-all" onClick={() => logout(setAdmin)}>
              <LogOut size={16} />
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {visibleSections.map(section => (
              <button
                key={section.id}
                className={`rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-all ${active === section.id ? 'bg-primary/15 text-primary border border-primary/20' : 'text-white/60 bg-white/5 border border-transparent hover:bg-white/10'}`}
                onClick={() => setActive(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </header>

        {/* Page Content */}
        <div className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
          {admin.mustChangePassword && (
            <div className="mb-5 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning backdrop-blur-xl">
              Default credentials are active. Change the admin password before exposing this service.
            </div>
          )}
          {active === 'overview' && <Overview />}
          {active === 'access' && <AccessManagement />}
          {active === 'limits' && <DailyLimits />}
          {active === 'logs' && <Logs />}
          {active === 'providers' && <Providers />}
          {active === 'playground' && <ApiPlayground />}
          {active === 'vnc' && <VncViewer />}
          {active === 'docs' && <ApiDocs />}
          {active === 'admins' && <AdminUsers currentAdmin={admin} />}
          {active === 'settings' && <SettingsPanel />}
        </div>
      </main>
    </div>
  )
}

function LoginScreen({ onLogin }: { onLogin: (admin: Admin) => void }) {
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
      onLogin({ ...response.admin, permissions: response.permissions })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-[#080808] lg:grid-cols-[minmax(0,1fr)_520px]">
      {/* Left Panel - Dark Glassmorphism */}
      <section className="hidden border-r border-white/5 bg-[#0a0a0a]/50 lg:flex lg:flex-col lg:justify-between backdrop-blur-xl">
        <div className="p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <ShieldCheck size={24} className="text-primary" />
            </div>
            <p className="text-xl font-bold bg-gradient-to-r from-primary to-[hsl(270,80%,60%)] bg-clip-text text-transparent">Cortex Admin</p>
          </div>
          <div className="mt-24 max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Secure operations</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight bg-gradient-to-b from-white to-white/60 bg-clip-text text-transparent">
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

      {/* Right Panel - Login Form */}
      <section className="flex items-center justify-center px-5 py-10">
        <form className="w-full max-w-sm" onSubmit={submit}>
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
                <ShieldCheck size={22} className="text-primary" />
              </div>
              <p className="text-lg font-bold bg-gradient-to-r from-primary to-[hsl(270,80%,60%)] bg-clip-text text-transparent">Cortex Admin</p>
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

function Overview() {
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [nextStats, nextUsage, nextStatus] = await Promise.all([
        api.stats.get(),
        api.admin.usage(),
        api.providers.status(),
      ])
      setStats(nextStats)
      setUsage(nextUsage)
      setStatus(nextStatus)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const providers = status?.providers ?? []
  const connectedProviders = providers.filter(provider => provider.sessionValid).length
  const totalProviders = providers.length
  const providerHealthPercent = totalProviders ? Math.round((connectedProviders / totalProviders) * 100) : 0
  const usagePercent = usage?.summary.usagePercent ?? 0
  const errorRateValue = Number.parseFloat(stats.overview.errorRate) || 0
  const healthState = errorRateValue > 5 || usagePercent > 90 || (totalProviders > 0 && connectedProviders === 0)
    ? 'Needs attention'
    : errorRateValue > 1 || usagePercent > 75 || providerHealthPercent < 100
      ? 'Watch'
      : 'Healthy'
  const healthTone = healthState === 'Healthy' ? 'text-primary' : healthState === 'Watch' ? 'text-warning' : 'text-destructive'
  const maxModelCount = Math.max(1, ...stats.byModel.slice(0, 8).map(item => item.count))

  const kpis = [
    {
      label: 'Requests 24h',
      value: formatNumber(stats.overview.requestsLast24h),
      helper: `${formatNumber(stats.overview.requestsLast1h)} last hour`,
      icon: Activity,
      tone: 'text-primary',
    },
    {
      label: 'Error rate',
      value: stats.overview.errorRate,
      helper: `${formatNumber(stats.overview.errorCount)} failures`,
      icon: AlertTriangle,
      tone: errorRateValue > 5 ? 'text-destructive' : errorRateValue > 1 ? 'text-warning' : 'text-primary',
    },
    {
      label: 'Latency',
      value: `${formatNumber(stats.overview.avgResponseTime)} ms`,
      helper: 'Average response',
      icon: Clock3,
      tone: 'text-[hsl(210,100%,65%)]',
    },
    {
      label: 'Daily limits',
      value: `${usagePercent}%`,
      helper: `${formatNumber(usage?.summary.totalUsage ?? 0)} / ${formatNumber(usage?.summary.totalLimit ?? 0)}`,
      icon: Gauge,
      tone: usagePercent > 85 ? 'text-warning' : 'text-primary',
    },
  ]

  return (
    <Page title="Overview" description="Production traffic, provider readiness, error pressure, and quota usage." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="space-y-5">
        <section className="animate-fade-in overflow-hidden rounded-lg border border-white/10 bg-[#0b0b0b]">
          <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`status-pill border-white/10 bg-white/[0.04] ${healthTone}`}>
                  <Activity size={14} /> {healthState}
                </span>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">
                  Refreshes every 30s
                </span>
              </div>
              <div className="mt-8 max-w-3xl">
                <p className="label text-primary">Operations overview</p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-white md:text-5xl">
                  {formatNumber(stats.overview.requestsLast24h)} requests moved through Cortex today.
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-white/55">
                  Provider sessions, quota pressure, and request failures are tracked from live admin telemetry.
                </p>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4 transition duration-300 hover:border-primary/30 hover:bg-white/[0.04]">
                  <p className="label text-white/40">Connected</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{connectedProviders}/{totalProviders}</p>
                  <p className="mt-1 text-xs text-white/40">Provider sessions</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4 transition duration-300 hover:border-primary/30 hover:bg-white/[0.04]">
                  <p className="label text-white/40">Daily usage</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{usagePercent}%</p>
                  <p className="mt-1 text-xs text-white/40">{formatNumber(usage?.summary.activeKeys ?? 0)} active keys</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.025] p-4 transition duration-300 hover:border-primary/30 hover:bg-white/[0.04]">
                  <p className="label text-white/40">Tokens 24h</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{formatNumber(stats.overview.tokensLast24h)}</p>
                  <p className="mt-1 text-xs text-white/40">{formatNumber(stats.overview.totalTokens)} lifetime</p>
                </div>
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/[0.018] p-6 xl:border-l xl:border-t-0">
              <p className="label text-white/40">Readiness</p>
              <div className="mt-5 flex items-end gap-3">
                <p className="text-6xl font-semibold tracking-tight text-white">{providerHealthPercent}</p>
                <p className="pb-2 text-lg text-white/45">%</p>
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${providerHealthPercent}%` }}
                />
              </div>
              <div className="mt-6 space-y-3">
                {providers.slice(0, 4).map(provider => (
                  <div key={provider.name} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{provider.name}</p>
                      <p className="text-xs text-white/35">{provider.models.length} models</p>
                    </div>
                    <span className={provider.sessionValid ? 'status-success' : provider.hasProfile ? 'status-warning' : 'status-primary'}>
                      {provider.sessionValid ? 'Ready' : provider.hasProfile ? 'Profile' : 'Offline'}
                    </span>
                  </div>
                ))}
                {providers.length === 0 && <p className="text-sm text-white/45">No provider status yet.</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((item, index) => (
            <div
              key={item.label}
              className={`animate-fade-in stagger-${Math.min(index + 1, 8)} rounded-lg border border-white/10 bg-white/[0.025] p-4 transition duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white/[0.045]`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="label text-white/40">{item.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-white">{item.value}</p>
                  <p className="mt-1 text-sm text-white/40">{item.helper}</p>
                </div>
                <div className={`rounded-lg border border-white/10 bg-white/[0.04] p-2 ${item.tone}`}>
                  <item.icon size={18} />
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_390px]">
          <div className="animate-fade-in rounded-lg border border-white/10 bg-white/[0.025] p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Traffic trend</h2>
                <p className="mt-1 text-sm text-white/45">Requests and token volume by hour.</p>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/45">
                {formatNumber(stats.overview.requestsLast7d)} requests / 7d
              </span>
            </div>
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.hourlyData} margin={{ top: 10, right: 14, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="overviewRequestFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(174, 100%, 50%)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(174, 100%, 50%)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="overviewTokenFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(142, 68%, 45%)" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="hsl(142, 68%, 45%)" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} minTickGap={30} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.4)' }} width={42} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(11,11,11,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="count" stroke="hsl(174, 100%, 50%)" fill="url(#overviewRequestFill)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Area type="monotone" dataKey="totalTokens" stroke="hsl(142, 68%, 45%)" fill="url(#overviewTokenFill)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="animate-fade-in rounded-lg border border-white/10 bg-white/[0.025] p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-white">Provider mix</h2>
              <p className="mt-1 text-sm text-white/45">Request share by provider.</p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.providerDistribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>
                    {stats.providerDistribution.map((_, index) => (
                      <Cell key={index} fill={providerColors[index % providerColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(11,11,11,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {stats.providerDistribution.slice(0, 5).map((item, index) => (
                <div key={item.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-white/65">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: providerColors[index % providerColors.length] }} />
                    <span className="truncate">{item.name}</span>
                  </span>
                  <span className="font-mono text-xs text-white/45">{formatNumber(item.value)}</span>
                </div>
              ))}
              {stats.providerDistribution.length === 0 && <p className="text-sm text-white/45">No provider traffic yet.</p>}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
          <div className="animate-fade-in rounded-lg border border-white/10 bg-white/[0.025] p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Top models</h2>
                <p className="mt-1 text-sm text-white/45">Highest request volume in retained logs.</p>
              </div>
              <Cpu className="text-primary" size={20} />
            </div>
            <div className="space-y-4">
              {stats.byModel.slice(0, 8).map((item, index) => (
                <div key={item.model} className="group">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-mono text-xs text-white/70">{item.model}</p>
                    <p className="shrink-0 text-xs text-white/45">{formatNumber(item.count)} requests</p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700 group-hover:bg-[hsl(142,68%,45%)]"
                      style={{ width: `${Math.max(6, Math.round((item.count / maxModelCount) * 100))}%`, transitionDelay: `${index * 45}ms` }}
                    />
                  </div>
                </div>
              ))}
              {stats.byModel.length === 0 && <EmptyState icon={Cpu} message="No model usage yet." />}
            </div>
          </div>

          <div className="animate-fade-in rounded-lg border border-white/10 bg-white/[0.025] p-5">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Failure queue</h2>
                <p className="mt-1 text-sm text-white/45">Latest rejected or failed requests.</p>
              </div>
              <AlertTriangle className={stats.recentErrors.length ? 'text-warning' : 'text-primary'} size={20} />
            </div>
            <div className="space-y-3">
              {stats.recentErrors.slice(0, 5).map(item => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-3 transition duration-300 hover:border-warning/30 hover:bg-white/[0.04]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-primary/80">{item.model}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-white/60">{item.error || 'Request failed'}</p>
                    </div>
                    <StatusCode code={item.statusCode} />
                  </div>
                  <p className="mt-2 text-xs text-white/35">{item.provider} · {formatDate(item.createdAt)}</p>
                </div>
              ))}
              {stats.recentErrors.length === 0 && <EmptyState icon={CheckCircle2} message="No recent failures." />}
            </div>
          </div>
        </section>
      </div>
    </Page>
  )
}

function AccessManagement() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', dailyLimit: 1000, rateLimitPerMin: 60 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setKeys(await api.admin.keys.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createKey(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const response = await api.admin.keys.create(form)
      setCreatedKey(response.key)
      setForm({ name: '', dailyLimit: 1000, rateLimitPerMin: 60 })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create key')
    }
  }

  async function updateKey(id: string, data: Partial<ApiKey>) {
    await api.admin.keys.update(id, data)
    await load()
  }

  async function deleteKey(id: string) {
    if (!window.confirm('Delete this API key? Existing clients will lose access immediately.')) return
    await api.admin.keys.delete(id)
    await load()
  }

  return (
    <Page title="API Access" description="Issue, disable, rotate, and tune token-based access for OpenAI-compatible API clients." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Panel title="Create API key" description="The secret is shown once. Store it in the consuming service.">
          <form className="space-y-4" onSubmit={createKey}>
            <Field label="Key name">
              <input className="input" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Production gateway" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Daily limit">
                <input className="input" type="number" min={1} value={form.dailyLimit} onChange={event => setForm({ ...form, dailyLimit: Number(event.target.value) })} />
              </Field>
              <Field label="Rate per minute">
                <input className="input" type="number" min={1} value={form.rateLimitPerMin} onChange={event => setForm({ ...form, rateLimitPerMin: Number(event.target.value) })} />
              </Field>
            </div>
            {error && <Alert tone="bad">{error}</Alert>}
            <button className="btn-primary w-full">Create key</button>
          </form>
          {createdKey && (
            <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4 backdrop-blur-xl">
              <p className="text-sm font-semibold text-primary">New API key</p>
              <code className="mt-2 block break-all rounded-lg bg-black/40 p-3 text-sm font-mono text-primary">{createdKey}</code>
              <p className="mt-2 text-xs text-white/40">This value cannot be shown again.</p>
            </div>
          )}
        </Panel>

        <Panel title="Managed keys" description="Operational access tokens and their current limit state.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-white/5 text-xs uppercase text-white/40">
                <tr>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Prefix</th>
                  <th className="py-3 pr-4">Today</th>
                  <th className="py-3 pr-4">Limit</th>
                  <th className="py-3 pr-4">Rate</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Last used</th>
                  <th className="py-3 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => (
                  <ApiKeyRow key={key.id} item={key} onUpdate={updateKey} onDelete={deleteKey} />
                ))}
              </tbody>
            </table>
          </div>
          {keys.length === 0 && <EmptyState icon={KeyRound} message="No API keys have been created." />}
        </Panel>
      </div>
    </Page>
  )
}

function ApiKeyRow({ item, onUpdate, onDelete }: { item: ApiKey; onUpdate: (id: string, data: Partial<ApiKey>) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: item.name, dailyLimit: item.dailyLimit, rateLimitPerMin: item.rateLimitPerMin })
  const usagePercent = item.dailyLimit > 0 ? Math.min(100, Math.round((item.requestsToday / item.dailyLimit) * 100)) : 0

  async function save() {
    await onUpdate(item.id, draft)
    setEditing(false)
  }

  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-3 pr-4">
        {editing ? <input className="input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /> : <span className="font-semibold">{item.name}</span>}
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-primary/60">{item.keyPrefix}...</td>
      <td className="py-3 pr-4">
        <div className="h-2 w-28 rounded-full bg-white/5">
          <div className={`h-2 rounded-full transition-all ${usagePercent > 90 ? 'bg-destructive' : usagePercent > 75 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${usagePercent}%` }} />
        </div>
        <span className="mt-1 block text-xs text-white/40">{formatNumber(item.requestsToday)}</span>
      </td>
      <td className="py-3 pr-4">
        {editing ? <input className="input w-28" type="number" min={1} value={draft.dailyLimit} onChange={event => setDraft({ ...draft, dailyLimit: Number(event.target.value) })} /> : formatNumber(item.dailyLimit)}
      </td>
      <td className="py-3 pr-4">
        {editing ? <input className="input w-24" type="number" min={1} value={draft.rateLimitPerMin} onChange={event => setDraft({ ...draft, rateLimitPerMin: Number(event.target.value) })} /> : `${item.rateLimitPerMin}/min`}
      </td>
      <td className="py-3 pr-4"><StatusPill ok={item.active} trueLabel="Active" falseLabel="Disabled" /></td>
      <td className="py-3 pr-4 text-white/40">{item.lastUsed ? formatDate(item.lastUsed) : 'Never'}</td>
      <td className="py-3 pr-0">
        <div className="flex justify-end gap-2">
          {editing ? (
            <button className="btn-primary min-h-9 px-3" onClick={save}>Save</button>
          ) : (
            <button className="btn-ghost min-h-9 px-3" onClick={() => setEditing(true)}>Edit</button>
          )}
          <button className="btn-ghost min-h-9 px-3" onClick={() => onUpdate(item.id, { active: !item.active })}>{item.active ? 'Disable' : 'Enable'}</button>
          <button className="btn-ghost min-h-9 px-3 text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id)}><Trash2 size={15} /></button>
        </div>
      </td>
    </tr>
  )
}

function DailyLimits() {
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const [nextUsage, nextKeys] = await Promise.all([api.admin.usage(), api.admin.keys.list()])
      setUsage(nextUsage)
      setKeys(nextKeys)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function updateLimit(id: string, dailyLimit: number) {
    await api.admin.keys.update(id, { dailyLimit })
    await load()
  }

  return (
    <Page title="Daily Limits" description="Monitor consumption against daily caps and adjust capacity before clients are throttled." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Metric label="Total usage" value={formatNumber(usage?.summary.totalUsage ?? 0)} helper={`${usage?.summary.usagePercent ?? 0}% of daily capacity`} icon={Gauge} />
        <Metric label="Total limit" value={formatNumber(usage?.summary.totalLimit ?? 0)} helper="Combined active and inactive keys" icon={SlidersHorizontal} />
        <Metric label="Active keys" value={formatNumber(usage?.summary.activeKeys ?? 0)} helper="Currently accepting requests" icon={KeyRound} />
        <Metric label="Tokens today" value={formatNumber(usage?.summary.tokensToday ?? 0)} helper={`${formatNumber(usage?.summary.totalTokens ?? 0)} lifetime`} icon={Cpu} />
      </div>
      <Panel title="Limit controls" description="Daily limits reset at the next UTC day boundary." className="mt-5">
        <div className="space-y-4">
          {(usage?.keys ?? []).map(item => {
            const key = keys.find(candidate => candidate.id === item.id)
            return (
              <div key={item.id} className="grid gap-3 border-b border-white/5 pb-4 last:border-0 last:pb-0 lg:grid-cols-[minmax(180px,1fr)_minmax(240px,2fr)_180px_150px_140px] lg:items-center">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-white/40">{item.active ? 'Active' : 'Disabled'} · resets {formatDate(item.requestsTodayReset)}</p>
                </div>
                <div>
                  <div className="h-3 rounded-full bg-white/5">
                    <div className={`h-3 rounded-full transition-all ${item.usagePercent > 90 ? 'bg-destructive' : item.usagePercent > 75 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${Math.min(100, item.usagePercent)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-white/40">{formatNumber(item.requestsToday)} of {formatNumber(item.dailyLimit)} requests</p>
                </div>
                <input className="input" type="number" min={1} defaultValue={item.dailyLimit} onBlur={event => updateLimit(item.id, Number(event.target.value))} />
                <p className="text-sm text-white/60">{formatNumber(item.tokensToday)} tokens today</p>
                <p className="text-sm text-white/60">{key?.rateLimitPerMin ?? 0}/min</p>
              </div>
            )
          })}
        </div>
        {(usage?.keys ?? []).length === 0 && <EmptyState icon={Gauge} message="Create an API key to start tracking limits." />}
      </Panel>
    </Page>
  )
}

function Logs() {
  const [tab, setTab] = useState<'requests' | 'audit'>('requests')
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [filters, setFilters] = useState({ search: '', provider: '', statusCode: '', apiKeyId: '' })
  const [loading, setLoading] = useState(true)
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null)
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [requestResult, auditResult, keyList] = await Promise.all([
        api.logs.list({
          limit: 100,
          search: filters.search || undefined,
          provider: filters.provider || undefined,
          statusCode: filters.statusCode ? Number(filters.statusCode) : undefined,
          apiKeyId: filters.apiKeyId || undefined,
        }),
        api.logs.audit({ limit: 100, search: filters.search || undefined }),
        api.admin.keys.list(),
      ])
      setLogs(requestResult.logs)
      setAuditLogs(auditResult.logs)
      setKeys(keyList)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function prune() {
    const days = Number(window.prompt('Delete request logs older than how many days?', '90'))
    if (!Number.isFinite(days) || days < 1) return
    await api.logs.prune(days)
    await load()
  }

  return (
    <Page title="Logs" description="Search request logs, failures, access events, and admin changes." action={<div className="flex gap-2"><button className="btn-ghost" onClick={prune}>Prune</button><RefreshButton onClick={load} loading={loading} /></div>}>
      <Panel title="Filters" description="Filter by client key, provider, status, or free text.">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_160px_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-white/40" size={16} />
            <input className="input pl-9" placeholder="Search model, key, error, action" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} />
          </div>
          <input className="input" placeholder="Provider" value={filters.provider} onChange={event => setFilters({ ...filters, provider: event.target.value })} />
          <input className="input" placeholder="Status code" value={filters.statusCode} onChange={event => setFilters({ ...filters, statusCode: event.target.value })} />
          <select className="input" value={filters.apiKeyId} onChange={event => setFilters({ ...filters, apiKeyId: event.target.value })}>
            <option value="">All keys</option>
            {keys.map(key => <option key={key.id} value={key.id}>{key.name}</option>)}
          </select>
          <button className="btn-primary" onClick={load}>Apply</button>
        </div>
      </Panel>

      <div className="mt-5 flex gap-2">
        <button className={tab === 'requests' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('requests')}>Request logs</button>
        <button className={tab === 'audit' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('audit')}>Audit trail</button>
      </div>

      {tab === 'requests' ? (
        <Panel title="API request logs" description="Provider calls and rejected access attempts." className="mt-5">
          <DataTable headers={['Time', 'Key', 'Provider', 'Model', 'Status', 'Latency', 'Tokens', 'Summary', 'Details']}>
            {logs.map(log => (
              <Fragment key={log.id}>
                <tr className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4 text-white/40">{formatDate(log.createdAt)}</td>
                  <td className="py-3 pr-4">{log.apiKeyName ?? 'Unknown'}</td>
                  <td className="py-3 pr-4">{log.provider}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-primary/60">{log.model}</td>
                  <td className="py-3 pr-4"><StatusCode code={log.statusCode} /></td>
                  <td className="py-3 pr-4">{log.responseTimeMs ?? 0} ms</td>
                  <td className="py-3 pr-4">
                    <div className="text-xs">
                      <p className="font-semibold">{formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)}</p>
                      <p className="text-white/40">in {formatNumber(log.promptTokens ?? 0)} / out {formatNumber(log.completionTokens ?? 0)}</p>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-sm text-white/60">{log.error || `${log.messagesCount} messages${log.stream ? ' · stream' : ''}`}</td>
                  <td className="py-3 pr-4">
                    <button className="btn-ghost min-h-8 px-3 py-1 text-xs" onClick={() => setExpandedRequestId(expandedRequestId === log.id ? null : log.id)}>
                      {expandedRequestId === log.id ? 'Hide' : 'View'}
                    </button>
                  </td>
                </tr>
                {expandedRequestId === log.id && (
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <td colSpan={9} className="p-4">
                      <RequestLogDetails log={log} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </DataTable>
          {logs.length === 0 && <EmptyState icon={Activity} message="No matching request logs." />}
        </Panel>
      ) : (
        <Panel title="Admin audit trail" description="Authentication, key, provider, and settings actions." className="mt-5">
          <DataTable headers={['Time', 'Admin', 'Action', 'Entity', 'IP address', 'Metadata', 'Details']}>
            {auditLogs.map(log => (
              <Fragment key={log.id}>
                <tr className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4 text-white/40">{formatDate(log.createdAt)}</td>
                  <td className="py-3 pr-4">{log.adminUsername ?? 'System'}</td>
                  <td className="py-3 pr-4 font-semibold text-primary">{log.action.replace(/_/g, ' ')}</td>
                  <td className="py-3 pr-4">{log.entityType}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}</td>
                  <td className="py-3 pr-4 text-white/60">{log.ipAddress ?? 'Unknown'}</td>
                  <td className="max-w-sm truncate py-3 pr-4 text-xs text-white/40">{log.metadata ? JSON.stringify(log.metadata) : ''}</td>
                  <td className="py-3 pr-4">
                    <button className="btn-ghost min-h-8 px-3 py-1 text-xs" onClick={() => setExpandedAuditId(expandedAuditId === log.id ? null : log.id)}>
                      {expandedAuditId === log.id ? 'Hide' : 'View'}
                    </button>
                  </td>
                </tr>
                {expandedAuditId === log.id && (
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <td colSpan={7} className="p-4">
                      <AuditLogDetails log={log} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </DataTable>
          {auditLogs.length === 0 && <EmptyState icon={ShieldCheck} message="No matching audit events." />}
        </Panel>
      )}
    </Page>
  )
}

function RequestLogDetails({ log }: { log: RequestLog }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <DetailItem label="Log ID" value={log.id} mono />
        <DetailItem label="Created" value={formatDate(log.createdAt)} />
        <DetailItem label="Status code" value={log.statusCode ?? 'Pending'} />
        <DetailItem label="API key name" value={log.apiKeyName ?? 'Unknown'} />
        <DetailItem label="API key ID" value={log.apiKeyId ?? 'None'} mono />
        <DetailItem label="Stream" value={log.stream ? 'Yes' : 'No'} />
        <DetailItem label="Provider" value={log.provider} />
        <DetailItem label="Model" value={log.model} mono />
        <DetailItem label="Messages" value={formatNumber(log.messagesCount)} />
        <DetailItem label="Latency" value={`${log.responseTimeMs ?? 0} ms`} />
        <DetailItem label="Input tokens" value={formatNumber(log.promptTokens ?? 0)} />
        <DetailItem label="Output tokens" value={formatNumber(log.completionTokens ?? 0)} />
        <DetailItem label="Total tokens" value={formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)} />
        <DetailItem label="IP address" value={log.ipAddress ?? 'Unknown'} mono />
        <DetailItem label="User agent" value={log.userAgent ?? 'Unknown'} wide />
      </div>
      {log.error && (
        <div>
          <p className="label text-white/60">Error detail</p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">{log.error}</pre>
        </div>
      )}
    </div>
  )
}

function AuditLogDetails({ log }: { log: AuditLog }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <DetailItem label="Audit ID" value={log.id} mono />
        <DetailItem label="Created" value={formatDate(log.createdAt)} />
        <DetailItem label="Action" value={log.action.replace(/_/g, ' ')} />
        <DetailItem label="Admin" value={log.adminUsername ?? 'System'} />
        <DetailItem label="Admin ID" value={log.adminId ?? 'None'} mono />
        <DetailItem label="Entity type" value={log.entityType} />
        <DetailItem label="Entity ID" value={log.entityId ?? 'None'} mono />
        <DetailItem label="IP address" value={log.ipAddress ?? 'Unknown'} mono />
        <DetailItem label="User agent" value={log.userAgent ?? 'Unknown'} wide />
      </div>
      <div>
        <p className="label text-white/60">Metadata</p>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-white/5 border border-white/10 p-3 text-xs">
          {log.metadata ? JSON.stringify(log.metadata, null, 2) : 'No metadata'}
        </pre>
      </div>
    </div>
  )
}

function DetailItem({ label, value, mono = false, wide = false }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-3' : ''}>
      <p className="label text-white/60">{label}</p>
      <p className={`mt-1 break-words text-sm ${mono ? 'font-mono text-xs text-primary/60' : ''}`}>{value}</p>
    </div>
  )
}

function ApiPlayground() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('You are a precise assistant for operational testing.')
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<'standard' | 'stream'>('standard')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(800)
  const [newConversation, setNewConversation] = useState(true)
  const [vncSize, setVncSize] = useState<'standard' | 'large'>('large')
  const [vncFrameKey, setVncFrameKey] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [activeSurface, setActiveSurface] = useState<'response' | 'vnc' | 'json' | 'history'>('response')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [usage, setUsage] = useState<PlaygroundResponse['usage'] | null>(null)
  const [rawRequest, setRawRequest] = useState('')
  const [rawResponse, setRawResponse] = useState('')
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [result, setResult] = useState<PlaygroundResponse | null>(null)
  const [history, setHistory] = useState<Array<{ id: string; at: string; model: string; provider: string; mode: string; latency: number; tokens: number; status: string }>>([])

  async function load() {
    setLoading(true)
    try {
      const next = await api.providers.models()
      setCatalog(next)
      setModel(current => current || next.models[0]?.id || '')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const selectedModel = catalog?.models.find(item => item.id === model)
  const selectedProvider = catalog?.providers.find(provider => provider.name === selectedModel?.provider)
  const vncUrl = catalog?.vnc.url

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setResult(null)
    setResponseText('')
    setUsage(null)
    setRawResponse('')
    setElapsedMs(null)

    const trimmedPrompt = prompt.trim()
    if (!model) {
      setError('Select a model before sending a request.')
      return
    }
    if (!trimmedPrompt) {
      setError('Enter a user prompt before sending a request.')
      return
    }

    setSubmitting(true)
    const startedAt = performance.now()
    try {
      const messages = [
        ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
        { role: 'user' as const, content: trimmedPrompt },
      ]
      const payload = {
        model,
        messages,
        stream: mode === 'stream',
        temperature,
        max_tokens: maxTokens,
        newConversation,
      }
      setRawRequest(JSON.stringify(payload, null, 2))

      if (mode === 'stream') {
        const controller = new AbortController()
        setAbortController(controller)
        let streamed = ''
        let finalPayload: Partial<PlaygroundResponse> & { usage?: PlaygroundResponse['usage'] } = {}

        await api.playground.stream(payload, {
          signal: controller.signal,
          onChunk: chunk => {
            streamed += chunk
            setResponseText(streamed)
          },
          onDone: payload => {
            finalPayload = payload
            if (payload.usage) setUsage(payload.usage)
          },
          onError: message => setError(message),
        })

        const elapsed = Math.round(performance.now() - startedAt)
        const finalUsage = finalPayload.usage ?? {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        }
        const responsePayload = {
          ...finalPayload,
          model,
          provider: selectedModel?.provider ?? 'unknown',
          choices: [{ index: 0, message: { role: 'assistant', content: streamed }, finish_reason: 'stop' }],
          usage: finalUsage,
        }
        setElapsedMs(elapsed)
        setUsage(finalUsage)
        setRawResponse(JSON.stringify(responsePayload, null, 2))
        setHistory(items => [{
          id: `${Date.now()}`,
          at: new Date().toISOString(),
          model,
          provider: selectedModel?.provider ?? 'unknown',
          mode: 'stream',
          latency: elapsed,
          tokens: finalUsage.total_tokens,
          status: streamed ? 'ok' : 'empty',
        }, ...items].slice(0, 8))
      } else {
        const next = await api.playground.chat(payload)
        const elapsed = Math.round(performance.now() - startedAt)
        setResult(next)
        setResponseText(next.choices[0]?.message.content ?? '')
        setUsage(next.usage)
        setElapsedMs(elapsed)
        setRawResponse(JSON.stringify(next, null, 2))
        setHistory(items => [{
          id: next.id,
          at: new Date().toISOString(),
          model: next.model,
          provider: next.provider,
          mode: 'standard',
          latency: elapsed,
          tokens: next.usage.total_tokens,
          status: 'ok',
        }, ...items].slice(0, 8))
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') setError('Streaming request stopped.')
      else setError(err instanceof Error ? err.message : 'Playground request failed')
    } finally {
      setSubmitting(false)
      setAbortController(null)
    }
  }

  async function providerAction(operation: 'login' | 'logout') {
    if (!selectedModel) return
    setError(null)
    try {
      if (operation === 'login') await api.providers.login(selectedModel.provider)
      else await api.providers.logout(selectedModel.provider)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider action failed')
    }
  }

  const workspace = (
    <>
      {error && <Alert tone="bad">{error}</Alert>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
          <button type="button" className={mode === 'standard' ? 'btn-primary min-h-9 px-4 py-2 text-xs' : 'btn-ghost min-h-9 px-4 py-2 text-xs'} onClick={() => setMode('standard')} disabled={submitting}>Non-streaming</button>
          <button type="button" className={mode === 'stream' ? 'btn-primary min-h-9 px-4 py-2 text-xs' : 'btn-ghost min-h-9 px-4 py-2 text-xs'} onClick={() => setMode('stream')} disabled={submitting}><Radio size={14} /> Streaming</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={load} disabled={loading}><RefreshCcw className={loading ? 'animate-spin' : ''} size={16} /> Refresh</button>
          <button type="button" className="btn-ghost" onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        <section className="rounded-xl border border-white/10 bg-white/[0.025] p-5 backdrop-blur-xl">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Request</h2>
              <p className="mt-1 text-sm text-white/45">Model, prompt, and run controls.</p>
            </div>
            <span className={selectedProvider?.sessionValid ? 'status-primary' : 'status-warning'}>
              {selectedProvider?.sessionValid ? 'Connected' : selectedProvider?.hasProfile ? 'Profile found' : 'Offline'}
            </span>
          </div>

          <form className="space-y-4" onSubmit={submit}>
            <Field label="Model">
              <ModelPicker
                models={catalog?.models ?? []}
                providers={catalog?.providers ?? []}
                value={model}
                onChange={setModel}
                disabled={loading || submitting}
              />
            </Field>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <p className="label text-white/45">Provider</p>
                <p className="mt-1 truncate text-lg font-semibold text-white">{selectedModel?.provider ?? 'None'}</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <p className="label text-white/45">Limit</p>
                <p className="mt-1 text-lg font-semibold text-white">Unlimited</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Temperature">
                <input className="input" type="number" min="0" max="2" step="0.1" value={temperature} onChange={event => setTemperature(Number(event.target.value))} />
              </Field>
              <Field label="Max tokens">
                <input className="input" type="number" min="1" max="32000" value={maxTokens} onChange={event => setMaxTokens(Number(event.target.value))} />
              </Field>
            </div>
            <Field label="System prompt">
              <textarea className="input min-h-20 resize-y" value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} />
            </Field>
            <Field label="User prompt">
              <textarea className="input min-h-36 resize-y" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Write the request to test..." />
            </Field>
            <label className="flex items-center gap-2 text-sm text-white/60">
              <input type="checkbox" checked={newConversation} onChange={event => setNewConversation(event.target.checked)} className="accent-primary" />
              Start a fresh provider conversation
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn-primary w-full" type="submit" disabled={submitting || loading || !model}>
                {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
                {mode === 'stream' ? 'Start stream' : 'Send request'}
              </button>
              <button className="btn-ghost w-full" type="button" disabled={!submitting || !abortController} onClick={() => abortController?.abort()}>
                Stop stream
              </button>
            </div>
          </form>

          <div className="mt-5 border-t border-white/5 pt-4">
            <p className="label text-white/45">Provider controls</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={() => providerAction('login')} disabled={!selectedModel || selectedModel.provider.endsWith('-api')}>Login</button>
              <button type="button" className="btn-ghost" onClick={() => providerAction('logout')} disabled={!selectedModel}>Logout</button>
              {vncUrl && <a className="btn-ghost" href={vncUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open VNC</a>}
            </div>
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] backdrop-blur-xl">
          <div className="border-b border-white/5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {activeSurface === 'response' ? 'Response' : activeSurface === 'vnc' ? 'Live VNC' : activeSurface === 'json' ? 'JSON' : 'Run history'}
                </h2>
                <p className="mt-1 text-sm text-white/45">
                  {activeSurface === 'response' ? 'Streaming output and request metrics.' : activeSurface === 'vnc' ? 'Provider browser control without crowding the page.' : activeSurface === 'json' ? 'Exact request and response envelopes.' : 'Recent requests from this session.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  ['response', 'Response', TerminalSquare],
                  ['vnc', 'VNC', Monitor],
                  ['json', 'JSON', Cpu],
                  ['history', 'History', Activity],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value as string}
                    type="button"
                    className={activeSurface === value ? 'btn-primary min-h-9 px-3 py-2 text-xs' : 'btn-ghost min-h-9 px-3 py-2 text-xs'}
                    onClick={() => setActiveSurface(value as typeof activeSurface)}
                  >
                    <Icon size={14} /> {label as string}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {activeSurface === 'response' && (
            <div className="space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-4">
                {[
                  { label: 'Mode', value: mode === 'stream' ? 'Stream' : 'Standard', helper: submitting ? 'Running' : 'Ready', icon: mode === 'stream' ? Radio : TerminalSquare },
                  { label: 'Latency', value: elapsedMs === null ? '-' : `${formatNumber(elapsedMs)} ms`, helper: 'Last request', icon: Clock3 },
                  { label: 'Input', value: formatNumber(usage?.prompt_tokens ?? 0), helper: 'tokens', icon: TerminalSquare },
                  { label: 'Output', value: formatNumber(usage?.completion_tokens ?? 0), helper: `${formatNumber(usage?.total_tokens ?? 0)} total`, icon: Cpu },
                ].map(stat => (
                  <div key={stat.label} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                    <div className="flex items-center gap-2 text-primary">
                      <stat.icon size={15} />
                      <p className="label text-white/45">{stat.label}</p>
                    </div>
                    <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                    <p className="mt-1 text-xs text-white/40">{stat.helper}</p>
                  </div>
                ))}
              </div>
              {responseText || submitting ? (
                <div className={`${fullscreen ? 'min-h-[58vh]' : 'min-h-[460px]'} rounded-xl border border-white/5 bg-[#0b0b0b] p-5`}>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-white/80">{responseText}{submitting && <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-primary align-middle" />}</p>
                </div>
              ) : (
                <div className={`${fullscreen ? 'min-h-[58vh]' : 'min-h-[460px]'} rounded-xl border border-white/5 bg-[#0b0b0b]`}>
                  <EmptyState icon={TerminalSquare} message="Send a request to see the provider response." />
                </div>
              )}
            </div>
          )}

          {activeSurface === 'vnc' && (
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={vncSize === 'standard' ? 'btn-primary min-h-8 px-3 py-1.5 text-xs' : 'btn-ghost min-h-8 px-3 py-1.5 text-xs'} onClick={() => setVncSize('standard')}>Standard</button>
                <button type="button" className={vncSize === 'large' ? 'btn-primary min-h-8 px-3 py-1.5 text-xs' : 'btn-ghost min-h-8 px-3 py-1.5 text-xs'} onClick={() => setVncSize('large')}>Large</button>
                <button type="button" className="btn-ghost min-h-8 px-3 py-1.5 text-xs" onClick={() => setVncFrameKey(key => key + 1)} disabled={!vncUrl}><RotateCw size={13} />Reload</button>
              </div>
              {vncUrl ? (
                <iframe
                  key={vncFrameKey}
                  title="Playground VNC"
                  src={vncUrl}
                  className={`${fullscreen ? 'h-[calc(100vh-245px)] min-h-[620px]' : vncSize === 'large' ? 'h-[min(76vh,820px)] min-h-[640px]' : 'h-[560px]'} w-full rounded-xl border border-white/5 bg-[#080808]`}
                  allow="clipboard-read; clipboard-write"
                />
              ) : (
                <div className="min-h-[460px] rounded-xl border border-white/5 bg-[#0b0b0b]">
                  <EmptyState icon={Monitor} message="VNC endpoint is unavailable." />
                </div>
              )}
            </div>
          )}

          {activeSurface === 'json' && (
            <div className="grid gap-5 p-5 xl:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-white">Request JSON</p>
                <pre className="max-h-[620px] min-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/5 bg-[#0b0b0b] p-4 text-xs text-white/70">{rawRequest || 'No request sent yet.'}</pre>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-white">Response JSON</p>
                <pre className="max-h-[620px] min-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/5 bg-[#0b0b0b] p-4 text-xs text-white/70">{rawResponse || (result ? JSON.stringify(result, null, 2) : 'No response yet.')}</pre>
              </div>
            </div>
          )}

          {activeSurface === 'history' && (
            <div className="space-y-3 p-5">
              {history.map(item => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="break-all font-mono text-xs text-primary/70">{item.model}</p>
                    <span className="status-primary">{item.status}</span>
                  </div>
                  <p className="mt-2 text-xs text-white/45">{item.provider} · {item.mode} · {formatNumber(item.latency)} ms · {formatNumber(item.tokens)} tokens · {formatDate(item.at)}</p>
                </div>
              ))}
              {history.length === 0 && <EmptyState icon={Activity} message="No playground runs yet." />}
            </div>
          )}
        </section>
      </div>
    </>
  )

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-[#080808] p-4 md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">API Playground</h1>
            <p className="mt-1 text-sm text-white/60">Fullscreen cockpit for master API requests, provider control, streaming output, and live VNC.</p>
          </div>
        </div>
        {workspace}
      </div>
    )
  }

  return (
    <Page title="API Playground" description="Super-admin master API testing with streaming, non-streaming, live VNC, request JSON, response JSON, and full audit logging.">
      {workspace}
    </Page>
  )
}

function ModelPicker({
  models,
  providers,
  value,
  onChange,
  disabled,
}: {
  models: ModelCatalog['models']
  providers: ModelCatalog['providers']
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const selected = models.find(item => item.id === value)
  const providerStatus = useMemo(() => new Map(providers.map(provider => [provider.name, provider])), [providers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter(item =>
      item.displayName.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.provider.toLowerCase().includes(q) ||
      item.owned_by.toLowerCase().includes(q),
    )
  }, [models, query])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function pick(id: string) {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="input group flex min-h-[76px] w-full items-center justify-between gap-3 border-primary/20 bg-white/[0.035] text-left transition hover:border-primary/50 hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => !disabled && setOpen(item => !item)}
        disabled={disabled}
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{selected.displayName}</span>
            <span className="mt-1 block break-all font-mono text-xs text-primary/70">{selected.id}</span>
            <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-white/10 px-2 py-0.5 text-white/60">{selected.provider}</span>
              <span className="rounded-md border border-white/10 px-2 py-0.5 text-white/60">{selected.owned_by}</span>
              {providerStatus.get(selected.provider)?.sessionValid && <span className="status-primary">Connected</span>}
            </span>
          </span>
        ) : (
          <span className="text-white/50">Select a model</span>
        )}
        <ChevronDown size={18} className={`shrink-0 text-white/50 transition-transform group-hover:text-primary ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div ref={panelRef} className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-primary/20 bg-[#101010] shadow-2xl shadow-black/60">
          <div className="border-b border-white/10 p-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                className="input min-h-10 pl-9"
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search model, provider, owner..."
              />
            </div>
          </div>
          <div className="max-h-[380px] overflow-auto p-2">
            {filtered.map(item => {
              const status = providerStatus.get(item.provider)
              const active = item.id === value
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-lg px-3 py-3 text-left transition hover:bg-white/[0.07] ${active ? 'bg-primary/10 ring-1 ring-primary/25' : ''}`}
                  onClick={() => pick(item.id)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{item.displayName}</span>
                      <span className="mt-1 block break-all font-mono text-xs text-primary/60">{item.id}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md border border-white/10 px-2 py-0.5 text-white/60">{item.provider}</span>
                        <span className="rounded-md border border-white/10 px-2 py-0.5 text-white/60">{item.owned_by}</span>
                        <span className={status?.sessionValid ? 'status-primary' : 'status-warning'}>
                          {status?.sessionValid ? 'Connected' : status?.hasProfile ? 'Profile found' : 'Disconnected'}
                        </span>
                      </span>
                    </span>
                    {active && <Check size={16} className="mt-0.5 shrink-0 text-primary" />}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-white/50">No models match your search.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Providers() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    try {
      setCatalog(await api.providers.models())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function action(provider: string, operation: 'login' | 'logout') {
    setMessage(null)
    try {
      if (operation === 'login') await api.providers.login(provider)
      else await api.providers.logout(provider)
      setMessage(operation === 'login' ? 'Login browser started on the server.' : 'Provider session closed.')
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Provider action failed')
    }
  }

  async function saveApiKey(provider: string) {
    const key = apiKeyDrafts[provider]?.trim()
    if (!key) {
      setMessage('Enter an API key before saving.')
      return
    }
    try {
      await api.providers.setApiKey(provider, key)
      setApiKeyDrafts({ ...apiKeyDrafts, [provider]: '' })
      setMessage(`${provider} credentials saved. Provider status will refresh on the next request.`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to save provider credentials')
    }
  }

  const grouped = useMemo(() => {
    const byProvider = new Map<string, ModelCatalog['models']>()
    for (const model of catalog?.models ?? []) {
      const list = byProvider.get(model.provider) ?? []
      list.push(model)
      byProvider.set(model.provider, list)
    }
    return byProvider
  }, [catalog])

  return (
    <Page title="Model Control" description="Manage model sessions, provider credentials, usage, and browser login workflows." action={<RefreshButton onClick={load} loading={loading} />}>
      {message && <Alert>{message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Models" value={formatNumber(catalog?.models.length ?? 0)} helper="Registered in Cortex" icon={Cpu} />
        <Metric label="Connected" value={formatNumber(catalog?.providers.filter(p => p.sessionValid).length ?? 0)} helper="Ready providers" icon={PlugZap} tone={(catalog?.providers.some(p => p.sessionValid) ?? false) ? 'good' : 'warn'} />
        <Metric label="VNC" value={catalog?.vnc.enabled ? 'Ready' : 'Off'} helper={catalog?.vnc.url ? `:${catalog.vnc.port}` : 'Unavailable'} icon={Eye} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {(catalog?.providers ?? []).map(provider => (
          <Panel key={provider.name} title={provider.name} description={`${grouped.get(provider.name)?.length ?? provider.models.length} model configurations`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <StatusPill ok={provider.sessionValid} trueLabel="Connected" falseLabel={provider.hasProfile ? 'Profile exists' : 'Disconnected'} />
                <p className="text-sm text-white/60">
                  {provider.name.endsWith('-api') ? 'Uses configured server API credentials.' : 'Uses a managed browser session profile.'}
                </p>
              </div>
              <div className="flex gap-2">
                {!provider.name.endsWith('-api') && <button className="btn-primary" onClick={() => action(provider.name, 'login')}>Login</button>}
                <button className="btn-ghost" onClick={() => action(provider.name, 'logout')}>Logout</button>
                {!provider.name.endsWith('-api') && catalog?.vnc.url && (
                  <a className="btn-ghost" href={catalog.vnc.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />VNC</a>
                )}
              </div>
            </div>
            {provider.name.endsWith('-api') && (
              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="input"
                  type="password"
                  placeholder={`${catalog?.apiKeysConfigured[provider.name] ? 'Replace' : 'Set'} ${provider.name} API key`}
                  value={apiKeyDrafts[provider.name] ?? ''}
                  onChange={event => setApiKeyDrafts({ ...apiKeyDrafts, [provider.name]: event.target.value })}
                />
                <button className="btn-primary" onClick={() => saveApiKey(provider.name)}>Save key</button>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {(grouped.get(provider.name) ?? []).map(model => (
                <div className="min-w-56 flex-1 rounded-xl border border-white/10 bg-white/[0.02] p-3 backdrop-blur-xl" key={model.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{model.displayName}</p>
                      <p className="mt-1 font-mono text-xs text-white/40">{model.id}</p>
                    </div>
                    <span className="status-primary">{model.owned_by}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="label text-white/60">Requests</p><p className="font-semibold">{formatNumber(model.usage.requests)}</p></div>
                    <div><p className="label text-white/60">Tokens</p><p className="font-semibold">{formatNumber(model.usage.totalTokens)}</p></div>
                    <div><p className="label text-white/60">Errors</p><p className="font-semibold">{formatNumber(model.usage.errorCount)}</p></div>
                  </div>
                  <p className="mt-2 text-xs text-white/40">Last used {model.usage.lastUsed ? formatDate(model.usage.lastUsed) : 'never'}</p>
                </div>
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </Page>
  )
}

function VncViewer() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewerSize, setViewerSize] = useState<'fit' | 'large' | 'max'>('large')
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [frameKey, setFrameKey] = useState(0)

  async function load() {
    setLoading(true)
    try {
      setCatalog(await api.providers.models())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const url = catalog?.vnc.url
  const viewerHeight =
    viewerSize === 'fit'
      ? 'h-[62vh] min-h-[460px]'
      : viewerSize === 'large'
        ? 'h-[78vh] min-h-[620px]'
        : 'h-[calc(100vh-190px)] min-h-[720px]'

  return (
    <Page title="VNC Viewer" description="Use this browser view for provider login flows and visual session recovery." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            ['fit', 'Fit'],
            ['large', 'Large'],
            ['max', 'Max'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={viewerSize === value ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setViewerSize(value as typeof viewerSize)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => setFrameKey(key => key + 1)} disabled={!url}>
            <RotateCw size={16} /> Reload viewer
          </button>
          <button type="button" className="btn-ghost" onClick={() => setDetailsOpen(open => !open)}>
            {detailsOpen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {detailsOpen ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>

      <div className={`grid gap-5 ${detailsOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>
        <section className="overflow-hidden rounded-xl border border-white/5 bg-[#080808]">
          {url ? (
            <iframe
              key={frameKey}
              title="Cortex noVNC"
              src={url}
              className={`${viewerHeight} w-full border-0 bg-[#080808]`}
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div className={`flex ${viewerHeight} items-center justify-center text-white/40`}>VNC endpoint is not available.</div>
          )}
        </section>
        <div className={`space-y-5 ${detailsOpen ? '' : 'hidden'}`}>
          <Panel title="Access details" description="Use Large or Max when provider pages are clipped inside noVNC.">
            <div className="space-y-3 text-sm">
              <div>
                <p className="label text-white/60">Viewer URL</p>
                <code className="mt-1 block break-all rounded-lg bg-white/5 border border-white/10 p-2 text-xs text-primary/60">{url ?? 'Unavailable'}</code>
              </div>
              <a className="btn-primary w-full" href={url ?? '#'} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open in new tab
              </a>
            </div>
          </Panel>
          <Panel title="Login workflow" description="Start a provider login, then complete it inside the VNC browser.">
            <div className="space-y-2 text-sm text-white/60">
              <p>1. Open Model Control and press Login for a web provider.</p>
              <p>2. Use this VNC view to complete the provider login.</p>
              <p>3. Return to Model Control and refresh provider status.</p>
              <p>4. If controls are off-screen, switch to Max and reload the viewer.</p>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  )
}

function AdminUsers({ currentAdmin }: { currentAdmin: Admin }) {
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
                <td className="py-3 pr-4 font-semibold">{item.username}{item.id === currentAdmin.id ? ' (you)' : ''}</td>
                <td className="py-3 pr-4">
                  <select className="input w-36" value={item.role} onChange={event => updateRole(item.id, event.target.value as Admin['role'])} disabled={item.id === currentAdmin.id}>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </td>
                <td className="py-3 pr-4 text-white/40">{item.lastLogin ? formatDate(item.lastLogin) : 'Never'}</td>
                <td className="py-3 pr-4 text-white/40">{formatDate(item.createdAt)}</td>
                <td className="py-3 pr-0">
                  <div className="flex justify-end gap-2">
                    <button className="btn-ghost min-h-9 px-3" onClick={() => resetPassword(item.id)}>Password</button>
                    <button className="btn-ghost min-h-9 px-3 text-destructive hover:bg-destructive/10" onClick={() => remove(item.id)} disabled={item.id === currentAdmin.id}><Trash2 size={15} /></button>
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

function SettingsPanel() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setConfig(await api.config.get())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save() {
    if (!config) return
    const next = await api.config.set({
      host: config.host,
      port: config.port,
      headless: config.headless,
      logLevel: config.logLevel,
      admin: config.admin,
    })
    setConfig(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  if (!config) {
    return <Page title="Settings" description="Runtime configuration and security controls."><FullWidthLoading /></Page>
  }

  return (
    <Page title="Settings" description="Runtime configuration, retention, CORS, and authentication enforcement." action={<RefreshButton onClick={load} loading={loading} />}>
      {saved && <Alert tone="good">Settings saved. Restart the service for host, port, and some runtime changes to take effect.</Alert>}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Service runtime" description="Network and provider process configuration.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Host"><input className="input" value={config.host} onChange={event => setConfig({ ...config, host: event.target.value })} /></Field>
            <Field label="Port"><input className="input" type="number" min={1} value={config.port} onChange={event => setConfig({ ...config, port: Number(event.target.value) })} /></Field>
            <Field label="Log level">
              <select className="input" value={config.logLevel} onChange={event => setConfig({ ...config, logLevel: event.target.value as Config['logLevel'] })}>
                <option value="silent">Silent</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </Field>
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm backdrop-blur-xl cursor-pointer">
              <input type="checkbox" checked={config.headless} onChange={event => setConfig({ ...config, headless: event.target.checked })} className="accent-primary" />
              Headless provider browsers
            </label>
          </div>
        </Panel>

        <Panel title="Security controls" description="Authentication, retention, and browser API access policy.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admin token TTL seconds"><input className="input" type="number" min={300} value={config.admin.tokenTtlSeconds} onChange={event => setConfig({ ...config, admin: { ...config.admin, tokenTtlSeconds: Number(event.target.value) } })} /></Field>
            <Field label="Log retention days"><input className="input" type="number" min={1} value={config.admin.logRetentionDays} onChange={event => setConfig({ ...config, admin: { ...config.admin, logRetentionDays: Number(event.target.value) } })} /></Field>
            <Field label="CORS origin"><input className="input" value={config.admin.corsOrigin} onChange={event => setConfig({ ...config, admin: { ...config.admin, corsOrigin: event.target.value } })} /></Field>
            <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm backdrop-blur-xl cursor-pointer">
              <input type="checkbox" checked={config.admin.requireApiKey} onChange={event => setConfig({ ...config, admin: { ...config.admin, requireApiKey: event.target.checked } })} className="accent-primary" />
              Require API keys for `/v1`
            </label>
          </div>
          <div className="mt-4 space-y-2 rounded-xl bg-white/[0.02] border border-white/10 p-3 text-sm text-white/40 backdrop-blur-xl">
            <p>Admin database: <span className="font-mono text-primary/60">{config.admin.dbPath}</span></p>
            <p>JWT secret configured: {config.admin.jwtSecretConfigured ? 'yes' : 'generated local secret file'}</p>
            <p>noVNC public port: <span className="font-mono text-primary/60">{config.vnc.externalPort}</span></p>
          </div>
        </Panel>
      </div>
      <button className="btn-primary mt-5" onClick={save}>Save settings</button>
    </Page>
  )
}

function ApiDocs() {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const baseUrl = window.location.origin

  return (
    <Page title="API Documentation" description="Share this reference with API consumers. All endpoints are OpenAI-compatible.">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Panel title="Authentication">
            <p className="text-sm text-white/60">All <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-primary/60">/v1/*</code> endpoints require an API key passed via the <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-primary/60">Authorization</code> header or <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs text-primary/60">X-API-Key</code> header.</p>
            <CodeBlock label="Header format" id="auth" onCopy={copy} copied={copied}>{`Authorization: Bearer ctx_your_api_key_here\n\n# Alternative:\nX-API-Key: ctx_your_api_key_here`}</CodeBlock>
          </Panel>

          <Panel title="POST /v1/chat/completions" description="Send a chat message and receive a completion. Supports streaming.">
            <CodeBlock label="curl" id="curl-chat" onCopy={copy} copied={copied}>{`curl ${baseUrl}/v1/chat/completions \\\n  -H "Authorization: Bearer ctx_your_api_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "model": "web-grok/grok-3",\n    "messages": [\n      {"role": "system", "content": "You are a helpful assistant."},\n      {"role": "user", "content": "Hello!"}\n    ],\n    "stream": false,\n    "newConversation": true\n  }'`}</CodeBlock>
            <CodeBlock label="Response" id="resp-chat" onCopy={copy} copied={copied}>{`{\n  "id": "chatcmpl-1710000000000",\n  "object": "chat.completion",\n  "model": "web-grok/grok-3",\n  "choices": [{\n    "index": 0,\n    "message": {"role": "assistant", "content": "Hello! How can I help?"},\n    "finish_reason": "stop"\n  }],\n  "usage": {"prompt_tokens": 18, "completion_tokens": 9, "total_tokens": 27}\n}`}</CodeBlock>
          </Panel>

          <Panel title="Streaming" description="Set stream: true to receive Server-Sent Events.">
            <CodeBlock label="Request body" id="stream-req" onCopy={copy} copied={copied}>{`{\n  "model": "web-claude/claude-opus",\n  "messages": [{"role": "user", "content": "Explain quantum computing"}],\n  "stream": true,\n  "newConversation": true\n}`}</CodeBlock>
            <CodeBlock label="SSE output" id="stream-resp" onCopy={copy} copied={copied}>{`data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Quantum"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":" computing"},"finish_reason":null}]}\n\ndata: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]`}</CodeBlock>
          </Panel>

          <Panel title="GET /v1/models" description="List all available models.">
            <CodeBlock label="curl" id="curl-models" onCopy={copy} copied={copied}>{`curl ${baseUrl}/v1/models \\\n  -H "Authorization: Bearer ctx_your_api_key_here"`}</CodeBlock>
          </Panel>

          <Panel title="Python SDK" description="Use the official OpenAI Python library.">
            <CodeBlock label="example.py" id="python" onCopy={copy} copied={copied}>{`from openai import OpenAI\n\nclient = OpenAI(\n    base_url="${baseUrl}/v1",\n    api_key="ctx_your_api_key_here"\n)\n\nresponse = client.chat.completions.create(\n    model="web-grok/grok-3",\n    messages=[{"role": "user", "content": "Hello!"}],\n    stream=False\n)\nprint(response.choices[0].message.content)\n\n# Streaming:\nfor chunk in client.chat.completions.create(\n    model="web-claude/claude-sonnet",\n    messages=[{"role": "user", "content": "Explain AI"}],\n    stream=True\n):\n    print(chunk.choices[0].delta.content or "", end="")`}</CodeBlock>
          </Panel>

          <Panel title="JavaScript / TypeScript" description="Use the OpenAI Node.js library.">
            <CodeBlock label="example.ts" id="js" onCopy={copy} copied={copied}>{`import OpenAI from "openai";\n\nconst client = new OpenAI({\n  baseURL: "${baseUrl}/v1",\n  apiKey: "ctx_your_api_key_here",\n});\n\nconst response = await client.chat.completions.create({\n  model: "web-gemini/gemini-2.5-pro",\n  messages: [{ role: "user", content: "Hello!" }],\n});\nconsole.log(response.choices[0].message.content);\n\n// Streaming:\nconst stream = await client.chat.completions.create({\n  model: "web-chatgpt/gpt-4o",\n  messages: [{ role: "user", content: "Hello!" }],\n  stream: true,\n});\nfor await (const chunk of stream) {\n  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");\n}`}</CodeBlock>
          </Panel>

          <Panel title="Error codes" description="Standard error response format.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/5 text-xs uppercase text-white/40">
                  <tr>
                    <th className="py-2 pr-4 text-left">Code</th>
                    <th className="py-2 pr-4 text-left">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['401', 'Missing or invalid API key'],
                    ['403', 'API key is disabled'],
                    ['404', 'Unknown model or endpoint'],
                    ['429', 'Rate limit or daily limit exceeded'],
                    ['500', 'Internal server error'],
                    ['503', 'Provider not connected — contact admin'],
                  ].map(([code, desc]) => (
                    <tr key={code} className="border-b border-white/5 last:border-0">
                      <td className="py-2 pr-4 font-mono text-primary/60">{code}</td>
                      <td className="py-2 pr-4 text-white/60">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Quick reference">
            <div className="space-y-3 text-sm">
              <div>
                <p className="label text-white/60">Base URL</p>
                <code className="mt-1 block break-all rounded-lg bg-white/5 border border-white/10 p-2 text-xs text-primary/60">{baseUrl}/v1</code>
              </div>
              <div>
                <p className="label text-white/60">Chat endpoint</p>
                <code className="mt-1 block rounded-lg bg-white/5 border border-white/10 p-2 text-xs">POST /v1/chat/completions</code>
              </div>
              <div>
                <p className="label text-white/60">Models endpoint</p>
                <code className="mt-1 block rounded-lg bg-white/5 border border-white/10 p-2 text-xs">GET /v1/models</code>
              </div>
              <div>
                <p className="label text-white/60">Compatibility</p>
                <p className="text-white/60">OpenAI API (chat completions)</p>
              </div>
              <div>
                <p className="label text-white/60">Auth method</p>
                <p className="text-white/60">Bearer token / X-API-Key</p>
              </div>
              <div>
                <p className="label text-white/60">Streaming</p>
                <p className="text-white/60">text/event-stream (SSE)</p>
              </div>
            </div>
          </Panel>

          <Panel title="Request parameters">
            <div className="space-y-2 text-sm">
              {[
                ['model', 'string', 'Required. Model ID (e.g. web-grok/grok-3)'],
                ['messages', 'array', 'Required. Array of {role, content} objects'],
                ['stream', 'boolean', 'Optional. Enable SSE streaming (default: false)'],
                ['newConversation', 'boolean', 'Optional. Start fresh conversation (default: true)'],
                ['temperature', 'number', 'Optional. Sampling temperature'],
                ['max_tokens', 'number', 'Optional. Max tokens to generate'],
              ].map(([name, type, desc]) => (
                <div key={name}>
                  <p className="font-mono text-xs font-semibold text-primary/80">{name} <span className="text-white/40">({type})</span></p>
                  <p className="text-xs text-white/60">{desc}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Rate limits">
            <p className="text-sm text-white/60">Each API key has per-minute and daily request limits configured by your administrator. Exceeding limits returns a <code className="rounded bg-white/5 px-1 py-0.5 text-xs text-primary/60">429</code> status code.</p>
          </Panel>
        </div>
      </div>
    </Page>
  )
}

function CodeBlock({ children, label, id, onCopy, copied }: { children: string; label: string; id: string; onCopy: (text: string, id: string) => void; copied: string | null }) {
  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-[#080808] text-white/80">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <span className="text-xs font-semibold text-white/40">{label}</span>
        <button className="text-xs text-white/40 hover:text-primary transition-colors" onClick={() => onCopy(children, id)}>
          {copied === id ? 'Copied!' : <><Copy size={12} className="mr-1 inline" />Copy</>}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed"><code>{children}</code></pre>
    </div>
  )
}

function Page({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h1 className="text-3xl font-bold text-white">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/50">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </>
  )
}

function Panel({ title, description, children, className = '' }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-white/50">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Metric({ label, value, helper, icon: Icon, tone = 'neutral' }: { label: string; value: string; helper: string; icon: typeof Activity; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-primary' : tone === 'warn' ? 'text-warning' : tone === 'bad' ? 'text-destructive' : 'text-[hsl(210,100%,65%)]'
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label text-white/50">{label}</p>
          <p className="mt-3 text-3xl font-bold text-white">{value}</p>
          <p className="mt-2 text-sm text-white/40">{helper}</p>
        </div>
        <div className={`rounded-xl bg-white/5 p-2 ${toneClass}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Activity; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${active ? 'bg-primary/10 text-primary border border-primary/20' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
      onClick={onClick}
    >
      <Icon size={18} />
      {label}
    </button>
  )
}

function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button className="btn-ghost" onClick={onClick} disabled={loading}>
      <RefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
      Refresh
    </button>
  )
}

function StatusPill({ ok, trueLabel, falseLabel }: { ok: boolean; trueLabel: string; falseLabel: string }) {
  return ok ? (
    <span className="status-success"><CheckCircle2 size={14} className="mr-1" />{trueLabel}</span>
  ) : (
    <span className="status-primary"><XCircle size={14} className="mr-1" />{falseLabel}</span>
  )
}

function StatusCode({ code }: { code: number | null }) {
  if (!code) return <span className="status-primary">Pending</span>
  if (code >= 500) return <span className="status-error">{code}</span>
  if (code >= 400) return <span className="status-warning">{code}</span>
  return <span className="status-success">{code}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label text-white/60">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  )
}

function Alert({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'bad' }) {
  const className = tone === 'good'
    ? 'border-primary/30 bg-primary/10 text-primary'
    : tone === 'bad'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-white/10 bg-white/5 text-white/80'
  return <div className={`mb-4 rounded-xl border p-3 text-sm backdrop-blur-xl ${className}`}>{children}</div>
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b border-white/5 text-xs uppercase text-white/40">
          <tr>{headers.map(header => <th key={header} className="py-3 pr-4 last:pr-0">{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function EmptyState({ icon: Icon, message }: { icon: typeof Activity; message: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-white/40">
      <Icon size={28} />
      <p>{message}</p>
    </div>
  )
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#080808]">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  )
}

function FullWidthLoading() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
      <Loader2 className="animate-spin text-primary" size={30} />
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
