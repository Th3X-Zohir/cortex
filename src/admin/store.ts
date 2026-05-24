import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hashPassword, hashApiKey } from './auth.js';
import type {
  ProviderName,
  ProviderAccountRecord,
  AccountStatus,
  AccountCooldownConfig,
  AccountFailureReason,
} from '../types.js';

export interface AdminRecord {
  id: string;
  username: string;
  password_hash: string;
  role: 'super_admin' | 'admin';
  created_at: string;
  last_login: string | null;
  must_change_password: number;
}

export interface ApiKeyRecord {
  id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  daily_limit: number;
  rate_limit_per_min: number;
  active: number;
  created_by: string;
  created_at: string;
  last_used: string | null;
  total_requests: number;
}

export interface RequestLogRecord {
  id: string;
  api_key_id: string | null;
  api_key_name: string | null;
  provider: string;
  model: string;
  messages_count: number;
  stream: number;
  status_code: number | null;
  response_time_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  tokens_used: number | null;
  error: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_payload: string | null;
  response_payload: string | null;
  account_id: string | null;
  account_label: string | null;
  created_at: string;
}

export interface DailyUsageRecord {
  api_key_id: string;
  date: string;
  request_count: number;
}

export interface AuditLogRecord {
  id: string;
  admin_id: string | null;
  admin_username: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: string | null;
  created_at: string;
}

export interface LogFilters {
  limit?: number;
  offset?: number;
  provider?: string;
  search?: string;
  status_code?: number;
  api_key_id?: string;
  from?: string;
  to?: string;
}

export interface CreateApiKeyResult {
  id: string;
  key: string;
  name: string;
  keyPrefix: string;
}

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  status: 'active' | 'suspended';
  created_at: string;
  last_login: string | null;
}

export interface UserKeyRequestRecord {
  id: string;
  user_id: string;
  user_username: string;
  name: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  api_key_id: string | null;
  revealed_key: string | null;
  reviewed_by_admin_id: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 1000,
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used TEXT,
  total_requests INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  api_key_id TEXT,
  api_key_name TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  messages_count INTEGER NOT NULL DEFAULT 0,
  stream INTEGER NOT NULL DEFAULT 0,
  status_code INTEGER,
  response_time_ms INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  tokens_used INTEGER,
  error TEXT,
  ip_address TEXT,
  user_agent TEXT,
  request_payload TEXT,
  response_payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_usage (
  api_key_id TEXT NOT NULL,
  date TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, date)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  admin_username TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_logs_api_key_id ON request_logs(api_key_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs(admin_id);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE TABLE IF NOT EXISTS user_key_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_username TEXT NOT NULL,
  name TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  api_key_id TEXT,
  revealed_key TEXT,
  reviewed_by_admin_id TEXT,
  review_note TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_key_requests_user_id ON user_key_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_key_requests_status ON user_key_requests(status);

CREATE TABLE IF NOT EXISTS provider_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  profile_dir TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'unknown',
  cooldown_until TEXT,
  last_used_at TEXT,
  last_error TEXT,
  error_count_24h INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  display_slot INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT,
  notes TEXT,
  UNIQUE(provider, label)
);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_provider ON provider_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_provider_accounts_enabled ON provider_accounts(enabled);

CREATE TABLE IF NOT EXISTS provider_account_settings (
  provider TEXT PRIMARY KEY,
  rate_limited_seconds INTEGER NOT NULL DEFAULT 300,
        unusual_activity_seconds INTEGER NOT NULL DEFAULT 43200,
  session_expired_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export class AdminStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
    this.migrate();
    this.seedDefaults();
  }

  private migrate(): void {
    this.ensureColumn('request_logs', 'prompt_tokens', 'INTEGER');
    this.ensureColumn('request_logs', 'completion_tokens', 'INTEGER');
    this.ensureColumn('request_logs', 'total_tokens', 'INTEGER');
    this.ensureColumn('request_logs', 'request_payload', 'TEXT');
    this.ensureColumn('request_logs', 'response_payload', 'TEXT');
    this.ensureColumn('request_logs', 'account_id', 'TEXT');
    this.ensureColumn('request_logs', 'account_label', 'TEXT');
    // Lower priority number = picked first when LRU-ranking healthy accounts.
    this.ensureColumn('provider_accounts', 'priority', 'INTEGER NOT NULL DEFAULT 100');
    // display_slot: 0..9 = dedicated Xvfb slot (display :100+slot, ws port 6081+slot)
    //               null = no slot, uses the shared :99 display
    this.ensureColumn('provider_accounts', 'display_slot', 'INTEGER');
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some(c => c.name === column)) {
      this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  }

