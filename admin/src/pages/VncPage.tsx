import * as React from "react"
import { ExternalLink, RefreshCcw } from "lucide-react"
import { api } from "~/lib/api"
import { PageHeader } from "~/components/shared/PageHeader"
import { Skeleton } from "~/components/ui/skeleton"
import type { ModelCatalog } from "~/types"

export function VncPage() {
  const [catalog, setCatalog] = React.useState<ModelCatalog | null>(null)
  const [loading, setLoading] = React.useState(true)

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

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        {/* VNC iframe */}
        <div className="overflow-hidden rounded-xl border border-border bg-[#101411]">
          {loading && !catalog ? (
            <Skeleton className="h-[60vh] w-full" />
          ) : url ? (
            <iframe title="Cortex noVNC" src={url} className="h-[60vh] w-full border-0 bg-[#101411]" />
          ) : (
            <div className="flex h-[60vh] items-center justify-center text-white/50">
              VNC endpoint is not available.
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="panel p-5">
            <h3 className="text-base font-semibold mb-2">Access details</h3>
            <p className="text-xs text-muted-foreground mb-4">The container exposes noVNC for browser-based provider logins.</p>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}