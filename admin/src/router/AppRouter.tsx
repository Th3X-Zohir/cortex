import * as React from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { AppLayout } from "~/components/layout/AppLayout"
import { ToastContainer } from "~/components/ui/toast"
import { LoginPage } from "~/pages/LoginPage"
import { OverviewPage } from "~/pages/OverviewPage"
import { AccessPage } from "~/pages/AccessPage"
import { LimitsPage } from "~/pages/LimitsPage"
import { LogsPage } from "~/pages/LogsPage"
import { ProvidersPage } from "~/pages/ProvidersPage"
import { AccountsPage } from "~/pages/AccountsPage"
import { PlaygroundPage } from "~/pages/PlaygroundPage"
import { VncPage } from "~/pages/VncPage"
import { DocsPage } from "~/pages/DocsPage"
import { AdminsPage } from "~/pages/AdminsPage"
import { SettingsPage } from "~/pages/SettingsPage"
import type { Admin } from "~/types"
import { api } from "~/lib/api"

function ProtectedRoute({ children, admin }: { children: React.ReactNode; admin: Admin | null }) {
  if (!admin) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AuthRedirect({ admin, children }: { admin: Admin | null; children: React.ReactNode }) {
  if (admin) return <Navigate to="/overview" replace />
  return <>{children}</>
}

export function AppRouter({ admin }: { admin: Admin | null }) {
  return (
    <BrowserRouter>
      <ToastContainer>
        <Routes>
          <Route
            path="/login"
            element={
              <AuthRedirect admin={admin}>
                <LoginPage />
              </AuthRedirect>
            }
          />
          <Route
            element={
              <ProtectedRoute admin={admin}>
                <AppLayout admin={admin} onLogout={async () => {
                  try { await api.auth.logout() } catch {}
                  sessionStorage.removeItem("cortex_admin_token")
                  localStorage.removeItem("cortex_admin_token")
                }} />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/access" element={<AccessPage />} />
            <Route path="/limits" element={<LimitsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="/vnc" element={<VncPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/admins" element={<AdminsPage currentAdmin={admin} />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </ToastContainer>
    </BrowserRouter>
  )
}