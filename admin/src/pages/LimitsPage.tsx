import { useEffect, useMemo, useState } from 'react'
import { Gauge, Wallet } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ApiKey, UsageSummary } from '@/types'
import {
  BusyPanel,
  ErrorBanner,
  PageShell,
  StatTile,
  SuccessBanner,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

export function LimitsPage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const [usageSummary, keyList] = await Promise.all([api.admin.usage(), api.admin.keys.list()])
      setUsage(usageSummary)
      setKeys(keyList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load limit data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function updateDailyLimit(id: string, value: number) {
    if (!Number.isFinite(value) || value < 1) return
    setError(null)
    setNotice(null)

    try {
      await api.admin.keys.update(id, { dailyLimit: value })
      setNotice('Daily limit updated.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update daily limit')
    }
  }

  const maxUsagePercent = useMemo(
    () => Math.max(0, ...(usage?.keys.map(item => item.usagePercent) ?? [0])),
    [usage?.keys],
  )

  return (
    <PageShell
      title="Capacity and Daily Limits"
      description="Track request consumption per key and adjust daily budgets based on live traffic demand."
      action={<button type="button" className="ui-btn-secondary" onClick={() => void load()}>Refresh</button>}
    >
      {error ? <ErrorBanner text={error} /> : null}
      {notice ? <SuccessBanner text={notice} /> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total Daily Budget"
          value={formatNumber(usage?.summary.totalLimit ?? 0)}
          hint="All key limits combined"
        />
        <StatTile
          label="Consumed Today"
          value={formatNumber(usage?.summary.totalUsage ?? 0)}
          hint={`${Math.round(usage?.summary.usagePercent ?? 0)}% utilization`}
          tone={(usage?.summary.usagePercent ?? 0) > 85 ? 'warn' : 'good'}
        />
        <StatTile
          label="Peak Key Pressure"
          value={`${Math.round(maxUsagePercent)}%`}
          hint="Highest per-key utilization"
          tone={maxUsagePercent > 90 ? 'bad' : maxUsagePercent > 75 ? 'warn' : 'good'}
        />
        <StatTile
          label="Token Volume"
          value={formatNumber(usage?.summary.tokensToday ?? 0)}
          hint={`${formatNumber(usage?.summary.totalTokens ?? 0)} lifetime tokens`}
        />
      </section>

      <Surface>
        <SurfaceHeader
          title="Per-Key Daily Limits"
          description="Edit daily caps directly. New values apply immediately to request validation."
        />

        {loading ? (
          <BusyPanel text="Loading usage data..." />
        ) : usage?.keys.length ? (
          <div className="space-y-3">
            {usage.keys.map(item => {
              const keyMeta = keys.find(key => key.id === item.id)
              const usagePercent = Math.min(100, Math.round(item.usagePercent))
              const fillClass =
                usagePercent > 90
                  ? 'bg-rose-500'
                  : usagePercent > 75
                    ? 'bg-amber-500'
                    : 'bg-blue-600'

              return (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="grid gap-4 lg:grid-cols-[minmax(240px,1fr)_minmax(220px,0.9fr)_180px_180px] lg:items-center">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.active ? 'Active key' : 'Disabled key'} • reset at {formatDate(item.requestsTodayReset)}
                      </p>
                    </div>

                    <div>
                      <div className="ui-progress-track">
                        <div className={`h-2 rounded-full ${fillClass}`} style={{ width: `${usagePercent}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {formatNumber(item.requestsToday)} / {formatNumber(item.dailyLimit)} requests ({usagePercent}%)
                      </p>
                    </div>

                    <div>
                      <label className="ui-label">Daily limit</label>
                      <input
                        className="ui-input"
                        type="number"
                        min={1}
                        defaultValue={item.dailyLimit}
                        onBlur={event => void updateDailyLimit(item.id, Number(event.target.value))}
                      />
                    </div>

                    <div>
                      <label className="ui-label">Rate / minute</label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                        {formatNumber(keyMeta?.rateLimitPerMin ?? 0)} req/min
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No key usage records yet.
          </div>
        )}
      </Surface>

      <section className="grid gap-3 md:grid-cols-2">
        <Surface className="bg-gradient-to-br from-blue-50 to-white">
          <div className="flex items-center gap-2 text-blue-700">
            <Gauge size={16} />
            <p className="text-sm font-semibold">Operational Guidance</p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Keep daily utilization below 85% for stable peak-hour handling. Increase budget only for keys with sustained demand.
          </p>
        </Surface>
        <Surface className="bg-gradient-to-br from-cyan-50 to-white">
          <div className="flex items-center gap-2 text-cyan-700">
            <Wallet size={16} />
            <p className="text-sm font-semibold">Cost Perspective</p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Token volume helps estimate spend pressure. Pair token trends with per-key limits to prevent unexpected budget spikes.
          </p>
        </Surface>
      </section>
    </PageShell>
  )
}
