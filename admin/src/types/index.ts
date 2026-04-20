export interface Admin {
  id: string
  username: string
  role: 'super_admin' | 'admin'
  createdAt: string
  lastLogin: string | null
  mustChangePassword: boolean
  permissions?: Permission[]
}

export type Permission =
  | 'dashboard:read'
  | 'keys:manage'
  | 'logs:read'
  | 'admins:manage'
  | 'config:manage'
  | 'providers:manage'
  | 'playground:use'

export interface ApiKey {
  id: string
  keyPrefix: string
  name: string
  dailyLimit: number
  rateLimitPerMin: number
  requestsToday: number
  totalRequests: number
  lastUsed: string | null
  createdAt: string
  active: boolean
  createdBy: string
}

export interface RequestLog {
  id: string
  apiKeyId: string | null
  apiKeyName: string | null
  provider: string
  model: string
  messagesCount: number
  stream: boolean
  statusCode: number | null
  responseTimeMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  tokensUsed: number | null
  error: string | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export interface AuditLog {
  id: string
  adminId: string | null
  adminUsername: string | null
  action: string
  entityType: string
  entityId: string | null
  ipAddress: string | null
  userAgent: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface Metrics {
  totalRequests: number
  requestsLast5min: number
  activeApiKeys: number
  providers: ProviderMetric[]
  hourlyData: HourlyData[]
  timestamp: string
}

export interface ProviderMetric {
  name: string
  count: number
  avgResponseTime: number
}

export interface HourlyData {
  hour: string
  count: number
}

export interface Stats {
  overview: OverviewStats
  byProvider: ProviderStat[]
  byModel: ModelStat[]
  hourlyData: HourlyData[]
  providerDistribution: DistributionItem[]
  recentErrors: RecentError[]
}

export interface OverviewStats {
  totalRequests: number
  requestsLast1h: number
  requestsLast24h: number
  requestsLast7d: number
  avgResponseTime: number
  errorCount: number
  errorRate: string
  totalTokens: number
  promptTokens: number
  completionTokens: number
  tokensLast24h: number
}

export interface ProviderStat {
  provider: string
  count: number
  avgResponseTime: number
  totalTokens: number
}

export interface ModelStat {
  model: string
  count: number
  totalTokens: number
}

export interface RecentError {
  id: string
  provider: string
  model: string
  statusCode: number | null
  error: string | null
  createdAt: string
}

export interface DistributionItem {
  name: string
  value: number
}

export interface UsageSummary {
  keys: KeyUsage[]
  summary: {
    totalUsage: number
    totalLimit: number
    usagePercent: number
    activeKeys: number
    tokensToday: number
    totalTokens: number
  }
}

export interface KeyUsage {
  id: string
  name: string
  dailyLimit: number
  requestsToday: number
  tokensToday: number
  totalTokens: number
  requestsTodayReset: string
  active: boolean
  usagePercent: number
}

export interface Config {
  host: string
  port: number
  profileBaseDir: string
  headless: boolean
  logLevel: 'silent' | 'info' | 'debug'
  apiKeysConfigured: Record<string, boolean>
  admin: {
    dbPath: string
    tokenTtlSeconds: number
    requireApiKey: boolean
    logRetentionDays: number
    corsOrigin: string
    jwtSecretConfigured: boolean
  }
  vnc: {
    enabled: boolean
    internalUrl: string
    proxyPath: string
  }
}

export interface Health {
  status: string
  uptime: number
  clients: number
  timestamp: string
}

export interface LoginResponse {
  token: string
  admin: Admin
  permissions: Permission[]
  expiresAt: string
  expiresIn: string
}

export interface ProviderStatus {
  name: string
  connected: boolean
  hasProfile: boolean
  sessionValid: boolean
  models: string[]
}

export interface VncInfo {
  enabled: boolean
  host: string
  port: number
  path: string
  url: string
}

export interface ModelUsage {
  requests: number
  totalTokens: number
  avgResponseTime: number
  errorCount: number
  lastUsed: string | null
}

export interface ModelCatalogItem {
  id: string
  provider: string
  displayName: string
  owned_by: string
  status?: ProviderStatus
  usage: ModelUsage
}

export interface ModelCatalog {
  vnc: VncInfo
  providers: ProviderStatus[]
  models: ModelCatalogItem[]
  apiKeysConfigured: Record<string, boolean>
}

export interface PlaygroundMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface PlaygroundRequest {
  model: string
  messages: PlaygroundMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  newConversation?: boolean
}

export interface PlaygroundResponse {
  id: string
  object: 'chat.completion'
  model: string
  provider: string
  masterApi: boolean
  limited: boolean
  loggedAs: string
  choices: Array<{
    index: number
    message: { role: 'assistant'; content: string }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface BridgeStatus {
  running: boolean
  port: number
  version: string
  providers: ProviderStatus[]
  uptime: number
}
