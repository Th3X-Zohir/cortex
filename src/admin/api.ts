import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BridgeConfig, ChatMessage, ProviderAdapter, ProviderName } from '../types.js';
import { loadConfig, saveConfig } from '../config.js';
import type { ProviderRegistry } from '../registry.js';
import {
  publicAdmin,
  signAdminToken,
  verifyAdminToken,
  verifyPassword,
  type AdminTokenPayload,
} from './auth.js';
import type { AdminRecord, AdminStore, ApiKeyRecord, RequestLogRecord, AuditLogRecord } from './store.js';

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
          void this.registry.get(provider).login(loginUrl => {
            this.audit(req, ctx, 'provider_login_started', 'provider', provider, { loginUrl });
          }).catch(err => {
            this.audit(req, ctx, 'provider_login_failed', 'provider', provider, { error: (err as Error).message });
          });
          json(res, 202, { status: 'login_started', provider });
        }
        return true;
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

    if (!provider) {
      const errorPayload = { error: `Unknown model: ${model}`, code: 'UNKNOWN_MODEL' };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, stream, 404, startedAt, `Unknown model: ${model}`, { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }, body, errorPayload);
      json(res, 404, errorPayload);
      return;
    }

    if (temperature !== undefined && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
      const errorPayload = { error: 'temperature must be between 0 and 2', code: 'INVALID_TEMPERATURE' };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, stream, 400, startedAt, 'temperature must be between 0 and 2', this.estimateTokenUsage(messages, ''), body, errorPayload);
      json(res, 400, errorPayload);
      return;
    }

    const connected = await provider.ensureConnected();
    if (!connected) {
      const error = `${provider.name} is not connected`;
      const errorPayload = { error, code: 'PROVIDER_UNAVAILABLE' };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, stream, 503, startedAt, error, this.estimateTokenUsage(messages, ''), body, errorPayload);
      json(res, 503, errorPayload);
      return;
    }

    if (stream) {
      await this.playgroundStream(req, res, ctx, provider, providerName, model, messages, temperature, maxTokens, newConversation, startedAt, body);
      return;
    }

    try {
      const content = await provider.chat({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        newConversation,
      });
      const usage = this.tokenUsage(provider, messages, content);
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
      };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, false, 200, startedAt, null, usage, body, responsePayload);
      this.audit(req, ctx, 'playground_chat', 'provider', providerName, { model, stream: false, usage });
      json(res, 200, responsePayload);
    } catch (err) {
      const message = (err as Error).message;
      const usage = this.estimateTokenUsage(messages, '');
      const errorPayload = { error: message, code: 'PROVIDER_ERROR' };
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, false, 503, startedAt, message, usage, body, errorPayload);
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
      for await (const chunk of provider.chatStream({ model, messages, temperature, max_tokens: maxTokens, newConversation })) {
        chunks.push(chunk);
        res.write(`data: ${JSON.stringify({
          id,
          object: 'chat.completion.chunk',
          model,
          provider: providerName,
          choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
        })}\n\n`);
        if ((res as any).flush) (res as any).flush();
      }

      const usage = this.tokenUsage(provider, messages, chunks.join(''));
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
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, true, 200, startedAt, null, usage, requestPayload, responsePayloadForLog);
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
      this.logPlaygroundRequest(req, ctx, providerName, model, messages.length, true, 200, startedAt, streamError, usage, requestPayload, responsePayloadForLog);
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
    const path = '/novnc/vnc.html';
    return {
      enabled: true,
      host,
      port: portMatch ? Number(portMatch[1]) : this.cfg.port,
      path,
      url: `${path}?autoconnect=1&resize=scale&reconnect=1&path=websockify`,
    };
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
