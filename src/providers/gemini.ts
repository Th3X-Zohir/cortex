/* global document */
declare const document: any;
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

    // Log ALL network requests to find where the response comes from
    const allRequests: string[] = [];
    const onRequest = (req: import('playwright').Request) => {
      const url = req.url();
      allRequests.push(`REQ ${req.method()} ${url.slice(0, 200)}`);
      if (allRequests.length <= 50) {
        logger.info(`[gemini-NET] ${req.method()} ${url.slice(0, 200)}`);
      }
    };
    const onResponse = (res: import('playwright').Response) => {
      const url = res.url();
      allRequests.push(`RES ${res.status()} ${url.slice(0, 200)}`);
      if (allRequests.length <= 50) {
        logger.info(`[gemini-NET-RES] ${res.status()} ${url.slice(0, 200)}`);
      }
    };
    page.on('request', onRequest);
    page.on('response', onResponse);

    const inputEl = await this._findInputElement(page);
    if (!inputEl) {
      page.off('request', onRequest);
      page.off('response', onResponse);
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
    logger.info(`[gemini] message sent, waiting for response...`);

    // === POLL FOR RESPONSE USING DOM ===
    // The response appears in STRUCTURED-CONTENT-CONTAINER or .model-response-text
    // Track by NEW content appearing (not pre-existing messages)
    const start = Date.now();
    const pollInterval = 250;
    const timeout = 30000;
    let lastKnownText = '';
    let stableCount = 0;

    // First, record what messages already exist so we can ignore them
    const initialText = await page.evaluate(() => {
      const containers = document.querySelectorAll('STRUCTURED-CONTENT-CONTAINER, .model-response-text, [class*="model-response"]');
      if (!containers.length) return '';
      const last = containers[containers.length - 1];
      return (last.textContent || '').trim();
    }) as string;
    logger.info(`[gemini] initial response text: "${initialText.slice(0, 50)}"`);
    lastKnownText = initialText;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const elapsed = Date.now() - start;

      // Check DOM for response
      const result = await page.evaluate(() => {
        // Find ALL potential response containers
        const containers = document.querySelectorAll('STRUCTURED-CONTENT-CONTAINER, .model-response-text, [class*="model-response"]');
        if (!containers || containers.length === 0) return { text: '', count: 0, texts: [] };

        const texts: string[] = [];
        for (const c of containers) {
          const t = (c.textContent || '').trim();
          if (t) texts.push(t);
        }

        // Get last container text
        const last = containers[containers.length - 1];
        const lastText = (last.textContent || '').trim();

        return { text: lastText, count: containers.length, texts };
      }) as { text: string; count: number; texts: string[] };

      if (elapsed % 1000 < pollInterval) {
        logger.info(`[gemini] DOM poll@${elapsed}ms: ${result.count} containers, last="${result.text.slice(0, 60)}"`);
      }

      // Check for NEW content that wasn't there before
      if (result.text && result.text !== lastKnownText && result.text.length > 0) {
        const newContent = result.text.slice(lastKnownText.length);
        if (newContent.length > 0) {
          logger.info(`[gemini] NEW content found: "${newContent.slice(0, 80)}" (total: ${result.text.length})`);
          yield newContent;
          lastKnownText = result.text;
          stableCount = 0;
        }
      } else if (result.text === lastKnownText && result.text.length > 0) {
        stableCount++;
        if (stableCount >= 4) {
          logger.info(`[gemini] response complete (${result.text.length} chars, stable)`);
          break;
        }
      }

      // Check if response shows "thinking" or generating indicator is gone
      if (result.text && !result.text.includes('Thinking') && !result.text.includes('Generating')) {
        if (result.text.length > lastKnownText.length || (stableCount >= 3 && result.text.length > 0)) {
          if (result.text !== lastKnownText) {
            const newContent = result.text.slice(lastKnownText.length);
            if (newContent.length > 0) {
              logger.info(`[gemini] yield: "${newContent.slice(0, 80)}"`);
              yield newContent;
              lastKnownText = result.text;
            }
          }
          if (stableCount >= 4) {
            logger.info(`[gemini] done (${lastKnownText.length} chars)`);
            break;
          }
        }
      }
    }

    // Cleanup
    page.off('request', onRequest);
    page.off('response', onResponse);

    // Log all network requests at the end for analysis
    if (allRequests.length > 0) {
      logger.info(`[gemini] All ${allRequests.length} requests captured (showing first 20):`);
      for (const r of allRequests.slice(0, 20)) {
        logger.info(`[gemini-NET-FINAL] ${r}`);
      }
    }

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
