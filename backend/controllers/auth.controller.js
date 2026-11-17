import { z } from 'zod';
import { env } from '../config/env.js';
import { authMePayload, createSessionToken, verifyPassword } from '../utils/auth.js';
import { ApiError } from '../utils/http-error.js';
import { parseOrThrow } from '../utils/validation.js';

const loginSchema = z.object({
  password: z.string().max(500).default(''),
  name: z.string().trim().max(120).optional().default(''),
});

export async function login(req, res) {
  const input = parseOrThrow(loginSchema, req.body || {});

  if (!env.authRequired) {
    return res.json({
      success: true,
      data: {
        authenticated: true,
        authRequired: false,
        token: null,
        mode: 'development',
        message: 'Authentication is disabled for local development.',
      },
    });
  }

  if (!verifyPassword(input.password)) {
    throw ApiError.unauthorized('The committee password is incorrect.');
  }

  const token = createSessionToken({ name: input.name });
  res.json({
    success: true,
    data: {
      authenticated: true,
      authRequired: true,
      mode: 'password',
      token,
      name: input.name || 'Committee Member',
      expiresInSeconds: env.SESSION_TTL_HOURS * 60 * 60,
    },
  });
}

export async function me(req, res) {
  res.json({ success: true, data: authMePayload(req) });
}

export async function logout(_req, res) {
  // Sessions are stateless bearer tokens; the browser removes its copy.
  res.json({ success: true, data: { loggedOut: true } });
}
