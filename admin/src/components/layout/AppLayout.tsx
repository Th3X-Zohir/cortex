import * as React from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { MobileDrawer } from "./MobileDrawer"
import { Header } from "./Header"
import { useTheme } from "~/hooks/useTheme"
import type { Admin } from "~/types"

interface AppLayoutProps {
  admin: Admin | null
  onLogout: () => void
}

export function AppLayout({ admin, onLogout }: AppLayoutProps) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => {
    if (!admin) {
      navigate("/login", { replace: true })
    }
  }, [admin, navigate])

  if (!admin) return null

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(c => !c)}
        admin={admin}
        onLogout={onLogout}
      />

      {/* Mobile drawer */}
      <MobileDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        admin={admin}
        onLogout={onLogout}
      />

      {/* Main content */}
      <div
        className={cn(
          "flex min-h-screen flex-col transition-all duration-300",
          "lg:ml-[280px]",
          sidebarCollapsed && "lg:ml-[72px]"
        )}
      >
        <Header
          onMenuClick={() => setMobileOpen(true)}
          theme={theme}
          onThemeToggle={toggleTheme}
        />

        <main className="flex-1 p-4 md:p-6 lg:p-8">
          <div className="max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ")
}