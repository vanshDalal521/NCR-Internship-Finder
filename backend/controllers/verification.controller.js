import { z } from 'zod';
import { getStore } from '../services/store/index.js';
import { checkApplicationLink } from '../services/verification.service.js';
import { broadcast } from '../services/realtime.service.js';
import { ApiError } from '../utils/http-error.js';
import { parseOrThrow, verifyJobSchema } from '../utils/validation.js';

const uuidSchema = z.string().uuid('A valid opportunity ID is required.');
const queueQuerySchema = z.object({
  view: z.enum(['all', 'pending', 'needs_review']).default('all'),
});

function statusCounts(jobs) {
  return {
    pending: jobs.filter((job) => job.verification_status === 'pending').length,
    needsReview: jobs.filter((job) => job.verification_status === 'needs_review').length,
    verifiedActive: jobs.filter(
      (job) => job.verification_status === 'verified_active' && job.is_active !== false,
    ).length,
    expired: jobs.filter((job) => job.verification_status === 'expired').length,
    rejected: jobs.filter((job) => job.verification_status === 'rejected').length,
  };
}

export async function verificationQueue(req, res) {
  const query = parseOrThrow(queueQuerySchema, req.query);
  const store = await getStore();

  const [pending, needsReview, allJobs] = await Promise.all([
    store.listJobs({ status: 'pending', limit: 100, page: 1, sort: 'created_at', order: 'asc' }),
    store.listJobs({ status: 'needs_review', limit: 100, page: 1, sort: 'created_at', order: 'asc' }),
    store.listAllJobs(),
  ]);

  let items = [...pending.items, ...needsReview.items];
  if (query.view === 'pending') items = items.filter((job) => job.verification_status === 'pending');
  if (query.view === 'needs_review') {
    items = items.filter((job) => job.verification_status === 'needs_review');
  }
  items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  res.json({
    success: true,
    data: {
      view: query.view,
      items,
      summary: statusCounts(allJobs),
      totalJobs: allJobs.length,
    },
  });
}

export async function checkLink(req, res) {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const store = await getStore();
  const job = await store.getJobById(id);
  if (!job) throw ApiError.notFound('That opportunity was not found.');

  const result = await checkApplicationLink(job.application_url);
  const passed = result.outcome === 'reachable';
  const failed = ['not_found', 'unreachable', 'redirect_issue', 'too_many_redirects'].includes(
    result.outcome,
  );
  await store.updateJob(id, {
    screening_status: passed ? 'passed' : failed ? 'failed' : 'review',
    screening_outcome: result.outcome,
    screening_message: result.message,
    link_checked_at: result.checkedAt,
    link_http_status: result.httpStatus,
  });
  broadcast('jobs', { reason: 'link-check', jobId: id, outcome: result.outcome });

  res.json({
    success: true,
    data: {
      jobId: id,
      applicationUrl: job.application_url,
      check: result,
    },
  });
}

export async function verifyJob(req, res) {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const input = parseOrThrow(verifyJobSchema, req.body || {});
  const store = await getStore();
  const job = await store.getJobById(id);
  if (!job) throw ApiError.notFound('That opportunity was not found.');

  const now = new Date().toISOString();
  const isActive = input.status === 'verified_active';
  const patch = {
    verification_status: input.status,
    is_active: isActive,
    last_verified_at: now,
    verified_by: input.reviewer,
  };

  const updated = await store.updateJob(id, patch);
  if (!updated) throw ApiError.notFound('That opportunity was not found.');

  try {
    await store.addVerificationLog({
      job_id: id,
      previous_status: job.verification_status,
      new_status: input.status,
      reviewer: input.reviewer,
      notes: input.notes || null,
      checked_url: job.application_url,
      link_http_status: input.linkHttpStatus ?? null,
    });
  } catch (error) {
    // Keep the job and its audit trail consistent if the log cannot be written.
    await store.updateJob(id, {
      verification_status: job.verification_status,
      is_active: job.is_active,
      last_verified_at: job.last_verified_at,
      verified_by: job.verified_by,
    });
    throw error;
  }

  const refreshed = await store.getJobById(id);
  broadcast('jobs', {
    reason: 'verification',
    jobId: id,
    status: input.status,
    previousStatus: job.verification_status,
  });
  res.json({
    success: true,
    data: {
      job: refreshed,
      message: `Status changed from ${job.verification_status} to ${input.status}.`,
    },
  });
}

export async function verificationLogs(req, res) {
  const store = await getStore();
  const limit = Math.max(1, Math.min(Number(req.query.limit) || 25, 100));
  const logs = await store.listVerificationLogs({ limit });
  res.json({ success: true, data: { items: logs } });
}
