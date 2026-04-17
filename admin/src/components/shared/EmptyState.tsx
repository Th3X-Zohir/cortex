import * as React from "react"
import { FileQuestion, Inbox, Search, AlertCircle } from "lucide-react"
import { cn } from "~/lib/utils"

type EmptyVariant = "no-data" | "no-results" | "error" | "inbox"

interface EmptyStateProps {
  variant?: EmptyVariant
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

const icons: Record<EmptyVariant, React.ElementType> = {
  "no-data": FileQuestion,
  "no-results": Search,
  error: AlertCircle,
  inbox: Inbox,
}

export function EmptyState({
  variant = "no-data",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const Icon = icons[variant]

  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-4 py-16 px-6 text-center",
      className
    )}>
      <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center">
        <Icon size={28} className="text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  )
}