  private seedDefaults(): void {
    const existing = this.db.prepare('SELECT COUNT(*) as count FROM admins').get() as { count: number };
    if (existing.count === 0) {
      const username = process.env.CORTEX_ADMIN_USERNAME || 'admin';
      const password = process.env.CORTEX_ADMIN_PASSWORD || 'admin';
      const id = randomUUID();
      const pwHash = hashPassword(password);
      this.db.prepare(
        'INSERT INTO admins (id, username, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?)'
      ).run(id, username, pwHash, 'super_admin', process.env.CORTEX_ADMIN_PASSWORD ? 0 : 1);
      if (process.env.CORTEX_ADMIN_PASSWORD) {
        console.log(`[cortex:admin] Initial admin created — username: ${username}`);
      } else {
        console.log('[cortex:admin] Default admin created — username: admin, password: admin (CHANGE IMMEDIATELY)');
      }
    }
  }

  close(): void {
    this.db.close();
  }

  get raw(): Database.Database {
    return this.db;
  }

  // ── Admin CRUD ───────────────────────────────────────────────────────

  getAdminByUsername(username: string): AdminRecord | undefined {
    return this.db.prepare('SELECT * FROM admins WHERE username = ?').get(username) as AdminRecord | undefined;
  }

  getAdminById(id: string): AdminRecord | undefined {
    return this.db.prepare('SELECT * FROM admins WHERE id = ?').get(id) as AdminRecord | undefined;
  }

  listAdmins(): Omit<AdminRecord, 'password_hash'>[] {
    return this.db.prepare('SELECT id, username, role, created_at, last_login, must_change_password FROM admins ORDER BY created_at DESC').all() as Omit<AdminRecord, 'password_hash'>[];
  }

  createAdmin(username: string, password: string, role: 'super_admin' | 'admin', createdBy: string): AdminRecord {
    const id = randomUUID();
    const pwHash = hashPassword(password);
    this.db.prepare(
      'INSERT INTO admins (id, username, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 0)'
    ).run(id, username, pwHash, role);
    return this.getAdminById(id)!;
  }

  updateAdminRole(id: string, role: 'super_admin' | 'admin'): void {
    this.db.prepare('UPDATE admins SET role = ? WHERE id = ?').run(role, id);
  }

