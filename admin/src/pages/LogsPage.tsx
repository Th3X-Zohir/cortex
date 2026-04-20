import { Fragment, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate, formatNumber } from '@/lib/utils'
import type { ApiKey, AuditLog, RequestLog } from '@/types'
import {
  BusyPanel,
  Chip,
  EmptyPanel,
  ErrorBanner,
  PageShell,
  Surface,
  SurfaceHeader,
} from '@/components/dashboard/UiKit'

export function LogsPage() {
  const [tab, setTab] = useState<'requests' | 'audit'>('requests')
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    search: '',
    provider: '',
    statusCode: '',
    apiKeyId: '',
  })

  async function load() {
    setLoading(true)
    setError(null)

    try {
      const [requestResult, auditResult, keyList] = await Promise.all([
        api.logs.list({
          limit: 120,
          search: filters.search || undefined,
          provider: filters.provider || undefined,
          statusCode: filters.statusCode ? Number(filters.statusCode) : undefined,
          apiKeyId: filters.apiKeyId || undefined,
        }),
        api.logs.audit({
          limit: 120,
          search: filters.search || undefined,
        }),
        api.admin.keys.list(),
      ])

      setRequestLogs(requestResult.logs)
      setAuditLogs(auditResult.logs)
      setApiKeys(keyList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function prune() {
    const answer = window.prompt('Delete request logs older than how many days?', '90')
    const olderThanDays = Number(answer)
    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) return

    setError(null)
    try {
      await api.logs.prune(olderThanDays)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to prune logs')
    }
  }

  return (
    <PageShell
      title="Request and Audit Logs"
      description="Search traffic records, inspect failures, and review admin activity with a unified forensic view."
      action={
        <>
          <button type="button" className="ui-btn-secondary" onClick={prune}>Prune</button>
          <button type="button" className="ui-btn-secondary" onClick={() => void load()}>Refresh</button>
        </>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}

      <Surface>
        <SurfaceHeader title="Filters" description="Narrow results by provider, key, status code, and keyword text." />
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_170px_150px_200px_auto]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="ui-input pl-9"
              placeholder="Search model, error, action"
              value={filters.search}
              onChange={event => setFilters(current => ({ ...current, search: event.target.value }))}
            />
          </div>
          <input
            className="ui-input"
            placeholder="Provider"
            value={filters.provider}
            onChange={event => setFilters(current => ({ ...current, provider: event.target.value }))}
          />
          <input
            className="ui-input"
            placeholder="Status"
            value={filters.statusCode}
            onChange={event => setFilters(current => ({ ...current, statusCode: event.target.value }))}
          />
          <select
            className="ui-input"
            value={filters.apiKeyId}
            onChange={event => setFilters(current => ({ ...current, apiKeyId: event.target.value }))}
          >
            <option value="">All keys</option>
            {apiKeys.map(key => (
              <option key={key.id} value={key.id}>{key.name}</option>
            ))}
          </select>
          <button type="button" className="ui-btn-primary" onClick={() => void load()}>Apply</button>
        </div>
      </Surface>

      <Surface>
        <SurfaceHeader
          title="Log Streams"
          description="Switch between runtime API request logs and admin audit events."
          action={
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                className={tab === 'requests' ? 'ui-btn-primary min-h-8 px-3 text-xs' : 'ui-btn-secondary min-h-8 border-transparent px-3 text-xs'}
                onClick={() => {
                  setTab('requests')
                  setExpanded(null)
                }}
              >
                Request logs
              </button>
              <button
                type="button"
                className={tab === 'audit' ? 'ui-btn-primary min-h-8 px-3 text-xs' : 'ui-btn-secondary min-h-8 border-transparent px-3 text-xs'}
                onClick={() => {
                  setTab('audit')
                  setExpanded(null)
                }}
              >
                Audit logs
              </button>
            </div>
          }
        />

        {loading ? (
          <BusyPanel text="Loading log records..." />
        ) : tab === 'requests' ? (
          requestLogs.length ? (
            <div className="ui-table-wrap">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Key</th>
                    <th>Provider</th>
                    <th>Model</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Tokens</th>
                    <th>Summary</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {requestLogs.map(log => (
                    <Fragment key={log.id}>
                      <tr>
                        <td>{formatDate(log.createdAt)}</td>
                        <td>{log.apiKeyName ?? 'Unknown'}</td>
                        <td>{log.provider}</td>
                        <td className="font-mono text-xs text-slate-600">{log.model}</td>
                        <td>
                          {typeof log.statusCode === 'number' ? (
                            log.statusCode >= 500 ? (
                              <Chip tone="bad">{log.statusCode}</Chip>
                            ) : log.statusCode >= 400 ? (
                              <Chip tone="warn">{log.statusCode}</Chip>
                            ) : (
                              <Chip tone="good">{log.statusCode}</Chip>
                            )
                          ) : (
                            <Chip tone="default">Pending</Chip>
                          )}
                        </td>
                        <td>{log.responseTimeMs ?? 0} ms</td>
                        <td>{formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)}</td>
                        <td className="max-w-[320px] truncate text-slate-600">
                          {log.error ? log.error : `${log.messagesCount} messages${log.stream ? ' • stream' : ''}`}
                        </td>
                        <td>
                          <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                            {expanded === log.id ? 'Hide' : 'View'}
                          </button>
                        </td>
                      </tr>
                      {expanded === log.id ? (
                        <tr>
                          <td colSpan={9}>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="grid gap-3 md:grid-cols-3">
                                <Detail label="Log ID" value={log.id} mono />
                                <Detail label="API Key ID" value={log.apiKeyId ?? 'None'} mono />
                                <Detail label="IP Address" value={log.ipAddress ?? 'Unknown'} mono />
                                <Detail label="Prompt Tokens" value={formatNumber(log.promptTokens ?? 0)} />
                                <Detail label="Completion Tokens" value={formatNumber(log.completionTokens ?? 0)} />
                                <Detail label="Total Tokens" value={formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)} />
                                <Detail label="User Agent" value={log.userAgent ?? 'Unknown'} wide />
                              </div>
                              {log.error ? (
                                <pre className="mt-3 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                                  {log.error}
                                </pre>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyPanel text="No request logs matched the current filters." />
          )
        ) : auditLogs.length ? (
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <Fragment key={log.id}>
                    <tr>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.adminUsername ?? 'System'}</td>
                      <td>
                        <Chip tone="default">{log.action.replace(/_/g, ' ')}</Chip>
                      </td>
                      <td>{log.entityType}{log.entityId ? ` • ${log.entityId.slice(0, 8)}` : ''}</td>
                      <td>{log.ipAddress ?? 'Unknown'}</td>
                      <td>
                        <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                          {expanded === log.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expanded === log.id ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="grid gap-3 md:grid-cols-3">
                              <Detail label="Audit ID" value={log.id} mono />
                              <Detail label="Admin ID" value={log.adminId ?? 'None'} mono />
                              <Detail label="User Agent" value={log.userAgent ?? 'Unknown'} wide />
                            </div>
                            <pre className="mt-3 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                              {log.metadata ? JSON.stringify(log.metadata, null, 2) : 'No metadata'}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanel text="No audit logs matched the current filters." />
        )}
      </Surface>
    </PageShell>
  )
}

function Detail({ label, value, mono = false, wide = false }: { label: string; value: string | number; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-3' : ''}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
      <p className={`mt-1 break-words text-sm text-slate-700 ${mono ? 'font-mono text-xs' : ''}`}>{value}</p>
    </div>
  )
}
