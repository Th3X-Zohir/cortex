import * as React from "react"
import * as ToastPrimitive from "@radix-ui/react-toast"
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react"
import { cn } from "~/lib/utils"

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-4 sm:right-4 sm:max-w-[420px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = "ToastViewport"

const RadixToastProvider = ToastPrimitive.Provider
const RadixToastViewport = ToastViewport

interface ToastItem {
  id: string
  type: "success" | "error" | "warning" | "info"
  title: string
  description?: string
  duration?: number
}

interface ToastContextValue {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, "id">) => void
  removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  Omit<React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root>, "type"> & { type: ToastItem["type"] }
>(({ className, type, children, ...props }, ref) => {
  const icons = {
    success: <CheckCircle2 size={18} className="text-success" />,
    error: <XCircle size={18} className="text-destructive" />,
    warning: <AlertTriangle size={18} className="text-warning" />,
    info: <Info size={18} className="text-info" />,
  }

  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        "group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-card p-4 shadow-xl",
        "transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
        "data-[state=open]:animate-slide-in data-[state=closed]:animate-fade-out",
        className
      )}
      {...props}
    >
      <div className="shrink-0 mt-0.5">{icons[type]}</div>
      <div className="flex-1">{children}</div>
    </ToastPrimitive.Root>
  )
})
Toast.displayName = "Toast"

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold leading-tight", className)}
    {...props}
  />
))
ToastTitle.displayName = "ToastTitle"

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground mt-1", className)}
    {...props}
  />
))
ToastDescription.displayName = "ToastDescription"

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-lg p-1 text-muted-foreground",
      "opacity-0 group-hover:opacity-100 transition-opacity",
      "hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
      className
    )}
    {...props}
  >
    <X size={14} />
  </ToastPrimitive.Close>
))
ToastClose.displayName = "ToastClose"

function ToastContainer({ children }: { children?: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])

  const addToast = React.useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { ...toast, id }])
  }, [])

  const removeToast = React.useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      <RadixToastProvider>
        {children}
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            type={toast.type}
            duration={toast.duration || 4000}
            onOpenChange={open => { if (!open) removeToast(toast.id) }}
          >
            <ToastTitle>{toast.title}</ToastTitle>
            {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
            <ToastClose />
          </Toast>
        ))}
        <RadixToastViewport />
      </RadixToastProvider>
    </ToastContext.Provider>
  )
}

function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastContainer")
  return ctx
}

export {
  ToastContainer,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  useToast,
}