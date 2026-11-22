import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ApiError } from '../../utils/http-error.js';
import { env } from '../../config/env.js';
import { daysAgo } from '../../utils/dates.js';
import { isPortalVisibleJob } from '../../utils/freshness.js';
import { companyPayloadFromJob } from './company-mapper.js';
import {
  COMPANY_FIELDS,
  JOB_FIELDS,
  REPORT_FIELDS,
  VERIFICATION_LOG_FIELDS,
  pickFields,
  withoutInternalCompanyFields,
  withoutInternalJobFields,
} from './model.js';

const EMPTY_DATABASE = {
  meta: { version: 1, createdAt: new Date().toISOString() },
  jobs: [],
  companies: [],
  job_analysis: [],
  verification_logs: [],
  saved_jobs: [],
  search_history: [],
  users: [],
  reports: [],
};

function clone(value) {
  return structuredClone(value);
}

function timestamp() {
  return new Date().toISOString();
}

function compareValues(a, b, direction = 1) {
  const av = a ?? null;
  const bv = b ?? null;
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
  return String(av).localeCompare(String(bv), 'en', { numeric: true, sensitivity: 'base' }) * direction;
}

export class LocalStore {
  constructor(filePath, database) {
    this.mode = 'local';
    this.filePath = filePath;
    this.db = database;
    this.writeChain = Promise.resolve();
  }