  updateAdminPassword(id: string, newPassword: string): void {
    const pwHash = hashPassword(newPassword);
    this.db.prepare('UPDATE admins SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(pwHash, id);
  }

  updateAdminLastLogin(id: string): void {
    this.db.prepare('UPDATE admins SET last_login = datetime(\'now\') WHERE id = ?').run(id);
  }

  deleteAdmin(id: string): void {
    this.db.prepare('DELETE FROM admins WHERE id = ?').run(id);
  }

  countSuperAdmins(exceptId?: string): number {
    if (exceptId) {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM admins WHERE role = ? AND id != ?').get('super_admin', exceptId) as { count: number };
      return row.count;
    }
    const row = this.db.prepare('SELECT COUNT(*) as count FROM admins WHERE role = ?').get('super_admin') as { count: number };
    return row.count;
  }

  // ── API Key CRUD ─────────────────────────────────────────────────────

  createApiKey(name: string, dailyLimit: number, rateLimitPerMin: number, createdBy: string): CreateApiKeyResult {
    const id = randomUUID();
    const rawKey = `ctx_${randomUUID().replace(/-/g, '')}`;
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 8);

    this.db.prepare(
      'INSERT INTO api_keys (id, key_hash, key_prefix, name, daily_limit, rate_limit_per_min, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, keyHash, keyPrefix, name, dailyLimit, rateLimitPerMin, createdBy);

    return { id, key: rawKey, name, keyPrefix };
  }

  listApiKeys(): ApiKeyRecord[] {
    return this.db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as ApiKeyRecord[];
  }

  getApiKeyById(id: string): ApiKeyRecord | undefined {
    return this.db.prepare('SELECT * FROM api_keys WHERE id = ?').get(id) as ApiKeyRecord | undefined;
  }

  getApiKeyByHash(keyHash: string): ApiKeyRecord | undefined {
    return this.db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(keyHash) as ApiKeyRecord | undefined;
  }

  updateApiKey(id: string, updates: { name?: string; daily_limit?: number; rate_limit_per_min?: number; active?: boolean }): void {
    const sets: string[] = [];
    const vals: any[] = [];
    if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
    if (updates.daily_limit !== undefined) { sets.push('daily_limit = ?'); vals.push(updates.daily_limit); }
    if (updates.rate_limit_per_min !== undefined) { sets.push('rate_limit_per_min = ?'); vals.push(updates.rate_limit_per_min); }
    if (updates.active !== undefined) { sets.push('active = ?'); vals.push(updates.active ? 1 : 0); }
    if (sets.length === 0) return;
    vals.push(id);
    this.db.prepare(`UPDATE api_keys SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  deleteApiKey(id: string): void {
    this.db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  }

  // ── API Key Validation (used by cortex proxy) ────────────────────────

  validateApiKey(rawKey: string): { valid: boolean; key?: ApiKeyRecord; reason?: string; statusCode?: number } {
    const keyHash = hashApiKey(rawKey);
    const key = this.getApiKeyByHash(keyHash);
    if (!key) return { valid: false, reason: 'Invalid API key', statusCode: 401 };
    if (!key.active) return { valid: false, key, reason: 'API key is disabled', statusCode: 403 };

    const today = new Date().toISOString().slice(0, 10);
    const usage = this.getDailyUsage(key.id, today);
    if (usage >= key.daily_limit) return { valid: false, key, reason: 'Daily limit exceeded', statusCode: 429 };

    const rateOk = this.checkRateLimit(key.id, key.rate_limit_per_min);
    if (!rateOk) return { valid: false, key, reason: 'Rate limit exceeded', statusCode: 429 };

    return { valid: true, key };
  }

  incrementKeyUsage(apiKeyId: string): void {
    const today = new Date().toISOString().slice(0, 10);
    this.db.prepare(
      'INSERT INTO daily_usage (api_key_id, date, request_count) VALUES (?, ?, 1) ON CONFLICT(api_key_id, date) DO UPDATE SET request_count = request_count + 1'
    ).run(apiKeyId, today);
    this.db.prepare('UPDATE api_keys SET total_requests = total_requests + 1, last_used = datetime(\'now\') WHERE id = ?').run(apiKeyId);
  }

  getDailyUsage(apiKeyId: string, date: string): number {
    const row = this.db.prepare('SELECT request_count FROM daily_usage WHERE api_key_id = ? AND date = ?').get(apiKeyId, date) as { request_count: number } | undefined;
    return row?.request_count ?? 0;
  }

  checkRateLimit(apiKeyId: string, limitPerMin: number): boolean {
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString().slice(0, 19).replace('T', ' ');
    const row = this.db.prepare('SELECT COUNT(*) as count FROM request_logs WHERE api_key_id = ? AND created_at > ?').get(apiKeyId, oneMinAgo) as { count: number };
    return row.count < limitPerMin;
  }

  // ── Request Logs ─────────────────────────────────────────────────────

  logRequest(log: Omit<RequestLogRecord, 'id' | 'created_at' | 'request_payload' | 'response_payload' | 'account_id' | 'account_label'> & { request_payload?: string | null; response_payload?: string | null; account_id?: string | null; account_label?: string | null }): void {
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO request_logs (id, api_key_id, api_key_name, provider, model, messages_count, stream, status_code, response_time_ms, prompt_tokens, completion_tokens, total_tokens, tokens_used, error, ip_address, user_agent, request_payload, response_payload, account_id, account_label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      id,
      log.api_key_id,
      log.api_key_name,
      log.provider,
      log.model,
      log.messages_count,
      log.stream,
      log.status_code,
      log.response_time_ms,
      log.prompt_tokens,
      log.completion_tokens,
      log.total_tokens,
      log.tokens_used ?? log.total_tokens,
      log.error,
      log.ip_address,
      log.user_agent,
      log.request_payload ?? null,
      log.response_payload ?? null,
      log.account_id ?? null,
      log.account_label ?? null,
    );
  }

  getRequestLogs(filters: LogFilters): { logs: RequestLogRecord[]; total: number } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.provider) { conditions.push('provider = ?'); params.push(filters.provider); }
    if (filters.status_code) { conditions.push('status_code = ?'); params.push(filters.status_code); }
    if (filters.api_key_id) { conditions.push('api_key_id = ?'); params.push(filters.api_key_id); }
    if (filters.search) {
      conditions.push('(model LIKE ? OR api_key_name LIKE ? OR error LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }
    if (filters.from) { conditions.push('created_at >= ?'); params.push(filters.from); }
    if (filters.to) { conditions.push('created_at <= ?'); params.push(filters.to); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const totalRow = this.db.prepare(`SELECT COUNT(*) as total FROM request_logs ${where}`).get(...params) as { total: number };
    const logs = this.db.prepare(`SELECT * FROM request_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as RequestLogRecord[];

    return { logs, total: totalRow.total };
  }

  // ── Stats / Metrics ──────────────────────────────────────────────────

  getStats(): {
    overview: {
      totalRequests: number;
      requestsLast1h: number;
      requestsLast24h: number;
      requestsLast7d: number;
      avgResponseTime: number;
      errorCount: number;
      blockedCount: number;
      errorRate: string;
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
      tokensLast24h: number;
    };
    byProvider: { provider: string; count: number; avgResponseTime: number; totalTokens: number }[];
    byModel: { model: string; count: number; totalTokens: number }[];
    hourlyData: { hour: string; count: number; totalTokens: number }[];
    recentErrors: { id: string; provider: string; model: string; statusCode: number | null; error: string | null; createdAt: string }[];
  } {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM request_logs').get() as any).c;
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString().slice(0, 19).replace('T', ' ');
    const oneDayAgo = new Date(Date.now() - 86400_000).toISOString().slice(0, 19).replace('T', ' ');
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 19).replace('T', ' ');

    const r1h = (this.db.prepare('SELECT COUNT(*) as c FROM request_logs WHERE created_at > ?').get(oneHourAgo) as any).c;
    const r24h = (this.db.prepare('SELECT COUNT(*) as c FROM request_logs WHERE created_at > ?').get(oneDayAgo) as any).c;
    const r7d = (this.db.prepare('SELECT COUNT(*) as c FROM request_logs WHERE created_at > ?').get(sevenDaysAgo) as any).c;
    const avgRt = (this.db.prepare('SELECT AVG(response_time_ms) as a FROM request_logs WHERE response_time_ms IS NOT NULL').get() as any).a ?? 0;
    const errCount = (this.db.prepare('SELECT COUNT(*) as c FROM request_logs WHERE status_code >= 500 OR (status_code < 400 AND error IS NOT NULL)').get() as any).c;
    const blockedCount = (this.db.prepare('SELECT COUNT(*) as c FROM request_logs WHERE status_code >= 400 AND status_code < 500').get() as any).c;
    const tokenTotals = this.db.prepare(
      'SELECT COALESCE(SUM(prompt_tokens), 0) as prompt, COALESCE(SUM(completion_tokens), 0) as completion, COALESCE(SUM(total_tokens), 0) as total FROM request_logs'
    ).get() as { prompt: number; completion: number; total: number };
    const tokens24h = (this.db.prepare('SELECT COALESCE(SUM(total_tokens), 0) as total FROM request_logs WHERE created_at > ?').get(oneDayAgo) as any).total ?? 0;

    const byProvider = this.db.prepare('SELECT provider, COUNT(*) as count, AVG(response_time_ms) as avgResponseTime, COALESCE(SUM(total_tokens), 0) as totalTokens FROM request_logs GROUP BY provider ORDER BY count DESC').all() as any[];
    const byModel = this.db.prepare('SELECT model, COUNT(*) as count, COALESCE(SUM(total_tokens), 0) as totalTokens FROM request_logs GROUP BY model ORDER BY count DESC LIMIT 20').all() as any[];
    const hourlyData = this.db.prepare(
      `SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, COUNT(*) as count, COALESCE(SUM(total_tokens), 0) as totalTokens FROM request_logs WHERE created_at > ? GROUP BY hour ORDER BY hour`
    ).all(sevenDaysAgo) as any[];
    const recentErrors = this.db.prepare(
      `SELECT id, provider, model, status_code as statusCode, error, created_at as createdAt
       FROM request_logs
       WHERE status_code >= 500 OR (status_code < 400 AND error IS NOT NULL)
       ORDER BY created_at DESC
       LIMIT 8`
    ).all() as any[];

    return {
      overview: {
        totalRequests: total,
        requestsLast1h: r1h,
        requestsLast24h: r24h,
        requestsLast7d: r7d,
        avgResponseTime: Math.round(avgRt),
        errorCount: errCount,
        blockedCount,
        errorRate: total > 0 ? ((errCount / total) * 100).toFixed(1) + '%' : '0%',
        totalTokens: tokenTotals.total,
        promptTokens: tokenTotals.prompt,
        completionTokens: tokenTotals.completion,
        tokensLast24h: tokens24h,
      },
      byProvider,
      byModel,
      hourlyData,
      recentErrors,
    };
  }

  getUsageSummary(): {
    keys: { id: string; name: string; dailyLimit: number; requestsToday: number; tokensToday: number; totalTokens: number; requestsTodayReset: string; active: boolean; usagePercent: number }[];
    summary: { totalUsage: number; totalLimit: number; usagePercent: number; activeKeys: number; tokensToday: number; totalTokens: number };
  } {
    const today = new Date().toISOString().slice(0, 10);
    const keys = this.db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all() as ApiKeyRecord[];

    const keyUsages = keys.map(k => {
      const usage = this.getDailyUsage(k.id, today);
      const tokenRow = this.db.prepare(
        `SELECT COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN total_tokens ELSE 0 END), 0) as tokensToday,
                COALESCE(SUM(total_tokens), 0) as totalTokens
         FROM request_logs
         WHERE api_key_id = ?`
      ).get(k.id) as { tokensToday: number; totalTokens: number };
      return {
        id: k.id,
        name: k.name,
        dailyLimit: k.daily_limit,
        requestsToday: usage,
        tokensToday: tokenRow.tokensToday,
        totalTokens: tokenRow.totalTokens,
        requestsTodayReset: new Date(Date.now() + (24 - new Date().getHours()) * 3600_000).toISOString(),
        active: k.active === 1,
        usagePercent: k.daily_limit > 0 ? Math.round((usage / k.daily_limit) * 100) : 0,
      };
    });

    const totalUsage = keyUsages.reduce((s, k) => s + k.requestsToday, 0);
    const totalLimit = keyUsages.reduce((s, k) => s + k.dailyLimit, 0);
    const tokensToday = keyUsages.reduce((s, k) => s + k.tokensToday, 0);
    const totalTokens = keyUsages.reduce((s, k) => s + k.totalTokens, 0);
    const activeKeys = keyUsages.filter(k => k.active).length;

    return {
      keys: keyUsages,
      summary: { totalUsage, totalLimit, usagePercent: totalLimit > 0 ? Math.round((totalUsage / totalLimit) * 100) : 0, activeKeys, tokensToday, totalTokens },
    };
  }

  getModelUsage(): Record<string, { requests: number; totalTokens: number; avgResponseTime: number; errorCount: number; blockedCount: number; lastUsed: string | null }> {
    const rows = this.db.prepare(
      `SELECT model,
              COUNT(*) as requests,
              COALESCE(SUM(total_tokens), 0) as totalTokens,
              COALESCE(AVG(response_time_ms), 0) as avgResponseTime,
              SUM(CASE WHEN status_code >= 500 OR (status_code < 400 AND error IS NOT NULL) THEN 1 ELSE 0 END) as errorCount,
              SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) as blockedCount,
              MAX(created_at) as lastUsed
       FROM request_logs
       GROUP BY model`
    ).all() as Array<{ model: string; requests: number; totalTokens: number; avgResponseTime: number; errorCount: number; blockedCount: number; lastUsed: string | null }>;

    return Object.fromEntries(rows.map(row => [row.model, {
      requests: row.requests,
      totalTokens: row.totalTokens,
      avgResponseTime: Math.round(row.avgResponseTime),
      errorCount: row.errorCount,
      blockedCount: row.blockedCount,
      lastUsed: row.lastUsed,
    }]));
  }

  pruneLogs(olderThanDays: number = 90): number {
    const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString().slice(0, 19).replace('T', ' ');
    const result = this.db.prepare('DELETE FROM request_logs WHERE created_at < ?').run(cutoff);
    return result.changes;
  }

  // ── Admin Audit Logs ─────────────────────────────────────────────────

  logAuditEvent(event: Omit<AuditLogRecord, 'id' | 'created_at'>): void {
    const id = randomUUID();
    this.db.prepare(
      `INSERT INTO audit_logs (id, admin_id, admin_username, action, entity_type, entity_id, ip_address, user_agent, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      id,
      event.admin_id,
      event.admin_username,
      event.action,
      event.entity_type,
      event.entity_id,
      event.ip_address,
      event.user_agent,
      event.metadata,
    );
  }

  getAuditLogs(filters: { limit?: number; offset?: number; search?: string; admin_id?: string }): { logs: AuditLogRecord[]; total: number } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.admin_id) { conditions.push('admin_id = ?'); params.push(filters.admin_id); }
    if (filters.search) {
      conditions.push('(admin_username LIKE ? OR action LIKE ? OR entity_type LIKE ? OR metadata LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const totalRow = this.db.prepare(`SELECT COUNT(*) as total FROM audit_logs ${where}`).get(...params) as { total: number };
    const logs = this.db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as AuditLogRecord[];

    return { logs, total: totalRow.total };
  }

  // ── User CRUD ────────────────────────────────────────────────────────

  getUserByUsername(username: string): UserRecord | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRecord | undefined;
  }

  getUserByEmail(email: string): UserRecord | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRecord | undefined;
  }

  getUserById(id: string): UserRecord | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
  }

  createUser(username: string, email: string, password: string): UserRecord {
    const id = randomUUID();
    const pwHash = hashPassword(password);
    this.db.prepare(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(id, username, email.toLowerCase(), pwHash);
    return this.getUserById(id)!;
  }

  updateUserLastLogin(id: string): void {
    this.db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(id);
  }

  updateUserStatus(id: string, status: 'active' | 'suspended'): void {
    this.db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
  }

  listUsers(): Omit<UserRecord, 'password_hash'>[] {
    return this.db.prepare(
      'SELECT id, username, email, status, created_at, last_login FROM users ORDER BY created_at DESC'
    ).all() as Omit<UserRecord, 'password_hash'>[];
  }

  // ── User Key Requests ────────────────────────────────────────────────

  createUserKeyRequest(userId: string, userUsername: string, name: string, reason: string | null): UserKeyRequestRecord {
    const id = randomUUID();
    this.db.prepare(
      'INSERT INTO user_key_requests (id, user_id, user_username, name, reason) VALUES (?, ?, ?, ?, ?)'
    ).run(id, userId, userUsername, name, reason ?? null);
    return this.getKeyRequestById(id)!;
  }

  getUserKeyRequests(userId: string): UserKeyRequestRecord[] {
    return this.db.prepare(
      'SELECT * FROM user_key_requests WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as UserKeyRequestRecord[];
  }

  getAllKeyRequests(filters: { status?: string; limit?: number; offset?: number } = {}): { requests: UserKeyRequestRecord[]; total: number } {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const totalRow = this.db.prepare(`SELECT COUNT(*) as total FROM user_key_requests ${where}`).get(...params) as { total: number };
    const requests = this.db.prepare(`SELECT * FROM user_key_requests ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as UserKeyRequestRecord[];
    return { requests, total: totalRow.total };
  }

  getKeyRequestById(id: string): UserKeyRequestRecord | undefined {
    return this.db.prepare('SELECT * FROM user_key_requests WHERE id = ?').get(id) as UserKeyRequestRecord | undefined;
  }

  approveKeyRequest(
    id: string,
    adminId: string,
    dailyLimit: number,
    rateLimitPerMin: number,
    reviewNote: string | null,
  ): { request: UserKeyRequestRecord; rawKey: string } {
    const req = this.getKeyRequestById(id);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'pending') throw new Error('Request is not pending');

    const created = this.createApiKey(req.name, dailyLimit, rateLimitPerMin, adminId);
    this.db.prepare(
      `UPDATE user_key_requests
       SET status = 'approved', api_key_id = ?, revealed_key = ?, reviewed_by_admin_id = ?,
           review_note = ?, reviewed_at = datetime('now')
       WHERE id = ?`
    ).run(created.id, created.key, adminId, reviewNote ?? null, id);

    return { request: this.getKeyRequestById(id)!, rawKey: created.key };
  }

  rejectKeyRequest(id: string, adminId: string, reviewNote: string | null): void {
    const req = this.getKeyRequestById(id);
    if (!req) throw new Error('Request not found');
    if (req.status !== 'pending') throw new Error('Request is not pending');
    this.db.prepare(
      `UPDATE user_key_requests
       SET status = 'rejected', reviewed_by_admin_id = ?, review_note = ?, reviewed_at = datetime('now')
       WHERE id = ?`
    ).run(adminId, reviewNote ?? null, id);
  }

  getUserApprovedKeys(userId: string): Array<ApiKeyRecord & { request_id: string; daily_usage: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const rows = this.db.prepare(
      `SELECT ak.*, ukr.id as request_id
       FROM api_keys ak
       JOIN user_key_requests ukr ON ukr.api_key_id = ak.id
       WHERE ukr.user_id = ? AND ukr.status = 'approved'
       ORDER BY ak.created_at DESC`
    ).all(userId) as Array<ApiKeyRecord & { request_id: string }>;
    return rows.map(row => ({
      ...row,
      daily_usage: this.getDailyUsage(row.id, today),
    }));
  }

  getUserKeyStats(userId: string): { totalRequests: number; requestsToday: number; totalTokens: number; tokensToday: number } {
    const keyIds = this.getUserApprovedKeys(userId).map(k => k.id);
    if (keyIds.length === 0) return { totalRequests: 0, requestsToday: 0, totalTokens: 0, tokensToday: 0 };
    const placeholders = keyIds.map(() => '?').join(',');
    const row = this.db.prepare(
      `SELECT
         COUNT(*) as totalRequests,
         SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) as requestsToday,
         COALESCE(SUM(total_tokens), 0) as totalTokens,
         COALESCE(SUM(CASE WHEN date(created_at) = date('now') THEN total_tokens ELSE 0 END), 0) as tokensToday
       FROM request_logs WHERE api_key_id IN (${placeholders})`
    ).get(...keyIds) as { totalRequests: number; requestsToday: number; totalTokens: number; tokensToday: number };
    return row;
  }

  getUserRequestLogs(userId: string, filters: LogFilters = {}): { logs: RequestLogRecord[]; total: number } {
    const keyIds = this.getUserApprovedKeys(userId).map(k => k.id);
    if (keyIds.length === 0) return { logs: [], total: 0 };
    const placeholders = keyIds.map(() => '?').join(',');
    const conditions: string[] = [`api_key_id IN (${placeholders})`];
    const params: unknown[] = [...keyIds];
    if (filters.provider) { conditions.push('provider = ?'); params.push(filters.provider); }
    if (filters.search) {
      conditions.push('(model LIKE ? OR api_key_name LIKE ? OR error LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;
    const totalRow = this.db.prepare(`SELECT COUNT(*) as total FROM request_logs ${where}`).get(...params) as { total: number };
    const logs = this.db.prepare(`SELECT * FROM request_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as RequestLogRecord[];
    return { logs, total: totalRow.total };
  }

  getUserDetail(id: string): {
    user: Omit<UserRecord, 'password_hash'>;
    requests: UserKeyRequestRecord[];
    keys: Array<ApiKeyRecord & { request_id: string; daily_usage: number }>;
    stats: { totalRequests: number; requestsToday: number; totalTokens: number; tokensToday: number };
  } | undefined {
    const user = this.db.prepare(
      'SELECT id, username, email, status, created_at, last_login FROM users WHERE id = ?'
    ).get(id) as Omit<UserRecord, 'password_hash'> | undefined;
    if (!user) return undefined;
    const requests = this.getUserKeyRequests(id);
    const keys = this.getUserApprovedKeys(id);
    const stats = this.getUserKeyStats(id);
    return { user, requests, keys, stats };
  }

  deleteUser(id: string): void {
    const keys = this.getUserApprovedKeys(id);
    for (const k of keys) {
      this.db.prepare('UPDATE api_keys SET active = 0 WHERE id = ?').run(k.id);
    }
    this.db.prepare('DELETE FROM user_key_requests WHERE user_id = ?').run(id);
    this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }

  resetUserPassword(id: string, newPassword: string): void {
    const pwHash = hashPassword(newPassword);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(pwHash, id);
  }

  issueKeyToUser(userId: string, userUsername: string, name: string, dailyLimit: number, rateLimitPerMin: number, adminId: string): { request: UserKeyRequestRecord; rawKey: string } {
    const reqId = randomUUID();
    this.db.prepare(
      "INSERT INTO user_key_requests (id, user_id, user_username, name, reason, status) VALUES (?, ?, ?, ?, 'Issued directly by admin', 'pending')"
    ).run(reqId, userId, userUsername, name);
    return this.approveKeyRequest(reqId, adminId, dailyLimit, rateLimitPerMin, 'Issued directly by admin');
  }

  // ── Provider account CRUD ─────────────────────────────────────────────────

  listProviderAccounts(provider?: ProviderName): ProviderAccountRecord[] {
    const sql = provider
      ? 'SELECT * FROM provider_accounts WHERE provider = ? ORDER BY created_at ASC'
      : 'SELECT * FROM provider_accounts ORDER BY provider, created_at ASC';
    const rows = (provider
      ? this.db.prepare(sql).all(provider)
      : this.db.prepare(sql).all()) as ProviderAccountRecord[];
    return rows;
  }

  getProviderAccountById(id: string): ProviderAccountRecord | undefined {
    return this.db.prepare('SELECT * FROM provider_accounts WHERE id = ?').get(id) as ProviderAccountRecord | undefined;
  }

  getProviderAccountByLabel(provider: ProviderName, label: string): ProviderAccountRecord | undefined {
    return this.db.prepare('SELECT * FROM provider_accounts WHERE provider = ? AND label = ?').get(provider, label) as ProviderAccountRecord | undefined;
  }

  createProviderAccount(args: {
    provider: ProviderName;
    label: string;
    profile_dir: string;
    created_by: string | null;
    notes?: string | null;
  }): ProviderAccountRecord {
    const id = randomUUID();
    const display_slot = this.allocateDisplaySlot();
    this.db.prepare(
      `INSERT INTO provider_accounts (id, provider, label, profile_dir, enabled, status, created_by, notes, display_slot)
       VALUES (?, ?, ?, ?, 1, 'unknown', ?, ?, ?)`
    ).run(id, args.provider, args.label, args.profile_dir, args.created_by ?? null, args.notes ?? null, display_slot);
    return this.getProviderAccountById(id)!;
  }

  /**
   * Pick the lowest unused display slot (0..9). Returns null if all slots are
   * taken — the account will run on the shared :99 display, with the trade-off
   * that the Browsers page can't show it as a distinct iframe.
   */
  private allocateDisplaySlot(maxSlots: number = 10): number | null {
    const rows = this.db.prepare('SELECT display_slot FROM provider_accounts WHERE display_slot IS NOT NULL').all() as { display_slot: number }[];
    const used = new Set(rows.map(r => r.display_slot));
    for (let i = 0; i < maxSlots; i++) {
      if (!used.has(i)) return i;
    }
    return null;
  }

  /** Backfill display_slot for existing accounts that don't have one yet. */
  backfillDisplaySlots(maxSlots: number = 10): void {
    const rows = this.db.prepare('SELECT id, display_slot FROM provider_accounts ORDER BY created_at ASC').all() as { id: string; display_slot: number | null }[];
    const used = new Set<number>(rows.filter(r => r.display_slot !== null).map(r => r.display_slot as number));
    for (const r of rows) {
      if (r.display_slot !== null) continue;
      // Find first free slot
      let chosen: number | null = null;
      for (let i = 0; i < maxSlots; i++) {
        if (!used.has(i)) { chosen = i; break; }
      }
      if (chosen === null) break;
      used.add(chosen);
      this.db.prepare('UPDATE provider_accounts SET display_slot = ? WHERE id = ?').run(chosen, r.id);
    }
  }

  updateProviderAccount(id: string, updates: {
    label?: string;
    enabled?: boolean;
    notes?: string | null;
    priority?: number;
  }): void {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (updates.label !== undefined) { sets.push('label = ?'); vals.push(updates.label); }
    if (updates.enabled !== undefined) { sets.push('enabled = ?'); vals.push(updates.enabled ? 1 : 0); }
    if (updates.notes !== undefined) { sets.push('notes = ?'); vals.push(updates.notes); }
    if (updates.priority !== undefined) { sets.push('priority = ?'); vals.push(Math.max(0, Math.floor(updates.priority))); }
    if (sets.length === 0) return;
    vals.push(id);
    this.db.prepare(`UPDATE provider_accounts SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }

  setProviderAccountStatus(
    id: string,
    status: AccountStatus,
    lastError: string | null = null,
  ): void {
    this.db.prepare('UPDATE provider_accounts SET status = ?, last_error = ? WHERE id = ?')
      .run(status, lastError, id);
  }

  markProviderAccountUsed(id: string): void {
    this.db.prepare("UPDATE provider_accounts SET last_used_at = datetime('now') WHERE id = ?").run(id);
  }

  setProviderAccountCooldown(
    id: string,
    cooldownUntil: Date | null,
    reason: AccountFailureReason | null,
    status: AccountStatus,
  ): void {
    const iso = cooldownUntil ? cooldownUntil.toISOString() : null;
    const last_error = reason ?? null;
    this.db.prepare(
      `UPDATE provider_accounts
         SET cooldown_until = ?, status = ?, last_error = ?,
             error_count_24h = error_count_24h + CASE WHEN ? IS NULL THEN 0 ELSE 1 END
         WHERE id = ?`
    ).run(iso, status, last_error, reason, id);
  }

  clearProviderAccountCooldown(id: string): void {
    this.db.prepare("UPDATE provider_accounts SET cooldown_until = NULL, status = 'unknown', last_error = NULL WHERE id = ?").run(id);
  }

  resetProviderAccountErrorCounts(): void {
    // call periodically to age out the 24h rolling counter
    this.db.prepare('UPDATE provider_accounts SET error_count_24h = 0').run();
  }

  deleteProviderAccount(id: string): void {
    this.db.prepare('DELETE FROM provider_accounts WHERE id = ?').run(id);
  }

  // ── Cooldown settings ─────────────────────────────────────────────────────

  getCooldownConfig(provider: ProviderName): AccountCooldownConfig {
    const row = this.db.prepare('SELECT rate_limited_seconds, unusual_activity_seconds, session_expired_seconds FROM provider_account_settings WHERE provider = ?').get(provider) as
      | { rate_limited_seconds: number; unusual_activity_seconds: number; session_expired_seconds: number }
      | undefined;
    return {
      rate_limited_seconds: row?.rate_limited_seconds ?? 300,
      unusual_activity_seconds: 43200,
      session_expired_seconds: row?.session_expired_seconds ?? 0,
    };
  }

  setCooldownConfig(provider: ProviderName, cfg: Partial<AccountCooldownConfig>): void {
    const current = this.getCooldownConfig(provider);
    const next = { ...current, ...cfg, unusual_activity_seconds: 43200 };
    this.db.prepare(
      `INSERT INTO provider_account_settings (provider, rate_limited_seconds, unusual_activity_seconds, session_expired_seconds, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(provider) DO UPDATE SET
         rate_limited_seconds = excluded.rate_limited_seconds,
         unusual_activity_seconds = excluded.unusual_activity_seconds,
         session_expired_seconds = excluded.session_expired_seconds,
         updated_at = excluded.updated_at`
    ).run(provider, next.rate_limited_seconds, next.unusual_activity_seconds, next.session_expired_seconds);
  }
}
