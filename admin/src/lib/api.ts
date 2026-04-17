import type {
  Admin,
  AuditLog,
  ApiKey,
  BridgeStatus,
  Config,
  Health,
  LoginResponse,
  ModelCatalog,
  PlaygroundRequest,
  PlaygroundResponse,
  RequestLog,
  Stats,
  UsageSummary,
} from '@/types'

const API_BASE = '/api'

function adminToken() {
  return sessionStorage.getItem('cortex_admin_token') || localStorage.getItem('cortex_admin_token')
}

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
  const token = adminToken()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : data.error?.message
    throw new ApiError(
      message || 'Request failed',
      data.code || data.error?.type || 'UNKNOWN_ERROR',
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

    users: {
      list: () => request<Admin[]>('/admin/admins'),
      create: (data: { username: string; password: string; role: Admin['role'] }) =>
        request<Admin>('/admin/admins', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      updateRole: (id: string, role: Admin['role']) =>
        request<Admin>(`/admin/admins/${id}/role`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
        }),
      updatePassword: (id: string, password: string) =>
        request(`/admin/admins/${id}/password`, {
          method: 'PATCH',
          body: JSON.stringify({ password }),
        }),
      delete: (id: string) => request(`/admin/admins/${id}`, { method: 'DELETE' }),
    },
  },

  logs: {
    list: (params?: {
      limit?: number
      offset?: number
      provider?: string
      statusCode?: number
      apiKeyId?: string
      from?: string
      to?: string
      search?: string
    }) => {
      const searchParams = new URLSearchParams()
      if (params?.limit) searchParams.set('limit', String(params.limit))
      if (params?.offset) searchParams.set('offset', String(params.offset))
      if (params?.provider) searchParams.set('provider', params.provider)
      if (params?.statusCode) searchParams.set('statusCode', String(params.statusCode))
      if (params?.apiKeyId) searchParams.set('apiKeyId', params.apiKeyId)
      if (params?.from) searchParams.set('from', params.from)
      if (params?.to) searchParams.set('to', params.to)
      if (params?.search) searchParams.set('search', params.search)
      return request<{ logs: RequestLog[]; pagination: { total: number } }>(
        `/logs?${searchParams}`
      )
    },

    audit: (params?: { limit?: number; offset?: number; search?: string; adminId?: string }) => {
      const searchParams = new URLSearchParams()
      if (params?.limit) searchParams.set('limit', String(params.limit))
      if (params?.offset) searchParams.set('offset', String(params.offset))
      if (params?.search) searchParams.set('search', params.search)
      if (params?.adminId) searchParams.set('adminId', params.adminId)
      return request<{ logs: AuditLog[]; pagination: { total: number } }>(
        `/audit-logs?${searchParams}`
      )
    },

    prune: (olderThanDays: number) =>
      request<{ deleted: number }>('/logs/prune', {
        method: 'POST',
        body: JSON.stringify({ olderThanDays }),
      }),
  },

  stats: {
    get: () => request<Stats>('/stats'),
  },

  config: {
    get: () => request<Config>('/config'),
    set: (config: Partial<Config>) =>
      request<Config>('/config', {
        method: 'POST',
        body: JSON.stringify(config),
      }),
  },

  health: () => request<Health>('/health'),

  playground: {
    chat: (data: PlaygroundRequest) =>
      request<PlaygroundResponse>('/playground/chat', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    stream: async (
      data: PlaygroundRequest,
      handlers: {
        onChunk: (chunk: string) => void
        onDone: (payload: Partial<PlaygroundResponse> & { usage?: PlaygroundResponse['usage'] }) => void
        onError: (message: string) => void
        signal?: AbortSignal
      }
    ) => {
      const token = adminToken()
      const response = await fetch(`${API_BASE}/playground/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...data, stream: true }),
        signal: handlers.signal,
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        const message = typeof payload.error === 'string' ? payload.error : payload.error?.message
        throw new ApiError(message || 'Playground stream failed', payload.code || payload.error?.type || 'STREAM_FAILED', response.status)
      }
      if (!response.body) throw new ApiError('Streaming is not supported by this browser', 'STREAM_UNSUPPORTED', 0)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const event of events) {
          const lines = event.split('\n').filter(line => line.startsWith('data: '))
          for (const line of lines) {
            const raw = line.slice(6).trim()
            if (!raw) continue
            if (raw === '[DONE]') return
            const payload = JSON.parse(raw)
            if (payload.error) {
              handlers.onError(String(payload.error))
              continue
            }
            const chunk = payload.choices?.[0]?.delta?.content
            if (chunk) handlers.onChunk(String(chunk))
            if (payload.usage) handlers.onDone(payload)
          }
        }
      }
    },
  },

  providers: {
    status: () => request<BridgeStatus>('/providers/status'),
    models: () => request<ModelCatalog>('/providers/models'),
    setApiKey: (provider: string, key: string) =>
      request<{ provider: string; configured: boolean }>('/providers/api-keys', {
        method: 'PATCH',
        body: JSON.stringify({ provider, key }),
      }),
    login: (provider: string) =>
      request(`/providers/${provider}/login`, { method: 'POST' }),
    logout: (provider: string) =>
      request(`/providers/${provider}/logout`, { method: 'POST' }),
  },
}

export { ApiError }
