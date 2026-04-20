import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Boxes,
  Clock3,
  ShieldCheck,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { BridgeStatus, Stats, UsageSummary } from '@/types'
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

export function OverviewPage({ adminName = 'Admin' }: { adminName?: string }) {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [status, setStatus] = useState<BridgeStatus | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const [nextStats, nextStatus, nextUsage] = await Promise.all([
        api.stats.get(),
        api.providers.status(),
        api.admin.usage(),
      ])
      setStats(nextStats)
      setStatus(nextStatus)
      setUsage(nextUsage)
      setLastSync(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard metrics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 30000)
    return () => window.clearInterval(timer)
  }, [])

  const providers = status?.providers ?? []
  const connected = providers.filter(provider => provider.sessionValid).length
  const disconnected = providers.length - connected
  const errorRate = Number(stats.overview.errorRate) || 0
  const keyUsagePercent = Math.round(usage?.summary.usagePercent ?? 0)

  const trendData = useMemo(
    () =>
      stats.hourlyData.slice(-36).map(point => ({
        label: new Date(point.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        requests: point.count,
      })),
    [stats.hourlyData],
  )

  const providerBars = useMemo(
    () =>
      stats.byProvider.map(item => ({
        name: item.provider,
        requests: item.count,
      })),
    [stats.byProvider],
  )

  return (
    <PageShell
      title="Operations Overview"
      description="Live service health, throughput, provider readiness, and key consumption from production telemetry."
      action={
        <>
          <Chip tone={status?.running ? 'good' : 'warn'}>{status?.running ? 'Service Running' : 'Service Degraded'}</Chip>
          <button type="button" className="ui-btn-secondary" onClick={() => void load()}>
            Refresh
          </button>
        </>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}

      <Surface className="overflow-hidden p-0">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_340px]">
          <div className="bg-gradient-to-br from-blue-700 via-blue-700 to-cyan-700 p-6 text-white md:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">Live control surface</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Welcome, {adminName}</h2>
            <p className="mt-3 max-w-xl text-sm text-blue-100 md:text-base">
              Monitor requests, session health, and capacity in one clear operational frame.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-blue-100">
              <span className="rounded-full border border-white/25 px-2.5 py-1">{formatNumber(stats.overview.requestsLast24h)} requests (24h)</span>
              <span className="rounded-full border border-white/25 px-2.5 py-1">{formatNumber(stats.overview.tokensLast24h)} tokens (24h)</span>
              <span className="rounded-full border border-white/25 px-2.5 py-1">{providers.length} providers tracked</span>
            </div>
          </div>
          <div className="space-y-3 bg-slate-50 p-6 md:p-8">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Last sync</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{lastSync ? formatDate(lastSync) : 'Not synced yet'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Connected providers</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{connected} / {providers.length}</p>
              <p className="text-xs text-slate-500">{disconnected > 0 ? `${disconnected} need attention` : 'All providers healthy'}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">API key usage</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{keyUsagePercent}%</p>
              <div className="ui-progress-track mt-2">
                <div className="ui-progress-fill" style={{ width: `${Math.min(100, keyUsagePercent)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {loading ? (
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
              label="Requests (1h)"
              value={formatNumber(stats.overview.requestsLast1h)}
              hint={`${formatNumber(stats.overview.requestsLast24h)} in last 24h`}
            />
            <StatTile
              label="Average Latency"
              value={`${formatNumber(stats.overview.avgResponseTime)} ms`}
              hint="Across all providers"
              tone={stats.overview.avgResponseTime > 2000 ? 'warn' : 'good'}
            />
            <StatTile
              label="Error Rate"
              value={`${errorRate.toFixed(2)}%`}
              hint={`${formatNumber(stats.overview.errorCount)} failed requests`}
              tone={errorRate > 3 ? 'bad' : 'good'}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Surface>
              <SurfaceHeader
                title="Request Throughput"
                description="Hourly traffic trend from the request log telemetry stream."
                action={<Chip tone="default">Last 36 points</Chip>}
              />
              {trendData.length === 0 ? (
                <EmptyPanel text="No throughput data available yet." />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="overviewTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563eb" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: 12,
                        }}
                      />
                      <Area type="monotone" dataKey="requests" stroke="#1d4ed8" strokeWidth={2} fill="url(#overviewTrend)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Surface>

            <Surface>
              <SurfaceHeader title="Provider Load" description="Requests handled by each provider." />
              {providerBars.length === 0 ? (
                <EmptyPanel text="No provider usage has been recorded yet." />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={providerBars} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="requests" fill="#0f766e" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Surface>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Surface>
              <SurfaceHeader title="Recent Errors" description="Newest failed requests from production logs." />
              {stats.recentErrors.length === 0 ? (
                <EmptyPanel text="No recent errors detected." />
              ) : (
                <div className="ui-table-wrap">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Provider</th>
                        <th>Model</th>
                        <th>Status</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentErrors.slice(0, 8).map(item => (
                        <tr key={item.id}>
                          <td>{formatDate(item.createdAt)}</td>
                          <td>{item.provider}</td>
                          <td className="font-mono text-xs text-slate-600">{item.model}</td>
                          <td>{item.statusCode ?? '-'}</td>
                          <td className="text-rose-700">{item.error ?? 'Unknown error'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Surface>

            <Surface>
              <SurfaceHeader title="Provider Session Health" description="Current session validity and model mapping." />
              <div className="space-y-2">
                {providers.length === 0 ? (
                  <EmptyPanel text="No provider status found." />
                ) : (
                  providers.map(provider => (
                    <div key={provider.name} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{provider.name}</p>
                          <p className="text-xs text-slate-500">{provider.models.length} models</p>
                        </div>
                        <Chip tone={provider.sessionValid ? 'good' : provider.hasProfile ? 'warn' : 'bad'}>
                          {provider.sessionValid ? (
                            <span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> Connected</span>
                          ) : provider.hasProfile ? (
                            <span className="inline-flex items-center gap-1"><Clock3 size={12} /> Profile Ready</span>
                          ) : (
                            <span className="inline-flex items-center gap-1"><AlertTriangle size={12} /> Disconnected</span>
                          )}
                        </Chip>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Surface>
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <StatTile
              label="Total Tokens"
              value={formatNumber(stats.overview.totalTokens)}
              hint={`${formatNumber(stats.overview.promptTokens)} prompt / ${formatNumber(stats.overview.completionTokens)} completion`}
              tone="default"
            />
            <StatTile
              label="Configured Models"
              value={formatNumber(status?.providers.reduce((sum, provider) => sum + provider.models.length, 0) ?? 0)}
              hint="Across active providers"
              tone="default"
            />
            <StatTile
              label="Daily Request Capacity"
              value={formatNumber(usage?.summary.totalLimit ?? 0)}
              hint={`${formatNumber(usage?.summary.totalUsage ?? 0)} consumed today`}
              tone={keyUsagePercent > 85 ? 'warn' : 'good'}
            />
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <Surface className="bg-gradient-to-br from-blue-50 to-white">
              <div className="flex items-center gap-2 text-blue-700"><Activity size={16} /><p className="text-sm font-semibold">Traffic Monitoring</p></div>
              <p className="mt-2 text-sm text-slate-600">All KPI values are driven by real request logs and refresh every 30 seconds.</p>
            </Surface>
            <Surface className="bg-gradient-to-br from-emerald-50 to-white">
              <div className="flex items-center gap-2 text-emerald-700"><ShieldCheck size={16} /><p className="text-sm font-semibold">Provider Readiness</p></div>
              <p className="mt-2 text-sm text-slate-600">Provider status and model inventory are fetched live from provider control endpoints.</p>
            </Surface>
            <Surface className="bg-gradient-to-br from-cyan-50 to-white">
              <div className="flex items-center gap-2 text-cyan-700"><Boxes size={16} /><p className="text-sm font-semibold">Capacity Awareness</p></div>
              <p className="mt-2 text-sm text-slate-600">Key usage and quota pressure are sourced from admin usage metrics in real time.</p>
            </Surface>
          </section>
        </>
      )}
    </PageShell>
  )
}
