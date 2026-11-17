import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  if (env.isTest) return next();
  const startedAt = performance.now();
  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level](`${req.method} ${req.originalUrl} ${res.statusCode}`, { durationMs });
  });
  next();
}

const CORS_SETTINGS = {
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Reviewer-Name'],
  exposedHeaders: ['Retry-After'],
  credentials: false,
  maxAge: 86400,
};

export function corsOptions() {
  return (req, callback) => {
    const origin = req.header('Origin');
    if (!origin) return callback(null, { ...CORS_SETTINGS, origin: false });

    const normalized = origin.replace(/\/$/, '');
    const allowedByConfig = env.allowedOrigins.includes(normalized);

    // The API also serves the built frontend. In that deployment the browser
    // sends an Origin header equal to the public host, which is same-origin and
    // does not need to be pre-registered in ALLOWED_ORIGINS.
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === req.get('host');
    } catch {
      sameOrigin = false;
    }

    if (allowedByConfig || sameOrigin) {
      return callback(null, { ...CORS_SETTINGS, origin: true });
    }

    const error = new Error('Origin is not allowed by the server configuration.');
    error.status = 403;
    error.code = 'ORIGIN_NOT_ALLOWED';
    error.expose = true;
    return callback(error);
  };
}
