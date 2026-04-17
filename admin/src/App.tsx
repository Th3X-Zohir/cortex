import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
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
  Monitor,
  PlugZap,
  RefreshCcw,
  Search,
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
  Bar,
  BarChart,
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

const providerColors = ['#18794e', '#b58400', '#1f7a7a', '#b42318', '#4f7f1f', '#7a4f12']

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
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-border bg-white lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-border px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck size={22} />
              </div>
              <div>
                <p className="text-lg font-bold">Cortex Admin</p>
                <p className="text-xs text-muted-foreground">Operational control center</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
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
          <UserPanel admin={admin} onLogout={() => logout(setAdmin)} />
        </div>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-8 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">Cortex Admin</p>
              <p className="text-xs text-muted-foreground">{admin.username}</p>
            </div>
            <button className="btn-secondary px-3" onClick={() => logout(setAdmin)}>
              <LogOut size={16} />
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {visibleSections.map(section => (
              <button
                key={section.id}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${active === section.id ? 'bg-primary text-primary-foreground' : 'bg-white text-foreground'}`}
                onClick={() => setActive(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
          {admin.mustChangePassword && (
            <div className="mb-5 rounded-md border border-secondary/60 bg-secondary/15 p-4 text-sm">
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
    <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1fr)_520px]">
      <section className="hidden border-r border-border bg-[#101411] text-white lg:flex lg:flex-col lg:justify-between">
        <div className="p-12">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary">
              <ShieldCheck size={24} />
            </div>
            <p className="text-xl font-bold">Cortex Admin</p>
          </div>
          <div className="mt-24 max-w-xl">
            <p className="text-sm font-semibold uppercase text-[#f2c14e]">Secure operations</p>
            <h1 className="mt-4 text-5xl font-bold leading-tight">
              Control API access, usage limits, provider sessions, and production logs.
            </h1>
            <p className="mt-5 text-lg text-white/70">
              Token-gated administration for daily service operations.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 border-t border-white/15">
          {['API keys', 'Rate controls', 'Audit trail'].map(item => (
            <div key={item} className="border-r border-white/15 p-6 text-sm text-white/75 last:border-r-0">
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10">
        <form className="w-full max-w-sm" onSubmit={submit}>
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ShieldCheck size={22} />
              </div>
              <p className="text-lg font-bold">Cortex Admin</p>
            </div>
          </div>
          <h2 className="text-3xl font-bold">Admin sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Use an admin account to manage keys, limits, logs, and providers.
          </p>
          <div className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="username">Username</label>
              <input id="username" className="input mt-2" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input mt-2" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={persist} onChange={event => setPersist(event.target.checked)} />
              Keep me signed in on this device
            </label>
            {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
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

  return (
    <Page title="Overview" description="Live request volume, provider readiness, errors, and limit pressure." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Requests 24h" value={formatNumber(stats.overview.requestsLast24h)} helper={`${formatNumber(stats.overview.requestsLast1h)} in the last hour`} icon={Activity} />
        <Metric label="Error rate" value={stats.overview.errorRate} helper={`${formatNumber(stats.overview.errorCount)} failed requests`} icon={AlertTriangle} tone={Number.parseFloat(stats.overview.errorRate) > 5 ? 'bad' : 'good'} />
        <Metric label="Average latency" value={`${formatNumber(stats.overview.avgResponseTime)} ms`} helper="All logged provider calls" icon={Clock3} />
        <Metric label="Daily usage" value={`${usage?.summary.usagePercent ?? 0}%`} helper={`${formatNumber(usage?.summary.totalUsage ?? 0)} of ${formatNumber(usage?.summary.totalLimit ?? 0)}`} icon={Gauge} tone={(usage?.summary.usagePercent ?? 0) > 85 ? 'warn' : 'good'} />
        <Metric label="Tokens 24h" value={formatNumber(stats.overview.tokensLast24h)} helper={`${formatNumber(stats.overview.totalTokens)} lifetime`} icon={Cpu} />
        <Metric label="Providers" value={`${status?.providers.filter(p => p.sessionValid).length ?? 0}/${status?.providers.length ?? 0}`} helper="Connected provider sessions" icon={PlugZap} tone={(status?.providers.some(p => p.sessionValid) ?? false) ? 'good' : 'warn'} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.8fr)]">
        <Panel title="Request trend" description="Hourly request volume across the retained log window.">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.hourlyData}>
                <defs>
                  <linearGradient id="requestFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#18794e" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#18794e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e3e5df" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} minTickGap={28} />
                <YAxis tick={{ fontSize: 11 }} width={42} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#18794e" fill="url(#requestFill)" strokeWidth={2} />
                <Area type="monotone" dataKey="totalTokens" stroke="#b58400" fill="transparent" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Provider health" description="Browser sessions and API-backed providers.">
          <div className="space-y-3">
            {(status?.providers ?? []).map(provider => (
              <div key={provider.name} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-semibold">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">{provider.models.length} models</p>
                </div>
                <StatusPill ok={provider.sessionValid} trueLabel="Connected" falseLabel={provider.hasProfile ? 'Profile found' : 'Disconnected'} />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Token accounting" description="Prompt and completion token totals from provider metadata when available, otherwise estimated from text.">
          <div className="grid gap-4 sm:grid-cols-3">
            <InlineStat label="Input tokens" value={formatNumber(stats.overview.promptTokens)} helper="Prompt side" icon={TerminalSquare} />
            <InlineStat label="Output tokens" value={formatNumber(stats.overview.completionTokens)} helper="Completion side" icon={Cpu} />
            <InlineStat label="Total tokens" value={formatNumber(stats.overview.totalTokens)} helper="All logged traffic" icon={Gauge} />
          </div>
        </Panel>
        <Panel title="Recent failures" description="Latest rejected or failed requests.">
          <div className="space-y-3">
            {stats.recentErrors.map(item => (
              <div key={item.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-mono text-xs">{item.model}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.error || 'Request failed'}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <StatusCode code={item.statusCode} />
                  <p className="mt-1">{formatDate(item.createdAt)}</p>
                </div>
              </div>
            ))}
            {stats.recentErrors.length === 0 && <EmptyState icon={CheckCircle2} message="No recent failures." />}
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel title="Provider distribution" description="Request share by provider.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.providerDistribution} dataKey="value" nameKey="name" outerRadius={100}>
                  {stats.providerDistribution.map((_, index) => (
                    <Cell key={index} fill={providerColors[index % providerColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Top models" description="Most frequently requested model IDs.">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byModel.slice(0, 10)} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid stroke="#e3e5df" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="model" tick={{ fontSize: 11 }} width={140} />
                <Tooltip />
                <Bar dataKey="count" fill="#b58400" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
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
            <div className="mt-5 rounded-md border border-secondary/50 bg-secondary/10 p-4">
              <p className="text-sm font-semibold">New API key</p>
              <code className="mt-2 block break-all rounded-md bg-white p-3 text-sm">{createdKey}</code>
              <p className="mt-2 text-xs text-muted-foreground">This value cannot be shown again.</p>
            </div>
          )}
        </Panel>

        <Panel title="Managed keys" description="Operational access tokens and their current limit state.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
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
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        {editing ? <input className="input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /> : <span className="font-semibold">{item.name}</span>}
      </td>
      <td className="py-3 pr-4 font-mono text-xs">{item.keyPrefix}...</td>
      <td className="py-3 pr-4">
        <div className="h-2 w-28 rounded-full bg-muted">
          <div className={`h-2 rounded-full ${usagePercent > 90 ? 'bg-destructive' : usagePercent > 75 ? 'bg-secondary' : 'bg-primary'}`} style={{ width: `${usagePercent}%` }} />
        </div>
        <span className="mt-1 block text-xs text-muted-foreground">{formatNumber(item.requestsToday)}</span>
      </td>
      <td className="py-3 pr-4">
        {editing ? <input className="input w-28" type="number" min={1} value={draft.dailyLimit} onChange={event => setDraft({ ...draft, dailyLimit: Number(event.target.value) })} /> : formatNumber(item.dailyLimit)}
      </td>
      <td className="py-3 pr-4">
        {editing ? <input className="input w-24" type="number" min={1} value={draft.rateLimitPerMin} onChange={event => setDraft({ ...draft, rateLimitPerMin: Number(event.target.value) })} /> : `${item.rateLimitPerMin}/min`}
      </td>
      <td className="py-3 pr-4"><StatusPill ok={item.active} trueLabel="Active" falseLabel="Disabled" /></td>
      <td className="py-3 pr-4 text-muted-foreground">{item.lastUsed ? formatDate(item.lastUsed) : 'Never'}</td>
      <td className="py-3 pr-0">
        <div className="flex justify-end gap-2">
          {editing ? (
            <button className="btn-primary min-h-9 px-3" onClick={save}>Save</button>
          ) : (
            <button className="btn-secondary min-h-9 px-3" onClick={() => setEditing(true)}>Edit</button>
          )}
          <button className="btn-secondary min-h-9 px-3" onClick={() => onUpdate(item.id, { active: !item.active })}>{item.active ? 'Disable' : 'Enable'}</button>
          <button className="btn-danger min-h-9 px-3" onClick={() => onDelete(item.id)}><Trash2 size={15} /></button>
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
              <div key={item.id} className="grid gap-3 border-b border-border pb-4 last:border-0 last:pb-0 lg:grid-cols-[minmax(180px,1fr)_minmax(240px,2fr)_180px_150px_140px] lg:items-center">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.active ? 'Active' : 'Disabled'} · resets {formatDate(item.requestsTodayReset)}</p>
                </div>
                <div>
                  <div className="h-3 rounded-full bg-muted">
                    <div className={`h-3 rounded-full ${item.usagePercent > 90 ? 'bg-destructive' : item.usagePercent > 75 ? 'bg-secondary' : 'bg-primary'}`} style={{ width: `${Math.min(100, item.usagePercent)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatNumber(item.requestsToday)} of {formatNumber(item.dailyLimit)} requests</p>
                </div>
                <input className="input" type="number" min={1} defaultValue={item.dailyLimit} onBlur={event => updateLimit(item.id, Number(event.target.value))} />
                <p className="text-sm text-muted-foreground">{formatNumber(item.tokensToday)} tokens today</p>
                <p className="text-sm text-muted-foreground">{key?.rateLimitPerMin ?? 0}/min</p>
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
    <Page title="Logs" description="Search request logs, failures, access events, and admin changes." action={<div className="flex gap-2"><button className="btn-secondary" onClick={prune}>Prune</button><RefreshButton onClick={load} loading={loading} /></div>}>
      <Panel title="Filters" description="Filter by client key, provider, status, or free text.">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_160px_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-muted-foreground" size={16} />
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
        <button className={tab === 'requests' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('requests')}>Request logs</button>
        <button className={tab === 'audit' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('audit')}>Audit trail</button>
      </div>

      {tab === 'requests' ? (
        <Panel title="API request logs" description="Provider calls and rejected access attempts." className="mt-5">
          <DataTable headers={['Time', 'Key', 'Provider', 'Model', 'Status', 'Latency', 'Tokens', 'Details']}>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-border last:border-0">
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(log.createdAt)}</td>
                <td className="py-3 pr-4">{log.apiKeyName ?? 'Unknown'}</td>
                <td className="py-3 pr-4">{log.provider}</td>
                <td className="py-3 pr-4 font-mono text-xs">{log.model}</td>
                <td className="py-3 pr-4"><StatusCode code={log.statusCode} /></td>
                <td className="py-3 pr-4">{log.responseTimeMs ?? 0} ms</td>
                <td className="py-3 pr-4">
                  <div className="text-xs">
                    <p className="font-semibold">{formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)}</p>
                    <p className="text-muted-foreground">in {formatNumber(log.promptTokens ?? 0)} / out {formatNumber(log.completionTokens ?? 0)}</p>
                  </div>
                </td>
                <td className="py-3 pr-4 text-sm text-muted-foreground">{log.error || `${log.messagesCount} messages${log.stream ? ' · stream' : ''}`}</td>
              </tr>
            ))}
          </DataTable>
          {logs.length === 0 && <EmptyState icon={Activity} message="No matching request logs." />}
        </Panel>
      ) : (
        <Panel title="Admin audit trail" description="Authentication, key, provider, and settings actions." className="mt-5">
          <DataTable headers={['Time', 'Admin', 'Action', 'Entity', 'IP address', 'Metadata']}>
            {auditLogs.map(log => (
              <tr key={log.id} className="border-b border-border last:border-0">
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(log.createdAt)}</td>
                <td className="py-3 pr-4">{log.adminUsername ?? 'System'}</td>
                <td className="py-3 pr-4 font-semibold">{log.action.replace(/_/g, ' ')}</td>
                <td className="py-3 pr-4">{log.entityType}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}</td>
                <td className="py-3 pr-4">{log.ipAddress ?? 'Unknown'}</td>
                <td className="py-3 pr-4 text-xs text-muted-foreground">{log.metadata ? JSON.stringify(log.metadata) : ''}</td>
              </tr>
            ))}
          </DataTable>
          {auditLogs.length === 0 && <EmptyState icon={ShieldCheck} message="No matching audit events." />}
        </Panel>
      )}
    </Page>
  )
}

