import { useLocation } from "react-router-dom"
import { Menu, Sun, Moon, Search } from "lucide-react"

interface HeaderProps {
  onMenuClick: () => void
  theme: "dark" | "light"
  onThemeToggle: () => void
}

const routeTitles: Record<string, { title: string; description: string }> = {
  "/overview": { title: "Overview", description: "Monitor system health and metrics" },
  "/access": { title: "API Access", description: "Manage API keys and access controls" },
  "/limits": { title: "Daily Limits", description: "Configure usage limits per key" },
  "/logs": { title: "Request Logs", description: "View and filter request history" },
  "/providers": { title: "Model Control", description: "Configure AI providers and models" },
  "/playground": { title: "API Playground", description: "Test API requests interactively" },
  "/vnc": { title: "VNC Viewer", description: "Remote browser access" },
  "/docs": { title: "API Documentation", description: "REST API reference and examples" },
  "/admins": { title: "Admin Users", description: "Manage administrator accounts" },
  "/settings": { title: "Settings", description: "System configuration and preferences" },
}

export function Header({ onMenuClick, theme, onThemeToggle }: HeaderProps) {
  const location = useLocation()
  const page = routeTitles[location.pathname] || { title: "Dashboard", description: "" }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/12 bg-background-secondary/88 px-4 backdrop-blur-xl md:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="rounded-xl p-2.5 text-white/65 transition-all hover:bg-white/[0.06] hover:text-white lg:hidden"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
          <h1 className="truncate text-base font-semibold leading-tight text-white">{page.title}</h1>
          <p className="hidden text-xs text-white/50 sm:block">{page.description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Search hint */}
        <button className="hidden items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2 text-sm text-white/55 transition-all hover:bg-white/[0.08] hover:text-white/85 md:flex">
          <Search size={16} />
          <span className="text-xs">Search</span>
          <kbd className="hidden rounded border border-white/12 bg-white/[0.04] px-1.5 py-0.5 text-[10px] lg:inline">/</kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          className="rounded-xl p-2.5 text-white/65 transition-all hover:bg-white/[0.06] hover:text-white"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  )
}