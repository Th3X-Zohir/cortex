import { NavLink, useLocation } from "react-router-dom"
import {
  BarChart3, KeyRound, Gauge, Activity, Cpu, TerminalSquare,
  Monitor, BookOpen, Users, Settings, LogOut, ShieldCheck
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
        "hidden lg:flex flex-col h-screen fixed left-0 top-0 z-40",
        "bg-[#0a0a0a]/80 backdrop-blur-xl border-r border-white/5",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-[72px]" : "w-[280px]"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 px-5 border-b border-white/5 shrink-0",
        collapsed ? "justify-center" : "gap-3"
      )}>
        <div className="flex items-center justify-center w-10 h-10 rounded-xl border border-primary/20 bg-primary/10">
          <ShieldCheck size={20} className="text-primary" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="font-bold text-base bg-gradient-to-r from-primary to-[hsl(270,80%,60%)] bg-clip-text text-transparent">Cortex</h1>
            <p className="text-[10px] text-white/40 uppercase tracking-wider">Admin</p>
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
                active
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-white/50 hover:bg-white/5 hover:text-white",
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
        "border-t border-white/5 p-4 shrink-0",
        collapsed && "flex justify-center"
      )}>
        {!collapsed && admin ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full border border-primary/20 bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
              {admin.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{admin.username}</p>
              <p className="text-xs text-white/40 capitalize">{admin.role.replace('_', ' ')}</p>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-white/40 hover:text-destructive hover:bg-white/5 transition-all"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={onLogout}
            className="p-2 rounded-lg text-white/40 hover:text-destructive hover:bg-white/5 transition-all"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  )
}