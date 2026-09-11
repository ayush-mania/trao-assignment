// Passwords: scrypt from node:crypto (no native dependency). Sessions: random token stored server-side.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Session } from '../models/session.js';
import { User } from '../models/user.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function register(email: string, password: string) {
  const existing = await User.findOne({ email: email.toLowerCase() }).lean();
  if (existing) throw new AuthError(409, 'An account with this email already exists');
  const user = await User.create({ email, passwordHash: await hashPassword(password) });
  return { id: user._id.toString(), email: user.email };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Same message for unknown email and wrong password: no account enumeration.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AuthError(401, 'Invalid email or password');
  }
  return { id: user._id.toString(), email: user.email };
}

export async function createSession(userId: string, maxAgeMs: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await Session.create({ _id: token, userId, expiresAt: new Date(Date.now() + maxAgeMs) });
  return token;
}

export async function resolveSession(token: string): Promise<{ id: string; email: string } | null> {
  const session = await Session.findById(token).lean();
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;
  const user = await User.findById(session.userId).lean();
  return user ? { id: user._id.toString(), email: user.email } : null;
}

export async function destroySession(token: string): Promise<void> {
  await Session.deleteOne({ _id: token });
}
