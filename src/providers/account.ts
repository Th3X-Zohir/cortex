import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { logger } from '../logger.js';
import type { ProviderAccountRecord } from '../types.js';

const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-infobars',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  ...(process.platform === 'darwin' ? ['--use-mock-keychain'] : []),
];

const STEALTH_OPTIONS = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
  timezoneId: 'Europe/Berlin',
};

export interface ProviderAccountOptions {
  /** The DB row this account is backed by. */
  record: ProviderAccountRecord;
  /** Login page URL (provider-specific, e.g. https://chatgpt.com). */
  loginUrl: string;
  /** Playwright selector that, when visible, indicates a logged-in session. */
  verifySelector: string;
}

/**
 * Resolve the X DISPLAY this account's Chromium should attach to.
 * Slot 0..9 → :100..:109. null slot → shared fallback :99 (or whatever
 * the parent process inherits — used in non-container dev too).
 */
function displayForSlot(slot: number | null): string | undefined {
  if (slot === null || slot === undefined) return undefined;
  return `:${100 + slot}`;
}

/**
 * A single logged-in browser session for one account on one provider.
 *
 * Owns one Playwright BrowserContext bound to its profile directory.
 * Used by the account-pool providers (e.g. ChatGPTProvider) — one instance
 * per row in the provider_accounts table.
 *
 * This class is provider-shape-agnostic: it doesn't know how to send a chat,
 * only how to manage the lifecycle of the underlying browser session and
 * hand out a Page when the pool needs one.
 */
export class ProviderAccount {
  readonly record: ProviderAccountRecord;
  readonly loginUrl: string;
  readonly verifySelector: string;

  private _ctx: BrowserContext | null = null;
  private _restoring = false;
  private _loginInProgress = false;

  constructor(opts: ProviderAccountOptions) {
    this.record = opts.record;
    this.loginUrl = opts.loginUrl;
    this.verifySelector = opts.verifySelector;
  }

  get id(): string { return this.record.id; }
  get label(): string { return this.record.label; }
  get profileDir(): string { return this.record.profile_dir; }
  get hasProfile(): boolean { return existsSync(this.profileDir); }
  get isConnected(): boolean { return this._ctx !== null; }
  get tag(): string { return `${this.record.provider}:${this.record.label}`; }

  async checkSession(): Promise<boolean> {
    if (!this._ctx) return false;
    try {
      this._ctx.pages();
      const page = this._ctx.pages()[0];
      if (!page) return false;
      const quick = await page.locator(this.verifySelector).isVisible({ timeout: 3000 }).catch(() => false);
      if (quick) return true;
      return page.locator(this.verifySelector).count().then(c => c > 0).catch(() => false);
    } catch {
      this._ctx = null;
      return false;
    }
  }

  async ensureConnected(): Promise<boolean> {
    if (await this.checkSession()) return true;
    if (!this.hasProfile) return false;
    return this.restoreSession();
  }

