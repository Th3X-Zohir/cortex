import { useEffect, useState } from 'react'
import { Cpu, Gauge, KeyRound, SlidersHorizontal } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ApiKey, UsageSummary } from '@/types'
import { EmptyState, Metric, Page, Panel, RefreshButton } from '@/components/shared/AppPrimitives'

export function LimitsPage() {
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
