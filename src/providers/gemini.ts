/* global document window */
declare const document: any;
declare const window: any;
import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { BrowserContext } from 'playwright';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage } from './grok.js';

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

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
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

    if (req.newConversation) {
      await this._startNewConversation(page);
    }

    const userMsg = buildUserMessage(req.messages);

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

    // Input the message
    const tagName = elInfo.tag?.toLowerCase() ?? '';
    if (tagName === 'textarea' || tagName === 'input') {
      await inputEl.fill(userMsg);
    } else {
      await inputEl.click();
      await new Promise(r => setTimeout(r, 300));
      try {
        await inputEl.pressSequentially(userMsg, { delay: 50 });
      } catch (seqErr) {
        logger.warn(`[gemini] pressSequentially failed: ${(seqErr as Error).message}`);
        await page.keyboard.type(userMsg, { delay: 50 });
      }
    }

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
}
