import type { BridgeConfig, ProviderName, ProviderStatus, BridgeStatus, ModelDefinition, ProviderAdapter } from './types.js';
import type { BaseProvider } from './providers/base.js';
import { GrokProvider } from './providers/grok.js';
import { GeminiProvider } from './providers/gemini.js';
import { ChatGPTProvider } from './providers/chatgpt.js';
import type { AdminStore } from './admin/store.js';
import { logger } from './logger.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
})();

export class ProviderRegistry {
  private _providers: Map<ProviderName, ProviderAdapter> = new Map();
  private _startTime = Date.now();
  private _restoreDone = false;
  private _restoring = false;

  constructor(private _cfg: BridgeConfig, private _store: AdminStore | null = null) {
    // Migrate any legacy accounts that don't yet have a display_slot assigned.
    if (_store) {
      try { _store.backfillDisplaySlots(); } catch (err) {
        logger.warn(`Display slot backfill failed: ${(err as Error).message}`);
      }
    }
    // Web-based providers (Playwright)
    this._providers.set('grok',       new GrokProvider(_cfg));
    this._providers.set('gemini',     new GeminiProvider(_cfg));
    this._providers.set('chatgpt',    new ChatGPTProvider(_cfg, _store));
  }

  get store(): AdminStore | null { return this._store; }

  get(name: ProviderName): ProviderAdapter {
    return this._providers.get(name)!;
  }

  allModels(): ModelDefinition[] {
    return [...this._providers.values()].flatMap(p => p.models);
  }

  providerForModel(modelId: string): ProviderAdapter | undefined {
    return [...this._providers.values()].find(p =>
      p.models.some(m => m.id === modelId),
    );
  }

  /** True while initial session restore is in progress */
  get isRestoring(): boolean { return this._restoring; }

  /** Restore sessions from saved profiles — sequential, profile-gated */
  async restoreSessions(): Promise<void> {
    if (this._restoreDone) return;
    this._restoreDone = true;
    this._restoring = true;

    logger.info('Restoring sessions…');
    const providers = [...this._providers.values()];

    try {
      for (const p of providers) {
        // API providers restore instantly (just check API key)
        // Web providers need profile directory
        const isWebProvider = 'hasProfile' in p;
        if (isWebProvider && !(p as BaseProvider).hasProfile) {
          logger.debug(`[${p.name}] no profile — skipping`);
          continue;
        }
        try {
          await p.restoreSession();
        } catch (err) {
          logger.warn(`[${p.name}] restore error: ${(err as Error).message}`);
        }
        // Sequential delay for web providers to avoid OOM
        if (isWebProvider) await new Promise(r => setTimeout(r, 2000));
      }
    } finally {
      this._restoring = false;
      logger.info('Session restore complete');
    }
  }

  /** Periodically check sessions and reconnect any that have gone stale */
  async keepaliveSessions(): Promise<void> {
    const providers = [...this._providers.values()];
    for (const p of providers) {
      // Skip API providers (they don't need keepalive) and web providers without profiles
      const isWebProvider = 'hasProfile' in p;
      if (!isWebProvider) continue;
      if (!(p as BaseProvider).hasProfile) continue;

      const alive = await p.checkSession();
      if (!alive) {
        logger.info(`[${p.name}] session stale — attempting reconnect…`);
        try {
          await p.restoreSession();
        } catch (err) {
          logger.debug(`[${p.name}] keepalive reconnect failed: ${(err as Error).message}`);
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  async getStatus(): Promise<BridgeStatus> {
    const providers: ProviderStatus[] = [];

    for (const [name, p] of this._providers) {
      const sessionValid = await p.checkSession();
      const isWebProvider = 'hasProfile' in p;
      providers.push({
        name,
        connected: sessionValid,
        hasProfile: isWebProvider ? (p as BaseProvider).hasProfile : sessionValid,
        sessionValid,
        models: p.models.map(m => m.id),
      });
    }

    return {
      running: true,
      port: this._cfg.port,
      version: VERSION,
      providers,
      uptime: Math.floor((Date.now() - this._startTime) / 1000),
    };
  }
}
