import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

type StatusVariant = "success" | "warning" | "error" | "info" | "default"

interface StatusBadgeProps {
  status: string
  variant?: StatusVariant
  pulse?: boolean
  className?: string
}

const statusMap: Record<string, StatusVariant> = {
  active: "success",
  online: "success",
  enabled: "success",
  connected: "success",
  healthy: "success",
  inactive: "warning",
  paused: "warning",
  disabled: "warning",
  pending: "warning",
  expired: "error",
  error: "error",
  failed: "error",
  disconnected: "error",
  offline: "error",
  deleted: "error",
}

export function StatusBadge({ status, variant, pulse, className }: StatusBadgeProps) {
  const resolved = variant || statusMap[status.toLowerCase()] || "default"

  return (
    <Badge
      variant={resolved}
      className={cn(
        pulse && resolved === "success" && "relative",
        className
      )}
    >
      {pulse && resolved === "success" && (
        <span className="absolute inset-0 rounded-full animate-ping opacity-75" />
      )}
      <span className="relative flex items-center gap-1.5">
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          resolved === "success" ? "bg-success" :
          resolved === "warning" ? "bg-warning" :
          resolved === "error" ? "bg-destructive" :
          resolved === "info" ? "bg-info" : "bg-muted-foreground"
        )} />
        {status}
      </span>
    </Badge>
  )
}