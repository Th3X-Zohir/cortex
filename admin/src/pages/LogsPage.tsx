import { Fragment, useEffect, useState } from 'react'
import { Activity, Search, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ApiKey, AuditLog, RequestLog } from '@/types'
import { DataTable, EmptyState, Page, Panel, RefreshButton, StatusCode } from '@/components/shared/AppPrimitives'

export function LogsPage() {
  const [tab, setTab] = useState<'requests' | 'audit'>('requests')
  const [logs, setLogs] = useState<RequestLog[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [filters, setFilters] = useState({ search: '', provider: '', statusCode: '', apiKeyId: '' })
  const [loading, setLoading] = useState(true)
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null)
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null)

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

  useEffect(() => { load() }, [])

  async function prune() {
    const days = Number(window.prompt('Delete request logs older than how many days?', '90'))
    if (!Number.isFinite(days) || days < 1) return
    await api.logs.prune(days)
    await load()
  }

  return (
    <Page title="Logs" description="Search request logs, failures, access events, and admin changes." action={<div className="flex gap-2"><button className="btn-ghost" onClick={prune}>Prune</button><RefreshButton onClick={load} loading={loading} /></div>}>
      <Panel title="Filters" description="Filter by client key, provider, status, or free text.">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_160px_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-white/40" size={16} />
            <input className="input pl-9" placeholder="Search model, key, error, action" value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} />
          </div>
          <input className="input" placeholder="Provider" value={filters.provider} onChange={event => setFilters({ ...filters, provider: event.target.value })} />
          <input className="input" placeholder="Status code" value={filters.statusCode} onChange={event => setFilters({ ...filters, statusCode: event.target.value })} />
          <select className="input" value={filters.apiKeyId} onChange={event => setFilters({ ...filters, apiKeyId: event.target.value })}>
            <option value="">All keys</option>
            {keys.map(key => <option key={key.id} value={key.id}>{key.name}</option>)}
          </select>
          <button className="btn-primary" onClick={load}>Apply</button>
        </div>
      </Panel>

      <div className="mt-5 flex gap-2">
        <button className={tab === 'requests' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('requests')}>Request logs</button>
        <button className={tab === 'audit' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('audit')}>Audit trail</button>
      </div>

      {tab === 'requests' ? (
        <Panel title="API request logs" description="Provider calls and rejected access attempts." className="mt-5">
          <DataTable headers={['Time', 'Key', 'Provider', 'Model', 'Status', 'Latency', 'Tokens', 'Summary', 'Details']}>
            {logs.map(log => (
              <Fragment key={log.id}>
                <tr className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4 text-white/40">{formatDate(log.createdAt)}</td>
                  <td className="py-3 pr-4">{log.apiKeyName ?? 'Unknown'}</td>
                  <td className="py-3 pr-4">{log.provider}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-primary/60">{log.model}</td>
                  <td className="py-3 pr-4"><StatusCode code={log.statusCode} /></td>
                  <td className="py-3 pr-4">{log.responseTimeMs ?? 0} ms</td>
                  <td className="py-3 pr-4">
                    <div className="text-xs">
                      <p className="font-semibold">{formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)}</p>
                      <p className="text-white/40">in {formatNumber(log.promptTokens ?? 0)} / out {formatNumber(log.completionTokens ?? 0)}</p>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-sm text-white/60">{log.error || `${log.messagesCount} messages${log.stream ? ' · stream' : ''}`}</td>
                  <td className="py-3 pr-4">
                    <button className="btn-ghost min-h-8 px-3 py-1 text-xs" onClick={() => setExpandedRequestId(expandedRequestId === log.id ? null : log.id)}>
                      {expandedRequestId === log.id ? 'Hide' : 'View'}
                    </button>
                  </td>
                </tr>
                {expandedRequestId === log.id && (
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <td colSpan={9} className="p-4">
                      <RequestLogDetails log={log} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </DataTable>
          {logs.length === 0 && <EmptyState icon={Activity} message="No matching request logs." />}
        </Panel>
      ) : (
        <Panel title="Admin audit trail" description="Authentication, key, provider, and settings actions." className="mt-5">
          <DataTable headers={['Time', 'Admin', 'Action', 'Entity', 'IP address', 'Metadata', 'Details']}>
            {auditLogs.map(log => (
              <Fragment key={log.id}>
                <tr className="border-b border-white/5 last:border-0">
                  <td className="py-3 pr-4 text-white/40">{formatDate(log.createdAt)}</td>
                  <td className="py-3 pr-4">{log.adminUsername ?? 'System'}</td>
                  <td className="py-3 pr-4 font-semibold text-primary">{log.action.replace(/_/g, ' ')}</td>
                  <td className="py-3 pr-4">{log.entityType}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}</td>
                  <td className="py-3 pr-4 text-white/60">{log.ipAddress ?? 'Unknown'}</td>
                  <td className="max-w-sm truncate py-3 pr-4 text-xs text-white/40">{log.metadata ? JSON.stringify(log.metadata) : ''}</td>
                  <td className="py-3 pr-4">
                    <button className="btn-ghost min-h-8 px-3 py-1 text-xs" onClick={() => setExpandedAuditId(expandedAuditId === log.id ? null : log.id)}>
                      {expandedAuditId === log.id ? 'Hide' : 'View'}
                    </button>
                  </td>
                </tr>
                {expandedAuditId === log.id && (
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <td colSpan={7} className="p-4">
                      <AuditLogDetails log={log} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </DataTable>
          {auditLogs.length === 0 && <EmptyState icon={ShieldCheck} message="No matching audit events." />}
        </Panel>
      )}
    </Page>
  )
}

function RequestLogDetails({ log }: { log: RequestLog }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <DetailItem label="Log ID" value={log.id} mono />
        <DetailItem label="Created" value={formatDate(log.createdAt)} />
        <DetailItem label="Status code" value={log.statusCode ?? 'Pending'} />
        <DetailItem label="API key name" value={log.apiKeyName ?? 'Unknown'} />
        <DetailItem label="API key ID" value={log.apiKeyId ?? 'None'} mono />
        <DetailItem label="Stream" value={log.stream ? 'Yes' : 'No'} />
        <DetailItem label="Provider" value={log.provider} />
        <DetailItem label="Model" value={log.model} mono />
        <DetailItem label="Messages" value={formatNumber(log.messagesCount)} />
        <DetailItem label="Latency" value={`${log.responseTimeMs ?? 0} ms`} />
        <DetailItem label="Input tokens" value={formatNumber(log.promptTokens ?? 0)} />
        <DetailItem label="Output tokens" value={formatNumber(log.completionTokens ?? 0)} />
        <DetailItem label="Total tokens" value={formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)} />
        <DetailItem label="IP address" value={log.ipAddress ?? 'Unknown'} mono />
        <DetailItem label="User agent" value={log.userAgent ?? 'Unknown'} wide />
      </div>
      {log.error && (
        <div>
          <p className="label text-white/60">Error detail</p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">{log.error}</pre>
        </div>
      )}
    </div>
  )
}

function AuditLogDetails({ log }: { log: AuditLog }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <DetailItem label="Audit ID" value={log.id} mono />
        <DetailItem label="Created" value={formatDate(log.createdAt)} />
        <DetailItem label="Action" value={log.action.replace(/_/g, ' ')} />
        <DetailItem label="Admin" value={log.adminUsername ?? 'System'} />
        <DetailItem label="Admin ID" value={log.adminId ?? 'None'} mono />
        <DetailItem label="Entity type" value={log.entityType} />
        <DetailItem label="Entity ID" value={log.entityId ?? 'None'} mono />
        <DetailItem label="IP address" value={log.ipAddress ?? 'Unknown'} mono />
        <DetailItem label="User agent" value={log.userAgent ?? 'Unknown'} wide />
      </div>
      <div>
        <p className="label text-white/60">Metadata</p>
        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
          {log.metadata ? JSON.stringify(log.metadata, null, 2) : 'No metadata'}
        </pre>
      </div>
    </div>
  )
}

function DetailItem({ label, value, mono = false, wide = false }: { label: string; value: React.ReactNode; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-3' : ''}>
      <p className="label text-white/60">{label}</p>
      <p className={`mt-1 break-words text-sm ${mono ? 'font-mono text-xs text-primary/60' : ''}`}>{value}</p>
    </div>
  )
}
