import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { AdminRecord, UserRecord } from './store.js';
import type { BridgeConfig } from '../types.js';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function jsonB64(input: unknown): string {
  return b64url(JSON.stringify(input));
}

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password, salt, 64, SCRYPT_PARAMS).toString('base64url');
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, salt, expected] = parts;
  const actual = scryptSync(password, salt, 64, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  }).toString('base64url');

  return safeEqualString(actual, expected);
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function getSecretFromFile(): string {
  const path = join(homedir(), '.cortex', 'admin-jwt-secret');
  if (existsSync(path)) return readFileSync(path, 'utf-8').trim();

  mkdirSync(dirname(path), { recursive: true });
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(path, secret, { mode: 0o600 });
  return secret;
}

function getJwtSecret(cfg: BridgeConfig): string {
  return cfg.admin.jwtSecret || process.env.CORTEX_ADMIN_JWT_SECRET || getSecretFromFile();
}

export interface AdminTokenPayload {
  sub: string;
  username: string;
  role: AdminRecord['role'];
  iat: number;
  exp: number;
}

export function publicAdmin(admin: AdminRecord | Omit<AdminRecord, 'password_hash'>) {
  return {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    createdAt: admin.created_at,
    lastLogin: admin.last_login,
    mustChangePassword: Boolean(admin.must_change_password),
  };
}

export function signAdminToken(admin: AdminRecord, cfg: BridgeConfig): { token: string; expiresAt: string; expiresIn: string } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + cfg.admin.tokenTtlSeconds;
  const header = jsonB64({ alg: 'HS256', typ: 'JWT' });
  const payload = jsonB64({
    sub: admin.id,
    username: admin.username,
    role: admin.role,
    iat: now,
    exp,
  } satisfies AdminTokenPayload);
  const body = `${header}.${payload}`;
  const signature = createHmac('sha256', getJwtSecret(cfg)).update(body).digest('base64url');

  return {
    token: `${body}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    expiresIn: `${cfg.admin.tokenTtlSeconds}s`,
  };
}

export function verifyAdminToken(token: string, cfg: BridgeConfig): AdminTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', getJwtSecret(cfg)).update(`${header}.${payload}`).digest('base64url');
  if (!safeEqualString(signature, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as AdminTokenPayload;
    if (!data.sub || !data.username || !data.role || !data.exp) return null;
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export interface UserTokenPayload {
  sub: string;
  username: string;
  email: string;
  type: 'user';
  iat: number;
  exp: number;
}

export function publicUser(user: UserRecord | Omit<UserRecord, 'password_hash'>) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    status: user.status,
    createdAt: user.created_at,
    lastLogin: user.last_login,
  };
}

export function signUserToken(user: UserRecord, cfg: BridgeConfig): { token: string; expiresAt: string; expiresIn: string } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + cfg.admin.tokenTtlSeconds;
  const header = jsonB64({ alg: 'HS256', typ: 'JWT' });
  const payload = jsonB64({
    sub: user.id,
    username: user.username,
    email: user.email,
    type: 'user',
    iat: now,
    exp,
  } satisfies UserTokenPayload);
  const body = `${header}.${payload}`;
  const signature = createHmac('sha256', getJwtSecret(cfg)).update(body).digest('base64url');
  return {
    token: `${body}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    expiresIn: `${cfg.admin.tokenTtlSeconds}s`,
  };
}

export function verifyUserToken(token: string, cfg: BridgeConfig): UserTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = createHmac('sha256', getJwtSecret(cfg)).update(`${header}.${payload}`).digest('base64url');
  if (!safeEqualString(signature, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as UserTokenPayload;
    if (!data.sub || !data.username || data.type !== 'user' || !data.exp) return null;
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
