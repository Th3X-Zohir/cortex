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
    <header className="sticky top-0 z-30 flex items-center gap-4 h-16 px-4 md:px-6 border-b border-white/5 bg-[#080808]/80 backdrop-blur-xl">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2.5 rounded-xl text-white/60 hover:bg-white/5 hover:text-white transition-all"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-white leading-tight truncate">{page.title}</h1>
        <p className="text-xs text-white/40 hidden sm:block">{page.description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Search hint */}
        <button className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white/40 text-sm hover:bg-white/10 hover:text-white/80 transition-all">
          <Search size={16} />
          <span className="text-xs">Search</span>
          <kbd className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10">/</kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          className="p-2.5 rounded-xl text-white/60 hover:bg-white/5 hover:text-white transition-all"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  )
}