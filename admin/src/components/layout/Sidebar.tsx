import { NavLink, useLocation } from "react-router-dom"
import {
  BarChart3, KeyRound, Gauge, Activity, Cpu, TerminalSquare,
  Monitor, BookOpen, Users, Settings, LogOut, UsersRound
} from "lucide-react"
import { cn } from "~/lib/utils"

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
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

export function Sidebar({ collapsed, admin, onLogout }: SidebarProps) {
  const location = useLocation()

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 hidden h-screen flex-col lg:flex",
        "border-r border-white/12 bg-background-secondary/90 shadow-[0_14px_34px_rgba(4,11,24,0.36)] backdrop-blur-xl",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[280px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex h-16 shrink-0 items-center border-b border-white/12 px-5",
        collapsed ? "justify-center" : "gap-3"
      )}>
        {collapsed ? (
          <img src="/favicon.svg" alt="Cortex Admin" className="h-10 w-10" />
        ) : (
          <img src="/logo.svg" alt="Cortex Admin" className="h-9 w-auto animate-fade-in" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                active
                  ? "border border-primary/30 bg-primary/14 text-primary-light shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  : "text-white/62 hover:bg-white/[0.06] hover:text-white",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span className="animate-fade-in truncate">{label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {/* User panel */}
      <div className={cn(
        "shrink-0 border-t border-white/12 p-4",
        collapsed && "flex justify-center"
      )}>
        {!collapsed && admin ? (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/12 text-sm font-semibold text-primary-light">
              {admin.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{admin.username}</p>
              <p className="text-xs capitalize text-white/48">{admin.role.replace('_', ' ')}</p>
            </div>
            <button
              onClick={onLogout}
              className="rounded-lg p-2 text-white/45 transition-all hover:bg-white/[0.06] hover:text-destructive"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={onLogout}
            className="rounded-lg p-2 text-white/45 transition-all hover:bg-white/[0.06] hover:text-destructive"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  )
}