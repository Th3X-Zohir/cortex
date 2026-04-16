import { createWriteStream, appendFileSync, existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import type { BridgeConfig } from './types.js';

export type LogLevel = 'silent' | 'info' | 'debug';

export class Logger {
  private _level: LogLevel;
  private _listeners: Array<(line: string) => void> = [];
  private _filePath: string | null = null;

  constructor(level: LogLevel = 'info') {
    this._level = level;
  }

  setLevel(level: LogLevel) { this._level = level; }

  /** Enable file logging — writes all log output to a timestamped file in logs/ */
  enableFileLogging() {
    const logsDir = 'logs';
    if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    this._filePath = `${logsDir}/cortex-${ts}.log`;
    appendFileSync(this._filePath, `=== cortex log started at ${new Date().toISOString()} ===\n`);
    this._emit(`[cortex] file logging → ${this._filePath}`);
  }

  /** Subscribe to log output (for streaming to VS Code Output Channel) */
  onLine(cb: (line: string) => void) {
    this._listeners.push(cb);
    return () => { this._listeners = this._listeners.filter(l => l !== cb); };
  }

  info(msg: string) {
    if (this._level === 'silent') return;
    this._emit(`[cortex] ${msg}`);
  }

  debug(msg: string) {
    if (this._level !== 'debug') return;
    this._emit(`[cortex:debug] ${msg}`);
  }

  warn(msg: string) {
    if (this._level === 'silent') return;
    this._emit(`[cortex:warn] ${msg}`);
  }

  error(msg: string) {
    this._emit(`[cortex:error] ${msg}`);
  }

  private _emit(line: string) {
    const ts = new Date().toISOString().slice(0, 19);
    const full = `${ts} ${line}`;
    console.error(full);
    if (this._filePath) appendFileSync(this._filePath, full + '\n');
    for (const cb of this._listeners) cb(full);
  }
}

export const logger = new Logger();

export function configureLogger(cfg: Pick<BridgeConfig, 'logLevel'>) {
  logger.setLevel(cfg.logLevel);
}
