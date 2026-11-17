import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { getStore } from './services/store/index.js';

async function start() {
  const store = await getStore();
  const summary = await store.getSystemSummary();

  const server = app.listen(env.PORT, () => {
    logger.info('NCR Internship Finder API started', {
      port: env.PORT,
      environment: env.NODE_ENV,
      database: env.databaseMode,
      jobs: summary.jobs,
      verifiedActive: summary.verifiedActive,
      authRequired: env.authRequired,
    });
    if (!env.isProduction) {
      logger.info(`Frontend dev server: ${env.FRONTEND_ORIGIN}`);
      logger.info(`API health: http://localhost:${env.PORT}/api/health`);
    }
  });

  async function shutdown(signal) {
    logger.info(`Received ${signal}. Closing the server gracefully.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  logger.error('Server failed to start', { message: error.message, stack: error.stack });
  process.exit(1);
});
