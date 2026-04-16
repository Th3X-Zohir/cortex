import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import type { BrowserContext } from 'playwright';
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
    const chunks: string[] = [];
    for await (const chunk of this.chatStream(req)) chunks.push(chunk);
    return chunks.join('');
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('Grok: not connected. Run login first.');

    const page = this._ctx.pages()[0] ?? await this._ctx.newPage();

    let _onGrokPage = false;
    try { const _p = new URL(page.url()); _onGrokPage = _p.hostname === 'grok.com' || _p.hostname.endsWith('.grok.com'); } catch { _onGrokPage = false; }
    if (!_onGrokPage) {
      await page.goto('https://grok.com', { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
    }

    await this._injectInterceptor(page);

    const userMsg = buildUserMessage(req.messages);

    await page.evaluate(`
      window.__cortexGrok = { text:'', done:false, startTime:Date.now(), fetchHits:0 };
    `);

    const editor = page.locator('.ProseMirror, [contenteditable="true"]').first();
    await editor.waitFor({ timeout: 10000 });
    await editor.click();
    await editor.evaluate((el: { focus: () => void }, msg: string) => {
      el.focus();
      (globalThis as any).document.execCommand('insertText', false, msg);
    }, userMsg);

    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Enter');

    logger.info(`[grok] message sent (${userMsg.length} chars)`);

    const timeout = 60000;
    const pollInterval = 300;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;
    let hasContent = false;
    let fetchHit = false;
    let firstChunkTime = 0;

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const result = await page.evaluate(`
        window.__cortexGrok ? {
          text: window.__cortexGrok.text || '',
          done: !!window.__cortexGrok.done,
          fetchHits: window.__cortexGrok.fetchHits || 0
        } : { text:'', done:false, fetchHits:0 }
      `) as { text: string; done: boolean; fetchHits: number };

      if (result.fetchHits > 0 && !fetchHit) {
        fetchHit = true;
        logger.info(`[grok] fetch interception ACTIVE (${result.fetchHits} hits)`);
      }

      if (!result.text && !hasContent) {
        const elapsed = Date.now() - start;
        if (elapsed > 8000 && !fetchHit) {
          logger.info(`[grok] no fetch intercept after ${elapsed}ms`);
        }
        if (elapsed > 15000) {
          logger.info('[grok] starting DOM fallback...');
          yield* pollForResponseDOM(page, true);
          return;
        }
        continue;
      }

      if (result.text.length > lastLength) {
        if (!firstChunkTime) firstChunkTime = Date.now() - start;
        yield result.text.slice(lastLength);
        lastLength = result.text.length;
        stableCount = 0;
        hasContent = true;
      } else if (result.done) {
        logger.info(`[grok] stream complete (${lastLength} chars)`);
        return;
      } else {
        stableCount++;
        if (stableCount >= 5 && lastLength > 0) {
          logger.info(`[grok] response stable (${lastLength} chars)`);
          return;
        }
      }
    }

    if (lastLength === 0) {
      logger.warn('[grok] timed out, falling back to DOM');
      yield* pollForResponseDOM(page, false);
    }
  }

  private async _injectInterceptor(page: import('playwright').Page): Promise<void> {
    await page.evaluate(`
      (() => {
        if (window.__cortexGrokPatched) return;

        window.__cortexGrok = { text: '', done: false, startTime: 0, fetchHits: 0 };

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const res = await _fetch.apply(this, args);
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

          if (url.includes('/rest/app-chat/conversations/') ||
              url.includes('/api/') ||
              url.includes('add-response') ||
              url.includes('chat/completions') ||
              url.includes('grok/share')) {

            window.__cortexGrok.fetchHits = (window.__cortexGrok.fetchHits || 0) + 1;
            window.__cortexGrok.text = '';
            window.__cortexGrok.done = false;
            window.__cortexGrok.startTime = Date.now();

            const clone = res.clone();
            (async () => {
              try {
                const reader = clone.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { window.__cortexGrok.done = true; break; }
                  buffer += decoder.decode(value, { stream: true });

                  const lines = buffer.split('\\n');
                  buffer = lines.pop() || '';
                  let parsed = false;

                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') {
                      if (raw === '[DONE]') window.__cortexGrok.done = true;
                      continue;
                    }
                    try {
                      const d = JSON.parse(raw);
                      if (d.choices && d.choices[0]?.delta?.content) {
                        window.__cortexGrok.text += d.choices[0].delta.content;
                        parsed = true;
                      }
                      if (d.result?.response) {
                        window.__cortexGrok.text = d.result.response;
                        parsed = true;
                      }
                      if (d.token && typeof d.token === 'string') {
                        window.__cortexGrok.text += d.token;
                        parsed = true;
                      }
                    } catch {}
                  }

                  if (!parsed && buffer.length > 0) {
                    try {
                      const j = JSON.parse(buffer);
                      if (j.result?.response) window.__cortexGrok.text = j.result.response;
                      else if (j.modelResponse?.message) window.__cortexGrok.text = j.modelResponse.message;
                    } catch {}
                  }
                }
              } catch {
                window.__cortexGrok.done = true;
              }
            })();
          }
          return res;
        };

        window.__cortexGrokPatched = true;
        console.log('[cortex] Grok fetch interceptor installed');
      })()
    `);
    logger.debug('[grok] interceptor injected');
  }
}

