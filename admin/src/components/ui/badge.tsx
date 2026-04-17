import * as React from "react"
import { cn } from "~/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error" | "info" | "outline"
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    const variants: Record<string, string> = {
      default: "bg-primary/15 text-primary border-primary/30",
      success: "bg-success/15 text-success border-success/30",
      warning: "bg-warning/15 text-warning border-warning/30",
      error: "bg-destructive/15 text-destructive border-destructive/30",
      info: "bg-info/15 text-info border-info/30",
      outline: "bg-transparent text-foreground border-border",
    }
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          variants[variant],
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export { Badge }