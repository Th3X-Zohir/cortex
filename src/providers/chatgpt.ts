import type { BridgeConfig, ChatRequest, ModelDefinition } from '../types.js';
import { BaseProvider } from './base.js';
import { logger } from '../logger.js';
import { buildUserMessage, logPromptComposition } from './grok.js';

export class ChatGPTProvider extends BaseProvider {
  readonly name = 'chatgpt' as const;
  readonly loginUrl = 'https://chatgpt.com';
  readonly verifySelector = '#prompt-textarea, [contenteditable="true"]';

  readonly models: ModelDefinition[] = [
    { id: 'web-chatgpt/gpt-5.4-pro',       provider: 'chatgpt', displayName: 'GPT-5.4 Pro',       owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5.4-thinking',  provider: 'chatgpt', displayName: 'GPT-5.4 Thinking',  owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5.3-instant',   provider: 'chatgpt', displayName: 'GPT-5.3 Instant',   owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5-thinking-mini', provider: 'chatgpt', displayName: 'GPT-5 Thinking Mini', owned_by: 'openai' },
    { id: 'web-chatgpt/o3',                provider: 'chatgpt', displayName: 'o3',                 owned_by: 'openai' },
  ];

  constructor(cfg: BridgeConfig) { super(cfg); }

  async chat(req: ChatRequest): Promise<string> {
    if (!this._ctx) throw new Error('ChatGPT: not connected. Run login first.');

    const page = await this._createIsolatedRequestPage();
    try {
      if (req.newConversation) {
        await this._startNewConversation(page);
      }

      const userMsg = buildUserMessage(req.messages);
      logPromptComposition('chatgpt', req.messages, userMsg);

      await this._submitPromptWithRateLimitRecovery(page, userMsg);

      logger.info(`[chatgpt] message sent (${userMsg.length} chars) — non-streaming mode, waiting for DOM...`);

      const timeout = 60000;
      const pollInterval = 500;
      let start = Date.now();
      let lastLength = 0;
      let stableCount = 0;
      let matchedSelector = '';
      let targetMsgId = '';
      let resubmitCount = 0;

      const selectors = [
        '[data-message-author-role="assistant"] .markdown',
        '[data-message-author-role="assistant"]',
        'article[data-testid*="conversation-turn"] .markdown',
        '.agent-turn .markdown',
        '.text-message .markdown',
        '.group\\/conversation-turn:last-child .markdown',
        'article:last-of-type .markdown',
      ];

      while (Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, pollInterval));
        let observedText = '';

        if (!targetMsgId) {
          const info = await page.evaluate(`
            (() => {
              const userMsgs = document.querySelectorAll('[data-message-author-role="user"]');
              if (!userMsgs.length) return { userMsgId: '', assistantId: '' };
              const lastUser = userMsgs[userMsgs.length - 1];
              const uid = lastUser.getAttribute('data-message-id') || '';
              const parent = lastUser.closest('article[data-testid*="conversation-turn"], div[data-testid*="conversation-turn"]');
              if (!parent) return { userMsgId: uid, assistantId: '' };
              const nextSiblings = [];
              let sibling = parent.nextElementSibling;
              while (sibling) {
                nextSiblings.push(sibling);
                sibling = sibling.nextElementSibling;
              }
              let assistantId = '';
              for (const s of nextSiblings) {
                if (s.querySelector('[data-message-author-role="assistant"]')) {
                  const el = s.querySelector('[data-message-author-role="assistant"]');
                  assistantId = el?.getAttribute('data-message-id') || '';
                  break;
                }
              }
              return { userMsgId: uid, assistantId };
            })()
          `) as { userMsgId: string; assistantId: string };
          if (info.assistantId) {
            targetMsgId = info.assistantId;
            logger.info(`[chatgpt] non-streaming target assistant msg id: ${targetMsgId}`);
          }
        }

        if (!matchedSelector) {
          for (const sel of selectors) {
            const count = await page.locator(sel).count().catch(() => 0);
            if (count > 0) {
              matchedSelector = sel;
              logger.info(`[chatgpt] non-streaming DOM matched: ${sel} (${count} elements)`);
              break;
            }
          }
        }

        if (matchedSelector) {
          const elements = page.locator(matchedSelector);
          const count = await elements.count().catch(() => 0);

          if (count > 0) {
            const lastEl = elements.last();
            const text = await lastEl.textContent().catch(() => '');

            if (targetMsgId) {
              const targetEl = page.locator(`[data-message-id="${targetMsgId}"] .markdown`).first();
              const targetText = await targetEl.textContent().catch(() => '');
              if (targetText) {
                observedText = cleanGenuiPrefix(targetText);
              }
            } else if (text) {
              observedText = cleanGenuiPrefix(text);
            }
          }
        }

        const rateLimited = await this._dismissTooManyRequestsDialog(page);
        if (rateLimited && lastLength === 0 && !observedText) {
          if (resubmitCount >= 2) {
            throw new Error('ChatGPT temporarily rate limited. Please retry in a few minutes.');
          }
          resubmitCount += 1;
          const waitMs = resubmitCount * 4000;
          logger.warn(`[chatgpt] rate-limit modal while waiting; retrying submit in ${waitMs}ms (retry ${resubmitCount}/2)`);
          await new Promise(r => setTimeout(r, waitMs));
          await this._submitPromptWithRateLimitRecovery(page, userMsg);
          start = Date.now();
          stableCount = 0;
          matchedSelector = '';
          targetMsgId = '';
          continue;
        }

        if (lastLength === 0 && !observedText) {
          const unusualActivity = await this._detectUnusualActivityBlocker(page)
          if (unusualActivity) {
            throw new Error(`ChatGPT blocked request: ${unusualActivity}`)
          }
        }

        if (!observedText) continue;

        if (observedText.length > lastLength) {
          const growth = observedText.length - lastLength;
          const logLabel = targetMsgId ? 'non-streaming target DOM growing' : 'non-streaming DOM growing';
          logger.info(`[chatgpt] ${logLabel}: ${growth} chars (total: ${observedText.length})`);
          lastLength = observedText.length;
          stableCount = 0;
        } else {
          stableCount++;
          if (stableCount >= 4 && lastLength > 0) {
            logger.info(`[chatgpt] non-streaming complete (${lastLength} chars)`);
            return observedText;
          }
        }
      }

      const finalText = await page.locator(matchedSelector).last().textContent().catch(() => '') ?? '';
      return cleanGenuiPrefix(finalText);
    } finally {
      await page.close().catch(() => {});
    }
  }

  async *chatStream(req: ChatRequest): AsyncGenerator<string> {
    if (!this._ctx) throw new Error('ChatGPT: not connected. Run login first.');

    const page = await this._createIsolatedRequestPage();
    try {
      if (req.newConversation) {
        await this._startNewConversation(page);
      }

      await this._injectInterceptor(page);

      const userMsg = buildUserMessage(req.messages);
      logPromptComposition('chatgpt', req.messages, userMsg);

      await page.evaluate(`
        window.__cortexChatGPT = { text:'', done:false, startTime:Date.now(), fetchHits:0 };
      `);

      await this._submitPromptWithRateLimitRecovery(page, userMsg);

      logger.info(`[chatgpt] message sent (${userMsg.length} chars)`);

      const timeout = 60000;
      const pollInterval = 300;
      let start = Date.now();
      let lastLength = 0;
      let lastCleanedLength = 0;
      let stableCount = 0;
      let hasContent = false;
      let fetchHit = false;
      let firstChunkTime = 0;
      let resubmitCount = 0;

      while (Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, pollInterval));

        const result = await page.evaluate(`
          window.__cortexChatGPT ? {
            text: window.__cortexChatGPT.text || '',
            done: !!window.__cortexChatGPT.done,
            fetchHits: window.__cortexChatGPT.fetchHits || 0,
            started: !!window.__cortexChatGPT.started
          } : { text:'', done:false, fetchHits:0, started:false }
        `) as { text: string; done: boolean; fetchHits: number; started: boolean };

        if (result.fetchHits > 0 && !fetchHit) {
          fetchHit = true;
          logger.info(`[chatgpt] fetch interception ACTIVE (${result.fetchHits} hits)`);
        }

        const rateLimited = await this._dismissTooManyRequestsDialog(page);
        if (rateLimited && !hasContent && !result.text && !result.done && !result.started) {
          if (resubmitCount >= 2) {
            throw new Error('ChatGPT temporarily rate limited. Please retry in a few minutes.');
          }
          resubmitCount += 1;
          const waitMs = resubmitCount * 4000;
          logger.warn(`[chatgpt] rate-limit modal while streaming wait; retrying submit in ${waitMs}ms (retry ${resubmitCount}/2)`);
          await new Promise(r => setTimeout(r, waitMs));
          await page.evaluate(`
            window.__cortexChatGPT = { text:'', done:false, startTime:Date.now(), fetchHits:0, started:false };
          `).catch(() => {});
          await this._submitPromptWithRateLimitRecovery(page, userMsg);
          start = Date.now();
          lastLength = 0;
          lastCleanedLength = 0;
          stableCount = 0;
          hasContent = false;
          fetchHit = false;
          firstChunkTime = 0;
          continue;
        }

        if (!hasContent && !result.text && !result.started) {
          const unusualActivity = await this._detectUnusualActivityBlocker(page)
          if (unusualActivity) {
            throw new Error(`ChatGPT blocked request: ${unusualActivity}`)
          }
        }

        if (!result.text && !hasContent) {
          const elapsed = Date.now() - start;
          if (elapsed > 8000 && !fetchHit) {
            logger.info(`[chatgpt] no fetch intercept after ${elapsed}ms — will fallback to DOM soon`);
          }
          if (elapsed > 15000) {
            logger.info('[chatgpt] fetch intercept timeout, starting DOM fallback...');
            yield* this._pollForResponseDOM(page, true);
            return;
          }
          continue;
        }

        if (result.text.length > lastLength) {
          if (!firstChunkTime) firstChunkTime = Date.now() - start;
          const fullCleaned = cleanGenuiPrefix(result.text);
          const newContent = fullCleaned.slice(lastCleanedLength > 0 ? lastCleanedLength : 0);
          if (newContent) yield newContent;
          lastCleanedLength = fullCleaned.length;
          lastLength = result.text.length;
          stableCount = 0;
          hasContent = true;
        } else if (result.done) {
          logger.info(`[chatgpt] stream complete (${lastLength} chars, ${firstChunkTime}ms to first chunk)`);
          return;
        } else {
          stableCount++;
          if (stableCount >= 5 && lastLength > 0) {
            logger.info(`[chatgpt] response stable (${lastLength} chars)`);
            return;
          }
        }
      }

      if (lastLength === 0) {
        logger.warn('[chatgpt] response polling timed out, falling back to DOM...');
        yield* this._pollForResponseDOM(page, false);
      } else {
        logger.warn(`[chatgpt] response timeout after ${lastLength} chars`);
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async _createIsolatedRequestPage(): Promise<import('playwright').Page> {
    if (!this._ctx) throw new Error('ChatGPT: not connected. Run login first.');

    const page = await this._ctx.newPage();
    try {
      await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
      await this._clearRateLimitBlockers(page, 'page initialization');
      await page.locator('#prompt-textarea, [contenteditable="true"]').first().waitFor({ timeout: 20000 });
      await this._clearRateLimitBlockers(page, 'composer readiness');
      logger.debug('[chatgpt] isolated request page ready');
      return page;
    } catch (err) {
      await page.close().catch(() => {});
      throw err;
    }
  }

  private async _submitPromptWithRateLimitRecovery(
    page: import('playwright').Page,
    userMsg: string,
  ): Promise<void> {
    const textarea = page.locator('#prompt-textarea, [contenteditable="true"]').first();
    const retryDelaysMs = [1200, 3000, 7000];

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      await this._clearRateLimitBlockers(page, 'pre-submit check');
      await textarea.waitFor({ timeout: 15000 });
      await this._insertPromptText(page, textarea, userMsg);
      await new Promise(r => setTimeout(r, 300));
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 900));

      const rateLimited = await this._dismissTooManyRequestsDialog(page);
      const unusualActivity = await this._detectUnusualActivityBlocker(page)
      if (unusualActivity) {
        throw new Error(`ChatGPT blocked request: ${unusualActivity}`)
      }

      if (!rateLimited) return;

      if (attempt >= retryDelaysMs.length) {
        throw new Error('ChatGPT temporarily rate limited. Please retry in a few minutes.');
      }

      const waitMs = retryDelaysMs[attempt];
      logger.warn(`[chatgpt] rate-limit dialog after submit; retrying in ${waitMs}ms (attempt ${attempt + 1}/${retryDelaysMs.length + 1})`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  private async _clearRateLimitBlockers(
    page: import('playwright').Page,
    phase: string,
  ): Promise<void> {
    const retryDelaysMs = [1000, 3000, 7000];

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
      const dismissed = await this._dismissTooManyRequestsDialog(page);
      if (!dismissed) return;

      if (attempt >= retryDelaysMs.length) {
        throw new Error('ChatGPT temporarily rate limited. Please retry in a few minutes.');
      }

      const waitMs = retryDelaysMs[attempt];
      logger.warn(`[chatgpt] rate-limit dialog during ${phase}; waiting ${waitMs}ms before retry (attempt ${attempt + 1}/${retryDelaysMs.length + 1})`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  private async _dismissTooManyRequestsDialog(page: import('playwright').Page): Promise<boolean> {
    const dialog = page.locator('[role="dialog"]:has-text("Too many requests"), [role="alertdialog"]:has-text("Too many requests")').first();
    const visible = await dialog.isVisible({ timeout: 250 }).catch(() => false);
    if (!visible) return false;

    const acknowledge = dialog.locator('button:has-text("Got it"), button:has-text("Okay"), button:has-text("OK"), button:has-text("Dismiss")').first();
    if (await acknowledge.isVisible({ timeout: 1000 }).catch(() => false)) {
      try {
        await acknowledge.click({ timeout: 2000 });
      } catch {
        await acknowledge.evaluate((element: any) => {
          if (typeof element.click === 'function') element.click();
        }).catch(() => {});
      }
    } else {
      await page.keyboard.press('Escape').catch(() => {});
    }

    logger.warn('[chatgpt] detected "Too many requests" dialog and dismissed it');
    await new Promise(r => setTimeout(r, 250));
    return true;
  }

  private async _detectUnusualActivityBlocker(page: import('playwright').Page): Promise<string | null> {
    const inlineBanner = page.locator(
      'div:has(button:has-text("Retry")):has-text("unusual activity"), ' +
      '[role="alert"]:has-text("unusual activity"), ' +
      '[role="status"]:has-text("unusual activity")'
    ).first()

    const bannerVisible = await inlineBanner.isVisible({ timeout: 250 }).catch(() => false)
    if (bannerVisible) {
      const bannerText = normalizeStatusText(await inlineBanner.textContent().catch(() => ''))
      if (isUnusualActivityMessage(bannerText)) {
        logger.warn('[chatgpt] detected unusual-activity inline blocker')
        return bannerText
      }
    }

    const retryVisible = await page.locator('button:has-text("Retry")').first().isVisible({ timeout: 250 }).catch(() => false)
    if (!retryVisible) return null

    const bodyText = normalizeStatusText(await page.locator('body').textContent().catch(() => ''))
    if (!isUnusualActivityMessage(bodyText)) return null

    logger.warn('[chatgpt] detected unusual-activity state with retry action')
    return 'Our systems have detected unusual activity. Please try again later.'
  }

  private async *_pollForResponseDOM(
    page: import('playwright').Page,
    immediateFallback = false,
  ): AsyncGenerator<string> {
    const selectors = [
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"]',
      'article[data-testid*="conversation-turn"] .markdown',
      '.agent-turn .markdown',
      '.result-streaming',
      '.text-message .markdown',
      '.group\\/conversation-turn:last-child .markdown',
      'article:last-of-type .markdown',
    ];

    const timeout = 30000;
    const pollInterval = 300;
    const start = Date.now();
    let lastLength = 0;
    let stableCount = 0;
    let matchedSelector = '';

    if (immediateFallback) {
      logger.info('[chatgpt] DOM fallback started immediately');
    } else {
      logger.info('[chatgpt] DOM fallback started after fetch timeout');
    }

    while (Date.now() - start < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      if (lastLength === 0) {
        const unusualActivity = await this._detectUnusualActivityBlocker(page)
        if (unusualActivity) {
          throw new Error(`ChatGPT blocked request: ${unusualActivity}`)
        }
      }

      if (!matchedSelector) {
        for (const sel of selectors) {
          const count = await page.locator(sel).count().catch(() => 0);
          if (count > 0) {
            matchedSelector = sel;
            logger.info(`[chatgpt] DOM fallback matched: ${sel} (${count} elements)`);
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

      const cleaned = cleanGenuiPrefix(text);
      if (cleaned.length > lastLength) {
        logger.info(`[chatgpt] DOM yielding ${cleaned.length - lastLength} chars (total: ${cleaned.length})`);
        yield cleaned.slice(lastLength);
        lastLength = cleaned.length;
        stableCount = 0;
      } else {
        stableCount++;
        if (stableCount >= 3 && lastLength > 0) {
          logger.info(`[chatgpt] DOM fallback complete (${lastLength} chars)`);
          return;
        }
      }
    }

    logger.warn('[chatgpt] DOM fallback timed out');
  }

  private async _startNewConversation(page: import('playwright').Page): Promise<void> {
    logger.info('[chatgpt] starting new conversation...');
    await this._clearRateLimitBlockers(page, 'new conversation preflight');

    const newChatBtn = page.locator(
      'button:has-text("New chat"), button[aria-label="New chat"], ' +
      '[data-testid="new-chat-button"], a[href="/"]'
    ).first();

    if (await newChatBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      try {
        await newChatBtn.evaluate((element: any) => {
          if (typeof element.click === 'function') element.click();
          else element.dispatchEvent(new (globalThis as any).MouseEvent('click', { bubbles: true, cancelable: true }));
        });
        await new Promise(r => setTimeout(r, 1500));
        await this._clearRateLimitBlockers(page, 'new conversation start');
        logger.info('[chatgpt] new conversation started');
      } catch (err) {
        logger.warn(`[chatgpt] new chat button click failed, using direct navigation: ${(err as Error).message}`);
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 2000));
        await this._clearRateLimitBlockers(page, 'new conversation navigation fallback');
      }
    } else {
      logger.info('[chatgpt] new chat button not found — trying direct navigation');
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 2000));
      await this._clearRateLimitBlockers(page, 'new conversation direct navigation');
    }

    await page.locator('#prompt-textarea, [contenteditable="true"]').waitFor({ timeout: 15000 });
    await this._clearRateLimitBlockers(page, 'new conversation post-ready');
  }

private _cortex_log(text: string) { console.log(`[CORTEX] ${text}`); }
  private _cortex_log_data(label: string, val: unknown) { console.log(`[CORTEX-DATA] ${label}:`, JSON.stringify(val)?.slice(0, 120)); }

  private async _injectInterceptor(page: import('playwright').Page): Promise<void> {
    page.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('[CORTEX')) {
        logger.info(`[chatgpt-browser] ${text}`);
      }
    });

    const patched = await page.evaluate(`
      (() => {
        if (window.__cortexChatGPTPatched) return true;
        window.__cortexChatGPTPatched = true;

        window.__cortexChatGPT = { text: '', done: false, startTime: 0, fetchHits: 0, started: false };

        function __cleanGenui(t) {
          if (!t) return '';
          while (t.length > 0 && (t.charCodeAt(0) === 0x200B || t.charCodeAt(0) === 0x00 || t.charCodeAt(0) === 0x200E)) t = t.slice(1);
          t = t.replace(/^\x00/, '');
          t = t.replace(/\x00/g, '');
          if (t.startsWith('genui')) { const i = t.indexOf(' '); if (i > 0) t = t.slice(i + 1); }
          while (t.length > 0 && (t.charCodeAt(t.length - 1) === 0x200B || t.charCodeAt(t.length - 1) === 0x00 || t.charCodeAt(t.length - 1) === 0x200E)) t = t.slice(0, -1);
          return t;
        }

        function __isTextPatchPath(path) {
          return path.includes('/message/content/parts/') ||
                 path.includes('/text/') ||
                 path.includes('/message/content/-') ||
                 path.endsWith('/content');
        }

        function __appendTextChunk(rawValue, opLabel) {
          const patchVal = __cleanGenui(String(rawValue ?? ''));
          if (!patchVal) return false;
          if (patchVal === 'finished_successfully') {
            console.log('[CORTEX-REJECT-STATUS]', patchVal);
            return false;
          }
          if (/^(true|false|null|undefined)$/i.test(patchVal)) return false;

          const prevLen = window.__cortexChatGPT.text.length;
          window.__cortexChatGPT.text += patchVal;
          window.__cortexChatGPT.started = true;
          if (window.__cortexChatGPT.text.length > prevLen) {
            console.log('[CORTEX-ACCEPT]', opLabel ?? 'patch', patchVal.length, 'chars, total:', window.__cortexChatGPT.text.length, 'val:', patchVal.slice(0, 40));
            return true;
          }
          return false;
        }

        const _fetch = window.fetch;
        window.fetch = async function(...args) {
          const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

          const res = await _fetch.apply(this, args);

          if (url.includes('/backend-api/f/conversation') && res.headers.get('content-type')?.includes('text/event-stream')) {
            console.log('[CORTEX-STREAM-START]', url);
            window.__cortexChatGPT.fetchHits = (window.__cortexChatGPT.fetchHits || 0) + 1;
            window.__cortexChatGPT.text = '';
            window.__cortexChatGPT.done = false;
            window.__cortexChatGPT.started = false;

            const clone = res.clone();
            (async () => {
              try {
                const reader = clone.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let seq = 0;
                let lastTextPatchPath = '';
                let lastTextPatchOp = '';
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) { window.__cortexChatGPT.done = true; break; }
                  const chunk = decoder.decode(value, { stream: true });
                  buffer += chunk;
                  const lines = buffer.split('\\n');
                  buffer = lines.pop() || '';
                  for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw || raw === '[DONE]') { if (raw === '[DONE]') window.__cortexChatGPT.done = true; continue; }
                    try {
                      const d = JSON.parse(raw);
                      seq++;
                      let consumedDirectString = false;

                      // Log all events for diagnostics
                      console.log('[CORTEX-SEQ]', seq, JSON.stringify(d).slice(0, 200));

                      // message_stream_complete = end signal
                      if (d.type === 'message_stream_complete') {
                        window.__cortexChatGPT.done = true;
                        console.log('[CORTEX-DONE] message_stream_complete');
                        continue;
                      }

                      if (d.type === 'message_marker' && d.marker === 'user_visible_token') {
                        window.__cortexChatGPT.started = true;
                      }

                      if (d.v?.message?.author?.role === 'assistant') {
                        window.__cortexChatGPT.started = true;
                      }

                      if (d.p && d.v !== undefined && typeof d.v !== 'object') {
                        const patchPath = String(d.p);
                        const patchOp = d.o;
                        const isTextPatch = __isTextPatchPath(patchPath);
                        if (isTextPatch) {
                          lastTextPatchPath = patchPath;
                          lastTextPatchOp = patchOp ?? 'patch';
                          __appendTextChunk(d.v, patchOp ?? 'patch');
                          consumedDirectString = true;
                        }
                      }

                      if (!consumedDirectString && typeof d.v === 'string' && lastTextPatchPath && __isTextPatchPath(lastTextPatchPath)) {
                        __appendTextChunk(d.v, lastTextPatchOp || 'append');
                      }

                      // Format: {"v":[{"p":"/message/content/parts/0","o":"append","v":"Hello"}]}
                      if (Array.isArray(d.v)) {
                        for (const patch of d.v) {
                          if (!patch.p || patch.v === undefined || typeof patch.v === 'object') continue;
                          const patchPath = String(patch.p);
                          const patchOp = patch.o;

                          // Only accept text patches on message content paths
                          const isTextPatch = __isTextPatchPath(patchPath);
                          if (!isTextPatch) continue;
                          lastTextPatchPath = patchPath;
                          lastTextPatchOp = patchOp ?? 'patch';
                          __appendTextChunk(patch.v, patchOp ?? 'patch');
                        }
                      }

                      // Full message replacement (e.g. resume_conversation_token)
                      if (d.v?.message?.author?.role === 'assistant' && d.v?.message?.content?.parts) {
                        const joined = d.v.message.content.parts.join('');
                        if (joined && joined.length > window.__cortexChatGPT.text.length) {
                          window.__cortexChatGPT.text = joined;
                          window.__cortexChatGPT.started = true;
                          console.log('[CORTEX-REPLACE]', joined.length, 'chars');
                        }
                      }
                    } catch (e) { /* skip unparseable lines */ }
                  }
                }
                console.log('[CORTEX-STREAM-CLOSE]', window.__cortexChatGPT.text.length, 'chars');
              } catch { window.__cortexChatGPT.done = true; }
            })();
          }
          return res;
        };

        console.log('[CORTEX] ChatGPT interceptor ready');
        return false; // not already patched
      })()
    `);

    if (patched === true) {
      logger.debug('[chatgpt] interceptor already installed on this page, skipping');
      return;
    }

    logger.debug('[chatgpt] interceptor injected');
  }
}

function cleanGenuiPrefix(text: string): string {
  if (!text) return '';
  let t = text;
  while (t.length > 0 && (t.charCodeAt(0) === 0x200B || t.charCodeAt(0) === 0x00 || t.charCodeAt(0) === 0x200E)) {
    t = t.slice(1);
  }
  t = t.replace(/^\x00/, '');
  t = t.replace(/\x00/g, '');
  if (t.startsWith('genui')) {
    const spaceIdx = t.indexOf(' ');
    if (spaceIdx > 0) {
      t = t.slice(spaceIdx + 1);
    }
  }
  while (t.length > 0 && (t.charCodeAt(t.length - 1) === 0x200B || t.charCodeAt(t.length - 1) === 0x00 || t.charCodeAt(t.length - 1) === 0x200E)) {
    t = t.slice(0, -1);
  }
  return t;
}

function normalizeStatusText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function isUnusualActivityMessage(value: string): boolean {
  const text = normalizeStatusText(value).toLowerCase()
  if (!text) return false

  if (text.includes('our systems have detected unusual activity')) return true
  if (text.includes('unusual activity') && text.includes('please try again later')) return true
  return false
}
