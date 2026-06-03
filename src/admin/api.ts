import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { BridgeConfig, ChatMessage, ProviderAdapter, ProviderName } from '../types.js';
import { loadConfig, saveConfig } from '../config.js';
import type { ProviderRegistry } from '../registry.js';
import {
  publicAdmin,
  signAdminToken,
  verifyAdminToken,
  verifyPassword,
  type AdminTokenPayload,
  publicUser,
  signUserToken,
  verifyUserToken,
  type UserTokenPayload,
} from './auth.js';
import type { AdminRecord, AdminStore, ApiKeyRecord, RequestLogRecord, AuditLogRecord, UserRecord, UserKeyRequestRecord } from './store.js';
import { ChatGPTProvider } from '../providers/chatgpt.js';
import type { AccountCooldownConfig } from '../types.js';

type Permission =
  | 'dashboard:read'
  | 'keys:manage'
  | 'logs:read'
  | 'admins:manage'
  | 'config:manage'
  | 'providers:manage'
  | 'playground:use';

const ROLE_PERMISSIONS: Record<AdminRecord['role'], Permission[]> = {
  super_admin: ['dashboard:read', 'keys:manage', 'logs:read', 'admins:manage', 'config:manage', 'providers:manage', 'playground:use'],
  admin: ['dashboard:read', 'keys:manage', 'logs:read', 'providers:manage'],
};

const PROVIDERS = new Set(['grok', 'gemini', 'chatgpt']);

interface AdminContext {
  token: AdminTokenPayload;
  admin: AdminRecord;
  permissions: Permission[];
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export class AdminApi {
  constructor(
    private readonly store: AdminStore,
    private readonly registry: ProviderRegistry,
    private cfg: BridgeConfig,
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;

    try {
      if (url.pathname === '/api/auth/login' && req.method === 'POST') {
        await this.login(req, res);
        return true;
      }

      if (url.pathname === '/api/user/register' && req.method === 'POST') {
        await this.userRegister(req, res);
        return true;
      }

      if (url.pathname === '/api/user/login' && req.method === 'POST') {
        await this.userLogin(req, res);
        return true;
      }

      // User-authenticated routes
      if (url.pathname.startsWith('/api/user/')) {
        const userCtx = this.requireUser(req, res);
        if (!userCtx) return true;
        await this.handleUserRoute(req, res, url, userCtx);
        return true;
      }

      const ctx = this.requireAdmin(req, res);
      if (!ctx) return true;

      if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
        this.audit(req, ctx, 'logout', 'auth', ctx.admin.id);
        json(res, 200, { ok: true });
        return true;
      }

      if (url.pathname === '/api/auth/me' && req.method === 'GET') {
        json(res, 200, { ...publicAdmin(ctx.admin), permissions: ctx.permissions });
        return true;
      }

      if (url.pathname === '/api/admin/permissions' && req.method === 'GET') {
        json(res, 200, { rolePermissions: ROLE_PERMISSIONS });
        return true;
      }

      if (url.pathname === '/api/admin/admins' && req.method === 'GET') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        json(res, 200, this.store.listAdmins().map(admin => publicAdmin(admin)));
        return true;
      }

      if (url.pathname === '/api/admin/admins' && req.method === 'POST') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        const body = await readJson(req);
        const username = requireString(body.username, 'username');
        const password = requireString(body.password, 'password');
        const role = body.role === 'super_admin' ? 'super_admin' : 'admin';

        if (password.length < 10) {
          json(res, 400, { error: 'Password must be at least 10 characters', code: 'WEAK_PASSWORD' });
          return true;
        }
        const created = this.store.createAdmin(username, password, role, ctx.admin.id);
        this.audit(req, ctx, 'create_admin', 'admin', created.id, { username, role });
        json(res, 201, publicAdmin(created));
        return true;
      }

      const adminPasswordMatch = url.pathname.match(/^\/api\/admin\/admins\/([^/]+)\/password$/);
      if (adminPasswordMatch && req.method === 'PATCH') {
        if (!this.has(ctx, 'admins:manage') && ctx.admin.id !== adminPasswordMatch[1]) return forbidden(res);
        const body = await readJson(req);
        const password = requireString(body.password, 'password');
        if (password.length < 10) {
          json(res, 400, { error: 'Password must be at least 10 characters', code: 'WEAK_PASSWORD' });
          return true;
        }
        this.store.updateAdminPassword(adminPasswordMatch[1], password);
        this.audit(req, ctx, 'update_admin_password', 'admin', adminPasswordMatch[1]);
        json(res, 200, { ok: true });
        return true;
      }

