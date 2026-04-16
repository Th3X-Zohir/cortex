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

    // Install fetch interceptor
    await this._injectInterceptor(page);

    const userMsg = buildUserMessage(req.messages);

    // Reset capture state
    await page.evaluate(`
      window.__cortexGemini = { text:'', done:false, startTime:Date.now(), fetchHits:0 };
    `);

    // Find and fill the input
    const inputEl = await this._findInputElement(page);
    if (!inputEl) throw new Error('[gemini] could not find input element');

    const elInfo = await inputEl.evaluate((el) => ({
      tag: el.tagName,
      contentEditable: el.contentEditable,
      className: el.className?.substring(0, 60)
    }));
    logger.info(`[gemini] INPUT: ${elInfo.tag} contentEditable=${elInfo.contentEditable} class="${elInfo.className}"`);

    const tagName = elInfo.tag?.toLowerCase() ?? '';
    if (tagName === 'textarea' || tagName === 'input') {
      await inputEl.fill(userMsg);
    } else {
      await inputEl.click();
      await new Promise(r => setTimeout(r, 300));
      try {
        await inputEl.pressSequentially(userMsg, { delay: 30 });
      } catch (seqErr) {
        logger.warn(`[gemini] pressSequentially failed: ${(seqErr as Error).message}`);
        await page.keyboard.type(userMsg, { delay: 30 });
      }
    }

    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.press('Enter');
    logger.info(`[gemini] message sent, waiting for response...`);

    // Poll loop
    const timeout = 20000;
    const pollInterval = 200;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;
    let hasContent = false;
    let domYielded = false;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const result = await page.evaluate(`
        window.__cortexGemini ? {
          text: window.__cortexGemini.text || '',
          done: !!window.__cortexGemini.done,
          fetchHits: window.__cortexGemini.fetchHits || 0
        } : { text:'', done:false, fetchHits:0 }
      `) as { text: string; done: boolean; fetchHits: number };

      const elapsed = Date.now() - start;

      // Fetch intercept is capturing content
      if (result.text.length > lastLength) {
        const newContent = result.text.slice(lastLength);
        logger.info(`[gemini] fetch chunk: +${newContent.length} chars (total: ${result.text.length})`);
        yield newContent;
        lastLength = result.text.length;
        stableCount = 0;
        hasContent = true;
        domYielded = false;
      } else if (result.done) {
        logger.info(`[gemini] stream done (${lastLength} chars)`);
        return;
      } else {
        stableCount++;
        if (stableCount >= 3 && lastLength > 0) {
          logger.info(`[gemini] response stable (${lastLength} chars)`);
          return;
        }
      }

      // If fetch has hits and we have content, great — keep polling
      // If fetch has NO hits after 2s and we have no content, try DOM
      if (result.fetchHits === 0 && !hasContent && elapsed > 2000) {
        logger.info(`[gemini] no fetch intercept after ${elapsed}ms, checking DOM...`);
        yield* this._pollForResponseDOM(page, start);
        return;
      }

      // If fetch has hits but no content for 5s, fall back to DOM
      if (!hasContent && elapsed > 5000 && result.fetchHits > 0) {
        logger.info(`[gemini] fetch intercept active but no content after ${elapsed}ms, falling back to DOM...`);
        yield* this._pollForResponseDOM(page, start);
        return;
      }

      // Log progress every 5s
      if (elapsed > 5000 && elapsed % 5000 < pollInterval) {
        logger.info(`[gemini] polling... (${elapsed}ms, fetchHits=${result.fetchHits}, textLen=${result.text.length})`);
      }
    }

    logger.warn(`[gemini] timeout after ${lastLength} chars`);
    yield* this._pollForResponseDOM(page, start);
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
      if (count > 0) {
        return page.locator(sel).first();
      }
    }
    return null;
  }

  private async _injectInterceptor(page: import('playwright').Page): Promise<void> {
    page.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('[GEMINI-')) {
        logger.info(`[gemini-browser] ${text}`);
      }
    });

    const alreadyPatched = await page.evaluate(`
      (() => {
        if (window.__cortexGeminiPatched) return true;
        window.__cortexGeminiPatched = true;
        return false;
      })()
    `);

    if (alreadyPatched) return;

    await page.evaluate(`
      (() => {
        window.__cortexGemini = { text: '', done: false, startTime: 0, fetchHits: 0 };

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
          const res = await _fetch.apply(this, args);

          // ONLY intercept the actual Gemini streaming endpoint
          // Gemini uses specific paths - be surgical, not broad
          const isGeminiStream =
            url.includes('/v1beta/gemini') ||
            url.includes('/v1/gemini') ||
            url.includes('generateContent') ||
            url.includes('streamGenerateContent') ||
            (url.includes('gemini') && url.includes('generate')) ||
            (url.includes('googleapis.com') && url.includes('model'));

          if (!isGeminiStream) return res;

          const ct = res.headers.get('content-type') || '';
          console.log('[GEMINI-API-HIT]', url.slice(0, 150));
          console.log('[GEMINI-API-CT]', ct.slice(0, 100));

          window.__cortexGemini.fetchHits = (window.__cortexGemini.fetchHits || 0) + 1;
          window.__cortexGemini.text = '';
          window.__cortexGemini.done = false;

          const clone = res.clone();
          (async () => {
            try {
              const reader = clone.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';
              let seq = 0;
              while (true) {
                const { done, value } = await reader.read();
                if (done) {
                  console.log('[GEMINI-STREAM-DONE]');
                  window.__cortexGemini.done = true;
                  break;
                }
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                seq++;

                if (seq <= 5 || seq % 20 === 0) {
                  console.log('[GEMINI-CHUNK]', seq, JSON.stringify(chunk).slice(0, 200));
                }

                // Try to extract text from SSE lines
                const lines = buffer.split('\\n');
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed || trimmed === '[DONE]') continue;
                  if (!trimmed.startsWith('data: ')) continue;
                  const jsonStr = trimmed.slice(6);
                  try {
                    const d = JSON.parse(jsonStr);

                    // Gemini candidate format with streaming
                    if (d.candidates?.[0]?.content?.parts?.[0]?.text) {
                      const t = d.candidates[0].content.parts[0].text;
                      if (t && t.length > window.__cortexGemini.text.length) {
                        window.__cortexGemini.text = t;
                        console.log('[GEMINI-EXTRACT]', t.length, 'chars:', t.slice(0, 50));
                      }
                    }
                    // Simple text field
                    if (d.text) {
                      if (d.text.length > window.__cortexGemini.text.length) {
                        window.__cortexGemini.text = d.text;
                        console.log('[GEMINI-EXTRACT]', d.text.length, 'chars');
                      }
                    }
                  } catch {}
                }
              }
              console.log('[GEMINI-STREAM-END] final:', window.__cortexGemini.text.length, 'chars');
            } catch (e) {
              console.log('[GEMINI-STREAM-ERR]', String(e));
              window.__cortexGemini.done = true;
            }
          })();
          return res;
        };
        console.log('[GEMINI] interceptor ready');
      })()
    `);
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

  private async *_pollForResponseDOM(
    page: import('playwright').Page,
    startTime: number,
  ): AsyncGenerator<string> {
    logger.info('[gemini] DOM polling started — doing deep scan to find response element...');

    // Deep scan to find response text container
    const scanResult = await page.evaluate(`
      (() => {
        const inputEl = document.querySelector('.ql-editor, [contenteditable="true"]');

        // Look for message-role elements first (most specific)
        const byRole = document.querySelectorAll('[data-message-author-role="assistant"], [data-message-author-role="model"]');
        const roleResults = Array.from(byRole).map(el => ({
          tag: el.tagName,
          class: el.className?.substring(0, 80),
          id: el.id,
          text: el.textContent?.trim().substring(0, 100),
          dataTestId: el.getAttribute('data-testid'),
          role: el.getAttribute('data-message-author-role'),
          childCount: el.children.length,
          score: 100 // highest priority
        }));

        // Find all other elements
        const candidates = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        let el;
        while (el = walker.nextNode()) {
          if (el === inputEl) continue;
          const text = el.textContent?.trim() || '';
          if (text.length < 20) continue;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          // Skip root app containers and nav/sidebar
          const cls = el.className || '';
          const skipTags = ['APP-ROOT', 'NAV', 'ASIDE', 'HEADER', 'FOOTER', 'NOSCRIPT'];
          const skipClasses = ['nav', 'sidebar', 'menu', 'header', 'footer', 'chat-app', 'app-root', 'ng-tns', 'ng-host'];
          if (skipTags.includes(el.tagName)) continue;
          if (skipClasses.some(c => cls.includes(c))) continue;

          // Score based on response/message indicators
          let score = 0;
          if (el.getAttribute('data-message-author-role')) score = 50;
          else if (el.getAttribute('data-testid')?.includes('message')) score = 30;
          else if (el.getAttribute('data-testid')?.includes('response')) score = 25;
          else if (cls.includes('message-body')) score = 20;
          else if (cls.includes('response-text') || cls.includes('response-content')) score = 20;
          else if (cls.includes('answer') && !cls.includes('nav')) score = 10;
          else if (text.length < 500) score = 3; // prefer smaller, focused elements
          else if (text.length > 3000) score = -10; // penalize huge elements

          candidates.push({
            tag: el.tagName,
            class: cls.substring(0, 80),
            id: el.id,
            text: text.substring(0, 100),
            dataTestId: el.getAttribute('data-testid'),
            role: el.getAttribute('role'),
            childCount: el.children.length,
            score
          });
        }

        // Combine and sort by score descending
        const all = [...roleResults, ...candidates];
        all.sort((a, b) => b.score - a.score);
        return all.slice(0, 15);
      })()
    `);

    logger.info('[gemini] DOM scan results: ' + JSON.stringify(scanResult).slice(0, 500));

    // Build selectors from the scan results
    type ScanEntry = { tag: string; class: string; id: string; text: string; dataTestId: string; role: string; childCount: number; score: number };
    const typedResult = scanResult as ScanEntry[] | null;
    if (!typedResult || typedResult.length === 0) {
      logger.warn('[gemini] DOM scan returned null/empty');
      return;
    }
    const discoveredSelectors: string[] = [];
    for (const c of typedResult) {
      if (c.role && (c.role === 'assistant' || c.role === 'model')) {
        discoveredSelectors.push(`[data-message-author-role="${c.role}"]`);
      }
      if (c.dataTestId) discoveredSelectors.push(`[data-testid="${c.dataTestId}"]`);
      if (c.id) discoveredSelectors.push(`#${c.id}`);
    }

    const selectors = [
      ...discoveredSelectors,
      '[data-testid*="response"]',
      '[data-message-content]',
      '[class*="response"]',
      '[class*="message"]',
      '[class*="answer"]',
      '[class*="gemini"]',
      '[role="article"]',
      '[role="log"]',
      'article',
    ];

    const timeout = 15000;
    const pollInterval = 200;
    let lastLength = 0;
    let stableCount = 0;
    let matchedSelector = '';

    while (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      if (!matchedSelector) {
        for (const sel of selectors) {
          const count = await page.locator(sel).count().catch(() => 0);
          if (count > 0) {
            matchedSelector = sel;
            logger.info(`[gemini] DOM matched: ${sel} (${count})`);
            break;
          }
        }
        if (!matchedSelector) continue;
      }

      // Get all matching elements and find the LAST one that has content
      const allEls = page.locator(matchedSelector);
      const count = await allEls.count().catch(() => 0);
      let foundText = '';
      for (let i = count - 1; i >= 0; i--) {
        const text = await allEls.nth(i).textContent().catch(() => '');
        if (text && text.trim().length > 5) {
          foundText = text.trim();
          break;
        }
      }

      if (!foundText) continue;

      if (foundText.length > lastLength) {
        const newText = foundText.slice(lastLength);
        logger.info(`[gemini] DOM yield: +${newText.length} chars (total: ${foundText.length})`);
        yield newText;
        lastLength = foundText.length;
        stableCount = 0;
      } else {
        stableCount++;
        if (stableCount >= 4 && lastLength > 0) {
          logger.info(`[gemini] DOM complete (${lastLength} chars)`);
          return;
        }
      }
    }

    logger.warn('[gemini] DOM polling timed out');
  }
}
