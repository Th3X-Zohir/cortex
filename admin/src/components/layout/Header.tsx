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
    <header className="sticky top-0 z-30 flex items-center gap-4 h-16 px-4 md:px-6 border-b border-border bg-background/80 backdrop-blur-xl">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2.5 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold leading-tight truncate">{page.title}</h1>
        <p className="text-xs text-muted-foreground hidden sm:block">{page.description}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Search hint */}
        <button className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-background-secondary border border-border text-muted-foreground text-sm hover:bg-muted transition-colors">
          <Search size={16} />
          <span className="text-xs">Search</span>
          <kbd className="hidden lg:inline text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border">/</kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={onThemeToggle}
          className="p-2.5 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  )
}