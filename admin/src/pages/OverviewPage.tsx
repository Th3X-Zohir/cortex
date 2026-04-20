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
  PlugZap,
  Radio,
  Search,
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

type DateRange = '24h' | '7d'
type SortColumn = 'model' | 'requests' | 'tokens' | 'latency' | 'errorRate'

export function OverviewPage({ adminName = 'Admin' }: { adminName?: string }) {
  const [stats, setStats] = useState<Stats>(emptyStats)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastSyncLabel, setLastSyncLabel] = useState('--:--')
  const [dateRange, setDateRange] = useState<DateRange>('7d')
  const [tableSearch, setTableSearch] = useState('')
  const [tableSort, setTableSort] = useState<SortColumn>('requests')
  const [tableDirection, setTableDirection] = useState<'asc' | 'desc'>('desc')
  const [tablePage, setTablePage] = useState(1)
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([])

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
  const disconnectedProviders = providers.filter(provider => !provider.sessionValid).length
  const providerHealthPercent = providers.length ? Math.round((connectedProviders / providers.length) * 100) : 0

  const requestWindow = dateRange === '24h' ? 24 : 7 * 24
  const trendSeries = stats.hourlyData.slice(-requestWindow)
  const latestHour = trendSeries.length > 0 ? trendSeries[trendSeries.length - 1] : null
  const previousHour = trendSeries.length > 1 ? trendSeries[trendSeries.length - 2] : null
  const hourDelta = previousHour && previousHour.count > 0
    ? ((latestHour?.count ?? 0) - previousHour.count) / previousHour.count * 100
    : 0

  const requestsLast24h = stats.overview.requestsLast24h
  const requestsLast7d = stats.overview.requestsLast7d
  const avgDaily7d = requestsLast7d > 0 ? requestsLast7d / 7 : 0
  const dayDelta = avgDaily7d > 0 ? ((requestsLast24h - avgDaily7d) / avgDaily7d) * 100 : 0
  const errorRateValue = Number.parseFloat(stats.overview.errorRate) || 0
  const usagePercent = usage?.summary.usagePercent ?? 0

  const lineChartData = trendSeries.map(item => ({
    label: formatHourLabel(item.hour),
    requests: item.count,
  }))

  const providerChartData = stats.byProvider.slice(0, 8).map(item => ({
    name: item.provider,
    requests: item.count,
    tokens: item.totalTokens,
  }))

  const providerDistribution = stats.providerDistribution.length > 0
    ? stats.providerDistribution
    : stats.byProvider.map(item => ({ name: item.provider, value: item.count }))

  const activityFeed = [
    ...stats.recentErrors.map(item => ({
      id: `error-${item.id}`,
      actor: item.provider.toUpperCase(),
      action: `Error on ${item.model}`,
      detail: item.error || `HTTP ${item.statusCode ?? 'unknown'}`,
      at: formatDate(item.createdAt),
      tone: 'warning' as const,
    })),
    ...providers.map(provider => ({
      id: `provider-${provider.name}`,
      actor: provider.name.toUpperCase(),
      action: provider.sessionValid ? 'Session healthy' : 'Session needs attention',
      detail: `${provider.models.length} models mapped`,
      at: 'Now',
      tone: provider.sessionValid ? 'good' as const : 'warning' as const,
    })),
  ].slice(0, 8)

  const errorCountByModel = stats.recentErrors.reduce<Record<string, number>>((acc, item) => {
    acc[item.model] = (acc[item.model] ?? 0) + 1
    return acc
  }, {})

  const modelTableRows = stats.byModel.map(item => {
    const provider = item.model.includes('/') ? item.model.split('/')[0] : 'unknown'
    const providerStat = stats.byProvider.find(entry => entry.provider === provider)
    const modelErrorCount = errorCountByModel[item.model] ?? 0
    return {
      model: item.model,
      provider,
      requests: item.count,
      tokens: item.totalTokens,
      latency: Math.round(providerStat?.avgResponseTime ?? stats.overview.avgResponseTime),
      errorRate: item.count > 0 ? (modelErrorCount / item.count) * 100 : 0,
    }
  })

  const filteredRows = modelTableRows.filter(row =>
    row.model.toLowerCase().includes(tableSearch.toLowerCase()) ||
    row.provider.toLowerCase().includes(tableSearch.toLowerCase()),
  )

  const sortedRows = [...filteredRows].sort((left, right) => {
    const leftValue = left[tableSort]
    const rightValue = right[tableSort]
    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      return tableDirection === 'asc' ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue)
    }
    return tableDirection === 'asc' ? Number(leftValue) - Number(rightValue) : Number(rightValue) - Number(leftValue)
  })

  const pageSize = 8
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
      title: 'Provider Health',
      value: `${providerHealthPercent}%`,
      percent: providerHealthPercent,
      color: providerHealthPercent >= 70 ? 'bg-success' : 'bg-warning',
    },
    {
      title: 'Daily Key Usage',
      value: `${formatNumber(usagePercent)}%`,
      percent: Math.min(100, usagePercent),
      color: usagePercent >= 85 ? 'bg-warning' : 'bg-secondary',
    },
    {
      title: 'Error Rate',
      value: `${errorRateValue.toFixed(2)}%`,
      percent: Math.min(100, Math.round(errorRateValue * 12)),
      color: errorRateValue > 3 ? 'bg-destructive' : 'bg-accent',
    },
  ]

  const alerts = [
    errorRateValue > 3
      ? {
          id: 'critical-errors',
          level: 'critical' as const,
          title: 'Critical error pressure',
          text: `Error rate is ${errorRateValue.toFixed(2)}%. Immediate triage recommended.`,
        }
      : null,
    usagePercent > 85
      ? {
          id: 'quota',
          level: 'warning' as const,
          title: 'Usage approaching key limits',
          text: `${usagePercent}% of daily request budget is consumed across active keys.`,
        }
      : null,
    disconnectedProviders > 0
      ? {
          id: 'provider-offline',
          level: 'warning' as const,
          title: 'Providers disconnected',
          text: `${disconnectedProviders} providers are currently not session-valid.`,
        }
      : null,
    providers.length === 0
      ? {
          id: 'provider-none',
          level: 'info' as const,
          title: 'No providers detected',
          text: 'No provider status data is available yet. Trigger a provider login and refresh.',
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; level: 'critical' | 'warning' | 'info'; title: string; text: string }>

  const visibleAlerts = alerts.filter(alert => !dismissedAlerts.includes(alert.id))

  function handleSort(column: SortColumn) {
    if (tableSort === column) {
      setTableDirection(direction => (direction === 'asc' ? 'desc' : 'asc'))
      return
    }
    setTableSort(column)
    setTableDirection('desc')
  }

  const initialLoading = loading && !usage && !status && stats.overview.totalRequests === 0

  const kpiCards = [
    {
      id: 'total-requests',
      title: 'Total Requests',
      value: formatNumber(stats.overview.totalRequests),
      change: `${dayDelta >= 0 ? '+' : ''}${dayDelta.toFixed(1)}% vs 7d avg/day`,
      positive: dayDelta >= 0,
      icon: Activity,
    },
    {
      id: 'requests-24h',
      title: 'Requests (24h)',
      value: formatNumber(stats.overview.requestsLast24h),
      change: `${hourDelta >= 0 ? '+' : ''}${hourDelta.toFixed(1)}% last hour`,
      positive: hourDelta >= 0,
      icon: BarChart3,
    },
    {
      id: 'tokens-24h',
      title: 'Tokens (24h)',
      value: formatNumber(stats.overview.tokensLast24h),
      change: `${formatNumber(stats.overview.totalTokens)} all-time tokens`,
      positive: true,
      icon: Cpu,
    },
    {
      id: 'latency',
      title: 'Avg Latency',
      value: `${formatNumber(stats.overview.avgResponseTime)} ms`,
      change: `${formatNumber(stats.overview.requestsLast1h)} req in last hour`,
      positive: stats.overview.avgResponseTime <= 1200,
      icon: Radio,
    },
    {
      id: 'error-rate',
      title: 'Error Rate',
      value: `${errorRateValue.toFixed(1)}%`,
      change: `${formatNumber(stats.overview.errorCount)} total failed requests`,
      positive: errorRateValue <= 3,
      icon: AlertTriangle,
    },
    {
      id: 'provider-health',
      title: 'Provider Health',
      value: `${providerHealthPercent}%`,
      change: `${connectedProviders}/${providers.length} connected`,
      positive: providerHealthPercent >= 70,
      icon: PlugZap,
    },
    {
      id: 'active-keys',
      title: 'Active API Keys',
      value: formatNumber(usage?.summary.activeKeys ?? 0),
      change: `${formatNumber(usage?.summary.totalUsage ?? 0)} requests today`,
      positive: (usage?.summary.activeKeys ?? 0) > 0,
      icon: Bell,
    },
    {
      id: 'quota',
      title: 'Daily Key Quota',
      value: `${formatNumber(usagePercent)}%`,
      change: `${formatNumber(usage?.summary.totalUsage ?? 0)}/${formatNumber(usage?.summary.totalLimit ?? 0)} requests`,
      positive: usagePercent < 85,
      icon: Activity,
    },
  ]

  return (
    <Page
      title="Admin Overview"
      description="Real-time operational dashboard backed by live stats, usage, and provider health data."
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
              <p className="text-xs uppercase tracking-[0.22em] text-white/55">Live Operations Overview</p>
              <h2 className="mt-2 text-2xl font-bold text-white md:text-3xl">{greeting}, {adminName}</h2>
              <p className="mt-2 text-sm text-white/70">Last sync: {lastSyncLabel} • {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>

            <div className="inline-flex rounded-lg border border-white/12 bg-white/[0.04] p-1">
              {[
                ['24h', '24h'],
                ['7d', '7d'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${dateRange === id ? 'bg-primary/20 text-primary' : 'text-white/65 hover:bg-white/[0.07]'}`}
                  onClick={() => setDateRange(id as DateRange)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {initialLoading ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="skeleton h-4 w-24" />
                <div className="mt-3 skeleton h-8 w-32" />
                <div className="mt-3 skeleton h-4 w-full" />
              </div>
            ))}
          </section>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            {kpiCards.map(metric => (
              <article key={metric.id} className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.12em] text-white/50">{metric.title}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{metric.value}</p>
                  </div>
                  <metric.icon size={16} className="text-primary" />
                </div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${metric.positive ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                  {metric.positive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {metric.change}
                </span>
              </article>
            ))}
          </section>
        )}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Request Throughput</h3>
                <p className="mt-1 text-sm text-white/60">Hourly request trend from live request logs.</p>
              </div>
            </div>

            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineChartData} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="overviewRequestFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f8dff" stopOpacity={0.36} />
                      <stop offset="100%" stopColor="#4f8dff" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} minTickGap={22} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} tickLine={false} axisLine={false} width={42} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(11,13,20,0.96)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }} />
                  <Area type="monotone" dataKey="requests" stroke="#4f8dff" fill="url(#overviewRequestFill)" strokeWidth={2.1} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={providerChartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.6)' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(11,13,20,0.96)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }} />
                  <Bar dataKey="requests" fill="#4df1ff" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
              <h3 className="text-base font-semibold text-white">Provider Distribution</h3>
              <p className="mt-1 text-sm text-white/60">Live request share by provider.</p>
              <div className="mt-3 h-56">
                {providerDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={providerDistribution} dataKey="value" nameKey="name" innerRadius={56} outerRadius={86} paddingAngle={2}>
                        {providerDistribution.map((_, index) => (
                          <Cell key={index} fill={providerColors[index % providerColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(11,13,20,0.96)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState icon={BarChart3} message="No provider distribution data available yet." />
                )}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
              <h3 className="text-base font-semibold text-white">Recent Activity</h3>
              <div className="mt-3 space-y-2.5">
                {activityFeed.length > 0 ? activityFeed.map(item => (
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
                )) : (
                  <EmptyState icon={Activity} message="No recent activity yet." />
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Model Operations Table</h3>
              <p className="mt-1 text-sm text-white/60">Live request volume, tokens, latency, and error ratio per model.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/45" size={14} />
                <input className="input h-9 w-56 pl-8 text-xs" placeholder="Search models" value={tableSearch} onChange={event => { setTableSearch(event.target.value); setTablePage(1) }} />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('model')}>Model {tableSort === 'model' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
                  <th className="py-2.5 pr-4">Provider</th>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('requests')}>Requests {tableSort === 'requests' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('tokens')}>Tokens {tableSort === 'tokens' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('latency')}>Latency {tableSort === 'latency' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
                  <th className="py-2.5 pr-4"><button className="flex items-center gap-1 hover:text-white" onClick={() => handleSort('errorRate')}>Error {tableSort === 'errorRate' && (tableDirection === 'asc' ? '▲' : '▼')}</button></th>
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
            <p className="mt-1 text-sm text-white/60">Latency, provider health, usage pressure, and reliability indicators.</p>
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

function formatHourLabel(raw: string): string {
  const parsed = new Date(raw.replace(' ', 'T'))
  if (Number.isNaN(parsed.getTime())) {
    return raw.length >= 16 ? raw.slice(5, 16) : raw
  }
  return parsed.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' })
}
