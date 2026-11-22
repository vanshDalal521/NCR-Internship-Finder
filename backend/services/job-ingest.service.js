import { logger } from '../utils/logger.js';
import { findExistingJob } from './deduplication.service.js';

const REJECTION_LABELS = {
  missing_title: 'Posting had no job title',
  missing_company: 'Posting had no employer name',
  missing_source_id: 'Posting had no source identifier',
  invalid_application_url: 'Posting had no valid application URL',
  outside_ncr: 'Location is outside Gurugram, Noida, Delhi and Faridabad',
  not_internship: 'Posting is not an internship',
  expired: 'Application deadline has passed',
  stale: 'Posting is older than the freshness limit',
};

function emptySummary(source) {
  return {
    source,
    received: 0,
    eligible: 0,
    added: 0,
    refreshed: 0,
    duplicates: 0,
    rejected: 0,
    failed: 0,
    reasons: {},
    newJobs: [],
    newJobIds: [],
    duplicateMatches: [],
    errors: [],
  };
}

function bump(summary, key) {
  summary.reasons[key] = (summary.reasons[key] || 0) + 1;
}

export async function ingestNormalizedResults(store, results, { source } = {}) {
  const summary = emptySummary(source);

  for (const result of results) {
    summary.received += 1;

    if (!result?.ok || !result.job) {
      summary.rejected += 1;
      bump(summary, result?.reason || 'invalid');
      continue;
    }

    const job = result.job;
    summary.eligible += 1;

    try {
      const existing = await findExistingJob(store, job);
      if (existing) {
        summary.duplicates += 1;
        bump(summary, existing.reason || 'duplicate');
        if (summary.duplicateMatches.length < 5) {
          summary.duplicateMatches.push({
            id: existing.job.id,
            job_title: existing.job.job_title,
            company_name: existing.job.company_name,
            reason: existing.reason || 'duplicate',
          });
        }

        const refresh = { last_seen_at: job.last_seen_at };
        if (!existing.job.deadline && job.deadline) refresh.deadline = job.deadline;
        if (!existing.job.stipend && job.stipend) {
          refresh.stipend = job.stipend;
          refresh.stipend_min = job.stipend_min;
          refresh.stipend_max = job.stipend_max;
          refresh.stipend_monthly_min = job.stipend_monthly_min;
          refresh.stipend_monthly_max = job.stipend_monthly_max;
          refresh.stipend_period = job.stipend_period;
        }
        if (!existing.job.eligibility && job.eligibility) refresh.eligibility = job.eligibility;
        if (!existing.job.job_description && job.job_description) refresh.job_description = job.job_description;
        await store.updateJob(existing.job.id, refresh);
        summary.refreshed += 1;
        continue;
      }

      let company = null;
      try {
        company = await store.upsertCompanyFromJob(job);
      } catch (error) {
        logger.warn('Company could not be saved during ingestion', { message: error.message });
      }

      const created = await store.createJob({
        ...job,
        company_id: company?.id || null,
      });

      summary.added += 1;
      summary.newJobIds.push(created.id);
      if (summary.newJobs.length < 12) {
        summary.newJobs.push({
          id: created.id,
          job_title: created.job_title,
          company_name: created.company_name,
          city: created.city,
          category: created.category,
          source: created.source,
          verification_status: created.verification_status,
        });
      }
    } catch (error) {
      summary.failed += 1;
      if (summary.errors.length < 5) {
        summary.errors.push({
          title: job.job_title,
          company: job.company_name,
          message: error.expose ? error.message : 'Could not save this listing.',
        });
      }
      logger.warn('Opportunity ingestion failed', {
        title: job.job_title,
        company: job.company_name,
        message: error.message,
      });
    }
  }

  summary.rejectionLabels = Object.fromEntries(
    Object.entries(summary.reasons)
      .filter(([reason]) => REJECTION_LABELS[reason])
      .map(([reason, count]) => [REJECTION_LABELS[reason], count]),
  );

  return summary;
}
