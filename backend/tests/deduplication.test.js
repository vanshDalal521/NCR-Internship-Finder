import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findExistingJob } from '../services/deduplication.service.js';
import { normalizeManualJob } from '../services/job-normalizer.js';
import { LocalStore } from '../services/store/local.store.js';

function manualJob(overrides = {}) {
  return normalizeManualJob({
    companyName: 'Northstar Labs',
    jobTitle: 'Frontend Developer Intern',
    category: 'Web Development',
    city: 'Gurugram',
    location: 'Udyog Vihar Phase 4, Gurugram',
    applicationUrl: 'https://northstar.example/careers/frontend-intern',
    jobDescription: 'Build React interfaces with the product team.',
    ...overrides,
  }).job;
}

describe('findExistingJob', () => {
  let directory;
  let store;
  let original;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ncr-dedup-'));
    store = await LocalStore.open(join(directory, 'db.json'));
    original = manualJob({ sourceJobId: `source-${randomUUID()}` });
    const company = await store.upsertCompanyFromJob(original);
    await store.createJob({ ...original, company_id: company.id });
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('matches an existing source job ID first', async () => {
    const match = await findExistingJob(store, {
      ...original,
      application_url: 'https://northstar.example/new-application-url',
    });

    expect(match).not.toBeNull();
    expect(match.reason).toBe('source_id');
    expect(match.job.company_name).toBe('Northstar Labs');
  });

  it('matches identical application URLs across sources', async () => {
    const match = await findExistingJob(store, {
      ...original,
      source_job_id: `different-${randomUUID()}`,
    });

    expect(match).not.toBeNull();
    expect(match.reason).toBe('application_url');
  });

  it('falls back to the company/role/city fingerprint', async () => {
    const match = await findExistingJob(store, {
      ...original,
      source_job_id: `different-${randomUUID()}`,
      application_url: 'https://northstar.example/another-role-link',
    });

    expect(match).not.toBeNull();
    expect(match.reason).toBe('fingerprint');
  });

  it('does not match a different role', async () => {
    const different = manualJob({
      jobTitle: 'Data Analyst Intern',
      category: 'Data Analytics',
      applicationUrl: 'https://northstar.example/careers/data-intern',
      sourceJobId: `source-${randomUUID()}`,
    });

    const match = await findExistingJob(store, different);
    expect(match).toBeNull();
  });
});
