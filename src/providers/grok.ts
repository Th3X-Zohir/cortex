import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { Page, Request, Response } from 'playwright';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';

export class GrokProvider extends BaseProvider {
  readonly name = 'grok' as const;
  readonly loginUrl = 'https://grok.com';
  readonly verifySelector = '.ProseMirror, [contenteditable="true"]';

  readonly models: ModelDefinition[] = [
    { id: 'web-grok/grok-expert',     provider: 'grok', displayName: 'Grok Expert',      owned_by: 'xai' },
    { id: 'web-grok/grok-fast',       provider: 'grok', displayName: 'Grok Fast',        owned_by: 'xai' },
    { id: 'web-grok/grok-heavy',      provider: 'grok', displayName: 'Grok Heavy',       owned_by: 'xai' },
    { id: 'web-grok/grok-4.20-beta',  provider: 'grok', displayName: 'Grok 4.20 Beta',   owned_by: 'xai' },
  ];

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    if (!this._ctx) throw new Error('Grok: not connected. Run login first.');

    const page = await this._preparePage();
    const detachDiagnostics = this._attachNetworkDiagnostics(page, 'nonstream');
    try {
      if (req.newConversation) {
        await this._startNewConversation(page);
      }
      await this._sendPrompt(page, req);
      logger.info('[grok] non-streaming mode: using DOM immediately (no fetch-intercept wait)');

      const chunks: string[] = [];
      for await (const chunk of pollForResponseDOM(page, true, 'nonstream')) chunks.push(chunk);
      const text = chunks.join('');
      logger.info(`[grok] non-streaming DOM result (${text.length} chars)`);
      return text;
    } finally {
      detachDiagnostics();
    }
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Grok: not connected. Run login first.');

    const page = await this._preparePage();
    const detachDiagnostics = this._attachNetworkDiagnostics(page, 'stream');

    try {
      if (req.newConversation) {
        await this._startNewConversation(page);
      }
      await this._injectInterceptor(page);
      await this._sendPrompt(page, req);

      const timeout = 60000;
      const pollInterval = 300;
      const start = Date.now();
      let lastLength = 0;
      let stableCount = 0;
      let hasContent = false;
      let fetchHit = false;
      let firstChunkTime = 0;
      let lastDebugAt = 0;

      while (Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, pollInterval));

        const result = await page.evaluate(() => {
          const state = (globalThis as any).__cortexGrok;
          return state ? {
            text: state.text || '',
            done: !!state.done,
            fetchHits: state.fetchHits || 0,
            readStarted: !!state.readStarted,
            readDone: !!state.readDone,
            chunkCount: state.chunkCount || 0,
            byteCount: state.byteCount || 0,
            parseHits: state.parseHits || 0,
            parseMisses: state.parseMisses || 0,
            matchedUrls: state.matchedUrls || [],
            lastContentType: state.lastContentType || '',
            lastStatus: state.lastStatus || 0,
            lastRawSample: state.lastRawSample || '',
            lastJsonKeys: state.lastJsonKeys || '',
            errors: state.errors || [],
          } : {
            text: '',
            done: false,
            fetchHits: 0,
            readStarted: false,
            readDone: false,
            chunkCount: 0,
            byteCount: 0,
            parseHits: 0,
            parseMisses: 0,
            matchedUrls: [],
            lastContentType: '',
            lastStatus: 0,
            lastRawSample: '',
            lastJsonKeys: '',
            errors: [],
          };
        }) as GrokInterceptorState;

        if (result.fetchHits > 0 && !fetchHit) {
          fetchHit = true;
          logger.info(`[grok-stream] fetch interception ACTIVE hits=${result.fetchHits} status=${result.lastStatus} ct="${result.lastContentType}" url=${shortList(result.matchedUrls)}`);
        }

