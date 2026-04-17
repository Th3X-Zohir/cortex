import * as React from "react"
import { ChevronUp, ChevronDown } from "lucide-react"
import { cn } from "~/lib/utils"

interface Column<T> {
  key: string
  header: string
  sortable?: boolean
  render?: (row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyField: keyof T
  onRowClick?: (row: T) => void
  emptyMessage?: string
  loading?: boolean
  className?: string
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyField,
  onRowClick,
  emptyMessage = "No data available",
  loading,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null)
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc")

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sorted = React.useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === "asc" ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  return (
    <div className={cn("w-full overflow-x-auto rounded-xl border border-border", className)}>
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b border-border bg-background-secondary">
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={cn(
                  "h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                  col.sortable && "cursor-pointer select-none hover:text-foreground transition-colors",
                  col.className
                )}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border">
                {columns.map(col => (
                  <td key={col.key} className="p-4">
                    <div className="skeleton h-4 rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-8 text-center text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, idx) => (
              <tr
                key={String(row[keyField])}
                className={cn(
                  "border-b border-border transition-colors",
                  "hover:bg-muted/30",
                  onRowClick && "cursor-pointer",
                  idx === sorted.length - 1 && "border-b-0"
                )}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={col.key} className={cn("p-4 align-middle", col.className)}>
                    {col.render ? col.render(row) : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}