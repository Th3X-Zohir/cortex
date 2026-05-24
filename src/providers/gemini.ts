/* global document window */
declare const document: any;
declare const window: any;
import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { BrowserContext } from 'playwright';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage, logPromptComposition } from './grok.js';

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini' as const;
  readonly loginUrl = 'https://gemini.google.com/';
  readonly verifySelector = '[contenteditable="true"], textarea, .input-area textarea, .text-input-field';

  readonly models: ModelDefinition[] = [
    { id: 'web-gemini/gemini-3-fast',     provider: 'gemini', displayName: 'Gemini 3 Fast',     owned_by: 'google' },
    { id: 'web-gemini/gemini-3-thinking', provider: 'gemini', displayName: 'Gemini 3 Thinking', owned_by: 'google' },
    { id: 'web-gemini/gemini-3.1-pro',   provider: 'gemini', displayName: 'Gemini 3.1 Pro',    owned_by: 'google' },
  ];

  private _patchedCtx: BrowserContext | null = null;
  private _directTokens: { at: string; bl: string; fetchedAt: number } | null = null;

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    if (!this._ctx) throw new Error('Gemini: not connected. Run login first.');

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();
    let onGeminiPage = false;
    try { const current = new URL(page.url()); onGeminiPage = current.hostname === 'gemini.google.com'; } catch { onGeminiPage = false; }
    if (!onGeminiPage) {
      logger.info(`[gemini] navigating to ${this.loginUrl}`);
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    const userMsg = buildUserMessage(req.messages);
    logPromptComposition('gemini', req.messages, userMsg);
    const direct = await this._tryDirectStream(page, req, userMsg);
    if (direct) {
      logger.info(`[gemini] direct browser API result (${direct.length} chars)`);
      return direct;
    }

    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Gemini: not connected. Run login first.');

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    let _onGeminiPage = false;
    try { const _p = new URL(page.url()); _onGeminiPage = _p.hostname === 'gemini.google.com'; } catch { _onGeminiPage = false; }
    if (!_onGeminiPage) {
      logger.info(`[gemini] navigating to ${this.loginUrl}`);
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    const userMsg = buildUserMessage(req.messages);
    logPromptComposition('gemini', req.messages, userMsg);

    if (req.newConversation) {
      await this._startNewConversation(page);
    }

    // === SET UP NETWORK INTERCEPTION FOR STREAMING ===
    // Target ONLY the StreamGenerate endpoint using page.route()
    let streamGenerateUrl = '';
    let streamGeneratePostData = '';
    const streamChunks: string[] = [];
    let streamDone = false;
    let networkStreamActive = false;

    // Intercept ALL requests to log them and capture StreamGenerate details
    const onRequest = (req: import('playwright').Request) => {
      const url = req.url();
      if (url.includes('StreamGenerate') || url.includes('batchexecute')) {
        logger.info(`[gemini-NET-API] ${req.method()} ${url.slice(0, 200)}`);
        if (url.includes('StreamGenerate') && req.method() === 'POST') {
          streamGenerateUrl = url;
          this._rememberDirectTokensFromRequest(req);
        }
      }
    };
    const onResponse = (res: import('playwright').Response) => {
      const url = res.url();
      if (url.includes('StreamGenerate')) {
        const headers = res.headers();
        logger.info(`[gemini-NET-STREAM-RES] status=${res.status()} ct="${headers['content-type'] || ''}" url=${url.slice(0, 100)}`);
      }
    };
    const onRequestFinished = async (req: import('playwright').Request) => {
      const url = req.url();
      if (url.includes('StreamGenerate')) {
        try {
          const timing = req.timing();
          const response = await req.response();
          if (response) {
            const headers = response.headers();
            logger.info(`[gemini-NET-FINISHED] url=${url.slice(0, 80)} ct="${headers['content-type'] || ''}" timing=${JSON.stringify(timing?.requestStart)}`);
          }
        } catch {}
      }
    };
    const onConsole = (msg: import('playwright').ConsoleMessage) => {
      const text = msg.text();
      if (text.includes('GEMINI') || text.includes('STREAM') || text.includes('CORTEX')) {
        logger.info(`[gemini-BROWSER] ${text.slice(0, 200)}`);
      }
    };
    page.on('request', onRequest);
    page.on('response', onResponse);
    page.on('requestfinished', onRequestFinished);
    page.on('console', onConsole);

    // Use page.route() to intercept StreamGenerate and try to read streaming response
    await page.route('**/StreamGenerate**', async (route) => {
      const req = route.request();
      logger.info(`[gemini-ROUTE] intercepting StreamGenerate: ${req.method()} ${req.url().slice(0, 100)}`);
      networkStreamActive = true;

      // Continue the request and try to intercept the response
      await route.continue();
    });

    // Small delay to ensure route is registered
    await new Promise(r => setTimeout(r, 100));

    const inputEl = await this._findInputElement(page);
    if (!inputEl) {
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('console', onConsole);
      throw new Error('[gemini] could not find input element');
    }

    const elInfo = await inputEl.evaluate((el: any) => ({
      tag: el.tagName,
      contentEditable: el.contentEditable,
      className: (el.className || '').substring(0, 80),
    }));
    logger.info(`[gemini] INPUT: tag=${elInfo.tag} contenteditable=${elInfo.contentEditable} class="${elInfo.className}"`);

    logger.info(`[gemini] inserting prompt via paste-style input (${userMsg.length} chars)`);
    await this._insertPromptText(page, inputEl, userMsg);

    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.press('Enter');
    logger.info(`[gemini] message sent, waiting for StreamGenerate response...`);

    // === POLL FOR RESPONSE ===
    const start = Date.now();
    const pollInterval = 200;
    const timeout = 30000;
    let lastKnownText = '';
    let stableCount = 0;

    // Record initial DOM state
    const initialText = await page.evaluate(() => {
      const containers = document.querySelectorAll('STRUCTURED-CONTENT-CONTAINER, .model-response-text, [class*="model-response"]');
      if (!containers.length) return '';
      const last = containers[containers.length - 1];
      return (last.textContent || '').trim();
    }) as string;
    logger.info(`[gemini] initial DOM text: "${initialText.slice(0, 50)}"`);
    lastKnownText = initialText;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const elapsed = Date.now() - start;

      // Check DOM for response
      const result = await page.evaluate(() => {
        const containers = document.querySelectorAll('STRUCTURED-CONTENT-CONTAINER, .model-response-text, [class*="model-response"]');
        if (!containers || containers.length === 0) return { text: '', count: 0 };

        const last = containers[containers.length - 1];
        const lastText = (last.textContent || '').trim();
        return { text: lastText, count: containers.length };
      }) as { text: string; count: number };

      if (elapsed % 1000 < pollInterval) {
        logger.info(`[gemini] DOM poll@${elapsed}ms: ${result.count} containers, last="${result.text.slice(0, 60)}"`);
      }

      // Ignore label text
      const labelTexts = ['gemini said', 'you said', 'gemini:', 'user:'];
      const isLabelOnly = labelTexts.some(l => result.text.toLowerCase().startsWith(l) && result.text.length < 50);

      if (result.text && result.text !== lastKnownText && result.text.length > 0 && !isLabelOnly) {
        const newContent = result.text.slice(lastKnownText.length);
        if (newContent.length > 0) {
          logger.info(`[gemini] NEW content: "${newContent.slice(0, 80)}" (total: ${result.text.length})`);
          yield newContent;
          lastKnownText = result.text;
          stableCount = 0;
        }
      } else if (result.text === lastKnownText && result.text.length > 0 && !isLabelOnly) {
        stableCount++;
        if (stableCount >= 4) {
          logger.info(`[gemini] response complete (${result.text.length} chars)`);
          break;
        }
      }
    }

    // Cleanup
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfinished', onRequestFinished);
    page.off('console', onConsole);
    await page.unroute('**/StreamGenerate**').catch(() => {});
    logger.info(`[gemini] === DONE ===`);
  }

  private async _findInputElement(page: import('playwright').Page) {
    const selectors = [
      'textarea.inputarea',
      '.ql-editor',
      '[contenteditable="true"]',
      'textarea',
      '[role="textbox"]',
    ];
    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      if (count > 0) return page.locator(sel).first();
    }
    return null;
  }

  private async _tryDirectStream(
    page: import('playwright').Page,
    req: ChatRequest,
    userMsg: string,
  ): Promise<string | null> {
    try {
      const keepProviderState = shouldKeepProviderConversationState(req);
      const cachedTokens = this._directTokens && Date.now() - this._directTokens.fetchedAt < 300000
        ? { at: this._directTokens.at, bl: this._directTokens.bl }
        : null;
      const result = await page.evaluate(
        async ({ message, newConversation, keepProviderState, cachedTokens }) => {
          const timeoutMs = 180000;
          const win = window as typeof window & {
            __cortexGeminiDirect?: {
              tokens?: { at: string; bl: string };
              tokensFetchedAt?: number;
              conversationId?: string;
              responseId?: string;
              choiceId?: string;
            };
          };
          const state = win.__cortexGeminiDirect ?? {};
          win.__cortexGeminiDirect = state;
          if (cachedTokens) {
            state.tokens = cachedTokens;
            state.tokensFetchedAt = Date.now();
          }
          if (newConversation || !keepProviderState) {
            state.conversationId = '';
            state.responseId = '';
            state.choiceId = '';
          }

          async function getTokens(forceRefresh = false) {
            const expired = !state.tokensFetchedAt || Date.now() - state.tokensFetchedAt > 300000;
            if (state.tokens && !forceRefresh && !expired) return state.tokens;

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30000);
            try {
              let html = '';
              let lastStatus = 0;
              for (const path of ['/app', '/', '/faq']) {
                const res = await fetch(path, { credentials: 'include', signal: controller.signal });
                lastStatus = res.status;
                if (!res.ok) continue;
                html = await res.text();
                if (html.includes('SNlM0e') && html.includes('cfb2h')) break;
              }
              if (!html) throw new Error(`Gemini token page failed (${lastStatus})`);
              const at = html.split('SNlM0e')[1]?.split('":"')[1]?.split('"')[0];
              const bl = html.split('cfb2h')[1]?.split('":"')[1]?.split('"')[0];
              if (!at) throw new Error('failed to extract SNlM0e token');
              if (!bl) throw new Error('failed to extract cfb2h token');
              state.tokens = { at, bl };
              state.tokensFetchedAt = Date.now();
              return state.tokens;
            } finally {
              clearTimeout(timer);
            }
          }

          function parseResponse(rawText: string): string {
            const cleanText = rawText.replace(/^\)\]}'?\s*\n?/, '');
            const lines = cleanText.split('\n').filter(line => line.trim().length > 0);
            const items: unknown[][] = [];
            const dataIndices: number[] = [];

            for (const line of lines) {
              try {
                const arr = JSON.parse(line);
                if (!Array.isArray(arr)) continue;
                for (const item of arr) {
                  if (!Array.isArray(item)) continue;
                  for (let idx = 0; idx < Math.min(item.length, 6); idx++) {
                    if (typeof item[idx] !== 'string' || item[idx].length < 50) continue;
                    try {
                      JSON.parse(item[idx]);
                      items.push(item);
                      dataIndices.push(idx);
                      break;
                    } catch {
                      // keep scanning
                    }
                  }
                }
              } catch {
                // keep scanning
              }
            }

            if (items.length === 0) {
              const jsonStrings: string[] = [];
              const deepSearch = (value: unknown, depth = 0) => {
                if (depth > 8) return;
                if (typeof value === 'string' && value.length > 50) {
                  try {
                    JSON.parse(value);
                    jsonStrings.push(value);
                  } catch {
                    // not embedded JSON
                  }
                  return;
                }
                if (Array.isArray(value)) {
                  for (const child of value) deepSearch(child, depth + 1);
                }
              };
              for (const line of lines) {
                try { deepSearch(JSON.parse(line)); } catch {}
              }
              for (const json of jsonStrings) {
                items.push([null, null, json]);
                dataIndices.push(2);
              }
            }

            if (items.length === 0) throw new Error('failed to parse Gemini response');

            try {
              const inner = JSON.parse(items[0][dataIndices[0] ?? 2] as string);
              if (keepProviderState && inner?.[1]?.[0]) state.conversationId = inner[1][0];
              if (keepProviderState && inner?.[1]?.[1]) state.responseId = inner[1][1];
              if (keepProviderState && inner?.[4]?.[0]?.[0]) state.choiceId = inner[4][0][0];
              if (inner?.[5]?.[0] === 9) throw new Error('no Gemini access');
            } catch (err) {
              if ((err as Error).message.includes('Gemini')) throw err;
            }

            let replyText = '';
            const isReplyCandidate = (value: unknown): value is string => {
              if (typeof value !== 'string') return false;
              const text = value.trim();
              if (text.length < 2) return false;
              if (text === state.conversationId || text === state.responseId || text === state.choiceId) return false;
              if (/^[A-Za-z0-9_-]{16,}$/.test(text)) return false;
              if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) return false;
              return true;
            };
            const findLongest = (value: unknown, depth = 0): string => {
              if (depth > 8) return '';
              if (typeof value === 'string') return value;
              if (!Array.isArray(value)) return '';
              let longest = '';
              for (const child of value) {
                const candidate = findLongest(child, depth + 1);
                if (candidate.length > longest.length) longest = candidate;
              }
              return longest;
            };

            for (let i = 0; i < items.length; i++) {
              try {
                const inner = JSON.parse(items[i][dataIndices[i] ?? 2] as string);
                const candidates = [
                  Array.isArray(inner?.[0]) && typeof inner[0][0] === 'string' ? inner[0][0] : '',
                  inner?.[4]?.[0]?.[1]?.[0] ?? '',
                  inner?.[4]?.[0]?.[1] ?? '',
                  inner?.[0]?.[1]?.[0] ?? '',
                  inner?.[3]?.[0]?.[0] ?? '',
                  inner?.[3]?.[1]?.[0] ?? '',
                ];
                for (const candidate of candidates) {
                  if (isReplyCandidate(candidate) && candidate.length > replyText.length) {
                    replyText = candidate;
                  }
                }
                if (!replyText) {
                  const fallbackCandidate = findLongest(inner);
                  if (isReplyCandidate(fallbackCandidate)) replyText = fallbackCandidate;
                }
              } catch {
                // continue
              }
            }

            if (!replyText) throw new Error('could not extract Gemini reply');
            return replyText;
          }

          async function sendOnce(forceRefreshTokens = false): Promise<string> {
            const tokens = await getTokens(forceRefreshTokens);
            const reqId = Math.floor(900000 * Math.random()) + 100000;
            const queryParams = new URLSearchParams({ bl: tokens.bl, rt: 'c', _reqid: reqId.toString() });
            const context = [state.conversationId || '', state.responseId || '', state.choiceId || ''];
            const body = new URLSearchParams({
              at: tokens.at,
              'f.req': JSON.stringify([null, JSON.stringify([[message], null, context])]),
            });
            const url = `/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${queryParams}`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
              const res = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
                  'x-same-domain': '1',
                },
                body,
                signal: controller.signal,
              });
              if (res.status === 400 && !forceRefreshTokens) return sendOnce(true);
              if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(`Gemini API error (${res.status}): ${body.slice(0, 240)}`);
              }
              return parseResponse(await res.text());
            } finally {
              clearTimeout(timer);
            }
          }

          if (!keepProviderState) {
            state.conversationId = '';
            state.responseId = '';
            state.choiceId = '';
          }
          return sendOnce(false);
        },
        { message: userMsg, newConversation: Boolean(req.newConversation), keepProviderState, cachedTokens },
      ) as string;

      if (!result.trim()) {
        logger.warn('[gemini] direct browser API returned empty text; falling back to UI path');
        return null;
      }

      return result;
    } catch (err) {
      logger.warn(`[gemini] direct browser API failed; falling back to UI path: ${(err as Error).message}`);
      return null;
    }
  }

  private async _startNewConversation(page: import('playwright').Page): Promise<void> {
    logger.info('[gemini] starting new conversation...');
    try {
      const btn = page.locator('button:has-text("New conversation"), button:has-text("New chat")').first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click();
        await new Promise(r => setTimeout(r, 1500));
        return;
      }
    } catch {}
    await page.goto('https://gemini.google.com/', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 2000));
  }

  private _rememberDirectTokensFromRequest(req: import('playwright').Request): void {
    try {
      const url = new URL(req.url());
      const bl = url.searchParams.get('bl') || '';
      const postData = req.postData() || '';
      const at = new URLSearchParams(postData).get('at') || '';
      if (!at || !bl) return;
      this._directTokens = { at, bl, fetchedAt: Date.now() };
      logger.info('[gemini] cached direct API tokens from live StreamGenerate request');
    } catch {
      // Best-effort cache only; direct mode can still use page extraction.
    }
  }
}

function shouldKeepProviderConversationState(req: ChatRequest): boolean {
  const providerMessages = req.messages
    .filter(message => message.role !== 'system')
    .filter(message => message.content.trim());
  return providerMessages.length === 1 && providerMessages[0]?.role === 'user';
}