      const adminRoleMatch = url.pathname.match(/^\/api\/admin\/admins\/([^/]+)\/role$/);
      if (adminRoleMatch && req.method === 'PATCH') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        const target = this.store.getAdminById(adminRoleMatch[1]);
        if (!target) return notFound(res);
        const body = await readJson(req);
        const role = body.role === 'super_admin' ? 'super_admin' : 'admin';
        if (target.role === 'super_admin' && role !== 'super_admin' && this.store.countSuperAdmins(target.id) === 0) {
          json(res, 409, { error: 'At least one super admin is required', code: 'LAST_SUPER_ADMIN' });
          return true;
        }
        this.store.updateAdminRole(target.id, role);
        this.audit(req, ctx, 'update_admin_role', 'admin', target.id, { role });
        json(res, 200, publicAdmin(this.store.getAdminById(target.id)!));
        return true;
      }

      const adminDeleteMatch = url.pathname.match(/^\/api\/admin\/admins\/([^/]+)$/);
      if (adminDeleteMatch && req.method === 'DELETE') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        const target = this.store.getAdminById(adminDeleteMatch[1]);
        if (!target) return notFound(res);
        if (target.id === ctx.admin.id) {
          json(res, 409, { error: 'You cannot delete your own admin account', code: 'SELF_DELETE' });
          return true;
        }
        if (target.role === 'super_admin' && this.store.countSuperAdmins(target.id) === 0) {
          json(res, 409, { error: 'At least one super admin is required', code: 'LAST_SUPER_ADMIN' });
          return true;
        }
        this.store.deleteAdmin(target.id);
        this.audit(req, ctx, 'delete_admin', 'admin', target.id, { username: target.username });
        json(res, 200, { ok: true });
        return true;
      }

      if (url.pathname === '/api/admin/keys' && req.method === 'GET') {
        if (!this.has(ctx, 'keys:manage')) return forbidden(res);
        json(res, 200, this.store.listApiKeys().map(key => this.mapApiKey(key)));
        return true;
      }

      if (url.pathname === '/api/admin/keys' && req.method === 'POST') {
        if (!this.has(ctx, 'keys:manage')) return forbidden(res);
        const body = await readJson(req);
        const name = requireString(body.name, 'name');
        const dailyLimit = asPositiveInteger(body.dailyLimit ?? 1000, 'dailyLimit');
        const rateLimitPerMin = asPositiveInteger(body.rateLimitPerMin ?? 60, 'rateLimitPerMin');
        const created = this.store.createApiKey(name, dailyLimit, rateLimitPerMin, ctx.admin.id);
        this.audit(req, ctx, 'create_api_key', 'api_key', created.id, { name, dailyLimit, rateLimitPerMin });
        json(res, 201, created);
        return true;
      }

      const keyMatch = url.pathname.match(/^\/api\/admin\/keys\/([^/]+)$/);
      if (keyMatch && req.method === 'PATCH') {
        if (!this.has(ctx, 'keys:manage')) return forbidden(res);
        const current = this.store.getApiKeyById(keyMatch[1]);
        if (!current) return notFound(res);
        const body = await readJson(req);
        this.store.updateApiKey(keyMatch[1], {
          ...(body.name !== undefined ? { name: String(body.name) } : {}),
          ...(body.dailyLimit !== undefined ? { daily_limit: asPositiveInteger(body.dailyLimit, 'dailyLimit') } : {}),
          ...(body.rateLimitPerMin !== undefined ? { rate_limit_per_min: asPositiveInteger(body.rateLimitPerMin, 'rateLimitPerMin') } : {}),
          ...(body.active !== undefined ? { active: Boolean(body.active) } : {}),
        });
        this.audit(req, ctx, 'update_api_key', 'api_key', keyMatch[1], {
          fields: Object.keys(body).filter(k => ['name', 'dailyLimit', 'rateLimitPerMin', 'active'].includes(k)),
        });
        json(res, 200, this.mapApiKey(this.store.getApiKeyById(keyMatch[1])!));
        return true;
      }

      if (keyMatch && req.method === 'DELETE') {
        if (!this.has(ctx, 'keys:manage')) return forbidden(res);
        const current = this.store.getApiKeyById(keyMatch[1]);
        if (!current) return notFound(res);
        this.store.deleteApiKey(keyMatch[1]);
        this.audit(req, ctx, 'delete_api_key', 'api_key', keyMatch[1], { name: current.name });
        json(res, 200, { ok: true });
        return true;
      }

      if (url.pathname === '/api/admin/users' && req.method === 'GET') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        const search = url.searchParams.get('search') || undefined;
        const statusFilter = url.searchParams.get('status') || undefined;
        let users = this.store.listUsers();
        if (search) {
          const term = search.toLowerCase();
          users = users.filter(u => u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term));
        }
        if (statusFilter) users = users.filter(u => u.status === statusFilter);
        json(res, 200, users);
        return true;
      }

      const userDetailMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (userDetailMatch && req.method === 'GET') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        const detail = this.store.getUserDetail(userDetailMatch[1]);
        if (!detail) return notFound(res);
        json(res, 200, {
          ...detail,
          requests: detail.requests.map(mapUserKeyRequest),
          keys: detail.keys.map(k => ({
            id: k.id, requestId: k.request_id, keyPrefix: k.key_prefix, name: k.name,
            dailyLimit: k.daily_limit, rateLimitPerMin: k.rate_limit_per_min,
            requestsToday: k.daily_usage, totalRequests: k.total_requests,
            lastUsed: k.last_used, createdAt: k.created_at, active: k.active === 1,
            usagePercent: k.daily_limit > 0 ? Math.round((k.daily_usage / k.daily_limit) * 100) : 0,
          })),
        });
        return true;
      }

      if (userDetailMatch && req.method === 'DELETE') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        const target = this.store.getUserById(userDetailMatch[1]);
        if (!target) return notFound(res);
        this.store.deleteUser(target.id);
        this.audit(req, ctx, 'delete_portal_user', 'user', target.id, { username: target.username });
        json(res, 200, { ok: true });
        return true;
      }

      const userStatusMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
      if (userStatusMatch && req.method === 'PATCH') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        const body = await readJson(req);
        const status = body.status === 'suspended' ? 'suspended' : 'active';
        const target = this.store.getUserById(userStatusMatch[1]);
        if (!target) return notFound(res);
        this.store.updateUserStatus(target.id, status);
        this.audit(req, ctx, `user_status_${status}`, 'user', target.id, { username: target.username });
        json(res, 200, publicUser(this.store.getUserById(target.id)!));
        return true;
      }

      const userPasswordMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/password$/);
      if (userPasswordMatch && req.method === 'PATCH') {
        if (!this.has(ctx, 'admins:manage')) return forbidden(res);
        const body = await readJson(req);
        const password = requireString(body.password, 'password');
        if (password.length < 8) {
          json(res, 400, { error: 'Password must be at least 8 characters', code: 'WEAK_PASSWORD' });
          return true;
        }
        const target = this.store.getUserById(userPasswordMatch[1]);
        if (!target) return notFound(res);
        this.store.resetUserPassword(target.id, password);
        this.audit(req, ctx, 'reset_user_password', 'user', target.id, { username: target.username });
        json(res, 200, { ok: true });
        return true;
      }

      const userIssueKeyMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/keys$/);
      if (userIssueKeyMatch && req.method === 'POST') {
        if (!this.has(ctx, 'keys:manage')) return forbidden(res);
        const body = await readJson(req);
        const name = requireString(body.name, 'name');
        const dailyLimit = asPositiveInteger(body.dailyLimit ?? 1000, 'dailyLimit');
        const rateLimitPerMin = asPositiveInteger(body.rateLimitPerMin ?? 60, 'rateLimitPerMin');
        const target = this.store.getUserById(userIssueKeyMatch[1]);
        if (!target) return notFound(res);
        const { request, rawKey } = this.store.issueKeyToUser(target.id, target.username, name, dailyLimit, rateLimitPerMin, ctx.admin.id);
        this.audit(req, ctx, 'issue_key_to_user', 'user', target.id, { username: target.username, keyName: name });
        json(res, 201, { request: mapUserKeyRequest(request), rawKey });
        return true;
      }

      if (url.pathname === '/api/admin/user-requests' && req.method === 'GET') {
        if (!this.has(ctx, 'keys:manage')) return forbidden(res);
        const statusFilter = url.searchParams.get('status') || undefined;
        const result = this.store.getAllKeyRequests({
          status: statusFilter,
          limit: getNumberParam(url, 'limit', 50),
          offset: getNumberParam(url, 'offset', 0),
        });
        json(res, 200, { requests: result.requests.map(mapUserKeyRequest), pagination: { total: result.total } });
        return true;
      }

      const requestApproveMatch = url.pathname.match(/^\/api\/admin\/user-requests\/([^/]+)\/approve$/);
      if (requestApproveMatch && req.method === 'POST') {
        if (!this.has(ctx, 'keys:manage')) return forbidden(res);
        const body = await readJson(req);
        const dailyLimit = asPositiveInteger(body.dailyLimit ?? 1000, 'dailyLimit');
        const rateLimitPerMin = asPositiveInteger(body.rateLimitPerMin ?? 60, 'rateLimitPerMin');
        const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote.trim() || null : null;
        const { request, rawKey } = this.store.approveKeyRequest(requestApproveMatch[1], ctx.admin.id, dailyLimit, rateLimitPerMin, reviewNote);
        this.audit(req, ctx, 'approve_user_key_request', 'user_key_request', request.id, { userId: request.user_id, keyName: request.name });
        json(res, 200, { request: mapUserKeyRequest(request), rawKey });
        return true;
      }

      const requestRejectMatch = url.pathname.match(/^\/api\/admin\/user-requests\/([^/]+)\/reject$/);
      if (requestRejectMatch && req.method === 'POST') {
        if (!this.has(ctx, 'keys:manage')) return forbidden(res);
        const body = await readJson(req);
        const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote.trim() || null : null;
        this.store.rejectKeyRequest(requestRejectMatch[1], ctx.admin.id, reviewNote);
        const request = this.store.getKeyRequestById(requestRejectMatch[1])!;
        this.audit(req, ctx, 'reject_user_key_request', 'user_key_request', request.id, { userId: request.user_id, keyName: request.name });
        json(res, 200, { request: mapUserKeyRequest(request) });
        return true;
      }

      if (url.pathname === '/api/admin/usage' && req.method === 'GET') {
        if (!this.has(ctx, 'dashboard:read')) return forbidden(res);
        json(res, 200, this.store.getUsageSummary());
        return true;
      }

      if (url.pathname === '/api/logs' && req.method === 'GET') {
        if (!this.has(ctx, 'logs:read')) return forbidden(res);
        const result = this.store.getRequestLogs({
          limit: getNumberParam(url, 'limit', 50),
          offset: getNumberParam(url, 'offset', 0),
          provider: url.searchParams.get('provider') || undefined,
          search: url.searchParams.get('search') || undefined,
          status_code: url.searchParams.get('statusCode') ? Number(url.searchParams.get('statusCode')) : undefined,
          api_key_id: url.searchParams.get('apiKeyId') || undefined,
          from: url.searchParams.get('from') || undefined,
          to: url.searchParams.get('to') || undefined,
        });
        json(res, 200, { logs: result.logs.map(mapRequestLog), pagination: { total: result.total } });
        return true;
      }

      if (url.pathname === '/api/logs/prune' && req.method === 'POST') {
        if (!this.has(ctx, 'config:manage')) return forbidden(res);
        const body = await readJson(req);
        const days = asPositiveInteger(body.olderThanDays ?? this.cfg.admin.logRetentionDays, 'olderThanDays');
        const deleted = this.store.pruneLogs(days);
        this.audit(req, ctx, 'prune_request_logs', 'request_log', null, { olderThanDays: days, deleted });
        json(res, 200, { deleted });
        return true;
      }

      if (url.pathname === '/api/audit-logs' && req.method === 'GET') {
        if (!this.has(ctx, 'logs:read')) return forbidden(res);
        const result = this.store.getAuditLogs({
          limit: getNumberParam(url, 'limit', 50),
          offset: getNumberParam(url, 'offset', 0),
          search: url.searchParams.get('search') || undefined,
          admin_id: url.searchParams.get('adminId') || undefined,
        });
        json(res, 200, { logs: result.logs.map(mapAuditLog), pagination: { total: result.total } });
        return true;
      }

      if (url.pathname === '/api/stats' && req.method === 'GET') {
        if (!this.has(ctx, 'dashboard:read')) return forbidden(res);
        const stats = this.store.getStats();
        json(res, 200, {
          ...stats,
          providerDistribution: stats.byProvider.map(item => ({ name: item.provider, value: item.count })),
        });
        return true;
      }

      if (url.pathname === '/api/providers/status' && req.method === 'GET') {
        if (!this.has(ctx, 'dashboard:read')) return forbidden(res);
        json(res, 200, await this.registry.getStatus());
        return true;
      }

      if (url.pathname === '/api/playground/chat' && req.method === 'POST') {
        if (!this.has(ctx, 'playground:use')) return forbidden(res);
        await this.playgroundChat(req, res, ctx);
        return true;
      }

      if (url.pathname === '/api/providers/models' && req.method === 'GET') {
        if (!this.has(ctx, 'dashboard:read')) return forbidden(res);
        const providerStatus = await this.registry.getStatus();
        const statusByProvider = new Map(providerStatus.providers.map(provider => [provider.name, provider]));
        const usageByModel = this.store.getModelUsage();
        json(res, 200, {
          vnc: this.vncInfo(req),
          providers: providerStatus.providers,
          models: this.registry.allModels().map(model => ({
            ...model,
            status: statusByProvider.get(model.provider),
            usage: usageByModel[model.id] ?? {
              requests: 0,
              totalTokens: 0,
              avgResponseTime: 0,
              errorCount: 0,
              blockedCount: 0,
              lastUsed: null,
            },
          })),
          apiKeysConfigured: Object.fromEntries(Object.entries(loadConfig().apiKeys ?? {}).map(([key, value]) => [key, Boolean(value)])),
        });
        return true;
      }

      if (url.pathname === '/api/providers/api-keys' && req.method === 'PATCH') {
        if (!this.has(ctx, 'providers:manage')) return forbidden(res);
        json(res, 400, { error: 'API providers are disabled', code: 'API_PROVIDERS_DISABLED' });
        return true;
      }

      const providerAction = url.pathname.match(/^\/api\/providers\/([^/]+)\/(login|logout)$/);
      if (providerAction && req.method === 'POST') {
        if (!this.has(ctx, 'providers:manage')) return forbidden(res);
        const provider = providerAction[1] as ProviderName;
        const action = providerAction[2] as 'login' | 'logout';
        if (!PROVIDERS.has(provider)) return notFound(res);
        if (provider.endsWith('-api') && action === 'login') {
          json(res, 400, { error: `${provider} uses API credentials configured on the server`, code: 'API_PROVIDER_NO_BROWSER_LOGIN' });
          return true;
        }
        if (action === 'logout') {
          await this.registry.get(provider).logout();
          this.audit(req, ctx, 'provider_logout', 'provider', provider);
          json(res, 200, { status: 'ok', provider });
        } else {
          const vnc = this.sharedVncInfo();
          void this.registry.get(provider).login(loginUrl => {
            this.audit(req, ctx, 'provider_login_started', 'provider', provider, { loginUrl });
          }).catch(err => {
            this.audit(req, ctx, 'provider_login_failed', 'provider', provider, { error: (err as Error).message });
          });
          json(res, 202, { status: 'login_started', provider, vncUrl: vnc.url, vnc });
        }
        return true;
      }

      // ── Account router (multi-account routing) ───────────────────────────
      // GET /api/accounts?provider=chatgpt — list accounts
      if (url.pathname === '/api/accounts' && req.method === 'GET') {
        if (!this.has(ctx, 'providers:manage')) return forbidden(res);
        const providerFilter = url.searchParams.get('provider') as ProviderName | null;
        if (providerFilter && !PROVIDERS.has(providerFilter)) {
          json(res, 400, { error: `unsupported provider: ${providerFilter}`, code: 'BAD_PROVIDER' });
          return true;
        }
        const rows = this.store.listProviderAccounts(providerFilter ?? undefined);
        json(res, 200, { accounts: rows.map(mapProviderAccount) });
        return true;
      }

      // POST /api/accounts — create a new (logged-out) account
      if (url.pathname === '/api/accounts' && req.method === 'POST') {
        if (!this.has(ctx, 'providers:manage')) return forbidden(res);
        const body = await readJson(req);
        const provider = requireString(body.provider, 'provider') as ProviderName;
        if (!PROVIDERS.has(provider)) {
          json(res, 400, { error: `unsupported provider: ${provider}`, code: 'BAD_PROVIDER' });
          return true;
        }
        const label = requireString(body.label, 'label').trim();
        if (!label) { json(res, 400, { error: 'label cannot be empty', code: 'BAD_LABEL' }); return true; }
        const dup = this.store.getProviderAccountByLabel(provider, label);
        if (dup) { json(res, 409, { error: `label '${label}' already exists for ${provider}`, code: 'DUP_LABEL' }); return true; }
        const tmpId = randomUUID();
        const profileDir = this.poolProvider(provider).defaultProfileDirForId(tmpId);
        const record = this.store.createProviderAccount({
          provider,
          label,
          profile_dir: profileDir,
          created_by: ctx.admin.id,
          notes: body.notes ? String(body.notes) : null,
        });
        this.poolProvider(provider).syncAccountsFromStore();
        this.audit(req, ctx, 'account_create', 'provider_account', record.id, { provider, label });
        json(res, 201, { account: mapProviderAccount(record) });
        return true;
      }

      // GET /api/browsers — aggregated view of every account's live pages + activity
      if (url.pathname === '/api/browsers' && req.method === 'GET') {
        if (!this.has(ctx, 'providers:manage')) return forbidden(res);
        const rows = this.store.listProviderAccounts();
        const result: unknown[] = [];
        for (const row of rows) {
          const provider = row.provider as ProviderName;
          if (!PROVIDERS.has(provider)) {
            result.push({ account: mapProviderAccount(row), pages: [], activity: { kind: 'idle', startedAt: 0 } });
            continue;
          }
          let pages: Array<{ url: string; title: string }> = [];
          let activity: unknown = { kind: 'idle', startedAt: 0 };
          try {
            const pool = this.poolProvider(provider);
            const instance = pool.getAccount(row.id);
            if (instance) pages = await instance.livePages();
            activity = pool.getActivity(row.id);
          } catch { /* not pooled — skip */ }
          result.push({ account: mapProviderAccount(row), pages, activity });
        }
        json(res, 200, { browsers: result });
        return true;
      }

      // GET /api/accounts/:id/screenshot — base64 JPEG of the account's most-recent page.
      // Returned as JSON so JWT auth via Authorization header works (img src can't send headers).
      const screenshotMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)\/screenshot$/);
      if (screenshotMatch && req.method === 'GET') {
        if (!this.has(ctx, 'providers:manage')) return forbidden(res);
        const accountId = screenshotMatch[1];
        const record = this.store.getProviderAccountById(accountId);
        if (!record) return notFound(res);
        const provider = record.provider as ProviderName;
        if (!PROVIDERS.has(provider)) { json(res, 400, { error: 'provider not pooled', code: 'NOT_POOLED' }); return true; }
        let image: string | null = null;
        try {
          const pool = this.poolProvider(provider);
          const instance = pool.getAccount(accountId);
          if (instance) {
            const buf = await instance.screenshot();
            if (buf) image = `data:image/jpeg;base64,${buf.toString('base64')}`;
          }
        } catch (err) {
          json(res, 500, { error: (err as Error).message, code: 'SCREENSHOT_FAILED' });
          return true;
        }
        json(res, 200, { image, capturedAt: new Date().toISOString() });
        return true;
      }

      const accountMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)(?:\/(login|logout|check|reset-cooldown|force-cooldown|pages))?$/);
      if (accountMatch) {
        if (!this.has(ctx, 'providers:manage')) return forbidden(res);
        const accountId = accountMatch[1];
        const action = accountMatch[2] as 'login' | 'logout' | 'check' | 'reset-cooldown' | 'force-cooldown' | 'pages' | undefined;
        const record = this.store.getProviderAccountById(accountId);
        if (!record) return notFound(res);
        const pool = this.poolProvider(record.provider as ProviderName);
        const account = pool.getAccount(accountId);
        if (!account) {
          // pool out of sync; force resync once
          pool.syncAccountsFromStore();
        }
        const accountInstance = pool.getAccount(accountId);
        if (!accountInstance) return notFound(res);

        if (action === 'login' && req.method === 'POST') {
          const vnc = this.accountVncInfo(record.display_slot ?? null);
          void accountInstance.login(loginUrl => {
            this.audit(req, ctx, 'account_login_started', 'provider_account', accountId, { provider: record.provider, label: record.label, loginUrl });
          }).then(() => {
            this.store.setProviderAccountStatus(accountId, 'connected', null);
          }).catch(err => {
            this.store.setProviderAccountStatus(accountId, 'logged_out', (err as Error).message);
            this.audit(req, ctx, 'account_login_failed', 'provider_account', accountId, { error: (err as Error).message });
          });
          json(res, 202, { status: 'login_started', account: mapProviderAccount(record), vncUrl: vnc.url, vnc });
          return true;
        }
        if (action === 'logout' && req.method === 'POST') {
          await accountInstance.logout();
          this.store.setProviderAccountStatus(accountId, 'logged_out', null);
          this.audit(req, ctx, 'account_logout', 'provider_account', accountId);
          json(res, 200, { status: 'ok' });
          return true;
        }
        if (action === 'check' && req.method === 'POST') {
          const ok = await accountInstance.checkSession();
          this.store.setProviderAccountStatus(accountId, ok ? 'connected' : 'logged_out', null);
          json(res, 200, { connected: ok });
          return true;
        }
        if (action === 'pages' && req.method === 'GET') {
          const pages = await accountInstance.livePages();
          json(res, 200, { account: mapProviderAccount(record), pages });
          return true;
        }
        if (action === 'reset-cooldown' && req.method === 'POST') {
          this.store.clearProviderAccountCooldown(accountId);
          pool.syncAccountsFromStore();
          this.audit(req, ctx, 'account_reset_cooldown', 'provider_account', accountId);
          const fresh = this.store.getProviderAccountById(accountId)!;
          json(res, 200, { account: mapProviderAccount(fresh) });
          return true;
        }
        if (action === 'force-cooldown' && req.method === 'POST') {
          const body = await readJson(req).catch(() => ({}));
          const secsRaw = Number(body?.seconds);
          const seconds = Number.isFinite(secsRaw) && secsRaw > 0 ? Math.floor(secsRaw) : 300;
          const reason: 'rate_limited' | 'unusual_activity' = body?.reason === 'unusual_activity' ? 'unusual_activity' : 'rate_limited';
          const until = new Date(Date.now() + seconds * 1000);
          const status = reason === 'unusual_activity' ? 'blocked' : 'cooldown';
          this.store.setProviderAccountCooldown(accountId, until, reason, status);
          pool.syncAccountsFromStore();
          this.audit(req, ctx, 'account_force_cooldown', 'provider_account', accountId, { seconds, reason });
          const fresh = this.store.getProviderAccountById(accountId)!;
          json(res, 200, { account: mapProviderAccount(fresh) });
          return true;
        }
        if (!action && req.method === 'PATCH') {
          const body = await readJson(req);
          const updates: { label?: string; enabled?: boolean; notes?: string | null; priority?: number } = {};
          if (body.label !== undefined) updates.label = String(body.label).trim();
          if (body.enabled !== undefined) updates.enabled = Boolean(body.enabled);
          if (body.notes !== undefined) updates.notes = body.notes === null ? null : String(body.notes);
          if (body.priority !== undefined) {
            const n = Number(body.priority);
            if (!Number.isFinite(n) || n < 0) { json(res, 400, { error: 'priority must be a non-negative integer', code: 'BAD_PRIORITY' }); return true; }
            updates.priority = Math.floor(n);
          }
          if (updates.label !== undefined && updates.label !== record.label) {
            const dup = this.store.getProviderAccountByLabel(record.provider as ProviderName, updates.label);
            if (dup && dup.id !== accountId) {
              json(res, 409, { error: `label '${updates.label}' already exists`, code: 'DUP_LABEL' });
              return true;
            }
          }
          this.store.updateProviderAccount(accountId, updates);
          pool.syncAccountsFromStore();
          this.audit(req, ctx, 'account_update', 'provider_account', accountId, updates);
          const fresh = this.store.getProviderAccountById(accountId)!;
          json(res, 200, { account: mapProviderAccount(fresh) });
          return true;
        }
        if (!action && req.method === 'DELETE') {
          await accountInstance.deleteProfile();
          this.store.deleteProviderAccount(accountId);
          pool.syncAccountsFromStore();
          this.audit(req, ctx, 'account_delete', 'provider_account', accountId, { provider: record.provider, label: record.label });
          json(res, 200, { status: 'ok' });
          return true;
        }
      }

      // GET /api/providers/:provider/cooldown — cooldown settings
      const cooldownMatch = url.pathname.match(/^\/api\/providers\/([^/]+)\/cooldown$/);
      if (cooldownMatch) {
        if (!this.has(ctx, 'providers:manage')) return forbidden(res);
        const provider = cooldownMatch[1] as ProviderName;
        if (!PROVIDERS.has(provider)) { json(res, 400, { error: `unsupported provider: ${provider}`, code: 'BAD_PROVIDER' }); return true; }
        if (req.method === 'GET') {
          json(res, 200, this.store.getCooldownConfig(provider));
          return true;
        }
        if (req.method === 'PUT') {
          const body = await readJson(req);
          const updates: Partial<AccountCooldownConfig> = {};
          if (body.rate_limited_seconds !== undefined) updates.rate_limited_seconds = asPositiveInteger(body.rate_limited_seconds, 'rate_limited_seconds');
          if (body.unusual_activity_seconds !== undefined) updates.unusual_activity_seconds = asPositiveInteger(body.unusual_activity_seconds, 'unusual_activity_seconds');
          if (body.session_expired_seconds !== undefined) {
            const n = Number(body.session_expired_seconds);
            if (!Number.isFinite(n) || n < 0) { json(res, 400, { error: 'session_expired_seconds must be >= 0', code: 'BAD_SECONDS' }); return true; }
            updates.session_expired_seconds = Math.floor(n);
          }
          this.store.setCooldownConfig(provider, updates);
          this.audit(req, ctx, 'cooldown_update', 'provider_settings', provider, updates);
          json(res, 200, this.store.getCooldownConfig(provider));
          return true;
        }
      }

      if (url.pathname === '/api/config' && req.method === 'GET') {
        if (!this.has(ctx, 'config:manage')) return forbidden(res);
        json(res, 200, this.publicConfig());
        return true;
      }

      if (url.pathname === '/api/config' && req.method === 'POST') {
        if (!this.has(ctx, 'config:manage')) return forbidden(res);
        const body = await readJson(req);
        const next = loadConfig();
        const updates: Partial<BridgeConfig> = {
          ...(body.host !== undefined ? { host: String(body.host) } : {}),
          ...(body.port !== undefined ? { port: asPositiveInteger(body.port, 'port') } : {}),
          ...(body.headless !== undefined ? { headless: Boolean(body.headless) } : {}),
          ...(body.logLevel !== undefined ? { logLevel: body.logLevel === 'debug' || body.logLevel === 'silent' ? body.logLevel : 'info' } : {}),
          admin: {
            ...next.admin,
            ...(body.admin?.requireApiKey !== undefined ? { requireApiKey: Boolean(body.admin.requireApiKey) } : {}),
            ...(body.admin?.tokenTtlSeconds !== undefined ? { tokenTtlSeconds: asPositiveInteger(body.admin.tokenTtlSeconds, 'tokenTtlSeconds') } : {}),
            ...(body.admin?.logRetentionDays !== undefined ? { logRetentionDays: asPositiveInteger(body.admin.logRetentionDays, 'logRetentionDays') } : {}),
            ...(body.admin?.corsOrigin !== undefined ? { corsOrigin: String(body.admin.corsOrigin) } : {}),
          },
        };
        saveConfig(updates);
        this.cfg = loadConfig();
        this.audit(req, ctx, 'update_config', 'config', 'runtime', { fields: Object.keys(body) });
        json(res, 200, this.publicConfig());
        return true;
      }

      if (url.pathname === '/api/health' && req.method === 'GET') {
        json(res, 200, { status: 'ok', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
        return true;
      }

      notFound(res);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      json(res, 400, { error: message, code: 'BAD_REQUEST' });
      return true;
    }
  }

  private async login(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    const username = requireString(body.username, 'username');
    const password = requireString(body.password, 'password');
    const admin = this.store.getAdminByUsername(username);

    if (!admin || !verifyPassword(password, admin.password_hash)) {
      this.store.logAuditEvent({
        admin_id: admin?.id ?? null,
        admin_username: username,
        action: 'login_failed',
        entity_type: 'auth',
        entity_id: null,
        ip_address: getIp(req),
        user_agent: getUserAgent(req),
        metadata: null,
      });
      return json(res, 401, { error: 'Invalid username or password', code: 'INVALID_CREDENTIALS' });
    }

    this.store.updateAdminLastLogin(admin.id);
    const refreshed = this.store.getAdminById(admin.id)!;
    const signed = signAdminToken(refreshed, this.cfg);
    this.store.logAuditEvent({
      admin_id: refreshed.id,
      admin_username: refreshed.username,
      action: 'login_success',
      entity_type: 'auth',
      entity_id: refreshed.id,
      ip_address: getIp(req),
      user_agent: getUserAgent(req),
      metadata: null,
    });

    json(res, 200, {
      token: signed.token,
      admin: publicAdmin(refreshed),
      expiresAt: signed.expiresAt,
      expiresIn: signed.expiresIn,
      permissions: ROLE_PERMISSIONS[refreshed.role],
    });
  }

  private requireAdmin(req: IncomingMessage, res: ServerResponse): AdminContext | null {
    const token = extractBearer(req);
    if (!token) {
      json(res, 401, { error: 'Admin authentication required', code: 'ADMIN_AUTH_REQUIRED' });
      return null;
    }

    const payload = verifyAdminToken(token, this.cfg);
    if (!payload) {
      json(res, 401, { error: 'Invalid or expired admin token', code: 'INVALID_ADMIN_TOKEN' });
      return null;
    }

    const admin = this.store.getAdminById(payload.sub);
    if (!admin) {
      json(res, 401, { error: 'Admin account no longer exists', code: 'ADMIN_NOT_FOUND' });
      return null;
    }

    return { token: payload, admin, permissions: ROLE_PERMISSIONS[admin.role] };
  }

  private has(ctx: AdminContext, permission: Permission): boolean {
    return ctx.permissions.includes(permission);
  }

  /**
   * Get the pool-aware provider instance for a given provider name.
   * Currently only 'chatgpt' is account-pooled; other providers will throw.
   */
  private poolProvider(provider: ProviderName): ChatGPTProvider {
    const p = this.registry.get(provider);
    if (!(p instanceof ChatGPTProvider)) {
      throw new Error(`Provider '${provider}' does not yet support multi-account routing`);
    }
    return p;
  }

  private audit(req: IncomingMessage, ctx: AdminContext, action: string, entityType: string, entityId: string | null, metadata?: unknown): void {
    this.store.logAuditEvent({
      admin_id: ctx.admin.id,
      admin_username: ctx.admin.username,
      action,
      entity_type: entityType,
      entity_id: entityId,
      ip_address: getIp(req),
      user_agent: getUserAgent(req),
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  }

  /**
   * Build cortex_meta for a Playground response. Tells the UI which provider
   * + (for chatgpt) which pooled account actually served the request, plus
   * the noVNC viewer URL for the matching display slot so the iframe can
   * follow the real browser session. Returns shared-display fallback for
   * non-pooled web providers (grok/gemini/claude) and null for API providers.
   */
  private buildCortexMeta(
    providerName: string,
    runCtx?: import('../types.js').ChatRunContext,
  ): {
    provider: string;
    accountId: string | null;
    accountLabel: string | null;
    displaySlot: number | null;
    vncPath: string | null;
    hasBrowser: boolean;
  } {
    const apiOnly = providerName.endsWith('-api');
    if (apiOnly) {
      return { provider: providerName, accountId: null, accountLabel: null, displaySlot: null, vncPath: null, hasBrowser: false };
    }
    let displaySlot: number | null = null;
    let accountId: string | null = null;
    let accountLabel: string | null = null;
    if (runCtx?.accountId) {
      accountId = runCtx.accountId;
      accountLabel = runCtx.accountLabel ?? null;
      const rec = this.store.getProviderAccountById(runCtx.accountId);
      if (rec && rec.display_slot !== null && rec.display_slot !== undefined) {
        displaySlot = rec.display_slot;
      }
    }
    const vncPath = displaySlot !== null
      ? `/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=novnc/d${displaySlot}/websockify`
      : '/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=websockify';
    return { provider: providerName, accountId, accountLabel, displaySlot, vncPath, hasBrowser: true };
  }

  private async playgroundChat(req: IncomingMessage, res: ServerResponse, ctx: AdminContext): Promise<void> {
    const startedAt = Date.now();
    const body = await readJson(req);
    const model = requireString(body.model, 'model');
    const messages = requireMessages(body.messages);
    const temperature = body.temperature === undefined ? undefined : Number(body.temperature);
    const maxTokens = body.max_tokens === undefined ? undefined : asPositiveInteger(body.max_tokens, 'max_tokens');
    const newConversation = body.newConversation === undefined ? true : Boolean(body.newConversation);
    const stream = Boolean(body.stream);
    const provider = this.registry.providerForModel(model);
    const providerName = provider?.name ?? 'unknown';

    // Pinning works through either the header (X-Cortex-Account) or a body field
    // (accountLabel) — the playground UI may eventually let admins pick a target.
    const headerPin = ((): string | undefined => {
      const raw = req.headers['x-cortex-account'];
      const v = Array.isArray(raw) ? raw[0] : raw;
      const t = typeof v === 'string' ? v.trim() : '';
      return t || undefined;
    })();
    const bodyPin = typeof body.accountLabel === 'string' && body.accountLabel.trim() ? body.accountLabel.trim() : undefined;
    const runCtx: import('../types.js').ChatRunContext = { pinnedAccountLabel: bodyPin ?? headerPin };

    if (!provider) {
      const errorPayload = { error: `Unknown model: ${model}`, code: 'UNKNOWN_MODEL' };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, stream, 404, startedAt, `Unknown model: ${model}`, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, body, errorPayload, runCtx);
      json(res, 404, errorPayload);
      return;
    }

    if (temperature !== undefined && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
      const errorPayload = { error: 'temperature must be between 0 and 2', code: 'INVALID_TEMPERATURE' };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, stream, 400, startedAt, 'temperature must be between 0 and 2', this.estimateTokenUsage(messages, ''), body, errorPayload, runCtx);
      json(res, 400, errorPayload);
      return;
    }

    const connected = await provider.ensureConnected();
    if (!connected) {
      const error = `${provider.name} is not connected`;
      const errorPayload = { error, code: 'PROVIDER_UNAVAILABLE' };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, stream, 503, startedAt, error, this.estimateTokenUsage(messages, ''), body, errorPayload, runCtx);
      json(res, 503, errorPayload);
      return;
    }

    if (stream) {
      await this.playgroundStream(req, res, ctx, provider, providerName, model, messages, temperature, maxTokens, newConversation, startedAt, body, runCtx);
      return;
    }

    try {
      const content = await provider.chat({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        newConversation,
      }, runCtx);
      const usage = this.tokenUsage(provider, messages, content);
      const cortex_meta = this.buildCortexMeta(providerName, runCtx);
      const responsePayload = {
        id: `admin-playground-${Date.now()}`,
        object: 'chat.completion',
        model,
        provider: providerName,
        masterApi: true,
        limited: false,
        loggedAs: `Admin Playground (${ctx.admin.username})`,
        choices: [{
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        }],
        usage,
        cortex_meta,
      };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, false, 200, startedAt, null, usage, body, responsePayload, runCtx);
      this.audit(req, ctx, 'playground_chat', 'provider', providerName, { model, stream: false, usage });
      json(res, 200, responsePayload);
    } catch (err) {
      const message = (err as Error).message;
      const usage = this.estimateTokenUsage(messages, '');
      const errorPayload = { error: message, code: 'PROVIDER_ERROR' };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, false, 503, startedAt, message, usage, body, errorPayload, runCtx);
      this.audit(req, ctx, 'playground_chat_failed', 'provider', providerName, { model, stream: false, error: message });
      json(res, 503, errorPayload);
    }
  }

  private async playgroundStream(
    req: IncomingMessage,
    res: ServerResponse,
    ctx: AdminContext,
    provider: ProviderAdapter,
    providerName: string,
    model: string,
    messages: ChatMessage[],
    temperature: number | undefined,
    maxTokens: number | undefined,
    newConversation: boolean,
    startedAt: number,
    requestPayload: unknown,
    runCtx?: import('../types.js').ChatRunContext,
  ): Promise<void> {
    const id = `admin-playground-${Date.now()}`;
    const chunks: string[] = [];
    let streamError: string | null = null;
    let responsePayloadForLog: unknown = null;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      for await (const chunk of provider.chatStream({ model, messages, temperature, max_tokens: maxTokens, newConversation }, runCtx)) {
        chunks.push(chunk);
        const cortex_meta = this.buildCortexMeta(providerName, runCtx);
        res.write(`data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          model,
          provider: providerName,
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
          cortex_meta,
        })}\n\n`);
        if ((res as any).flush) (res as any).flush();
      }

      const usage = this.tokenUsage(provider, messages, chunks.join(''));
      const cortex_meta = this.buildCortexMeta(providerName, runCtx);
      res.write(`data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        model,
        provider: providerName,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage,
        loggedAs: `Admin Playground (${ctx.admin.username})`,
        masterApi: true,
        limited: false,
        cortex_meta,
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      responsePayloadForLog = {
        id,
        object: 'chat.completion',
        model,
        provider: providerName,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: chunks.join('') },
          finish_reason: 'stop',
        }],
        usage,
      };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, true, 200, startedAt, null, usage, requestPayload, responsePayloadForLog, runCtx);
      this.audit(req, ctx, 'playground_chat', 'provider', providerName, { model, stream: true, usage });
    } catch (err) {
      streamError = (err as Error).message;
      const usage = this.estimateTokenUsage(messages, chunks.join(''));
      res.write(`data: ${JSON.stringify({ error: streamError, code: 'PROVIDER_ERROR' })}\n\n`);
      responsePayloadForLog = {
        id,
        object: 'chat.completion',
        model,
        provider: providerName,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: chunks.join('') },
          finish_reason: 'error',
        }],
        usage,
        error: { message: streamError, code: 'PROVIDER_ERROR' },
      };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, true, 200, startedAt, streamError, usage, requestPayload, responsePayloadForLog, runCtx);
      this.audit(req, ctx, 'playground_chat_failed', 'provider', providerName, { model, stream: true, error: streamError });
    } finally {
      res.end();
    }
  }

  private logPlaygroundRequest(
    req: IncomingMessage,
    ctx: AdminContext,
    provider: string,
    model: string,
    messagesCount: number,
    stream: boolean,
    statusCode: number,
    startedAt: number,
    error: string | null,
    usage: TokenUsage,
    requestPayload?: unknown,
    responsePayload?: unknown,
    runCtx?: import('../types.js').ChatRunContext,
  ): void {
    this.store.logRequest({
      api_key_id: null,
      api_key_name: `Admin Playground (${ctx.admin.username})`,
      provider,
      model,
      messages_count: messagesCount,
      stream: stream ? 1 : 0,
      status_code: statusCode,
      response_time_ms: Date.now() - startedAt,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      tokens_used: usage.total_tokens,
      error,
      ip_address: getIp(req),
      user_agent: getUserAgent(req),
      request_payload: safeJsonStringify(requestPayload),
      response_payload: safeJsonStringify(responsePayload),
      account_id: runCtx?.accountId ?? null,
      account_label: runCtx?.accountLabel ?? null,
    });
  }

  private tokenUsage(provider: unknown, messages: ChatMessage[], output: string): TokenUsage {
    const fallback = this.estimateTokenUsage(messages, output);
    const meta = provider && typeof provider === 'object' && 'currentMeta' in provider
      ? (provider as any).currentMeta
      : null;
    const raw = typeof meta === 'function' ? meta.call(provider) : meta;
    const prompt = numberOrZero(raw?.inputTokens ?? raw?.promptTokens ?? raw?.prompt_tokens);
    const completion = numberOrZero(raw?.outputTokens ?? raw?.completionTokens ?? raw?.completion_tokens);
    const total = numberOrZero(raw?.totalTokens ?? raw?.total_tokens);

    if (prompt > 0 || completion > 0 || total > 0) {
      return {
        prompt_tokens: prompt || Math.max(0, total - completion),
        completion_tokens: completion || Math.max(0, total - prompt),
        total_tokens: total || prompt + completion,
      };
    }

    return fallback;
  }

  private estimateTokenUsage(messages: ChatMessage[], output: string): TokenUsage {
    const promptText = messages.map(message => `${message.role}\n${message.content}`).join('\n');
    const prompt = estimateTokens(promptText);
    const completion = estimateTokens(output);
    return {
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: prompt + completion,
    };
  }

  private mapApiKey(key: ApiKeyRecord) {
    const today = new Date().toISOString().slice(0, 10);
    return {
      id: key.id,
      keyPrefix: key.key_prefix,
      name: key.name,
      dailyLimit: key.daily_limit,
      rateLimitPerMin: key.rate_limit_per_min,
      requestsToday: this.store.getDailyUsage(key.id, today),
      totalRequests: key.total_requests,
      lastUsed: key.last_used,
      createdAt: key.created_at,
      active: key.active === 1,
      createdBy: key.created_by,
    };
  }

  private publicConfig() {
    const cfg = loadConfig();
    return {
      host: cfg.host,
      port: cfg.port,
      profileBaseDir: cfg.profileBaseDir,
      headless: cfg.headless,
      logLevel: cfg.logLevel,
      apiKeysConfigured: Object.fromEntries(Object.entries(cfg.apiKeys ?? {}).map(([key, value]) => [key, Boolean(value)])),
      admin: {
        dbPath: cfg.admin.dbPath,
        tokenTtlSeconds: cfg.admin.tokenTtlSeconds,
        requireApiKey: cfg.admin.requireApiKey,
        logRetentionDays: cfg.admin.logRetentionDays,
        corsOrigin: cfg.admin.corsOrigin,
        jwtSecretConfigured: Boolean(cfg.admin.jwtSecret || process.env.CORTEX_ADMIN_JWT_SECRET),
      },
      vnc: {
        enabled: true,
        internalUrl: 'http://localhost:6080/vnc.html',
        proxyPath: '/novnc/vnc.html',
      },
    };
  }

  private vncInfo(req: IncomingMessage) {
    const hostHeader = req.headers.host || 'localhost';
    const host = hostHeader.split(':')[0] || 'localhost';
    const portMatch = hostHeader.match(/:(\d+)$/);
    const shared = this.sharedVncInfo();
    const accounts = this.store.listProviderAccounts()
      .filter(account => (
        account.enabled === 1
        && account.display_slot !== null
        && account.display_slot !== undefined
        && account.status === 'connected'
      ))
      .sort((a, b) => {
        const priority = (a.priority ?? 100) - (b.priority ?? 100);
        if (priority !== 0) return priority;
        const aLastUsed = a.last_used_at ? Date.parse(a.last_used_at) : 0;
        const bLastUsed = b.last_used_at ? Date.parse(b.last_used_at) : 0;
        return bLastUsed - aLastUsed;
      });
    const account = accounts[0];
    const focused = account ? this.accountVncInfo(account.display_slot) : shared;

    return {
      enabled: true,
      host,
      port: portMatch ? Number(portMatch[1]) : this.cfg.port,
      path: shared.path,
      url: focused.url,
      sharedUrl: shared.url,
      focusedUrl: focused.url,
      focusedDisplaySlot: account?.display_slot ?? null,
      focusedAccountId: account?.id ?? null,
    };
  }

  private sharedVncInfo() {
    const path = '/novnc/vnc.html';
    return {
      path,
      url: `${path}?autoconnect=1&resize=scale&reconnect=1&path=websockify`,
      websocketPath: 'websockify',
      displaySlot: null as number | null,
    };
  }

  private accountVncInfo(displaySlot: number | null) {
    if (displaySlot === null || displaySlot === undefined) return this.sharedVncInfo();
    const path = '/novnc/vnc.html';
    const websocketPath = `novnc/d${displaySlot}/websockify`;
    return {
      path,
      url: `${path}?autoconnect=1&resize=scale&reconnect=1&path=${websocketPath}`,
      websocketPath,
      displaySlot,
    };
  }

  private requireUser(req: IncomingMessage, res: ServerResponse): { token: UserTokenPayload; user: UserRecord } | null {
    const token = extractBearer(req);
    if (!token) {
      json(res, 401, { error: 'Authentication required', code: 'AUTH_REQUIRED' });
      return null;
    }
    const payload = verifyUserToken(token, this.cfg);
    if (!payload) {
      json(res, 401, { error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
      return null;
    }
    const user = this.store.getUserById(payload.sub);
    if (!user) {
      json(res, 401, { error: 'User account not found', code: 'USER_NOT_FOUND' });
      return null;
    }
    if (user.status === 'suspended') {
      json(res, 403, { error: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
      return null;
    }
    return { token: payload, user };
  }

  private async userRegister(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    const username = requireString(body.username, 'username');
    const email = requireString(body.email, 'email');
    const password = requireString(body.password, 'password');

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      json(res, 400, { error: 'Username must be 3-32 alphanumeric characters or underscores', code: 'INVALID_USERNAME' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      json(res, 400, { error: 'Invalid email address', code: 'INVALID_EMAIL' });
      return;
    }
    if (password.length < 8) {
      json(res, 400, { error: 'Password must be at least 8 characters', code: 'WEAK_PASSWORD' });
      return;
    }
    if (this.store.getUserByUsername(username)) {
      json(res, 409, { error: 'Username already taken', code: 'USERNAME_TAKEN' });
      return;
    }
    if (this.store.getUserByEmail(email)) {
      json(res, 409, { error: 'Email already registered', code: 'EMAIL_TAKEN' });
      return;
    }

    const user = this.store.createUser(username, email, password);
    const signed = signUserToken(user, this.cfg);
    json(res, 201, {
      token: signed.token,
      user: publicUser(user),
      expiresAt: signed.expiresAt,
      expiresIn: signed.expiresIn,
    });
  }

  private async userLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJson(req);
    const login = requireString(body.login, 'login');
    const password = requireString(body.password, 'password');

    const user = this.store.getUserByUsername(login) ?? this.store.getUserByEmail(login);
    if (!user || !verifyPassword(password, user.password_hash)) {
      json(res, 401, { error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
      return;
    }
    if (user.status === 'suspended') {
      json(res, 403, { error: 'Account suspended', code: 'ACCOUNT_SUSPENDED' });
      return;
    }

    this.store.updateUserLastLogin(user.id);
    const refreshed = this.store.getUserById(user.id)!;
    const signed = signUserToken(refreshed, this.cfg);
    json(res, 200, {
      token: signed.token,
      user: publicUser(refreshed),
      expiresAt: signed.expiresAt,
      expiresIn: signed.expiresIn,
    });
  }

  private async handleUserRoute(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    ctx: { token: UserTokenPayload; user: UserRecord },
  ): Promise<void> {
    const { user } = ctx;

    if (url.pathname === '/api/user/me' && req.method === 'GET') {
      json(res, 200, publicUser(user));
      return;
    }

    if (url.pathname === '/api/user/logout' && req.method === 'POST') {
      json(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/api/user/keys' && req.method === 'GET') {
      const keys = this.store.getUserApprovedKeys(user.id);
      json(res, 200, keys.map(k => ({
        id: k.id,
        requestId: k.request_id,
        keyPrefix: k.key_prefix,
        name: k.name,
        dailyLimit: k.daily_limit,
        rateLimitPerMin: k.rate_limit_per_min,
        requestsToday: k.daily_usage,
        totalRequests: k.total_requests,
        lastUsed: k.last_used,
        createdAt: k.created_at,
        active: k.active === 1,
        usagePercent: k.daily_limit > 0 ? Math.round((k.daily_usage / k.daily_limit) * 100) : 0,
      })));
      return;
    }

    if (url.pathname === '/api/user/keys/request' && req.method === 'POST') {
      const body = await readJson(req);
      const name = requireString(body.name, 'name');
      const reason = typeof body.reason === 'string' ? body.reason.trim() || null : null;

      const pending = this.store.getUserKeyRequests(user.id).filter(r => r.status === 'pending');
      if (pending.length >= 3) {
        json(res, 429, { error: 'You already have 3 pending requests', code: 'TOO_MANY_PENDING' });
        return;
      }

      const request = this.store.createUserKeyRequest(user.id, user.username, name, reason);
      json(res, 201, mapUserKeyRequest(request));
      return;
    }

    if (url.pathname === '/api/user/keys/requests' && req.method === 'GET') {
      const requests = this.store.getUserKeyRequests(user.id);
      json(res, 200, requests.map(mapUserKeyRequest));
      return;
    }

    if (url.pathname === '/api/user/usage' && req.method === 'GET') {
      const stats = this.store.getUserKeyStats(user.id);
      const keys = this.store.getUserApprovedKeys(user.id);
      json(res, 200, {
        stats,
        keys: keys.map(k => ({
          id: k.id,
          name: k.name,
          requestsToday: k.daily_usage,
          totalRequests: k.total_requests,
          dailyLimit: k.daily_limit,
          usagePercent: k.daily_limit > 0 ? Math.round((k.daily_usage / k.daily_limit) * 100) : 0,
          active: k.active === 1,
        })),
      });
      return;
    }

    if (url.pathname === '/api/user/logs' && req.method === 'GET') {
      const result = this.store.getUserRequestLogs(user.id, {
        limit: getNumberParam(url, 'limit', 50),
        offset: getNumberParam(url, 'offset', 0),
        provider: url.searchParams.get('provider') || undefined,
        search: url.searchParams.get('search') || undefined,
      });
      json(res, 200, { logs: result.logs.map(mapRequestLog), pagination: { total: result.total } });
      return;
    }

    notFound(res);
  }
}

function extractBearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
  return value;
}

function getIp(req: IncomingMessage): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? null;
}

function getUserAgent(req: IncomingMessage): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
}

function getNumberParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function asPositiveInteger(value: unknown, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${field} must be a positive integer`);
  return number;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`);
  return value.trim();
}

function requireMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('messages must be a non-empty array');
  return value.map((message, index) => {
    if (!message || typeof message !== 'object') throw new Error(`messages[${index}] must be an object`);
    const role = (message as { role?: unknown }).role;
    const content = (message as { content?: unknown }).content;
    if (role !== 'system' && role !== 'user' && role !== 'assistant') throw new Error(`messages[${index}].role is invalid`);
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error(`messages[${index}].content is required`);
    return { role, content: content.trim() };
  });
}

function estimateTokens(value: string): number {
  if (!value) return 0;
  const words = value.trim().split(/\s+/).filter(Boolean).length;
  const chars = Math.ceil(value.length / 4);
  return Math.max(1, Math.ceil((words + chars) / 2));
}

function numberOrZero(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function safeJsonStringify(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: true, value: String(value) });
  }
}

function mapProviderAccount(r: import('../types.js').ProviderAccountRecord) {
  const inCooldown = r.cooldown_until ? Date.parse(r.cooldown_until) > Date.now() : false;
  return {
    id: r.id,
    provider: r.provider,
    label: r.label,
    profileDir: r.profile_dir,
    enabled: Boolean(r.enabled),
    status: r.status,
    cooldownUntil: r.cooldown_until,
    inCooldown,
    cooldownSecondsRemaining: inCooldown && r.cooldown_until
      ? Math.max(0, Math.ceil((Date.parse(r.cooldown_until) - Date.now()) / 1000))
      : 0,
    lastUsedAt: r.last_used_at,
    lastError: r.last_error,
    errorCount24h: r.error_count_24h,
    priority: typeof r.priority === 'number' ? r.priority : 100,
    displaySlot: r.display_slot ?? null,
    // noVNC viewer URL for this account. All accounts load the SAME static
    // /novnc/vnc.html (served by the shared websockify) — only the `path` URL
    // parameter differs, telling noVNC which per-slot WebSocket to connect to.
    // This is the single source of truth for the static HTML/JS, so per-slot
    // failures can't break the viewer loading.
    vncPath: r.display_slot !== null && r.display_slot !== undefined
      ? `/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=novnc/d${r.display_slot}/websockify`
      : '/novnc/vnc.html?autoconnect=1&resize=scale&reconnect=1&path=websockify',
    createdAt: r.created_at,
    createdBy: r.created_by,
    notes: r.notes,
  };
}

function mapRequestLog(log: RequestLogRecord) {
  return {
    id: log.id,
    apiKeyId: log.api_key_id,
    apiKeyName: log.api_key_name,
    provider: log.provider,
    model: log.model,
    messagesCount: log.messages_count,
    stream: Boolean(log.stream),
    statusCode: log.status_code,
    responseTimeMs: log.response_time_ms,
    promptTokens: log.prompt_tokens,
    completionTokens: log.completion_tokens,
    totalTokens: log.total_tokens,
    tokensUsed: log.tokens_used,
    error: log.error,
    ipAddress: log.ip_address,
    userAgent: log.user_agent,
    requestPayload: parseJsonPayload(log.request_payload),
    responsePayload: parseJsonPayload(log.response_payload),
    accountId: log.account_id,
    accountLabel: log.account_label,
    createdAt: log.created_at,
  };
}

function parseJsonPayload(payload: string | null): unknown | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return { raw: payload };
  }
}

function mapUserKeyRequest(req: UserKeyRequestRecord) {
  return {
    id: req.id,
    userId: req.user_id,
    userUsername: req.user_username,
    name: req.name,
    reason: req.reason,
    status: req.status,
    apiKeyId: req.api_key_id,
    revealedKey: req.revealed_key,
    reviewedByAdminId: req.reviewed_by_admin_id,
    reviewNote: req.review_note,
    reviewedAt: req.reviewed_at,
    createdAt: req.created_at,
  };
}

function mapAuditLog(log: AuditLogRecord) {
  return {
    id: log.id,
    adminId: log.admin_id,
    adminUsername: log.admin_username,
    action: log.action,
    entityType: log.entity_type,
    entityId: log.entity_id,
    ipAddress: log.ip_address,
    userAgent: log.user_agent,
    metadata: log.metadata ? JSON.parse(log.metadata) : null,
    createdAt: log.created_at,
  };
}

async function readJson(req: IncomingMessage): Promise<any> {
  const body = await readBody(req);
  if (!body.trim()) return {};
  return JSON.parse(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: object): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function forbidden(res: ServerResponse): true {
  json(res, 403, { error: 'Insufficient admin permissions', code: 'FORBIDDEN' });
  return true;
}

function notFound(res: ServerResponse): true {
  json(res, 404, { error: 'Not found', code: 'NOT_FOUND' });
  return true;
}
