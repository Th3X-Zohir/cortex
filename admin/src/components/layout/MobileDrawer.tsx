import * as React from "react"
import { NavLink } from "react-router-dom"
import {
  X, BarChart3, KeyRound, Gauge, Activity, Cpu, TerminalSquare,
  Monitor, BookOpen, Users, Settings, LogOut, UsersRound
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
  { to: "/accounts", icon: UsersRound, label: "Account Router" },
  { to: "/playground", icon: TerminalSquare, label: "API Playground" },
  { to: "/vnc", icon: Monitor, label: "VNC Viewer" },
  { to: "/docs", icon: BookOpen, label: "API Docs" },
  { to: "/admins", icon: Users, label: "Admin Users" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const

export function MobileDrawer({ open, onClose, admin, onLogout }: MobileDrawerProps) {
  // Lock body scroll while drawer is open.
  React.useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  // ESC closes the drawer.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <>
      {/* Backdrop — always mounted; opacity gates visibility so the click target
          exists during the closing transition (avoids "click-through" flicker). */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/72 backdrop-blur-sm lg:hidden",
          "transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col lg:hidden",
          // Responsive width: bounded but stays inside the viewport on tiny screens.
          "w-[min(280px,85vw)]",
          "border-r border-white/12 bg-background-secondary/95 backdrop-blur-xl",
          "shadow-[0_14px_34px_rgba(4,11,24,0.5)]",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/12 px-5">
          <img src="/logo.svg" alt="Cortex Admin" className="h-9 w-auto" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-2 text-white/65 transition-all hover:bg-white/[0.06] hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation (scrolls if content overflows) */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) => cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "border border-primary/30 bg-primary/20 text-primary-light"
                  : "text-white/70 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              <Icon size={20} className="shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User panel — natural flow, no longer absolute */}
        <div className="shrink-0 border-t border-white/12 p-4">
          {admin && (
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-sm font-semibold text-primary-light">
                {admin.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{admin.username}</p>
                <p className="truncate text-xs capitalize text-white/55">{admin.role.replace('_', ' ')}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => { onLogout(); onClose() }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-white/70 transition-all hover:bg-white/[0.06] hover:text-destructive"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}