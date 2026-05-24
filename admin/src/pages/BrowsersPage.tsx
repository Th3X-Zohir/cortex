import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Globe, Maximize2, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { ProviderAccount } from '@/types'
import { BusyPanel, Chip, EmptyPanel, ErrorBanner, PageShell, Surface } from '@/components/dashboard/UiKit'

type Activity = { kind: 'idle' | 'chat' | 'login' | 'restoring' | 'logged_out'; detail?: string; startedAt: number }
type BrowserEntry = {
  account: ProviderAccount
  pages: Array<{ url: string; title: string }>
  activity: Activity
}

const SHARED_VNC_URL = '/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=websockify'

function statusTone(s: ProviderAccount['status']): 'good' | 'warn' | 'bad' | 'default' {
  if (s === 'connected') return 'good'
  if (s === 'cooldown') return 'warn'
  if (s === 'blocked') return 'bad'
  return 'default'
}

function activityTone(k: Activity['kind']): 'good' | 'warn' | 'bad' | 'default' {
  if (k === 'chat') return 'good'
  if (k === 'restoring' || k === 'login') return 'warn'
  if (k === 'logged_out') return 'bad'
  return 'default'
}

function activityLabel(a: Activity): string {
  if (a.kind === 'chat') return a.detail ? `Handling • ${a.detail}` : 'Handling chat'
  if (a.kind === 'restoring') return 'Restoring session'
  if (a.kind === 'login') return 'Sign-in in progress'
  if (a.kind === 'logged_out') return 'Signed out'
  return 'Idle'
}

function hostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function BrowsersPage() {
  const [browsers, setBrowsers] = useState<BrowserEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [auto, setAuto] = useState(true)
  const [focused, setFocused] = useState<BrowserEntry | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await api.browsers.list()
      setBrowsers(data.browsers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load browser sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => void load(), 8000)
    return () => clearInterval(t)
  }, [auto, load])

  return (
    <PageShell
      title="Browser Sessions"
      description="Live grid of every Chromium profile cortex is managing. Each card is its own real noVNC stream — all profiles render simultaneously. Click expand on any card to interact with that profile."
      action={
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
            Auto refresh metadata
          </label>
          <button type="button" className="ui-btn-secondary" onClick={() => void load()}>
            <RefreshCw size={15} /> Refresh
          </button>
          <a className="ui-btn-secondary" href={SHARED_VNC_URL} target="_blank" rel="noreferrer">
            <ExternalLink size={15} /> Shared desktop
          </a>
        </div>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}

      {loading ? (
        <BusyPanel text="Querying browser contexts…" />
      ) : browsers.length === 0 ? (
        <EmptyPanel text="No accounts configured. Add one from Account Router." />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {browsers.map(b => (
            <BrowserCard
              key={b.account.id}
              entry={b}
              onExpand={() => setFocused(b)}
            />
          ))}
        </section>
      )}

      {focused ? (
        <FocusedBrowser entry={focused} onClose={() => setFocused(null)} />
      ) : null}
    </PageShell>
  )
}

function BrowserCard({ entry, onExpand }: { entry: BrowserEntry; onExpand: () => void }) {
  const { account, pages, activity } = entry
  const tabUrl = pages[pages.length - 1]?.url
  const tabTitle = pages[pages.length - 1]?.title
  const hasSlot = account.displaySlot !== null && account.displaySlot !== undefined

  return (
    <Surface className="flex flex-col gap-3 p-3">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900" title={account.label}>{account.label}</p>
          <p className="text-xs text-slate-500">
            {account.provider}
            {hasSlot ? <> · slot <span className="font-mono">d{account.displaySlot}</span></> : ' · shared display'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Chip tone={statusTone(account.status)}>{account.status}</Chip>
          <Chip tone={activityTone(activity.kind)}>{activityLabel(activity)}</Chip>
        </div>
      </header>

      {/* Live noVNC stream */}
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
        <iframe
          title={`${account.label} noVNC`}
          src={account.vncPath}
          className="absolute inset-0 h-full w-full"
          // Don't let iframe steal focus until the user clicks it.
          tabIndex={-1}
        />
        {/* Top-right floating expand button — sits ABOVE the iframe so it stays clickable */}
        <button
          type="button"
          onClick={onExpand}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-lg bg-slate-900/80 px-2 py-1 text-[11px] font-semibold text-white shadow hover:bg-slate-900"
          title="Open this profile full-size to interact"
        >
          <Maximize2 size={11} /> Expand
        </button>
      </div>

      {/* Current tab */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-xs">
        <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <Globe size={11} /> Current tab
        </div>
        {pages.length === 0 ? (
          <p className="text-slate-500">No tabs open</p>
        ) : (
          <>
            <p className="truncate font-medium text-slate-800" title={tabTitle}>{tabTitle || hostname(tabUrl ?? '')}</p>
            <p className="truncate font-mono text-[10px] text-slate-500" title={tabUrl}>{tabUrl}</p>
            {pages.length > 1 ? <p className="mt-1 text-[10px] text-slate-400">+{pages.length - 1} other tab{pages.length > 2 ? 's' : ''}</p> : null}
          </>
        )}
      </div>

      <dl className="flex justify-between text-[11px] text-slate-500">
        <div>
          <dt className="font-semibold">Last used</dt>
          <dd>{account.lastUsedAt ? formatDate(account.lastUsedAt) : 'never'}</dd>
        </div>
        <div className="text-right">
          <dt className="font-semibold">24h errors</dt>
          <dd>{account.errorCount24h}</dd>
        </div>
      </dl>
    </Surface>
  )
}

function FocusedBrowser({ entry, onClose }: { entry: BrowserEntry; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-2 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{entry.account.label}</p>
          <p className="text-xs text-white/60">
            {entry.account.provider}
            {entry.account.displaySlot !== null ? ` · slot d${entry.account.displaySlot}` : ' · shared display'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a className="ui-btn-secondary !min-h-8 !px-3 !text-xs" href={entry.account.vncPath} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> Open in tab
          </a>
          <button type="button" className="ui-btn-secondary !min-h-8 !px-3 !text-xs" onClick={onClose}>
            Close (Esc)
          </button>
        </div>
      </header>
      <div className="flex-1 bg-black">
        <iframe title="focused noVNC" src={entry.account.vncPath} className="h-full w-full" />
      </div>
    </div>
  )
}
