import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

const directory = await mkdtemp(join(tmpdir(), 'ncr-finder-tests-'));
process.env.NODE_ENV = 'test';
process.env.LOCAL_STORE_FILE = join(directory, 'local-db.json');
process.env.APP_PASSWORD = '';
process.env.AUTH_SECRET = 'test-only-secret-that-is-longer-than-thirty-two-characters';
process.env.JSEARCH_API_KEY = '';
process.env.ADZUNA_APP_ID = '';
process.env.ADZUNA_APP_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.DISCOVERY_DAILY_LIMIT = '5';

afterAll(async () => {
  const { resetStoreForTests } = await import('../services/store/index.js');
  resetStoreForTests();
  await rm(directory, { recursive: true, force: true });
});
