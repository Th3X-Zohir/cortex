import * as React from "react"
import { KeyRound, Trash2, RefreshCcw, CheckCircle2 } from "lucide-react"
import { api } from "~/lib/api"
import { formatDate, formatNumber } from "~/lib/utils"
import { PageHeader } from "~/components/shared/PageHeader"
import { Skeleton } from "~/components/ui/skeleton"
import type { ApiKey } from "~/types"

export function AccessPage() {
  const [keys, setKeys] = React.useState<ApiKey[]>([])
  const [loading, setLoading] = React.useState(true)
  const [createdKey, setCreatedKey] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({ name: "", dailyLimit: 1000, rateLimitPerMin: 60 })
  const [error, setError] = React.useState("")

  async function load() {
    setLoading(true)
    try {
      setKeys(await api.admin.keys.list())
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  async function createKey(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    try {
      const res = await api.admin.keys.create(form)
      setCreatedKey(res.key)
      setForm({ name: "", dailyLimit: 1000, rateLimitPerMin: 60 })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create key")
    }
  }

  async function updateKey(id: string, data: Partial<ApiKey>) {
    await api.admin.keys.update(id, data)
    await load()
  }

  async function deleteKey(id: string) {
    if (!window.confirm("Delete this API key? Existing clients will lose access immediately.")) return
    await api.admin.keys.delete(id)
    await load()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="API Access"
        description="Issue, disable, rotate, and tune token-based access for OpenAI-compatible API clients."
        actions={
          <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        {/* Create form */}
        <div className="panel p-5 space-y-5">
          <div>
            <h3 className="text-base font-semibold">Create API key</h3>
            <p className="text-xs text-muted-foreground mt-1">The secret is shown once. Store it securely.</p>
          </div>

          <form className="space-y-4" onSubmit={createKey}>
            <div>
              <label className="label" htmlFor="key-name">Key name</label>
              <input
                id="key-name"
                className="input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Production gateway"
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="daily-limit">Daily limit</label>
                <input
                  id="daily-limit"
                  className="input"
                  type="number"
                  min={1}
                  value={form.dailyLimit}
                  onChange={e => setForm({ ...form, dailyLimit: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label" htmlFor="rate-limit">Rate per minute</label>
                <input
                  id="rate-limit"
                  className="input"
                  type="number"
                  min={1}
                  value={form.rateLimitPerMin}
                  onChange={e => setForm({ ...form, rateLimitPerMin: Number(e.target.value) })}
                />
              </div>
            </div>
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>
            )}
            <button type="submit" className="btn-primary w-full">Create key</button>
          </form>

          {createdKey && (
            <div className="rounded-xl border border-secondary/50 bg-secondary/10 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-secondary" />
                <p className="text-sm font-semibold">New API key created</p>
              </div>
              <code className="block break-all rounded-lg bg-black/20 p-3 text-sm font-mono">{createdKey}</code>
              <p className="text-xs text-muted-foreground">This value cannot be shown again. Copy it now.</p>
              <button
                className="btn-ghost text-xs"
                onClick={() => { navigator.clipboard.writeText(createdKey) }}
              >
                Copy to clipboard
              </button>
            </div>
          )}
        </div>

        {/* Keys table */}
        <div className="panel p-5">
          <h3 className="text-base font-semibold mb-4">Managed keys</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border">
                <tr>
                  {["Name", "Prefix", "Today", "Limit", "Rate", "Status", "Last used", "Actions"].map(h => (
                    <th key={h} className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && keys.length === 0
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i} className="border-b border-border">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="py-3 pr-4 last:pr-0"><Skeleton className="h-4 w-20" /></td>
                        ))}
                      </tr>
                    ))
                  : keys.map(key => (
                      <ApiKeyRow key={key.id} item={key} onUpdate={updateKey} onDelete={deleteKey} />
                    ))}
              </tbody>
            </table>
          </div>
          {keys.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <KeyRound size={28} className="text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No API keys have been created yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ApiKeyRow({ item, onUpdate, onDelete }: { item: ApiKey; onUpdate: (id: string, data: Partial<ApiKey>) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState({ name: item.name, dailyLimit: item.dailyLimit, rateLimitPerMin: item.rateLimitPerMin })
  const usagePercent = item.dailyLimit > 0 ? Math.min(100, Math.round((item.requestsToday / item.dailyLimit) * 100)) : 0

  async function save() {
    await onUpdate(item.id, draft)
    setEditing(false)
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4">
        {editing ? (
          <input className="input w-32" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        ) : (
          <span className="font-medium">{item.name}</span>
        )}
      </td>
      <td className="py-3 pr-4 font-mono text-xs">{item.keyPrefix}...</td>
      <td className="py-3 pr-4">
        <div className="h-2 w-28 rounded-full bg-muted">
          <div
            className={`h-2 rounded-full transition-all ${usagePercent > 90 ? "bg-destructive" : usagePercent > 75 ? "bg-warning" : "bg-primary"}`}
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        <span className="mt-1 block text-xs text-muted-foreground">{formatNumber(item.requestsToday)}</span>
      </td>
      <td className="py-3 pr-4">
        {editing ? (
          <input className="input w-24" type="number" min={1} value={draft.dailyLimit} onChange={e => setDraft({ ...draft, dailyLimit: Number(e.target.value) })} />
        ) : (
          formatNumber(item.dailyLimit)
        )}
      </td>
      <td className="py-3 pr-4">
        {editing ? (
          <input className="input w-20" type="number" min={1} value={draft.rateLimitPerMin} onChange={e => setDraft({ ...draft, rateLimitPerMin: Number(e.target.value) })} />
        ) : (
          <span className="text-sm text-muted-foreground">{item.rateLimitPerMin}/min</span>
        )}
      </td>
      <td className="py-3 pr-4">
        {item.active ? (
          <span className="status-success">Active</span>
        ) : (
          <span className="status-warning">Disabled</span>
        )}
      </td>
      <td className="py-3 pr-4 text-muted-foreground">{item.lastUsed ? formatDate(item.lastUsed) : "Never"}</td>
      <td className="py-3 pr-0">
        <div className="flex justify-end gap-2">
          {editing ? (
            <button className="btn-primary min-h-9 px-3 text-xs" onClick={save}>Save</button>
          ) : (
            <button className="btn-ghost min-h-9 px-3 text-xs" onClick={() => setEditing(true)}>Edit</button>
          )}
          <button
            className="btn-ghost min-h-9 px-3 text-xs"
            onClick={() => onUpdate(item.id, { active: !item.active })}
          >
            {item.active ? "Disable" : "Enable"}
          </button>
          <button className="btn-ghost min-h-9 px-3 text-xs text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  )
}