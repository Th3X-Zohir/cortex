import { NavLink, useLocation } from "react-router-dom"
import {
  BarChart3, KeyRound, Gauge, Activity, Cpu, TerminalSquare,
  Monitor, BookOpen, Users, Settings, ChevronLeft, ChevronRight,
  LogOut, Shield
} from "lucide-react"
import { cn } from "~/lib/utils"

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  admin: { username: string; role: string } | null
  onLogout: () => void
}

const navItems = [
  { to: "/overview", icon: BarChart3, label: "Overview", permission: "dashboard:read" },
  { to: "/access", icon: KeyRound, label: "API Access", permission: "keys:manage" },
  { to: "/limits", icon: Gauge, label: "Daily Limits", permission: "dashboard:read" },
  { to: "/logs", icon: Activity, label: "Logs", permission: "logs:read" },
  { to: "/providers", icon: Cpu, label: "Model Control", permission: "providers:manage" },
  { to: "/playground", icon: TerminalSquare, label: "API Playground", permission: "playground:use" },
  { to: "/vnc", icon: Monitor, label: "VNC Viewer", permission: "providers:manage" },
  { to: "/docs", icon: BookOpen, label: "API Docs", permission: "dashboard:read" },
  { to: "/admins", icon: Users, label: "Admin Users", permission: "admins:manage" },
  { to: "/settings", icon: Settings, label: "Settings", permission: "config:manage" },
] as const

export function Sidebar({ collapsed, onToggle, admin, onLogout }: SidebarProps) {
  const location = useLocation()

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-screen fixed left-0 top-0 z-40",
        "bg-background-secondary border-r border-border",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[280px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 px-4 border-b border-border shrink-0",
        collapsed ? "justify-center" : "gap-3"
      )}>
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/20 border border-primary/20">
          <Shield size={20} className="text-primary" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="font-bold text-base gradient-text whitespace-nowrap">Cortex</h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to
          return (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                "hover:bg-muted/50",
                active
                  ? "bg-primary/15 text-primary border border-primary/20"
                  : "text-muted-foreground hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon size={20} className="shrink-0" />
              {!collapsed && <span className="animate-fade-in truncate">{label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={cn(
          "absolute -right-3 top-20 z-50",
          "w-6 h-6 rounded-full bg-card border border-border",
          "flex items-center justify-center text-muted-foreground",
          "hover:text-foreground hover:bg-muted transition-all duration-200 shadow-md"
        )}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* User panel */}
      <div className={cn(
        "border-t border-border p-4 shrink-0",
        collapsed && "flex justify-center"
      )}>
        {!collapsed && admin ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/20 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
              {admin.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{admin.username}</p>
              <p className="text-xs text-muted-foreground capitalize">{admin.role}</p>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={onLogout}
            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  )
}