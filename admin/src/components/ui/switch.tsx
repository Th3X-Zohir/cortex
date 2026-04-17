import * as React from "react"
import { cn } from "~/lib/utils"

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLButtonElement>, "type"> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: string
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked, onCheckedChange, label, disabled, ...props }, ref) => {
    return (
      <label className={cn("inline-flex items-center gap-3 cursor-pointer", disabled && "opacity-50 cursor-not-allowed", className)}>
        <button
          ref={ref}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => !disabled && onCheckedChange(!checked)}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent",
            "transition-colors duration-200 ease-in-out",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 focus:ring-offset-background",
            checked ? "bg-primary" : "bg-muted"
          )}
          {...props}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm",
              "transform transition-transform duration-200 ease-in-out",
              checked ? "translate-x-5" : "translate-x-0"
            )}
          />
        </button>
        {label && <span className="text-sm font-medium">{label}</span>}
      </label>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }