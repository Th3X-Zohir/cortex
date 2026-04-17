export interface Admin {
  id: string
  username: string
  role: 'super_admin' | 'admin'
  createdAt: string
  lastLogin: string | null
}

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
  apiKeyId: string
  apiKeyName: string
  provider: string
  model: string
  messagesCount: number
  stream: boolean
  statusCode: number | null
  responseTimeMs: number | null
  tokensUsed: number | null
  error: string | null
  ipAddress: string | null
  userAgent: string | null
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
}

export interface OverviewStats {
  totalRequests: number
  requestsLast1h: number
  requestsLast24h: number
  requestsLast7d: number
  avgResponseTime: number
  errorCount: number
  errorRate: string
}

export interface ProviderStat {
  provider: string
  count: number
  avgResponseTime: number
}

export interface ModelStat {
  model: string
  count: number
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
  }
}

export interface KeyUsage {
  id: string
  name: string
  dailyLimit: number
  requestsToday: number
  requestsTodayReset: string
  active: boolean
  usagePercent: number
}

export interface Config {
  'default-model'?: string
  'max-tokens'?: number
  'temperature'?: number
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
  expiresIn: string
}
