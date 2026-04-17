import * as React from "react"
import { NavLink } from "react-router-dom"
import {
  X, BarChart3, KeyRound, Gauge, Activity, Cpu, TerminalSquare,
  Monitor, BookOpen, Users, Settings, ShieldCheck, LogOut
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
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] lg:hidden",
          "bg-[#0a0a0a]/95 backdrop-blur-xl border-r border-white/5",
          "transform transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl border border-primary/20 bg-primary/10">
              <ShieldCheck size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-base bg-gradient-to-r from-primary to-[hsl(270,80%,60%)] bg-clip-text text-transparent">Cortex</h1>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Admin</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/40 hover:bg-white/5 hover:text-white transition-all"
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
                "hover:bg-white/5",
                isActive
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-white/50 hover:text-white"
              )}
            >
              <Icon size={20} className="shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User panel */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/5">
          {admin && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                {admin.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{admin.username}</p>
                <p className="text-xs text-white/40 capitalize">{admin.role.replace('_', ' ')}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => { onLogout(); onClose() }}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/40 hover:text-destructive hover:bg-white/5 transition-all"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}