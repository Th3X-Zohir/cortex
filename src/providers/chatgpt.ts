/* global document */
declare const document: any;

import type { BridgeConfig, ChatRequest, ChatRunContext, ModelDefinition, ProviderAccountRecord, AccountFailureReason } from '../types.js';
import { BaseProvider } from './base.js';
import { ProviderAccount } from './account.js';
import { AccountFailureError, isAccountFailure } from './errors.js';
import { pickHealthyAccount, isInCooldown, cooldownForReason } from './pool-policy.js';
import { logger } from '../logger.js';
import { buildUserMessage, logPromptComposition } from './grok.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AdminStore } from '../admin/store.js';

const CHATGPT_LOGIN_URL = 'https://chatgpt.com';
const CHATGPT_VERIFY_SELECTOR = '#prompt-textarea, [contenteditable="true"]';

export type AccountActivityKind = 'idle' | 'chat' | 'login' | 'restoring' | 'logged_out';
export interface AccountActivity {
  kind: AccountActivityKind;
  /** Model id (for chat) or other detail. */
  detail?: string;
  /** ms epoch when this activity began. */
  startedAt: number;
}

type DirectChatGPTState = {
  conversationId: string | null;
  parentMessageId: string | null;
};

export class ChatGPTProvider extends BaseProvider {
  readonly name = 'chatgpt' as const;
  readonly loginUrl = CHATGPT_LOGIN_URL;
  readonly verifySelector = CHATGPT_VERIFY_SELECTOR;

  readonly models: ModelDefinition[] = [
    { id: 'web-chatgpt/gpt-5.4-pro',       provider: 'chatgpt', displayName: 'GPT-5.4 Pro',       owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5.4-thinking',  provider: 'chatgpt', displayName: 'GPT-5.4 Thinking',  owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5.3-instant',   provider: 'chatgpt', displayName: 'GPT-5.3 Instant',   owned_by: 'openai' },
    { id: 'web-chatgpt/gpt-5-thinking-mini', provider: 'chatgpt', displayName: 'GPT-5 Thinking Mini', owned_by: 'openai' },
    { id: 'web-chatgpt/o3',                provider: 'chatgpt', displayName: 'o3',                 owned_by: 'openai' },
  ];

  private readonly _store: AdminStore | null;
  private _accounts: Map<string, ProviderAccount> = new Map();
  private _accountListLoaded = false;

  /** Per-account current activity — surfaced via /api/browsers for the dashboard. */
  private _activity: Map<string, AccountActivity> = new Map();
  private _directState: Map<string, DirectChatGPTState> = new Map();

  constructor(cfg: BridgeConfig, store: AdminStore | null = null) {
    super(cfg);
    this._store = store;
    if (store) this._syncAccountsFromStore();
  }

  // ── Account pool management ────────────────────────────────────────────────

  /**
   * Reload accounts from DB. Auto-imports a legacy single-profile setup as
   * a 'default' account on first run if no accounts exist yet for this provider.
   * Safe to call multiple times — preserves existing in-memory ProviderAccount
   * instances when their underlying record hasn't changed.
   */
  syncAccountsFromStore(): void { this._syncAccountsFromStore(); }
  private _syncAccountsFromStore(): void {
    if (!this._store) return;
    this._maybeAutoImportLegacyProfile();
    const rows = this._store.listProviderAccounts(this.name);
    const seen = new Set<string>();
    for (const row of rows) {
      seen.add(row.id);
      const existing = this._accounts.get(row.id);
      if (existing) {
        (existing.record as ProviderAccountRecord).label = row.label;
        (existing.record as ProviderAccountRecord).enabled = row.enabled;
        (existing.record as ProviderAccountRecord).status = row.status;
        (existing.record as ProviderAccountRecord).cooldown_until = row.cooldown_until;
        (existing.record as ProviderAccountRecord).last_used_at = row.last_used_at;
        (existing.record as ProviderAccountRecord).last_error = row.last_error;
        (existing.record as ProviderAccountRecord).error_count_24h = row.error_count_24h;
        (existing.record as ProviderAccountRecord).notes = row.notes;
        continue;
      }
      this._accounts.set(row.id, new ProviderAccount({
        record: row,
        loginUrl: CHATGPT_LOGIN_URL,
        verifySelector: CHATGPT_VERIFY_SELECTOR,
      }));
    }
    // Dispose any accounts that have been removed from DB.
    for (const [id, account] of this._accounts) {
      if (!seen.has(id)) {
        account.logout().catch(() => {});
        this._accounts.delete(id);
      }
    }
    this._accountListLoaded = true;
  }

