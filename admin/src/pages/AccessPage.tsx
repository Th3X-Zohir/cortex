import { useEffect, useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ApiKey } from '@/types'
import { Alert, EmptyState, Field, Page, Panel, RefreshButton, StatusPill } from '@/components/shared/AppPrimitives'

export function AccessPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', dailyLimit: 1000, rateLimitPerMin: 60 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setKeys(await api.admin.keys.list())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createKey(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const response = await api.admin.keys.create(form)
      setCreatedKey(response.key)
      setForm({ name: '', dailyLimit: 1000, rateLimitPerMin: 60 })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create key')
    }
  }

  async function updateKey(id: string, data: Partial<ApiKey>) {
    await api.admin.keys.update(id, data)
    await load()
  }

  async function deleteKey(id: string) {
    if (!window.confirm('Delete this API key? Existing clients will lose access immediately.')) return
    await api.admin.keys.delete(id)
    await load()
  }

  return (
    <Page title="API Access" description="Issue, disable, rotate, and tune token-based access for OpenAI-compatible API clients." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <Panel title="Create API key" description="The secret is shown once. Store it in the consuming service.">
          <form className="space-y-4" onSubmit={createKey}>
            <Field label="Key name">
              <input className="input" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Production gateway" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Daily limit">
                <input className="input" type="number" min={1} value={form.dailyLimit} onChange={event => setForm({ ...form, dailyLimit: Number(event.target.value) })} />
              </Field>
              <Field label="Rate per minute">
                <input className="input" type="number" min={1} value={form.rateLimitPerMin} onChange={event => setForm({ ...form, rateLimitPerMin: Number(event.target.value) })} />
              </Field>
            </div>
            {error && <Alert tone="bad">{error}</Alert>}
            <button className="btn-primary w-full">Create key</button>
          </form>
          {createdKey && (
            <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4 backdrop-blur-xl">
              <p className="text-sm font-semibold text-primary">New API key</p>
              <code className="mt-2 block break-all rounded-lg bg-black/40 p-3 text-sm font-mono text-primary">{createdKey}</code>
              <p className="mt-2 text-xs text-white/40">This value cannot be shown again.</p>
            </div>
          )}
        </Panel>

        <Panel title="Managed keys" description="Operational access tokens and their current limit state.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-white/5 text-xs uppercase text-white/40">
                <tr>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Prefix</th>
                  <th className="py-3 pr-4">Today</th>
                  <th className="py-3 pr-4">Limit</th>
                  <th className="py-3 pr-4">Rate</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Last used</th>
                  <th className="py-3 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => (
                  <ApiKeyRow key={key.id} item={key} onUpdate={updateKey} onDelete={deleteKey} />
                ))}
              </tbody>
            </table>
          </div>
          {keys.length === 0 && <EmptyState icon={KeyRound} message="No API keys have been created." />}
        </Panel>
      </div>
    </Page>
  )
}

function ApiKeyRow({ item, onUpdate, onDelete }: { item: ApiKey; onUpdate: (id: string, data: Partial<ApiKey>) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name: item.name, dailyLimit: item.dailyLimit, rateLimitPerMin: item.rateLimitPerMin })
  const usagePercent = item.dailyLimit > 0 ? Math.min(100, Math.round((item.requestsToday / item.dailyLimit) * 100)) : 0

  async function save() {
    await onUpdate(item.id, draft)
    setEditing(false)
  }

  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-3 pr-4">
        {editing ? <input className="input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /> : <span className="font-semibold">{item.name}</span>}
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-primary/60">{item.keyPrefix}...</td>
      <td className="py-3 pr-4">
        <div className="h-2 w-28 rounded-full bg-white/5">
          <div className={`h-2 rounded-full transition-all ${usagePercent > 90 ? 'bg-destructive' : usagePercent > 75 ? 'bg-warning' : 'bg-primary'}`} style={{ width: `${usagePercent}%` }} />
        </div>
        <span className="mt-1 block text-xs text-white/40">{formatNumber(item.requestsToday)}</span>
      </td>
      <td className="py-3 pr-4">
        {editing ? <input className="input w-28" type="number" min={1} value={draft.dailyLimit} onChange={event => setDraft({ ...draft, dailyLimit: Number(event.target.value) })} /> : formatNumber(item.dailyLimit)}
      </td>
      <td className="py-3 pr-4">
        {editing ? <input className="input w-24" type="number" min={1} value={draft.rateLimitPerMin} onChange={event => setDraft({ ...draft, rateLimitPerMin: Number(event.target.value) })} /> : `${item.rateLimitPerMin}/min`}
      </td>
      <td className="py-3 pr-4"><StatusPill ok={item.active} trueLabel="Active" falseLabel="Disabled" /></td>
      <td className="py-3 pr-4 text-white/40">{item.lastUsed ? formatDate(item.lastUsed) : 'Never'}</td>
      <td className="py-3 pr-0">
        <div className="flex justify-end gap-2">
          {editing ? (
            <button className="btn-primary min-h-9 px-3" onClick={save}>Save</button>
          ) : (
            <button className="btn-ghost min-h-9 px-3" onClick={() => setEditing(true)}>Edit</button>
          )}
          <button className="btn-ghost min-h-9 px-3" onClick={() => onUpdate(item.id, { active: !item.active })}>{item.active ? 'Disable' : 'Enable'}</button>
          <button className="btn-ghost min-h-9 px-3 text-destructive hover:bg-destructive/10" onClick={() => onDelete(item.id)}><Trash2 size={15} /></button>
        </div>
      </td>
    </tr>
  )
}
