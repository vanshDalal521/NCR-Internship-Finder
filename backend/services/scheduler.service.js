import { env } from '../config/env.js';
import { CITIES, SEARCH_KEYWORDS } from '../config/constants.js';
import { daysAgo } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { isAdzunaConfigured } from './adzuna.service.js';
import { runDiscovery } from './discovery.service.js';
import { broadcast } from './realtime.service.js';
import { backfillAnalysis, backfillScreening, expireStaleJobs } from './screening.service.js';
import { getStore } from './store/index.js';

const AUTO_REVIEWER = 'Auto scheduler';
const COMBINATIONS = CITIES.flatMap((city) =>
  SEARCH_KEYWORDS.map((keyword) => ({ city, keyword })),
);

const state = {
  enabled: env.AUTO_DISCOVERY_ENABLED,
  running: false,
  startedAt: null,
  lastRunAt: null,
  lastTrigger: null,
  lastError: null,
  lastSummary: null,
  nextRunAt: null,
  timer: null,
  initialTimer: null,
};

function monthlyWindowStart() {
  return daysAgo(30).toISOString();
}

async function autoSearchesUsed(store) {
  return store.countSearchesSince(monthlyWindowStart(), { searchedBy: AUTO_REVIEWER });
}

function combinationFor(index) {
  return COMBINATIONS[index % COMBINATIONS.length];
}

function sourcesAvailable() {
  return [
    env.JSEARCH_API_KEY ? 'jsearch' : null,
    isAdzunaConfigured() ? 'adzuna' : null,
  ].filter(Boolean);
}

async function buildStatus(store, extra = {}) {
  const used = store ? await autoSearchesUsed(store) : 0;
  return {
    enabled: state.enabled,
    running: state.running,
    intervalMinutes: env.AUTO_DISCOVERY_INTERVAL_MINUTES,
    searchesPerRun: env.AUTO_DISCOVERY_SEARCHES_PER_RUN,
    monthlyBudget: env.AUTO_DISCOVERY_MONTHLY_BUDGET,
    monthlyUsed: used,
    monthlyRemaining: Math.max(0, env.AUTO_DISCOVERY_MONTHLY_BUDGET - used),
    totalCombinations: COMBINATIONS.length,
    nextCombination: combinationFor(used),
    freshnessHours: env.JOB_FRESHNESS_HOURS,
    startedAt: state.startedAt,
    lastRunAt: state.lastRunAt,
    lastTrigger: state.lastTrigger,
    lastError: state.lastError,
    lastSummary: state.lastSummary,
    nextRunAt: state.nextRunAt,
    ...extra,
  };
}

export async function schedulerStatus() {
  let store = null;
  try {
    store = await getStore();
  } catch {
    // Status can still be reported while the database is unavailable.
  }
  return buildStatus(store);
}

