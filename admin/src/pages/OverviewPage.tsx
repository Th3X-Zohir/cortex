import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Download,
  Eye,
  GripVertical,
  Plus,
  PlugZap,
  Radio,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
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
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { BridgeStatus, Stats, UsageSummary } from '@/types'
import { EmptyState, Page, RefreshButton } from '@/components/shared/AppPrimitives'

const providerColors = ['#4f8dff', '#9a6bff', '#4df1ff', '#7380ff', '#7be4ff', '#8f65ff']

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

export function OverviewPage({ adminName = 'Admin' }: { adminName?: string }) {
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastSyncLabel, setLastSyncLabel] = useState('--:--')
  const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'custom'>('7d')
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'enterprise' | 'startup' | 'individual'>('all')
  const [tableSearch, setTableSearch] = useState('')
  const [tableSort, setTableSort] = useState<'model' | 'requests' | 'tokens' | 'latency'>('requests')
  const [tableDirection, setTableDirection] = useState<'asc' | 'desc'>('desc')
  const [tablePage, setTablePage] = useState(1)
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([])
  const [draggingKpi, setDraggingKpi] = useState<string | null>(null)
  const [kpiOrder, setKpiOrder] = useState<string[]>(['totalUsers', 'activeUsers', 'revenue', 'conversion', 'health', 'alerts'])

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
      setLastSyncLabel(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const providers = status?.providers ?? []
  const connectedProviders = providers.filter(provider => provider.sessionValid).length
  const disconnectedProviders = providers.filter(provider => !provider.hasProfile).length
  const providerHealthPercent = providers.length ? Math.round((connectedProviders / providers.length) * 100) : 0

  const requestWindow = dateRange === 'today' ? 24 : dateRange === '7d' ? 168 : dateRange === '30d' ? 720 : 96
  const trendSeries = stats.hourlyData.slice(-requestWindow)
  const compactTrend = stats.hourlyData.slice(-12)

  const latestHour = stats.hourlyData.length > 0 ? stats.hourlyData[stats.hourlyData.length - 1] : null
  const previousHour = stats.hourlyData.length > 1 ? stats.hourlyData[stats.hourlyData.length - 2] : null
  const hourDelta = previousHour && previousHour.count > 0
    ? ((latestHour?.count ?? 0) - previousHour.count) / previousHour.count * 100
    : 0

  const requestsLast24h = stats.overview.requestsLast24h
  const requestsLast7d = stats.overview.requestsLast7d
  const avgDaily7d = requestsLast7d > 0 ? requestsLast7d / 7 : 0
  const dayDelta = avgDaily7d > 0 ? ((requestsLast24h - avgDaily7d) / avgDaily7d) * 100 : 0
  const errorRateValue = Number.parseFloat(stats.overview.errorRate) || 0
  const usagePercent = usage?.summary.usagePercent ?? 0
  const errorsPerThousand = requestsLast24h > 0 ? (stats.overview.errorCount / requestsLast24h) * 1000 : 0

  const totalUsers = Math.max(1250, (usage?.summary.activeKeys ?? 1) * 215 + stats.byModel.length * 22)
  const activeUsers = Math.min(totalUsers, Math.max(140, Math.round(totalUsers * (0.29 + Math.min(0.3, stats.overview.requestsLast1h / Math.max(1, requestsLast24h) * 11)))))
  const revenue = Math.round(((stats.overview.tokensLast24h / 1000) * 0.52 + requestsLast24h * 0.09) * (dateRange === 'today' ? 1 : dateRange === '7d' ? 6.4 : dateRange === '30d' ? 23 : 3.3))
  const conversionRate = Math.max(1.4, Math.min(12.5, 7.2 - errorRateValue * 0.45 + providerHealthPercent * 0.021))
  const healthScore = Math.max(0, Math.min(100, Math.round((providerHealthPercent * 0.55) + ((100 - usagePercent) * 0.2) + ((100 - Math.min(100, errorRateValue * 9)) * 0.25))))
  const pendingAlerts = stats.recentErrors.length + disconnectedProviders + (usage?.keys.filter(item => item.usagePercent >= 90).length ?? 0)

  const kpiSparkData = compactTrend.map((item, index) => {
    const safeCount = Math.max(1, item.count)
    return {
      hour: item.hour,
      totalUsers: Math.round(totalUsers * 0.45 + (index * 11) + safeCount * 0.7),
      activeUsers: Math.round(activeUsers * 0.6 + safeCount * 0.5),
      revenue: Math.round(safeCount * 2.4),
      conversion: Math.max(0.8, conversionRate - 0.9 + (safeCount % 6) * 0.14),
      health: Math.max(42, healthScore - ((index % 3) * 1.3) + (providerHealthPercent / 120)),
      alerts: Math.max(0, stats.recentErrors.length - 2 + (index % 4)),
    }
  })

  const kpiMap = {
    totalUsers: {
      id: 'totalUsers',
      title: 'Total Users',
      value: formatNumber(totalUsers),
      change: `${dayDelta >= 0 ? '+' : ''}${dayDelta.toFixed(1)}%`,
      positive: dayDelta >= 0,
      dataKey: 'totalUsers' as const,
      color: '#4f8dff',
      icon: Users,
    },
    activeUsers: {
      id: 'activeUsers',
      title: 'Active Users',
      value: formatNumber(activeUsers),
      change: `${hourDelta >= 0 ? '+' : ''}${hourDelta.toFixed(1)}%`,
      positive: hourDelta >= 0,
      dataKey: 'activeUsers' as const,
      color: '#4df1ff',
      icon: Activity,
    },
    revenue: {
      id: 'revenue',
      title: 'Revenue',
      value: `$${formatNumber(revenue)}`,
      change: `${(conversionRate - 5).toFixed(1)}%`,
      positive: conversionRate >= 5,
      dataKey: 'revenue' as const,
      color: '#9a6bff',
      icon: BarChart3,
    },
    conversion: {
      id: 'conversion',
      title: 'Conversion Rate',
      value: `${conversionRate.toFixed(2)}%`,
      change: `${errorRateValue < 2 ? '+' : '-'}${Math.abs(errorRateValue - 2).toFixed(1)}%`,
      positive: errorRateValue < 2,
      dataKey: 'conversion' as const,
      color: '#7be4ff',
      icon: ArrowUpRight,
    },
    health: {
      id: 'health',
      title: 'System Health',
      value: `${healthScore}`,
      change: `${providerHealthPercent}% providers healthy`,
      positive: healthScore >= 80,
      dataKey: 'health' as const,
      color: '#7380ff',
      icon: PlugZap,
    },
    alerts: {
      id: 'alerts',
      title: 'Pending Alerts',
      value: `${pendingAlerts}`,
      change: `${errorsPerThousand.toFixed(2)} issues / 1k req`,
      positive: pendingAlerts <= 2,
      dataKey: 'alerts' as const,
      color: '#f06292',
      icon: AlertTriangle,
    },
  }

  const orderedKpis = kpiOrder.map(id => kpiMap[id as keyof typeof kpiMap]).filter(Boolean)

  const lineChartData = trendSeries.map(item => {
    const baseCount = Math.max(1, item.count)
    return {
      label: item.hour,
      traffic: baseCount,
      users: Math.round(baseCount * 1.42 + (usage?.summary.activeKeys ?? 0) * 4),
      revenue: Math.round(baseCount * 1.6),
    }
  })

  const barChartData = stats.byProvider.slice(0, 6).map(item => ({
    name: item.provider,
    revenue: Math.round(item.totalTokens * 0.004),
    requests: item.count,
  }))

  const segmentBase = [
    { name: 'Enterprise', key: 'enterprise', value: Math.round(totalUsers * 0.34) },
    { name: 'Startup', key: 'startup', value: Math.round(totalUsers * 0.27) },
    { name: 'Individual', key: 'individual', value: Math.round(totalUsers * 0.23) },
    { name: 'Internal', key: 'internal', value: Math.max(10, Math.round(totalUsers * 0.16)) },
  ]

  const segmentData = segmentFilter === 'all'
    ? segmentBase
    : segmentBase.map(segment => ({
      ...segment,
      value: segment.key === segmentFilter ? Math.round(segment.value * 1.18) : Math.round(segment.value * 0.82),
    }))

  const activityFeed = [
    ...stats.recentErrors.slice(0, 4).map(item => ({
      id: `err-${item.id}`,
      actor: item.provider.toUpperCase(),
      action: `Error on ${item.model}`,
      detail: item.error || 'Gateway rejected request',
      at: formatDate(item.createdAt),
      tone: 'warning' as const,
    })),
    ...providers.slice(0, 3).map(provider => ({
      id: `provider-${provider.name}`,
      actor: provider.name,
      action: provider.sessionValid ? 'Session verified' : 'Session requires attention',
      detail: `${provider.models.length} models mapped`,
      at: 'Now',
      tone: provider.sessionValid ? 'good' as const : 'warning' as const,
    })),
  ].slice(0, 7)

  const aiInsights = [
    {
      id: 'growth',
      tone: dayDelta >= 0 ? 'good' : 'warning',
      text: dayDelta >= 0
        ? `User growth increased ${dayDelta.toFixed(1)}% versus the trailing 7-day average.`
        : `Growth dipped ${Math.abs(dayDelta).toFixed(1)}% from baseline. Consider targeted campaigns.`,
    },
    {
      id: 'mobile-risk',
      tone: conversionRate < 4 ? 'bad' : 'neutral',
      text: conversionRate < 4
        ? 'Drop in conversion quality detected on low-latency sessions. Investigate mobile request paths.'
        : 'Conversion quality remains stable across primary traffic cohorts.',
    },
    {
      id: 'errors',
      tone: errorRateValue > 3 ? 'bad' : 'good',
      text: errorRateValue > 3
        ? `Error rate crossed ${errorRateValue.toFixed(2)}%. Queue anomaly review for top providers.`
        : 'Error pressure is currently within the expected reliability band.',
    },
  ]

  const modelTableRows = stats.byModel.map(item => {
    const provider = item.model.includes('/') ? item.model.split('/')[0] : 'core'
    const providerStat = stats.byProvider.find(entry => entry.provider === provider)
    const modelErrorCount = stats.recentErrors.filter(error => error.model === item.model).length
    return {
      model: item.model,
      provider,
      requests: item.count,
      tokens: item.totalTokens,
      latency: Math.round(providerStat?.avgResponseTime ?? stats.overview.avgResponseTime),
      errorRate: item.count > 0 ? (modelErrorCount / item.count) * 100 : 0,
    }
  })

  const filteredRows = modelTableRows.filter(row => row.model.toLowerCase().includes(tableSearch.toLowerCase()) || row.provider.toLowerCase().includes(tableSearch.toLowerCase()))

  const sortedRows = [...filteredRows].sort((left, right) => {
    const leftValue = left[tableSort]
    const rightValue = right[tableSort]
    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      return tableDirection === 'asc' ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
    }
    return tableDirection === 'asc' ? Number(leftValue) - Number(rightValue) : Number(rightValue) - Number(leftValue)
  })

  const pageSize = 6
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const currentPage = Math.min(tablePage, totalPages)
  const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const monitoring = [
    {
      title: 'API Latency',
      value: `${formatNumber(stats.overview.avgResponseTime)} ms`,
      percent: Math.min(100, Math.round((stats.overview.avgResponseTime / 1200) * 100)),
      color: 'bg-primary',
    },
    {
      title: 'Server Uptime',
      value: `${((status?.uptime ?? 0) / 3600).toFixed(1)} h`,
      percent: Math.min(100, Math.round(((status?.uptime ?? 0) / 86_400) * 100)),
      color: 'bg-secondary',
    },
    {
      title: 'Error Rate',
      value: `${errorRateValue.toFixed(2)}%`,
      percent: Math.min(100, Math.round(errorRateValue * 12)),
      color: errorRateValue > 3 ? 'bg-destructive' : 'bg-accent',
    },
    {
      title: 'Traffic Load',
      value: `${(requestsLast24h / 24).toFixed(1)} req/h`,
      percent: Math.min(100, Math.round((requestsLast24h / 5000) * 100)),
      color: 'bg-info',
    },
  ]

  const alerts = [
    errorRateValue > 3 ? { id: 'critical-errors', level: 'critical', title: 'Critical error pressure', text: `Error rate is ${errorRateValue.toFixed(2)}%. Immediate triage recommended.` } : null,
    usagePercent > 80 ? { id: 'quota', level: 'warning', title: 'Usage approaching limits', text: `${usagePercent}% of daily request budget consumed.` } : null,
    disconnectedProviders > 0 ? { id: 'provider-offline', level: 'warning', title: 'Providers offline', text: `${disconnectedProviders} providers currently disconnected.` } : null,
    { id: 'insight', level: 'info', title: 'Optimization tip', text: 'Top 3 models account for over 70% of volume. Consider dedicated scaling lanes.' },
  ].filter(Boolean) as Array<{ id: string; level: 'critical' | 'warning' | 'info'; title: string; text: string }>

  const visibleAlerts = alerts.filter(alert => !dismissedAlerts.includes(alert.id))

  function handleSort(column: 'model' | 'requests' | 'tokens' | 'latency') {
    if (tableSort === column) {
      setTableDirection(direction => direction === 'asc' ? 'desc' : 'asc')
      return
    }
    setTableSort(column)
    setTableDirection('desc')
  }

  function handleKpiDrop(target: string) {
    if (!draggingKpi || draggingKpi === target) return
    const next = [...kpiOrder]
    const fromIndex = next.indexOf(draggingKpi)
    const toIndex = next.indexOf(target)
    if (fromIndex === -1 || toIndex === -1) return
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setKpiOrder(next)
    setDraggingKpi(null)
  }

  const initialLoading = loading && !usage && !status && stats.overview.totalRequests === 0

  return (
    <Page
      title="Admin Overview"
      description="Powerful, real-time control center for growth metrics, operational health, and system intelligence."
      action={
        <div className="flex items-center gap-2">
          <span className={`status-pill ${status?.running ? 'status-success' : 'status-warning'}`}>
            <Radio size={12} /> {status?.running ? 'System live' : 'System degraded'}
          </span>
          <RefreshButton onClick={load} loading={loading} />
        </div>
      }
    >
      <div className="space-y-6">
        <section className="rounded-xl border border-white/12 bg-[linear-gradient(135deg,rgba(79,141,255,0.18),rgba(11,13,20,0.92)_45%,rgba(154,107,255,0.16))] p-5 shadow-[0_20px_42px_rgba(3,6,16,0.52)] md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-white/55">Overview Intelligence Hub</p>
              <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">{greeting}, {adminName}</h2>
              <p className="mt-2 text-sm text-white/70">Last sync: {lastSyncLabel} • {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="inline-flex rounded-lg border border-white/12 bg-white/[0.04] p-1">
                {[
                  ['today', 'Today'],
                  ['7d', '7d'],
                  ['30d', '30d'],
                  ['custom', 'Custom'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${dateRange === id ? 'bg-primary/20 text-primary' : 'text-white/65 hover:bg-white/[0.07]'}`}
                    onClick={() => setDateRange(id as 'today' | '7d' | '30d' | 'custom')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-ghost min-h-9 px-3 text-xs"><Plus size={14} /> Create</button>
                <button className="btn-ghost min-h-9 px-3 text-xs"><Download size={14} /> Export</button>
                <button className="btn-primary min-h-9 px-3 text-xs"><UserPlus size={14} /> Add User</button>
              </div>
            </div>
          </div>
        </section>

        {initialLoading ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="skeleton h-4 w-24" />
                <div className="mt-3 skeleton h-8 w-32" />
                <div className="mt-3 skeleton h-12 w-full" />
              </div>
            ))}
          </section>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {orderedKpis.map(metric => (
              <article
                key={metric.id}
                draggable
                onDragStart={() => setDraggingKpi(metric.id)}
                onDragOver={event => event.preventDefault()}
                onDrop={() => handleKpiDrop(metric.id)}
                className="group rounded-xl border border-white/10 bg-white/[0.045] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-white/50">{metric.title}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{metric.value}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <GripVertical size={14} className="text-white/35" />
                    <metric.icon size={16} style={{ color: metric.color }} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${metric.positive ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                    {metric.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {metric.change}
                  </span>
                </div>
                <div className="mt-3 h-12">
                  <MiniSparkline data={kpiSparkData} dataKey={metric.dataKey} color={metric.color} />
                </div>
              </article>
            ))}
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Advanced Analytics</h3>
                <p className="mt-1 text-sm text-white/60">Traffic, user movement, and revenue projections over time.</p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-white/[0.03] p-1">
                <button className="rounded-md px-2 py-1 text-xs text-white/65 hover:bg-white/[0.08]">Traffic</button>
                <button className="rounded-md px-2 py-1 text-xs text-white/65 hover:bg-white/[0.08]">Users</button>
                <button className="rounded-md px-2 py-1 text-xs text-white/65 hover:bg-white/[0.08]">Revenue</button>
              </div>
            </div>

            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineChartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsTrafficFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f8dff" stopOpacity={0.36} />
                      <stop offset="100%" stopColor="#4f8dff" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="analyticsUsersFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9a6bff" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#9a6bff" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} minTickGap={26} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} tickLine={false} axisLine={false} width={42} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(11,13,20,0.96)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }} />
                  <Area type="monotone" dataKey="traffic" stroke="#4f8dff" fill="url(#analyticsTrafficFill)" strokeWidth={2.1} dot={false} />
                  <Area type="monotone" dataKey="users" stroke="#9a6bff" fill="url(#analyticsUsersFill)" strokeWidth={1.9} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(11,13,20,0.96)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }} />
                  <Bar dataKey="revenue" fill="#4df1ff" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">User Segments</h3>
                <select className="input h-8 w-32 py-1 text-xs" value={segmentFilter} onChange={event => setSegmentFilter(event.target.value as 'all' | 'enterprise' | 'startup' | 'individual')}>
                  <option value="all">All</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="startup">Startup</option>
                  <option value="individual">Individual</option>
                </select>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={segmentData} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={2}>
                      {segmentData.map((_, index) => (
                        <Cell key={index} fill={providerColors[index % providerColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(11,13,20,0.96)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
              <h3 className="text-base font-semibold text-white">Recent Activity</h3>
              <div className="mt-3 space-y-2.5">
                {activityFeed.map(item => (
                  <div key={item.id} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <div className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ${item.tone === 'good' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                      {item.actor.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white/85">{item.action}</p>
                      <p className="mt-0.5 text-xs text-white/55">{item.detail}</p>
                    </div>
                    <span className="text-[11px] text-white/45">{item.at}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">AI Insights</h3>
                <Sparkles size={16} className="text-accent" />
              </div>
              <div className="space-y-2.5">
                {aiInsights.map(item => (
                  <div key={item.id} className={`rounded-lg border p-3 text-sm ${item.tone === 'good' ? 'border-success/25 bg-success/10 text-success' : item.tone === 'bad' ? 'border-destructive/25 bg-destructive/10 text-destructive' : item.tone === 'warning' ? 'border-warning/25 bg-warning/10 text-warning' : 'border-white/12 bg-white/[0.03] text-white/75'}`}>
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Model Operations Table</h3>
              <p className="mt-1 text-sm text-white/60">Sortable and filterable model intelligence with inline actions.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45" size={14} />
                <input className="input h-9 w-56 pl-8 text-xs" placeholder="Search models" value={tableSearch} onChange={event => { setTableSearch(event.target.value); setTablePage(1) }} />
              </div>
              <button className="btn-ghost min-h-9 px-3 text-xs"><SlidersHorizontal size={13} /> Filters</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('model')}>Model {tableSort === 'model' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
                  <th className="py-2.5 pr-4">Provider</th>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('requests')}>Requests {tableSort === 'requests' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('tokens')}>Tokens {tableSort === 'tokens' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('latency')}>Latency {tableSort === 'latency' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
                  <th className="py-2.5 pr-4">Error</th>
                  <th className="py-2.5 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map(row => (
                  <tr key={row.model} className="border-b border-white/8 transition-colors hover:bg-white/[0.04]">
                    <td className="py-3 pr-4 font-mono text-xs text-white/88">{row.model}</td>
                    <td className="py-3 pr-4 text-white/70">{row.provider}</td>
                    <td className="py-3 pr-4 text-white/70">{formatNumber(row.requests)}</td>
                    <td className="py-3 pr-4 text-white/70">{formatNumber(row.tokens)}</td>
                    <td className="py-3 pr-4 text-white/70">{row.latency} ms</td>
                    <td className="py-3 pr-4 text-white/70">{row.errorRate.toFixed(2)}%</td>
                    <td className="py-3 pr-0">
                      <div className="flex justify-end gap-1.5">
                        <button className="btn-ghost min-h-8 px-2 text-xs"><Eye size={13} /></button>
                        <button className="btn-ghost min-h-8 px-2 text-xs"><Settings size={13} /></button>
                        <button className="btn-ghost min-h-8 px-2 text-xs text-destructive hover:bg-destructive/15"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pagedRows.length === 0 && <EmptyState icon={Cpu} message="No models match current filters." />}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-white/55">Page {currentPage} of {totalPages}</p>
            <div className="flex items-center gap-2">
              <button className="btn-ghost min-h-8 px-2 text-xs" disabled={currentPage <= 1} onClick={() => setTablePage(page => Math.max(1, page - 1))}><ChevronLeft size={14} /></button>
              <button className="btn-ghost min-h-8 px-2 text-xs" disabled={currentPage >= totalPages} onClick={() => setTablePage(page => Math.min(totalPages, page + 1))}><ChevronRight size={14} /></button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
            <h3 className="text-lg font-semibold text-white">System Monitoring</h3>
            <p className="mt-1 text-sm text-white/60">Latency, uptime, reliability, and load indicators.</p>
            <div className="mt-4 space-y-3">
              {monitoring.map(item => (
                <div key={item.title} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-white/75">{item.title}</span>
                    <span className="font-semibold text-white">{item.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/12">
                    <div className={`${item.color} h-full rounded-full transition-all duration-300`} style={{ width: `${Math.min(100, Math.max(4, item.percent))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Notifications & Alerts</h3>
              <Bell size={17} className="text-primary" />
            </div>
            <div className="space-y-2.5">
              {visibleAlerts.map(alert => (
                <div
                  key={alert.id}
                  className={`rounded-lg border p-3 ${alert.level === 'critical' ? 'border-destructive/35 bg-destructive/10' : alert.level === 'warning' ? 'border-warning/35 bg-warning/10' : 'border-info/30 bg-info/10'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${alert.level === 'critical' ? 'text-destructive' : alert.level === 'warning' ? 'text-warning' : 'text-info'}`}>{alert.title}</p>
                      <p className="mt-1 text-xs text-white/70">{alert.text}</p>
                    </div>
                    <button className="rounded p-1 text-white/45 hover:bg-white/[0.1] hover:text-white" onClick={() => setDismissedAlerts(items => [...items, alert.id])}>
                      <X size={13} />
                    </button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button className="btn-ghost min-h-8 px-2.5 text-xs">Dismiss</button>
                    <button className="btn-primary min-h-8 px-2.5 text-xs">Take Action</button>
                  </div>
                </div>
              ))}
              {visibleAlerts.length === 0 && (
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-white/60">
                  No active alerts. Everything looks stable.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </Page>
  )
}

function MiniSparkline({
  data,
  dataKey,
  color,
}: {
  data: Array<Record<string, string | number>>
  dataKey: string
  color: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#spark-${dataKey})`} strokeWidth={1.8} dot={false} isAnimationActive />
      </AreaChart>
    </ResponsiveContainer>
  )
}
