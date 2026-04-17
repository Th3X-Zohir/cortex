import type {
  Admin,
  ApiKey,
  Config,
  Health,
  LoginResponse,
  Metrics,
  RequestLog,
  Stats,
  UsageSummary,
} from '@/types'

const API_BASE = '/api'

class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('cortex_admin_token')

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  const data = await response.json()

  if (!response.ok) {
    throw new ApiError(
      data.error || 'Request failed',
      data.code || 'UNKNOWN_ERROR',
      response.status
    )
  }

  return data
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),

    logout: () =>
      request('/auth/logout', { method: 'POST' }),

    me: () => request<Admin>('/auth/me'),
  },

  admin: {
    keys: {
      list: () => request<ApiKey[]>('/admin/keys'),

      create: (data: { name: string; dailyLimit?: number; rateLimitPerMin?: number }) =>
        request<{ id: string; key: string; name: string }>('/admin/keys', {
          method: 'POST',
          body: JSON.stringify(data),
        }),

      update: (id: string, data: Partial<ApiKey>) =>
        request(`/admin/keys/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        }),

      delete: (id: string) =>
        request(`/admin/keys/${id}`, { method: 'DELETE' }),
    },

    usage: () => request<UsageSummary>('/admin/usage'),
  },

  logs: {
    list: (params?: {
      limit?: number
      offset?: number
      provider?: string
      search?: string
    }) => {
      const searchParams = new URLSearchParams()
      if (params?.limit) searchParams.set('limit', String(params.limit))
      if (params?.offset) searchParams.set('offset', String(params.offset))
      if (params?.provider) searchParams.set('provider', params.provider)
      if (params?.search) searchParams.set('search', params.search)
      return request<{ logs: RequestLog[]; pagination: { total: number } }>(
        `/logs?${searchParams}`
      )
    },
  },

  stats: {
    get: () => request<Stats>('/stats'),
  },

  config: {
    get: () => request<Config>('/config'),
    set: (config: Config) =>
      request('/config', {
        method: 'POST',
        body: JSON.stringify(config),
      }),
  },

  health: () => request<Health>('/health'),
}

export { ApiError }
