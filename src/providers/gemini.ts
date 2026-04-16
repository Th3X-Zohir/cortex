import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { BrowserContext, Locator } from 'playwright';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage } from './grok.js';

export class GeminiProvider extends BaseProvider {
  readonly name = 'gemini' as const;
  readonly loginUrl = 'https://gemini.google.com/app';
  readonly verifySelector = '.ql-editor, [contenteditable="true"], rich-textarea, .input-area textarea, .text-input-field';

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

    // Install fetch interceptor to capture Gemini's streaming response
    await this._ensureInitScript();

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    let _onGeminiPage = false;
    try { const _p = new URL(page.url()); _onGeminiPage = _p.hostname === 'gemini.google.com'; } catch { _onGeminiPage = false; }
    if (!_onGeminiPage) {
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    if (req.newConversation) {
      await this._startNewConversation(page);
    }

    const userMsg = buildUserMessage(req.messages);

    // Reset capture state before sending
    await page.evaluate(`
      window.__cortexGemini = { text:'', done:false, startTime:Date.now() };
    `);

    const editorSelectors = [
      'textarea.inputarea',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]',
      'rich-textarea',
      '.ql-editor',
      '.input-area textarea',
      '.text-input-field',
    ];

    let editor: Locator | null = null;
    for (const sel of editorSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        editor = page.locator(sel).first();
        logger.info(`[gemini] editor found: ${sel} (${count} elements)`);
        break;
      }
    }

    if (!editor) throw new Error('[gemini] could not find input editor element');
    await editor.waitFor({ timeout: 15000 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = await page.evaluate(`
      (() => {
        const el = document.querySelector('textarea.inputarea, [contenteditable="true"][role="textbox"], [contenteditable="true"], rich-textarea, .ql-editor, .input-area textarea, .text-input-field');
        if (!el) return { tagName: '', isEditable: false, className: '' };
        return {
          tagName: el.tagName?.toLowerCase() ?? '',
          isEditable: el.getAttribute('contenteditable') !== null || el.contentEditable === 'true',
          className: el.className ?? ''
        };
      })()
    `) as { tagName: string; isEditable: boolean; className: string };
    const tagName = info.tagName;
    const isEditable = info.isEditable;
    const className = info.className;
    logger.info(`[gemini] input tag=${tagName}, contenteditable=${isEditable}, class=${className}`);

    if (tagName === 'textarea' || tagName === 'input') {
      await editor.fill(userMsg);
    } else {
      await editor.click();
      await new Promise(r => setTimeout(r, 500));
      try {
        await editor.pressSequentially(userMsg, { delay: 50 });
      } catch (seqErr) {
        logger.warn(`[gemini] pressSequentially failed: ${(seqErr as Error).message}, trying keyboard.type...`);
        await page.keyboard.type(userMsg, { delay: 50 });
      }
    }

    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Enter');

    logger.debug(`[gemini] message sent (${userMsg.length} chars), streaming via fetch interception...`);

    // Poll the intercepted response text
    const timeout = 120000;
    const pollInterval = 400;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;
    let hasContent = false;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const result = await page.evaluate(`
        window.__cortexGemini ? {
          text: window.__cortexGemini.text || '',
          done: !!window.__cortexGemini.done
        } : { text:'', done:false }
      `) as { text: string; done: boolean };

      if (!result.text && !hasContent) continue;

      if (result.text.length > lastLength) {
        yield result.text.slice(lastLength);
        lastLength = result.text.length;
        stableCount = 0;
        hasContent = true;
      } else if (result.done) {
        logger.debug(`[gemini] stream complete (${lastLength} chars)`);
        return;
      } else {
        stableCount++;
        if (stableCount >= 4 && lastLength > 0) {
          logger.debug(`[gemini] response stable (${lastLength} chars)`);
          return;
        }
      }
    }

    // If fetch interception got nothing, fall back to DOM polling
    if (lastLength === 0) {
      logger.info('[gemini] fetch interception captured nothing, falling back to DOM polling...');
      yield* pollForResponseDOM(page);
    } else {
      logger.warn('[gemini] response polling timed out');
    }
  }

  /** Install fetch interceptor to capture Gemini's streaming API responses */
  private async _ensureInitScript(): Promise<void> {
    if (!this._ctx || this._ctx === this._patchedCtx) return;

    await this._ctx.addInitScript(`
      (() => {
        if (window.__cortexGeminiPatched) return;

        window.__cortexGemini = { text: '', done: false, startTime: 0 };

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const res = await _fetch.apply(this, args);
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

          // Intercept Gemini's streaming API calls
          // Gemini uses $rpc endpoints and StreamGenerate-style calls
          if (url.includes('StreamGenerate') ||
              url.includes('generate') ||
              url.includes('$rpc') ||
              url.includes('BardFrontendService') ||
              url.includes('assistant.lamda') ||
              url.includes('conversation')) {

            const ct = res.headers.get('content-type') || '';
            // Gemini often returns application/x-protobuf-stream or text/event-stream
            if (!ct && !url.includes('$rpc')) return res;

            window.__cortexGemini.text = '';
            window.__cortexGemini.done = false;
            window.__cortexGemini.startTime = Date.now();

            const clone = res.clone();
            (async () => {
              try {
                const reader = clone.body.getReader();
                const decoder = new TextDecoder();
                let fullBuffer = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { window.__cortexGemini.done = true; break; }
                  const chunk = decoder.decode(value, { stream: true });
                  fullBuffer += chunk;

                  // Gemini returns JSON arrays or streaming JSON
                  // Try to extract text from various response formats
                  try {
                    // Format 1: Nested JSON arrays (Bard/Gemini legacy)
                    // The response text is typically in deeply nested arrays
                    const textMatches = fullBuffer.match(/"([^"]{20,})"/g);
                    if (textMatches) {
                      // Find the longest string - usually the actual response
                      let longest = '';
                      for (const m of textMatches) {
                        const s = m.slice(1, -1);
                        if (s.length > longest.length && !s.includes('\\\\u') && !s.startsWith('http')) {
                          longest = s;
                        }
                      }
                      if (longest.length > window.__cortexGemini.text.length) {
                        // Unescape JSON string
                        window.__cortexGemini.text = longest
                          .replace(/\\\\n/g, '\\n')
                          .replace(/\\\\t/g, '\\t')
                          .replace(/\\\\"/g, '"')
                          .replace(/\\\\\\\\/g, '\\\\');
                      }
                    }
                  } catch {}

                  // Format 2: SSE data lines
                  const lines = fullBuffer.split('\\n');
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') continue;
                    try {
                      const d = JSON.parse(raw);
                      // OpenAI-compatible
                      if (d.choices?.[0]?.delta?.content) {
                        window.__cortexGemini.text += d.choices[0].delta.content;
                      }
                      // Gemini candidate format
                      if (d.candidates?.[0]?.content?.parts?.[0]?.text) {
                        window.__cortexGemini.text = d.candidates[0].content.parts[0].text;
                      }
                    } catch {}
                  }
                }
              } catch {
                window.__cortexGemini.done = true;
              }
            })();
          }
          return res;
        };

        window.__cortexGeminiPatched = true;
      })()
    `);

    this._patchedCtx = this._ctx;
    logger.debug('[gemini] addInitScript installed on context');

    // Reload current page so init script takes effect
    const page = this._ctx.pages()[0];
    let _onGeminiPageR = false;
    try { const _p = new URL(page?.url() ?? ''); _onGeminiPageR = _p.hostname === 'gemini.google.com'; } catch { _onGeminiPageR = false; }
    if (page && _onGeminiPageR) {
      logger.debug('[gemini] reloading page for init script...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  private async _startNewConversation(page: import('playwright').Page): Promise<void> {
    logger.info('[gemini] starting new conversation...');

    const newChatBtn = page.locator(
      'button:has-text("New conversation"), button:has-text("New chat"), ' +
      '[data-testid="new-chat-btn"], button[aria-label*="New"]'
    ).first();

    if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newChatBtn.click();
      await new Promise(r => setTimeout(r, 1500));
      logger.info('[gemini] new conversation started');
    } else {
      logger.info('[gemini] new conversation button not found — trying direct navigation');
      await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    await page.locator('.ql-editor, [contenteditable="true"], rich-textarea, .input-area textarea, .text-input-field').waitFor({ timeout: 15000 });
  }
}

/** DOM-based fallback for response extraction */
async function* pollForResponseDOM(
  page: import('playwright').Page,
): AsyncGenerator<string> {
  const selectors = [
    'model-response .markdown',
    'model-response message-content',
    '.response-container .markdown',
    '[class*="response"] .markdown',
    'message-content .markdown',
    '.model-response-text',
    // Current Gemini UI selectors
    '.response-content',
    '.message-body-content',
    '[data-content-type="response"]',
    // Generic fallbacks
    '.markdown:last-of-type',
    '[data-message-id] .markdown',
  ];

  const timeout = 60000;
  const pollInterval = 500;
  const start = Date.now();
  let lastLength = 0;
  let stableCount = 0;
  let matchedSelector = '';

  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));

    if (!matchedSelector) {
      for (const sel of selectors) {
        const count = await page.locator(sel).count().catch(() => 0);
        if (count > 0) {
          matchedSelector = sel;
          logger.debug(`[gemini] DOM fallback matched selector: ${sel}`);
          break;
        }
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
      yield text.slice(lastLength);
      lastLength = text.length;
      stableCount = 0;
    } else {
      stableCount++;
      if (stableCount >= 3 && lastLength > 0) {
        logger.debug(`[gemini] DOM fallback complete (${lastLength} chars)`);
        return;
      }
    }
  }

  logger.warn('[gemini] DOM fallback timed out');
}
