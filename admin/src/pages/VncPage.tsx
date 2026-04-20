import { useEffect, useState } from 'react'
import { ExternalLink, Maximize2, Minimize2, RotateCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { ModelCatalog } from '@/types'
import { Page, Panel, RefreshButton } from '@/components/shared/AppPrimitives'

export function VncPage() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewerSize, setViewerSize] = useState<'fit' | 'large' | 'max'>('large')
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [frameKey, setFrameKey] = useState(0)

  async function load() {
    setLoading(true)
    try {
      setCatalog(await api.providers.models())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const url = catalog?.vnc.url
  const viewerHeight =
    viewerSize === 'fit'
      ? 'h-[62vh] min-h-[460px]'
      : viewerSize === 'large'
        ? 'h-[78vh] min-h-[620px]'
        : 'h-[calc(100vh-190px)] min-h-[720px]'

  return (
    <Page title="VNC Viewer" description="Use this browser view for provider login flows and visual session recovery." action={<RefreshButton onClick={load} loading={loading} />}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            ['fit', 'Fit'],
            ['large', 'Large'],
            ['max', 'Max'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={viewerSize === value ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setViewerSize(value as typeof viewerSize)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => setFrameKey(key => key + 1)} disabled={!url}>
            <RotateCw size={16} /> Reload viewer
          </button>
          <button type="button" className="btn-ghost" onClick={() => setDetailsOpen(open => !open)}>
            {detailsOpen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {detailsOpen ? 'Hide details' : 'Show details'}
          </button>
        </div>
      </div>

      <div className={`grid gap-5 ${detailsOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>
        <section className="overflow-hidden rounded-xl border border-white/5 bg-[#080808]">
          {url ? (
            <iframe
              key={frameKey}
              title="Cortex noVNC"
              src={url}
              className={`${viewerHeight} w-full border-0 bg-[#080808]`}
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div className={`flex ${viewerHeight} items-center justify-center text-white/40`}>VNC endpoint is not available.</div>
          )}
        </section>
        <div className={`space-y-5 ${detailsOpen ? '' : 'hidden'}`}>
          <Panel title="Access details" description="VNC is proxied through the admin origin; use Large or Max when provider pages are clipped.">
            <div className="space-y-3 text-sm">
              <div>
                <p className="label text-white/60">Viewer URL</p>
                <code className="mt-1 block break-all rounded-lg border border-white/10 bg-white/5 p-2 text-xs text-primary/60">{url ?? 'Unavailable'}</code>
              </div>
              <a className="btn-primary w-full" href={url ?? '#'} target="_blank" rel="noreferrer">
                <ExternalLink size={16} /> Open in new tab
              </a>
            </div>
          </Panel>
          <Panel title="Login workflow" description="Start a provider login, then complete it inside the VNC browser.">
            <div className="space-y-2 text-sm text-white/60">
              <p>1. Open Model Control and press Login for a web provider.</p>
              <p>2. Use this VNC view to complete the provider login.</p>
              <p>3. Return to Model Control and refresh provider status.</p>
              <p>4. If controls are off-screen, switch to Max and reload the viewer.</p>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  )
}
