// ── Public types for cortex ──────────────────────────────────────────

export type ProviderName = 'grok' | 'claude' | 'gemini' | 'chatgpt' | 'claude-api' | 'gemini-api' | 'codex-api';

export interface ApiKeyConfig {
  'claude-api'?: string;    // Anthropic API key
  'gemini-api'?: string;    // Google AI API key
  'codex-api'?: string;     // OpenAI API key
}

export interface BridgeConfig {
  port: number;
  host: string;
  profileBaseDir: string;   // e.g. ~/.cortex/profiles
  headless: boolean;        // false = visible browser (for login)
  logLevel: 'silent' | 'info' | 'debug';
  apiKeys: ApiKeyConfig;    // API keys for CLI/SDK-based providers
  admin: {
    dbPath: string;
    jwtSecret?: string;
    tokenTtlSeconds: number;
    requireApiKey: boolean;
    logRetentionDays: number;
    corsOrigin: string;
  };
}

export interface ProviderStatus {
  name: ProviderName;
  connected: boolean;
  hasProfile: boolean;      // profile directory exists on disk
  sessionValid: boolean;    // browser context is alive + verified
  models: string[];
  cookieExpiresAt?: Date;
}

export interface BridgeStatus {
  running: boolean;
  port: number;
  version: string;
  providers: ProviderStatus[];
  uptime: number;           // seconds since start
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  newConversation?: boolean;
}

export interface ModelDefinition {
  id: string;              // e.g. "web-grok/grok-3"
  provider: ProviderName;
  displayName: string;
  owned_by: string;
}

// ── Multi-account routing ────────────────────────────────────────────────────

export type AccountStatus =
  | 'connected'      // session verified, ready to use
  | 'logged_out'     // profile exists but not logged in
  | 'cooldown'       // recently hit a soft block (rate-limit); temporary
  | 'blocked'        // hit a hard block (unusual activity)
  | 'unknown';       // never checked, or check pending

export type AccountFailureReason =
  | 'rate_limited'      // "Too many requests" modal
  | 'unusual_activity'  // "Our systems have detected unusual activity"
  | 'session_expired';  // login lost mid-request

export interface ProviderAccountRecord {
  id: string;
  provider: ProviderName;
  label: string;
  profile_dir: string;             // absolute path on disk
  enabled: 0 | 1;
  status: AccountStatus;
  cooldown_until: string | null;   // ISO timestamp; null when healthy
  last_used_at: string | null;
  last_error: string | null;
  error_count_24h: number;
  /** Lower = picked first when LRU-ranking healthy accounts. Default 100. */
  priority: number;
  /** Per-profile Xvfb slot (0..9 → display :100..:109). null = use shared :99. */
  display_slot: number | null;
  created_at: string;
  created_by: string | null;
  notes: string | null;
}

export interface AccountCooldownConfig {
  rate_limited_seconds: number;       // default 300
  unusual_activity_seconds: number;   // default 1800
  session_expired_seconds: number;    // default 0 (re-login flow instead)
}

// ── Provider interface — each provider implements this ───────────────────────

/**
 * Mutable context passed through chat() / chatStream() so account-pooled
 * providers can report which account handled the request (for logging) and
 * callers can pin a specific account (for testing / sticky routing).
 */
export interface ChatRunContext {
  /** Output: populated by the provider after picking an account. */
  accountId?: string;
  accountLabel?: string;
  /** Input: when set, the pool must use this exact account (by label). */
  pinnedAccountLabel?: string;
}

export interface ProviderAdapter {
  readonly name: ProviderName;
  readonly models: ModelDefinition[];

  /** Check if the browser session is alive and logged in */
  checkSession(): Promise<boolean>;

  /** Ensure connected - restore session from profile if not connected */
  ensureConnected(): Promise<boolean>;

  /** Launch browser + open login page (headful, user logs in manually) */
  login(onReady: (loginUrl: string) => void): Promise<void>;

  /** Close browser context */
  logout(): Promise<void>;

  /** Send a chat message, returns full response. `runCtx` is read by
   *  account-pooled providers for pinning and populated with the account that
   *  was actually used. Non-pooled providers ignore it. */
  chat(req: ChatRequest, runCtx?: ChatRunContext): Promise<string>;

  /** Send a chat message, yields streamed chunks */
  chatStream(req: ChatRequest, runCtx?: ChatRunContext): AsyncGenerator<string>;

  /** Restore session from saved profile (called on startup) */
  restoreSession(): Promise<boolean>;
}
