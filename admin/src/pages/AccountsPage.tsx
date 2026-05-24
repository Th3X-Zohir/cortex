import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown, ArrowUp, CheckCircle2, Clock, LogIn, LogOut, Plus, RefreshCw, Settings2, ShieldAlert, ShieldOff, Trash2, Pencil, Power, PowerOff,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { CooldownConfig, ProviderAccount } from '@/types'
import {
  BusyPanel,
  Chip,
  EmptyPanel,
  ErrorBanner,
  PageShell,
  SuccessBanner,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

type SupportedProvider = 'chatgpt' | 'gemini' | 'grok'
const SUPPORTED: { id: SupportedProvider; label: string; available: boolean; note?: string }[] = [
  { id: 'chatgpt', label: 'ChatGPT', available: true },
  { id: 'gemini', label: 'Gemini', available: false, note: 'Multi-account routing coming soon' },
  { id: 'grok', label: 'Grok', available: false, note: 'Multi-account routing coming soon' },
]

function statusTone(s: ProviderAccount['status']): 'good' | 'warn' | 'bad' | 'default' {
  if (s === 'connected') return 'good'
  if (s === 'cooldown') return 'warn'
  if (s === 'blocked') return 'bad'
  if (s === 'logged_out') return 'default'
  return 'default'
}

function fmtSeconds(s: number): string {
  if (s <= 0) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

export function AccountsPage() {
  const [provider, setProvider] = useState<SupportedProvider>('chatgpt')
  const [accounts, setAccounts] = useState<ProviderAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState<ProviderAccount | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProviderAccount | null>(null)
  const [forceCooldownTarget, setForceCooldownTarget] = useState<ProviderAccount | null>(null)
  const [now, setNow] = useState(Date.now())

  // Live ticker for cooldown countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.accounts.list(provider)
      setAccounts(data.accounts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load accounts')
    } finally {
      setLoading(false)
    }
  }, [provider])

  useEffect(() => { void load() }, [load])

  // Auto-refresh while any account has a running cooldown so the badge reflects expiry.
  useEffect(() => {
    if (!accounts.some(a => a.inCooldown)) return
    const t = setInterval(() => void load(), 15000)
    return () => clearInterval(t)
  }, [accounts, load])

  async function withBusy<T>(id: string, fn: () => Promise<T>): Promise<T | null> {
    setBusyId(id)
    setError(null)
    setNotice(null)
    try {
      return await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
      return null
    } finally {
      setBusyId(null)
    }
  }

  async function onLogin(account: ProviderAccount) {
    const vncWindow = window.open('about:blank', '_blank', 'noopener,noreferrer')
    const r = await withBusy(account.id, () => api.accounts.login(account.id))
    if (r) {
      // Open THIS account's per-slot VNC URL so the admin sees the right
      // browser window (not the shared display). The server-mapped vncPath
      // is in the response account record.
      const targetUrl = r.vncUrl ?? r.account?.vncPath ?? account.vncPath
      if (vncWindow) vncWindow.location.href = targetUrl
      else window.open(targetUrl, '_blank', 'noopener,noreferrer')
      setNotice(`Login started for '${account.label}'. Complete sign-in in the VNC tab that just opened.`)
      setTimeout(() => void load(), 3000)
    } else {
      vncWindow?.close()
    }
  }
  async function onLogout(account: ProviderAccount) {
    const r = await withBusy(account.id, () => api.accounts.logout(account.id))
    if (r) { setNotice(`'${account.label}' logged out.`); await load() }
  }
  async function onCheck(account: ProviderAccount) {
    const r = await withBusy(account.id, () => api.accounts.check(account.id))
    if (r) { setNotice(`'${account.label}' session: ${r.connected ? 'connected ✓' : 'logged out'}`); await load() }
  }
  async function onResetCooldown(account: ProviderAccount) {
    const r = await withBusy(account.id, () => api.accounts.resetCooldown(account.id))
    if (r) { setNotice(`Cooldown cleared for '${account.label}'.`); await load() }
  }
  async function onToggleEnabled(account: ProviderAccount) {
    const r = await withBusy(account.id, () => api.accounts.update(account.id, { enabled: !account.enabled }))
    if (r) { setNotice(`'${account.label}' ${account.enabled ? 'disabled' : 'enabled'}.`); await load() }
  }
  async function onDeleteConfirmed(account: ProviderAccount) {
    const r = await withBusy(account.id, () => api.accounts.remove(account.id))
    setConfirmDelete(null)
    if (r) { setNotice(`'${account.label}' deleted.`); await load() }
  }
  async function onForceCooldown(account: ProviderAccount, seconds: number, reason: 'rate_limited' | 'unusual_activity') {
    const r = await withBusy(account.id, () => api.accounts.forceCooldown(account.id, { seconds, reason }))
    setForceCooldownTarget(null)
    if (r) { setNotice(`'${account.label}' forced into ${reason} cooldown for ${seconds}s.`); await load() }
  }
  /** Move the account toward the top of the routing order (lower priority number). */
  async function nudgePriority(account: ProviderAccount, direction: 'up' | 'down') {
    const next = direction === 'up' ? Math.max(0, account.priority - 10) : account.priority + 10
    if (next === account.priority) return
    const r = await withBusy(account.id, () => api.accounts.update(account.id, { priority: next }))
    if (r) await load()
  }

  const stats = useMemo(() => {
    const total = accounts.length
    const healthy = accounts.filter(a => a.enabled && !a.inCooldown && a.status === 'connected').length
    const cooldown = accounts.filter(a => a.inCooldown).length
    const blocked = accounts.filter(a => a.status === 'blocked').length
    return { total, healthy, cooldown, blocked }
  }, [accounts])

  return (
    <PageShell
      title="Account Router"
      description="Manage multiple browser-based accounts per provider. Requests automatically rotate to a healthy account when one is rate-limited or blocked."
      action={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-btn-secondary" onClick={() => void load()}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button type="button" className="ui-btn-secondary" onClick={() => setShowSettings(s => !s)}>
            <Settings2 size={15} /> Cooldown
          </button>
          <button
            type="button"
            className="ui-btn-primary"
            onClick={() => setShowCreate(true)}
            disabled={!SUPPORTED.find(p => p.id === provider)?.available}
          >
            <Plus size={15} /> Add account
          </button>
        </div>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}
      {notice ? <SuccessBanner text={notice} /> : null}

      {/* First-run / onboarding hint */}
      {!loading && accounts.length > 0 && accounts.every(a => a.status !== 'connected') ? (
        <Surface className="border-blue-200 bg-blue-50/70">
          <p className="text-sm text-slate-800">
            <strong>Next step:</strong> click <strong>Sign in</strong> on the account row, then open the
            {' '}<a className="font-semibold underline" href="/admin/" onClick={e => { e.preventDefault(); window.open('/vnc/', '_blank') }}>VNC viewer</a>
            {' '}in a new tab and complete the ChatGPT login inside the remote browser window. Once you see the chat prompt, return here and click the check-session icon.
          </p>
        </Surface>
      ) : null}

      {/* Provider tabs */}
      <div className="flex flex-wrap gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1">
        {SUPPORTED.map(p => (
          <button
            key={p.id}
            type="button"
            disabled={!p.available}
            onClick={() => p.available && setProvider(p.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
              provider === p.id
                ? 'bg-blue-600 text-white shadow-sm'
                : p.available
                  ? 'text-slate-700 hover:bg-white hover:text-slate-900'
                  : 'cursor-not-allowed text-slate-400'
            }`}
            title={p.note ?? ''}
          >
            {p.label}{p.available ? '' : ' (soon)'}
          </button>
        ))}
      </div>

      {/* Summary tiles */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Surface className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(stats.total)}</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Healthy</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{formatNumber(stats.healthy)}</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Cooldown</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{formatNumber(stats.cooldown)}</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Blocked</p>
          <p className="mt-2 text-2xl font-semibold text-rose-600">{formatNumber(stats.blocked)}</p>
        </Surface>
      </section>

      {/* Cooldown settings */}
      {showSettings ? <CooldownSettings provider={provider} onClose={() => setShowSettings(false)} onNotice={setNotice} onError={setError} /> : null}

      {/* Accounts list */}
      {loading ? (
        <BusyPanel text="Loading accounts..." />
      ) : accounts.length === 0 ? (
        <EmptyPanel text={`No accounts configured for ${provider}. Click "Add account" to create one.`} />
      ) : (
        <Surface>
          <SurfaceHeader
            title={`${provider} accounts`}
            description="Requests rotate via least-recently-used. Accounts in cooldown are skipped until the timer expires."
          />
          {/* Responsive table: scroll horizontally on mobile */}
          <div className="-mx-4 sm:mx-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold w-12">Order</th>
                  <th className="px-4 py-2 font-semibold">Label</th>
                  <th className="px-4 py-2 font-semibold">Priority</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Cooldown</th>
                  <th className="px-4 py-2 font-semibold">Last used</th>
                  <th className="px-4 py-2 font-semibold">Errors (24h)</th>
                  <th className="px-4 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...accounts]
                  .sort((x, y) => (x.priority - y.priority) || (Date.parse(x.createdAt) - Date.parse(y.createdAt)))
                  .map((a, i, list) => {
                    const isFirst = i === 0
                    const isLast = i === list.length - 1
                    return [a, isFirst, isLast] as const
                  })
                  .map(([a, isFirst, isLast]) => {
                  const remaining = a.cooldownUntil
                    ? Math.max(0, Math.ceil((Date.parse(a.cooldownUntil) - now) / 1000))
                    : 0
                  return (
                    <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="px-2 py-3 align-middle">
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            type="button"
                            title="Move up (higher priority)"
                            disabled={isFirst || busyId === a.id}
                            onClick={() => void nudgePriority(a, 'up')}
                            className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            title="Move down (lower priority)"
                            disabled={isLast || busyId === a.id}
                            onClick={() => void nudgePriority(a, 'down')}
                            className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{a.label}</div>
                        {a.notes ? <div className="text-xs text-slate-500 truncate max-w-[200px]">{a.notes}</div> : null}
                        {!a.enabled ? <Chip tone="default">disabled</Chip> : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{a.priority}</td>
                      <td className="px-4 py-3">
                        <Chip tone={statusTone(a.status)}>{a.status}</Chip>
                        {a.lastError ? <div className="mt-1 text-xs text-rose-600 truncate max-w-[220px]" title={a.lastError}>{a.lastError}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {a.inCooldown ? (
                          <span className="inline-flex items-center gap-1 text-amber-500">
                            <Clock size={14} /> {fmtSeconds(remaining)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.lastUsedAt ? formatDate(a.lastUsedAt) : 'never'}</td>
                      <td className="px-4 py-3 text-slate-700">{formatNumber(a.errorCount24h)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {/* Primary action: a real labeled button so it's unmissable */}
                          {a.status !== 'connected' ? (
                            <button
                              type="button"
                              className="ui-btn-primary !min-h-8 !px-3 !text-xs"
                              disabled={busyId === a.id || !a.enabled}
                              onClick={() => void onLogin(a)}
                              title={!a.enabled ? 'Enable this account before signing in' : 'Open a VNC browser to sign in to this account'}
                            >
                              <LogIn size={14} /> Sign in
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ui-btn-secondary !min-h-8 !px-3 !text-xs"
                              disabled={busyId === a.id}
                              onClick={() => void onLogout(a)}
                              title="Close this account's browser context"
                            >
                              <LogOut size={14} /> Sign out
                            </button>
                          )}
                          {/* Cooldown control: labeled so it's unmissable */}
                          {a.inCooldown || a.status === 'blocked' ? (
                            <button
                              type="button"
                              className="ui-btn-secondary !min-h-8 !px-3 !text-xs"
                              disabled={busyId === a.id}
                              onClick={() => void onResetCooldown(a)}
                              title="Clear the cooldown and let the pool route to this account again"
                            >
                              <ShieldOff size={14} /> Clear cooldown
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ui-btn-secondary !min-h-8 !px-3 !text-xs"
                              disabled={busyId === a.id}
                              onClick={() => setForceCooldownTarget(a)}
                              title="Manually park this account out of rotation for N minutes"
                            >
                              <ShieldAlert size={14} /> Force cooldown
                            </button>
                          )}
                          {/* Secondary actions stay as icon-only */}
                          <IconBtn title="Check session" disabled={busyId === a.id} onClick={() => void onCheck(a)}><CheckCircle2 size={14} /></IconBtn>
                          <IconBtn
                            title={a.enabled ? 'Disable account' : 'Enable account'}
                            disabled={busyId === a.id}
                            onClick={() => void onToggleEnabled(a)}
                          >
                            {a.enabled ? <PowerOff size={14} /> : <Power size={14} />}
                          </IconBtn>
                          <IconBtn title="Edit label / notes" disabled={busyId === a.id} onClick={() => setEditing(a)}><Pencil size={14} /></IconBtn>
                          <IconBtn title="Delete account" tone="bad" disabled={busyId === a.id} onClick={() => setConfirmDelete(a)}><Trash2 size={14} /></IconBtn>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Surface>
      )}

      {showCreate ? (
        <CreateAccountModal
          provider={provider}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setNotice('Account created. Click Sign in to authenticate.'); void load() }}
          onError={setError}
        />
      ) : null}

      {editing ? (
        <EditAccountModal
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNotice('Account updated.'); void load() }}
          onError={setError}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmModal
          title={`Delete account '${confirmDelete.label}'?`}
          body="This closes the browser context and permanently removes the local profile directory. The account row will be deleted from the database."
          confirmLabel="Delete"
          confirmTone="bad"
          onConfirm={() => void onDeleteConfirmed(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}

      {forceCooldownTarget ? (
        <ForceCooldownModal
          account={forceCooldownTarget}
          onClose={() => setForceCooldownTarget(null)}
          onApply={(seconds, reason) => void onForceCooldown(forceCooldownTarget, seconds, reason)}
        />
      ) : null}
    </PageShell>
  )
}

function IconBtn({ children, title, onClick, disabled, tone = 'default' }: {
  children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; tone?: 'default' | 'bad'
}) {
  const cls = tone === 'bad'
    ? 'text-rose-600 hover:bg-rose-50 hover:text-rose-700'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {children}
    </button>
  )
}

function ModalShell({ title, children, onClose, footer }: {
  title: string; children: React.ReactNode; onClose: () => void; footer?: React.ReactNode
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-2xl border border-white/12 bg-background-secondary p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
        <div className="space-y-3">{children}</div>
        {footer ? <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
      </div>
    </div>
  )
}

function CreateAccountModal({ provider, onClose, onCreated, onError }: {
  provider: string; onClose: () => void; onCreated: () => void; onError: (m: string) => void
}) {
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  async function submit() {
    if (!label.trim()) { onError('Label is required'); return }
    setSubmitting(true)
    try {
      await api.accounts.create({ provider, label: label.trim(), notes: notes.trim() || undefined })
      onCreated()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <ModalShell
      title={`Add ${provider} account`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ui-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ui-btn-primary" disabled={submitting} onClick={() => void submit()}>
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Label</span>
        <input
          ref={inputRef}
          className="ui-input mt-1 w-full"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. personal, work, backup"
          onKeyDown={e => { if (e.key === 'Enter') void submit() }}
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notes (optional)</span>
        <input
          className="ui-input mt-1 w-full"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Email, plan tier, etc."
        />
      </label>
      <p className="text-xs text-slate-500">
        A fresh Chromium profile will be created. You'll authenticate by clicking <strong>Sign in</strong> after creation.
      </p>
    </ModalShell>
  )
}

function EditAccountModal({ account, onClose, onSaved, onError }: {
  account: ProviderAccount; onClose: () => void; onSaved: () => void; onError: (m: string) => void
}) {
  const [label, setLabel] = useState(account.label)
  const [notes, setNotes] = useState(account.notes ?? '')
  const [priority, setPriority] = useState(account.priority)
  const [submitting, setSubmitting] = useState(false)
  async function submit() {
    if (!label.trim()) { onError('Label is required'); return }
    setSubmitting(true)
    try {
      await api.accounts.update(account.id, {
        label: label.trim(),
        notes: notes.trim() || null,
        priority: Math.max(0, Math.floor(priority)),
      })
      onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSubmitting(false)
    }
  }
  return (
    <ModalShell
      title="Edit account"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ui-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ui-btn-primary" disabled={submitting} onClick={() => void submit()}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Label</span>
        <input className="ui-input mt-1 w-full" value={label} onChange={e => setLabel(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Priority</span>
        <input
          type="number"
          min={0}
          className="ui-input mt-1 w-full"
          value={priority}
          onChange={e => setPriority(Number(e.target.value) || 0)}
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          Lower number wins when the pool picks an account. Default 100. Within the same priority, LRU breaks ties.
        </span>
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Notes</span>
        <input className="ui-input mt-1 w-full" value={notes} onChange={e => setNotes(e.target.value)} />
      </label>
    </ModalShell>
  )
}

function ForceCooldownModal({ account, onClose, onApply }: {
  account: ProviderAccount; onClose: () => void; onApply: (seconds: number, reason: 'rate_limited' | 'unusual_activity') => void
}) {
  const [seconds, setSeconds] = useState(300)
  const [reason, setReason] = useState<'rate_limited' | 'unusual_activity'>('rate_limited')
  return (
    <ModalShell
      title={`Force cooldown — ${account.label}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="ui-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ui-btn-danger" onClick={() => onApply(seconds, reason)}>
            Apply cooldown
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-300">
        Manually park <strong>{account.label}</strong> out of the rotation. The pool will skip it until the
        timer expires — useful when you know an account is being throttled but the platform hasn't shown a
        dialog yet, or when you want to give an account a forced rest.
      </p>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Duration (seconds)</span>
        <input
          type="number"
          min={1}
          className="ui-input mt-1 w-full"
          value={seconds}
          onChange={e => setSeconds(Math.max(1, Number(e.target.value) || 1))}
        />
        <span className="mt-1 block text-[11px] text-slate-500">
          Try 300 (5 min) for a soft pause, 1800 (30 min) for a hard rest.
        </span>
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Reason</span>
        <select
          className="ui-input mt-1 w-full"
          value={reason}
          onChange={e => setReason(e.target.value as 'rate_limited' | 'unusual_activity')}
        >
          <option value="rate_limited">rate_limited — status will be 'cooldown'</option>
          <option value="unusual_activity">unusual_activity — status will be 'blocked'</option>
        </select>
      </label>
    </ModalShell>
  )
}

function ConfirmModal({ title, body, confirmLabel, confirmTone, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; confirmTone: 'default' | 'bad'; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <ModalShell
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="ui-btn-secondary" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={confirmTone === 'bad' ? 'ui-btn-danger' : 'ui-btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-300">{body}</p>
    </ModalShell>
  )
}

function CooldownSettings({ provider, onClose, onNotice, onError }: {
  provider: string; onClose: () => void; onNotice: (m: string) => void; onError: (m: string) => void
}) {
  const [cfg, setCfg] = useState<CooldownConfig | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    api.providers.getCooldown(provider).then(setCfg).catch(err => onError(err instanceof Error ? err.message : 'Unable to load cooldown config'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider])

  async function save() {
    if (!cfg) return
    setSaving(true)
    try {
      const next = await api.providers.setCooldown(provider, cfg)
      setCfg(next)
      onNotice('Cooldown durations saved.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Surface>
      <SurfaceHeader
        title="Cooldown durations"
        description="How long an account stays out of rotation after each failure type."
        action={<button type="button" className="ui-btn-secondary" onClick={onClose}>Close</button>}
      />
      {!cfg ? (
        <BusyPanel text="Loading…" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <CooldownField label="Rate limited (s)" value={cfg.rate_limited_seconds} onChange={v => setCfg({ ...cfg, rate_limited_seconds: v })} />
          <CooldownField label="Unusual activity (s)" value={cfg.unusual_activity_seconds} onChange={v => setCfg({ ...cfg, unusual_activity_seconds: v })} />
          <CooldownField label="Session expired (s)" value={cfg.session_expired_seconds} onChange={v => setCfg({ ...cfg, session_expired_seconds: v })} />
          <div className="sm:col-span-3 flex justify-end">
            <button type="button" className="ui-btn-primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save cooldowns'}
            </button>
          </div>
        </div>
      )}
    </Surface>
  )
}

function CooldownField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <input
        type="number"
        min={0}
        className="ui-input mt-1 w-full"
        value={value}
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  )
}