export async function runSchedulerTick({ trigger = 'scheduled' } = {}) {
  if (state.running) {
    return { started: false, reason: 'A discovery run is already in progress.' };
  }

  state.running = true;
  state.lastTrigger = trigger;
  state.lastError = null;
  let store;
  try {
    store = await getStore();
  } catch (error) {
    state.running = false;
    state.lastError = error.message;
    throw error;
  }

  const summary = {
    trigger,
    startedAt: new Date().toISOString(),
    expired: 0,
    screeningBackfill: null,
    analysisBackfill: null,
    searches: [],
    skipped: null,
  };

  try {
    summary.expired = await expireStaleJobs(store);

    try {
      summary.screeningBackfill = await backfillScreening(store, { limit: 12 });
    } catch (error) {
      logger.warn('Screening backfill failed', { message: error.message });
    }

    try {
      summary.analysisBackfill = await backfillAnalysis(store, {
        limit: env.AUTO_ANALYSIS_LIMIT,
      });
    } catch (error) {
      logger.warn('Analysis backfill failed', { message: error.message });
    }

    let allowedSearches = Math.max(1, env.AUTO_DISCOVERY_SEARCHES_PER_RUN);
    if (trigger !== 'manual') {
      const used = await autoSearchesUsed(store);
      const remaining = Math.max(0, env.AUTO_DISCOVERY_MONTHLY_BUDGET - used);
      if (remaining === 0) {
        summary.skipped = `Monthly automated discovery budget reached (${used}/${env.AUTO_DISCOVERY_MONTHLY_BUDGET}).`;
      } else {
        allowedSearches = Math.min(allowedSearches, remaining);
      }
    }

    const sources = sourcesAvailable();
    if (!sources.length) {
      summary.skipped = 'No live job source is configured.';
    }

    if (!summary.skipped) {
      const used = await autoSearchesUsed(store);
      for (let offset = 0; offset < allowedSearches; offset += 1) {
        const combination = combinationFor(used + offset);
        try {
          const result = await runDiscovery(
            store,
            {
              query: combination.keyword,
              location: combination.city,
              sources,
              pages: 1,
              analyzeNew: false,
              searchedBy: AUTO_REVIEWER,
            },
            { trigger: 'scheduler' },
          );
          summary.searches.push({
            keyword: combination.keyword,
            city: combination.city,
            added: result.summary.added,
            refreshed: result.summary.refreshed,
            rejected: result.summary.rejected,
          });
        } catch (error) {
          summary.searches.push({
            keyword: combination.keyword,
            city: combination.city,
            error: error.expose ? error.message : 'The automated search failed.',
          });
          if (error.status === 429) break;
        }
      }
    }
  } catch (error) {
    state.lastError = error.expose ? error.message : 'The automated discovery run failed.';
    logger.error('Scheduled discovery failed', {
      message: error.message,
      trigger,
    });
  } finally {
    state.running = false;
    state.lastRunAt = new Date().toISOString();
    state.lastSummary = summary;
    state.nextRunAt =
      trigger === 'scheduled' || state.timer
        ? new Date(Date.now() + env.AUTO_DISCOVERY_INTERVAL_MINUTES * 60 * 1000).toISOString()
        : state.nextRunAt;
    try {
      broadcast('scheduler', await buildStatus(store));
    } catch {
      // Status broadcast is best-effort.
    }
  }

  return { started: true, ...summary };
}

export function startScheduler() {
  if (env.isTest || !env.AUTO_DISCOVERY_ENABLED || state.timer || state.initialTimer) {
    return buildStatus(null);
  }

  state.startedAt = new Date().toISOString();
  const intervalMs = env.AUTO_DISCOVERY_INTERVAL_MINUTES * 60 * 1000;
  const delayMs = env.AUTO_DISCOVERY_START_DELAY_SECONDS * 1000;
  state.nextRunAt = new Date(Date.now() + delayMs).toISOString();

  logger.info('Scheduled discovery enabled', {
    intervalMinutes: env.AUTO_DISCOVERY_INTERVAL_MINUTES,
    searchesPerRun: env.AUTO_DISCOVERY_SEARCHES_PER_RUN,
    monthlyBudget: env.AUTO_DISCOVERY_MONTHLY_BUDGET,
    freshnessHours: env.JOB_FRESHNESS_HOURS,
  });

  state.initialTimer = setTimeout(async () => {
    state.initialTimer = null;
    await runSchedulerTick({ trigger: 'startup' });
    state.timer = setInterval(() => {
      runSchedulerTick({ trigger: 'scheduled' }).catch((error) => {
        logger.error('Scheduled discovery tick failed', { message: error.message });
      });
    }, intervalMs);
    state.timer.unref?.();
    state.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
  }, delayMs);
  state.initialTimer.unref?.();

  return buildStatus(null);
}

export function stopScheduler() {
  if (state.initialTimer) clearTimeout(state.initialTimer);
  if (state.timer) clearInterval(state.timer);
  state.initialTimer = null;
  state.timer = null;
  state.nextRunAt = null;
}
