import { z } from 'zod';
import { analyzeJobWithGemini, isGeminiConfigured } from '../services/gemini.service.js';
import { findExistingJob } from '../services/deduplication.service.js';
import { normalizeManualJob } from '../services/job-normalizer.js';
import { getStore } from '../services/store/index.js';
import { ApiError } from '../utils/http-error.js';
import {
  analyzeBulkSchema,
  jobListQuerySchema,
  manualJobSchema,
  parseOrThrow,
  saveJobSchema,
} from '../utils/validation.js';
import { DEFAULT_REVIEWER } from '../config/constants.js';

const uuidSchema = z.string().uuid('A valid opportunity ID is required.');

function reviewerFrom(req, fallback = DEFAULT_REVIEWER) {
  const header = req.get('x-reviewer-name');
  const name = String(header || req.auth?.name || fallback).trim();
  return name.slice(0, 120);
}

export async function listJobs(req, res) {
  const query = parseOrThrow(jobListQuerySchema, req.query);
  const store = await getStore();
  const result = await store.listJobs(query);
  res.json({ success: true, data: result });
}

export async function getJob(req, res) {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const store = await getStore();
  const job = await store.getJobById(id);
  if (!job) throw ApiError.notFound('That opportunity was not found.');
  res.json({ success: true, data: job });
}

export async function createManualJob(req, res) {
  const input = parseOrThrow(manualJobSchema, req.body || {});
  const normalized = normalizeManualJob(input);
  if (!normalized.ok) {
    throw ApiError.badRequest('The opportunity could not be created from the supplied details.', {
      reason: normalized.reason,
      detail: normalized.detail,
    });
  }

  const store = await getStore();
  const duplicate = await findExistingJob(store, normalized.job);
  if (duplicate) {
    throw ApiError.conflict('A matching opportunity already exists in the directory.', {
      jobId: duplicate.job.id,
      reason: duplicate.reason,
    });
  }

  let company = null;
  try {
    company = await store.upsertCompanyFromJob(normalized.job);
  } catch {
    // The opportunity can still be saved without enriched company details.
  }

  const created = await store.createJob({
    ...normalized.job,
    company_id: company?.id || null,
  });
  const job = await store.getJobById(created.id);

  res.status(201).json({
    success: true,
    data: {
      job,
      message: 'Opportunity added to the verification queue.',
    },
  });
}

export async function analyzeJob(req, res) {
  const id = parseOrThrow(uuidSchema, req.params.id);
  if (!isGeminiConfigured()) {
    throw ApiError.unavailable(
      'Gemini is not configured. Add GEMINI_API_KEY to the backend environment and restart the server.',
    );
  }

  const store = await getStore();
  const job = await store.getJobById(id);
  if (!job) throw ApiError.notFound('That opportunity was not found.');

  const analysis = await analyzeJobWithGemini(job);
  const saved = await store.upsertAnalysis(job.id, analysis);
  const updated = await store.getJobById(job.id);

  res.json({
    success: true,
    data: {
      analysis: saved,
      job: updated,
    },
  });
}

export async function analyzePending(req, res) {
  const input = parseOrThrow(analyzeBulkSchema, req.body || {});
  if (!isGeminiConfigured()) {
    throw ApiError.unavailable(
      'Gemini is not configured. Add GEMINI_API_KEY to the backend environment and restart the server.',
    );
  }

  const store = await getStore();
  const jobs = await store.listJobsWithoutAnalysis(input.limit);
  const results = [];

  for (const job of jobs) {
    try {
      const analysis = await analyzeJobWithGemini(job);
      await store.upsertAnalysis(job.id, analysis);
      results.push({
        jobId: job.id,
        jobTitle: job.job_title,
        companyName: job.company_name,
        status: 'analyzed',
      });
    } catch (error) {
      results.push({
        jobId: job.id,
        jobTitle: job.job_title,
        companyName: job.company_name,
        status: 'failed',
        message: error.expose ? error.message : 'Analysis failed.',
      });
    }
  }

  res.json({
    success: true,
    data: {
      requested: input.limit,
      processed: results.length,
      analyzed: results.filter((result) => result.status === 'analyzed').length,
      results,
    },
  });
}

export async function saveJob(req, res) {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const input = parseOrThrow(saveJobSchema, req.body || {});
  const store = await getStore();
  const job = await store.getJobById(id);
  if (!job) throw ApiError.notFound('That opportunity was not found.');

  await store.saveJob({
    jobId: id,
    savedBy: input.savedBy || reviewerFrom(req),
    notes: input.notes,
  });

  res.json({ success: true, data: { saved: true, jobId: id } });
}

export async function unsaveJob(req, res) {
  const id = parseOrThrow(uuidSchema, req.params.id);
  const store = await getStore();
  await store.unsaveJob(id);
  res.json({ success: true, data: { saved: false, jobId: id } });
}
