import type {
  Admin,
  AuditLog,
  ApiKey,
  BridgeStatus,
  Config,
  CooldownConfig,
  Health,
  LoginResponse,
  ModelCatalog,
  PlaygroundRequest,
  PlaygroundResponse,
  ProviderAccount,
  RequestLog,
  Stats,
  UsageSummary,
  User,
  UserLoginResponse,
  UserKeyRequest,
  UserApiKey,
} from '@/types'

const API_BASE = '/api'

function adminToken() {
  return sessionStorage.getItem('cortex_admin_token') || localStorage.getItem('cortex_admin_token')
}

function userToken() {
  return sessionStorage.getItem('cortex_user_token') || localStorage.getItem('cortex_user_token')
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
  options: RequestInit = {},
  tokenFn: () => string | null = adminToken,
): Promise<T> {
  const token = tokenFn()

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

    userRequests: {
      list: (status?: string) => {
        const params = new URLSearchParams()
        if (status) params.set('status', status)
        return request<{ requests: UserKeyRequest[]; pagination: { total: number } }>(
          `/admin/user-requests?${params}`,
        )
      },
      approve: (id: string, data: { dailyLimit: number; rateLimitPerMin: number; reviewNote?: string }) =>
        request<{ request: UserKeyRequest; rawKey: string }>(`/admin/user-requests/${id}/approve`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      reject: (id: string, reviewNote?: string) =>
        request<{ request: UserKeyRequest }>(`/admin/user-requests/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reviewNote }),
        }),
    },

    portalUsers: {
      list: (params?: { search?: string; status?: string }) => {
        const p = new URLSearchParams()
        if (params?.search) p.set('search', params.search)
        if (params?.status) p.set('status', params.status)
        return request<User[]>(`/admin/users?${p}`)
      },
      detail: (id: string) =>
        request<{
          user: User
          requests: UserKeyRequest[]
          keys: UserApiKey[]
          stats: { totalRequests: number; requestsToday: number; totalTokens: number; tokensToday: number }
        }>(`/admin/users/${id}`),
      delete: (id: string) => request(`/admin/users/${id}`, { method: 'DELETE' }),
      setStatus: (id: string, status: 'active' | 'suspended') =>
        request<User>(`/admin/users/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }),
      resetPassword: (id: string, password: string) =>
        request(`/admin/users/${id}/password`, {
          method: 'PATCH',
          body: JSON.stringify({ password }),
        }),
      issueKey: (id: string, data: { name: string; dailyLimit: number; rateLimitPerMin: number }) =>
        request<{ request: UserKeyRequest; rawKey: string }>(`/admin/users/${id}/keys`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
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
    getCooldown: (provider: string) =>
      request<CooldownConfig>(`/providers/${provider}/cooldown`),
    setCooldown: (provider: string, cfg: Partial<CooldownConfig>) =>
      request<CooldownConfig>(`/providers/${provider}/cooldown`, {
        method: 'PUT',
        body: JSON.stringify(cfg),
      }),
  },
  accounts: {
    list: (provider?: string) => {
      const p = new URLSearchParams()
      if (provider) p.set('provider', provider)
      return request<{ accounts: ProviderAccount[] }>(`/accounts?${p}`)
    },
    create: (data: { provider: string; label: string; notes?: string }) =>
      request<{ account: ProviderAccount }>('/accounts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { label?: string; enabled?: boolean; notes?: string | null; priority?: number }) =>
      request<{ account: ProviderAccount }>(`/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<{ status: string }>(`/accounts/${id}`, { method: 'DELETE' }),
    login: (id: string) =>
      request<{ status: string; account: ProviderAccount }>(`/accounts/${id}/login`, { method: 'POST' }),
    logout: (id: string) =>
      request<{ status: string }>(`/accounts/${id}/logout`, { method: 'POST' }),
    check: (id: string) =>
      request<{ connected: boolean }>(`/accounts/${id}/check`, { method: 'POST' }),
    resetCooldown: (id: string) =>
      request<{ account: ProviderAccount }>(`/accounts/${id}/reset-cooldown`, { method: 'POST' }),
    forceCooldown: (id: string, data: { seconds: number; reason?: 'rate_limited' | 'unusual_activity' }) =>
      request<{ account: ProviderAccount }>(`/accounts/${id}/force-cooldown`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    livePages: (id: string) =>
      request<{ account: ProviderAccount; pages: Array<{ url: string; title: string }> }>(`/accounts/${id}/pages`),
    screenshot: (id: string) =>
      request<{ image: string | null; capturedAt: string }>(`/accounts/${id}/screenshot`),
  },
  browsers: {
    list: () => request<{
      browsers: Array<{
        account: ProviderAccount;
        pages: Array<{ url: string; title: string }>;
        activity: { kind: 'idle' | 'chat' | 'login' | 'restoring' | 'logged_out'; detail?: string; startedAt: number };
      }>;
    }>('/browsers'),
  },

  user: {
    register: (username: string, email: string, password: string) =>
      request<UserLoginResponse>('/user/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password }),
      }),

    login: (login: string, password: string) =>
      request<UserLoginResponse>('/user/login', {
        method: 'POST',
        body: JSON.stringify({ login, password }),
      }),

    me: () => request<User>('/user/me', {}, userToken),

    logout: () => request('/user/logout', { method: 'POST' }, userToken),

    keys: () => request<unknown[]>('/user/keys', {}, userToken),

    keyRequests: () => request<UserKeyRequest[]>('/user/keys/requests', {}, userToken),

    requestKey: (name: string, reason?: string | null) =>
      request<UserKeyRequest>('/user/keys/request', {
        method: 'POST',
        body: JSON.stringify({ name, reason }),
      }, userToken),

    usage: () =>
      request<{
        stats: { totalRequests: number; requestsToday: number; totalTokens: number; tokensToday: number }
        keys: unknown[]
      }>('/user/usage', {}, userToken),

    logs: (params?: { limit?: number; offset?: number; provider?: string; search?: string }) => {
      const searchParams = new URLSearchParams()
      if (params?.limit) searchParams.set('limit', String(params.limit))
      if (params?.offset) searchParams.set('offset', String(params.offset))
      if (params?.provider) searchParams.set('provider', params.provider)
      if (params?.search) searchParams.set('search', params.search)
      return request<{ logs: RequestLog[]; pagination: { total: number } }>(
        `/user/logs?${searchParams}`,
        {},
        userToken,
      )
    },
  },
}

export { ApiError }