        const elapsed = Date.now() - start;
        if (elapsed - lastDebugAt >= 3000) {
          lastDebugAt = elapsed;
          logger.info(`[grok-stream] poll ${elapsed}ms hits=${result.fetchHits} read=${result.readStarted}/${result.readDone} chunks=${result.chunkCount} bytes=${result.byteCount} parsed=${result.parseHits} misses=${result.parseMisses} text=${result.text.length} done=${result.done}`);
          if (result.lastJsonKeys) logger.info(`[grok-stream] last JSON keys: ${result.lastJsonKeys}`);
          if (result.lastRawSample) logger.info(`[grok-stream] raw sample: ${result.lastRawSample.slice(0, 240)}`);
          if (result.errors.length > 0) logger.warn(`[grok-stream] browser interceptor errors: ${result.errors.slice(-3).join(' | ')}`);
        }

        if (!result.text && !hasContent) {
          if (elapsed > 8000 && !fetchHit) {
            logger.info(`[grok-stream] no fetch intercept after ${elapsed}ms; network logs above should show candidate endpoints`);
          }
          if (elapsed > 15000) {
            logger.info('[grok-stream] fetch intercept did not produce text; starting DOM fallback');
            yield* pollForResponseDOM(page, true, 'stream-fallback');
            return;
          }
          continue;
        }

