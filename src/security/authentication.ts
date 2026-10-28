import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AppConfig } from '../shared/config.js';

export type Session = { username: string; csrf: string; expires: number };
const SESSION_TTL = 8 * 60 * 60 * 1000;
const WINDOW = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  return `${salt}:${scryptSync(password, Buffer.from(salt, 'hex'), 64, { maxmem: 64 * 1024 * 1024 }).toString('hex')}`;
}
export function verifyPassword(password: string, hash: string): boolean {
  try {
    if (password.length > 1024) return false;
    const [salt, expectedHex] = hash.split(':');
    if (!salt || !expectedHex) return false;
    const candidate = scryptSync(password, Buffer.from(salt, 'hex'), 64, {maxmem: 64 * 1024 * 1024});
    return timingSafeEqual(candidate, Buffer.from(expectedHex, 'hex'));
  } catch { return false; }
}
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function token() { return randomBytes(32).toString('base64url'); }

export class SessionManager {
  private sessions = new Map<string, Session>();
  private failures = new Map<string, {count:number; until:number}>();
  private cookieName: string;

  constructor(private config: AppConfig) {
    this.cookieName = config.secureCookies ? '__Host-vpsmcp' : 'vpsmcp_local';
  }
  login(username: string, password: string, address: string): string | null {
    const now = Date.now();
    const attempted = this.failures.get(address);
    if (attempted && attempted.until > now && attempted.count >= MAX_FAILURES) return null;
    // Always run scrypt even when username is invalid.
    const verified = verifyPassword(password, this.config.ADMIN_PASSWORD_HASH);
    if (!safeEqual(username, this.config.ADMIN_USERNAME) || !verified) {
      const count = attempted && attempted.until > now ? attempted.count + 1 : 1;
      this.failures.set(address, {count, until: now + WINDOW});
      return null;
    }
    this.failures.delete(address);
    const sid = token();
    this.sessions.set(sid, {username, csrf:token(), expires:now + SESSION_TTL});
    return sid;
  }
  get(req: IncomingMessage): Session | null {
    const cookie = (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(this.cookieName+'='));
    const id = cookie?.slice(this.cookieName.length+1);
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expires <= Date.now()) {this.sessions.delete(id); return null;}
    return session;
  }
  csrfForId(id: string): string { return this.sessions.get(id)?.csrf || ''; }
  setCookie(res: ServerResponse, id: string) {
    res.setHeader('Set-Cookie', `${this.cookieName}=${id}; Path=/; HttpOnly; SameSite=Strict; ${this.config.secureCookies ? 'Secure; ' : ''}Max-Age=28800`);
  }
  logout(req: IncomingMessage, res: ServerResponse) {
    const cookie = (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(this.cookieName+'='));
    if(cookie) this.sessions.delete(cookie.slice(this.cookieName.length+1));
    res.setHeader('Set-Cookie',`${this.cookieName}=; Path=/; HttpOnly; SameSite=Strict; ${this.config.secureCookies ? 'Secure; ' : ''}Max-Age=0`);
  }
  verifyCsrf(session: Session, value: string | undefined) {return !!value && safeEqual(session.csrf, value);}
}
