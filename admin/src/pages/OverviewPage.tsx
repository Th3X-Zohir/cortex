import * as React from "react"
import {
  Activity, AlertTriangle, Cpu, Gauge, PlugZap, Clock3, RefreshCcw,
  CheckCircle2,
} from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { api } from "~/lib/api"
import { formatDate, formatNumber } from "~/lib/utils"
import { PageHeader } from "~/components/shared/PageHeader"
import { MetricCard } from "~/components/shared/MetricCard"
import { Skeleton } from "~/components/ui/skeleton"
import type { Stats, UsageSummary, BridgeStatus } from "~/types"

const providerColors = ["#18794e", "#b58400", "#1f7a7a", "#b42318", "#4f7f1f", "#7a4f12"]

export function OverviewPage() {
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [usage, setUsage] = React.useState<UsageSummary | null>(null)
  const [status, setStatus] = React.useState<BridgeStatus | null>(null)
  const [loading, setLoading] = React.useState(true)

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
    } catch {
      // handle error silently
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    load()
    const timer = window.setInterval(load, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const metrics = [
    {
      label: "Requests 24h",
      value: formatNumber(stats?.overview.requestsLast24h ?? 0),
      icon: Activity,
      description: `${formatNumber(stats?.overview.requestsLast1h ?? 0)} in the last hour`,
    },
    {
      label: "Error rate",
      value: stats?.overview.errorRate ?? "0%",
      icon: AlertTriangle,
      description: `${formatNumber(stats?.overview.errorCount ?? 0)} failed requests`,
      iconColor: (Number.parseFloat(stats?.overview.errorRate ?? "0") > 5) ? "text-destructive" : "text-success",
    },
    {
      label: "Avg latency",
      value: `${formatNumber(stats?.overview.avgResponseTime ?? 0)} ms`,
      icon: Clock3,
      description: "All logged provider calls",
    },
    {
      label: "Daily usage",
      value: `${usage?.summary.usagePercent ?? 0}%`,
      icon: Gauge,
      description: `${formatNumber(usage?.summary.totalUsage ?? 0)} of ${formatNumber(usage?.summary.totalLimit ?? 0)}`,
      iconColor: (usage?.summary.usagePercent ?? 0) > 85 ? "text-destructive" : "text-primary",
    },
    {
      label: "Tokens 24h",
      value: formatNumber(stats?.overview.tokensLast24h ?? 0),
      icon: Cpu,
      description: `${formatNumber(stats?.overview.totalTokens ?? 0)} lifetime`,
    },
    {
      label: "Providers",
      value: `${status?.providers.filter(p => p.sessionValid).length ?? 0}/${status?.providers.length ?? 0}`,
      icon: PlugZap,
      description: "Connected sessions",
      iconColor: (status?.providers.some(p => p.sessionValid) ?? false) ? "text-success" : "text-warning",
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Overview"
        description="Live request volume, provider readiness, errors, and limit pressure."
        actions={
          <button
            className="btn-ghost flex items-center gap-2"
            onClick={load}
            disabled={loading}
          >
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      {/* Metrics grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {loading && !stats
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="panel p-5 space-y-3">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))
          : metrics.map((m, i) => (
              <MetricCard
                key={i}
                label={m.label}
                value={m.value}
                icon={m.icon}
                description={m.description}
                iconColor={m.iconColor || "text-primary"}
                className={`animate-fade-in stagger-${i + 1}`}
              />
            ))}
      </div>

      {/* Charts row */}
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        {/* Request trend */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold mb-1">Request trend</h3>
          <p className="text-xs text-muted-foreground mb-4">Hourly volume across retained log window</p>
          {loading && !stats ? (
            <Skeleton className="h-72 w-full rounded-xl" />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.hourlyData ?? []}>
                  <defs>
                    <linearGradient id="requestFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#18794e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#18794e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} minTickGap={28} />
                  <YAxis tick={{ fontSize: 11 }} width={42} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#18794e" fill="url(#requestFill)" strokeWidth={2} />
                  <Area type="monotone" dataKey="totalTokens" stroke="#b58400" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Provider health */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold mb-1">Provider health</h3>
          <p className="text-xs text-muted-foreground mb-4">Browser sessions and API-backed providers</p>
          <div className="space-y-4">
            {loading && !status ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
              ))
            ) : (
              (status?.providers ?? []).map(provider => (
                <div key={provider.name} className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-sm">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.models.length} models</p>
                  </div>
                  {provider.sessionValid ? (
                    <span className="status-success">
                      <span className="relative flex items-center gap-1.5">
                        <span className="absolute inset-0 rounded-full animate-ping opacity-50" />
                        <span className="relative w-1.5 h-1.5 rounded-full bg-success" />
                        Connected
                      </span>
                    </span>
                  ) : (
                    <span className="status-warning">{provider.hasProfile ? "Profile found" : "Disconnected"}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Second row */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Token accounting */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold mb-1">Token accounting</h3>
          <p className="text-xs text-muted-foreground mb-4">Prompt and completion token totals from provider metadata</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Input tokens", value: formatNumber(stats?.overview.promptTokens ?? 0) },
              { label: "Output tokens", value: formatNumber(stats?.overview.completionTokens ?? 0) },
              { label: "Total tokens", value: formatNumber(stats?.overview.totalTokens ?? 0) },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
                  <Cpu size={16} className="text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="text-xl font-bold mt-1">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent failures */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold mb-1">Recent failures</h3>
          <p className="text-xs text-muted-foreground mb-4">Latest rejected or failed requests</p>
          <div className="space-y-3">
            {(stats?.recentErrors ?? []).map(item => (
              <div key={item.id} className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-mono text-xs">{item.model}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.error || "Request failed"}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {item.statusCode ? (
                    <span className={item.statusCode >= 500 ? "status-error" : item.statusCode >= 400 ? "status-warning" : "status-success"}>
                      {item.statusCode}
                    </span>
                  ) : (
                    <span className="status-info">Pending</span>
                  )}
                  <p className="mt-1">{formatDate(item.createdAt)}</p>
                </div>
              </div>
            ))}
            {(!stats?.recentErrors || stats.recentErrors.length === 0) && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 size={24} className="text-success mb-2" />
                <p className="text-sm text-muted-foreground">No recent failures</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Third row */}
      <div className="grid gap-5 xl:grid-cols-2">
        {/* Provider distribution */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold mb-1">Provider distribution</h3>
          <p className="text-xs text-muted-foreground mb-4">Request share by provider</p>
          <div className="h-72">
            {loading && !stats ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats?.providerDistribution ?? []}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={100}
                    innerRadius={60}
                  >
                    {(stats?.providerDistribution ?? []).map((_, index) => (
                      <Cell key={index} fill={providerColors[index % providerColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Top models */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold mb-1">Top models</h3>
          <p className="text-xs text-muted-foreground mb-4">Most frequently requested model IDs</p>
          <div className="h-72">
            {loading && !stats ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(stats?.byModel ?? []).slice(0, 10)} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="model" tick={{ fontSize: 11 }} width={140} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="#b58400" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}