  static async open(filePath) {
    await mkdir(dirname(filePath), { recursive: true });
    let database;
    try {
      const contents = await readFile(filePath, 'utf8');
      database = JSON.parse(contents);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Could not read local data store at ${filePath}: ${error.message}`);
      }
      database = clone(EMPTY_DATABASE);
      await writeFile(filePath, JSON.stringify(database, null, 2), 'utf8');
    }

    if (!database || typeof database !== 'object' || !Array.isArray(database.jobs)) {
      throw new Error(`Local data store at ${filePath} is not a valid NCR Internship Finder database.`);
    }

    for (const key of Object.keys(EMPTY_DATABASE)) {
      if (key === 'meta') continue;
      if (!Array.isArray(database[key])) database[key] = [];
    }

    return new LocalStore(filePath, database);
  }

  async #persist() {
    const snapshot = JSON.stringify(this.db, null, 2);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    this.writeChain = this.writeChain.then(async () => {
      await writeFile(temporaryPath, snapshot, 'utf8');
      await rename(temporaryPath, this.filePath);
    });
    await this.writeChain;
  }

  #companyFor(job) {
    if (!job.company_id) return null;
    return this.db.companies.find((company) => company.id === job.company_id) || null;
  }

  #analysisFor(jobId) {
    return this.db.job_analysis.find((analysis) => analysis.job_id === jobId) || null;
  }

  #savedRecordsFor(jobId) {
    return this.db.saved_jobs.filter((saved) => saved.job_id === jobId);
  }

  #decorateJob(job) {
    if (!job) return null;
    const savedRecords = this.#savedRecordsFor(job.id);
    return {
      ...withoutInternalJobFields(job),
      company: withoutInternalCompanyFields(this.#companyFor(job)),
      analysis: this.#analysisFor(job.id) ? clone(this.#analysisFor(job.id)) : null,
      saved: savedRecords.length > 0,
      saved_by: savedRecords.map((record) => record.saved_by).filter(Boolean),
      saved_notes: savedRecords[0]?.notes || '',
    };
  }

  #decorateLog(log) {
    const job = this.db.jobs.find((item) => item.id === log.job_id);
    return {
      ...clone(log),
      job: job
        ? {
            id: job.id,
            job_title: job.job_title,
            company_name: job.company_name,
            application_url: job.application_url,
            city: job.city,
          }
        : null,
    };
  }

  #matchesFilters(job, filters, savedIds) {
    if (filters.search) {
      const search = filters.search.toLowerCase();
      const haystack = [
        job.job_title,
        job.company_name,
        job.location,
        job.city,
        job.category,
        job.source,
        ...(job.required_skills || []),
        job.job_description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (filters.city && job.city !== filters.city) return false;
    if (filters.category && job.category !== filters.category) return false;
    if (filters.status && job.verification_status !== filters.status) return false;
    if (filters.source && job.source !== filters.source) return false;
    if (filters.workMode && job.work_mode !== filters.workMode) return false;
    if (filters.activeOnly && job.is_active !== true) return false;
    if (filters.screenedOnly && !isPortalVisibleJob(job)) return false;
    if (filters.freshOnly && job.verification_status !== 'verified_active') {
      const reference = job.posted_at || job.created_at;
      const cutoff = Date.now() - env.JOB_FRESHNESS_HOURS * 60 * 60 * 1000;
      if (!reference || new Date(reference).getTime() < cutoff) return false;
    }
    if (filters.savedOnly && !savedIds.has(job.id)) return false;
    if (filters.minStipend) {
      const pay = job.stipend_monthly_max ?? job.stipend_monthly_min ?? job.stipend_min ?? 0;
      if (Number(pay) < Number(filters.minStipend)) return false;
    }
    return true;
  }

  async listJobs(filters) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const savedIds = new Set(this.db.saved_jobs.map((saved) => saved.job_id));
    const sortMap = {
      stipend_min: 'stipend_monthly_min',
      stipend_monthly_min: 'stipend_monthly_min',
    };
    const sortField = sortMap[filters.sort] || filters.sort || 'created_at';
    const direction = filters.order === 'asc' ? 1 : -1;

    const filtered = this.db.jobs
      .filter((job) => this.#matchesFilters(job, filters, savedIds))
      .sort((a, b) => compareValues(a[sortField], b[sortField], direction));

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit).map((job) => this.#decorateJob(job));

    return {
      items: clone(items),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async listAllJobs({ limit = 5000 } = {}) {
    const savedIds = new Set(this.db.saved_jobs.map((saved) => saved.job_id));
    return clone(
      this.db.jobs
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit)
        .map((job) => ({
          ...withoutInternalJobFields(job),
          saved: savedIds.has(job.id),
        })),
    );
  }

  async getJobById(id) {
    const job = this.db.jobs.find((item) => item.id === id);
    if (!job) return null;
    const decorated = this.#decorateJob(job);
    decorated.verification_logs = this.db.verification_logs
      .filter((log) => log.job_id === id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((log) => clone(log));
    return clone(decorated);
  }

  async findDuplicate({ source, sourceJobId, applicationUrl, fingerprint }) {
    if (source && sourceJobId) {
      const exact = this.db.jobs.find(
        (job) => job.source === source && job.source_job_id === sourceJobId,
      );
      if (exact) return { job: clone(exact), reason: 'source_id' };
    }

    if (applicationUrl) {
      const urlMatch = this.db.jobs.find((job) => job.application_url === applicationUrl);
      if (urlMatch) return { job: clone(urlMatch), reason: 'application_url' };
    }

    if (fingerprint) {
      const cutoff = daysAgo(120).toISOString();
      const fuzzy = this.db.jobs.find(
        (job) => job.fingerprint === fingerprint && String(job.created_at) >= cutoff,
      );
      if (fuzzy) return { job: clone(fuzzy), reason: 'fingerprint' };
    }

    return null;
  }

  async createJob(record) {
    if (!record?.job_title || !record?.company_name) {
      throw ApiError.badRequest('A job requires a title and company name.');
    }

    const duplicate = this.db.jobs.find(
      (job) =>
        job.source === record.source &&
        job.source_job_id === record.source_job_id,
    );
    if (duplicate) {
      throw ApiError.conflict('This source job has already been imported.', { jobId: duplicate.id });
    }

    const now = timestamp();
    const job = {
      ...pickFields(record, JOB_FIELDS),
      id: record.id || randomUUID(),
      required_skills: Array.isArray(record.required_skills) ? record.required_skills : [],
      verification_status: record.verification_status || 'pending',
      screening_status: record.screening_status || 'pending',
      is_active: record.is_active !== false,
      created_at: record.created_at || now,
      updated_at: now,
    };
    this.db.jobs.push(job);
    await this.#persist();
    return clone(this.#decorateJob(job));
  }

  async updateJob(id, patch) {
    const index = this.db.jobs.findIndex((job) => job.id === id);
    if (index === -1) return null;
    const current = this.db.jobs[index];
    this.db.jobs[index] = {
      ...current,
      ...pickFields(patch, JOB_FIELDS),
      id: current.id,
      source: current.source,
      source_job_id: current.source_job_id,
      created_at: current.created_at,
      updated_at: timestamp(),
    };
    await this.#persist();
    return clone(this.#decorateJob(this.db.jobs[index]));
  }

  async upsertCompanyFromJob(job) {
    const payload = companyPayloadFromJob(job);
    if (!payload) return null;

    const existing = this.db.companies.find(
      (company) => company.normalized_name === payload.normalized_name,
    );

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
        Object.assign(existing, updates, { updated_at: timestamp() });
        await this.#persist();
      }
      return clone(withoutInternalCompanyFields(existing));
    }

    const now = timestamp();
    const company = {
      ...pickFields(payload, COMPANY_FIELDS),
      id: randomUUID(),
      created_at: now,
      updated_at: now,
    };
    this.db.companies.push(company);
    await this.#persist();
    return clone(withoutInternalCompanyFields(company));
  }

  async listCompanies() {
    return clone(
      this.db.companies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((company) => withoutInternalCompanyFields(company)),
    );
  }

  async getCompanyById(id) {
    const company = this.db.companies.find((item) => item.id === id);
    return company ? clone(withoutInternalCompanyFields(company)) : null;
  }

  async listJobsByCompany(companyId) {
    return clone(
      this.db.jobs
        .filter((job) => job.company_id === companyId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map((job) => this.#decorateJob(job)),
    );
  }

  async saveJob({ jobId, savedBy, notes = '' }) {
    const job = this.db.jobs.find((item) => item.id === jobId);
    if (!job) throw ApiError.notFound('That opportunity no longer exists.');

    const existing = this.db.saved_jobs.find((saved) => saved.job_id === jobId);
    if (existing) {
      existing.saved_by = savedBy;
      Object.assign(existing, { notes, created_at: existing.created_at });
    } else {
      this.db.saved_jobs.push({
        id: randomUUID(),
        job_id: jobId,
        saved_by: savedBy,
        notes,
        created_at: timestamp(),
      });
    }
    await this.#persist();
    return { saved: true };
  }

  async unsaveJob(jobId) {
    const before = this.db.saved_jobs.length;
    this.db.saved_jobs = this.db.saved_jobs.filter((saved) => saved.job_id !== jobId);
    if (before !== this.db.saved_jobs.length) await this.#persist();
    return { saved: false };
  }

  async getAnalysis(jobId) {
    const analysis = this.#analysisFor(jobId);
    return analysis ? clone(analysis) : null;
  }

  async upsertAnalysis(jobId, analysis) {
    const job = this.db.jobs.find((item) => item.id === jobId);
    if (!job) throw ApiError.notFound('That opportunity no longer exists.');

    const now = timestamp();
    const existingIndex = this.db.job_analysis.findIndex((item) => item.job_id === jobId);
    const record = {
      ...(existingIndex >= 0 ? this.db.job_analysis[existingIndex] : {}),
      ...clone(analysis),
      id: existingIndex >= 0 ? this.db.job_analysis[existingIndex].id : randomUUID(),
      job_id: jobId,
      created_at: existingIndex >= 0 ? this.db.job_analysis[existingIndex].created_at : now,
      updated_at: now,
    };

    if (existingIndex >= 0) this.db.job_analysis[existingIndex] = record;
    else this.db.job_analysis.push(record);

    const jobUpdates = { updated_at: now };
    if (record.category) jobUpdates.category = record.category;
    if (Number.isFinite(record.relevance_score)) jobUpdates.relevance_score = record.relevance_score;
    if (Array.isArray(record.skills) && record.skills.length) {
      jobUpdates.required_skills = [...new Set([...(job.required_skills || []), ...record.skills])].slice(0, 20);
    }
    Object.assign(job, jobUpdates);
    await this.#persist();
    return clone(record);
  }

  async listJobsWithoutAnalysis(limit = 5) {
    const analyzed = new Set(this.db.job_analysis.map((analysis) => analysis.job_id));
    return clone(
      this.db.jobs
        .filter((job) => !analyzed.has(job.id) && job.is_active !== false)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, limit)
        .map((job) => withoutInternalJobFields(job)),
    );
  }

  async addVerificationLog(log) {
    const record = {
      ...pickFields(log, VERIFICATION_LOG_FIELDS),
      id: randomUUID(),
      created_at: timestamp(),
    };
    this.db.verification_logs.push(record);
    await this.#persist();
    return clone(record);
  }

  async listVerificationLogs({ jobId = null, limit = 50 } = {}) {
    return clone(
      this.db.verification_logs
        .filter((log) => (jobId ? log.job_id === jobId : true))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, Math.max(1, Math.min(limit, 200)))
        .map((log) => this.#decorateLog(log)),
    );
  }

  async addSearchHistory(entry) {
    const record = {
      id: randomUUID(),
      ...clone(entry),
      created_at: timestamp(),
    };
    this.db.search_history.push(record);
    await this.#persist();
    return clone(record);
  }

  async countSearchesSince(isoDate, { searchedBy = null } = {}) {
    return this.db.search_history.filter(
      (entry) =>
        String(entry.created_at) >= isoDate && (!searchedBy || entry.searched_by === searchedBy),
    ).length;
  }

  async listSearchHistory(limit = 10) {
    return clone(
      this.db.search_history
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, Math.max(1, Math.min(limit, 50))),
    );
  }

  async addReport(report) {
    const record = {
      ...clone(report),
      id: randomUUID(),
      created_at: timestamp(),
    };
    this.db.reports.push(record);
    await this.#persist();
    return clone(record);
  }

  async listReports(limit = 12) {
    return clone(
      this.db.reports
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, Math.max(1, Math.min(limit, 50)))
        .map((report) => pickFields(report, REPORT_FIELDS, { includeUndefined: true })),
    );
  }

  async getSystemSummary() {
    const jobs = this.db.jobs;
    return {
      jobs: jobs.length,
      companies: this.db.companies.length,
      verifiedActive: jobs.filter((job) => job.verification_status === 'verified_active' && job.is_active).length,
      pendingVerification: jobs.filter((job) => job.verification_status === 'pending').length,
      saved: this.db.saved_jobs.length,
      analyses: this.db.job_analysis.length,
      lastDiscoveryAt:
        this.db.search_history
          .slice()
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]?.created_at || null,
      lastVerificationAt:
        this.db.verification_logs
          .slice()
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]?.created_at || null,
    };
  }
}