async function* pollForResponseDOM(
  page: import('playwright').Page,
  immediateFallback = false,
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

  logger.info(`[grok] DOM fallback started${immediateFallback ? ' (immediate)' : ''}`);

  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, pollInterval));

    if (!matchedSelector) {
      for (const sel of selectors) {
        const count = await page.locator(sel).count().catch(() => 0);
        if (count > 0) {
          matchedSelector = sel;
          logger.info(`[grok] DOM matched: ${sel} (${count} elements)`);
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
      logger.info(`[grok] DOM yielding ${text.length - lastLength} chars`);
      yield text.slice(lastLength);
      lastLength = text.length;
      stableCount = 0;
    } else {
      stableCount++;
      if (stableCount >= 3 && lastLength > 0) {
        logger.info(`[grok] DOM complete (${lastLength} chars)`);
        return;
      }
    }
  }

  logger.warn('[grok] DOM fallback timed out');
}

export function buildUserMessage(messages: Array<{ role: string; content: string }>): string {
  const system = messages.find(m => m.role === 'system')?.content || '';
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

  const codeContext = extractCodeContext(system);

  if (userMessages.length === 1 && assistantMessages.length === 0) {
    if (codeContext) return `${codeContext}\n\n${lastUserMsg}`;
    return lastUserMsg;
  }

  const nonSystemMessages = messages.filter(m => m.role !== 'system');
  const recentMessages = nonSystemMessages.slice(-7);

  const parts: string[] = [];
  if (codeContext) parts.push(codeContext);

  if (recentMessages.length > 1) {
    const conversation = recentMessages
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    parts.push(conversation);
  } else {
    parts.push(lastUserMsg);
  }

  return parts.join('\n\n');
}

function extractCodeContext(system: string): string {
  if (!system) return '';

  const parts: string[] = [];

  const fileMatch = system.match(/Current file:\s*(.+)/);
  if (fileMatch) parts.push(`Current file: ${fileMatch[1].trim()}`);

  const wsMatch = system.match(/Workspace:\s*(.+)/);
  if (wsMatch) parts.push(`Workspace: ${wsMatch[1].trim()}`);

  const codeBlocks = system.match(/```[\s\S]*?```/g);
  if (codeBlocks) {
    for (const block of codeBlocks.slice(0, 3)) {
      if (block.length < 3000) parts.push(block);
    }
  }

  const diagMatch = system.match(/(?:diagnostics|errors|warnings)[:\s]*\n([\s\S]*?)(?:\n\n|\n##|$)/i);
  if (diagMatch) {
    const diag = diagMatch[1].trim();
    if (diag.length < 1000) parts.push(`Diagnostics:\n${diag}`);
  }

  const prefixMatch = system.match(/(?:prefix|before cursor)[:\s]*\n([\s\S]*?)(?:\n\n|$)/i);
  const suffixMatch = system.match(/(?:suffix|after cursor)[:\s]*\n([\s\S]*?)(?:\n\n|$)/i);
  if (prefixMatch) parts.push(`Code before cursor:\n${prefixMatch[1].trim().slice(-500)}`);
  if (suffixMatch) parts.push(`Code after cursor:\n${suffixMatch[1].trim().slice(0, 500)}`);

  if (parts.length === 0 && system.length < 200 && !system.includes('You are')) {
    return system.trim();
  }

  return parts.join('\n');
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
