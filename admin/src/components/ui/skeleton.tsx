import * as React from "react"
import { cn } from "~/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "rect" | "circle" | "text"
  width?: string | number
  height?: string | number
}

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, variant = "rect", width, height, style, ...props }, ref) => {
    const variantStyles = {
      rect: "rounded-lg",
      circle: "rounded-full",
      text: "rounded h-4",
    }

    return (
      <div
        ref={ref}
        className={cn("skeleton", variantStyles[variant], className)}
        style={{ width, height, ...style }}
        {...props}
      />
    )
  }
)
Skeleton.displayName = "Skeleton"

export { Skeleton }