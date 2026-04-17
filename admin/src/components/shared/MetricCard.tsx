import * as React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { cn } from "~/lib/utils"

interface MetricCardProps {
  label: string
  value: string | number
  icon: React.ElementType
  trend?: { value: number; label: string }
  description?: string
  className?: string
  iconColor?: string
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  description,
  className,
  iconColor = "text-primary",
}: MetricCardProps) {
  const TrendIcon = trend
    ? trend.value > 0 ? TrendingUp : trend.value < 0 ? TrendingDown : Minus
    : null
  const trendColor = trend
    ? trend.value > 0 ? "text-success" : trend.value < 0 ? "text-destructive" : "text-muted-foreground"
    : ""

  return (
    <div className={cn("panel p-5 flex flex-col gap-4 group hover:border-border-light transition-all duration-300", className)}>
      <div className="flex items-start justify-between">
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
          "bg-primary/10 border border-primary/15"
        )}>
          <Icon size={20} className={iconColor} />
        </div>
        {trend && TrendIcon && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
            <TrendIcon size={12} />
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        {trend && (
          <p className="text-xs text-muted-foreground mt-0.5">{trend.label}</p>
        )}
      </div>
    </div>
  )
}