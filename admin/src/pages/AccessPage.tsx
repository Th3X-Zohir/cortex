import { useEffect, useState } from 'react'
import { KeyRound, Pencil, Power, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ApiKey } from '@/types'
import {
  BusyPanel,
  Chip,
  EmptyPanel,
  ErrorBanner,
  PageShell,
  StatTile,
  SuccessBanner,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

export function AccessPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    dailyLimit: 10000,
    rateLimitPerMin: 120,
  })

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const next = await api.admin.keys.list()
      setKeys(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load API keys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function createKey(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)

    try {
      const created = await api.admin.keys.create({
        name: form.name.trim(),
        dailyLimit: form.dailyLimit,
        rateLimitPerMin: form.rateLimitPerMin,
      })
      setRevealedKey(created.key)
      setNotice(`API key "${created.name}" created successfully.`)
      setForm({ name: '', dailyLimit: 10000, rateLimitPerMin: 120 })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create API key')
    }
  }

  async function saveKey(id: string, data: Partial<ApiKey>) {
    setError(null)
    setNotice(null)

    try {
      await api.admin.keys.update(id, data)
      setNotice('API key updated.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update API key')
    }
  }

  async function deleteKey(id: string, name: string) {
    if (!window.confirm(`Delete API key "${name}"? This action cannot be undone.`)) return

    setError(null)
    setNotice(null)
    try {
      await api.admin.keys.delete(id)
      setNotice('API key removed.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete API key')
    }
  }

  const activeCount = keys.filter(item => item.active).length
  const totalToday = keys.reduce((sum, item) => sum + item.requestsToday, 0)

  return (
    <PageShell
      title="API Access Management"
      description="Issue, govern, and tune production API credentials with daily and per-minute guardrails."
      action={<button type="button" className="ui-btn-secondary" onClick={() => void load()}>Refresh</button>}
    >
      {error ? <ErrorBanner text={error} /> : null}
      {notice ? <SuccessBanner text={notice} /> : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total Keys" value={formatNumber(keys.length)} hint={`${formatNumber(activeCount)} active`} />
        <StatTile label="Requests Today" value={formatNumber(totalToday)} hint="Across all keys" />
        <StatTile label="Highest Daily Limit" value={formatNumber(Math.max(0, ...keys.map(item => item.dailyLimit)))} hint="Configured cap" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Surface>
          <SurfaceHeader title="Create API Key" description="New secret is shown once. Save it securely in your client service." />
          <form className="space-y-4" onSubmit={createKey}>
            <div>
              <label className="ui-label">Key name</label>
              <input
                className="ui-input"
                value={form.name}
                onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
                placeholder="Production gateway"
                required
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="ui-label">Daily limit</label>
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  value={form.dailyLimit}
                  onChange={event => setForm(current => ({ ...current, dailyLimit: Number(event.target.value) }))}
                />
              </div>
              <div>
                <label className="ui-label">Rate / minute</label>
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  value={form.rateLimitPerMin}
                  onChange={event => setForm(current => ({ ...current, rateLimitPerMin: Number(event.target.value) }))}
                />
              </div>
            </div>

            <button type="submit" className="ui-btn-primary w-full">
              <KeyRound size={16} /> Create key
            </button>
          </form>

          {revealedKey ? (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Key secret (shown once)</p>
              <code className="mt-2 block break-all rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs text-slate-700">{revealedKey}</code>
            </div>
          ) : null}
        </Surface>

        <Surface>
          <SurfaceHeader title="Managed Keys" description="Enable, disable, and tune limits without redeploying client integrations." />

          {loading ? (
            <BusyPanel text="Loading API keys..." />
          ) : keys.length === 0 ? (
            <EmptyPanel text="No API keys found yet. Create one to start accepting traffic." />
          ) : (
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Prefix</th>
                    <th>Today</th>
                    <th>Daily Limit</th>
                    <th>Rate / Min</th>
                    <th>Status</th>
                    <th>Last Used</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(item => (
                    <KeyRow
                      key={item.id}
                      item={item}
                      onSave={saveKey}
                      onDelete={deleteKey}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>
      </section>
    </PageShell>
  )
}

function KeyRow({
  item,
  onSave,
  onDelete,
}: {
  item: ApiKey
  onSave: (id: string, data: Partial<ApiKey>) => Promise<void>
  onDelete: (id: string, name: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    name: item.name,
    dailyLimit: item.dailyLimit,
    rateLimitPerMin: item.rateLimitPerMin,
  })

  const usagePercent = Math.min(100, item.dailyLimit > 0 ? Math.round((item.requestsToday / item.dailyLimit) * 100) : 0)

  async function save() {
    await onSave(item.id, {
      name: draft.name,
      dailyLimit: draft.dailyLimit,
      rateLimitPerMin: draft.rateLimitPerMin,
    })
    setEditing(false)
  }

  return (
    <tr>
      <td>
        {editing ? (
          <input
            className="ui-input min-h-9"
            value={draft.name}
            onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
          />
        ) : (
          <span className="font-semibold text-slate-800">{item.name}</span>
        )}
      </td>

      <td className="font-mono text-xs text-slate-600">{item.keyPrefix}...</td>

      <td>
        <div className="space-y-1">
          <div className="ui-progress-track">
            <div
              className={`h-2 rounded-full ${usagePercent > 90 ? 'bg-rose-500' : usagePercent > 75 ? 'bg-amber-500' : 'bg-blue-600'}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">{formatNumber(item.requestsToday)} ({usagePercent}%)</p>
        </div>
      </td>

      <td>
        {editing ? (
          <input
            className="ui-input min-h-9"
            type="number"
            min={1}
            value={draft.dailyLimit}
            onChange={event => setDraft(current => ({ ...current, dailyLimit: Number(event.target.value) }))}
          />
        ) : (
          formatNumber(item.dailyLimit)
        )}
      </td>

      <td>
        {editing ? (
          <input
            className="ui-input min-h-9"
            type="number"
            min={1}
            value={draft.rateLimitPerMin}
            onChange={event => setDraft(current => ({ ...current, rateLimitPerMin: Number(event.target.value) }))}
          />
        ) : (
          formatNumber(item.rateLimitPerMin)
        )}
      </td>

      <td>{item.active ? <Chip tone="good">Active</Chip> : <Chip tone="warn">Disabled</Chip>}</td>

      <td className="text-xs text-slate-500">{item.lastUsed ? formatDate(item.lastUsed) : 'Never'}</td>

      <td>
        <div className="flex flex-wrap justify-end gap-1.5">
          {editing ? (
            <>
              <button type="button" className="ui-btn-primary min-h-8 px-3 text-xs" onClick={() => void save()}>
                Save
              </button>
              <button
                type="button"
                className="ui-btn-secondary min-h-8 px-3 text-xs"
                onClick={() => {
                  setDraft({
                    name: item.name,
                    dailyLimit: item.dailyLimit,
                    rateLimitPerMin: item.rateLimitPerMin,
                  })
                  setEditing(false)
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={() => setEditing(true)}>
              <Pencil size={12} /> Edit
            </button>
          )}

          <button
            type="button"
            className="ui-btn-secondary min-h-8 px-3 text-xs"
            onClick={() => void onSave(item.id, { active: !item.active })}
          >
            <Power size={12} /> {item.active ? 'Disable' : 'Enable'}
          </button>

          <button
            type="button"
            className="ui-btn-danger min-h-8 px-3 text-xs"
            onClick={() => void onDelete(item.id, item.name)}
          >
            <Trash2 size={12} /> Remove
          </button>
        </div>
      </td>
    </tr>
  )
}
