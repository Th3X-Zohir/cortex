import * as React from "react"
import { CheckCircle2, RefreshCcw } from "lucide-react"
import { api } from "~/lib/api"
import { PageHeader } from "~/components/shared/PageHeader"
import { Skeleton } from "~/components/ui/skeleton"
import type { Config } from "~/types"

export function SettingsPage() {
  const [config, setConfig] = React.useState<Config | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saved, setSaved] = React.useState(false)

  async function load() {
    setLoading(true)
    try {
      setConfig(await api.config.get())
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  async function save() {
    if (!config) return
    const next = await api.config.set({
      host: config.host,
      port: config.port,
      headless: config.headless,
      logLevel: config.logLevel,
      admin: config.admin,
    })
    setConfig(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  if (!config) {
    return (
      <div className="space-y-6 animate-fade-in">
        <PageHeader title="Settings" description="Runtime configuration and security controls." />
        <div className="panel p-5 flex items-center justify-center min-h-64">
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Settings"
        description="Runtime configuration, retention, CORS, and authentication enforcement."
        actions={
          <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      {saved && (
        <div className="flex items-center gap-2 p-4 rounded-xl border border-primary/20 bg-primary/5 text-sm">
          <CheckCircle2 size={16} className="text-success" />
          Settings saved. Restart the service for host, port, and some runtime changes to take effect.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Service runtime */}
        <div className="panel p-5 space-y-4">
          <h3 className="text-base font-semibold">Service runtime</h3>
          <p className="text-xs text-muted-foreground">Network and provider process configuration.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="host">Host</label>
              <input id="host" className="input" value={config.host} onChange={e => setConfig({ ...config, host: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="port">Port</label>
              <input id="port" className="input" type="number" min={1} value={config.port} onChange={e => setConfig({ ...config, port: Number(e.target.value) })} />
            </div>
            <div>
              <label className="label" htmlFor="loglevel">Log level</label>
              <select id="loglevel" className="input" value={config.logLevel} onChange={e => setConfig({ ...config, logLevel: e.target.value as Config["logLevel"] })}>
                <option value="silent">Silent</option>
                <option value="info">Info</option>
                <option value="debug">Debug</option>
              </select>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <input type="checkbox" id="headless" checked={config.headless} onChange={e => setConfig({ ...config, headless: e.target.checked })} className="w-4 h-4 rounded border-border bg-background-secondary text-primary focus:ring-primary/20" />
              <label htmlFor="headless" className="text-sm">Headless provider browsers</label>
            </div>
          </div>
        </div>

        {/* Security controls */}
        <div className="panel p-5 space-y-4">
          <h3 className="text-base font-semibold">Security controls</h3>
          <p className="text-xs text-muted-foreground">Authentication, retention, and browser API access policy.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="token-ttl">Admin token TTL seconds</label>
              <input id="token-ttl" className="input" type="number" min={300} value={config.admin.tokenTtlSeconds} onChange={e => setConfig({ ...config, admin: { ...config.admin, tokenTtlSeconds: Number(e.target.value) } })} />
            </div>
            <div>
              <label className="label" htmlFor="retention">Log retention days</label>
              <input id="retention" className="input" type="number" min={1} value={config.admin.logRetentionDays} onChange={e => setConfig({ ...config, admin: { ...config.admin, logRetentionDays: Number(e.target.value) } })} />
            </div>
            <div>
              <label className="label" htmlFor="cors">CORS origin</label>
              <input id="cors" className="input" value={config.admin.corsOrigin} onChange={e => setConfig({ ...config, admin: { ...config.admin, corsOrigin: e.target.value } })} />
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-border p-3">
              <input type="checkbox" id="require-api-key" checked={config.admin.requireApiKey} onChange={e => setConfig({ ...config, admin: { ...config.admin, requireApiKey: e.target.checked } })} className="w-4 h-4 rounded border-border bg-background-secondary text-primary focus:ring-primary/20" />
              <label htmlFor="require-api-key" className="text-sm">Require API keys for /v1</label>
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 border border-border p-3 text-sm space-y-1.5">
            <p>Admin database: <span className="font-mono text-xs">{config.admin.dbPath}</span></p>
            <p>JWT secret configured: {config.admin.jwtSecretConfigured ? "yes" : "generated local secret file"}</p>
            <p>noVNC public port: <span className="font-mono text-xs">{config.vnc.externalPort}</span></p>
          </div>
        </div>
      </div>

      <button className="btn-primary" onClick={save}>Save settings</button>
    </div>
  )
}