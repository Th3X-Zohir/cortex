import * as React from "react"
import { Cpu, PlugZap, Eye, RefreshCcw, ExternalLink } from "lucide-react"
import { api } from "~/lib/api"
import { formatDate, formatNumber } from "~/lib/utils"
import { PageHeader } from "~/components/shared/PageHeader"
import { Badge } from "~/components/ui/badge"
import type { ModelCatalog } from "~/types"

export function ProvidersPage() {
  const [catalog, setCatalog] = React.useState<ModelCatalog | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [message, setMessage] = React.useState<string | null>(null)
  const [apiKeyDrafts, setApiKeyDrafts] = React.useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    try {
      setCatalog(await api.providers.models())
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [])

  async function action(provider: string, operation: "login" | "logout") {
    setMessage(null)
    try {
      if (operation === "login") await api.providers.login(provider)
      else await api.providers.logout(provider)
      setMessage(operation === "login" ? "Login browser started on the server." : "Provider session closed.")
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Provider action failed")
    }
  }

  async function saveApiKey(provider: string) {
    const key = apiKeyDrafts[provider]?.trim()
    if (!key) { setMessage("Enter an API key before saving."); return }
    try {
      await api.providers.setApiKey(provider, key)
      setApiKeyDrafts({ ...apiKeyDrafts, [provider]: "" })
      setMessage(`${provider} credentials saved.`)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save provider credentials")
    }
  }

  const grouped = React.useMemo(() => {
    const byProvider = new Map<string, ModelCatalog["models"]>()
    for (const model of catalog?.models ?? []) {
      const list = byProvider.get(model.provider) ?? []
      list.push(model)
      byProvider.set(model.provider, list)
    }
    return byProvider
  }, [catalog])

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Model Control"
        description="Manage model sessions, provider credentials, usage, and browser login workflows."
        actions={
          <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        }
      />

      {message && (
        <div className="panel p-4 rounded-xl border-primary/20 bg-primary/5 text-sm">
          {message}
        </div>
      )}

      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Models",
            value: formatNumber(catalog?.models.length ?? 0),
            icon: Cpu,
            desc: "Registered in Cortex",
          },
          {
            label: "Connected",
            value: formatNumber(catalog?.providers.filter(p => p.sessionValid).length ?? 0),
            icon: PlugZap,
            desc: "Ready providers",
            iconColor: (catalog?.providers.some(p => p.sessionValid) ?? false) ? "text-success" : "text-warning",
          },
          {
            label: "VNC",
            value: catalog?.vnc.enabled ? "Ready" : "Off",
            icon: Eye,
            desc: catalog?.vnc.url ? `:${catalog.vnc.port}` : "Unavailable",
          },
        ].map((m, i) => (
          <div key={i} className="panel p-5 flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${m.iconColor ? "" : "bg-primary/10 border border-primary/15"}`}>
              <m.icon size={20} className={m.iconColor || "text-primary"} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{m.label}</p>
              <p className="text-2xl font-bold mt-1">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Provider cards */}
      <div className="grid gap-5 xl:grid-cols-2">
        {(catalog?.providers ?? []).map(provider => (
          <div key={provider.name} className="panel p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <h3 className="text-base font-semibold">{provider.name}</h3>
                {provider.sessionValid ? (
                  <span className="status-success">
                    <span className="relative flex items-center gap-1.5">
                      <span className="absolute inset-0 rounded-full animate-ping opacity-50" />
                      <span className="relative w-1.5 h-1.5 rounded-full bg-success" />
                      Connected
                    </span>
                  </span>
                ) : (
                  <span className="status-warning">{provider.hasProfile ? "Profile exists" : "Disconnected"}</span>
                )}
                <p className="text-sm text-muted-foreground">
                  {provider.name.endsWith("-api")
                    ? "Uses configured server API credentials."
                    : "Uses a managed browser session profile."}
                </p>
              </div>
              <div className="flex gap-2">
                {!provider.name.endsWith("-api") && (
                  <button className="btn-primary text-xs" onClick={() => action(provider.name, "login")}>Login</button>
                )}
                <button className="btn-ghost text-xs" onClick={() => action(provider.name, "logout")}>Logout</button>
                {!provider.name.endsWith("-api") && catalog?.vnc.url && (
                  <a className="btn-ghost text-xs flex items-center gap-1" href={catalog.vnc.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={12} />VNC
                  </a>
                )}
              </div>
            </div>

            {provider.name.endsWith("-api") && (
              <div className="flex gap-3">
                <input
                  className="input"
                  type="password"
                  placeholder={`${catalog?.apiKeysConfigured[provider.name] ? "Replace" : "Set"} ${provider.name} API key`}
                  value={apiKeyDrafts[provider.name] ?? ""}
                  onChange={e => setApiKeyDrafts({ ...apiKeyDrafts, [provider.name]: e.target.value })}
                />
                <button className="btn-primary shrink-0" onClick={() => saveApiKey(provider.name)}>Save</button>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {grouped.get(provider.name)?.length ?? provider.models.length} models
              </p>
              <div className="flex flex-wrap gap-2">
                {(grouped.get(provider.name) ?? []).map(model => (
                  <div key={model.id} className="min-w-48 flex-1 rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{model.displayName}</p>
                        <p className="font-mono text-xs text-muted-foreground mt-0.5">{model.id}</p>
                      </div>
                      <Badge variant="outline">{model.owned_by}</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="label">Requests</p>
                        <p className="font-semibold text-sm">{formatNumber(model.usage.requests)}</p>
                      </div>
                      <div>
                        <p className="label">Tokens</p>
                        <p className="font-semibold text-sm">{formatNumber(model.usage.totalTokens)}</p>
                      </div>
                      <div>
                        <p className="label">Errors</p>
                        <p className="font-semibold text-sm">{formatNumber(model.usage.errorCount)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Last used {model.usage.lastUsed ? formatDate(model.usage.lastUsed) : "never"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}