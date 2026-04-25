import { Fragment, useEffect, useRef, useState } from 'react'
import {
  Activity, BookOpen, CheckCircle2, ChevronDown, ChevronRight, Clock,
  Copy, KeyRound, Loader2, LogOut, Plus, Search, Send, TerminalSquare, XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { User, UserKeyRequest, RequestLog } from '@/types'

type Section = 'overview' | 'keys' | 'request' | 'logs' | 'docs' | 'playground'

export function UserDashboardPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [section, setSection] = useState<Section>('overview')

  const nav: Array<{ id: Section; label: string; icon: typeof KeyRound }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'keys', label: 'My Keys', icon: KeyRound },
    { id: 'request', label: 'Request Key', icon: Plus },
    { id: 'logs', label: 'Request Logs', icon: Activity },
    { id: 'docs', label: 'API Docs', icon: BookOpen },
    { id: 'playground', label: 'Playground', icon: TerminalSquare },
  ]

  return (
    <div className="ui-app-shell">
      <div className="grid min-h-screen grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:pl-0">
        {/* Sidebar */}
        <aside className="ui-surface hidden h-[calc(100vh-2rem)] flex-col lg:sticky lg:top-4 lg:flex">
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white/92 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <img src="/logo.svg" alt="Cortex" className="h-9 w-auto" />
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">User Portal</p>
              </div>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-700">
                User
              </span>
            </div>
            <div className="mt-3 h-1.5 w-16 rounded-full bg-gradient-to-r from-teal-600 to-cyan-500" />
          </div>

          <nav className="ui-scroll flex-1 space-y-1 overflow-y-auto pr-1">
            {nav.map(item => {
              const active = item.id === section
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-teal-200 bg-teal-50 text-teal-800 shadow-sm'
                      : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                  }`}
                  onClick={() => setSection(item.id)}
                >
                  <div className="flex items-center gap-2.5">
                    <item.icon size={16} />
                    <span className="text-sm font-semibold">{item.label}</span>
                  </div>
                </button>
              )
            })}
          </nav>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
            <p className="text-xs font-semibold text-slate-600">Signed in as</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{user.username}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
            <button type="button" className="ui-btn-secondary mt-3 w-full" onClick={onLogout}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="space-y-4 pb-6">
          {section === 'overview' && <OverviewSection user={user} onNavigate={setSection} />}
          {section === 'keys' && <KeysSection />}
          {section === 'request' && <RequestSection onSuccess={() => setSection('keys')} />}
          {section === 'logs' && <LogsSection />}
          {section === 'docs' && <DocsSection />}
          {section === 'playground' && <PlaygroundSection />}
        </main>
      </div>
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewSection({ user, onNavigate }: { user: User; onNavigate: (s: Section) => void }) {
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<{ stats: { totalRequests: number; requestsToday: number; totalTokens: number; tokensToday: number }; keys: unknown[] } | null>(null)
  const [requests, setRequests] = useState<UserKeyRequest[]>([])

  useEffect(() => {
    Promise.all([api.user.usage(), api.user.keyRequests()])
      .then(([u, r]) => { setUsage(u); setRequests(r) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Busy />

  const pending = requests.filter(r => r.status === 'pending').length
  const approved = requests.filter(r => r.status === 'approved').length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Welcome, {user.username}</h1>
        <p className="mt-1 text-sm text-slate-500">Here's your API usage overview.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Requests Today" value={formatNumber(usage?.stats.requestsToday ?? 0)} />
        <Stat label="Total Requests" value={formatNumber(usage?.stats.totalRequests ?? 0)} />
        <Stat label="Tokens Today" value={formatNumber(usage?.stats.tokensToday ?? 0)} />
        <Stat label="Approved Keys" value={String(approved)} />
      </div>

      {pending > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You have <strong>{pending}</strong> pending key request{pending > 1 ? 's' : ''} awaiting admin review.
        </div>
      )}

      {approved === 0 && pending === 0 && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          You don&apos;t have any API keys yet.{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => onNavigate('request')}
          >
            Request one now
          </button>
          .
        </div>
      )}

      {requests.length > 0 && (
        <div className="ui-surface rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Recent Requests</h3>
          <div className="space-y-2">
            {requests.slice(0, 5).map(r => (
              <RequestRow key={r.id} request={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── My Keys ───────────────────────────────────────────────────────────────────

interface UserApiKey {
  id: string
  requestId: string
  keyPrefix: string
  name: string
  dailyLimit: number
  rateLimitPerMin: number
  requestsToday: number
  totalRequests: number
  lastUsed: string | null
  createdAt: string
  active: boolean
  usagePercent: number
}

function KeysSection() {
  const [keys, setKeys] = useState<UserApiKey[]>([])
  const [requests, setRequests] = useState<UserKeyRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.user.keys(), api.user.keyRequests()])
      .then(([k, r]) => { setKeys(k as UserApiKey[]); setRequests(r) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Busy />

  const approved = requests.filter(r => r.status === 'approved')

  function copyKey(key: string, id: string) {
    navigator.clipboard.writeText(key).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">My API Keys</h1>

      {keys.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <KeyRound className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-600">No approved keys yet. Request one and wait for admin approval.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map(key => {
            const matchedRequest = approved.find(r => r.apiKeyId === key.id)
            return (
              <div key={key.id} className="ui-surface rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{key.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{key.keyPrefix}...</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${key.active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {key.active ? 'Active' : 'Disabled'}
                  </span>
                </div>

                {matchedRequest?.revealedKey && (
                  <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-teal-700">Your API Key</p>
                      <button
                        type="button"
                        className="flex items-center gap-1 text-xs text-teal-700 hover:underline"
                        onClick={() => copyKey(matchedRequest.revealedKey!, key.id)}
                      >
                        <Copy size={12} />
                        {copied === key.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <code className="mt-1 block break-all text-xs text-slate-700">{matchedRequest.revealedKey}</code>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-3 gap-3 text-center text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{formatNumber(key.requestsToday)}</p>
                    <p className="text-slate-500">Today</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{formatNumber(key.totalRequests)}</p>
                    <p className="text-slate-500">All time</p>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{key.usagePercent}%</p>
                    <p className="text-slate-500">Daily usage</p>
                  </div>
                </div>

                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        key.usagePercent > 90 ? 'bg-rose-500' : key.usagePercent > 75 ? 'bg-amber-500' : 'bg-teal-500'
                      }`}
                      style={{ width: `${key.usagePercent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatNumber(key.requestsToday)} / {formatNumber(key.dailyLimit)} daily limit
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pending / rejected requests */}
      {requests.filter(r => r.status !== 'approved').length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-600">Other Requests</h3>
          <div className="space-y-2">
            {requests.filter(r => r.status !== 'approved').map(r => (
              <RequestRow key={r.id} request={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Request Key ───────────────────────────────────────────────────────────────

function RequestSection({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.user.requestKey(name.trim(), reason.trim() || null)
      setSuccess(true)
      setTimeout(onSuccess, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Request an API Key</h1>
      <p className="text-sm text-slate-500">
        Submit a request for a new API key. Your admin will review and approve it. You can have up to 3 pending requests at a time.
      </p>

      <div className="ui-surface max-w-lg rounded-2xl p-5">
        {success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-teal-500" />
            <p className="font-semibold text-slate-900">Request submitted!</p>
            <p className="text-sm text-slate-500">Your admin will review it shortly.</p>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div>
              <label className="ui-label">Key Name</label>
              <input
                className="ui-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. My Production Key"
                required
              />
            </div>
            <div>
              <label className="ui-label">Reason / Use Case (optional)</label>
              <textarea
                className="ui-input min-h-[80px] resize-none"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Briefly describe what you'll use this key for..."
              />
            </div>
            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            ) : null}
            <button type="submit" className="ui-btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Submit request
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Logs ──────────────────────────────────────────────────────────────────────

function LogsSection() {
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [provider, setProvider] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const limit = 50

  async function load(offset = 0) {
    setLoading(true)
    try {
      const result = await api.user.logs({ limit, offset, search: search || undefined, provider: provider || undefined })
      setLogs(result.logs)
      setTotal(result.pagination.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(page * limit) }, [page])

  function applyFilters() {
    setPage(0)
    void load(0)
  }

  function toggleRow(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Request Logs</h1>
        <button type="button" className="ui-btn-secondary" onClick={() => void load(page * limit)}>Refresh</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="ui-input pl-8"
            placeholder="Search model, error…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
          />
        </div>
        <input
          className="ui-input w-36"
          placeholder="Provider"
          value={provider}
          onChange={e => setProvider(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyFilters()}
        />
        <button type="button" className="ui-btn-primary" onClick={applyFilters}>Apply</button>
      </div>

      {loading ? (
        <Busy />
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">No request logs found.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="ui-table w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Provider</th>
                  <th className="px-4 py-2 text-left">Model</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Tokens</th>
                  <th className="px-4 py-2 text-right">Latency</th>
                  <th className="px-4 py-2 text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <UserLogRow
                    key={log.id}
                    log={log}
                    expanded={expandedIds.has(log.id)}
                    onToggle={() => toggleRow(log.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{total} total · page {page + 1} of {Math.max(1, Math.ceil(total / limit))}</span>
            <div className="flex gap-2">
              <button type="button" className="ui-btn-secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
              <button type="button" className="ui-btn-secondary" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function UserLogRow({ log, expanded, onToggle }: { log: RequestLog; expanded: boolean; onToggle: () => void }) {
  const statusColor =
    !log.statusCode ? 'bg-slate-100 text-slate-500'
    : log.statusCode >= 500 ? 'bg-red-50 text-red-700'
    : log.statusCode >= 400 ? 'bg-amber-50 text-amber-700'
    : 'bg-green-50 text-green-700'

  return (
    <Fragment>
      <tr className="border-t border-slate-100 hover:bg-slate-50/50">
        <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
        <td className="px-4 py-2.5 font-medium text-slate-800">{log.provider}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{log.model}</td>
        <td className="px-4 py-2.5">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusColor}`}>
            {log.statusCode ?? '—'}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right text-xs tabular-nums text-slate-600">
          {log.totalTokens != null ? formatNumber(log.totalTokens) : '—'}
        </td>
        <td className="px-4 py-2.5 text-right text-xs tabular-nums text-slate-600">
          {log.responseTimeMs ? `${log.responseTimeMs} ms` : '—'}
        </td>
        <td className="px-4 py-2.5 text-right">
          <button type="button" className="ui-btn-secondary min-h-7 px-2.5 text-xs" onClick={onToggle}>
            {expanded ? 'Hide' : 'View'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50/60">
          <td colSpan={7} className="px-4 py-3">
            <div className="space-y-3">
              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <LogDetail label="Log ID" value={log.id} mono />
                <LogDetail label="Stream" value={log.stream ? 'Yes' : 'No'} />
                <LogDetail label="Messages" value={String(log.messagesCount ?? '—')} />
                <LogDetail label="Prompt tokens" value={formatNumber(log.promptTokens ?? 0)} />
                <LogDetail label="Completion tokens" value={formatNumber(log.completionTokens ?? 0)} />
                <LogDetail label="Total tokens" value={formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)} />
                {log.error && <LogDetail label="Error" value={log.error} wide />}
              </div>
              {/* Payloads */}
              {log.requestPayload != null && <LogPayloadPanel label="Request payload" value={log.requestPayload} defaultExpanded />}
              {log.responsePayload != null && <LogPayloadPanel label="Response payload" value={log.responsePayload} />}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

function LogDetail({ label, value, mono = false, wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-full' : ''}>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-0.5 break-all text-sm text-slate-700 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}

function LogPayloadPanel({ label, value, defaultExpanded = false }: { label: string; value: unknown; defaultExpanded?: boolean }) {
  const [open, setOpen] = useState(defaultExpanded)
  const [copied, setCopied] = useState(false)

  const { formatted, preview, kind, characters, lines } = logFormatPayload(value)

  function copy() {
    navigator.clipboard.writeText(formatted).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button type="button" className="flex min-w-0 items-center gap-2 text-left" onClick={() => setOpen(o => !o)}>
          {open
            ? <ChevronDown size={14} className="shrink-0 text-slate-400" />
            : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">{label}</p>
            <p className="text-[10px] text-slate-400">{kind} · {formatNumber(characters)} chars · {formatNumber(lines)} lines</p>
          </div>
        </button>
        <button type="button" className="ui-btn-secondary min-h-7 shrink-0 px-2.5 text-xs" onClick={copy}>
          <Copy size={11} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {open ? (
        <div className="border-t border-slate-100 p-3">
          <pre className="max-h-[28rem] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{formatted}</pre>
        </div>
      ) : (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          <pre className="max-h-24 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs text-slate-500">{preview}</pre>
        </div>
      )}
    </div>
  )
}

function logFormatPayload(value: unknown) {
  let kind = 'text'
  let formatted = ''
  if (typeof value === 'string') {
    try { formatted = JSON.stringify(JSON.parse(value), null, 2); kind = 'json' } catch { formatted = value }
  } else {
    formatted = JSON.stringify(value, null, 2)
    kind = typeof value === 'object' && value !== null ? 'json' : 'value'
  }
  const safe = formatted || 'No data'
  const lineArr = safe.split('\n')
  return { kind, formatted: safe, preview: lineArr.length > 6 ? lineArr.slice(0, 6).join('\n') + '\n…' : safe, characters: safe.length, lines: lineArr.length }
}

// ── API Docs ──────────────────────────────────────────────────────────────────

function DocsSection() {
  const base = window.location.origin
  const [copied, setCopied] = useState<string | null>(null)

  function copy(text: string, id: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  function CodeBlock({ id, code }: { id: string; code: string }) {
    return (
      <div className="relative mt-2 rounded-xl border border-slate-200 bg-slate-900 p-4">
        <button
          type="button"
          className="absolute right-3 top-3 flex items-center gap-1 rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
          onClick={() => copy(code, id)}
        >
          <Copy size={11} />
          {copied === id ? 'Copied!' : 'Copy'}
        </button>
        <pre className="overflow-x-auto text-xs text-slate-300">{code}</pre>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">API Documentation</h1>
        <p className="mt-1 text-sm text-slate-500">Integrate with Cortex using the OpenAI-compatible REST API.</p>
      </div>

      {/* Base URL */}
      <section className="ui-surface rounded-2xl p-5 space-y-2">
        <h2 className="text-base font-semibold text-slate-800">Base URL</h2>
        <CodeBlock id="base" code={`${base}/v1`} />
      </section>

      {/* Authentication */}
      <section className="ui-surface rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-800">Authentication</h2>
        <p className="text-sm text-slate-600">
          Pass your API key in the <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono">Authorization</code> header as a Bearer token on every request.
        </p>
        <CodeBlock id="auth" code={`Authorization: Bearer cx-your-api-key-here`} />
      </section>

      {/* Chat completions */}
      <section className="ui-surface rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">POST</span>
          <h2 className="text-base font-semibold text-slate-800">/v1/chat/completions</h2>
        </div>
        <p className="text-sm text-slate-600">Create a chat completion. Compatible with the OpenAI Chat Completions API.</p>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 pt-2">Request body</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Parameter</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Required</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ['model', 'string', 'Yes', 'Model ID (e.g. gpt-4o, claude-3-5-sonnet, gemini-2.0-flash)'],
                ['messages', 'array', 'Yes', 'Array of message objects with role and content'],
                ['stream', 'boolean', 'No', 'Enable server-sent event streaming (default: false)'],
                ['temperature', 'number', 'No', 'Sampling temperature 0–2 (default: 1)'],
                ['max_tokens', 'number', 'No', 'Maximum tokens in the completion'],
              ].map(([p, t, r, d]) => (
                <tr key={p} className="bg-white">
                  <td className="px-3 py-2 font-mono font-semibold text-slate-800">{p}</td>
                  <td className="px-3 py-2 text-slate-500">{t}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${r === 'Yes' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>{r}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 pt-2">Example request</h3>
        <CodeBlock id="chat-curl" code={`curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer cx-your-api-key-here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "user", "content": "Hello!" }
    ]
  }'`} />

        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 pt-2">Example response</h3>
        <CodeBlock id="chat-resp" code={`{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": { "role": "assistant", "content": "Hi there! How can I help?" },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 10, "completion_tokens": 9, "total_tokens": 19 }
}`} />
      </section>

      {/* Models */}
      <section className="ui-surface rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-700">GET</span>
          <h2 className="text-base font-semibold text-slate-800">/v1/models</h2>
        </div>
        <p className="text-sm text-slate-600">List all available models.</p>
        <CodeBlock id="models-curl" code={`curl ${base}/v1/models \\
  -H "Authorization: Bearer cx-your-api-key-here"`} />
      </section>

      {/* SDK examples */}
      <section className="ui-surface rounded-2xl p-5 space-y-3">
        <h2 className="text-base font-semibold text-slate-800">SDK Usage</h2>
        <p className="text-sm text-slate-600">Use any OpenAI-compatible SDK by pointing it at this base URL.</p>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Python</h3>
        <CodeBlock id="py" code={`from openai import OpenAI

client = OpenAI(
    api_key="cx-your-api-key-here",
    base_url="${base}/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`} />

        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 pt-2">JavaScript / TypeScript</h3>
        <CodeBlock id="js" code={`import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'cx-your-api-key-here',
  baseURL: '${base}/v1',
  dangerouslyAllowBrowser: true,
})

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }],
})
console.log(response.choices[0].message.content)`} />
      </section>
    </div>
  )
}

// ── Playground ────────────────────────────────────────────────────────────────

interface PlayKey { id: string; name: string; revealedKey: string }

interface ResponseMeta {
  id: string
  object: string
  model: string
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null
  finish_reason: string | null
}

type ResponseTab = 'output' | 'json' | 'request'

function PlaygroundSection() {
  const [keys, setKeys] = useState<PlayKey[]>([])
  const [loadingKeys, setLoadingKeys] = useState(true)
  const [selectedKey, setSelectedKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [model, setModel] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [showSystem, setShowSystem] = useState(false)
  const [temperature, setTemperature] = useState(1)
  const [maxTokens, setMaxTokens] = useState('')
  const [streamEnabled, setStreamEnabled] = useState(true)
  const [userMsg, setUserMsg] = useState('')
  const [responseText, setResponseText] = useState('')
  const [responseMeta, setResponseMeta] = useState<ResponseMeta | null>(null)
  const [sentPayload, setSentPayload] = useState<object | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [responseTab, setResponseTab] = useState<ResponseTab>('output')
  const [copied, setCopied] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    Promise.all([api.user.keys(), api.user.keyRequests()])
      .then(([ks, reqs]) => {
        const approved = (reqs as UserKeyRequest[]).filter(r => r.status === 'approved' && r.revealedKey)
        const playKeys = (ks as Array<{ id: string; name: string }>).flatMap(k => {
          const req = approved.find(r => r.apiKeyId === k.id)
          if (!req?.revealedKey) return []
          return [{ id: k.id, name: k.name, revealedKey: req.revealedKey }]
        })
        setKeys(playKeys)
        if (playKeys.length > 0) setSelectedKey(playKeys[0].revealedKey)
      })
      .finally(() => setLoadingKeys(false))
  }, [])

  useEffect(() => {
    if (!selectedKey) return
    setLoadingModels(true)
    setModels([])
    fetch('/v1/models', { headers: { Authorization: `Bearer ${selectedKey}` } })
      .then(r => r.json())
      .then((data: { data?: Array<{ id: string }> }) => {
        const ids = (data.data ?? []).map(m => m.id).filter(Boolean)
        setModels(ids)
        setModel(prev => (ids.includes(prev) ? prev : (ids[0] ?? '')))
      })
      .catch(() => {})
      .finally(() => setLoadingModels(false))
  }, [selectedKey])

  function buildPayload(withStream = streamEnabled) {
    const messages: Array<{ role: string; content: string }> = []
    if (systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt.trim() })
    messages.push({ role: 'user', content: userMsg.trim() })
    const payload: Record<string, unknown> = { model, stream: withStream, messages, temperature }
    if (maxTokens && Number(maxTokens) > 0) payload.max_tokens = Number(maxTokens)
    return payload
  }

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function send() {
    if (!selectedKey || !userMsg.trim()) return
    const payload = buildPayload()
    setSentPayload(payload)
    setResponseText('')
    setResponseMeta(null)
    setError(null)
    setStreaming(true)
    setResponseTab('output')
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${selectedKey}` },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const p = await res.json().catch(() => ({}))
        const msg = typeof p.error === 'string' ? p.error : p.error?.message
        throw new Error(msg || `HTTP ${res.status}`)
      }

      if (!streamEnabled) {
        // Non-streaming: parse full JSON response
        const data = await res.json()
        const content = data.choices?.[0]?.message?.content ?? ''
        setResponseText(content)
        setResponseMeta({
          id: data.id ?? '',
          object: data.object ?? 'chat.completion',
          model: data.model ?? model,
          usage: data.usage ?? null,
          finish_reason: data.choices?.[0]?.finish_reason ?? 'stop',
        })
      } else {
        // Streaming: consume SSE chunks
        let accText = ''
        const meta: ResponseMeta = { id: '', object: 'chat.completion', model, usage: null, finish_reason: null }
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() || ''
          for (const part of parts) {
            for (const line of part.split('\n')) {
              if (!line.startsWith('data: ')) continue
              const raw = line.slice(6).trim()
              if (!raw || raw === '[DONE]') continue
              try {
                const chunk = JSON.parse(raw)
                if (chunk.id) meta.id = chunk.id
                if (chunk.model) meta.model = chunk.model
                if (chunk.usage) meta.usage = chunk.usage
                const choice = chunk.choices?.[0]
                if (choice?.delta?.content) {
                  accText += choice.delta.content
                  setResponseText(accText)
                }
                if (choice?.finish_reason) meta.finish_reason = choice.finish_reason
              } catch { /* ignore */ }
            }
          }
        }
        setResponseMeta(meta)
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') setError(err.message)
    } finally {
      setStreaming(false)
    }
  }

  // Build final JSON response object for display
  const responseJson = responseMeta
    ? {
        id: responseMeta.id,
        object: responseMeta.object,
        model: responseMeta.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: responseText },
          finish_reason: responseMeta.finish_reason ?? 'stop',
        }],
        usage: responseMeta.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      }
    : null

  const liveRequestJson = JSON.stringify(buildPayload(), null, 2)

  if (loadingKeys) return <Busy />

  if (keys.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Playground</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <TerminalSquare className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <p className="text-sm font-semibold text-amber-800">No active API keys</p>
          <p className="mt-1 text-sm text-amber-700">You need at least one approved API key to use the playground.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Playground</h1>
      <p className="text-sm text-slate-500">Test the API directly. Switch to JSON view to inspect the raw request and response structure.</p>

      <div className="grid gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">

        {/* ── Left: Input panel ── */}
        <div className="space-y-3">

          {/* Key */}
          <div>
            <label className="ui-label">API Key</label>
            <select className="ui-input" value={selectedKey} onChange={e => setSelectedKey(e.target.value)}>
              {keys.map(k => <option key={k.id} value={k.revealedKey}>{k.name}</option>)}
            </select>
          </div>

          {/* Model */}
          <div>
            <label className="ui-label">Model</label>
            {loadingModels ? (
              <div className="ui-input flex items-center gap-2 text-slate-400">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-sm">Loading models…</span>
              </div>
            ) : models.length > 0 ? (
              <select className="ui-input" value={model} onChange={e => setModel(e.target.value)}>
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input className="ui-input" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. gpt-4o" />
            )}
          </div>

          {/* Parameters row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="ui-label">Temperature <span className="text-slate-400">{temperature}</span></label>
              <input
                type="range" min="0" max="2" step="0.1"
                className="w-full accent-teal-600"
                value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="ui-label">Max tokens</label>
              <input
                className="ui-input"
                type="number"
                min="1"
                value={maxTokens}
                onChange={e => setMaxTokens(e.target.value)}
                placeholder="unlimited"
              />
            </div>
          </div>

          {/* System prompt toggle */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
              onClick={() => setShowSystem(s => !s)}
            >
              <span className={`transition-transform ${showSystem ? 'rotate-90' : ''}`}>▶</span>
              System prompt {showSystem ? '' : '(optional)'}
            </button>
            {showSystem && (
              <textarea
                className="ui-input mt-1.5 min-h-[72px] resize-none font-mono text-xs"
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant…"
              />
            )}
          </div>

          {/* User message */}
          <div>
            <label className="ui-label">User message</label>
            <textarea
              className="ui-input min-h-[140px] resize-y"
              value={userMsg}
              onChange={e => setUserMsg(e.target.value)}
              placeholder="Enter your message…"
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send() }}
            />
            <p className="mt-1 text-xs text-slate-400">Ctrl+Enter to send</p>
          </div>

          {/* Stream toggle + Send / Stop */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                streamEnabled
                  ? 'border-teal-200 bg-teal-50 text-teal-700'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
              onClick={() => setStreamEnabled(s => !s)}
              title="Toggle streaming mode"
            >
              <span className={`h-2 w-2 rounded-full ${streamEnabled ? 'bg-teal-500 animate-pulse' : 'bg-slate-300'}`} />
              Stream
            </button>
            <button type="button" className="ui-btn-primary flex-1" onClick={send} disabled={streaming || !userMsg.trim()}>
              {streaming ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {streaming ? 'Generating…' : 'Send'}
            </button>
            {streaming && (
              <button type="button" className="ui-btn-secondary" onClick={() => abortRef.current?.abort()}>Stop</button>
            )}
          </div>

          {/* Live request JSON preview */}
          <details className="group rounded-xl border border-slate-200">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700">
              Request JSON preview
            </summary>
            <div className="relative">
              <button
                type="button"
                className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
                onClick={() => copyText(liveRequestJson, 'req-preview')}
              >
                <Copy size={10} /> {copied === 'req-preview' ? 'Copied!' : 'Copy'}
              </button>
              <pre className="overflow-x-auto rounded-b-xl bg-slate-900 p-3 text-xs text-slate-300">{liveRequestJson}</pre>
            </div>
          </details>
        </div>

        {/* ── Right: Response panel ── */}
        <div className="flex flex-col gap-3">

          {/* Tab bar */}
          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
              {(['output', 'json', 'request'] as ResponseTab[]).map(tab => (
                <button
                  key={tab}
                  type="button"
                  className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                    responseTab === tab
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  onClick={() => setResponseTab(tab)}
                >
                  {tab === 'json' ? 'JSON' : tab === 'request' ? 'Request' : 'Output'}
                </button>
              ))}
            </div>

            {/* Usage badge */}
            {responseMeta?.usage && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono">
                  ↑ {responseMeta.usage.prompt_tokens} / ↓ {responseMeta.usage.completion_tokens} / Σ {responseMeta.usage.total_tokens} tok
                </span>
              </div>
            )}
          </div>

          {/* Tab content */}
          <div className="relative min-h-[320px] rounded-2xl border border-slate-200 bg-slate-900">

            {/* Copy button */}
            {(responseTab === 'output' ? responseText : responseTab === 'json' ? responseJson : sentPayload) && (
              <button
                type="button"
                className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600"
                onClick={() => {
                  const txt =
                    responseTab === 'output' ? responseText
                    : responseTab === 'json' ? JSON.stringify(responseJson, null, 2)
                    : JSON.stringify(sentPayload, null, 2)
                  copyText(txt ?? '', 'resp')
                }}
              >
                <Copy size={10} /> {copied === 'resp' ? 'Copied!' : 'Copy'}
              </button>
            )}

            <div className="overflow-auto p-4 text-xs">
              {error ? (
                <div className="rounded-xl border border-rose-800 bg-rose-950 px-3 py-2 text-sm text-rose-300">{error}</div>
              ) : responseTab === 'output' ? (
                responseText
                  ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-100">{responseText}{streaming ? '▌' : ''}</pre>
                  : <p className="text-slate-500">{streaming ? 'Generating…' : 'Output will appear here'}</p>
              ) : responseTab === 'json' ? (
                responseJson
                  ? <pre className="text-teal-300">{JSON.stringify(responseJson, null, 2)}</pre>
                  : streaming
                    ? <p className="text-slate-500">Building response…</p>
                    : <p className="text-slate-500">Send a request to see the JSON response</p>
              ) : /* request tab */ (
                sentPayload
                  ? <pre className="text-blue-300">{JSON.stringify(sentPayload, null, 2)}</pre>
                  : <p className="text-slate-500">Send a request to see what was submitted</p>
              )}
            </div>
          </div>

          {/* Metadata footer */}
          {responseMeta?.id && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <span><span className="font-semibold text-slate-700">id</span> {responseMeta.id}</span>
              <span><span className="font-semibold text-slate-700">model</span> {responseMeta.model}</span>
              <span><span className="font-semibold text-slate-700">finish</span> {responseMeta.finish_reason ?? '—'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function RequestRow({ request }: { request: UserKeyRequest }) {
  const icons = {
    pending: <Clock size={14} className="text-amber-500" />,
    approved: <CheckCircle2 size={14} className="text-green-500" />,
    rejected: <XCircle size={14} className="text-red-500" />,
  }
  const colors = {
    pending: 'text-amber-700 bg-amber-50 border-amber-200',
    approved: 'text-green-700 bg-green-50 border-green-200',
    rejected: 'text-red-700 bg-red-50 border-red-200',
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        {icons[request.status]}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{request.name}</p>
          {request.reviewNote && (
            <p className="text-xs text-slate-500 truncate">{request.reviewNote}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${colors[request.status]}`}>
          {request.status}
        </span>
        <span className="text-xs text-slate-400">{formatDate(request.createdAt)}</span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function Busy() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )
}
