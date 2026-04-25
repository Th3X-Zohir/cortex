import { useEffect, useState } from 'react'
import {
  CheckCircle2, Clock, RefreshCw, XCircle,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import type { UserKeyRequest } from '@/types'
import {
  BusyPanel, EmptyPanel, ErrorBanner, PageShell, StatTile, SuccessBanner, Surface, SurfaceHeader,
} from '@/components/dashboard/UiKit'

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'

export function UserRequestsPage() {
  const [requests, setRequests] = useState<UserKeyRequest[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [approving, setApproving] = useState<string | null>(null)
  const [approveForm, setApproveForm] = useState<{ dailyLimit: number; rateLimitPerMin: number; reviewNote: string }>({
    dailyLimit: 1000,
    rateLimitPerMin: 60,
    reviewNote: '',
  })
  const [revealedKey, setRevealedKey] = useState<{ requestId: string; key: string } | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.admin.userRequests.list(statusFilter === 'all' ? undefined : statusFilter)
      setRequests(result.requests)
      setTotal(result.pagination.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [statusFilter])

  async function approve(id: string) {
    setError(null)
    setNotice(null)
    try {
      const result = await api.admin.userRequests.approve(id, {
        dailyLimit: approveForm.dailyLimit,
        rateLimitPerMin: approveForm.rateLimitPerMin,
        reviewNote: approveForm.reviewNote || undefined,
      })
      setRevealedKey({ requestId: id, key: result.rawKey })
      setNotice(`Request approved. The API key has been created.`)
      setApproving(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    }
  }

  async function reject(id: string, note: string) {
    setError(null)
    setNotice(null)
    try {
      await api.admin.userRequests.reject(id, note || undefined)
      setNotice('Request rejected.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed')
    }
  }

  const pending = requests.filter(r => r.status === 'pending').length
  const approved = requests.filter(r => r.status === 'approved').length

  return (
    <PageShell
      title="User Key Requests"
      description="Review and approve API key requests from registered users."
      action={
        <button type="button" className="ui-btn-secondary" onClick={() => void load()}>
          <RefreshCw size={14} /> Refresh
        </button>
      }
    >
      {error ? <ErrorBanner text={error} /> : null}
      {notice ? <SuccessBanner text={notice} /> : null}

      {revealedKey ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
          <p className="text-sm font-semibold text-teal-700">API Key Created — Share with user (shown once)</p>
          <code className="mt-2 block break-all rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs text-slate-700">
            {revealedKey.key}
          </code>
          <button
            type="button"
            className="mt-2 text-xs text-teal-600 underline"
            onClick={() => setRevealedKey(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Pending" value={String(pending)} hint="Awaiting review" tone={pending > 0 ? 'warn' : 'default'} />
        <StatTile label="Approved" value={String(approved)} hint="This view" tone="good" />
        <StatTile label="Total" value={String(total)} hint="Matching filter" />
      </div>

      <Surface>
        <SurfaceHeader
          title="Requests"
          description="Click Approve or Reject on each pending request."
          action={
            <div className="flex gap-1">
              {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(s => (
                <button
                  key={s}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    statusFilter === s
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          }
        />

        {loading ? (
          <BusyPanel text="Loading requests..." />
        ) : requests.length === 0 ? (
          <EmptyPanel text="No requests matching the current filter." />
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <RequestCard
                key={req.id}
                request={req}
                approving={approving === req.id}
                approveForm={approveForm}
                onApproveFormChange={setApproveForm}
                onStartApprove={() => setApproving(req.id)}
                onCancelApprove={() => setApproving(null)}
                onApprove={() => void approve(req.id)}
                onReject={(note) => void reject(req.id, note)}
              />
            ))}
          </div>
        )}
      </Surface>
    </PageShell>
  )
}

function RequestCard({
  request,
  approving,
  approveForm,
  onApproveFormChange,
  onStartApprove,
  onCancelApprove,
  onApprove,
  onReject,
}: {
  request: UserKeyRequest
  approving: boolean
  approveForm: { dailyLimit: number; rateLimitPerMin: number; reviewNote: string }
  onApproveFormChange: (form: { dailyLimit: number; rateLimitPerMin: number; reviewNote: string }) => void
  onStartApprove: () => void
  onCancelApprove: () => void
  onApprove: () => void
  onReject: (note: string) => void
}) {
  const [rejectNote, setRejectNote] = useState('')
  const [rejecting, setRejecting] = useState(false)

  const statusIcon = {
    pending: <Clock size={14} className="text-amber-500" />,
    approved: <CheckCircle2 size={14} className="text-green-500" />,
    rejected: <XCircle size={14} className="text-red-500" />,
  }[request.status]

  const statusColor = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    approved: 'bg-green-50 text-green-700 border-green-200',
    rejected: 'bg-red-50 text-red-700 border-red-200',
  }[request.status]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {statusIcon}
          <div>
            <p className="font-semibold text-slate-900">{request.name}</p>
            <p className="text-sm text-slate-500">
              by <strong>{request.userUsername}</strong> · {formatDate(request.createdAt)}
            </p>
            {request.reason && (
              <p className="mt-1 text-sm italic text-slate-600">&ldquo;{request.reason}&rdquo;</p>
            )}
            {request.reviewNote && request.status !== 'pending' && (
              <p className="mt-1 text-xs text-slate-500">Note: {request.reviewNote}</p>
            )}
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusColor}`}>
          {request.status}
        </span>
      </div>

      {request.status === 'pending' && !approving && !rejecting && (
        <div className="mt-3 flex gap-2">
          <button type="button" className="ui-btn-primary min-h-8 px-3 text-xs" onClick={onStartApprove}>
            <CheckCircle2 size={12} /> Approve
          </button>
          <button
            type="button"
            className="ui-btn-danger min-h-8 px-3 text-xs"
            onClick={() => setRejecting(true)}
          >
            <XCircle size={12} /> Reject
          </button>
        </div>
      )}

      {approving && (
        <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3 space-y-3">
          <p className="text-sm font-semibold text-teal-700">Approve — set key limits</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="ui-label">Daily limit</label>
              <input
                className="ui-input"
                type="number"
                min={1}
                value={approveForm.dailyLimit}
                onChange={e => onApproveFormChange({ ...approveForm, dailyLimit: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="ui-label">Rate / minute</label>
              <input
                className="ui-input"
                type="number"
                min={1}
                value={approveForm.rateLimitPerMin}
                onChange={e => onApproveFormChange({ ...approveForm, rateLimitPerMin: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label className="ui-label">Review note (optional)</label>
            <input
              className="ui-input"
              value={approveForm.reviewNote}
              onChange={e => onApproveFormChange({ ...approveForm, reviewNote: e.target.value })}
              placeholder="Visible to the user"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="ui-btn-primary min-h-8 px-3 text-xs" onClick={onApprove}>
              <CheckCircle2 size={12} /> Confirm approval
            </button>
            <button type="button" className="ui-btn-secondary min-h-8 px-3 text-xs" onClick={onCancelApprove}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-3">
          <p className="text-sm font-semibold text-red-700">Reject request</p>
          <div>
            <label className="ui-label">Reason (optional)</label>
            <input
              className="ui-input"
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="Visible to the user"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="ui-btn-danger min-h-8 px-3 text-xs"
              onClick={() => { onReject(rejectNote); setRejecting(false) }}
            >
              <XCircle size={12} /> Confirm rejection
            </button>
            <button
              type="button"
              className="ui-btn-secondary min-h-8 px-3 text-xs"
              onClick={() => setRejecting(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
