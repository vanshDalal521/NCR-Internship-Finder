import { getStore } from '../services/store/index.js';
import { isAdzunaConfigured } from '../services/adzuna.service.js';
import { isGeminiConfigured } from '../services/gemini.service.js';
import { isJSearchConfigured } from '../services/jsearch.service.js';
import { quotaSnapshot, runDiscovery } from '../services/discovery.service.js';
import {
  discoverSearchSchema,
  parseOrThrow,
  searchHistoryQuerySchema,
} from '../utils/validation.js';

export async function discoverSearch(req, res) {
  const input = parseOrThrow(discoverSearchSchema, req.body || {});
  const store = await getStore();
  const data = await runDiscovery(store, input, { trigger: 'manual' });
  res.json({ success: true, data });
}

export async function searchHistory(req, res) {
  const query = parseOrThrow(searchHistoryQuerySchema, req.query);
  const store = await getStore();
  const [items, quota] = await Promise.all([
    store.listSearchHistory(query.limit),
    quotaSnapshot(store),
  ]);
  res.json({ success: true, data: { items, quota } });
}

export async function discoveryUsage(_req, res) {
  const store = await getStore();
  const quota = await quotaSnapshot(store);
  res.json({
    success: true,
    data: {
      quota,
      configured: {
        jsearch: isJSearchConfigured(),
        adzuna: isAdzunaConfigured(),
        gemini: isGeminiConfigured(),
      },
    },
  });
}
