import { useEffect, useState, useCallback } from 'react'
import {
  Activity, CheckCircle2, ChevronRight, Clock, Copy, Eye, EyeOff,
  KeyRound, Loader2, Lock, Plus, Power, RefreshCw, Search,
  Trash2, UserCheck, UserMinus, UserX, XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { User, UserApiKey, UserKeyRequest } from '@/types'
import {
  BusyPanel, EmptyPanel, ErrorBanner, PageShell, StatTile, SuccessBanner,
} from '@/components/dashboard/UiKit'

// ── Types ────────────────────────────────────────────────────────────────────

interface UserDetail {
  user: User
  requests: UserKeyRequest[]
  keys: UserApiKey[]
  stats: { totalRequests: number; requestsToday: number; totalTokens: number; tokensToday: number }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.admin.portalUsers.list({
        search: search || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      setUsers(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [search, statusFilter])

  useEffect(() => { void loadUsers() }, [loadUsers])

  const activeCount = users.filter(u => u.status === 'active').length
  const suspendedCount = users.filter(u => u.status === 'suspended').length

  return (
    <PageShell
      title="Portal Users"
      description="Manage registered user accounts, their API keys, and access."
      action={
        <button type="button" className="ui-btn-secondary" onClick={() => void loadUsers()}>
          <RefreshCw size={14} /> Refresh
        </button>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}
      {notice ? <SuccessBanner text={notice} /> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Total Users" value={formatNumber(users.length)} hint="Registered accounts" />
        <StatTile label="Active" value={formatNumber(activeCount)} hint="Can sign in" tone="good" />
        <StatTile label="Suspended" value={formatNumber(suspendedCount)} hint="Access blocked" tone={suspendedCount > 0 ? 'warn' : 'default'} />
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="ui-input pl-8"
            placeholder="Search username or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'active', 'suspended'] as const).map(s => (
            <button
              key={s}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-4 ${selectedId ? 'lg:grid-cols-[1fr_420px]' : ''}`}>
        {/* User list */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {loading ? (
            <BusyPanel text="Loading users…" />
          ) : users.length === 0 ? (
            <EmptyPanel text="No users match the current filter." />
          ) : (
            <table className="ui-table w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Email</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Joined</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Last Login</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr
                    key={user.id}
                    className={`border-t border-slate-100 cursor-pointer transition-colors hover:bg-slate-50 ${
                      selectedId === user.id ? 'bg-blue-50/60' : ''
                    }`}
                    onClick={() => setSelectedId(selectedId === user.id ? null : user.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                          {user.username.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">{user.email}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">
                      {user.lastLogin ? formatDate(user.lastLogin) : 'Never'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={user.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight
                        size={16}
                        className={`ml-auto text-slate-400 transition-transform ${selectedId === user.id ? 'rotate-90' : ''}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <UserDetailPanel
            userId={selectedId}
            onClose={() => setSelectedId(null)}
            onUserUpdated={() => { void loadUsers() }}
            onNotice={setNotice}
            onError={setError}
          />
        )}
      </div>
    </PageShell>
  )
}

// ── Detail Panel ─────────────────────────────────────────────────────────────

type DetailTab = 'overview' | 'requests' | 'keys' | 'issue-key' | 'danger'

function UserDetailPanel({
  userId,
  onClose,
  onUserUpdated,
  onNotice,
  onError,
}: {
  userId: string
  onClose: () => void
  onUserUpdated: () => void
  onNotice: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<DetailTab>('overview')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await api.admin.portalUsers.detail(userId)
      setDetail(d)
    } catch {
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-500">User not found.</p>
      </div>
    )
  }

  const { user, requests, keys, stats } = detail
  const tabs: Array<{ id: DetailTab; label: string; icon: typeof Activity }> = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'requests', label: `Requests (${requests.length})`, icon: Clock },
    { id: 'keys', label: `Keys (${keys.length})`, icon: KeyRound },
    { id: 'issue-key', label: 'Issue Key', icon: Plus },
    { id: 'danger', label: 'Manage', icon: UserCheck },
  ]

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{user.username}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={user.status} />
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle size={18} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-100 px-2 pt-2 gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`flex shrink-0 items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition ${
              tab === t.id
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={12} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'overview' && <OverviewTab user={user} stats={stats} requests={requests} keys={keys} />}
        {tab === 'requests' && (
          <RequestsTab
            requests={requests}
            onApprove={async (id, limits) => {
              try {
                const { rawKey } = await api.admin.userRequests.approve(id, limits)
                onNotice(`Approved. Raw key: ${rawKey.slice(0, 12)}…`)
                await load()
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Failed')
              }
            }}
            onReject={async (id, note) => {
              try {
                await api.admin.userRequests.reject(id, note || undefined)
                onNotice('Request rejected.')
                await load()
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Failed')
              }
            }}
          />
        )}
        {tab === 'keys' && (
          <KeysTab
            keys={keys}
            onToggle={async (keyId, active) => {
              try {
                await api.admin.keys.update(keyId, { active })
                onNotice(`Key ${active ? 'enabled' : 'disabled'}.`)
                await load()
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Failed')
              }
            }}
            onDelete={async (keyId) => {
              if (!window.confirm('Delete this API key? This cannot be undone.')) return
              try {
                await api.admin.keys.delete(keyId)
                onNotice('Key deleted.')
                await load()
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Failed')
              }
            }}
          />
        )}
        {tab === 'issue-key' && (
          <IssueKeyTab
            userId={user.id}
            onIssued={async (rawKey) => {
              onNotice(`Key issued. Save it now: ${rawKey.slice(0, 12)}…`)
              await load()
              onUserUpdated()
            }}
            onError={onError}
          />
        )}
        {tab === 'danger' && (
          <DangerTab
            user={user}
            onStatusChange={async (status) => {
              try {
                await api.admin.portalUsers.setStatus(user.id, status)
                onNotice(`User ${status === 'suspended' ? 'suspended' : 'reactivated'}.`)
                await load()
                onUserUpdated()
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Failed')
              }
            }}
            onResetPassword={async (password) => {
              try {
                await api.admin.portalUsers.resetPassword(user.id, password)
                onNotice('Password reset successfully.')
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Failed')
              }
            }}
            onDelete={async () => {
              if (!window.confirm(`Delete user "${user.username}"? All their key requests will be removed and their keys deactivated.`)) return
              try {
                await api.admin.portalUsers.delete(user.id)
                onNotice(`User "${user.username}" deleted.`)
                onClose()
                onUserUpdated()
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Failed')
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({
  user, stats, requests, keys,
}: {
  user: User
  stats: UserDetail['stats']
  requests: UserKeyRequest[]
  keys: UserApiKey[]
}) {
  const pending = requests.filter(r => r.status === 'pending').length
  const approved = requests.filter(r => r.status === 'approved').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Requests today" value={formatNumber(stats.requestsToday)} />
        <MiniStat label="Total requests" value={formatNumber(stats.totalRequests)} />
        <MiniStat label="Tokens today" value={formatNumber(stats.tokensToday)} />
        <MiniStat label="Total tokens" value={formatNumber(stats.totalTokens)} />
      </div>

      <div className="space-y-2 text-sm">
        <Row label="Joined" value={formatDate(user.createdAt)} />
        <Row label="Last login" value={user.lastLogin ? formatDate(user.lastLogin) : 'Never'} />
        <Row label="Key requests" value={`${approved} approved, ${pending} pending`} />
        <Row label="Active keys" value={String(keys.filter(k => k.active).length)} />
      </div>
    </div>
  )
}

// ── Tab: Requests ─────────────────────────────────────────────────────────────

function RequestsTab({
  requests,
  onApprove,
  onReject,
}: {
  requests: UserKeyRequest[]
  onApprove: (id: string, limits: { dailyLimit: number; rateLimitPerMin: number; reviewNote?: string }) => Promise<void>
  onReject: (id: string, note: string) => Promise<void>
}) {
  if (requests.length === 0) return <EmptyPanel text="No key requests yet." />

  return (
    <div className="space-y-3">
      {requests.map(req => (
        <RequestCard key={req.id} request={req} onApprove={onApprove} onReject={onReject} />
      ))}
    </div>
  )
}

function RequestCard({
  request, onApprove, onReject,
}: {
  request: UserKeyRequest
  onApprove: (id: string, limits: { dailyLimit: number; rateLimitPerMin: number; reviewNote?: string }) => Promise<void>
  onReject: (id: string, note: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({ dailyLimit: 1000, rateLimitPerMin: 60, reviewNote: '' })
  const [rejectNote, setRejectNote] = useState('')
  const [mode, setMode] = useState<'idle' | 'approve' | 'reject'>('idle')
  const [showKey, setShowKey] = useState(false)

  const statusColor = { pending: 'text-amber-700 bg-amber-50', approved: 'text-green-700 bg-green-50', rejected: 'text-red-700 bg-red-50' }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{request.name}</p>
          <p className="text-xs text-slate-400">{formatDate(request.createdAt)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusColor[request.status]}`}>
          {request.status}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-3 pb-3 pt-2 space-y-2">
          {request.reason && <p className="text-xs italic text-slate-600">"{request.reason}"</p>}
          {request.reviewNote && <p className="text-xs text-slate-500">Note: {request.reviewNote}</p>}

          {request.revealedKey && (
            <div className="rounded-lg border border-teal-200 bg-teal-50 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-teal-700">API Key</p>
                <button type="button" className="text-xs text-teal-600" onClick={() => setShowKey(s => !s)}>
                  {showKey ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              {showKey ? (
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 break-all text-xs text-slate-700">{request.revealedKey}</code>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(request.revealedKey!).catch(() => {})}
                  >
                    <Copy size={12} className="text-teal-600" />
                  </button>
                </div>
              ) : (
                <code className="text-xs text-slate-500">{request.revealedKey.slice(0, 8)}••••••••</code>
              )}
            </div>
          )}

          {request.status === 'pending' && mode === 'idle' && (
            <div className="flex gap-2 pt-1">
              <button type="button" className="ui-btn-primary min-h-7 px-3 text-xs" onClick={() => setMode('approve')}>
                <CheckCircle2 size={11} /> Approve
              </button>
              <button type="button" className="ui-btn-danger min-h-7 px-3 text-xs" onClick={() => setMode('reject')}>
                <XCircle size={11} /> Reject
              </button>
            </div>
          )}

          {mode === 'approve' && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="ui-label text-xs">Daily limit</label>
                  <input className="ui-input min-h-8 text-xs" type="number" min={1} value={form.dailyLimit}
                    onChange={e => setForm(f => ({ ...f, dailyLimit: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="ui-label text-xs">Rate / min</label>
                  <input className="ui-input min-h-8 text-xs" type="number" min={1} value={form.rateLimitPerMin}
                    onChange={e => setForm(f => ({ ...f, rateLimitPerMin: Number(e.target.value) }))} />
                </div>
              </div>
              <input className="ui-input min-h-8 text-xs" placeholder="Review note (optional)"
                value={form.reviewNote} onChange={e => setForm(f => ({ ...f, reviewNote: e.target.value }))} />
              <div className="flex gap-2">
                <button type="button" className="ui-btn-primary min-h-7 px-3 text-xs"
                  onClick={() => { void onApprove(request.id, form); setMode('idle') }}>
                  Confirm
                </button>
                <button type="button" className="ui-btn-secondary min-h-7 px-3 text-xs" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </div>
          )}

          {mode === 'reject' && (
            <div className="space-y-2 pt-1">
              <input className="ui-input min-h-8 text-xs" placeholder="Reason (optional)"
                value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" className="ui-btn-danger min-h-7 px-3 text-xs"
                  onClick={() => { void onReject(request.id, rejectNote); setMode('idle') }}>
                  Confirm reject
                </button>
                <button type="button" className="ui-btn-secondary min-h-7 px-3 text-xs" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab: Keys ─────────────────────────────────────────────────────────────────

function KeysTab({
  keys,
  onToggle,
  onDelete,
}: {
  keys: UserApiKey[]
  onToggle: (id: string, active: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  if (keys.length === 0) return <EmptyPanel text="No approved keys yet." />

  return (
    <div className="space-y-3">
      {keys.map(key => (
        <div key={key.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">{key.name}</p>
              <p className="font-mono text-xs text-slate-400">{key.keyPrefix}…</p>
            </div>
            <StatusBadge status={key.active ? 'active' : 'suspended'} />
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="font-semibold">{formatNumber(key.requestsToday)}</p>
              <p className="text-slate-400">Today</p>
            </div>
            <div>
              <p className="font-semibold">{formatNumber(key.totalRequests)}</p>
              <p className="text-slate-400">Total</p>
            </div>
            <div>
              <p className="font-semibold">{key.usagePercent}%</p>
              <p className="text-slate-400">Usage</p>
            </div>
          </div>

          <div className="mt-2 h-1 w-full rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${key.usagePercent > 90 ? 'bg-red-500' : key.usagePercent > 75 ? 'bg-amber-500' : 'bg-teal-500'}`}
              style={{ width: `${key.usagePercent}%` }}
            />
          </div>

          <p className="mt-1 text-xs text-slate-400">
            {formatNumber(key.requestsToday)} / {formatNumber(key.dailyLimit)} · {key.rateLimitPerMin}/min
          </p>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="ui-btn-secondary min-h-7 flex-1 px-2 text-xs"
              onClick={() => void onToggle(key.id, !key.active)}
            >
              <Power size={11} /> {key.active ? 'Disable' : 'Enable'}
            </button>
            <button
              type="button"
              className="ui-btn-danger min-h-7 px-3 text-xs"
              onClick={() => void onDelete(key.id)}
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Tab: Issue Key ────────────────────────────────────────────────────────────

function IssueKeyTab({
  userId,
  onIssued,
  onError,
}: {
  userId: string
  onIssued: (rawKey: string) => Promise<void>
  onError: (msg: string) => void
}) {
  const [form, setForm] = useState({ name: '', dailyLimit: 1000, rateLimitPerMin: 60 })
  const [loading, setLoading] = useState(false)
  const [revealedKey, setRevealedKey] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const { rawKey } = await api.admin.portalUsers.issueKey(userId, {
        name: form.name.trim(),
        dailyLimit: form.dailyLimit,
        rateLimitPerMin: form.rateLimitPerMin,
      })
      setRevealedKey(rawKey)
      await onIssued(rawKey)
      setForm({ name: '', dailyLimit: 1000, rateLimitPerMin: 60 })
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to issue key')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Issue an API key directly to this user, bypassing the request/approval flow.
      </p>

      {revealedKey && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-xs font-semibold text-teal-700">Key created — save it now</p>
            <button
              type="button"
              className="text-xs text-teal-600"
              onClick={() => navigator.clipboard.writeText(revealedKey).catch(() => {})}
            >
              <Copy size={12} />
            </button>
          </div>
          <code className="break-all text-xs text-slate-700">{revealedKey}</code>
          <button type="button" className="mt-2 text-xs text-teal-600 underline" onClick={() => setRevealedKey(null)}>
            Dismiss
          </button>
        </div>
      )}

      <form className="space-y-3" onSubmit={submit}>
        <div>
          <label className="ui-label">Key name</label>
          <input
            className="ui-input"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Production Key"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="ui-label">Daily limit</label>
            <input className="ui-input" type="number" min={1} value={form.dailyLimit}
              onChange={e => setForm(f => ({ ...f, dailyLimit: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="ui-label">Rate / minute</label>
            <input className="ui-input" type="number" min={1} value={form.rateLimitPerMin}
              onChange={e => setForm(f => ({ ...f, rateLimitPerMin: Number(e.target.value) }))} />
          </div>
        </div>
        <button type="submit" className="ui-btn-primary w-full" disabled={loading}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
          Issue key
        </button>
      </form>
    </div>
  )
}

// ── Tab: Danger / Manage ──────────────────────────────────────────────────────

function DangerTab({
  user,
  onStatusChange,
  onResetPassword,
  onDelete,
}: {
  user: User
  onStatusChange: (status: 'active' | 'suspended') => Promise<void>
  onResetPassword: (password: string) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [newPassword, setNewPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8) return
    setPwLoading(true)
    await onResetPassword(newPassword)
    setNewPassword('')
    setPwLoading(false)
  }

  return (
    <div className="space-y-5">
      {/* Account status */}
      <section className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Account Status</p>
        <p className="text-xs text-slate-500">
          Current status: <strong className="capitalize">{user.status}</strong>
        </p>
        {user.status === 'active' ? (
          <button
            type="button"
            className="ui-btn-secondary w-full text-amber-700 border-amber-200 hover:bg-amber-50"
            onClick={() => void onStatusChange('suspended')}
          >
            <UserMinus size={14} /> Suspend user
          </button>
        ) : (
          <button
            type="button"
            className="ui-btn-primary w-full"
            onClick={() => void onStatusChange('active')}
          >
            <UserCheck size={14} /> Reactivate user
          </button>
        )}
      </section>

      {/* Password reset */}
      <section className="rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700">Reset Password</p>
        <form className="space-y-2" onSubmit={submitPassword}>
          <div className="relative">
            <input
              className="ui-input pr-10"
              type={showPw ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              minLength={8}
              required
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              onClick={() => setShowPw(s => !s)}
            >
              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button type="submit" className="ui-btn-secondary w-full" disabled={pwLoading}>
            <Lock size={14} /> Set new password
          </button>
        </form>
      </section>

      {/* Delete */}
      <section className="rounded-xl border border-red-200 bg-red-50/40 p-4 space-y-3">
        <p className="text-sm font-semibold text-red-700">Danger Zone</p>
        <p className="text-xs text-red-600">
          Deleting a user removes their account and all key requests. Their API keys will be deactivated but request logs are preserved.
        </p>
        <button
          type="button"
          className="ui-btn-danger w-full"
          onClick={() => void onDelete()}
        >
          <UserX size={14} /> Delete user permanently
        </button>
      </section>
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'active' | 'suspended' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      status === 'active'
        ? 'bg-green-50 text-green-700'
        : 'bg-amber-50 text-amber-700'
    }`}>
      {status === 'active' ? <CheckCircle2 size={10} /> : <UserMinus size={10} />}
      <span className="capitalize">{status}</span>
    </span>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-50 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 text-right">{value}</span>
    </div>
  )
}
