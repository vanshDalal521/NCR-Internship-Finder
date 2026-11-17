import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from './http-error.js';

function sha256(value) {
  return createHash('sha256').update(String(value)).digest();
}

export function verifyPassword(candidate) {
  if (!env.APP_PASSWORD) return true;
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const expected = sha256(env.APP_PASSWORD);
  const provided = sha256(candidate);
  return timingSafeEqual(expected, provided);
}

function sign(value) {
  return createHmac('sha256', env.authSecret).update(value).digest('base64url');
}

export function createSessionToken({ name = '' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'committee',
    name: String(name || '').slice(0, 120),
    iat: now,
    exp: now + env.SESSION_TTL_HOURS * 60 * 60,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const provided = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(provided, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload?.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.sub !== 'committee') return null;
    return payload;
  } catch {
    return null;
  }
}

export function extractBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export const authStatus = () => ({
  authenticated: !env.authRequired || null,
  authRequired: env.authRequired,
  mode: env.authRequired ? 'password' : 'development',
  sessionTtlHours: env.SESSION_TTL_HOURS,
});

export function requireAuth(req, _res, next) {
  if (!env.authRequired) {
    req.auth = { mode: 'development', name: 'Development Committee' };
    return next();
  }

  const token = extractBearerToken(req);
  const payload = verifySessionToken(token);
  if (!payload) return next(ApiError.unauthorized('Sign in to continue.'));

  req.auth = {
    mode: 'password',
    name: payload.name || 'Committee Member',
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
  next();
}

export function authMePayload(req) {
  if (!env.authRequired) {
    return {
      authenticated: true,
      authRequired: false,
      mode: 'development',
      name: req.auth?.name || 'Development Committee',
      sessionTtlHours: env.SESSION_TTL_HOURS,
    };
  }

  const token = extractBearerToken(req);
  const payload = verifySessionToken(token);
  if (!payload) return { authenticated: false, authRequired: true, mode: 'password' };
  return {
    authenticated: true,
    authRequired: true,
    mode: 'password',
    name: payload.name || 'Committee Member',
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    sessionTtlHours: env.SESSION_TTL_HOURS,
  };
}
