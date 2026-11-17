import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../../utils/http-error.js';
import { logger } from '../../utils/logger.js';
import { daysAgo } from '../../utils/dates.js';
import { companyPayloadFromJob } from './company-mapper.js';
import {
  JOB_FIELDS,
  REPORT_FIELDS,
  VERIFICATION_LOG_FIELDS,
  pickFields,
  withoutInternalCompanyFields,
} from './model.js';

const JOB_SELECT =
  '*, company:companies(*), analysis:job_analysis(*), saved_records:saved_jobs(job_id,saved_by,notes,created_at)';

function mapJob(row) {
  if (!row) return null;
  const { analysis, saved_records: savedRecords, company, ...job } = row;
  const analysisRecord = Array.isArray(analysis) ? analysis[0] || null : analysis || null;
  const records = Array.isArray(savedRecords) ? savedRecords : [];
  return {
    ...job,
    company: withoutInternalCompanyFields(company),
    analysis: analysisRecord,
    saved: records.length > 0,
    saved_by: records.map((record) => record.saved_by).filter(Boolean),
    saved_notes: records[0]?.notes || '',
  };
}

function mapLog(row) {
  if (!row) return null;
  const { job, ...rest } = row;
  return { ...rest, job: job || null };
}

function mapReport(row) {
  return row ? pickFields(row, REPORT_FIELDS, { includeUndefined: true }) : null;
}

