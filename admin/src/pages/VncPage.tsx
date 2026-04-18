import * as React from "react"
import { ExternalLink, Maximize2, Minimize2, RefreshCcw, RotateCw } from "lucide-react"
import { api } from "~/lib/api"
import { PageHeader } from "~/components/shared/PageHeader"
import { Skeleton } from "~/components/ui/skeleton"
import type { ModelCatalog } from "~/types"

export function VncPage() {
  const [catalog, setCatalog] = React.useState<ModelCatalog | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [viewerSize, setViewerSize] = React.useState<"fit" | "large" | "max">("large")
  const [detailsOpen, setDetailsOpen] = React.useState(true)
  const [frameKey, setFrameKey] = React.useState(0)

  async function load() {
    setLoading(true)
    try {
      setCatalog(await api.providers.models())
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  const url = catalog?.vnc.url
  const viewerHeight =
    viewerSize === "fit"
      ? "h-[62vh] min-h-[460px]"
      : viewerSize === "large"
        ? "h-[78vh] min-h-[620px]"
        : "h-[calc(100vh-190px)] min-h-[720px]"

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="VNC Viewer"
        description="Use this browser view for provider login flows and visual session recovery."
        actions={
          <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            ["fit", "Fit"],
            ["large", "Large"],
            ["max", "Max"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={viewerSize === value ? "btn-primary" : "btn-ghost"}
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
            {detailsOpen ? "Hide details" : "Show details"}
          </button>
        </div>
      </div>

      <div className={`grid gap-5 ${detailsOpen ? "xl:grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1"}`}>
        {/* VNC iframe */}
        <div className="overflow-hidden rounded-xl border border-border bg-[#101411]">
          {loading && !catalog ? (
            <Skeleton className={`${viewerHeight} w-full`} />
          ) : url ? (
            <iframe
              key={frameKey}
              title="Cortex noVNC"
              src={url}
              className={`${viewerHeight} w-full border-0 bg-[#101411]`}
              allow="clipboard-read; clipboard-write"
            />
          ) : (
            <div className={`flex ${viewerHeight} items-center justify-center text-white/50`}>
              VNC endpoint is not available.
            </div>
          )}
        </div>

        <div className={`space-y-5 ${detailsOpen ? "" : "hidden"}`}>
          <div className="panel p-5">
            <h3 className="text-base font-semibold mb-2">Access details</h3>
            <p className="text-xs text-muted-foreground mb-4">Use Large or Max when provider pages are clipped inside noVNC.</p>
            <div className="space-y-3">
              <div>
                <p className="label">Viewer URL</p>
                <code className="mt-1 block break-all rounded-lg bg-muted/50 p-2.5 text-xs">{url ?? "Unavailable"}</code>
              </div>
              {url && (
                <a className="btn-primary w-full flex items-center justify-center gap-2" href={url} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} /> Open in new tab
                </a>
              )}
            </div>
          </div>

          <div className="panel p-5">
            <h3 className="text-base font-semibold mb-2">Login workflow</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Open Model Control and press Login for a web provider.</p>
              <p>2. Use this VNC view to complete the provider login.</p>
              <p>3. Return to Model Control and refresh provider status.</p>
              <p>4. If controls are off-screen, switch to Max and reload the viewer.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
