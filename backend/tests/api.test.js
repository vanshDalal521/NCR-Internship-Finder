import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../app.js';

const api = request(app);
const created = {};
let privateUrlJobId;

const seedJobs = [
  {
    key: 'northstar',
    companyName: 'Northstar Labs',
    jobTitle: 'Frontend Developer Intern',
    category: 'Web Development',
    city: 'Gurugram',
    location: 'Udyog Vihar Phase 4, Gurugram',
    applicationUrl: 'https://northstar.example/careers/frontend-intern',
    jobDescription: 'Build responsive React interfaces with the product team.',
    requiredSkills: ['React', 'JavaScript'],
    stipend: '₹22,000 per month',
    workMode: 'On-site',
  },
  {
    key: 'meridian',
    companyName: 'Meridian Analytics',
    jobTitle: 'Data Analyst Intern',
    category: 'Data Analytics',
    city: 'Noida',
    location: 'Sector 62, Noida',
    applicationUrl: 'https://meridian.example/careers/data-analyst-intern',
    jobDescription: 'Build SQL dashboards and support analytics reporting.',
    requiredSkills: ['SQL', 'Excel'],
    stipend: '₹18,000 per month',
    workMode: 'Hybrid',
  },
  {
    key: 'indus',
    companyName: 'Indus AI',
    jobTitle: 'Machine Learning Intern',
    category: 'AI / ML / GenAI',
    city: 'Delhi',
    location: 'Okhla Phase 2, New Delhi',
    applicationUrl: 'https://indus.example/careers/ml-intern',
    jobDescription: 'Train and evaluate Python machine learning models.',
    requiredSkills: ['Python', 'PyTorch'],
    stipend: '₹30,000 per month',
    workMode: 'On-site',
  },
];

beforeAll(async () => {
  for (const seed of seedJobs) {
    const response = await api.post('/api/jobs').send(seed).expect(201);
    created[seed.key] = response.body.data.job;
  }
});

describe('API system and directory endpoints', () => {
  it('reports health and runtime configuration', async () => {
    const health = await api.get('/api/health').expect(200);
    expect(health.body.success).toBe(true);
    expect(health.body.data).toMatchObject({
      status: 'ok',
      databaseMode: 'local',
      jobs: 3,
      verifiedActive: 0,
    });

    const config = await api.get('/api/system/config').expect(200);
    expect(config.body.data.targetTotal).toBe(20);
    expect(config.body.data.categories).toHaveLength(8);
    expect(config.body.data.locations[0]).toMatchObject({ city: 'Gurugram', priority: 1 });
    expect(config.body.data.configured).toMatchObject({
      jsearch: false,
      adzuna: false,
      gemini: false,
      supabase: false,
    });
  });

  it('lists, searches, and opens opportunities', async () => {
    const list = await api.get('/api/jobs').expect(200);
    expect(list.body.data.items).toHaveLength(3);
    expect(list.body.data.pagination.total).toBe(3);

    const search = await api.get('/api/jobs?search=meridian').expect(200);
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].company_name).toBe('Meridian Analytics');

    const city = await api.get('/api/jobs?city=Delhi').expect(200);
    expect(city.body.data.items.map((job) => job.company_name)).toEqual(['Indus AI']);

    const detail = await api.get(`/api/jobs/${created.northstar.id}`).expect(200);
    expect(detail.body.data).toMatchObject({
      company_name: 'Northstar Labs',
      verification_status: 'pending',
      saved: false,
    });
    expect(detail.body.data.company).toMatchObject({ name: 'Northstar Labs', city: 'Gurugram' });

    const invalid = await api.get('/api/jobs?city=Gurgaon').expect(400);
    expect(invalid.body.error.code).toBe('BAD_REQUEST');
  });

  it('validates manual job payloads and rejects duplicates', async () => {
    const invalid = await api.post('/api/jobs').send({ companyName: 'Incomplete' }).expect(400);
    expect(invalid.body.error.code).toBe('BAD_REQUEST');

    const duplicate = await api.post('/api/jobs').send(seedJobs[0]).expect(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
    expect(duplicate.body.error.details.jobId).toBe(created.northstar.id);
  });
});

describe('verification workflow', () => {
  it('blocks verified-active decisions until the original posting is confirmed', async () => {
    const response = await api
      .post(`/api/verification/${created.northstar.id}/verify`)
      .send({
        status: 'verified_active',
        reviewer: 'Placement Committee',
        reviewedOriginalPage: false,
      })
      .expect(400);

    expect(response.body.error.code).toBe('BAD_REQUEST');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'reviewedOriginalPage' }),
      ]),
    );

    const job = await api.get(`/api/jobs/${created.northstar.id}`).expect(200);
    expect(job.body.data.verification_status).toBe('pending');
  });

  it('records a verified-active decision and keeps a needs-review record in the queue', async () => {
    const verified = await api
      .post(`/api/verification/${created.northstar.id}/verify`)
      .send({
        status: 'verified_active',
        reviewer: 'Aarav Mehta',
        notes: 'Checked on the employer careers page.',
        checkedUrl: 'https://northstar.example/careers/frontend-intern',
        linkHttpStatus: 200,
        reviewedOriginalPage: true,
      })
      .expect(200);

    expect(verified.body.data.job).toMatchObject({
      verification_status: 'verified_active',
      is_active: true,
      verified_by: 'Aarav Mehta',
    });

    await api
      .post(`/api/verification/${created.meridian.id}/verify`)
      .send({ status: 'needs_review', reviewer: 'Aarav Mehta', notes: 'Need a second reviewer.' })
      .expect(200);

    const queue = await api.get('/api/verification/queue?view=all').expect(200);
    expect(queue.body.data.items).toHaveLength(2);
    expect(queue.body.data.items.map((job) => job.id)).toEqual(
      expect.arrayContaining([created.meridian.id, created.indus.id]),
    );
    expect(queue.body.data.summary).toMatchObject({
      pending: 1,
      needsReview: 1,
      verifiedActive: 1,
      expired: 0,
      rejected: 0,
    });

    const filtered = await api.get('/api/verification/queue?view=needs_review').expect(200);
    expect(filtered.body.data.items.map((job) => job.id)).toEqual([created.meridian.id]);

    const logs = await api.get('/api/verification/logs?limit=25').expect(200);
    expect(logs.body.data.items).toHaveLength(2);
    expect(logs.body.data.items[0]).toMatchObject({
      job_id: created.meridian.id,
      new_status: 'needs_review',
      reviewer: 'Aarav Mehta',
      job: expect.objectContaining({ company_name: 'Meridian Analytics' }),
    });
  });

  it('rejects unsafe application URLs before making network requests', async () => {
    const response = await api
      .post('/api/jobs')
      .send({
        companyName: 'Internal Network Co',
        jobTitle: 'Software Intern',
        category: 'Software Engineering',
        city: 'Gurugram',
        applicationUrl: 'http://127.0.0.1:8099/apply',
        jobDescription: 'A test posting for the SSRF guard.',
      })
      .expect(201);
    privateUrlJobId = response.body.data.job.id;

    const check = await api
      .post(`/api/verification/${privateUrlJobId}/check-link`)
      .expect(400);
    expect(check.body.success).toBe(false);
    expect(check.body.error.message).toMatch(/private|local/i);
  });
});