  async restoreSession(): Promise<boolean> {
    if (this._restoring) {
      logger.debug(`[${this.tag}] restore already in progress — waiting…`);
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!this._restoring) return this._ctx !== null;
      }
      return false;
    }
    if (!this.hasProfile) {
      logger.debug(`[${this.tag}] no profile — skipping restore`);
      return false;
    }
    this._restoring = true;
    try {
      return await this._restoreWithRetry();
    } finally {
      this._restoring = false;
    }
  }

  private async _restoreWithRetry(): Promise<boolean> {
    const maxAttempts = 3;
    const delays = [500, 1500, 3000];
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        logger.info(`[${this.tag}] retry ${attempt}/${maxAttempts - 1} in ${delays[attempt] / 1000}s…`);
        await new Promise(r => setTimeout(r, delays[attempt]));
      }
      if (this._loginInProgress) {
        logger.info(`[${this.tag}] login in progress — skipping restore`);
        return false;
      }
      logger.info(`[${this.tag}] restoring session from profile (attempt ${attempt + 1})…`);
      if (this._ctx) {
        await this._ctx.close().catch(() => {});
        this._ctx = null;
      }
      try {
        mkdirSync(this.profileDir, { recursive: true });
        const display = displayForSlot(this.record.display_slot ?? null);
        this._ctx = await chromium.launchPersistentContext(this.profileDir, {
          headless: false,
          args: STEALTH_ARGS,
          env: display ? { ...process.env, DISPLAY: display } : process.env,
          ...STEALTH_OPTIONS,
        });
        const page = this._ctx.pages()[0] ?? await this._ctx.newPage();
        await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

        let onConsentPage = false;
        try { const u = new URL(page.url()); onConsentPage = u.hostname === 'consent.google.com'; } catch { onConsentPage = false; }
        if (onConsentPage) {
          const acceptBtn = page.locator('button:has-text("Accept all"), button:has-text("Alle akzeptieren"), button:has-text("I agree"), button:has-text("Akzeptieren")').first();
          if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await acceptBtn.click();
            await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
          }
        }

        await new Promise(r => setTimeout(r, 5000));
        const valid = await page.locator(this.verifySelector).isVisible({ timeout: 30000 }).catch(() => false);
        if (valid) {
          logger.info(`[${this.tag}] session restored ✅`);
          return true;
        }
        const count = await page.locator(this.verifySelector).count().catch(() => 0);
        if (count > 0) {
          const waitResult = await page.locator(this.verifySelector).first().waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
          if (waitResult) {
            logger.info(`[${this.tag}] session restored (waitFor) ✅`);
            return true;
          }
        }
        await page.mouse.move(640, 450);
        await new Promise(r => setTimeout(r, 2000));
        const validRetry = await page.locator(this.verifySelector).isVisible({ timeout: 10000 }).catch(() => false);
        if (validRetry) {
          logger.info(`[${this.tag}] session restored (after interaction) ✅`);
          return true;
        }
        logger.info(`[${this.tag}] selector not found on attempt ${attempt + 1} (url: ${page.url().slice(0, 80)})`);
        await this._ctx.close().catch(() => {});
        this._ctx = null;
      } catch (err) {
        logger.warn(`[${this.tag}] restore attempt ${attempt + 1} failed: ${(err as Error).message}`);
        if (this._ctx) {
          await this._ctx.close().catch(() => {});
          this._ctx = null;
        }
      }
    }
    logger.info(`[${this.tag}] profile exists but not logged in — all attempts exhausted`);
    return false;
  }

  async login(onReady: (loginUrl: string) => void): Promise<void> {
    if (this._loginInProgress) {
      logger.debug(`[${this.tag}] login already in progress — skipping`);
      return;
    }
    if (await this.checkSession()) {
      logger.info(`[${this.tag}] already connected — skipping login`);
      return;
    }
    if (this._restoring) {
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (!this._restoring) break;
      }
      if (await this.checkSession()) return;
    }
    this._loginInProgress = true;
    logger.info(`[${this.tag}] launching login browser…`);
    mkdirSync(this.profileDir, { recursive: true });
    await this.logout();
    const display = displayForSlot(this.record.display_slot ?? null);
    const loginCtx = await chromium.launchPersistentContext(this.profileDir, {
      headless: false,
      args: STEALTH_ARGS,
      env: display ? { ...process.env, DISPLAY: display } : process.env,
      ...STEALTH_OPTIONS,
    });
    this._ctx = loginCtx;
    const page = loginCtx.pages()[0] ?? await loginCtx.newPage();
    await page.goto(this.loginUrl, { waitUntil: 'domcontentloaded' });
    onReady(this.loginUrl);
    logger.info(`[${this.tag}] browser open — waiting for login…`);
    try {
      await page.locator(this.verifySelector).waitFor({ timeout: 300000 });
      logger.info(`[${this.tag}] login successful ✅`);
    } catch {
      logger.warn(`[${this.tag}] login timed out`);
      await loginCtx.close().catch(() => {});
      if (this._ctx === loginCtx) this._ctx = null;
      throw new Error(`Login timed out for ${this.tag}`);
    } finally {
      this._loginInProgress = false;
    }
  }

  async logout(): Promise<void> {
    if (this._ctx) {
      await this._ctx.close().catch(() => {});
      this._ctx = null;
    }
    logger.info(`[${this.tag}] logged out`);
  }

  /**
   * Permanently delete this account's profile directory.
   * Closes the browser context first.
   */
  async deleteProfile(): Promise<void> {
    await this.logout();
    if (existsSync(this.profileDir)) {
      try {
        rmSync(this.profileDir, { recursive: true, force: true });
        logger.info(`[${this.tag}] profile directory deleted`);
      } catch (err) {
        logger.warn(`[${this.tag}] failed to delete profile dir: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Open a fresh page on this account's context. Caller is responsible for closing it.
   * Throws if the context is not connected — pool should call ensureConnected first.
   */
  async newPage(): Promise<Page> {
    if (!this._ctx) {
      throw new Error(`[${this.tag}] not connected — pool must restoreSession first`);
    }
    return this._ctx.newPage();
  }

  /**
   * Snapshot of currently-open pages on this account's browser context. Used
   * by the browsers dashboard to display per-account live URLs / titles
   * without disturbing the running session.
   */
  async livePages(): Promise<Array<{ url: string; title: string }>> {
    if (!this._ctx) return [];
    try {
      const pages = this._ctx.pages();
      return await Promise.all(pages.map(async p => ({
        url: p.url(),
        title: await p.title().catch(() => ''),
      })));
    } catch {
      return [];
    }
  }

  /**
   * Capture a JPEG screenshot of the most-recently-active page on this
   * account. Returns null if no page is open or screenshot fails. Used by the
   * browsers dashboard to render a live thumbnail grid — independent of which
   * Chromium window happens to be focused on the shared Xvfb display.
   *
   * The capture is taken from the page bitmap (not the X framebuffer), so
   * each account renders its own content correctly regardless of stacking.
   */
  async screenshot(): Promise<Buffer | null> {
    if (!this._ctx) return null;
    try {
      const pages = this._ctx.pages();
      if (pages.length === 0) return null;
      // Pick the last page — usually the most-recently-opened tab where the
      // current chat is happening. The first page (index 0) is often a stale
      // login/home tab.
      const page = pages[pages.length - 1];
      return await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false, timeout: 4000 });
    } catch {
      return null;
    }
  }
}