function ApiPlayground() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('You are a precise assistant for operational testing.')
  const [prompt, setPrompt] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(800)
  const [newConversation, setNewConversation] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PlaygroundResponse | null>(null)

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

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setResult(null)

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
    try {
      const messages = [
        ...(systemPrompt.trim() ? [{ role: 'system' as const, content: systemPrompt.trim() }] : []),
        { role: 'user' as const, content: trimmedPrompt },
      ]
      setResult(await api.playground.chat({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        newConversation,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playground request failed')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedModel = catalog?.models.find(item => item.id === model)

  return (
    <Page title="API Playground" description="Super-admin master API testing with no daily or per-minute key limits. Every request is written to Logs as Admin Playground.">
      {error && <Alert tone="bad">{error}</Alert>}
      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
        <Panel title="Request" description="Send a privileged operational request through the selected provider.">
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Model">
              <select className="input" value={model} onChange={event => setModel(event.target.value)} disabled={loading}>
                {(catalog?.models ?? []).map(item => (
                  <option key={item.id} value={item.id}>{item.displayName} - {item.provider}</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Temperature">
                <input className="input" type="number" min="0" max="2" step="0.1" value={temperature} onChange={event => setTemperature(Number(event.target.value))} />
              </Field>
              <Field label="Max tokens">
                <input className="input" type="number" min="1" max="32000" value={maxTokens} onChange={event => setMaxTokens(Number(event.target.value))} />
              </Field>
            </div>
            <Field label="System prompt">
              <textarea className="input min-h-24 resize-y" value={systemPrompt} onChange={event => setSystemPrompt(event.target.value)} />
            </Field>
            <Field label="User prompt">
              <textarea className="input min-h-40 resize-y" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Write the request to test..." />
            </Field>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={newConversation} onChange={event => setNewConversation(event.target.checked)} />
              Start a fresh provider conversation
            </label>
            <button className="btn-primary w-full" type="submit" disabled={submitting || loading || !model}>
              {submitting && <Loader2 className="animate-spin" size={16} />}
              Send master request
            </button>
          </form>
        </Panel>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="Selected provider" value={selectedModel?.provider ?? 'None'} helper={selectedModel?.status?.sessionValid ? 'Connected' : 'Check status'} icon={PlugZap} tone={selectedModel?.status?.sessionValid ? 'good' : 'warn'} />
            <Metric label="Limit mode" value="Unlimited" helper="No API-key quota applied" icon={Gauge} tone="good" />
            <Metric label="Log label" value="Playground" helper="Visible on Logs page" icon={Activity} />
          </div>

          <Panel title="Response" description="Returned content and token accounting for the most recent playground request.">
            {result ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <InlineStat label="Input" value={formatNumber(result.usage.prompt_tokens)} helper="prompt tokens" icon={TerminalSquare} />
                  <InlineStat label="Output" value={formatNumber(result.usage.completion_tokens)} helper="completion tokens" icon={Cpu} />
                  <InlineStat label="Total" value={formatNumber(result.usage.total_tokens)} helper="logged tokens" icon={Gauge} />
                </div>
                <div className="rounded-md bg-muted p-4">
                  <p className="whitespace-pre-wrap text-sm leading-6">{result.choices[0]?.message.content}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="status-pill bg-primary/10 text-primary">{result.provider}</span>
                  <span className="status-pill bg-muted text-muted-foreground">{result.loggedAs}</span>
                  <span className="status-pill bg-muted text-muted-foreground">No request limit</span>
                </div>
              </div>
            ) : (
              <EmptyState icon={TerminalSquare} message="Send a request to see the provider response." />
            )}
          </Panel>
        </div>
      </div>
    </Page>
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
                <p className="text-sm text-muted-foreground">
                  {provider.name.endsWith('-api') ? 'Uses configured server API credentials.' : 'Uses a managed browser session profile.'}
                </p>
              </div>
              <div className="flex gap-2">
                {!provider.name.endsWith('-api') && <button className="btn-primary" onClick={() => action(provider.name, 'login')}>Login</button>}
                <button className="btn-secondary" onClick={() => action(provider.name, 'logout')}>Logout</button>
                {!provider.name.endsWith('-api') && catalog?.vnc.url && (
                  <a className="btn-secondary" href={catalog.vnc.url} target="_blank" rel="noreferrer"><ExternalLink size={15} />VNC</a>
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
                <div className="min-w-56 flex-1 rounded-md border border-border p-3" key={model.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{model.displayName}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{model.id}</p>
                    </div>
                    <span className="status-pill bg-muted text-muted-foreground">{model.owned_by}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><p className="label">Requests</p><p className="font-semibold">{formatNumber(model.usage.requests)}</p></div>
                    <div><p className="label">Tokens</p><p className="font-semibold">{formatNumber(model.usage.totalTokens)}</p></div>
                    <div><p className="label">Errors</p><p className="font-semibold">{formatNumber(model.usage.errorCount)}</p></div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Last used {model.usage.lastUsed ? formatDate(model.usage.lastUsed) : 'never'}</p>
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

  return (
    <Page title="VNC Viewer" description="Use this browser view for provider login flows and visual session recovery." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-md border border-border bg-[#101411]">
          {url ? (
            <iframe title="Cortex noVNC" src={url} className="h-[72vh] w-full border-0 bg-[#101411]" />
          ) : (
            <div className="flex h-[72vh] items-center justify-center text-white/70">VNC endpoint is not available.</div>
          )}
        </section>
        <div className="space-y-5">
          <Panel title="Access details" description="The container exposes noVNC for browser-based provider logins.">
            <div className="space-y-3 text-sm">
              <div>
                <p className="label">Viewer URL</p>
                <code className="mt-1 block break-all rounded-md bg-muted p-2 text-xs">{url ?? 'Unavailable'}</code>
              </div>
              <a className="btn-primary w-full" href={url ?? '#'} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open in new tab
              </a>
            </div>
          </Panel>
          <Panel title="Login workflow" description="Start a provider login, then complete it inside the VNC browser.">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Open Model Control and press Login for a web provider.</p>
              <p>2. Use this VNC view to complete the provider login.</p>
              <p>3. Return to Model Control and refresh provider status.</p>
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
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="py-3 pr-4 font-semibold">{item.username}{item.id === currentAdmin.id ? ' (you)' : ''}</td>
                <td className="py-3 pr-4">
                  <select className="input w-36" value={item.role} onChange={event => updateRole(item.id, event.target.value as Admin['role'])} disabled={item.id === currentAdmin.id}>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">{item.lastLogin ? formatDate(item.lastLogin) : 'Never'}</td>
                <td className="py-3 pr-4 text-muted-foreground">{formatDate(item.createdAt)}</td>
                <td className="py-3 pr-0">
                  <div className="flex justify-end gap-2">
                    <button className="btn-secondary min-h-9 px-3" onClick={() => resetPassword(item.id)}>Password</button>
                    <button className="btn-danger min-h-9 px-3" onClick={() => remove(item.id)} disabled={item.id === currentAdmin.id}><Trash2 size={15} /></button>
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
            <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
              <input type="checkbox" checked={config.headless} onChange={event => setConfig({ ...config, headless: event.target.checked })} />
              Headless provider browsers
            </label>
          </div>
        </Panel>

        <Panel title="Security controls" description="Authentication, retention, and browser API access policy.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Admin token TTL seconds"><input className="input" type="number" min={300} value={config.admin.tokenTtlSeconds} onChange={event => setConfig({ ...config, admin: { ...config.admin, tokenTtlSeconds: Number(event.target.value) } })} /></Field>
            <Field label="Log retention days"><input className="input" type="number" min={1} value={config.admin.logRetentionDays} onChange={event => setConfig({ ...config, admin: { ...config.admin, logRetentionDays: Number(event.target.value) } })} /></Field>
            <Field label="CORS origin"><input className="input" value={config.admin.corsOrigin} onChange={event => setConfig({ ...config, admin: { ...config.admin, corsOrigin: event.target.value } })} /></Field>
            <label className="flex items-center gap-3 rounded-md border border-border p-3 text-sm">
              <input type="checkbox" checked={config.admin.requireApiKey} onChange={event => setConfig({ ...config, admin: { ...config.admin, requireApiKey: event.target.checked } })} />
              Require API keys for `/v1`
            </label>
          </div>
          <div className="mt-4 space-y-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
            <p>Admin database: <span className="font-mono">{config.admin.dbPath}</span></p>
            <p>JWT secret configured: {config.admin.jwtSecretConfigured ? 'yes' : 'generated local secret file'}</p>
            <p>noVNC public port: <span className="font-mono">{config.vnc.externalPort}</span></p>
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
            <p className="text-sm text-muted-foreground">All <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/v1/*</code> endpoints require an API key passed via the <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Authorization</code> header or <code className="rounded bg-muted px-1.5 py-0.5 text-xs">X-API-Key</code> header.</p>
            <CodeBlock label="Header format" id="auth" onCopy={copy} copied={copied}>{`Authorization: Bearer ctx_your_api_key_here\n\n# Alternative:\nX-API-Key: ctx_your_api_key_here`}</CodeBlock>
          </Panel>

          <Panel title="POST /v1/chat/completions" description="Send a chat message and receive a completion. Supports streaming.">
            <CodeBlock label="curl" id="curl-chat" onCopy={copy} copied={copied}>{`curl ${baseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ctx_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "web-grok/grok-3",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "stream": false
  }'`}</CodeBlock>
            <CodeBlock label="Response" id="resp-chat" onCopy={copy} copied={copied}>{`{
  "id": "chatcmpl-1710000000000",
  "object": "chat.completion",
  "model": "web-grok/grok-3",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "Hello! How can I help?"},
    "finish_reason": "stop"
  }],
  "usage": {"prompt_tokens": 18, "completion_tokens": 9, "total_tokens": 27}
}`}</CodeBlock>
          </Panel>

          <Panel title="Streaming" description="Set stream: true to receive Server-Sent Events.">
            <CodeBlock label="Request body" id="stream-req" onCopy={copy} copied={copied}>{`{
  "model": "web-claude/claude-opus",
  "messages": [{"role": "user", "content": "Explain quantum computing"}],
  "stream": true
}`}</CodeBlock>
            <CodeBlock label="SSE output" id="stream-resp" onCopy={copy} copied={copied}>{`data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":"Quantum"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{"content":" computing"},"finish_reason":null}]}

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]`}</CodeBlock>
          </Panel>

          <Panel title="GET /v1/models" description="List all available models.">
            <CodeBlock label="curl" id="curl-models" onCopy={copy} copied={copied}>{`curl ${baseUrl}/v1/models \\
  -H "Authorization: Bearer ctx_your_api_key_here"`}</CodeBlock>
          </Panel>

          <Panel title="Python SDK" description="Use the official OpenAI Python library.">
            <CodeBlock label="example.py" id="python" onCopy={copy} copied={copied}>{`from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="ctx_your_api_key_here"
)

response = client.chat.completions.create(
    model="web-grok/grok-3",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=False
)
print(response.choices[0].message.content)

# Streaming:
for chunk in client.chat.completions.create(
    model="web-claude/claude-sonnet",
    messages=[{"role": "user", "content": "Explain AI"}],
    stream=True
):
    print(chunk.choices[0].delta.content or "", end="")`}</CodeBlock>
          </Panel>

          <Panel title="JavaScript / TypeScript" description="Use the OpenAI Node.js library.">
            <CodeBlock label="example.ts" id="js" onCopy={copy} copied={copied}>{`import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${baseUrl}/v1",
  apiKey: "ctx_your_api_key_here",
});

const response = await client.chat.completions.create({
  model: "web-gemini/gemini-2.5-pro",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(response.choices[0].message.content);

// Streaming:
const stream = await client.chat.completions.create({
  model: "web-chatgpt/gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`}</CodeBlock>
          </Panel>

          <Panel title="Error codes" description="Standard error response format.">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
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
                    <tr key={code} className="border-b border-border last:border-0">
                      <td className="py-2 pr-4 font-mono">{code}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{desc}</td>
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
                <p className="label">Base URL</p>
                <code className="mt-1 block break-all rounded-md bg-muted p-2 text-xs">{baseUrl}/v1</code>
              </div>
              <div>
                <p className="label">Chat endpoint</p>
                <code className="mt-1 block rounded-md bg-muted p-2 text-xs">POST /v1/chat/completions</code>
              </div>
              <div>
                <p className="label">Models endpoint</p>
                <code className="mt-1 block rounded-md bg-muted p-2 text-xs">GET /v1/models</code>
              </div>
              <div>
                <p className="label">Compatibility</p>
                <p className="text-muted-foreground">OpenAI API (chat completions)</p>
              </div>
              <div>
                <p className="label">Auth method</p>
                <p className="text-muted-foreground">Bearer token / X-API-Key</p>
              </div>
              <div>
                <p className="label">Streaming</p>
                <p className="text-muted-foreground">text/event-stream (SSE)</p>
              </div>
            </div>
          </Panel>

          <Panel title="Request parameters">
            <div className="space-y-2 text-sm">
              {[
                ['model', 'string', 'Required. Model ID (e.g. web-grok/grok-3)'],
                ['messages', 'array', 'Required. Array of {role, content} objects'],
                ['stream', 'boolean', 'Optional. Enable SSE streaming (default: false)'],
                ['temperature', 'number', 'Optional. Sampling temperature'],
                ['max_tokens', 'number', 'Optional. Max tokens to generate'],
              ].map(([name, type, desc]) => (
                <div key={name}>
                  <p className="font-mono text-xs font-semibold">{name} <span className="text-muted-foreground">({type})</span></p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Rate limits">
            <p className="text-sm text-muted-foreground">Each API key has per-minute and daily request limits configured by your administrator. Exceeding limits returns a <code className="rounded bg-muted px-1 py-0.5 text-xs">429</code> status code.</p>
          </Panel>
        </div>
      </div>
    </Page>
  )
}

function CodeBlock({ children, label, id, onCopy, copied }: { children: string; label: string; id: string; onCopy: (text: string, id: string) => void; copied: string | null }) {
  return (
    <div className="mt-3 rounded-md border border-border bg-[#101411] text-[#e0e5dc]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-semibold text-white/60">{label}</span>
        <button className="text-xs text-white/50 hover:text-white" onClick={() => onCopy(children, id)}>
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
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </>
  )
}

function Panel({ title, description, children, className = '' }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-bold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function Metric({ label, value, helper, icon: Icon, tone = 'neutral' }: { label: string; value: string; helper: string; icon: typeof Activity; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const toneClass = tone === 'good' ? 'text-primary' : tone === 'warn' ? 'text-secondary-foreground bg-secondary/25' : tone === 'bad' ? 'text-destructive' : 'text-accent'
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label">{label}</p>
          <p className="mt-3 text-3xl font-bold">{value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
        </div>
        <div className={`rounded-md bg-muted p-2 ${toneClass}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function InlineStat({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: typeof Activity }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-2 text-accent">
        <Icon size={18} />
      </div>
      <div>
        <p className="label">{label}</p>
        <p className="mt-2 text-2xl font-bold">{value}</p>
        <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
      </div>
    </div>
  )
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Activity; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold transition ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
      onClick={onClick}
    >
      <Icon size={18} />
      {label}
    </button>
  )
}

function UserPanel({ admin, onLogout }: { admin: Admin; onLogout: () => void }) {
  return (
    <div className="border-t border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{admin.username}</p>
          <p className="text-xs capitalize text-muted-foreground">{admin.role.replace('_', ' ')}</p>
        </div>
        <button className="btn-secondary min-h-9 px-3" onClick={onLogout}><LogOut size={16} /></button>
      </div>
    </div>
  )
}

function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button className="btn-secondary" onClick={onClick} disabled={loading}>
      <RefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
      Refresh
    </button>
  )
}

function StatusPill({ ok, trueLabel, falseLabel }: { ok: boolean; trueLabel: string; falseLabel: string }) {
  return ok ? (
    <span className="status-pill bg-primary/10 text-primary"><CheckCircle2 size={14} className="mr-1" />{trueLabel}</span>
  ) : (
    <span className="status-pill bg-muted text-muted-foreground"><XCircle size={14} className="mr-1" />{falseLabel}</span>
  )
}

function StatusCode({ code }: { code: number | null }) {
  if (!code) return <span className="status-pill bg-muted text-muted-foreground">Pending</span>
  if (code >= 500) return <span className="status-pill bg-destructive/10 text-destructive">{code}</span>
  if (code >= 400) return <span className="status-pill bg-secondary/20 text-secondary-foreground">{code}</span>
  return <span className="status-pill bg-primary/10 text-primary">{code}</span>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  )
}

function Alert({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'bad' }) {
  const className = tone === 'good'
    ? 'border-primary/30 bg-primary/10 text-primary'
    : tone === 'bad'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-border bg-white text-foreground'
  return <div className={`mb-4 rounded-md border p-3 text-sm ${className}`}>{children}</div>
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>{headers.map(header => <th key={header} className="py-3 pr-4 last:pr-0">{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function EmptyState({ icon: Icon, message }: { icon: typeof Activity; message: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <Icon size={28} />
      <p>{message}</p>
    </div>
  )
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="animate-spin text-primary" size={32} />
    </div>
  )
}

function FullWidthLoading() {
  return (
    <div className="panel flex min-h-64 items-center justify-center">
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
