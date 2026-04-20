import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, normalize, relative } from 'node:path';
import type { BridgeConfig } from './types.js';
import { ProviderRegistry } from './registry.js';
import { logger } from './logger.js';
import { AdminStore } from './admin/store.js';
import { AdminApi } from './admin/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

interface ApiAuthContext {
  id: string | null;
  name: string | null;
}

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export class BridgeServer {
  private _registry: ProviderRegistry;
  private _server: ReturnType<typeof createServer> | null = null;
  private _cfg: BridgeConfig;
  private _keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private _adminStore: AdminStore;
  private _adminApi: AdminApi;

  constructor(cfg: BridgeConfig, store?: AdminStore) {
    this._cfg = cfg;
    this._registry = new ProviderRegistry(cfg);
    this._adminStore = store ?? new AdminStore(cfg.admin.dbPath);
    this._adminApi = new AdminApi(this._adminStore, this._registry, cfg);
  }

  get registry(): ProviderRegistry {
    return this._registry;
  }

  async start(): Promise<void> {
    logger.enableFileLogging();

    this._server = createServer((req, res) => {
      this._handleRequest(req, res).catch(err => {
        logger.error(`Unhandled request error: ${err.message}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message, type: 'internal_error' } }));
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      this._server!.listen(this._cfg.port, this._cfg.host, () => {
        logger.info(`Proxy listening on ${this._cfg.host}:${this._cfg.port}`);
        logger.info(`Admin panel available at /admin`);
        resolve();
      });
      this._server!.on('error', reject);
    });

    setTimeout(() => {
      this._registry.restoreSessions().catch(err =>
        logger.warn(`Session restore error: ${err.message}`),
      );
    }, 500);

    this._keepaliveTimer = setInterval(() => {
      this._registry.keepaliveSessions().catch(err =>
        logger.warn(`Session keepalive error: ${err.message}`),
      );
    }, 5 * 60 * 1000);
  }

  async stop(): Promise<void> {
    if (this._keepaliveTimer) {
      clearInterval(this._keepaliveTimer);
      this._keepaliveTimer = null;
    }
    if (this._server) {
      await new Promise<void>(resolve => this._server!.close(() => resolve()));
      this._server = null;
      logger.info('Proxy stopped');
    }
    this._adminStore.close();
  }

  private async _handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';
    const pathname = new URL(url, 'http://localhost').pathname;

    res.setHeader('Access-Control-Allow-Origin', this._cfg.admin.corsOrigin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (await this._adminApi.handle(req, res)) return;

    if (method === 'GET' && (pathname === '/favicon.svg' || pathname === '/logo.svg')) {
      if (this._serveAdminRootAsset(pathname, res)) return;
    }

    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      this._serveAdminAsset(req, res);
      return;
    }

    if (url === '/health' && method === 'GET') {
      json(res, 200, { status: 'ok', service: 'cortex', version: PKG_VERSION });
      return;
    }

    if (url === '/v1/models' && method === 'GET') {
      const auth = this._authenticateApiRequest(req, res, 'system', 'models', false);
      if (!auth) return;
      const models = this._registry.allModels().map(m => ({
        id: m.id,
        object: 'model',
        created: 0,
        owned_by: m.owned_by,
      }));
      this._logApiRequest(auth, 'system', 'models', 0, false, 200, Date.now(), null, req);
      json(res, 200, { object: 'list', data: models });
      return;
    }

    if (url === '/v1/status' && method === 'GET') {
      const auth = this._authenticateApiRequest(req, res, 'system', 'status', false);
      if (!auth) return;
      const startedAt = Date.now();
      const status = await this._registry.getStatus();
      this._logApiRequest(auth, 'system', 'status', 0, false, 200, startedAt, null, req);
      json(res, 200, status);
      return;
    }

    const loginMatch = url.match(/^\/v1\/login\/(grok|gemini|chatgpt)$/);
    if (loginMatch && method === 'POST') {
      json(res, 403, { error: { message: 'Provider login is managed from the authenticated admin panel', type: 'forbidden' } });
      return;
    }

    const logoutMatch = url.match(/^\/v1\/logout\/(grok|gemini|chatgpt)$/);
    if (logoutMatch && method === 'POST') {
      json(res, 403, { error: { message: 'Provider logout is managed from the authenticated admin panel', type: 'forbidden' } });
      return;
    }

    if (url === '/v1/chat/completions' && method === 'POST') {
      const auth = this._authenticateApiRequest(req, res, 'unknown', 'unknown', true);
      if (!auth) return;

      const startedAt = Date.now();
      let providerName = 'unknown';
      let modelName = 'unknown';
      let messagesCount = 0;
      let streamRequest = false;

      const body = await readBody(req);
      let reqData: any;
      try {
        reqData = JSON.parse(body);
      } catch {
        const errorPayload = { error: { message: 'Invalid JSON', type: 'invalid_request' } };
        this._logApiRequest(
          auth,
          providerName,
          modelName,
          messagesCount,
          streamRequest,
          400,
          startedAt,
          'Invalid JSON',
          req,
          undefined,
          { rawBody: body },
          errorPayload,
        );
        json(res, 400, errorPayload);
        return;
      }

      const { model, messages, stream = false, temperature, max_tokens, newConversation = false } = reqData;
      modelName = model ?? 'unknown';
      messagesCount = Array.isArray(messages) ? messages.length : 0;
      streamRequest = Boolean(stream);

      if (!model || !messages) {
        const errorPayload = { error: { message: 'model and messages required', type: 'invalid_request' } };
        this._logApiRequest(auth, providerName, modelName, messagesCount, streamRequest, 400, startedAt, 'model and messages required', req, undefined, reqData, errorPayload);
        json(res, 400, errorPayload);
        return;
      }

      const provider = this._registry.providerForModel(model);
      if (!provider) {
        const errorPayload = { error: { message: `Unknown model: ${model}`, type: 'invalid_request' } };
        this._logApiRequest(auth, providerName, modelName, messagesCount, streamRequest, 404, startedAt, `Unknown model: ${model}`, req, undefined, reqData, errorPayload);
        json(res, 404, errorPayload);
        return;
      }
      providerName = provider.name;

      const connected = await provider.ensureConnected();
      if (!connected) {
        const errorPayload = {
          error: {
            message: `${provider.name} is not connected. Use the admin provider controls to connect it.`,
            type: 'provider_unavailable',
          },
        };
        this._logApiRequest(auth, providerName, modelName, messagesCount, streamRequest, 503, startedAt, `${provider.name} is not connected`, req, undefined, reqData, errorPayload);
        json(res, 503, errorPayload);
        return;
      }

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        const id = `chatcmpl-${Date.now()}`;
        let streamError: string | null = null;
        const chunks: string[] = [];
        let usageForLog: TokenUsage = this._estimateTokenUsage(reqData, '');
        let responsePayloadForLog: unknown = null;
        try {
          for await (const chunk of provider.chatStream({ model, messages, temperature, max_tokens, newConversation })) {
            chunks.push(chunk);
            const meta = 'currentMeta' in provider ? (provider as any).currentMeta : undefined;
            const data = JSON.stringify({
              id, object: 'chat.completion.chunk', model,
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }],
              ...(meta ? { cortex_meta: meta } : {}),
            });
            res.write(`data: ${data}\n\n`);
            if ((res as any).flush) (res as any).flush();
          }
          const finalMeta = 'currentMeta' in provider ? (provider as any).currentMeta : undefined;
          const usage = this._tokenUsage(provider, reqData, chunks.join(''));
          usageForLog = usage;
          const doneData = JSON.stringify({
            id, object: 'chat.completion.chunk', model,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage,
            ...(finalMeta ? { cortex_meta: finalMeta } : {}),
          });
          res.write(`data: ${doneData}\n\n`);
          res.write('data: [DONE]\n\n');
          responsePayloadForLog = {
            id,
            object: 'chat.completion',
            model,
            choices: [{
              index: 0,
              message: { role: 'assistant', content: chunks.join('') },
              finish_reason: 'stop',
            }],
            usage,
          };
        } catch (err) {
          streamError = (err as Error).message;
          usageForLog = this._tokenUsage(provider, reqData, chunks.join(''));
          responsePayloadForLog = {
            id,
            object: 'chat.completion',
            model,
            choices: [{
              index: 0,
              message: { role: 'assistant', content: chunks.join('') },
              finish_reason: 'error',
            }],
            usage: usageForLog,
            error: { message: streamError, type: 'provider_error' },
          };
          res.write(`data: ${JSON.stringify({ error: streamError })}\n\n`);
        } finally {
          res.end();
          this._logApiRequest(
            auth,
            providerName,
            modelName,
            messagesCount,
            streamRequest,
            200,
            startedAt,
            streamError,
            req,
            usageForLog,
            reqData,
            responsePayloadForLog,
          );
        }
      } else {
        try {
          const content = await provider.chat({ model, messages, temperature, max_tokens, newConversation });
          const usage = this._tokenUsage(provider, reqData, content);
          const responsePayload = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            model,
            choices: [{
              index: 0,
              message: { role: 'assistant', content },
              finish_reason: 'stop',
            }],
            usage,
          };
          json(res, 200, responsePayload);
          this._logApiRequest(auth, providerName, modelName, messagesCount, streamRequest, 200, startedAt, null, req, usage, reqData, responsePayload);
        } catch (err) {
          const message = (err as Error).message;
          const usage = this._estimateTokenUsage(reqData, '');
          const errorPayload = { error: { message, type: 'provider_error' } };
          json(res, 503, errorPayload);
          this._logApiRequest(auth, providerName, modelName, messagesCount, streamRequest, 503, startedAt, message, req, usage, reqData, errorPayload);
        }
      }
      return;
    }

    json(res, 404, { error: { message: `Not found: ${url}`, type: 'not_found' } });
  }

  private _authenticateApiRequest(
    req: IncomingMessage,
    res: ServerResponse,
    provider: string,
    model: string,
    incrementUsage: boolean,
  ): ApiAuthContext | null {
    if (!this._cfg.admin.requireApiKey) return { id: null, name: 'unauthenticated' };

    const token = this._extractApiKey(req);
    if (!token) {
      this._adminStore.logRequest({
        api_key_id: null,
        api_key_name: null,
        provider,
        model,
        messages_count: 0,
        stream: 0,
        status_code: 401,
        response_time_ms: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        tokens_used: null,
        error: 'API key required',
        ip_address: getIp(req),
        user_agent: getUserAgent(req),
        request_payload: safeJsonStringify({ method: req.method ?? 'GET', path: req.url ?? '/' }),
        response_payload: safeJsonStringify({ error: { message: 'API key required', type: 'authentication_error' } }),
      });
      json(res, 401, { error: { message: 'API key required', type: 'authentication_error' } });
      return null;
    }

    const validation = this._adminStore.validateApiKey(token);
    if (!validation.valid || !validation.key) {
      const statusCode = validation.statusCode ?? 401;
      this._adminStore.logRequest({
        api_key_id: validation.key?.id ?? null,
        api_key_name: validation.key?.name ?? null,
        provider,
        model,
        messages_count: 0,
        stream: 0,
        status_code: statusCode,
        response_time_ms: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        tokens_used: null,
        error: validation.reason ?? 'Invalid API key',
        ip_address: getIp(req),
        user_agent: getUserAgent(req),
        request_payload: safeJsonStringify({ method: req.method ?? 'GET', path: req.url ?? '/' }),
        response_payload: safeJsonStringify({ error: { message: validation.reason ?? 'Invalid API key', type: 'authentication_error' } }),
      });
      json(res, statusCode, { error: { message: validation.reason ?? 'Invalid API key', type: 'authentication_error' } });
      return null;
    }

    if (incrementUsage) this._adminStore.incrementKeyUsage(validation.key.id);
    return { id: validation.key.id, name: validation.key.name };
  }

  private _extractApiKey(req: IncomingMessage): string | null {
    const xApiKey = req.headers['x-api-key'];
    if (typeof xApiKey === 'string' && xApiKey.trim()) return xApiKey.trim();

    const auth = req.headers.authorization;
    if (!auth) return null;
    const [scheme, value] = auth.split(/\s+/, 2);
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
    return value;
  }

  private _logApiRequest(
    auth: ApiAuthContext,
    provider: string,
    model: string,
    messagesCount: number,
    stream: boolean,
    statusCode: number | null,
    startedAt: number,
    error: string | null,
    req: IncomingMessage,
    usage: TokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    requestPayload?: unknown,
    responsePayload?: unknown,
  ): void {
    try {
      this._adminStore.logRequest({
        api_key_id: auth.id,
        api_key_name: auth.name,
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
    } catch (err) {
      logger.debug(`Failed to log request: ${(err as Error).message}`);
    }
  }

  private _tokenUsage(provider: unknown, reqData: any, output: string): TokenUsage {
    const fallback = this._estimateTokenUsage(reqData, output);
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

  private _estimateTokenUsage(reqData: any, output: string): TokenUsage {
    const promptText = Array.isArray(reqData?.messages)
      ? reqData.messages.map((m: any) => `${m?.role ?? ''}\n${m?.content ?? ''}`).join('\n')
      : JSON.stringify(reqData ?? {});
    const prompt = estimateTokens(promptText);
    const completion = estimateTokens(output);
    return {
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: prompt + completion,
    };
  }

  private _serveAdminAsset(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/admin', 'http://localhost');
    const adminRoot = join(__dirname, '..', 'admin', 'dist');
    if (!existsSync(adminRoot)) {
      json(res, 503, {
        error: {
          message: 'Admin UI is not built. Run `npm --prefix admin install && npm --prefix admin run build`.',
          type: 'admin_ui_unavailable',
        },
      });
      return;
    }

    const relativePath = url.pathname === '/admin' || url.pathname === '/admin/'
      ? 'index.html'
      : normalize(url.pathname.replace(/^\/admin\/?/, ''));
    const candidate = join(adminRoot, relativePath);
    const safeRelative = relative(adminRoot, candidate);
    const filePath = !safeRelative.startsWith('..') && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(adminRoot, 'index.html');

    res.writeHead(200, { 'Content-Type': contentType(filePath) });
    createReadStream(filePath).pipe(res);
  }

  private _serveAdminRootAsset(pathname: string, res: ServerResponse): boolean {
    const adminRoot = join(__dirname, '..', 'admin', 'dist');
    if (!existsSync(adminRoot)) return false;

    const relativePath = normalize(pathname.replace(/^\/+/, ''));
    if (!relativePath) return false;

    const candidate = join(adminRoot, relativePath);
    const safeRelative = relative(adminRoot, candidate);
    if (safeRelative.startsWith('..') || !existsSync(candidate) || !statSync(candidate).isFile()) return false;

    res.writeHead(200, { 'Content-Type': contentType(candidate) });
    createReadStream(candidate).pipe(res);
    return true;
  }
}

function json(res: ServerResponse, status: number, body: object) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
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

function getIp(req: IncomingMessage): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress ?? null;
}

function getUserAgent(req: IncomingMessage): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
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

function contentType(filePath: string): string {
  switch (extname(filePath)) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}
