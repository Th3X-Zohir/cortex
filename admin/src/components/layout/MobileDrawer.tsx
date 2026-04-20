import * as React from "react"
import { NavLink } from "react-router-dom"
import {
  X, BarChart3, KeyRound, Gauge, Activity, Cpu, TerminalSquare,
  Monitor, BookOpen, Users, Settings, LogOut
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
          className="fixed inset-0 z-40 bg-black/72 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] lg:hidden",
          "border-r border-white/12 bg-background-secondary/95 backdrop-blur-xl",
          "transform transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/12 px-5">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Cortex Admin" className="h-9 w-auto" />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/48 transition-all hover:bg-white/[0.06] hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="h-[calc(100vh-180px)] space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                "hover:bg-white/[0.06]",
                isActive
                  ? "border border-primary/30 bg-primary/14 text-primary-light"
                  : "text-white/62 hover:text-white"
              )}
            >
              <Icon size={20} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User panel */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/12 p-4">
          {admin && (
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/12 text-sm font-semibold text-primary-light">
                {admin.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{admin.username}</p>
                <p className="text-xs capitalize text-white/48">{admin.role.replace('_', ' ')}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => { onLogout(); onClose() }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/52 transition-all hover:bg-white/[0.06] hover:text-destructive"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}