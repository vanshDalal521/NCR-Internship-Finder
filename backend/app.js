import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './config/env.js';
import { apiLimiter } from './middleware/rate-limiter.js';
import { corsOptions, requestLogger } from './middleware/request.js';
import { securityHeaders } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './utils/http-error.js';
import { requireAuth, verifySessionToken } from './utils/auth.js';
import { getStore } from './services/store/index.js';
import { addRealtimeClient } from './services/realtime.service.js';
import authRoutes from './routes/auth.routes.js';
import apiRoutes from './routes/index.js';

const app = express();

app.disable('x-powered-by');
if (env.isProduction) app.set('trust proxy', 1);

app.use(requestLogger);
app.use(helmet(securityHeaders()));
app.use(cors(corsOptions()));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

app.get('/api/health', async (_req, res) => {
  try {
    const store = await getStore();
    const summary = await store.getSystemSummary();
    res.json({
      success: true,
      data: {
        status: 'ok',
        databaseMode: env.databaseMode,
        jobs: summary.jobs,
        verifiedActive: summary.verifiedActive,
        time: new Date().toISOString(),
      },
    });
  } catch {
    res.status(503).json({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: 'The application database is unavailable.' },
    });
  }
});

app.get('/api/events', (req, res) => {
  if (env.authRequired) {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    if (!verifySessionToken(token)) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Sign in to receive live updates.' },
      });
    }
  }
  return addRealtimeClient(req, res);
});

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, apiRoutes);
app.use('/api', notFoundHandler);

const distExists = existsSync(env.frontendDist);
if (distExists) {
  app.use(
    express.static(env.frontendDist, {
      index: false,
      maxAge: env.isProduction ? '1h' : 0,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
      },
    }),
  );

  app.get('/', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(resolve(env.frontendDist, 'index.html'));
  });

  const pageNames = [
    'discover',
    'opportunities',
    'verification',
    'companies',
    'reports',
    'settings',
  ];

  for (const page of pageNames) {
    app.get(`/${page}`, (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(resolve(env.frontendDist, `${page}.html`));
    });
  }

  app.get('/pages/:page', (req, res, next) => {
    const requested = req.params.page;
    const fileName = requested.endsWith('.html') ? requested : `${requested}.html`;
    if (!/^[a-z-]+\.html$/.test(fileName)) return next();
    const candidates = [
      resolve(env.frontendDist, 'pages', fileName),
      resolve(env.frontendDist, 'src/pages', fileName),
    ];
    const target = candidates.find((candidate) => existsSync(candidate));
    if (!target) return next();
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(target);
  });
}

app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'NCR Tech Internship Finder API',
      status: 'running',
      health: '/api/health',
      docs: '/api/system/config',
      message: distExists
        ? 'Frontend build is being served.'
        : 'Run the Vite frontend at http://localhost:5173 during development.',
    },
  });
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) return notFoundHandler(req, res, () => {});
  res.status(404).type('text/plain').send('Not found');
});

app.use(errorHandler);

export default app;
