import { z } from 'zod';
import { ApiError } from './http-error.js';
import {
  CATEGORIES,
  CITIES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SOURCES,
  VERIFICATION_STATUSES,
  WORK_MODES,
} from '../config/constants.js';

const booleanQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const jobListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(160).optional(),
  city: z.enum(CITIES).optional(),
  category: z.enum(CATEGORIES).optional(),
  status: z.enum(VERIFICATION_STATUSES).optional(),
  source: z.enum(SOURCES).optional(),
  workMode: z.enum(WORK_MODES).optional(),
  savedOnly: booleanQuery.optional(),
  activeOnly: booleanQuery.optional(),
  screenedOnly: booleanQuery.optional(),
  freshOnly: booleanQuery.optional(),
  minStipend: z.coerce.number().min(0).max(10_000_000).optional(),
  sort: z
    .enum(['created_at', 'posted_at', 'job_title', 'company_name', 'stipend_min', 'deadline', 'relevance_score'])
    .default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const discoverSearchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  location: z.enum(CITIES),
  category: z.enum(CATEGORIES).optional(),
  sources: z.array(z.enum(['jsearch', 'adzuna'])).min(1).max(2).default(['jsearch']),
  pages: z.coerce.number().int().min(1).max(2).default(1),
  analyzeNew: z.boolean().default(false),
  searchedBy: z.string().trim().max(80).optional(),
});

export const manualJobSchema = z.object({
  companyName: z.string().trim().min(1).max(160),
  jobTitle: z.string().trim().min(2).max(180),
  category: z.enum(CATEGORIES).optional().nullable(),
  city: z.enum(CITIES),
  location: z.string().trim().max(200).optional().nullable(),
  workMode: z.enum(WORK_MODES).default('On-site'),
  employmentType: z.string().trim().max(60).default('Internship'),
  applicationUrl: z.string().url().max(2000),
  jobDescription: z.string().trim().max(20000).optional().nullable(),
  requiredSkills: z.array(z.string().trim().max(60)).max(30).optional().default([]),
  stipend: z.string().trim().max(120).optional().nullable(),
  stipendMin: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  stipendMax: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  duration: z.string().trim().max(120).optional().nullable(),
  eligibility: z.string().trim().max(2000).optional().nullable(),
  experienceRequired: z.string().trim().max(300).optional().nullable(),
  deadline: z.string().datetime({ offset: true }).optional().nullable(),
  postedAt: z.string().datetime({ offset: true }).optional().nullable(),
  companyWebsite: z.string().url().max(1000).optional().nullable(),
  companyIndustry: z.string().trim().max(120).optional().nullable(),
  sourceUrl: z.string().url().max(2000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const verifyJobSchema = z
  .object({
    status: z.enum(VERIFICATION_STATUSES.filter((status) => status !== 'pending')),
    reviewer: z.string().trim().min(2).max(120),
    notes: z.string().trim().max(2000).optional().default(''),
    checkedUrl: z.string().url().max(2000).optional().nullable(),
    linkHttpStatus: z.coerce.number().int().min(100).max(599).optional().nullable(),
    reviewedOriginalPage: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.status === 'verified_active' && value.reviewedOriginalPage !== true) {
      ctx.addIssue({
        code: 'custom',
        path: ['reviewedOriginalPage'],
        message: 'Confirm that you reviewed the original employer posting before marking it verified.',
      });
    }
  });

export const analyzeBulkSchema = z.object({
  limit: z.coerce.number().int().min(1).max(5).default(3),
});

export const saveJobSchema = z.object({
  savedBy: z.string().trim().min(2).max(120).default('Placement Committee'),
  notes: z.string().trim().max(500).optional().default(''),
});

export const reportRecordSchema = z.object({
  reportType: z.enum(['verified_opportunities', 'full_directory']).default('verified_opportunities'),
  format: z.enum(['xlsx', 'pdf']),
  scope: z.string().trim().max(200).optional().default('Verified active opportunities'),
  recordCount: z.coerce.number().int().min(0).max(100000),
  generatedBy: z.string().trim().min(2).max(120),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
});

export const searchHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'request',
      message: issue.message,
    }));
    throw ApiError.badRequest('The request contains invalid or missing fields.', details);
  }
  return result.data;
}

export const idParamSchema = z.string().uuid('A valid UUID is required.');
