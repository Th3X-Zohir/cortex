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
import { formatDate, formatNumber } from '@/lib/utils'
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

const EMPTY_STATS: Stats = {
  overview: {
    totalRequests: 0,
    requestsLast1h: 0,
    requestsLast24h: 0,
    requestsLast7d: 0,
    avgResponseTime: 0,
    errorCount: 0,
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

export function OverviewPage({ adminName = 'Admin' }: { adminName?: string }) {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
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
        api.logs.list({ limit: 12 }),
      ])

      setStats(nextStats)
      setStatus(nextStatus)
      setUsage(nextUsage)
      setCatalog(nextCatalog)
      setRecentLogs(nextLogs.logs)
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
    )

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

  const throughputSeries = useMemo(
    () => stats.hourlyData.slice(-36).map(point => ({
      label: new Date(point.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      requests: point.count,
      tokens: point.totalTokens ?? 0,
    })),
    [stats.hourlyData],
  )

  const topModels = useMemo<ModelOverviewRow[]>(() => {
    if (catalog?.models.length) {
      return [...catalog.models]
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

    return stats.byModel.slice(0, 8).map(model => ({
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

  const mostActiveProvider = stats.byProvider[0]
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
              <span className="rounded-full border border-white/25 px-2.5 py-1">{formatNumber(stats.overview.requestsLast24h)} requests (24h)</span>
              <span className="rounded-full border border-white/25 px-2.5 py-1">{formatNumber(stats.overview.tokensLast24h)} tokens (24h)</span>
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
              value={formatNumber(stats.overview.totalRequests)}
              hint={`${formatNumber(stats.overview.requestsLast7d)} in last 7 days`}
            />
            <StatTile
              label="Requests (24h)"
              value={formatNumber(stats.overview.requestsLast24h)}
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
              hint={`${formatNumber(stats.overview.errorCount)} failed requests`}
              tone={errorRateValue >= 3 ? 'bad' : 'good'}
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
              value={formatNumber(tokensPerRequest)}
              hint={`${formatNumber(stats.overview.tokensLast24h)} total tokens in 24h`}
              tone="default"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Surface>
              <SurfaceHeader
                title="Traffic and Token Throughput"
                description="Requests and token output by hour from live request logs."
                action={<Chip tone="default">Last 36 points</Chip>}
              />
              {throughputSeries.length === 0 ? (
                <EmptyPanel text="No hourly throughput data available yet." />
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={throughputSeries} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: 12,
                        }}
                        formatter={(value: number, name: string) => [formatNumber(Number(value)), name === 'requests' ? 'Requests' : 'Tokens']}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="left" dataKey="requests" name="requests" fill="#2563eb" radius={[8, 8, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="tokens" name="tokens" stroke="#0f766e" strokeWidth={2.2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Surface>

            <Surface>
              <SurfaceHeader title="Provider Health Matrix" description="Session validity combined with performance and token load." />
              {providerRows.length === 0 ? (
                <EmptyPanel text="No provider status found." />
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table min-w-full">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Status</th>
                        <th>Requests</th>
                        <th>Latency</th>
                        <th>Tokens</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerRows.map(row => (
                        <tr key={row.name}>
                          <td>
                            <p className="font-semibold text-slate-900">{row.name}</p>
                            <p className="text-xs text-slate-500">{row.modelCount} models</p>
                          </td>
                          <td>
                            <Chip tone={row.sessionValid ? 'good' : row.hasProfile ? 'warn' : 'bad'}>
                              {row.sessionValid ? 'Connected' : row.hasProfile ? 'Profile Ready' : 'Disconnected'}
                            </Chip>
                          </td>
                          <td>{formatNumber(row.requests)}</td>
                          <td>{formatNumber(row.avgResponseTime)} ms</td>
                          <td>{formatNumber(row.totalTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