  /** Auto-import the legacy ~/.cortex/profiles/chatgpt-profile dir as account 'default'. */
  private _maybeAutoImportLegacyProfile(): void {
    if (!this._store) return;
    const existing = this._store.listProviderAccounts(this.name);
    if (existing.length > 0) return;
    const legacy = join(this._cfg.profileBaseDir, `${this.name}-profile`);
    if (!existsSync(legacy)) return;
    try {
      this._store.createProviderAccount({
        provider: this.name,
        label: 'default',
        profile_dir: legacy,
        created_by: null,
        notes: 'auto-imported from legacy single-profile setup',
      });
      logger.info(`[chatgpt] auto-imported legacy profile at ${legacy} as account 'default'`);
    } catch (err) {
      logger.warn(`[chatgpt] legacy auto-import failed: ${(err as Error).message}`);
    }
  }

  get accountList(): ProviderAccount[] { return [...this._accounts.values()]; }

  getAccount(id: string): ProviderAccount | undefined { return this._accounts.get(id); }

  /** Read-only view of an account's current activity. */
  getActivity(accountId: string): AccountActivity {
    return this._activity.get(accountId) ?? { kind: 'idle', startedAt: 0 };
  }

  private _setActivity(accountId: string, kind: AccountActivityKind, detail?: string): void {
    this._activity.set(accountId, { kind, detail, startedAt: Date.now() });
  }

