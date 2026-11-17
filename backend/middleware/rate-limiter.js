import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const skip = () => env.isTest;

function handler(message) {
  return (req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message,
        retryAfterSeconds: Number(res.getHeader('Retry-After')) || 60,
      },
    });
  };
}

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Too many requests. Please wait a moment and try again.'),
});

export const discoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Too many discovery requests. Please wait before searching again.'),
});

export const analysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Too many AI analysis requests. Please try again shortly.'),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip,
  handler: handler('Too many sign-in attempts. Try again in a few minutes.'),
});

export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip,
  handler: handler('Too many changes in a short period. Please wait and try again.'),
});
