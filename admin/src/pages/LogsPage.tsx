import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Search } from 'lucide-react'
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
  const [expandedRequestIds, setExpandedRequestIds] = useState<string[]>([])
  const [expandedAuditIds, setExpandedAuditIds] = useState<string[]>([])
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
                }}
              >
                Request logs
              </button>
              <button
                type="button"
                className={tab === 'audit' ? 'ui-btn-primary min-h-8 px-3 text-xs' : 'ui-btn-secondary min-h-8 border-transparent px-3 text-xs'}
                onClick={() => {
                  setTab('audit')
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
                    <th>Account</th>
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
                    <RequestLogRow
                      key={log.id}
                      log={log}
                      expanded={expandedRequestIds.includes(log.id)}
                      onToggle={() => toggleExpanded(log.id, setExpandedRequestIds)}
                    />
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
                  <AuditLogRow
                    key={log.id}
                    log={log}
                    expanded={expandedAuditIds.includes(log.id)}
                    onToggle={() => toggleExpanded(log.id, setExpandedAuditIds)}
                  />
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

function toggleExpanded(id: string, setter: React.Dispatch<React.SetStateAction<string[]>>) {
  setter(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]))
}

function RequestLogRow({
  log,
  expanded,
  onToggle,
}: {
  log: RequestLog
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <Fragment>
      <tr>
        <td>{formatDate(log.createdAt)}</td>
        <td>{log.apiKeyName ?? 'Unknown'}</td>
        <td>{log.provider}</td>
        <td className="text-xs text-slate-600">
          {log.accountLabel ? (
            <Chip tone="default">{log.accountLabel}</Chip>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
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
          <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={onToggle}>
            {expanded ? 'Hide' : 'View'}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={10}>
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Detail label="Log ID" value={log.id} mono />
                <Detail label="API Key ID" value={log.apiKeyId ?? 'None'} mono />
                <Detail label="IP Address" value={log.ipAddress ?? 'Unknown'} mono />
                <Detail label="Account" value={log.accountLabel ?? 'n/a'} />
                <Detail label="Account ID" value={log.accountId ?? 'n/a'} mono />
                <Detail label="Prompt Tokens" value={formatNumber(log.promptTokens ?? 0)} />
                <Detail label="Completion Tokens" value={formatNumber(log.completionTokens ?? 0)} />
                <Detail label="Total Tokens" value={formatNumber(log.totalTokens ?? log.tokensUsed ?? 0)} />
                <Detail label="User Agent" value={log.userAgent ?? 'Unknown'} wide />
              </div>
              {log.error ? (
                <PayloadPanel label="Error" value={log.error} tone="error" defaultExpanded />
              ) : null}
              {log.requestPayload ? <PayloadPanel label="Request Payload" value={log.requestPayload} defaultExpanded /> : null}
              {log.responsePayload ? <PayloadPanel label="Response Payload" value={log.responsePayload} /> : null}
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}

function AuditLogRow({
  log,
  expanded,
  onToggle,
}: {
  log: AuditLog
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <Fragment>
      <tr>
        <td>{formatDate(log.createdAt)}</td>
        <td>{log.adminUsername ?? 'System'}</td>
        <td>
          <Chip tone="default">{log.action.replace(/_/g, ' ')}</Chip>
        </td>
        <td>{log.entityType}{log.entityId ? ` • ${log.entityId.slice(0, 8)}` : ''}</td>
        <td>{log.ipAddress ?? 'Unknown'}</td>
        <td>
          <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={onToggle}>
            {expanded ? 'Hide' : 'View'}
          </button>
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6}>
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Detail label="Audit ID" value={log.id} mono />
                <Detail label="Admin ID" value={log.adminId ?? 'None'} mono />
                <Detail label="User Agent" value={log.userAgent ?? 'Unknown'} wide />
              </div>
              <PayloadPanel label="Metadata" value={log.metadata ?? 'No metadata'} defaultExpanded />
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
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

function PayloadPanel({
  label,
  value,
  defaultExpanded = false,
  tone = 'default',
}: {
  label: string
  value: unknown
  defaultExpanded?: boolean
  tone?: 'default' | 'error'
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [copied, setCopied] = useState(false)
  const payload = useMemo(() => formatPayload(value), [value])

  async function copyPayload() {
    await navigator.clipboard.writeText(payload.formatted)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const shellClass = tone === 'error'
    ? 'border-rose-200 bg-rose-50/70'
    : 'border-slate-200 bg-white'
  const previewClass = tone === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : 'border-slate-200 bg-slate-50 text-slate-600'

  return (
    <div className={`rounded-xl border ${shellClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => setExpanded(current => !current)}
        >
          {expanded ? <ChevronDown size={16} className="text-slate-500" /> : <ChevronRight size={16} className="text-slate-500" />}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</p>
            <p className="truncate text-xs text-slate-500">
              {payload.kind} • {formatNumber(payload.characters)} chars • {formatNumber(payload.lines)} lines
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={copyPayload}>
            <Copy size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="border-t border-slate-200/80 p-3">
          <pre className="ui-scroll max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
            {payload.formatted}
          </pre>
        </div>
      ) : (
        <div className="px-3 pb-3">
          <div className={`ui-scroll overflow-auto rounded-xl border p-3 font-mono text-xs leading-5 ${previewClass}`}>
            {payload.preview}
          </div>
        </div>
      ) }
    </div>
  )
}

function formatPayload(value: unknown) {
  let kind = 'text'
  let formatted = ''

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) {
      try {
        formatted = JSON.stringify(JSON.parse(trimmed), null, 2)
        kind = 'json'
      } catch {
        formatted = value
      }
    } else {
      formatted = value
    }
  } else {
    formatted = JSON.stringify(value, null, 2)
    kind = Array.isArray(value) || (value && typeof value === 'object') ? 'json' : 'value'
  }

  const safeFormatted = formatted || 'No data'
  const lines = safeFormatted.split('\n')
  const preview = lines.slice(0, 8).join('\n')

  return {
    kind,
    formatted: safeFormatted,
    preview: lines.length > 8 ? `${preview}\n...` : preview,
    characters: safeFormatted.length,
    lines: lines.length,
  }
}