        if (result.text.length > lastLength) {
          if (!firstChunkTime) {
            firstChunkTime = Date.now() - start;
            logger.info(`[grok-stream] first intercepted text at ${firstChunkTime}ms`);
          }
          yield result.text.slice(lastLength);
          lastLength = result.text.length;
          stableCount = 0;
          hasContent = true;
        } else if (result.done) {
          logger.info(`[grok-stream] stream complete (${lastLength} chars, first chunk ${firstChunkTime || 0}ms)`);
          return;
        } else {
          stableCount++;
          if (stableCount >= 5 && lastLength > 0) {
            logger.info(`[grok-stream] response stable (${lastLength} chars)`);
            return;
          }
        }
      }

      if (lastLength === 0) {
        logger.warn('[grok-stream] timed out with no intercepted text, falling back to DOM');
        yield* pollForResponseDOM(page, false, 'stream-timeout');
      } else {
        logger.warn(`[grok-stream] timed out after ${lastLength} intercepted chars`);
      }
    } finally {
      detachDiagnostics();
    }
  }

  private async _preparePage(): Promise<Page> {
    if (!this._ctx) throw new Error('Grok: not connected. Run login first.');

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    let onGrokPage = false;
    try {
      const parsed = new URL(page.url());
      onGrokPage = parsed.hostname === 'grok.com' || parsed.hostname.endsWith('.grok.com');
    } catch {
      onGrokPage = false;
    }
    if (!onGrokPage) {
      logger.info(`[grok] navigating to ${this.loginUrl}`);
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    return page;
  }

  private async _startNewConversation(page: Page): Promise<void> {
    logger.info('[grok] starting fresh conversation...');

    const candidates = [
      'a[href="/"]',
      'a[href="/chat"]',
      'a[href="/new"]',
      'a[href*="/new"]',
      'button:has-text("New chat")',
      'button:has-text("New conversation")',
      'button:has-text("New")',
      'button[aria-label*="New" i]',
      '[data-testid*="new" i]',
    ];

    for (const selector of candidates) {
      const control = page.locator(selector).first();
      if (!await control.isVisible({ timeout: 1200 }).catch(() => false)) continue;
      try {
        await control.evaluate((element: any) => {
          if (typeof element.click === 'function') element.click();
          else element.dispatchEvent(new (globalThis as any).MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await new Promise(r => setTimeout(r, 1800));
        if (await page.locator(this.verifySelector).first().isVisible({ timeout: 5000 }).catch(() => false)) {
          logger.info(`[grok] fresh conversation started via selector="${selector}" url=${page.url().slice(0, 160)}`);
          return;
        }
      } catch (err) {
        logger.warn(`[grok] fresh conversation selector failed selector="${selector}" error=${(err as Error).message}`);
      }
    }

    logger.info('[grok] fresh conversation control not found; using direct navigation');
    await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2500));
    await page.locator(this.verifySelector).first().waitFor({ timeout: 15000 });
    logger.info(`[grok] fresh conversation ready via direct navigation url=${page.url().slice(0, 160)}`);
  }

  private async _sendPrompt(page: Page, req: ChatRequest): Promise<void> {
    const userMsg = buildUserMessage(req.messages);
    logPromptComposition('grok', req.messages, userMsg);

    await page.evaluate(() => {
      (globalThis as any).__cortexGrok = {
        text: '',
        done: false,
        startTime: Date.now(),
        fetchHits: 0,
        readStarted: false,
        readDone: false,
        chunkCount: 0,
        byteCount: 0,
        parseHits: 0,
        parseMisses: 0,
        matchedUrls: [],
        lastContentType: '',
        lastStatus: 0,
        lastRawSample: '',
        lastJsonKeys: '',
        errors: [],
      };
    });

    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
    await editor.waitFor({ timeout: 10000 });
    await this._insertPromptText(page, editor, userMsg);

    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Enter');

    logger.info(`[grok] message sent (${userMsg.length} chars) url=${page.url().slice(0, 160)}`);
  }

  private _attachNetworkDiagnostics(page: Page, mode: 'stream' | 'nonstream'): () => void {
    const seen = new Set<string>();
    const isCandidate = (url: string) => isGrokCandidateUrl(url);
    const tag = `[grok-net:${mode}]`;

    const onConsole = (msg: { type: () => string; text: () => string }) => {
      const text = msg.text();
      if (text.includes('CORTEX') || text.includes('GROK') || text.includes('[cortex]')) {
        logger.info(`[grok-browser:${mode}] ${msg.type()} ${text.slice(0, 500)}`);
      }
    };

    const onRequest = (request: Request) => {
      const url = request.url();
      if (!isCandidate(url)) return;
      const method = request.method();
      const key = `${method} ${url}`;
      const post = method === 'POST' ? safePostData(request) : '';
      logger.info(`${tag} REQ ${method} type=${request.resourceType()} ${shortUrl(url)}${post ? ` body=${post}` : ''}`);
      seen.add(key);
    };

    const onResponse = async (response: Response) => {
      const url = response.url();
      if (!isCandidate(url)) return;
      const headers = response.headers();
      logger.info(`${tag} RES ${response.status()} ct="${headers['content-type'] || ''}" enc="${headers['content-encoding'] || ''}" ${shortUrl(url)}`);
    };

    const onRequestFinished = async (request: Request) => {
      const url = request.url();
      if (!isCandidate(url)) return;
      const response = await request.response().catch(() => null);
      const headers = response?.headers() ?? {};
      logger.info(`${tag} DONE ${request.method()} status=${response?.status() ?? 'n/a'} ct="${headers['content-type'] || ''}" ${shortUrl(url)}`);
    };

    const onRequestFailed = (request: Request) => {
      const url = request.url();
      if (!isCandidate(url)) return;
      logger.warn(`${tag} FAILED ${request.method()} ${request.failure()?.errorText || 'unknown'} ${shortUrl(url)}`);
    };

    page.on('console', onConsole as any);
    page.on('request', onRequest);
    page.on('response', onResponse);
    page.on('requestfinished', onRequestFinished);
    page.on('requestfailed', onRequestFailed);
    logger.info(`${tag} diagnostics attached`);

    return () => {
      page.off('console', onConsole as any);
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfinished', onRequestFinished);
      page.off('requestfailed', onRequestFailed);
      logger.info(`${tag} diagnostics detached (${seen.size} candidate requests)`);
    };
  }

  private async _injectInterceptor(page: Page): Promise<void> {
    await page.evaluate(`
      (() => {
        const freshState = () => ({
          text: '',
          done: false,
          startTime: Date.now(),
          fetchHits: 0,
          readStarted: false,
          readDone: false,
          chunkCount: 0,
          byteCount: 0,
          parseHits: 0,
          parseMisses: 0,
          matchedUrls: [],
          lastContentType: '',
          lastStatus: 0,
          lastRawSample: '',
          lastJsonKeys: '',
          errors: [],
        });

        if (window.__cortexGrokPatched) {
          window.__cortexGrok = { ...freshState(), ...(window.__cortexGrok || {}) };
          console.log('[CORTEX-GROK] fetch interceptor already installed');
          return;
        }

        window.__cortexGrok = freshState();

        const isCandidateUrl = (url) =>
          url.includes('/rest/app-chat/conversations/') ||
          url.includes('/rest/app-chat/') ||
          url.includes('/api/') ||
          url.includes('/graphql') ||
          url.includes('add-response') ||
          url.includes('chat/completions') ||
          url.includes('grok/share');

        const rememberError = (message) => {
          window.__cortexGrok.errors = [...(window.__cortexGrok.errors || []), String(message)].slice(-20);
        };

        const rememberUrl = (url) => {
          window.__cortexGrok.matchedUrls = [...new Set([...(window.__cortexGrok.matchedUrls || []), String(url).slice(0, 220)])].slice(-12);
        };

        const applyTextFromJson = (d) => {
          let parsed = false;
          window.__cortexGrok.lastJsonKeys = d && typeof d === 'object' ? Object.keys(d).slice(0, 20).join(',') : typeof d;

          const candidates = [
            d?.choices?.[0]?.delta?.content,
            d?.choices?.[0]?.message?.content,
            d?.result?.response,
            d?.result?.message,
            d?.modelResponse?.message,
            d?.message?.content,
            d?.response,
            d?.token,
            d?.text,
            d?.content,
          ];
          for (const candidate of candidates) {
            if (typeof candidate !== 'string' || !candidate) continue;
            if (candidate.length >= window.__cortexGrok.text.length && candidate.includes(window.__cortexGrok.text.slice(-80))) {
              window.__cortexGrok.text = candidate;
            } else {
              window.__cortexGrok.text += candidate;
            }
            window.__cortexGrok.parseHits++;
            parsed = true;
          }

          const nested = [
            d?.result,
            d?.data,
            d?.payload,
            d?.message,
            d?.modelResponse,
          ];
          for (const item of nested) {
            if (!item || typeof item !== 'object') continue;
            for (const value of Object.values(item)) {
              if (typeof value === 'string' && value.length > window.__cortexGrok.text.length && value.length < 200000) {
                window.__cortexGrok.text = value;
                window.__cortexGrok.parseHits++;
                parsed = true;
              }
            }
          }

          return parsed;
        };

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const res = await _fetch.apply(this, args);
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

          if (isCandidateUrl(url)) {
            console.log('[CORTEX-GROK-FETCH]', res.status, res.headers.get('content-type') || '', url);

            window.__cortexGrok.fetchHits = (window.__cortexGrok.fetchHits || 0) + 1;
            window.__cortexGrok.text = '';
            window.__cortexGrok.done = false;
            window.__cortexGrok.startTime = Date.now();
            window.__cortexGrok.lastContentType = res.headers.get('content-type') || '';
            window.__cortexGrok.lastStatus = res.status;
            rememberUrl(url);

            const clone = res.clone();
            (async () => {
              try {
                if (!clone.body) {
                  rememberError('response body was empty/unreadable');
                  window.__cortexGrok.done = true;
                  return;
                }
                const reader = clone.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                window.__cortexGrok.readStarted = true;
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    window.__cortexGrok.done = true;
                    window.__cortexGrok.readDone = true;
                    console.log('[CORTEX-GROK-STREAM-CLOSE]', window.__cortexGrok.text.length, 'chars');
                    break;
                  }
                  window.__cortexGrok.chunkCount++;
                  window.__cortexGrok.byteCount += value?.byteLength || 0;
                  const chunk = decoder.decode(value, { stream: true });
                  window.__cortexGrok.lastRawSample = chunk.slice(0, 500);
                  buffer += chunk;

                  const lines = buffer.split('\\n');
                  buffer = lines.pop() || '';
                  let parsed = false;

                  for (const line of lines) {
                    const trimmed = line.trim();
                    const raw = trimmed.startsWith('data: ') ? trimmed.slice(6).trim() : trimmed;
                    if (!raw || raw === '[DONE]') {
                      if (raw === '[DONE]') window.__cortexGrok.done = true;
                      continue;
                    }
                    try {
                      const d = JSON.parse(raw);
                      parsed = applyTextFromJson(d) || parsed;
                    } catch {
                      window.__cortexGrok.parseMisses++;
                    }
                  }

                  if (!parsed && buffer.length > 0) {
                    try {
                      const j = JSON.parse(buffer);
                      parsed = applyTextFromJson(j) || parsed;
                    } catch {
                      window.__cortexGrok.parseMisses++;
                    }
                  }
                }
              } catch (err) {
                rememberError(err?.message || err);
                window.__cortexGrok.done = true;
                window.__cortexGrok.readDone = true;
              }
            })();
          }
          return res;
        };

        window.__cortexGrokPatched = true;
        console.log('[CORTEX-GROK] fetch interceptor installed');
      })()
    `);
    logger.info('[grok-stream] browser fetch interceptor injected');
  }
}

async function* pollForResponseDOM(
  page: Page,
  immediateFallback = false,
  label = 'fallback',
): AsyncGenerator<string> {
  const selectors = [
    'article[data-testid] .markdown',
    '[class*="message"] [class*="markdown"]',
    '[class*="response"] [class*="content"]',
    '.message-bubble',
    'article .prose',
    '[data-message-author-role="assistant"]',
    '.items-start .markdown',
    'article:last-of-type',
  ];

  const timeout = 30000;
  const pollInterval = 300;
  const start = Date.now();
  let lastLength = 0;
  let stableCount = 0;
  let matchedSelector = '';

  logger.info(`[grok-dom:${label}] DOM polling started${immediateFallback ? ' (immediate)' : ''}`);

  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));
    const elapsed = Date.now() - start;

    if (!matchedSelector) {
      for (const sel of selectors) {
        const count = await page.locator(sel).count().catch(() => 0);
        if (count > 0) {
          matchedSelector = sel;
          logger.info(`[grok-dom:${label}] matched selector="${sel}" count=${count} at ${elapsed}ms`);
          break;
        }
      }
      if (!matchedSelector && elapsed > 0 && elapsed % 3000 < pollInterval) {
        const counts = await sampleDomCounts(page);
        logger.info(`[grok-dom:${label}] no selector yet at ${elapsed}ms counts=${counts}`);
      }
      if (!matchedSelector) continue;
    }

    const elements = page.locator(matchedSelector);
    const count = await elements.count().catch(() => 0);
    if (count === 0) continue;

    const lastEl = elements.last();
    const text = await lastEl.textContent().catch(() => '');
    if (!text) continue;

    if (text.length > lastLength) {
      logger.info(`[grok-dom:${label}] yielding ${text.length - lastLength} chars total=${text.length}`);
      yield text.slice(lastLength);
      lastLength = text.length;
      stableCount = 0;
    } else {
      stableCount++;
      if (stableCount >= 3 && lastLength > 0) {
        logger.info(`[grok-dom:${label}] complete (${lastLength} chars)`);
        return;
      }
    }
  }

  logger.warn(`[grok-dom:${label}] timed out`);
}

