import { env } from '../config/env.js';
import {
  CATEGORIES,
  CATEGORY_TARGETS,
  CITIES,
  DEFAULT_PAGE_SIZE,
  LOCATIONS,
  MAX_PAGE_SIZE,
  SEARCH_KEYWORDS,
  SOURCE_LABELS,
  SOURCES,
  USER_ROLES,
  VERIFICATION_LABELS,
  VERIFICATION_STATUSES,
  WORK_MODES,
} from '../config/constants.js';
import { isAdzunaConfigured } from '../services/adzuna.service.js';
import { isGeminiConfigured } from '../services/gemini.service.js';
import { isJSearchConfigured } from '../services/jsearch.service.js';
import { getStore } from '../services/store/index.js';
import { startOfRollingWindow } from '../utils/dates.js';

export async function systemConfig(_req, res) {
  res.json({
    success: true,
    data: {
      categories: CATEGORIES,
      categoryTargets: CATEGORY_TARGETS,
      targetTotal: 20,
      locations: LOCATIONS,
      cities: CITIES,
      searchKeywords: SEARCH_KEYWORDS,
      workModes: WORK_MODES,
      sources: SOURCES,
      sourceLabels: SOURCE_LABELS,
      verificationStatuses: VERIFICATION_STATUSES,
      verificationLabels: VERIFICATION_LABELS,
      userRoles: USER_ROLES,
      defaultPageSize: DEFAULT_PAGE_SIZE,
      maxPageSize: MAX_PAGE_SIZE,
      discoveryDailyLimit: env.DISCOVERY_DAILY_LIMIT,
      discoveryMaxAgeDays: env.DISCOVERY_MAX_AGE_DAYS,
      configured: {
        jsearch: isJSearchConfigured(),
        adzuna: isAdzunaConfigured(),
        gemini: isGeminiConfigured(),
        supabase: env.databaseMode === 'supabase',
      },
    },
  });
}

export async function systemStatus(_req, res) {
  const store = await getStore();
  const [summary, searchesUsed] = await Promise.all([
    store.getSystemSummary(),
    store.countSearchesSince(startOfRollingWindow(24)),
  ]);

  res.json({
    success: true,
    data: {
      serverTime: new Date().toISOString(),
      environment: env.NODE_ENV,
      databaseMode: env.databaseMode,
      databaseLabel: env.databaseMode === 'supabase' ? 'Supabase PostgreSQL' : 'Local JSON store',
      persistenceWarning:
        env.databaseMode === 'local'
          ? 'Local development storage. Configure Supabase before deploying.'
          : null,
      authRequired: env.authRequired,
      api: {
        jsearch: { configured: isJSearchConfigured(), host: env.JSEARCH_API_HOST },
        adzuna: { configured: isAdzunaConfigured(), country: env.ADZUNA_COUNTRY },
        gemini: { configured: isGeminiConfigured(), model: env.GEMINI_MODEL },
        supabase: { configured: env.databaseMode === 'supabase' },
      },
      limits: {
        discoveryDaily: env.DISCOVERY_DAILY_LIMIT,
        searchesUsed,
        searchesRemaining: Math.max(0, env.DISCOVERY_DAILY_LIMIT - searchesUsed),
        discoveryMaxAgeDays: env.DISCOVERY_MAX_AGE_DAYS,
      },
      summary,
    },
  });
}

export async function reindexCompanies(_req, res) {
  const store = await getStore();
  const jobs = await store.listAllJobs();
  let processed = 0;
  let failed = 0;
  const companies = new Set();

  for (const job of jobs) {
    try {
      const company = await store.upsertCompanyFromJob(job);
      if (company?.id) companies.add(company.id);
      processed += 1;
    } catch {
      failed += 1;
    }
  }

  res.json({
    success: true,
    data: {
      processed,
      failed,
      companies: companies.size,
      message: `Reviewed ${processed} opportunities and linked ${companies.size} companies.`,
    },
  });
}
