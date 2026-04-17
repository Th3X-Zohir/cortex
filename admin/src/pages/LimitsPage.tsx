import * as React from "react"
import { Gauge, KeyRound, Cpu, SlidersHorizontal, RefreshCcw } from "lucide-react"
import { api } from "~/lib/api"
import { formatDate, formatNumber } from "~/lib/utils"
import { PageHeader } from "~/components/shared/PageHeader"
import { MetricCard } from "~/components/shared/MetricCard"
import { Skeleton } from "~/components/ui/skeleton"
import type { UsageSummary, ApiKey } from "~/types"

export function LimitsPage() {
  const [usage, setUsage] = React.useState<UsageSummary | null>(null)
  const [keys, setKeys] = React.useState<ApiKey[]>([])
  const [loading, setLoading] = React.useState(true)

  async function load() {
    setLoading(true)
    try {
      const [nextUsage, nextKeys] = await Promise.all([
        api.admin.usage(),
        api.admin.keys.list(),
      ])
      setUsage(nextUsage)
      setKeys(nextKeys)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  async function updateLimit(id: string, dailyLimit: number) {
    await api.admin.keys.update(id, { dailyLimit })
    await load()
  }

  const metrics = [
    {
      label: "Total usage",
      value: formatNumber(usage?.summary.totalUsage ?? 0),
      icon: Gauge,
      description: `${usage?.summary.usagePercent ?? 0}% of daily capacity`,
    },
    {
      label: "Total limit",
      value: formatNumber(usage?.summary.totalLimit ?? 0),
      icon: SlidersHorizontal,
      description: "Combined active and inactive keys",
    },
    {
      label: "Active keys",
      value: formatNumber(usage?.summary.activeKeys ?? 0),
      icon: KeyRound,
      description: "Currently accepting requests",
    },
    {
      label: "Tokens today",
      value: formatNumber(usage?.summary.tokensToday ?? 0),
      icon: Cpu,
      description: `${formatNumber(usage?.summary.totalTokens ?? 0)} lifetime`,
    },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Daily Limits"
        description="Monitor consumption against daily caps and adjust capacity before clients are throttled."
        actions={
          <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !usage
          ? Array.from({ length: 4 }).map((_, i) => (
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
                className={`animate-fade-in stagger-${i + 1}`}
              />
            ))}
      </div>

      <div className="panel p-5">
        <h3 className="text-base font-semibold mb-1">Limit controls</h3>
        <p className="text-xs text-muted-foreground mb-5">Daily limits reset at the next UTC day boundary.</p>

        <div className="space-y-4">
          {loading && !usage
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-48" />
                  <Skeleton className="h-3 flex-1 rounded-full" />
                  <Skeleton className="h-10 w-24" />
                </div>
              ))
            : (usage?.keys ?? []).map(item => {
                const key = keys.find(c => c.id === item.id)
                return (
                  <div
                    key={item.id}
                    className="grid gap-3 border-b border-border pb-4 last:border-0 last:pb-0 lg:grid-cols-[minmax(180px,1fr)_minmax(240px,2fr)_180px_150px_140px] lg:items-center"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.active ? <span className="text-success">Active</span> : <span className="text-warning">Disabled</span>}
                        {" · "}resets {formatDate(item.requestsTodayReset)}
                      </p>
                    </div>
                    <div>
                      <div className="h-3 rounded-full bg-muted">
                        <div
                          className={`h-3 rounded-full transition-all ${item.usagePercent > 90 ? "bg-destructive" : item.usagePercent > 75 ? "bg-warning" : "bg-primary"}`}
                          style={{ width: `${Math.min(100, item.usagePercent)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {formatNumber(item.requestsToday)} of {formatNumber(item.dailyLimit)} requests
                      </p>
                    </div>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      defaultValue={item.dailyLimit}
                      onBlur={e => updateLimit(item.id, Number(e.target.value))}
                    />
                    <p className="text-sm text-muted-foreground">{formatNumber(item.tokensToday)} tokens today</p>
                    <p className="text-sm text-muted-foreground">{key?.rateLimitPerMin ?? 0}/min</p>
                  </div>
                )
              })}
        </div>

        {(usage?.keys ?? []).length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Gauge size={28} className="text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Create an API key to start tracking limits.</p>
          </div>
        )}
      </div>
    </div>
  )
}