type GrokInterceptorState = {
  text: string;
  done: boolean;
  fetchHits: number;
  readStarted: boolean;
  readDone: boolean;
  chunkCount: number;
  byteCount: number;
  parseHits: number;
  parseMisses: number;
  matchedUrls: string[];
  lastContentType: string;
  lastStatus: number;
  lastRawSample: string;
  lastJsonKeys: string;
  errors: string[];
};

function isGrokCandidateUrl(url: string): boolean {
  if (!url) return false;
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  const grokHost = host === 'grok.com' || host.endsWith('.grok.com') || host.endsWith('.x.ai') || host.endsWith('.x.com');
  if (!grokHost) return false;
  return (
    url.includes('/rest/') ||
    url.includes('/api/') ||
    url.includes('/graphql') ||
    url.includes('/chat') ||
    url.includes('/conversation') ||
    url.includes('/add-response') ||
    url.includes('/stream') ||
    url.includes('/sse')
  );
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const query = parsed.search ? `?${parsed.searchParams.toString().slice(0, 120)}` : '';
    return `${parsed.origin}${parsed.pathname}${query}`.slice(0, 260);
  } catch {
    return url.slice(0, 260);
  }
}

function shortList(values: string[]): string {
  if (!values.length) return 'none';
  return values.map(shortUrl).join(' | ').slice(0, 600);
}

