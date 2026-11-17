export const DUPLICATE_REASON_LABELS = {
  source_id: 'Same source job ID',
  application_url: 'Same application URL',
  fingerprint: 'Same company, role and city',
};

export async function findExistingJob(store, job) {
  return store.findDuplicate({
    source: job.source,
    sourceJobId: job.source_job_id,
    applicationUrl: job.application_url,
    fingerprint: job.fingerprint,
  });
}

export function duplicateLabel(reason) {
  return DUPLICATE_REASON_LABELS[reason] || 'Existing record';
}
