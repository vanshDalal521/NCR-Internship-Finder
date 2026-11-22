import { env } from '../config/env.js';
import { DEFAULT_REVIEWER } from '../config/constants.js';
import { ApiError } from '../utils/http-error.js';
import { startOfRollingWindow } from '../utils/dates.js';
import { isAdzunaConfigured, searchAdzuna } from './adzuna.service.js';
import { isGeminiConfigured } from './gemini.service.js';
import { ingestNormalizedResults } from './job-ingest.service.js';
import { normalizeAdzunaJob, normalizeJSearchJob } from './job-normalizer.js';
import { isJSearchConfigured, searchJSearch } from './jsearch.service.js';
import { broadcast } from './realtime.service.js';
import { processJobBatch } from './screening.service.js';
import { logger } from '../utils/logger.js';

function normalizedWarning(source, error) {
  return {
    source,
    message: error.expose ? error.message : `${source} could not be reached.`,
  };
}

function recordSummary(summary) {
  return {
    received: summary.received,
    eligible: summary.eligible,
    added: summary.added,
    refreshed: summary.refreshed,
    duplicates: summary.duplicates,
    rejected: summary.rejected,
    failed: summary.failed,
    reasons: summary.reasons,
    rejectionLabels: summary.rejectionLabels,
    newJobs: summary.newJobs,
    duplicateMatches: summary.duplicateMatches,
    errors: summary.errors,
  };
}

export async function quotaSnapshot(store) {
  const used = await store.countSearchesSince(startOfRollingWindow(24));
  return {
    used,
    limit: env.DISCOVERY_DAILY_LIMIT,
    remaining: Math.max(0, env.DISCOVERY_DAILY_LIMIT - used),
    window: 'rolling 24 hours',
  };
}

export async function runDiscovery(store, input, { trigger = 'manual' } = {}) {
  const sources = [...new Set(input.sources)];
  const automated = trigger === 'scheduler';

  if (sources.includes('jsearch') && !isJSearchConfigured()) {
    throw ApiError.badRequest('JSearch is selected but not configured.', {
      integration: 'jsearch',
    });
  }
  if (sources.includes('adzuna') && !isAdzunaConfigured()) {
    throw ApiError.badRequest('Adzuna is selected but not configured.', {
      integration: 'adzuna',
    });
  }

  const beforeQuota = await quotaSnapshot(store);
  if (beforeQuota.used >= env.DISCOVERY_DAILY_LIMIT) {
    throw ApiError.tooManyRequests(
      `The daily discovery limit of ${env.DISCOVERY_DAILY_LIMIT} searches has been reached. It resets on a rolling 24-hour basis.`,
      beforeQuota,
    );
  }

  const searches = sources.map(async (source) => {
    try {
      const raw =
        source === 'jsearch'
          ? await searchJSearch({ query: input.query, location: input.location, pages: input.pages })
          : await searchAdzuna({ query: input.query, location: input.location, pages: input.pages });
      return { source, raw, error: null };
    } catch (error) {
      return { source, raw: [], error };
    }
  });

  const sourceResults = await Promise.all(searches);
  const warnings = sourceResults
    .filter((entry) => entry.error)
    .map((entry) =>
      normalizedWarning(entry.source === 'jsearch' ? 'JSearch' : 'Adzuna', entry.error),
    );
  const successes = sourceResults.filter((entry) => !entry.error);

  const normalized = [];
  let rawCount = 0;
  for (const entry of successes) {
    rawCount += entry.raw.length;
    for (const rawJob of entry.raw) {
      const result =
        entry.source === 'jsearch'
          ? normalizeJSearchJob(rawJob)
          : normalizeAdzunaJob(rawJob);
      if (result.ok && input.category && result.job.category && result.job.category !== input.category) {
        normalized.push({ ok: false, reason: 'category_mismatch' });
      } else {
        normalized.push(result);
      }
    }
  }

  const summary = await ingestNormalizedResults(store, normalized, {
    source: sources.join('+'),
  });

  if (input.analyzeNew && !isGeminiConfigured()) {
    warnings.push({
      source: 'Gemini',
      message: 'AI analysis was requested but GEMINI_API_KEY is not configured. New jobs remain pending analysis.',
    });
  }

  const analyses = {
    requested: summary.newJobIds.length,
    analyzed: 0,
    failed: 0,
    queued: summary.newJobIds.length,
    background: true,
  };

  if (summary.newJobIds.length) {
    processJobBatch(store, summary.newJobIds).catch((error) => {
      logger.error('Background screening failed', { message: error.message });
    });
  }

  const successCount = sourceResults.filter((entry) => !entry.error).length;
  const status = successCount === 0 ? 'failed' : warnings.length ? 'partial' : 'completed';
  const message = warnings.map((warning) => `${warning.source}: ${warning.message}`).join(' ').slice(0, 1200);

  await store.addSearchHistory({
    query: input.query,
    location: input.location,
    category: input.category || null,
    sources,
    results_count: rawCount,
    inserted_count: summary.added,
    duplicate_count: summary.duplicates,
    error_count: warnings.length,
    status,
    message: message || null,
    searched_by: automated
      ? 'Auto scheduler'
      : String(input.searchedBy || DEFAULT_REVIEWER).trim().slice(0, 120),
    details: {
      trigger,
      sourceResults: sourceResults.map((entry) => ({
        source: entry.source,
        returned: entry.raw.length,
        error: entry.error ? entry.error.message : null,
      })),
      reasons: summary.reasons,
      screeningQueued: summary.newJobIds.length,
    },
  });

  const quota = await quotaSnapshot(store);

  if (successCount === 0) {
    const firstError = sourceResults.find((entry) => entry.error)?.error;
    throw new ApiError(
      firstError?.status || 502,
      firstError?.code || 'DISCOVERY_FAILED',
      firstError?.message || 'No configured job source could complete the search.',
      {
        sources: warnings,
        quota,
      },
    );
  }

  broadcast('jobs', {
    reason: 'discovery',
    trigger,
    query: input.query,
    location: input.location,
    added: summary.added,
  });

  return {
    query: input.query,
    location: input.location,
    category: input.category || null,
    sources,
    summary: recordSummary(summary),
    warnings,
    analyses,
    quota,
    screening: {
      queued: summary.newJobIds.length,
      message: summary.newJobIds.length
        ? 'Link checks and AI analysis are running in the background. New roles appear after they pass screening.'
        : 'No new roles required screening.',
    },
  };
}