function safePostData(request: Request): string {
  try {
    const post = request.postData();
    if (!post) return '';
    return post.replace(/\s+/g, ' ').slice(0, 500);
  } catch {
    return '';
  }
}

async function sampleDomCounts(page: Page): Promise<string> {
  return page.evaluate<string>(`
    (() => {
    const selectors = [
      'article',
      '[data-testid]',
      '[class*="message"]',
      '[class*="response"]',
      '.ProseMirror',
      '[contenteditable="true"]',
    ];
    return selectors
      .map(sel => sel + ':' + document.querySelectorAll(sel).length)
      .join(',');
    })()
  `).catch(() => 'unavailable');
}

export function buildUserMessage(messages: Array<{ role: string; content: string }>): string {
  const parts: string[] = [];
  const systemText = messages
    .filter(m => m.role === 'system' || m.role === 'developer')
    .map(m => m.content.trim())
    .filter(Boolean)
    .join('\n\n');

  if (systemText) {
    parts.push(`System instructions:\n${systemText}`);
  }

  const conversationMessages = messages
    .filter(m => m.role !== 'system' && m.role !== 'developer')
    .filter(m => m.content.trim())
    .slice(-10);

  if (conversationMessages.length === 1 && conversationMessages[0].role === 'user') {
    parts.push(`User message:\n${conversationMessages[0].content}`);
  } else if (conversationMessages.length > 0) {
    const conversation = conversationMessages
      .map(m => `${formatPromptRole(m.role)}:\n${m.content}`)
      .join('\n\n');
    parts.push(`Conversation:\n${conversation}`);
  } else {
    parts.push('User message:\n');
  }

  return parts.join('\n\n');
}

