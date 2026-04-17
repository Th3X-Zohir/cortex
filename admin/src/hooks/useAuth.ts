import * as React from "react"
import { useNavigate } from "react-router-dom"
import { api } from "~/lib/api"
import type { Admin } from "~/types"

interface UseAuthReturn {
  admin: Admin | null
  loading: boolean
  login: (username: string, password: string, persist: boolean) => Promise<void>
  logout: () => Promise<void>
  refreshAdmin: () => Promise<void>
}

export function useAuth(initialAdmin: Admin | null): UseAuthReturn {
  const navigate = useNavigate()
  const [admin, setAdmin] = React.useState<Admin | null>(initialAdmin)
  const [loading, setLoading] = React.useState(false)

  const login = React.useCallback(async (username: string, password: string, persist: boolean) => {
    setLoading(true)
    try {
      const result = await api.auth.login(username, password)
      const storage = persist ? localStorage : sessionStorage
      storage.setItem("cortex_admin_token", result.token)
      setAdmin(result.admin)
      navigate("/overview", { replace: true })
    } finally {
      setLoading(false)
    }
  }, [navigate])

  const logout = React.useCallback(async () => {
    try {
      await api.auth.logout()
    } catch {
      // ignore
    }
    sessionStorage.removeItem("cortex_admin_token")
    localStorage.removeItem("cortex_admin_token")
    setAdmin(null)
    navigate("/login", { replace: true })
  }, [navigate])

  const refreshAdmin = React.useCallback(async () => {
    try {
      const me = await api.auth.me()
      setAdmin(me)
    } catch {
      setAdmin(null)
    }
  }, [])

  return { admin, loading, login, logout, refreshAdmin }
}