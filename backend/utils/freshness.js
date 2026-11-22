import { env } from '../config/env.js';

export function freshnessCutoff(now = Date.now()) {
  return now - env.JOB_FRESHNESS_HOURS * 60 * 60 * 1000;
}

export function jobReferenceDate(job) {
  return job?.posted_at || job?.created_at || job?.last_seen_at || null;
}

export function isFreshJob(job, now = Date.now()) {
  const reference = jobReferenceDate(job);
  if (!reference) return true;
  const time = new Date(reference).getTime();
  if (Number.isNaN(time)) return true;
  return time >= freshnessCutoff(now);
}

export function isVerifiedActive(job) {
  return Boolean(job && job.verification_status === 'verified_active' && job.is_active !== false);
}

/**
 * A record that may appear in the public-facing directory: it must be inside
 * the freshness window and either human-verified or link-screened.
 */
export function isPortalVisibleJob(job, now = Date.now()) {
  if (!job) return false;
  if (isVerifiedActive(job)) return true;
  if (job.screening_status !== 'passed') return false;
  if (job.verification_status === 'expired' || job.is_active === false) return false;
  return isFreshJob(job, now);
}

/**
 * A record that may appear in recent/company activity lists: freshness applies,
 * and verified records always remain visible.
 */
export function isDisplayableJob(job, now = Date.now()) {
  return isVerifiedActive(job) || isFreshJob(job, now);
}
