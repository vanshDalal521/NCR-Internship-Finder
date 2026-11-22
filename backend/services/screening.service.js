import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { analyzeJobWithGemini, isGeminiConfigured } from './gemini.service.js';
import { broadcast } from './realtime.service.js';
import { checkApplicationLink } from './verification.service.js';
import { isFreshJob } from '../utils/freshness.js';

const processingJobIds = new Set();
const SCREENABLE_STATUSES = new Set(['pending', 'needs_review']);
const PASS_OUTCOMES = new Set(['reachable']);
const REVIEW_OUTCOMES = new Set(['blocked', 'rate_limited', 'server_error', 'unexpected_response']);
const LINK_TIMEOUT_MS = 12_000;
const LINK_CONCURRENCY = 3;
const ANALYSIS_DELAY_MS = 3_000;
const AUTO_REVIEWER = 'Automated link screening';

function timestamp() {
  return new Date().toISOString();
}

function classifyScreening(check) {
  if (PASS_OUTCOMES.has(check.outcome)) return 'passed';
  if (REVIEW_OUTCOMES.has(check.outcome)) return 'review';
  return 'failed';
}

function autoVerificationBlockers(analysis) {
  if (!analysis) return ['Analysis is not available yet.'];
  if (!Number.isFinite(analysis.relevance_score)) return ['Analysis did not produce a relevance score.'];
  if (analysis.relevance_score < env.AUTO_VERIFY_MIN_SCORE) {
    return [
      `Relevance score ${analysis.relevance_score} is below the auto-verification threshold of ${env.AUTO_VERIFY_MIN_SCORE}.`,
    ];
  }
  const risky = (analysis.red_flags || []).filter((flag) =>
    /(registration|application|security deposit|pay to apply|advance fee|scam|fraud)/i.test(String(flag)),
  );
  if (risky.length) return risky;
  return [];
}

async function getScreeningCandidates(store, limit = 100) {
  const [pending, needsReview] = await Promise.all([
    store.listJobs({ status: 'pending', limit, page: 1, sort: 'created_at', order: 'asc' }),
    store.listJobs({ status: 'needs_review', limit, page: 1, sort: 'created_at', order: 'asc' }),
  ]);
  return [...pending.items, ...needsReview.items];
}

async function screenOneJob(store, job) {
  if (!SCREENABLE_STATUSES.has(job.verification_status)) return null;
  if (processingJobIds.has(job.id)) return null;

  processingJobIds.add(job.id);
  try {
    const check = await checkApplicationLink(job.application_url, { timeoutMs: LINK_TIMEOUT_MS });
    const screeningStatus = classifyScreening(check);
    const patch = {
      screening_status: screeningStatus,
      screening_outcome: check.outcome,
      screening_message: check.message,
      link_checked_at: check.checkedAt,
      link_http_status: check.httpStatus,
    };

    if (screeningStatus === 'failed') {
      patch.verification_status = 'expired';
      patch.is_active = false;
    }

    const updated = await store.updateJob(job.id, patch);

    if (screeningStatus === 'failed') {
      try {
        await store.addVerificationLog({
          job_id: job.id,
          previous_status: job.verification_status,
          new_status: 'expired',
          reviewer: AUTO_REVIEWER,
          notes: check.message,
          checked_url: check.checkedUrl || job.application_url,
          link_http_status: check.httpStatus ?? null,
        });
      } catch (error) {
        logger.warn('Automated screening log could not be written', {
          jobId: job.id,
          message: error.message,
        });
      }
    }

    return { job: updated, check, screeningStatus };
  } catch (error) {
    const message = error.expose ? error.message : 'The application link could not be screened.';
    await store.updateJob(job.id, {
      screening_status: 'review',
      screening_outcome: 'check_error',
      screening_message: message,
      link_checked_at: timestamp(),
    });
    logger.warn('Automated screening failed', { jobId: job.id, message: error.message });
    return { job, check: null, screeningStatus: 'review', error: message };
  } finally {
    processingJobIds.delete(job.id);
  }
}

async function runWithConcurrency(items, worker, concurrency = LINK_CONCURRENCY) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await worker(current));
    }
  });
  await Promise.all(runners);
  return results;
}

async function analyzeOneJob(store, job) {
  if (!isGeminiConfigured() || env.AUTO_ANALYSIS_LIMIT <= 0) return { status: 'skipped' };
  if (!SCREENABLE_STATUSES.has(job.verification_status)) return { status: 'skipped' };
  const existing = await store.getAnalysis(job.id);
  if (existing) return { status: 'exists' };

  try {
    const analysis = await analyzeJobWithGemini(job);
    await store.upsertAnalysis(job.id, analysis);
    const refreshed = await store.getJobById(job.id);

    if (env.AUTO_VERIFY_SCREENED && refreshed?.verification_status !== 'verified_active') {
      const blockers = autoVerificationBlockers({ ...analysis, ...refreshed?.analysis });
      if (!blockers.length && refreshed?.screening_status === 'passed' && isFreshJob(refreshed)) {
        await store.updateJob(job.id, {
          verification_status: 'verified_active',
          is_active: true,
          last_verified_at: timestamp(),
          verified_by: 'Automated screening',
        });
        await store.addVerificationLog({
          job_id: job.id,
          previous_status: refreshed.verification_status,
          new_status: 'verified_active',
          reviewer: 'Automated screening',
          notes: `Auto-verified after link screening and Gemini relevance score ${analysis.relevance_score}.`,
          checked_url: refreshed.application_url,
          link_http_status: refreshed.link_http_status ?? null,
        });
      }
    }

    return { status: 'analyzed' };
  } catch (error) {
    logger.warn('Background Gemini analysis failed', {
      jobId: job.id,
      message: error.message,
      status: error.status,
    });
    return { status: 'failed', error };
  }
}

