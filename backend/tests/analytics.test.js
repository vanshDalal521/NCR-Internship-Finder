import { describe, expect, it } from 'vitest';
import {
  buildCompanyDirectory,
  buildDashboard,
  buildReportSummary,
  summarizeCompany,
} from '../services/analytics.service.js';

const now = new Date().toISOString();

const companies = [
  {
    id: 'company-northstar',
    name: 'Northstar Labs',
    industry: 'SaaS',
    website: 'https://northstar.example',
    careers_url: null,
    location: 'Udyog Vihar, Gurugram',
    city: 'Gurugram',
    contact_email: 'careers@northstar.example',
    contact_phone: null,
    description: null,
  },
  {
    id: 'company-meridian',
    name: 'Meridian Analytics',
    industry: 'Consulting',
    website: null,
    careers_url: null,
    location: 'Sector 62, Noida',
    city: 'Noida',
    contact_email: null,
    contact_phone: null,
    description: null,
  },
  {
    id: 'company-indus',
    name: 'Indus AI',
    industry: 'Artificial Intelligence',
    website: null,
    careers_url: null,
    location: 'Okhla, Delhi',
    city: 'Delhi',
    contact_email: null,
    contact_phone: null,
    description: null,
  },
];

function job(overrides = {}) {
  return {
    id: overrides.id || `job-${overrides.company_name || 'test'}-${overrides.job_title || 'role'}`,
    company_id: overrides.company_id || null,
    company_name: 'Northstar Labs',
    job_title: 'Frontend Developer Intern',
    category: 'Web Development',
    location: 'Udyog Vihar, Gurugram',
    city: 'Gurugram',
    work_mode: 'On-site',
    employment_type: 'Internship',
    required_skills: ['React'],
    stipend: '₹20,000 /month',
    stipend_monthly_min: 20000,
    stipend_monthly_max: 20000,
    application_url: 'https://northstar.example/careers/frontend-intern',
    source: 'manual',
    source_job_id: 'source-1',
    verification_status: 'verified_active',
    is_active: true,
    saved: false,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

const jobs = [
  job({
    id: 'job-northstar-fe',
    company_id: 'company-northstar',
    verification_status: 'verified_active',
    is_active: true,
    saved: true,
    last_verified_at: now,
    verified_by: 'Placement Committee',
  }),
  job({
    id: 'job-indus-ml',
    company_id: 'company-indus',
    company_name: 'Indus AI',
    job_title: 'Machine Learning Intern',
    category: 'AI / ML / GenAI',
    city: 'Delhi',
    location: 'Okhla, Delhi',
    verification_status: 'verified_active',
    is_active: true,
    created_at: new Date(Date.now() - 60_000).toISOString(),
  }),
  job({
    id: 'job-meridian-data',
    company_id: 'company-meridian',
    company_name: 'Meridian Analytics',
    job_title: 'Data Analyst Intern',
    category: 'Data Analytics',
    city: 'Noida',
    location: 'Sector 62, Noida',
    verification_status: 'pending',
    created_at: new Date(Date.now() - 120_000).toISOString(),
  }),
  job({
    id: 'job-northstar-expired',
    company_id: 'company-northstar',
    verification_status: 'expired',
    is_active: false,
    created_at: new Date(Date.now() - 180_000).toISOString(),
  }),
];

describe('buildDashboard', () => {
  it('counts only verified active roles toward target progress', () => {
    const dashboard = buildDashboard(jobs);

    expect(dashboard.targetTotal).toBe(20);
    expect(dashboard.stats).toMatchObject({
      discovered: 4,
      verifiedActive: 2,
      pendingVerification: 1,
      needsReview: 0,
      expired: 1,
      rejected: 0,
      companies: 3,
      shortlisted: 1,
      targetProgress: 10,
    });
    expect(dashboard.categoryProgress.find((row) => row.category === 'Web Development')).toMatchObject({
      target: 5,
      verified: 1,
    });
    expect(dashboard.categoryProgress.find((row) => row.category === 'AI / ML / GenAI')).toMatchObject({
      target: 4,
      verified: 1,
    });
    expect(dashboard.distributions.verified.categories.map((row) => row.category)).toEqual(
      expect.arrayContaining(['Web Development', 'AI / ML / GenAI']),
    );
    expect(dashboard.reviewQueue.map((item) => item.id)).toEqual(['job-meridian-data']);
  });

  it('always returns a verified-only distribution alongside the full distribution', () => {
    const dashboard = buildDashboard(jobs, { scope: 'verified' });

    expect(dashboard.scope).toBe('verified');
    expect(dashboard.stats.verifiedActive).toBe(2);
    expect(
      dashboard.distributions.all.categories.some((row) => row.category === 'Data Analytics'),
    ).toBe(true);
    expect(
      dashboard.distributions.verified.categories.some((row) => row.category === 'Data Analytics'),
    ).toBe(false);
  });
});

describe('buildReportSummary', () => {
  it('exports only verified active opportunities and includes target coverage', () => {
    const report = buildReportSummary(jobs);

    expect(report.stats).toMatchObject({
      verified: 2,
      discovered: 4,
      companies: 3,
      targetTotal: 20,
      targetProgress: 10,
    });
    expect(report.jobs.map((item) => item.id)).toEqual(['job-northstar-fe', 'job-indus-ml']);
    expect(report.jobs[0]).toMatchObject({
      company: 'Northstar Labs',
      role: 'Frontend Developer Intern',
      city: 'Gurugram',
      verifiedBy: 'Placement Committee',
    });
    expect(report.categoryBreakdown.find((row) => row.category === 'Web Development')).toMatchObject({
      target: 5,
      count: 1,
    });
    expect(report.locationBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ city: 'Gurugram', count: 1 }),
        expect.objectContaining({ city: 'Delhi', count: 1 }),
      ]),
    );
  });
});

describe('buildCompanyDirectory', () => {
  it('groups opportunities by company and includes unlinked jobs', () => {
    const orphan = job({
      id: 'job-orphan',
      company_id: null,
      company_name: 'Fortis Security',
      job_title: 'Cybersecurity Intern',
      category: 'Cybersecurity',
      city: 'Faridabad',
      verification_status: 'pending',
    });
    const directory = buildCompanyDirectory(companies, [...jobs, orphan]);

    expect(directory).toHaveLength(4);
    const northstar = directory.find((company) => company.name === 'Northstar Labs');
    expect(northstar).toMatchObject({
      totalJobs: 2,
      verifiedActive: 1,
      expired: 1,
      shortlisted: 1,
    });
    expect(northstar.locations).toEqual(['Gurugram']);
    expect(northstar.categories).toEqual(['Web Development']);

    const fortis = directory.find((company) => company.name === 'Fortis Security');
    expect(fortis).toMatchObject({ id: null, totalJobs: 1, pending: 1 });
  });

  it('summarizes a company with verification and shortlist counts', () => {
    const summary = summarizeCompany(companies[0], jobs.filter((item) => item.company_id === 'company-northstar'));

    expect(summary).toMatchObject({
      name: 'Northstar Labs',
      totalJobs: 2,
      verifiedActive: 1,
      pending: 0,
      needsReview: 0,
      expired: 1,
      shortlisted: 1,
    });
    expect(summary.locations).toEqual(['Gurugram']);
    expect(summary.lastActivity).toBe(now);
  });
});
