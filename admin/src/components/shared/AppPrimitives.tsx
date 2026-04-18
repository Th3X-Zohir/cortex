import { Activity, CheckCircle2, Loader2, RefreshCcw, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'

export function Page({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-white/45">Operations Workspace</p>
          <h1 className="mt-2 bg-gradient-to-r from-white to-white/75 bg-clip-text text-3xl font-extrabold text-transparent">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </>
  )
}

export function Panel({ title, description, children, className = '' }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-[0_16px_36px_rgba(5,10,24,0.34)] backdrop-blur-xl ${className}`}>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-white/60">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export function Metric({ label, value, helper, icon: Icon, tone = 'neutral' }: { label: string; value: string; helper: string; icon: typeof Activity; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const toneClass = tone === 'good'
    ? 'text-success border-success/25 bg-success/12'
    : tone === 'warn'
      ? 'text-warning border-warning/25 bg-warning/12'
      : tone === 'bad'
        ? 'text-destructive border-destructive/25 bg-destructive/12'
        : 'text-info border-info/25 bg-info/12'

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-[0_14px_30px_rgba(5,10,24,0.32)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label text-white/48">{label}</p>
          <p className="mt-3 text-3xl font-bold text-white">{value}</p>
          <p className="mt-2 text-sm text-white/50">{helper}</p>
        </div>
        <div className={`rounded-xl border p-2 ${toneClass}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

export function NavButton({ active, icon: Icon, label, onClick, collapsed = false }: { active: boolean; icon: typeof Activity; label: string; onClick: () => void; collapsed?: boolean }) {
  return (
    <button
      className={`group flex w-full items-center rounded-lg border py-2.5 text-left text-sm font-semibold transition-all ${collapsed ? 'justify-center px-2' : 'gap-3 px-3'} ${active ? 'border-primary/35 bg-primary/14 text-primary shadow-[0_8px_20px_rgba(79,141,255,0.24)]' : 'border-transparent text-white/58 hover:border-white/10 hover:bg-white/[0.06] hover:text-white'}`}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded-md border ${active ? 'border-primary/35 bg-primary/15' : 'border-white/10 bg-white/[0.03]'} transition-all`}>
        <Icon size={16} />
      </div>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button className="btn-ghost border-white/15 bg-white/[0.04]" onClick={onClick} disabled={loading}>
      <RefreshCcw className={loading ? 'animate-spin' : ''} size={16} />
      Refresh
    </button>
  )
}

export function StatusPill({ ok, trueLabel, falseLabel }: { ok: boolean; trueLabel: string; falseLabel: string }) {
  return ok ? (
    <span className="status-success"><CheckCircle2 size={14} className="mr-1" />{trueLabel}</span>
  ) : (
    <span className="status-primary"><XCircle size={14} className="mr-1" />{falseLabel}</span>
  )
}

export function StatusCode({ code }: { code: number | null }) {
  if (!code) return <span className="status-primary">Pending</span>
  if (code >= 500) return <span className="status-error">{code}</span>
  if (code >= 400) return <span className="status-warning">{code}</span>
  return <span className="status-success">{code}</span>
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label text-white/60">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  )
}

export function Alert({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' }) {
  const className = tone === 'good'
    ? 'border-primary/30 bg-primary/10 text-primary'
    : tone === 'bad'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-white/10 bg-white/5 text-white/80'
  return <div className={`mb-4 rounded-xl border p-3 text-sm backdrop-blur-xl ${className}`}>{children}</div>
}

export function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-b border-white/5 text-xs uppercase text-white/40">
          <tr>{headers.map(header => <th key={header} className="py-3 pr-4 last:pr-0">{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function EmptyState({ icon: Icon, message }: { icon: typeof Activity; message: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-white/40">
      <Icon size={28} />
      <p>{message}</p>
    </div>
  )
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="rounded-2xl border border-white/12 bg-[#0f1728]/80 px-8 py-6 text-center backdrop-blur-xl">
        <Loader2 className="mx-auto animate-spin text-primary" size={32} />
        <p className="mt-3 text-sm text-white/65">Loading command center...</p>
      </div>
    </div>
  )
}

export function FullWidthLoading() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] shadow-[0_16px_32px_rgba(5,10,24,0.35)] backdrop-blur-xl">
      <Loader2 className="animate-spin text-primary" size={30} />
    </div>
  )
}
