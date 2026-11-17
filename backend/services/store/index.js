import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { LocalStore } from './local.store.js';
import { SupabaseStore } from './supabase.store.js';

let storePromise;

export async function getStore() {
  if (!storePromise) {
    storePromise = (async () => {
      if (env.databaseMode === 'supabase') {
        const store = await new SupabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).init();
        logger.info('Connected to Supabase PostgreSQL');
        return store;
      }

      const store = await LocalStore.open(env.localStoreFile);
      logger.warn('Using local JSON store for development', { file: env.localStoreFile });
      return store;
    })();
  }

  return storePromise;
}

export async function resetStoreForTests() {
  storePromise = null;
}