  /**
   * Allocate a new profile directory under profileBaseDir for a freshly-created
   * account. Caller persists the row into DB with this path.
   */
  defaultProfileDirForId(accountId: string): string {
    const dir = join(this._cfg.profileBaseDir, `${this.name}-${accountId}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private _pickHealthyAccount(excludeIds: Set<string>): ProviderAccount | null {
    const result = pickHealthyAccount(this.accountList.map(a => a.record), excludeIds);
    if (!result.chosen) return null;
    return this._accounts.get(result.chosen.id) ?? null;
  }

  private _applyCooldown(account: ProviderAccount, reason: AccountFailureReason, message: string): void {
    if (!this._store) return;
    const cfg = this._store.getCooldownConfig(this.name);
    const { until, status } = cooldownForReason(reason, cfg);
    this._store.setProviderAccountCooldown(account.id, until, reason, status);
    (account.record as ProviderAccountRecord).cooldown_until = until ? until.toISOString() : null;
    (account.record as ProviderAccountRecord).status = status;
    (account.record as ProviderAccountRecord).last_error = message;
    logger.warn(`[chatgpt] account '${account.label}' cooldown applied (reason=${reason}, until=${until?.toISOString() ?? 'n/a'})`);
  }

  /**
   * Pick an account (or honor a pinned-account hint from runCtx), ensure
   * connected, run fn, populate runCtx with the chosen account. On
   * AccountFailureError, apply cooldown and rotate. If the caller pinned an
   * account, no rotation occurs — the failure is surfaced to the client.
   */
  private async _withAccount<T>(
    runCtx: ChatRunContext | undefined,
    fn: (account: ProviderAccount) => Promise<T>,
  ): Promise<T> {
    if (this._accountListLoaded === false) this._syncAccountsFromStore();

    // Pinned-account fast path: caller forced a specific account by label.
    const pinned = runCtx?.pinnedAccountLabel?.trim();
    if (pinned) {
      const account = this._findAccountByLabel(pinned);
      if (!account) throw new Error(`ChatGPT: no account with label '${pinned}'`);
      if (account.record.enabled !== 1) throw new Error(`ChatGPT: pinned account '${pinned}' is disabled`);
      if (account.record.cooldown_until && Date.parse(account.record.cooldown_until) > Date.now()) {
        throw new Error(`ChatGPT: pinned account '${pinned}' is in cooldown until ${account.record.cooldown_until}`);
      }
      if (runCtx) { runCtx.accountId = account.id; runCtx.accountLabel = account.label; }
      const ok = await account.ensureConnected().catch(() => false);
      if (!ok) throw new Error(`ChatGPT: pinned account '${pinned}' could not be restored`);
      this._store?.markProviderAccountUsed(account.id);
      (account.record as ProviderAccountRecord).last_used_at = new Date().toISOString();
      try {
        const result = await fn(account);
        this._store?.setProviderAccountStatus(account.id, 'connected', null);
        return result;
      } catch (err) {
        if (isAccountFailure(err)) {
          this._applyCooldown(account, err.reason, err.providerMessage);
        }
        throw err;
      }
    }

    // LRU rotation path
    const tried = new Set<string>();
    const failures: { label: string; reason: string; message: string }[] = [];
    while (true) {
      const account = this._pickHealthyAccount(tried);
      if (!account) {
        const detail = failures.length
          ? ' Failures: ' + failures.map(f => `${f.label}(${f.reason})`).join(', ')
          : '';
        throw new Error(`ChatGPT: no healthy accounts available.${detail}`);
      }
      tried.add(account.id);
      if (runCtx) { runCtx.accountId = account.id; runCtx.accountLabel = account.label; }
      const ok = await account.ensureConnected().catch(() => false);
      if (!ok) {
        this._applyCooldown(account, 'session_expired', 'restoreSession failed');
        failures.push({ label: account.label, reason: 'session_expired', message: 'restoreSession failed' });
        continue;
      }
      this._store?.markProviderAccountUsed(account.id);
      (account.record as ProviderAccountRecord).last_used_at = new Date().toISOString();
      try {
        const result = await fn(account);
        this._store?.setProviderAccountStatus(account.id, 'connected', null);
        return result;
      } catch (err) {
        if (isAccountFailure(err)) {
          this._applyCooldown(account, err.reason, err.providerMessage);
          failures.push({ label: account.label, reason: err.reason, message: err.providerMessage });
          continue;
        }
        throw err;
      }
    }
  }

  /** Streaming variant — same rotation logic but yields chunks. */
  private async *_withAccountStream(
    runCtx: ChatRunContext | undefined,
    fn: (account: ProviderAccount) => AsyncGenerator<string>,
  ): AsyncGenerator<string> {
    if (this._accountListLoaded === false) this._syncAccountsFromStore();

    const pinned = runCtx?.pinnedAccountLabel?.trim();
    if (pinned) {
      const account = this._findAccountByLabel(pinned);
      if (!account) throw new Error(`ChatGPT: no account with label '${pinned}'`);
      if (account.record.enabled !== 1) throw new Error(`ChatGPT: pinned account '${pinned}' is disabled`);
      if (account.record.cooldown_until && Date.parse(account.record.cooldown_until) > Date.now()) {
        throw new Error(`ChatGPT: pinned account '${pinned}' is in cooldown until ${account.record.cooldown_until}`);
      }
      if (runCtx) { runCtx.accountId = account.id; runCtx.accountLabel = account.label; }
      const ok = await account.ensureConnected().catch(() => false);
      if (!ok) throw new Error(`ChatGPT: pinned account '${pinned}' could not be restored`);
      this._store?.markProviderAccountUsed(account.id);
      (account.record as ProviderAccountRecord).last_used_at = new Date().toISOString();
      try {
        for await (const chunk of fn(account)) yield chunk;
        this._store?.setProviderAccountStatus(account.id, 'connected', null);
        return;
      } catch (err) {
        if (isAccountFailure(err)) this._applyCooldown(account, err.reason, err.providerMessage);
        throw err;
      }
    }

    const tried = new Set<string>();
    const failures: { label: string; reason: string; message: string }[] = [];
    while (true) {
      const account = this._pickHealthyAccount(tried);
      if (!account) {
        const detail = failures.length
          ? ' Failures: ' + failures.map(f => `${f.label}(${f.reason})`).join(', ')
          : '';
        throw new Error(`ChatGPT: no healthy accounts available.${detail}`);
      }
      tried.add(account.id);
      if (runCtx) { runCtx.accountId = account.id; runCtx.accountLabel = account.label; }
      const ok = await account.ensureConnected().catch(() => false);
      if (!ok) {
        this._applyCooldown(account, 'session_expired', 'restoreSession failed');
        failures.push({ label: account.label, reason: 'session_expired', message: 'restoreSession failed' });
        continue;
      }
      this._store?.markProviderAccountUsed(account.id);
      (account.record as ProviderAccountRecord).last_used_at = new Date().toISOString();
      try {
        for await (const chunk of fn(account)) yield chunk;
        this._store?.setProviderAccountStatus(account.id, 'connected', null);
        return;
      } catch (err) {
        if (isAccountFailure(err)) {
          this._applyCooldown(account, err.reason, err.providerMessage);
          failures.push({ label: account.label, reason: err.reason, message: err.providerMessage });
          continue;
        }
        throw err;
      }
    }
  }

  // ── ProviderAdapter overrides (pool-aware) ────────────────────────────────

  override get hasProfile(): boolean {
    if (this._accountListLoaded === false) this._syncAccountsFromStore();
    return this.accountList.some(a => a.hasProfile);
  }

  override async checkSession(): Promise<boolean> {
    for (const a of this.accountList) if (await a.checkSession()) return true;
    return false;
  }

  override async ensureConnected(): Promise<boolean> {
    for (const a of this.accountList) {
      if (await a.ensureConnected()) return true;
    }
    return false;
  }

  override async restoreSession(): Promise<boolean> {
    if (this._accountListLoaded === false) this._syncAccountsFromStore();
    const accounts = this.accountList;
    if (accounts.length === 0) return false;
    accounts.forEach(a => this._setActivity(a.id, 'restoring'));
    const results = await Promise.all(accounts.map(a => a.restoreSession().catch(() => false)));
    accounts.forEach((a, i) => {
      const status = results[i] ? 'connected' : 'logged_out';
      this._store?.setProviderAccountStatus(a.id, status, null);
      (a.record as ProviderAccountRecord).status = status;
      this._setActivity(a.id, results[i] ? 'idle' : 'logged_out');
    });
    return results.some(Boolean);
  }

  override async login(_onReady: (loginUrl: string) => void): Promise<void> {
    throw new Error('ChatGPT login is per-account — use the admin UI (/admin/accounts/:id/login).');
  }

  override async logout(): Promise<void> {
    await Promise.all(this.accountList.map(a => a.logout().catch(() => {})));
  }

  async chat(req: ChatRequest, runCtx?: ChatRunContext): Promise<string> {
    return this._withAccount(runCtx, async account => {
      this._setActivity(account.id, 'chat', req.model);
      try {
        return await this._chatOnAccount(account, req);
      } finally {
        this._setActivity(account.id, 'idle', req.model);
      }
    });
  }

  async *chatStream(req: ChatRequest, runCtx?: ChatRunContext): AsyncGenerator<string> {
    const self = this;
    yield* this._withAccountStream(runCtx, async function* (account) {
      self._setActivity(account.id, 'chat', req.model);
      try {
        yield* self._streamOnAccount(account, req);
      } finally {
        self._setActivity(account.id, 'idle', req.model);
      }
    });
  }

  /** Find an account by case-insensitive label match. */
  private _findAccountByLabel(label: string): ProviderAccount | null {
    const normalized = label.trim().toLowerCase();
    for (const a of this.accountList) {
      if (a.label.toLowerCase() === normalized) return a;
    }
    return null;
  }

  private async _chatOnAccount(account: ProviderAccount, req: ChatRequest): Promise<string> {
    const page = await this._createIsolatedRequestPage(account);
    try {
      const userMsg = buildUserMessage(req.messages);
      logPromptComposition('chatgpt', req.messages, userMsg);

      const direct = await this._tryDirectChat(page, account, req, userMsg);
      if (direct) {
        logger.info(`[chatgpt] direct browser API result (${direct.length} chars)`);
        return direct;
      }

      if (req.newConversation) {
        await this._startNewConversation(page);
      }

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
            if (observedText) {
              this._throwIfUnusualActivityText(observedText, 'non-streaming DOM response');
            }
          }
        }

        const rateLimited = await this._dismissTooManyRequestsDialog(page);
        if (rateLimited && lastLength === 0 && !observedText) {
          if (resubmitCount >= 2) {
            throw new AccountFailureError('rate_limited', 'Too many requests dialog persisted after retries');
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
            throw new AccountFailureError('unusual_activity', unusualActivity)
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
      const cleanedFinalText = cleanGenuiPrefix(finalText);
      this._throwIfUnusualActivityText(cleanedFinalText, 'non-streaming final DOM response');
      return cleanedFinalText;
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async *_streamOnAccount(account: ProviderAccount, req: ChatRequest): AsyncGenerator<string> {
    const page = await this._createIsolatedRequestPage(account);
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
            throw new AccountFailureError('rate_limited', 'Too many requests dialog persisted after retries');
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
            throw new AccountFailureError('unusual_activity', unusualActivity)
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
          this._throwIfUnusualActivityText(fullCleaned, 'stream interceptor response');
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

  private async _createIsolatedRequestPage(account: ProviderAccount): Promise<import('playwright').Page> {
    const page = await account.newPage();
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
        throw new AccountFailureError('unusual_activity', unusualActivity)
      }

      if (!rateLimited) return;

      if (attempt >= retryDelaysMs.length) {
        throw new AccountFailureError('rate_limited', 'Too many requests dialog persisted after retries');
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
        throw new AccountFailureError('rate_limited', 'Too many requests dialog persisted after retries');
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

  private _throwIfUnusualActivityText(text: string, source: string): void {
    const normalized = normalizeStatusText(text);
    if (!isUnusualActivityMessage(normalized)) return;
    logger.warn(`[chatgpt] detected unusual-activity ${source}`);
    throw new AccountFailureError('unusual_activity', normalized);
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
          throw new AccountFailureError('unusual_activity', unusualActivity)
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
      this._throwIfUnusualActivityText(cleaned, 'DOM fallback response');
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

  private async _tryDirectChat(
    page: import('playwright').Page,
    account: ProviderAccount,
    req: ChatRequest,
    userMsg: string,
  ): Promise<string | null> {
    const keepDirectState = shouldKeepProviderConversationState(req);
    const state = req.newConversation || !keepDirectState
      ? { conversationId: null, parentMessageId: null }
      : (this._directState.get(account.id) ?? { conversationId: null, parentMessageId: null });

    try {
      const result = await page.evaluate(
        async ({ message, model, state }) => {
          const timeoutMs = 180000;

          async function getToken(): Promise<string> {
            const res = await fetch('/api/auth/session', { credentials: 'include' });
            if (!res.ok) throw new Error(`session failed (${res.status})`);
            const data = await res.json() as { accessToken?: string };
            if (!data?.accessToken) throw new Error('not logged in to ChatGPT');
            return data.accessToken;
          }

          function sha3_512(message: string): string {
            const RC = [
              [0x00000001, 0x00000000], [0x00008082, 0x00000000], [0x0000808a, 0x80000000],
              [0x80008000, 0x80000000], [0x0000808b, 0x00000000], [0x80000001, 0x00000000],
              [0x80008081, 0x80000000], [0x00008009, 0x80000000], [0x0000008a, 0x00000000],
              [0x00000088, 0x00000000], [0x80008009, 0x00000000], [0x8000000a, 0x00000000],
              [0x8000808b, 0x00000000], [0x0000008b, 0x80000000], [0x00008089, 0x80000000],
              [0x00008003, 0x80000000], [0x00008002, 0x80000000], [0x00000080, 0x80000000],
              [0x0000800a, 0x00000000], [0x8000000a, 0x80000000], [0x80008081, 0x80000000],
              [0x00008080, 0x80000000], [0x80000001, 0x00000000], [0x80008008, 0x80000000],
            ];
            const ROTL = [
              [0, 0], [1, 0], [62, 0], [28, 0], [27, 0], [36, 0], [44, 0], [6, 0], [55, 0], [20, 0],
              [3, 0], [10, 0], [43, 0], [25, 0], [39, 0], [41, 0], [45, 0], [15, 0], [21, 0], [8, 0],
              [18, 0], [2, 0], [61, 0], [56, 0], [14, 0],
            ];
            const PI = [0, 10, 20, 5, 15, 16, 1, 11, 21, 6, 7, 17, 2, 12, 22, 23, 8, 18, 3, 13, 14, 24, 9, 19, 4];
            function rot64(lo: number, hi: number, n: number): [number, number] {
              if (n === 0) return [lo, hi];
              if (n < 32) return [(lo << n) | (hi >>> (32 - n)), (hi << n) | (lo >>> (32 - n))];
              n -= 32;
              return [(hi << n) | (lo >>> (32 - n)), (lo << n) | (hi >>> (32 - n))];
            }
            function keccakf(state: Int32Array): void {
              const s = new Int32Array(50);
              for (let i = 0; i < 50; i++) s[i] = state[i];
              for (let round = 0; round < 24; round++) {
                const C = new Int32Array(10);
                for (let x = 0; x < 5; x++) {
                  C[x * 2] = s[x * 2] ^ s[(x + 5) * 2] ^ s[(x + 10) * 2] ^ s[(x + 15) * 2] ^ s[(x + 20) * 2];
                  C[x * 2 + 1] = s[x * 2 + 1] ^ s[(x + 5) * 2 + 1] ^ s[(x + 10) * 2 + 1] ^ s[(x + 15) * 2 + 1] ^ s[(x + 20) * 2 + 1];
                }
                for (let x = 0; x < 5; x++) {
                  const px = (x + 4) % 5;
                  const nx = (x + 1) % 5;
                  const d = rot64(C[nx * 2], C[nx * 2 + 1], 1);
                  const tlo = C[px * 2] ^ d[0];
                  const thi = C[px * 2 + 1] ^ d[1];
                  for (let y = 0; y < 25; y += 5) {
                    s[(y + x) * 2] ^= tlo;
                    s[(y + x) * 2 + 1] ^= thi;
                  }
                }
                const B = new Int32Array(50);
                for (let i = 0; i < 25; i++) {
                  const r = rot64(s[i * 2], s[i * 2 + 1], ROTL[i][0] % 64);
                  B[PI[i] * 2] = r[0];
                  B[PI[i] * 2 + 1] = r[1];
                }
                for (let y = 0; y < 25; y += 5) {
                  for (let x = 0; x < 5; x++) {
                    s[(y + x) * 2] = B[(y + x) * 2] ^ (~B[(y + ((x + 1) % 5)) * 2] & B[(y + ((x + 2) % 5)) * 2]);
                    s[(y + x) * 2 + 1] = B[(y + x) * 2 + 1] ^ (~B[(y + ((x + 1) % 5)) * 2 + 1] & B[(y + ((x + 2) % 5)) * 2 + 1]);
                  }
                }
                s[0] ^= RC[round][0];
                s[1] ^= RC[round][1];
              }
              for (let i = 0; i < 50; i++) state[i] = s[i];
            }
            const rate = 72;
            const msgBytes = new TextEncoder().encode(message);
            const padLen = rate - (msgBytes.length % rate);
            const padded = new Uint8Array(msgBytes.length + padLen);
            padded.set(msgBytes);
            padded[msgBytes.length] = 0x06;
            padded[padded.length - 1] |= 0x80;
            const state = new Int32Array(50);
            for (let offset = 0; offset < padded.length; offset += rate) {
              for (let i = 0; i < rate; i += 4) {
                const idx = i / 4;
                if (idx < 50) {
                  state[idx] ^= padded[offset + i] | (padded[offset + i + 1] << 8) | (padded[offset + i + 2] << 16) | (padded[offset + i + 3] << 24);
                }
              }
              keccakf(state);
            }
            const hash = new Uint8Array(64);
            for (let i = 0; i < 64; i += 4) {
              const word = state[i / 4];
              hash[i] = word & 0xff;
              hash[i + 1] = (word >> 8) & 0xff;
              hash[i + 2] = (word >> 16) & 0xff;
              hash[i + 3] = (word >> 24) & 0xff;
            }
            return Array.from(hash).map(byte => byte.toString(16).padStart(2, '0')).join('');
          }

          async function getScriptsAndDpl(): Promise<{ scripts: Array<string | null>; dpl: string }> {
            try {
              const html = await fetch('/', { credentials: 'include' }).then(res => res.text());
              const scripts: string[] = [];
              const re = /src="([^"]*)"/g;
              let match: RegExpExecArray | null;
              while ((match = re.exec(html)) !== null) scripts.push(match[1]);
              const dplMatch = html.match(/dpl=([a-zA-Z0-9_-]+)/);
              return { scripts: scripts.length > 0 ? scripts : [null], dpl: dplMatch ? dplMatch[1] : '' };
            } catch {
              return { scripts: [null], dpl: '' };
            }
          }

          async function solveProofOfWork(seed: string, difficulty: string, scripts: Array<string | null>, dpl: string): Promise<string | null> {
            const browser = globalThis as any;
            const nav = browser.navigator ?? {};
            const scr = browser.screen ?? {};
            const perf = browser.performance ?? { now: () => Date.now() };
            const doc = browser.document ?? {};
            const win = browser.window ?? browser;
            const startTime = perf.now();
            const navKeys = Object.keys(Object.getPrototypeOf(nav) ?? {});
            const pickRandom = <T>(arr: T[]): T | null => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
            const encode = (value: unknown[]): string => {
              const json = JSON.stringify(value);
              const bytes = Array.from(new TextEncoder().encode(json));
              return browser.btoa(String.fromCharCode(...bytes));
            };
            const config = [
              (nav.hardwareConcurrency ?? 0) + (scr.width ?? 0) + (scr.height ?? 0),
              new Date().toString(),
              (perf.memory && perf.memory.jsHeapSizeLimit) || 4294705152,
              0,
              nav.userAgent || '',
              pickRandom(scripts) ?? null,
              dpl || '',
              nav.language || '',
              Array.isArray(nav.languages) ? nav.languages.join(',') : '',
              0,
              `${pickRandom(navKeys) ?? 'navigator'}-${nav[pickRandom(navKeys) ?? 'userAgent'] ?? ''}`,
              pickRandom(Object.keys(doc)) ?? 'document',
              pickRandom(Object.keys(win)) ?? 'window',
              perf.now(),
              browser.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
            ];
            for (let i = 1; i < 100000; i++) {
              if (i % 2000 === 0) await new Promise(resolve => setTimeout(resolve, 10));
              config[3] = i;
              config[9] = Math.round(perf.now() - startTime);
              const encoded = encode(config);
              if (sha3_512(seed + encoded).substring(0, difficulty.length) <= difficulty) {
                return encoded;
              }
            }
            return null;
          }

          async function getSentinelHeaders(token: string): Promise<Record<string, string>> {
            try {
              const res = await fetch('/backend-api/sentinel/chat-requirements', {
                method: 'POST',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ conversation_mode_kind: 'primary_assistant' }),
              });
              if (!res.ok) return {};
              const data = await res.json() as {
                token?: string;
                requirements_token?: string;
                proofofwork?: { required?: boolean; seed?: string; difficulty?: string };
              };
              const headers: Record<string, string> = {};
              const requirementsToken = typeof data?.token === 'string' && data.token
                ? data.token
                : typeof data?.requirements_token === 'string' && data.requirements_token
                  ? data.requirements_token
                  : '';
              if (requirementsToken) headers['Openai-Sentinel-Chat-Requirements-Token'] = requirementsToken;
              const pow = data?.proofofwork;
              if (pow?.required && pow.seed && pow.difficulty) {
                const pageData = await getScriptsAndDpl();
                const proofToken = await solveProofOfWork(pow.seed, pow.difficulty, pageData.scripts, pageData.dpl);
                if (proofToken) headers['Openai-Sentinel-Proof-Token'] = `gAAAAAB${proofToken}`;
              }
              return headers;
            } catch {
              return {};
            }
          }

          function deviceId(): string {
            try {
              const cookie = String(document.cookie || '').split(';').map((c: string) => c.trim()).find((c: string) => c.startsWith('oai-did='));
              return cookie ? cookie.slice('oai-did='.length) : '';
            } catch {
              return '';
            }
          }

          function wantedModel(modelId: string): string {
            if (modelId.includes('/o3')) return 'o3';
            if (modelId.includes('thinking-mini')) return 'gpt-5-thinking-mini';
            if (modelId.includes('thinking')) return 'gpt-5.4-thinking';
            if (modelId.includes('instant')) return 'gpt-5.3-instant';
            if (modelId.includes('pro')) return 'gpt-5.4-pro';
            return 'auto';
          }

          async function parseStream(res: Response) {
            if (!res.body) throw new Error('ChatGPT response body was empty');
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';
            let conversationId = state.conversationId;
            let parentMessageId = state.parentMessageId;
            let lastTextPatchPath = '';
            let lastTextPatchOp = '';

            function cleanText(value: string): string {
              let text = value;
              while (text.length > 0 && (text.charCodeAt(0) === 0x200B || text.charCodeAt(0) === 0x00 || text.charCodeAt(0) === 0x200E)) {
                text = text.slice(1);
              }
              text = text.replace(/^\x00/, '').replace(/\x00/g, '');
              if (text.startsWith('genui')) {
                const spaceIdx = text.indexOf(' ');
                if (spaceIdx > 0) text = text.slice(spaceIdx + 1);
              }
              while (text.length > 0 && (text.charCodeAt(text.length - 1) === 0x200B || text.charCodeAt(text.length - 1) === 0x00 || text.charCodeAt(text.length - 1) === 0x200E)) {
                text = text.slice(0, -1);
              }
              return text;
            }

            function isTextPatchPath(path: string): boolean {
              return path.includes('/message/content/parts/')
                || path.includes('/text/')
                || path.includes('/message/content/-')
                || path.endsWith('/content');
            }

            function appendTextChunk(value: unknown): boolean {
              const patchVal = cleanText(String(value ?? ''));
              if (!patchVal) return false;
              if (patchVal === 'finished_successfully') return false;
              if (/^(true|false|null|undefined)$/i.test(patchVal)) return false;
              fullText += patchVal;
              return true;
            }

            function acceptMessage(message: any): void {
              if (message?.author?.role !== 'assistant') return;
              const parts = message?.content?.parts;
              if (!Array.isArray(parts)) return;
              const joined = cleanText(parts.join(''));
              if (joined.length >= fullText.length) fullText = joined;
              if (message.id) parentMessageId = message.id;
            }

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (!raw || raw === '[DONE]') continue;
                try {
                  const parsed = JSON.parse(raw);
                  if (parsed.conversation_id) conversationId = parsed.conversation_id;
                  acceptMessage(parsed.message);
                  acceptMessage(parsed.v?.message);

                  let consumedDirectString = false;
                  if (parsed.p && parsed.v !== undefined && typeof parsed.v !== 'object') {
                    const patchPath = String(parsed.p);
                    if (isTextPatchPath(patchPath)) {
                      lastTextPatchPath = patchPath;
                      lastTextPatchOp = parsed.o ?? 'patch';
                      consumedDirectString = appendTextChunk(parsed.v);
                    }
                  }

                  if (!consumedDirectString && typeof parsed.v === 'string' && lastTextPatchPath && isTextPatchPath(lastTextPatchPath)) {
                    appendTextChunk(parsed.v);
                  }

                  if (Array.isArray(parsed.v)) {
                    for (const patch of parsed.v) {
                      if (!patch?.p || patch.v === undefined || typeof patch.v === 'object') continue;
                      const p = String(patch.p);
                      if (p.includes('/message/content/parts/') || p.includes('/text/') || p.endsWith('/content')) {
                        lastTextPatchPath = p;
                        lastTextPatchOp = patch.o ?? lastTextPatchOp;
                        appendTextChunk(patch.v);
                      }
                    }
                  }
                } catch {
                  // Ignore malformed diagnostic lines.
                }
              }
            }

            reader.releaseLock();
            return { text: fullText, conversationId, parentMessageId };
          }

          const token = await getToken();
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Accept': 'text/event-stream',
            'OAI-Language': 'en-US',
          };
          const did = deviceId();
          if (did) headers['OAI-Device-Id'] = did;
          Object.assign(headers, await getSentinelHeaders(token));

          const payload: Record<string, unknown> = {
            action: 'next',
            messages: [{
              id: crypto.randomUUID(),
              author: { role: 'user' },
              content: { content_type: 'text', parts: [message] },
              metadata: {},
            }],
            model: wantedModel(model),
            parent_message_id: state.parentMessageId || crypto.randomUUID(),
            timezone_offset_min: new Date().getTimezoneOffset(),
            history_and_training_disabled: false,
            conversation_mode: { kind: 'primary_assistant' },
            force_paragen: false,
            force_nulligen: false,
            force_rate_limit: false,
            websocket_request_id: crypto.randomUUID(),
          };
          if (state.conversationId) payload.conversation_id = state.conversationId;

          async function sendConversation(activeHeaders: Record<string, string>) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            try {
              return await fetch('/backend-api/conversation', {
                method: 'POST',
                credentials: 'include',
                headers: activeHeaders,
                body: JSON.stringify(payload),
                signal: controller.signal,
              });
            } finally {
              clearTimeout(timer);
            }
          }

          let res = await sendConversation(headers);
          if (res.status === 401) {
            const freshToken = await getToken();
            headers.Authorization = `Bearer ${freshToken}`;
            Object.assign(headers, await getSentinelHeaders(freshToken));
            res = await sendConversation(headers);
          }

          if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`conversation failed (${res.status}): ${body.slice(0, 240)}`);
          }
          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const body = await res.text().catch(() => '');
            throw new Error(`conversation returned non-stream response: ${body.slice(0, 240)}`);
          }
          return await parseStream(res);
        },
        { message: userMsg, model: req.model, state },
      ) as { text: string; conversationId: string | null; parentMessageId: string | null };

      const text = cleanGenuiPrefix(result.text || '');
      if (!text.trim()) {
        logger.warn('[chatgpt] direct browser API returned empty text; falling back to UI path');
        return null;
      }
      this._throwIfUnusualActivityText(text, 'direct browser API response');

      if (keepDirectState) {
        this._directState.set(account.id, {
          conversationId: result.conversationId ?? null,
          parentMessageId: result.parentMessageId ?? null,
        });
      } else {
        this._directState.delete(account.id);
      }
      return text;
    } catch (err) {
      if (isAccountFailure(err)) throw err;
      logger.warn(`[chatgpt] direct browser API failed; falling back to UI path: ${(err as Error).message}`);
      return null;
    }
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

function shouldKeepProviderConversationState(req: ChatRequest): boolean {
  const providerMessages = req.messages
    .filter(message => message.role !== 'system')
    .filter(message => message.content.trim());
  return providerMessages.length === 1 && providerMessages[0]?.role === 'user';
}