export function logPromptComposition(
  providerName: string,
  messages: Array<{ role: string; content: string }>,
  prompt: string,
): void {
  const systemChars = messages
    .filter(m => m.role === 'system' || m.role === 'developer')
    .reduce((sum, m) => sum + m.content.length, 0);
  const roleCounts = messages.reduce<Record<string, number>>((acc, message) => {
    acc[message.role] = (acc[message.role] ?? 0) + 1;
    return acc;
  }, {});
  const preview = prompt.replace(/\s+/g, ' ').slice(0, 240);
  logger.info(
    `[${providerName}] composed provider prompt chars=${prompt.length} systemChars=${systemChars} roles=${JSON.stringify(roleCounts)} preview="${preview}"`,
  );
}

function formatPromptRole(role: string): string {
  if (role === 'user') return 'User';
  if (role === 'assistant') return 'Assistant';
  if (role === 'tool') return 'Tool';
  return role ? role[0].toUpperCase() + role.slice(1) : 'Message';
}

export async function* pollForResponse(
  page: import('playwright').Page,
  responseSelector: string,
  log: typeof logger,
  providerName: string,
): AsyncGenerator<string> {
  const timeout = 60000;
  const pollInterval = 300;
  const start = Date.now();
  let lastLength = 0;
  let stableCount = 0;

  await page.waitForSelector(responseSelector, { timeout: 15000 }).catch(() => {});

  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));

    const elements = page.locator(responseSelector);
    const count = await elements.count().catch(() => 0);
    if (count === 0) continue;

    const lastEl = elements.last();
    const text = await lastEl.textContent().catch(() => '');
    if (!text) continue;

    if (text.length > lastLength) {
      yield text.slice(lastLength);
      lastLength = text.length;
      stableCount = 0;
    } else {
      stableCount++;
      if (stableCount >= 3 && lastLength > 0) {
        log.info(`[${providerName}] response complete (${lastLength} chars)`);
        return;
      }
    }
  }

  log.warn(`[${providerName}] response polling timed out`);
}
