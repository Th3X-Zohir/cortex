import * as React from "react"
import { NavLink } from "react-router-dom"
import {
  X, BarChart3, KeyRound, Gauge, Activity, Cpu, TerminalSquare,
  Monitor, BookOpen, Users, Settings, Shield
} from "lucide-react"
import { cn } from "~/lib/utils"

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
  admin: { username: string; role: string } | null
  onLogout: () => void
}

const navItems = [
  { to: "/overview", icon: BarChart3, label: "Overview" },
  { to: "/access", icon: KeyRound, label: "API Access" },
  { to: "/limits", icon: Gauge, label: "Daily Limits" },
  { to: "/logs", icon: Activity, label: "Logs" },
  { to: "/providers", icon: Cpu, label: "Model Control" },
  { to: "/playground", icon: TerminalSquare, label: "API Playground" },
  { to: "/vnc", icon: Monitor, label: "VNC Viewer" },
  { to: "/docs", icon: BookOpen, label: "API Docs" },
  { to: "/admins", icon: Users, label: "Admin Users" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const

export function MobileDrawer({ open, onClose, admin, onLogout }: MobileDrawerProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] lg:hidden",
          "bg-background-secondary border-r border-border",
          "transform transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/20 border border-primary/20">
              <Shield size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-base gradient-text">Cortex</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="py-4 px-3 space-y-1 overflow-y-auto h-[calc(100vh-180px)]">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                "hover:bg-muted/50",
                isActive
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={20} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User panel */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          {admin && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {admin.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{admin.username}</p>
                <p className="text-xs text-muted-foreground capitalize">{admin.role}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => { onLogout(); onClose() }}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}