describe('shortlist, dashboard, companies and reports', () => {
  it('saves and removes an opportunity from the committee shortlist', async () => {
    await api
      .post(`/api/jobs/${created.meridian.id}/save`)
      .send({ savedBy: 'Aarav Mehta', notes: 'Follow up next week.' })
      .expect(200);

    const savedList = await api.get('/api/jobs?savedOnly=true').expect(200);
    expect(savedList.body.data.items).toHaveLength(1);
    expect(savedList.body.data.items[0]).toMatchObject({
      id: created.meridian.id,
      saved: true,
      saved_by: ['Aarav Mehta'],
    });

    await api.delete(`/api/jobs/${created.meridian.id}/save`).expect(200);
    const after = await api.get('/api/jobs?savedOnly=true').expect(200);
    expect(after.body.data.items).toHaveLength(0);
  });

  it('returns dashboard analytics that count only verified active roles', async () => {
    const response = await api.get('/api/dashboard?scope=all').expect(200);
    expect(response.body.data.stats).toMatchObject({
      discovered: 4,
      verifiedActive: 1,
      pendingVerification: 2,
      needsReview: 1,
      companies: 4,
      targetTotal: 20,
      targetProgress: 5,
    });
    expect(response.body.data.categoryProgress.find((row) => row.category === 'Web Development')).toMatchObject({
      target: 5,
      verified: 1,
    });
    expect(response.body.data.reviewQueue.map((job) => job.id)).toEqual(
      expect.arrayContaining([created.meridian.id, created.indus.id]),
    );
  });

  it('lists companies and resolves a company profile with linked opportunities', async () => {
    const list = await api.get('/api/companies').expect(200);
    expect(list.body.data.items).toHaveLength(4);
    const northstar = list.body.data.items.find((company) => company.name === 'Northstar Labs');
    expect(northstar).toMatchObject({
      totalJobs: 1,
      verifiedActive: 1,
      pending: 0,
      city: 'Gurugram',
    });

    const detail = await api.get(`/api/companies/${northstar.id}`).expect(200);
    expect(detail.body.data.company.name).toBe('Northstar Labs');
    expect(detail.body.data.jobs).toHaveLength(1);
    expect(detail.body.data.jobs[0]).toMatchObject({
      company_name: 'Northstar Labs',
      verification_status: 'verified_active',
    });

    const filtered = await api.get('/api/companies?search=Indus').expect(200);
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.data.items[0].name).toBe('Indus AI');
  });

  it('produces a verified-only report summary and records exported reports', async () => {
    const summary = await api.get('/api/reports/summary').expect(200);
    expect(summary.body.data.stats).toMatchObject({
      verified: 1,
      discovered: 4,
      targetTotal: 20,
      targetProgress: 5,
    });
    expect(summary.body.data.jobs).toHaveLength(1);
    expect(summary.body.data.jobs[0]).toMatchObject({
      company: 'Northstar Labs',
      role: 'Frontend Developer Intern',
      city: 'Gurugram',
    });

    const missing = await api.post('/api/reports').send({ format: 'xlsx' }).expect(400);
    expect(missing.body.error.code).toBe('BAD_REQUEST');

    const recorded = await api
      .post('/api/reports')
      .send({
        reportType: 'verified_opportunities',
        format: 'xlsx',
        scope: 'Verified opportunities · All categories',
        recordCount: 1,
        generatedBy: 'Aarav Mehta',
        filters: { categories: ['Web Development'] },
      })
      .expect(201);
    expect(recorded.body.data).toMatchObject({
      report_type: 'verified_opportunities',
      format: 'xlsx',
      record_count: 1,
      generated_by: 'Aarav Mehta',
    });

    const history = await api.get('/api/reports/history?limit=12').expect(200);
    expect(history.body.data.items).toHaveLength(1);
    expect(history.body.data.items[0].id).toBe(recorded.body.data.id);
  });

  it('keeps unknown API routes behind a JSON 404 response', async () => {
    const response = await api.get('/api/not-a-real-route').expect(404);
    expect(response.body).toMatchObject({
      success: false,
      error: expect.objectContaining({ code: 'NOT_FOUND' }),
    });
  });
});
