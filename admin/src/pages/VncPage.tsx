import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { ModelCatalog } from '@/types'
import {
  BusyPanel,
  EmptyPanel,
  ErrorBanner,
  PageShell,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

export function VncPage() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [size, setSize] = useState<'fit' | 'large' | 'max'>('large')
  const [frameKey, setFrameKey] = useState(0)

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const next = await api.providers.models()
      setCatalog(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load VNC metadata')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const viewerHeight =
    size === 'fit'
      ? 'h-[58vh] min-h-[440px]'
      : size === 'large'
        ? 'h-[74vh] min-h-[600px]'
        : 'h-[calc(100vh-220px)] min-h-[720px]'

  return (
    <PageShell
      title="VNC Workspace"
      description="Complete provider browser authentication and manual recovery from a dedicated embedded viewer."
      action={
        <>
          <button type="button" className="ui-btn-secondary" onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </button>
          {catalog?.vnc.url ? (
            <a className="ui-btn-secondary" href={catalog.vnc.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open in new tab
            </a>
          ) : null}
        </>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}

      <Surface>
        <SurfaceHeader
          title="Viewer Controls"
          description="Switch layout size and reload the embedded noVNC frame."
          action={
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {[
                ['fit', 'Fit'],
                ['large', 'Large'],
                ['max', 'Max'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={size === value ? 'ui-btn-primary min-h-8 px-3 text-xs' : 'ui-btn-secondary min-h-8 border-transparent px-3 text-xs'}
                  onClick={() => setSize(value as typeof size)}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />

        {loading ? (
          <BusyPanel text="Loading VNC endpoint..." />
        ) : catalog?.vnc.url ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>Path: <span className="font-mono text-xs text-slate-700">{catalog.vnc.path}</span></p>
              <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={() => setFrameKey(key => key + 1)}>
                Reload frame
              </button>
            </div>
            <iframe
              key={frameKey}
              title="Cortex noVNC"
              src={catalog.vnc.url}
              className={`${viewerHeight} w-full rounded-2xl border border-slate-200 bg-white`}
              allow="clipboard-read; clipboard-write"
            />
          </div>
        ) : (
          <EmptyPanel text="VNC is not enabled in the current runtime." />
        )}
      </Surface>

      <section className="grid gap-3 md:grid-cols-3">
        <Surface className="p-4">
          <p className="text-sm font-semibold text-slate-900">1. Start provider login</p>
          <p className="mt-1 text-sm text-slate-600">Trigger Login in Providers or Playground to open the provider auth flow.</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-sm font-semibold text-slate-900">2. Complete auth in VNC</p>
          <p className="mt-1 text-sm text-slate-600">Use this viewer to sign in to the provider web app with full browser controls.</p>
        </Surface>
        <Surface className="p-4">
          <p className="text-sm font-semibold text-slate-900">3. Refresh provider status</p>
          <p className="mt-1 text-sm text-slate-600">Return to Providers and verify the session switches to connected state.</p>
        </Surface>
      </section>
    </PageShell>
  )
}
