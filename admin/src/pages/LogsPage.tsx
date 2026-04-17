import * as React from "react"
import { Activity, Search, RefreshCcw, ShieldCheck } from "lucide-react"
import { api } from "~/lib/api"
import { formatDate, formatNumber } from "~/lib/utils"
import { PageHeader } from "~/components/shared/PageHeader"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs"
import { Skeleton } from "~/components/ui/skeleton"
import { Badge } from "~/components/ui/badge"
import type { RequestLog, AuditLog, ApiKey } from "~/types"

export function LogsPage() {
  const [tab, setTab] = React.useState<"requests" | "audit">("requests")
  const [logs, setLogs] = React.useState<RequestLog[]>([])
  const [auditLogs, setAuditLogs] = React.useState<AuditLog[]>([])
  const [keys, setKeys] = React.useState<ApiKey[]>([])
  const [filters, setFilters] = React.useState({ search: "", provider: "", statusCode: "", apiKeyId: "" })
  const [loading, setLoading] = React.useState(true)
  const [expandedRequestId, setExpandedRequestId] = React.useState<string | null>(null)
  const [expandedAuditId, setExpandedAuditId] = React.useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [requestResult, auditResult, keyList] = await Promise.all([
        api.logs.list({
          limit: 100,
          search: filters.search || undefined,
          provider: filters.provider || undefined,
          statusCode: filters.statusCode ? Number(filters.statusCode) : undefined,
          apiKeyId: filters.apiKeyId || undefined,
        }),
        api.logs.audit({ limit: 100, search: filters.search || undefined }),
        api.admin.keys.list(),
      ])
      setLogs(requestResult.logs)
      setAuditLogs(auditResult.logs)
      setKeys(keyList)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => { load() }, [filters])

  async function prune() {
    const days = Number(window.prompt("Delete request logs older than how many days?", "90"))
    if (!Number.isFinite(days) || days < 1) return
    await api.logs.prune(days)
    await load()
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Request Logs"
        description="Search request logs, failures, access events, and admin changes."
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-ghost text-xs" onClick={prune}>Prune</button>
            <button className="btn-ghost flex items-center gap-2" onClick={load} disabled={loading}>
              <RefreshCcw size={16} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="panel p-5">
        <h3 className="text-base font-semibold mb-3">Filters</h3>
        <div className="grid gap-3 md:grid-cols-[1fr_160px_160px_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              className="input pl-9"
              placeholder="Search model, key, error, action"
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <input className="input" placeholder="Provider" value={filters.provider} onChange={e => setFilters({ ...filters, provider: e.target.value })} />
          <input className="input" placeholder="Status code" value={filters.statusCode} onChange={e => setFilters({ ...filters, statusCode: e.target.value })} />
          <select
            className="input"
            value={filters.apiKeyId}
            onChange={e => setFilters({ ...filters, apiKeyId: e.target.value })}
          >
            <option value="">All keys</option>
            {keys.map(key => <option key={key.id} value={key.id}>{key.name}</option>)}
          </select>
          <button className="btn-primary" onClick={load}>Apply</button>
        </div>
      </div>

      <Tabs defaultValue="requests" value={tab} onValueChange={v => setTab(v as "requests" | "audit")}>
        <TabsList>
          <TabsTrigger value="requests">Request logs</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-border bg-background-secondary">
                  <tr>
                    {["Time", "Key", "Provider", "Model", "Status", "Latency", "Tokens", "Summary", ""].map(h => (
                      <th key={h} className="h-11 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground last:pr-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && logs.length === 0
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-border">
                          {Array.from({ length: 9 }).map((_, j) => (
                            <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
                          ))}
                        </tr>
                      ))
                    : logs.map(log => (
                        <React.Fragment key={log.id}>
                          <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(log.createdAt)}</td>
                            <td className="py-3 pr-4 text-sm">{log.apiKeyName ?? "Unknown"}</td>
                            <td className="py-3 pr-4 text-sm">{log.provider}</td>
                            <td className="py-3 pr-4 font-mono text-xs">{log.model}</td>
                            <td className="py-3 pr-4">
                              {log.statusCode ? (
                                <Badge variant={log.statusCode >= 500 ? "error" : log.statusCode >= 400 ? "warning" : "success"}>
                                  {log.statusCode}
                                </Badge>
                              ) : (
                                <Badge variant="info">Pending</Badge>
                              )}
                            </td>
                            <td className="py-3 pr-4 text-sm">{log.responseTimeMs ?? 0} ms</td>
                            <td className="py-3 pr-4">
                              <div className="text-xs">
                                <p className="font-semibold">{formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)}</p>
                                <p className="text-muted-foreground">in {formatNumber(log.promptTokens ?? 0)} / out {formatNumber(log.completionTokens ?? 0)}</p>
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-sm text-muted-foreground">
                              {log.error || `${log.messagesCount} messages${log.stream ? " · stream" : ""}`}
                            </td>
                            <td className="py-3 pr-0">
                              <button
                                className="btn-ghost text-xs"
                                onClick={() => setExpandedRequestId(expandedRequestId === log.id ? null : log.id)}
                              >
                                {expandedRequestId === log.id ? "Hide" : "View"}
                              </button>
                            </td>
                          </tr>
                          {expandedRequestId === log.id && (
                            <tr className="border-b border-border bg-muted/40">
                              <td colSpan={9} className="p-4">
                                <RequestLogDetails log={log} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                </tbody>
              </table>
            </div>
            {logs.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity size={28} className="text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No matching request logs.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <div className="panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="border-b border-border bg-background-secondary">
                  <tr>
                    {["Time", "Admin", "Action", "Entity", "IP address", "Metadata", ""].map(h => (
                      <th key={h} className="h-11 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground last:pr-0">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && auditLogs.length === 0
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b border-border">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
                          ))}
                        </tr>
                      ))
                    : auditLogs.map(log => (
                        <React.Fragment key={log.id}>
                          <tr className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(log.createdAt)}</td>
                            <td className="py-3 pr-4 text-sm">{log.adminUsername ?? "System"}</td>
                            <td className="py-3 pr-4 font-medium text-sm">{log.action.replace(/_/g, " ")}</td>
                            <td className="py-3 pr-4 text-sm">
                              {log.entityType}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                            </td>
                            <td className="py-3 pr-4 font-mono text-xs">{log.ipAddress ?? "Unknown"}</td>
                            <td className="max-w-xs truncate py-3 pr-4 text-xs text-muted-foreground">
                              {log.metadata ? JSON.stringify(log.metadata) : ""}
                            </td>
                            <td className="py-3 pr-0">
                              <button
                                className="btn-ghost text-xs"
                                onClick={() => setExpandedAuditId(expandedAuditId === log.id ? null : log.id)}
                              >
                                {expandedAuditId === log.id ? "Hide" : "View"}
                              </button>
                            </td>
                          </tr>
                          {expandedAuditId === log.id && (
                            <tr className="border-b border-border bg-muted/40">
                              <td colSpan={7} className="p-4">
                                <AuditLogDetails log={log} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                </tbody>
              </table>
            </div>
            {auditLogs.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShieldCheck size={28} className="text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No matching audit events.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function RequestLogDetails({ log }: { log: RequestLog }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[
        { label: "Log ID", value: log.id, mono: true },
        { label: "Created", value: formatDate(log.createdAt) },
        { label: "Status code", value: log.statusCode ?? "Pending" },
        { label: "API key name", value: log.apiKeyName ?? "Unknown" },
        { label: "Provider", value: log.provider },
        { label: "Model", value: log.model, mono: true },
        { label: "Messages", value: formatNumber(log.messagesCount) },
        { label: "Latency", value: `${log.responseTimeMs ?? 0} ms` },
        { label: "Input tokens", value: formatNumber(log.promptTokens ?? 0) },
        { label: "Output tokens", value: formatNumber(log.completionTokens ?? 0) },
        { label: "Total tokens", value: formatNumber(log.totalTokens ?? log.tokensUsed ?? 0) },
        { label: "IP address", value: log.ipAddress ?? "Unknown", mono: true },
      ].map(item => (
        <div key={item.label}>
          <p className="label">{item.label}</p>
          <p className={`mt-1 text-sm ${item.mono ? "font-mono text-xs" : ""}`}>{item.value}</p>
        </div>
      ))}
      {log.error && (
        <div className="sm:col-span-3">
          <p className="label">Error detail</p>
          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-xs text-destructive font-mono">
            {log.error}
          </pre>
        </div>
      )}
    </div>
  )
}

function AuditLogDetails({ log }: { log: AuditLog }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {[
        { label: "Audit ID", value: log.id, mono: true },
        { label: "Created", value: formatDate(log.createdAt) },
        { label: "Action", value: log.action.replace(/_/g, " ") },
        { label: "Admin", value: log.adminUsername ?? "System" },
        { label: "Entity type", value: log.entityType },
        { label: "Entity ID", value: log.entityId ?? "None", mono: true },
        { label: "IP address", value: log.ipAddress ?? "Unknown", mono: true },
      ].map(item => (
        <div key={item.label}>
          <p className="label">{item.label}</p>
          <p className={`mt-1 text-sm ${item.mono ? "font-mono text-xs" : ""}`}>{item.value}</p>
        </div>
      ))}
      <div className="sm:col-span-3">
        <p className="label">Metadata</p>
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-muted/50 border border-border p-3 text-xs font-mono">
          {log.metadata ? JSON.stringify(log.metadata, null, 2) : "No metadata"}
        </pre>
      </div>
    </div>
  )
}