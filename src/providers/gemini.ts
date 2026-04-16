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
      logger.info(`[gemini] navigating to ${this.loginUrl} (current: ${page.url().slice(0, 80)})`);
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 3000));
    }

    logger.info(`[gemini] current URL after nav: ${page.url()}`);

    // Deep DOM analysis to find the actual editable element
    const domInfo = await page.evaluate(`
      (() => {
        // Find ALL elements with contentEditable
        const editableEls = [];
        const allEls = document.querySelectorAll('*');
        for (const el of allEls) {
          const ce = el.contentEditable;
          if (ce && ce !== 'inherit') {
            editableEls.push({
              tag: el.tagName,
              contentEditable: ce,
              id: el.id,
              className: el.className?.substring(0, 80),
              ariaLabel: el.getAttribute('aria-label'),
              role: el.getAttribute('role'),
              attrs: Array.from(el.attributes).map(a => a.name + '=' + a.value?.substring(0, 30)).join(', ')
            });
          }
        }
        // Find textarea/input elements
        const inputs = [];
        const inputEls = document.querySelectorAll('textarea, input[type="text"], [role="textbox"]');
        for (const el of inputEls) {
          inputs.push({
            tag: el.tagName,
            id: el.id,
            className: el.className?.substring(0, 80),
            type: el.type,
            placeholder: el.getAttribute('placeholder'),
            ariaLabel: el.getAttribute('aria-label')
          });
        }
        return { editableEls, inputs, url: window.location.href };
      })()
    `) as { editableEls: Array<{tag: string; contentEditable: string; id: string; className: string; ariaLabel: string; role: string; attrs: string}>; inputs: Array<{tag: string; id: string; className: string; type: string; placeholder: string; ariaLabel: string}>; url: string };

    logger.info(`[gemini] DOM @ ${domInfo.url}:`);
    logger.info(`[gemini]   editable elements (${domInfo.editableEls.length}): ${JSON.stringify(domInfo.editableEls.slice(0, 5)).slice(0, 300)}`);
    logger.info(`[gemini]   input/textarea elements (${domInfo.inputs.length}): ${JSON.stringify(domInfo.inputs.slice(0, 5)).slice(0, 300)}`);

    if (req.newConversation) {
      await this._startNewConversation(page);
    }

    // Install fetch interceptor with deep logging
    await this._injectInterceptorWithLogging(page);

    const userMsg = buildUserMessage(req.messages);

    // Reset capture state before sending
    await page.evaluate(`
      window.__cortexGemini = { text:'', done:false, startTime:Date.now(), fetchHits:0 };
    `);

    // Find the best input element
    const inputEl = await this._findInputElement(page);
    if (!inputEl) throw new Error('[gemini] could not find input element');

    const elInfo = await inputEl.evaluate((el) => ({
      tag: el.tagName,
      contentEditable: el.contentEditable,
      className: el.className?.substring(0, 80),
      id: el.id,
      ariaLabel: el.getAttribute('aria-label'),
      role: el.getAttribute('role'),
      tagName: el.tagName?.toLowerCase()
    }));
    logger.info(`[gemini] INPUT ELEMENT: ${JSON.stringify(elInfo)}`);

    const tagName = elInfo.tag?.toLowerCase() ?? '';
    if (tagName === 'textarea' || tagName === 'input') {
      await inputEl.fill(userMsg);
      logger.info(`[gemini] filled via fill() (${userMsg.length} chars)`);
    } else {
      await inputEl.click();
      await new Promise(r => setTimeout(r, 500));
      try {
        await inputEl.pressSequentially(userMsg, { delay: 30 });
        logger.info(`[gemini] typed via pressSequentially (${userMsg.length} chars)`);
      } catch (seqErr) {
        logger.warn(`[gemini] pressSequentially failed: ${(seqErr as Error).message}`);
        await page.keyboard.type(userMsg, { delay: 30 });
        logger.info(`[gemini] typed via keyboard.type (${userMsg.length} chars)`);
      }
    }

    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Enter');
    logger.info(`[gemini] message sent, waiting for response...`);

    // Poll with verbose logging
    const timeout = 120000;
    const pollInterval = 300;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;
    let hasContent = false;
    let firstChunkTime = 0;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const result = await page.evaluate(`
        window.__cortexGemini ? {
          text: window.__cortexGemini.text || '',
          done: !!window.__cortexGemini.done,
          fetchHits: window.__cortexGemini.fetchHits || 0,
          chunks: window.__cortexGemini.chunks || [],
          rawLog: window.__cortexGemini.rawLog || []
        } : { text:'', done:false, fetchHits:0, chunks: [], rawLog: [] }
      `) as { text: string; done: boolean; fetchHits: number; chunks: string[]; rawLog: string[] };

      if (result.fetchHits > 0 && !hasContent) {
        logger.info(`[gemini] fetch interception ACTIVE (${result.fetchHits} hits)`);
      }

      if (!result.text && !hasContent) {
        const elapsed = Date.now() - start;
        if (elapsed > 5000) {
          logger.info(`[gemini] polling... (${elapsed}ms elapsed, no content yet)`);
        }
        if (elapsed > 30000) {
          logger.info(`[gemini] no content after ${elapsed}ms, checking DOM...`);
          // Check DOM for response
          const responseEl = await page.evaluate(`
            (() => {
              const selectors = [
                '.response-text', '.message-text', '[class*="response"]',
                '[class*="answer"]', '[class*="result"]', '[class*="output"]',
                '[data-testid*="response"]', '[role="article"]'
              ];
              for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el && el.textContent?.trim()) {
                  return { sel, text: el.textContent.trim().substring(0, 200) };
                }
              }
              return null;
            })()
          `) as { sel: string; text: string } | null;
          if (responseEl) {
            logger.info(`[gemini] DOM response found: ${responseEl.text}`);
          }
        }
        continue;
      }

      if (result.text.length > lastLength) {
        if (!firstChunkTime) firstChunkTime = Date.now() - start;
        const newContent = result.text.slice(lastLength);
        logger.info(`[gemini] chunk: ${newContent.length} chars (total: ${result.text.length}, +${firstChunkTime}ms to first)`);
        yield newContent;
        lastLength = result.text.length;
        stableCount = 0;
        hasContent = true;
      } else if (result.done) {
        logger.info(`[gemini] stream complete (${lastLength} chars)`);
        return;
      } else {
        stableCount++;
        if (stableCount >= 5 && lastLength > 0) {
          logger.info(`[gemini] response stable (${lastLength} chars)`);
          return;
        }
      }
    }

    if (lastLength === 0) {
      logger.warn('[gemini] response polling timed out with no content');
      yield* this._pollForResponseDOM(page);
    } else {
      logger.warn(`[gemini] response timeout after ${lastLength} chars`);
    }
  }

  private async _findInputElement(page: import('playwright').Page) {
    const selectors = [
      'textarea.inputarea',
      '[contenteditable="true"]',
      '[contenteditable="plaintext-only"]',
      'textarea',
      'input[type="text"]',
      '[role="textbox"]',
      '.input-area textarea',
      '.text-input-field',
    ];

    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        const info = await page.locator(sel).first().evaluate((el) => ({
          tag: el.tagName,
          contentEditable: el.contentEditable,
          className: el.className?.substring(0, 60)
        }));
        logger.info(`[gemini] trying selector "${sel}": tag=${info.tag}, contentEditable=${info.contentEditable}`);
        return page.locator(sel).first();
      }
    }
    return null;
  }

  private async _injectInterceptorWithLogging(page: import('playwright').Page): Promise<void> {
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

    if (alreadyPatched) {
      logger.info('[gemini] interceptor already installed');
      return;
    }

    await page.evaluate(`
      (() => {
        window.__cortexGemini = { text: '', done: false, startTime: 0, fetchHits: 0, chunks: [], rawLog: [] };

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
          const method = args[1]?.method || 'GET';

          console.log('[GEMINI-FETCH]', method, url.substring(0, 200));

          const res = await _fetch.apply(this, args);

          const ct = res.headers.get('content-type') || '';
          console.log('[GEMINI-FETCH-RES]', method, url.substring(0, 200), 'ct=', ct.substring(0, 80));

          // Intercept potential Gemini streaming endpoints
          const isGeminiAPI = url.includes('gemini') ||
                             url.includes('google') ||
                             url.includes('generate') ||
                             url.includes('StreamGenerate') ||
                             url.includes('predict') ||
                             url.includes('$rpc') ||
                             url.includes('BardFrontendService') ||
                             url.includes('assistant') ||
                             url.includes('conversation') ||
                             url.includes('v1beta') ||
                             url.includes('ai.google');

          if (isGeminiAPI) {
            window.__cortexGemini.fetchHits = (window.__cortexGemini.fetchHits || 0) + 1;
            console.log('[GEMINI-API-HIT]', url.substring(0, 200));
            console.log('[GEMINI-API-CT]', ct.substring(0, 200));

            const clone = res.clone();
            (async () => {
              try {
                const reader = clone.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let seq = 0;
                let totalChars = 0;
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) {
                    console.log('[GEMINI-STREAM-DONE]', 'total chars:', totalChars, 'buffer:', buffer.slice(-200));
                    window.__cortexGemini.done = true;
                    break;
                  }
                  const chunk = decoder.decode(value, { stream: true });
                  const chunkLen = chunk.length;
                  totalChars += chunkLen;
                  buffer += chunk;
                  seq++;

                  // Log raw chunk periodically
                  if (seq <= 20 || seq % 50 === 0) {
                    console.log('[GEMINI-CHUNK]', seq, chunkLen, 'chars, buffer:', buffer.length, 'raw:', JSON.stringify(chunk).slice(0, 150));
                  }

                  // Try to extract content from buffer
                  let extracted = '';

                  // Try SSE format: data: {...}
                  const lines = buffer.split('\\n');
                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]' || trimmed === '[DONE]') continue;
                    if (!trimmed.startsWith('data: ')) continue;
                    const jsonStr = trimmed.slice(6);
                    try {
                      const d = JSON.parse(jsonStr);
                      console.log('[GEMINI-SSE-PARSE]', seq, JSON.stringify(d).slice(0, 300));

                      // Gemini candidate format
                      if (d.candidates?.[0]?.content?.parts?.[0]?.text) {
                        extracted = d.candidates[0].content.parts[0].text;
                        console.log('[GEMINI-EXTRACT]', 'candidates format, text len:', extracted.length);
                      }
                      // Streaming candidate
                      if (d.candidates?.[0]?.delta?.content?.parts?.[0]?.text) {
                        extracted = d.candidates[0].delta.content.parts[0].text;
                      }
                      // Simple streaming
                      if (d.text) {
                        extracted = d.text;
                        console.log('[GEMINI-EXTRACT]', 'simple text, len:', extracted.length);
                      }
                      // OpenAI delta
                      if (d.choices?.[0]?.delta?.content) {
                        extracted = d.choices[0].delta.content;
                      }
                    } catch {}
                  }

                  // Try protobuf/array format (Gemini's actual format)
                  // Look for long strings in the raw buffer
                  const stringMatches = buffer.match(/"([^\"]{50,})"/g);
                  if (stringMatches && stringMatches.length > 0) {
                    for (const m of stringMatches) {
                      const s = m.slice(1, -1);
                      if (s.length > extracted.length && !s.includes('\\\\u') && !s.startsWith('http') && !s.includes('function') && !s.includes('=>') && !s.includes('Promise')) {
                        extracted = s;
                      }
                    }
                  }

                  if (extracted && extracted.length > window.__cortexGemini.text.length) {
                    window.__cortexGemini.text = extracted;
                    window.__cortexGemini.chunks = window.__cortexGemini.chunks || [];
                    window.__cortexGemini.chunks.push(extracted);
                    console.log('[GEMINI-ACCEPT]', 'extracted len:', extracted.length, 'total:', window.__cortexGemini.text.length);
                  }
                }
                console.log('[GEMINI-STREAM-END]', 'final text len:', window.__cortexGemini.text.length);
              } catch (e) {
                console.log('[GEMINI-STREAM-ERROR]', String(e));
                window.__cortexGemini.done = true;
              }
            })();
          }
          return res;
        };
        console.log('[GEMINI] fetch interceptor installed');
      })()
    `);
  }

  private async _startNewConversation(page: import('playwright').Page): Promise<void> {
    logger.info('[gemini] starting new conversation...');

    try {
      // Try to find and click "New conversation" button
      const newChatBtn = page.locator(
        'button:has-text("New conversation"), button:has-text("New chat"), ' +
        '[data-testid*="new-chat"], button[aria-label*="New conversation"]'
      ).first();

      if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await newChatBtn.click();
        await new Promise(r => setTimeout(r, 2000));
        logger.info('[gemini] new conversation started via button click');
        return;
      }
    } catch {}

    logger.info('[gemini] new conversation button not found — trying keyboard shortcut');
    // Try Ctrl+K or Escape to open new conversation
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 500));

    // Try navigating to fresh URL
    await page.goto('https://gemini.google.com/', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 3000));
  }

  private async *_pollForResponseDOM(
    page: import('playwright').Page,
  ): AsyncGenerator<string> {
    logger.info('[gemini] DOM polling fallback started');

    // First, deep DOM scan
    const domScan = await page.evaluate(`
      (() => {
        // Get all visible text containers
        const results = [];
        const els = document.querySelectorAll('*');
        for (const el of els) {
          const text = el.textContent?.trim();
          if (text && text.length > 20 && text.length < 5000) {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              results.push({
                tag: el.tagName,
                class: el.className?.substring(0, 50),
                text: text.substring(0, 100),
                visible: style.display !== 'none'
              });
            }
          }
        }
        return results.slice(0, 30);
      })()
    `);
    logger.info(`[gemini] DOM scan results: ${JSON.stringify(domScan).slice(0, 500)}`);

    const selectors = [
      '.response-text',
      '.message-text',
      '[class*="response"]',
      '[class*="answer"]',
      '[class*="result"]',
      '[class*="output"]',
      '[class*="gemini"]',
      '[data-testid*="response"]',
      '[role="article"]',
      '[role="log"]',
      'article',
      '.markdown',
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
            logger.info(`[gemini] DOM polling matched: ${sel} (${count} elements)`);
            break;
          }
        }
        if (!matchedSelector) {
          logger.info(`[gemini] DOM polling: no selectors matched yet (${Date.now() - start}ms)`);
          continue;
        }
      }

      const elements = page.locator(matchedSelector);
      const count = await elements.count().catch(() => 0);
      if (count === 0) continue;

      const lastEl = elements.last();
      const text = await lastEl.textContent().catch(() => '');
      if (!text) continue;

      if (text.length > lastLength) {
        const newText = text.slice(lastLength);
        logger.info(`[gemini] DOM yielding ${newText.length} chars (total: ${text.length})`);
        yield newText;
        lastLength = text.length;
        stableCount = 0;
      } else {
        stableCount++;
        if (stableCount >= 4 && lastLength > 0) {
          logger.info(`[gemini] DOM polling complete (${lastLength} chars)`);
          return;
        }
      }
    }

    logger.warn('[gemini] DOM polling timed out');
  }
}