export async function processJobBatch(store, jobIds = []) {
  if (!env.AUTO_SCREEN_ENABLED) return { screened: 0, analyzed: 0, skipped: jobIds.length };

  const uniqueIds = [...new Set(jobIds.filter(Boolean))];
  if (!uniqueIds.length) return { screened: 0, analyzed: 0, skipped: 0 };

  const jobs = [];
  for (const id of uniqueIds) {
    const job = await store.getJobById(id);
    if (job && SCREENABLE_STATUSES.has(job.verification_status)) jobs.push(job);
  }

  const screenResults = await runWithConcurrency(jobs, (job) => screenOneJob(store, job));
  const screened = screenResults.filter((result) => result?.screeningStatus === 'passed').length;
  const failed = screenResults.filter((result) => result?.screeningStatus === 'failed').length;
  const review = screenResults.filter((result) => result?.screeningStatus === 'review').length;
  if (screened || failed || review) {
    broadcast('jobs', {
      reason: 'screening',
      screened,
      failed,
      review,
      checked: screenResults.filter(Boolean).length,
    });
  }

  let analyzed = 0;
  let analysisFailed = 0;
  const passedIds = new Set(
    screenResults
      .filter((result) => result?.screeningStatus === 'passed')
      .map((result) => result.job?.id)
      .filter(Boolean),
  );
  const analysisTargets = jobs
    .filter((job) => passedIds.has(job.id))
    .slice(0, env.AUTO_ANALYSIS_LIMIT);
  for (const job of analysisTargets) {
    const result = await analyzeOneJob(store, job);
    if (result.status === 'analyzed') analyzed += 1;
    if (result.status === 'failed') {
      analysisFailed += 1;
      const status = result.error?.status;
      if (status === 429 || status === 503) break;
    }
    if (analysisTargets.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, ANALYSIS_DELAY_MS));
    }
  }

  if (analyzed) broadcast('jobs', { reason: 'analysis', analyzed, failed: analysisFailed });
  return { screened, failed, review, analyzed, analysisFailed, skipped: 0 };
}

export async function expireStaleJobs(store) {
  const jobs = await getScreeningCandidates(store, 200);
  let expired = 0;
  for (const job of jobs) {
    if (job.verification_status === 'verified_active') continue;
    if (isFreshJob(job)) continue;
    await store.updateJob(job.id, {
      verification_status: 'expired',
      is_active: false,
      screening_outcome: job.screening_outcome || 'stale',
      screening_message: `Posting is older than the ${env.JOB_FRESHNESS_HOURS}-hour freshness window.`,
    });
    expired += 1;
  }
  if (expired) broadcast('jobs', { reason: 'freshness', expired });
  return expired;
}

export async function backfillScreening(store, { limit = 12 } = {}) {
  const jobs = await getScreeningCandidates(store, 150);
  const targets = jobs
    .filter((job) => !job.screening_status || job.screening_status === 'pending')
    .slice(0, limit);
  if (!targets.length) return { checked: 0 };
  const result = await processJobBatch(
    store,
    targets.map((job) => job.id),
  );
  return { checked: targets.length, ...result };
}

export async function backfillAnalysis(store, { limit = env.AUTO_ANALYSIS_LIMIT } = {}) {
  if (!env.AUTO_SCREEN_ENABLED || !isGeminiConfigured() || limit <= 0) {
    return { checked: 0, analyzed: 0, failed: 0 };
  }

  const pending = await store.listJobs({
    status: 'pending',
    limit: 100,
    page: 1,
    sort: 'created_at',
    order: 'asc',
  });
  const targets = pending.items
    .filter((job) => job.screening_status === 'passed' && isFreshJob(job) && !job.analysis)
    .slice(0, limit);
  if (!targets.length) return { checked: 0, analyzed: 0, failed: 0 };

  let analyzed = 0;
  let failed = 0;
  for (const [index, job] of targets.entries()) {
    const result = await analyzeOneJob(store, job);
    if (result.status === 'analyzed') analyzed += 1;
    if (result.status === 'failed') {
      failed += 1;
      const status = result.error?.status;
      if (status === 429 || status === 503) break;
    }
    if (index < targets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, ANALYSIS_DELAY_MS));
    }
  }

  if (analyzed) broadcast('jobs', { reason: 'analysis', analyzed, failed });
  return { checked: targets.length, analyzed, failed };
}

export function screeningWorkerState() {
  return { processing: processingJobIds.size };
}
