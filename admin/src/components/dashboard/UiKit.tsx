import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageShell({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Cortex Control Plane</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
          {description ? <p className="max-w-3xl text-sm leading-6 text-slate-600">{description}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </header>
      {children}
    </section>
  )
}

export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('ui-surface', className)}>{children}</section>
}

export function SurfaceHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <div>
        <h2 className="text-base font-semibold text-slate-900 md:text-lg">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {action}
    </header>
  )
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50/80'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50/85'
        : tone === 'bad'
          ? 'border-rose-200 bg-rose-50/85'
          : 'border-slate-200 bg-white/95'

  return (
    <article className={cn('rounded-2xl border p-4 shadow-sm', toneClass)}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-600">{hint}</p> : null}
    </article>
  )
}

export function Chip({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const classes =
    tone === 'good'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : tone === 'bad'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-slate-50 text-slate-700'

  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium', classes)}>{children}</span>
}

export function BusyPanel({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin" />
        {text}
      </div>
    </div>
  )
}

export function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 text-center text-sm text-slate-500">
      {text}
    </div>
  )
}

export function ErrorBanner({ text }: { text: string }) {
  return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{text}</div>
}

export function SuccessBanner({ text }: { text: string }) {
  return <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{text}</div>
}
