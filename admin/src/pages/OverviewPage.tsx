import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Boxes,
  Clock3,
  KeyRound,
  RefreshCcw,
  Timer,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '@/lib/api'
import { formatCompact, formatDate, formatNumber } from '@/lib/utils'
import type { BridgeStatus, ModelCatalog, RequestLog, Stats, UsageSummary } from '@/types'
import {
  BusyPanel,
  Chip,
  EmptyPanel,
  ErrorBanner,
  PageShell,
  StatTile,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

const LIVE_REFRESH_MS = 10_000
const LIVE_REFRESH_SECONDS = LIVE_REFRESH_MS / 1000
const GRAPH_LOG_LIMIT = 1000
const GRAPH_POINT_LIMIT = 48

const PROVIDER_SERIES_COLORS = ['#2563eb', '#0891b2', '#0f766e']
const HIDDEN_PROVIDER_NAMES = new Set(['unknown', 'system'])

const EMPTY_STATS: Stats = {
  overview: {
    totalRequests: 0,
    requestsLast1h: 0,
    requestsLast24h: 0,
    requestsLast7d: 0,
    avgResponseTime: 0,
    errorCount: 0,
    blockedCount: 0,
    errorRate: '0',
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

type ModelOverviewRow = {
  id: string
  provider: string
  requests: number
  avgResponseTime: number
  errorCount: number
  totalTokens: number
  lastUsed: string | null
}

type NamedCount = {
  name: string
  count: number
}

type ThroughputPoint = {
  bucket: string
  label: string
  requests: number
  tokens: number
  errors: number
  avgLatency: number
  streamRequests: number
  uniqueModels: number
  uniqueApiKeys: number
  uniqueProviders: number
  topProvider: string
  topModel: string
  topApiKey: string
  providerBreakdown: NamedCount[]
  modelBreakdown: NamedCount[]
  apiKeyBreakdown: NamedCount[]
  otherProviders: number
  [key: string]: string | number | NamedCount[]
}

type ProviderSeries = {
  name: string
  key: string
  color: string
}

type ThroughputAnalytics = {
  points: ThroughputPoint[]
  providerSeries: ProviderSeries[]
  overallProviders: NamedCount[]
  overallModels: NamedCount[]
  overallApiKeys: NamedCount[]
}

export function OverviewPage({ adminName = 'Admin' }: { adminName?: string }) {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [graphLogs, setGraphLogs] = useState<RequestLog[]>([])
  const [recentLogs, setRecentLogs] = useState<RequestLog[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [nextRefreshIn, setNextRefreshIn] = useState(LIVE_REFRESH_SECONDS)

  const inFlightRef = useRef(false)
  const hasLoadedRef = useRef(false)

  async function load(silent = true) {
    if (inFlightRef.current) return
    inFlightRef.current = true

    if (!hasLoadedRef.current && !silent) {
      setInitialLoading(true)
    } else {
      setRefreshing(true)
    }

    try {
      const [nextStats, nextStatus, nextUsage, nextCatalog, nextLogs] = await Promise.all([
        api.stats.get(),
        api.providers.status(),
        api.admin.usage(),
        api.providers.models(),
        api.logs.list({ limit: GRAPH_LOG_LIMIT }),
      ])

      setStats(nextStats)
      setStatus(nextStatus)
      setUsage(nextUsage)
      setCatalog(nextCatalog)
      setGraphLogs(nextLogs.logs)
      setRecentLogs(nextLogs.logs.slice(0, 12))
      setLastSync(new Date())
      setNextRefreshIn(LIVE_REFRESH_SECONDS)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard metrics')
    } finally {
      inFlightRef.current = false
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true
        setInitialLoading(false)
      }
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load(false)

    const refreshTimer = window.setInterval(() => {
      void load(true)
    }, LIVE_REFRESH_MS)

    const countdownTimer = window.setInterval(() => {
      setNextRefreshIn(current => (current <= 1 ? LIVE_REFRESH_SECONDS : current - 1))
    }, 1000)

    return () => {
      window.clearInterval(refreshTimer)
      window.clearInterval(countdownTimer)
    }
  }, [])

  const providers = status?.providers ?? []
  const connected = providers.filter(provider => provider.sessionValid).length
  const disconnected = providers.length - connected

  const errorRateValue = Number(String(stats.overview.errorRate).replace('%', '')) || 0
  const quotaPercent = usage?.summary.usagePercent ?? 0
  const activeKeys = usage?.summary.activeKeys ?? 0
  const totalKeys = usage?.keys.length ?? 0
  const requestsPerMinute = Math.round(stats.overview.requestsLast1h / 60)
  const tokensPerRequest = stats.overview.requestsLast24h > 0
    ? Math.round(stats.overview.tokensLast24h / stats.overview.requestsLast24h)
    : 0
  const remainingCapacity = Math.max(0, (usage?.summary.totalLimit ?? 0) - (usage?.summary.totalUsage ?? 0))

  const operationalTone: 'good' | 'warn' | 'bad' = disconnected > 0 || errorRateValue >= 5
    ? 'bad'
    : errorRateValue >= 3
      ? 'warn'
      : 'good'

  const operationalLabel = operationalTone === 'good'
    ? 'Healthy'
    : operationalTone === 'warn'
      ? 'Watch Mode'
      : 'Attention Required'

  const providerRows = useMemo(() => {
    const statsByProvider = new Map(stats.byProvider.map(item => [item.provider, item]))
    const providerNames = Array.from(
      new Set([
        ...providers.map(provider => provider.name),
        ...stats.byProvider.map(item => item.provider),
      ]),
    ).filter(isVisibleProviderName)

    return providerNames
      .map(name => {
        const statusRow = providers.find(provider => provider.name === name)
        const statsRow = statsByProvider.get(name)
        const modelCount = statusRow?.models.length
          ?? catalog?.models.filter(model => model.provider === name).length
          ?? 0

        return {
          name,
          modelCount,
          requests: statsRow?.count ?? 0,
          avgResponseTime: Math.round(statsRow?.avgResponseTime ?? 0),
          totalTokens: statsRow?.totalTokens ?? 0,
          hasProfile: statusRow?.hasProfile ?? false,
          sessionValid: statusRow?.sessionValid ?? false,
        }
      })
      .sort((a, b) => b.requests - a.requests)
  }, [catalog?.models, providers, stats.byProvider])

  const providerScale = useMemo(() => {
    const maxRequests = Math.max(1, ...providerRows.map(row => row.requests))
    const maxTokens = Math.max(1, ...providerRows.map(row => row.totalTokens))
    const maxLatency = Math.max(1, ...providerRows.map(row => row.avgResponseTime))
    return { maxRequests, maxTokens, maxLatency }
  }, [providerRows])

  const throughputAnalytics = useMemo(
    () => buildThroughputAnalytics(graphLogs),
    [graphLogs],
  )

  const topModels = useMemo<ModelOverviewRow[]>(() => {
    if (catalog?.models.length) {
      return [...catalog.models]
        .filter(model => isVisibleModelId(model.id) && isVisibleProviderName(model.provider))
        .sort((a, b) => b.usage.requests - a.usage.requests)
        .slice(0, 8)
        .map(model => ({
          id: model.id,
          provider: model.provider,
          requests: model.usage.requests,
          avgResponseTime: model.usage.avgResponseTime,
          errorCount: model.usage.errorCount,
          totalTokens: model.usage.totalTokens,
          lastUsed: model.usage.lastUsed,
        }))
    }

    return stats.byModel
      .filter(model => isVisibleModelId(model.model))
      .slice(0, 8)
      .map(model => ({
        id: model.model,
        provider: model.model.split('/')[0] ?? 'unknown',
        requests: model.count,
        avgResponseTime: 0,
        errorCount: 0,
        totalTokens: model.totalTokens,
        lastUsed: null,
      }))
  }, [catalog?.models, stats.byModel])

  const keyUsageRows = useMemo(
    () => [...(usage?.keys ?? [])]
      .sort((a, b) => b.requestsToday - a.requestsToday)
      .slice(0, 8),
    [usage?.keys],
  )

  const mostActiveProvider = stats.byProvider.find(item => isVisibleProviderName(item.provider))
  const mostUsedKey = keyUsageRows[0]
  const mostUsedModel = topModels[0]

  return (
    <PageShell
      title="Operations Overview"
      description="Comprehensive live command view for traffic, provider health, model demand, key capacity, and failure hotspots."
      action={
        <>
          <Chip tone={operationalTone}>{operationalLabel}</Chip>
          <Chip tone="default">
            <span className="inline-flex items-center gap-1">
              <Timer size={12} /> Auto refresh {LIVE_REFRESH_SECONDS}s
            </span>
          </Chip>
          <Chip tone="default">Next update in {nextRefreshIn}s</Chip>
          <button type="button" className="ui-btn-secondary" onClick={() => void load(true)} disabled={refreshing}>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh now'}
            </span>
          </button>
        </>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}

      <Surface className="overflow-hidden p-0">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_360px]">
          <div className="bg-gradient-to-br from-blue-700 via-blue-700 to-cyan-700 p-6 text-white md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">Realtime operations briefing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Welcome, {adminName}</h2>
            <p className="mt-3 max-w-xl text-sm text-blue-100 md:text-base">
              This screen auto-refreshes with live telemetry so admins can understand request volume, reliability,
              provider readiness, key limits, and model load at a glance.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-blue-100">
              <span className="rounded-full border border-white/25 px-2.5 py-1" title={`${formatNumber(stats.overview.requestsLast24h)} requests (24h)`}>{formatCompact(stats.overview.requestsLast24h)} requests (24h)</span>
              <span className="rounded-full border border-white/25 px-2.5 py-1" title={`${formatNumber(stats.overview.tokensLast24h)} tokens (24h)`}>{formatCompact(stats.overview.tokensLast24h)} tokens (24h)</span>
              <span className="rounded-full border border-white/25 px-2.5 py-1">{connected}/{providers.length} providers connected</span>
              <span className="rounded-full border border-white/25 px-2.5 py-1">{activeKeys}/{totalKeys} keys active</span>
            </div>
          </div>
          <div className="space-y-3 bg-slate-50 p-6 md:p-8">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Last sync</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{lastSync ? formatDate(lastSync) : 'Not synced yet'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Service state</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{status?.running ? 'Running' : 'Degraded'}</p>
              <p className="text-xs text-slate-500">{disconnected > 0 ? `${disconnected} provider sessions need action` : 'All provider sessions responding'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Quota pressure</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{quotaPercent}%</p>
              <div className="ui-progress-track mt-2">
                <div className="ui-progress-fill" style={{ width: `${Math.min(100, quotaPercent)}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">{formatNumber(remainingCapacity)} requests remaining today</p>
            </div>
          </div>
        </div>
      </Surface>

      {initialLoading ? (
        <BusyPanel text="Loading dashboard data..." />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Total Requests"
              value={formatCompact(stats.overview.totalRequests)}
              hint={`${formatNumber(stats.overview.requestsLast7d)} in last 7 days`}
            />
            <StatTile
              label="Requests (24h)"
              value={formatCompact(stats.overview.requestsLast24h)}
              hint={`${formatNumber(stats.overview.requestsLast1h)} in last 1h`}
            />
            <StatTile
              label="Requests / Min (1h)"
              value={formatNumber(requestsPerMinute)}
              hint="Derived from latest hour volume"
              tone={requestsPerMinute > 20 ? 'warn' : 'good'}
            />
            <StatTile
              label="Average Latency"
              value={`${formatNumber(stats.overview.avgResponseTime)} ms`}
              hint="Across all providers"
              tone={stats.overview.avgResponseTime > 2000 ? 'warn' : 'good'}
            />
            <StatTile
              label="Error Rate"
              value={`${errorRateValue.toFixed(2)}%`}
              hint={`${formatNumber(stats.overview.errorCount)} server errors`}
              tone={errorRateValue >= 3 ? 'bad' : 'good'}
            />
            <StatTile
              label="Blocked Requests"
              value={formatNumber(stats.overview.blockedCount)}
              hint="Auth, rate limit & client errors (4xx)"
              tone="default"
            />
            <StatTile
              label="Providers Connected"
              value={`${connected}/${providers.length}`}
              hint={disconnected > 0 ? `${disconnected} disconnected` : 'All sessions healthy'}
              tone={disconnected > 0 ? 'warn' : 'good'}
            />
            <StatTile
              label="Active API Keys"
              value={`${activeKeys}/${totalKeys}`}
              hint={`${formatNumber(usage?.summary.totalUsage ?? 0)} requests consumed today`}
              tone={activeKeys === 0 ? 'warn' : 'default'}
            />
            <StatTile
              label="Tokens / Request (24h)"
              value={formatCompact(tokensPerRequest)}
              hint={`${formatNumber(stats.overview.tokensLast24h)} total tokens in 24h`}
              tone="default"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Surface>
              <SurfaceHeader
                title="Traffic and Token Throughput"
                description="Detailed live graph with provider composition, token flow, errors, and per-bucket API model/key insights from system logs."
                action={<Chip tone="default">Last {GRAPH_POINT_LIMIT} hourly buckets</Chip>}
              />
              {throughputAnalytics.points.length === 0 ? (
                <EmptyPanel text="No hourly throughput data available yet." />
              ) : (
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={throughputAnalytics.points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(148, 163, 184, 0.14)' }}
                        content={<ThroughputTooltip />}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />

                      {throughputAnalytics.providerSeries.map((series, index) => (
                        <Bar
                          key={series.key}
                          yAxisId="left"
                          dataKey={series.key}
                          name={`${series.name} requests`}
                          stackId="providerTraffic"
                          fill={series.color}
                          radius={index === 0 ? [8, 8, 0, 0] : [0, 0, 0, 0]}
                        />
                      ))}
                      <Bar
                        yAxisId="left"
                        dataKey="otherProviders"
                        name="other providers requests"
                        stackId="providerTraffic"
                        fill="#94a3b8"
                        radius={[8, 8, 0, 0]}
                      />

                      <Line yAxisId="right" type="monotone" dataKey="tokens" name="tokens" stroke="#0f766e" strokeWidth={2.2} dot={false} />
                      <Line yAxisId="left" type="monotone" dataKey="errors" name="errors" stroke="#dc2626" strokeWidth={2} dot={false} strokeDasharray="6 4" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {throughputAnalytics.points.length > 0 ? (
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <BreakdownPanel title="Top Providers In Window" items={throughputAnalytics.overallProviders} emptyText="No provider traffic yet." />
                  <BreakdownPanel title="Top Models In Window" items={throughputAnalytics.overallModels} emptyText="No model calls yet." />
                  <BreakdownPanel title="Top API Keys In Window" items={throughputAnalytics.overallApiKeys} emptyText="No key usage yet." />
                </div>
              ) : null}
            </Surface>

            <Surface>
              <SurfaceHeader title="Provider Health Matrix" description="Visual provider cards showing session state, throughput, token load, and latency pressure." />
              {providerRows.length === 0 ? (
                <EmptyPanel text="No provider status found." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {providerRows.map(row => {
                    const requestPercent = Math.round((row.requests / providerScale.maxRequests) * 100)
                    const tokenPercent = Math.round((row.totalTokens / providerScale.maxTokens) * 100)
                    const latencyPercent = Math.round((row.avgResponseTime / providerScale.maxLatency) * 100)

                    const cardToneClass = row.sessionValid
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : row.hasProfile
                        ? 'border-amber-200 bg-amber-50/40'
                        : 'border-rose-200 bg-rose-50/40'

                    return (
                      <article key={row.name} className={`rounded-2xl border p-4 ${cardToneClass}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                            <p className="text-xs text-slate-500">{row.modelCount} models</p>
                          </div>
                          <Chip tone={row.sessionValid ? 'good' : row.hasProfile ? 'warn' : 'bad'}>
                            {row.sessionValid ? 'Connected' : row.hasProfile ? 'Profile Ready' : 'Disconnected'}
                          </Chip>
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                            <p className="text-slate-500">Requests</p>
                            <p className="mt-0.5 font-semibold text-slate-900" title={`${formatNumber(row.requests)} requests`}>{formatCompact(row.requests)}</p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                            <p className="text-slate-500">Tokens</p>
                            <p className="mt-0.5 font-semibold text-slate-900" title={`${formatNumber(row.totalTokens)} tokens`}>{formatCompact(row.totalTokens)}</p>
                          </div>
                          <div className="rounded-xl border border-slate-200 bg-white px-2 py-1.5">
                            <p className="text-slate-500">Latency</p>
                            <p className="mt-0.5 font-semibold text-slate-900" title={`${formatNumber(row.avgResponseTime)} ms`}>{formatCompact(row.avgResponseTime)} ms</p>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <MetricBar
                            label="Traffic share"
                            value={`${requestPercent}% of peak provider`}
                            percent={requestPercent}
                            tone="blue"
                          />
                          <MetricBar
                            label="Token load"
                            value={`${tokenPercent}% of peak provider`}
                            percent={tokenPercent}
                            tone="emerald"
                          />
                          <MetricBar
                            label="Latency pressure"
                            value={`${latencyPercent}% of slowest provider`}
                            percent={latencyPercent}
                            tone="amber"
                          />
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </Surface>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Surface>
              <SurfaceHeader title="Top Models" description="Highest demand models ranked by live usage telemetry." />
              {topModels.length === 0 ? (
                <EmptyPanel text="No model usage has been recorded yet." />
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table min-w-full">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Provider</th>
                        <th>Requests</th>
                        <th>Latency</th>
                        <th>Errors</th>
                        <th>Last Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topModels.map(model => (
                        <tr key={model.id}>
                          <td className="font-mono text-xs text-slate-700">{model.id}</td>
                          <td>{model.provider}</td>
                          <td>{formatNumber(model.requests)}</td>
                          <td>{model.avgResponseTime > 0 ? `${formatNumber(model.avgResponseTime)} ms` : '-'}</td>
                          <td>{formatNumber(model.errorCount)}</td>
                          <td>{model.lastUsed ? formatDate(model.lastUsed) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Surface>

            <Surface>
              <SurfaceHeader title="API Key Utilization" description="Daily demand and quota pressure by key." />
              {keyUsageRows.length === 0 ? (
                <EmptyPanel text="No API key usage data found." />
              ) : (
                <div className="space-y-2">
                  {keyUsageRows.map(key => (
                    <div key={key.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">{key.name}</p>
                          <p className="text-xs text-slate-500">{formatNumber(key.requestsToday)} requests today</p>
                        </div>
                        <Chip tone={key.usagePercent >= 85 ? 'bad' : key.usagePercent >= 65 ? 'warn' : 'good'}>
                          {key.usagePercent}%
                        </Chip>
                      </div>
                      <div className="ui-progress-track mt-2">
                        <div className="ui-progress-fill" style={{ width: `${Math.min(100, key.usagePercent)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatNumber(key.requestsToday)} / {formatNumber(key.dailyLimit)} daily limit • {formatNumber(key.tokensToday)} tokens today
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Surface>
              <SurfaceHeader title="Recent Request Activity" description="Most recent live request events across all providers." />
              {recentLogs.length === 0 ? (
                <EmptyPanel text="No request activity has been recorded yet." />
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table min-w-full">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Provider</th>
                        <th>Model</th>
                        <th>Status</th>
                        <th>Latency</th>
                        <th>Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLogs.map(log => (
                        <tr key={log.id}>
                          <td>{formatDate(log.createdAt)}</td>
                          <td>{log.provider}</td>
                          <td className="font-mono text-xs text-slate-600">{log.model}</td>
                          <td>
                            {typeof log.statusCode === 'number' ? (
                              <Chip tone={log.statusCode >= 500 ? 'bad' : log.statusCode >= 400 ? 'warn' : 'good'}>
                                {log.statusCode}
                              </Chip>
                            ) : (
                              <Chip tone="default">-</Chip>
                            )}
                          </td>
                          <td>{log.responseTimeMs ? `${formatNumber(log.responseTimeMs)} ms` : '-'}</td>
                          <td>{formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Surface>

            <Surface>
              <SurfaceHeader title="Recent Errors" description="Newest failures requiring operator attention." />
              {stats.recentErrors.length === 0 ? (
                <EmptyPanel text="No recent errors detected." />
              ) : (
                <div className="space-y-2">
                  {stats.recentErrors.map(item => (
                    <div key={item.id} className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-rose-800">{item.provider}</p>
                        <Chip tone="bad">{item.statusCode ?? 'ERR'}</Chip>
                      </div>
                      <p className="mt-1 font-mono text-xs text-rose-700">{item.model}</p>
                      <p className="mt-2 text-xs text-rose-700">{item.error ?? 'Unknown error'}</p>
                      <p className="mt-1 text-[11px] text-rose-600">{formatDate(item.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <Surface className="bg-gradient-to-br from-blue-50 to-white">
              <div className="flex items-center gap-2 text-blue-700"><Activity size={16} /><p className="text-sm font-semibold">Top Provider</p></div>
              <p className="mt-2 text-sm text-slate-700">
                {mostActiveProvider
                  ? `${mostActiveProvider.provider} leads with ${formatNumber(mostActiveProvider.count)} requests and ${formatNumber(Math.round(mostActiveProvider.avgResponseTime))} ms average latency.`
                  : 'No provider traffic ranking available yet.'}
              </p>
            </Surface>
            <Surface className="bg-gradient-to-br from-emerald-50 to-white">
              <div className="flex items-center gap-2 text-emerald-700"><KeyRound size={16} /><p className="text-sm font-semibold">Top API Key</p></div>
              <p className="mt-2 text-sm text-slate-700">
                {mostUsedKey
                  ? `${mostUsedKey.name} has ${formatNumber(mostUsedKey.requestsToday)} requests today (${mostUsedKey.usagePercent}% of quota).`
                  : 'No API key utilization ranking available yet.'}
              </p>
            </Surface>
            <Surface className="bg-gradient-to-br from-cyan-50 to-white">
              <div className="flex items-center gap-2 text-cyan-700"><TrendingUp size={16} /><p className="text-sm font-semibold">Top Model</p></div>
              <p className="mt-2 text-sm text-slate-700">
                {mostUsedModel
                  ? `${mostUsedModel.id} leads with ${formatNumber(mostUsedModel.requests)} requests and ${formatNumber(mostUsedModel.totalTokens)} tokens.`
                  : 'No model demand ranking available yet.'}
              </p>
            </Surface>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <Surface className="bg-gradient-to-br from-slate-50 to-white">
              <div className="flex items-center gap-2 text-slate-700"><Clock3 size={16} /><p className="text-sm font-semibold">Continuous Refresh</p></div>
              <p className="mt-2 text-sm text-slate-600">Dashboard data refreshes every {LIVE_REFRESH_SECONDS} seconds and can also be refreshed manually.</p>
            </Surface>
            <Surface className="bg-gradient-to-br from-amber-50 to-white">
              <div className="flex items-center gap-2 text-amber-700"><AlertTriangle size={16} /><p className="text-sm font-semibold">Risk Signal</p></div>
              <p className="mt-2 text-sm text-slate-600">Posture is {operationalLabel.toLowerCase()} based on current error rate and provider session availability.</p>
            </Surface>
            <Surface className="bg-gradient-to-br from-violet-50 to-white">
              <div className="flex items-center gap-2 text-violet-700"><Boxes size={16} /><p className="text-sm font-semibold">Capacity Summary</p></div>
              <p className="mt-2 text-sm text-slate-600">
                {formatNumber(usage?.summary.totalUsage ?? 0)} requests consumed out of {formatNumber(usage?.summary.totalLimit ?? 0)} daily limit.
              </p>
            </Surface>
          </section>
        </>
      )}
    </PageShell>
  )
}

function MetricBar({
  label,
  value,
  percent,
  tone,
}: {
  label: string
  value: string
  percent: number
  tone: 'blue' | 'emerald' | 'amber'
}) {
  const fillClass =
    tone === 'emerald'
      ? 'bg-emerald-500'
      : tone === 'amber'
        ? 'bg-amber-500'
        : 'bg-blue-600'

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <p className="font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
        <p className="text-slate-600">{value}</p>
      </div>
      <div className="ui-progress-track mt-1">
        <div className={fillClass} style={{ width: `${Math.max(2, Math.min(100, percent))}%`, height: '100%', borderRadius: 9999 }} />
      </div>
    </div>
  )
}

function BreakdownPanel({
  title,
  items,
  emptyText,
}: {
  title: string
  items: NamedCount[]
  emptyText: string
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {items.slice(0, 4).map(item => (
            <div key={`${title}-${item.name}`} className="flex items-center justify-between gap-2 text-xs">
              <p className="truncate text-slate-700">{item.name}</p>
              <p className="font-semibold text-slate-900">{formatNumber(item.count)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ThroughputTooltip({ active, payload }: any) {
  const point = payload?.[0]?.payload as ThroughputPoint | undefined
  if (!active || !point) return null

  return (
    <div className="max-w-[320px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{point.bucket}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <TooltipMetric label="Requests" value={formatNumber(point.requests)} />
        <TooltipMetric label="Tokens" value={formatNumber(point.tokens)} />
        <TooltipMetric label="Errors" value={formatNumber(point.errors)} />
        <TooltipMetric label="Avg latency" value={`${formatNumber(point.avgLatency)} ms`} />
        <TooltipMetric label="Models" value={formatNumber(point.uniqueModels)} />
        <TooltipMetric label="API keys" value={formatNumber(point.uniqueApiKeys)} />
      </div>

      <div className="mt-3 space-y-1 text-xs">
        <p className="text-slate-600"><span className="font-semibold text-slate-800">Top provider:</span> {point.topProvider}</p>
        <p className="text-slate-600"><span className="font-semibold text-slate-800">Top model:</span> {point.topModel}</p>
        <p className="text-slate-600"><span className="font-semibold text-slate-800">Top API key:</span> {point.topApiKey}</p>
      </div>

      <div className="mt-3 grid gap-2">
        <TooltipBreakdown title="Provider split" items={point.providerBreakdown} />
        <TooltipBreakdown title="Model split" items={point.modelBreakdown} />
      </div>
    </div>
  )
}

function TooltipMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function TooltipBreakdown({ title, items }: { title: string; items: NamedCount[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">{title}</p>
      <div className="mt-1 space-y-1">
        {items.slice(0, 3).map(item => (
          <div key={`${title}-${item.name}`} className="flex items-center justify-between gap-2 text-xs">
            <p className="truncate text-slate-600">{item.name}</p>
            <p className="font-semibold text-slate-800">{formatNumber(item.count)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function buildThroughputAnalytics(logs: RequestLog[]): ThroughputAnalytics {
  if (logs.length === 0) {
    return {
      points: [],
      providerSeries: [],
      overallProviders: [],
      overallModels: [],
      overallApiKeys: [],
    }
  }

  type BucketAggregate = {
    requests: number
    tokens: number
    errors: number
    latencyTotal: number
    latencyCount: number
    streamRequests: number
    providers: Map<string, number>
    models: Map<string, number>
    apiKeys: Map<string, number>
  }

  const bucketMap = new Map<string, BucketAggregate>()

  for (const log of logs) {
    const timestamp = new Date(log.createdAt)
    if (Number.isNaN(timestamp.getTime())) continue

    const bucket = toHourBucket(timestamp)
    const aggregate = bucketMap.get(bucket) ?? {
      requests: 0,
      tokens: 0,
      errors: 0,
      latencyTotal: 0,
      latencyCount: 0,
      streamRequests: 0,
      providers: new Map<string, number>(),
      models: new Map<string, number>(),
      apiKeys: new Map<string, number>(),
    }

    aggregate.requests += 1
    aggregate.tokens += asNumber(log.totalTokens ?? log.tokensUsed)
    if (log.statusCode != null && log.statusCode >= 500 || (log.statusCode != null && log.statusCode < 400 && Boolean(log.error))) aggregate.errors += 1
    if (log.stream) aggregate.streamRequests += 1

    const latency = asNumber(log.responseTimeMs)
    if (latency > 0) {
      aggregate.latencyTotal += latency
      aggregate.latencyCount += 1
    }

    if (isVisibleProviderName(log.provider)) {
      incrementCount(aggregate.providers, log.provider)
    }
    if (isVisibleModelId(log.model)) {
      incrementCount(aggregate.models, log.model)
    }
    incrementCount(aggregate.apiKeys, log.apiKeyName || log.apiKeyId || 'anonymous')

    bucketMap.set(bucket, aggregate)
  }

  const bucketEntries = [...bucketMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-GRAPH_POINT_LIMIT)

  const overallProvidersMap = new Map<string, number>()
  const overallModelsMap = new Map<string, number>()
  const overallApiKeysMap = new Map<string, number>()

  for (const [, aggregate] of bucketEntries) {
    mergeCounts(overallProvidersMap, aggregate.providers)
    mergeCounts(overallModelsMap, aggregate.models)
    mergeCounts(overallApiKeysMap, aggregate.apiKeys)
  }

  const overallProviders = mapToSortedCounts(overallProvidersMap)
  const overallModels = mapToSortedCounts(overallModelsMap)
  const overallApiKeys = mapToSortedCounts(overallApiKeysMap)

  const providerSeries = overallProviders.slice(0, 3).map((provider, index) => ({
    name: provider.name,
    key: `provider_${toSeriesKey(provider.name)}`,
    color: PROVIDER_SERIES_COLORS[index] ?? '#2563eb',
  }))

  const points: ThroughputPoint[] = bucketEntries.map(([bucket, aggregate]) => {
    const providerBreakdown = mapToSortedCounts(aggregate.providers)
    const modelBreakdown = mapToSortedCounts(aggregate.models)
    const apiKeyBreakdown = mapToSortedCounts(aggregate.apiKeys)

    const point: ThroughputPoint = {
      bucket,
      label: formatBucketLabel(bucket),
      requests: aggregate.requests,
      tokens: aggregate.tokens,
      errors: aggregate.errors,
      avgLatency: aggregate.latencyCount > 0 ? Math.round(aggregate.latencyTotal / aggregate.latencyCount) : 0,
      streamRequests: aggregate.streamRequests,
      uniqueModels: aggregate.models.size,
      uniqueApiKeys: aggregate.apiKeys.size,
      uniqueProviders: aggregate.providers.size,
      topProvider: providerBreakdown[0]?.name ?? '-',
      topModel: modelBreakdown[0]?.name ?? '-',
      topApiKey: apiKeyBreakdown[0]?.name ?? '-',
      providerBreakdown,
      modelBreakdown,
      apiKeyBreakdown,
      otherProviders: 0,
    }

    let represented = 0
    for (const series of providerSeries) {
      const count = aggregate.providers.get(series.name) ?? 0
      point[series.key] = count
      represented += count
    }
    point.otherProviders = Math.max(0, aggregate.requests - represented)

    return point
  })

  return {
    points,
    providerSeries,
    overallProviders,
    overallModels,
    overallApiKeys,
  }
}

function toHourBucket(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:00`
}

function formatBucketLabel(bucket: string): string {
  const asDate = new Date(bucket.replace(' ', 'T') + ':00')
  if (Number.isNaN(asDate.getTime())) return bucket
  return asDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function toSeriesKey(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return key || 'unknown'
}

function isVisibleProviderName(name: string | null | undefined): name is string {
  if (!name) return false
  const normalized = name.trim().toLowerCase()
  if (!normalized) return false
  return !HIDDEN_PROVIDER_NAMES.has(normalized)
}

function isVisibleModelId(modelId: string | null | undefined): modelId is string {
  if (!modelId) return false
  const normalized = modelId.trim().toLowerCase()
  if (!normalized || normalized === 'unknown' || normalized === 'system') return false

  const slashIndex = normalized.indexOf('/')
  if (slashIndex <= 0 || slashIndex === normalized.length - 1) return false

  const providerFamily = normalized.slice(0, slashIndex)
  return providerFamily.startsWith('web-') && !HIDDEN_PROVIDER_NAMES.has(providerFamily)
}

function asNumber(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function mergeCounts(target: Map<string, number>, source: Map<string, number>): void {
  for (const [key, count] of source.entries()) {
    target.set(key, (target.get(key) ?? 0) + count)
  }
}

function mapToSortedCounts(map: Map<string, number>): NamedCount[] {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
}
