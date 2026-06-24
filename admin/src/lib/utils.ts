import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  // SQLite stores datetimes as "2026-04-25 17:31:21" (space separator).
  // Replace the space with T so the browser parses it as valid ISO 8601.
  const normalized = typeof date === 'string' ? date.replace(' ', 'T') : date
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return String(date)
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

// Compact, human-friendly abbreviation: 91246 -> "91.2K", 165789097 -> "166M".
// Use for high-volume dashboard metrics where exact digits aren't needed.
// Numbers below 1000 are returned as-is (no abbreviation).
export function formatCompact(num: number): string {
  if (!Number.isFinite(num)) return '0'
  if (Math.abs(num) < 1000) return new Intl.NumberFormat('en-US').format(num)
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num)
}

export function formatPercent(num: number): string {
  return `${num.toFixed(1)}%`
}
