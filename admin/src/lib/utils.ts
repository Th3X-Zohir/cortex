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

export function formatPercent(num: number): string {
  return `${num.toFixed(1)}%`
}