function sanitizeSearchTerm(value) {
  return String(value)
    .replace(/[,%()*_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class SupabaseStore {
  constructor(url, serviceRoleKey) {
    this.mode = 'supabase';
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      db: { schema: 'public' },
      global: { headers: { 'X-Client-Info': 'ncr-internship-finder-backend' } },
    });
  }

  async init() {
    const { error } = await this.client.from('jobs').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) {
      logger.error('Supabase connection failed', { code: error.code, message: error.message });
      if (error.code === '42P01') {
        throw new Error(
          'Supabase is reachable but the application tables are missing. Run database/migrations/001_initial_schema.sql in the Supabase SQL editor.',
        );
      }
      throw new Error(`Could not connect to Supabase: ${error.message}`);
    }
    return this;
  }

  #error(error, context) {
    logger.error(`Database error: ${context}`, { code: error.code, message: error.message });
    if (error.code === '23505') return ApiError.conflict('That record already exists.');
    return new ApiError(500, 'DATABASE_ERROR', 'The database operation could not be completed.');
  }

  async listJobs(filters) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));

    let savedIds = null;
    if (filters.savedOnly) {
      const { data, error } = await this.client.from('saved_jobs').select('job_id');
      if (error) throw this.#error(error, 'load saved opportunities');
      savedIds = data.map((row) => row.job_id);
      if (!savedIds.length) {
        return { items: [], pagination: { page, limit, total: 0, totalPages: 1 } };
      }
    }

    let query = this.client.from('jobs').select(JOB_SELECT, { count: 'exact' });
    if (filters.search) {
      const search = sanitizeSearchTerm(filters.search);
      if (search) {
        query = query.or(
          `job_title.ilike.%${search}%,company_name.ilike.%${search}%,job_description.ilike.%${search}%,location.ilike.%${search}%`,
        );
      }
    }
    if (filters.city) query = query.eq('city', filters.city);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.status) query = query.eq('verification_status', filters.status);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.workMode) query = query.eq('work_mode', filters.workMode);
    if (filters.activeOnly) query = query.eq('is_active', true);
    if (filters.minStipend) {
      query = query.or(
        `stipend_monthly_min.gte.${filters.minStipend},stipend_monthly_max.gte.${filters.minStipend}`,
      );
    }
    if (savedIds) query = query.in('id', savedIds);

    const sortMap = {
      stipend_min: 'stipend_monthly_min',
      stipend_monthly_min: 'stipend_monthly_min',
    };
    const sortField = sortMap[filters.sort] || filters.sort || 'created_at';
    const ascending = filters.order === 'asc';
    query = query
      .order(sortField, { ascending, nullsFirst: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data, error, count } = await query;
    if (error) throw this.#error(error, 'list opportunities');

    const total = count ?? data.length;
    return {
      items: data.map(mapJob),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listAllJobs({ limit = 5000 } = {}) {
    const [jobsResult, savedResult] = await Promise.all([
      this.client.from('jobs').select('*').order('created_at', { ascending: false }).limit(limit),
      this.client.from('saved_jobs').select('job_id').limit(limit),
    ]);
    if (jobsResult.error) throw this.#error(jobsResult.error, 'load analytics data');
    if (savedResult.error) throw this.#error(savedResult.error, 'load saved analytics data');
    const savedIds = new Set(savedResult.data.map((row) => row.job_id));
    return jobsResult.data.map((job) => ({ ...job, saved: savedIds.has(job.id) }));
  }

  async getJobById(id) {
    const { data, error } = await this.client.from('jobs').select(JOB_SELECT).eq('id', id).maybeSingle();
    if (error) throw this.#error(error, 'load opportunity');
    if (!data) return null;
    const job = mapJob(data);
    const { data: logs, error: logError } = await this.client
      .from('verification_logs')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false });
    if (logError) throw this.#error(logError, 'load verification history');
    job.verification_logs = logs;
    return job;
  }

  async findDuplicate({ source, sourceJobId, applicationUrl, fingerprint }) {
    if (source && sourceJobId) {
      const { data, error } = await this.client
        .from('jobs')
        .select('*')
        .eq('source', source)
        .eq('source_job_id', sourceJobId)
        .limit(1)
        .maybeSingle();
      if (error) throw this.#error(error, 'check duplicate source id');
      if (data) return { job: data, reason: 'source_id' };
    }

    if (applicationUrl) {
      const { data, error } = await this.client
        .from('jobs')
        .select('*')
        .eq('application_url', applicationUrl)
        .limit(1)
        .maybeSingle();
      if (error) throw this.#error(error, 'check duplicate URL');
      if (data) return { job: data, reason: 'application_url' };
    }

    if (fingerprint) {
      const { data, error } = await this.client
        .from('jobs')
        .select('*')
        .eq('fingerprint', fingerprint)
        .gte('created_at', daysAgo(120).toISOString())
        .limit(1)
        .maybeSingle();
      if (error) throw this.#error(error, 'check duplicate fingerprint');
      if (data) return { job: data, reason: 'fingerprint' };
    }

    return null;
  }

  async createJob(record) {
    const payload = {
      ...pickFields(record, JOB_FIELDS),
      required_skills: Array.isArray(record.required_skills) ? record.required_skills : [],
    };
    const { data, error } = await this.client.from('jobs').insert(payload).select('*').single();
    if (error) throw this.#error(error, 'create opportunity');
    return data;
  }

  async updateJob(id, patch) {
    const payload = {
      ...pickFields(patch, JOB_FIELDS),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.client.from('jobs').update(payload).eq('id', id).select('*').maybeSingle();
    if (error) throw this.#error(error, 'update opportunity');
    if (!data) return null;
    return this.getJobById(id);
  }

  async upsertCompanyFromJob(job) {
    const payload = companyPayloadFromJob(job);
    if (!payload) return null;

    const { data: existing, error: findError } = await this.client
      .from('companies')
      .select('*')
      .eq('normalized_name', payload.normalized_name)
      .maybeSingle();
    if (findError) throw this.#error(findError, 'find company');

    if (existing) {
      const updates = {};
      for (const field of ['industry', 'website', 'careers_url', 'location', 'city', 'contact_email', 'contact_phone', 'description']) {
        if (!existing[field] && payload[field]) updates[field] = payload[field];
        else if (payload[field] && field === 'website' && existing[field] !== payload[field]) {
          updates[field] = payload[field];
        }
      }
      if (payload.name && payload.name.length > existing.name.length) updates.name = payload.name;
      if (Object.keys(updates).length) {
        const { data, error } = await this.client
          .from('companies')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw this.#error(error, 'update company');
        return withoutInternalCompanyFields(data);
      }
      return withoutInternalCompanyFields(existing);
    }

    const { data, error } = await this.client.from('companies').insert(payload).select('*').single();
    if (error?.code === '23505') {
      const { data: raced } = await this.client
        .from('companies')
        .select('*')
        .eq('normalized_name', payload.normalized_name)
        .maybeSingle();
      return withoutInternalCompanyFields(raced);
    }
    if (error) throw this.#error(error, 'create company');
    return withoutInternalCompanyFields(data);
  }

  async listCompanies() {
    const { data, error } = await this.client
      .from('companies')
      .select('*')
      .order('name', { ascending: true })
      .limit(5000);
    if (error) throw this.#error(error, 'list companies');
    return data.map(withoutInternalCompanyFields);
  }

  async getCompanyById(id) {
    const { data, error } = await this.client.from('companies').select('*').eq('id', id).maybeSingle();
    if (error) throw this.#error(error, 'load company');
    return withoutInternalCompanyFields(data);
  }

  async listJobsByCompany(companyId) {
    const { data, error } = await this.client
      .from('jobs')
      .select(JOB_SELECT)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw this.#error(error, 'list company opportunities');
    return data.map(mapJob);
  }

  async saveJob({ jobId, savedBy, notes = '' }) {
    const { error } = await this.client
      .from('saved_jobs')
      .upsert({ job_id: jobId, saved_by: savedBy, notes }, { onConflict: 'job_id' });
    if (error) throw this.#error(error, 'save opportunity');
    return { saved: true };
  }

  async unsaveJob(jobId) {
    const { error } = await this.client.from('saved_jobs').delete().eq('job_id', jobId);
    if (error) throw this.#error(error, 'remove saved opportunity');
    return { saved: false };
  }

  async getAnalysis(jobId) {
    const { data, error } = await this.client
      .from('job_analysis')
      .select('*')
      .eq('job_id', jobId)
      .maybeSingle();
    if (error) throw this.#error(error, 'load analysis');
    return data;
  }

  async upsertAnalysis(jobId, analysis) {
    const { data: job, error: jobError } = await this.client
      .from('jobs')
      .select('id, required_skills')
      .eq('id', jobId)
      .maybeSingle();
    if (jobError) throw this.#error(jobError, 'load opportunity for analysis');
    if (!job) throw ApiError.notFound('That opportunity no longer exists.');

    const payload = {
      ...analysis,
      job_id: jobId,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.client
      .from('job_analysis')
      .upsert(payload, { onConflict: 'job_id' })
      .select('*')
      .single();
    if (error) throw this.#error(error, 'save analysis');

    const updates = { updated_at: new Date().toISOString() };
    if (analysis.category) updates.category = analysis.category;
    if (Number.isFinite(analysis.relevance_score)) updates.relevance_score = analysis.relevance_score;
    if (Array.isArray(analysis.skills) && analysis.skills.length) {
      updates.required_skills = [...new Set([...(job.required_skills || []), ...analysis.skills])].slice(0, 20);
    }
    const { error: updateError } = await this.client.from('jobs').update(updates).eq('id', jobId);
    if (updateError) throw this.#error(updateError, 'apply analysis to opportunity');

    return data;
  }

  async listJobsWithoutAnalysis(limit = 5) {
    const { data: analyzed, error } = await this.client.from('job_analysis').select('job_id').limit(10000);
    if (error) throw this.#error(error, 'load analyzed opportunities');
    const ids = analyzed.map((row) => row.job_id).filter(Boolean);

    let query = this.client.from('jobs').select('*').eq('is_active', true);
    if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`);
    const { data, error: jobsError } = await query.order('created_at', { ascending: false }).limit(limit);
    if (jobsError) throw this.#error(jobsError, 'load opportunities needing analysis');
    return data;
  }

  async addVerificationLog(log) {
    const payload = pickFields(log, VERIFICATION_LOG_FIELDS);
    const { data, error } = await this.client.from('verification_logs').insert(payload).select('*').single();
    if (error) throw this.#error(error, 'record verification');
    return data;
  }

  async listVerificationLogs({ jobId = null, limit = 50 } = {}) {
    let query = this.client
      .from('verification_logs')
      .select('*, job:jobs(job_title, company_name, application_url, city)');
    if (jobId) query = query.eq('job_id', jobId);
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 200)));
    if (error) throw this.#error(error, 'list verification history');
    return data.map(mapLog);
  }

  async addSearchHistory(entry) {
    const { data, error } = await this.client.from('search_history').insert(entry).select('*').single();
    if (error) throw this.#error(error, 'record search');
    return data;
  }

  async countSearchesSince(isoDate) {
    const { count, error } = await this.client
      .from('search_history')
      .select('id', { head: true, count: 'exact' })
      .gte('created_at', isoDate);
    if (error) throw this.#error(error, 'count searches');
    return count || 0;
  }

  async listSearchHistory(limit = 10) {
    const { data, error } = await this.client
      .from('search_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 50)));
    if (error) throw this.#error(error, 'load search history');
    return data;
  }

  async addReport(report) {
    const payload = pickFields(report, REPORT_FIELDS);
    const { data, error } = await this.client.from('reports').insert(payload).select('*').single();
    if (error) throw this.#error(error, 'record report');
    return mapReport(data);
  }

  async listReports(limit = 12) {
    const { data, error } = await this.client
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 50)));
    if (error) throw this.#error(error, 'list reports');
    return data.map(mapReport);
  }

  async getSystemSummary() {
    const [jobs, companies, verified, pending, saved, analyses, searches, logs] = await Promise.all([
      this.client.from('jobs').select('id', { head: true, count: 'exact' }),
      this.client.from('companies').select('id', { head: true, count: 'exact' }),
      this.client
        .from('jobs')
        .select('id', { head: true, count: 'exact' })
        .eq('verification_status', 'verified_active')
        .eq('is_active', true),
      this.client
        .from('jobs')
        .select('id', { head: true, count: 'exact' })
        .eq('verification_status', 'pending'),
      this.client.from('saved_jobs').select('id', { head: true, count: 'exact' }),
      this.client.from('job_analysis').select('id', { head: true, count: 'exact' }),
      this.client
        .from('search_history')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
      this.client
        .from('verification_logs')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const failed = [jobs, companies, verified, pending, saved, analyses, searches, logs].find(
      (result) => result.error,
    );
    if (failed) throw this.#error(failed.error, 'load system summary');

    return {
      jobs: jobs.count || 0,
      companies: companies.count || 0,
      verifiedActive: verified.count || 0,
      pendingVerification: pending.count || 0,
      saved: saved.count || 0,
      analyses: analyses.count || 0,
      lastDiscoveryAt: searches.data?.[0]?.created_at || null,
      lastVerificationAt: logs.data?.[0]?.created_at || null,
    };
  }
}
