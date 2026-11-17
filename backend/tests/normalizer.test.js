import { describe, expect, it } from 'vitest';
import { normalizeAdzunaJob, normalizeJSearchJob, normalizeManualJob } from '../services/job-normalizer.js';

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

function jsearchJob(overrides = {}) {
  return {
    job_id: 'jsearch-test-1',
    job_title: 'Frontend Developer Intern',
    employer_name: 'Northstar Labs',
    employer_website: 'https://northstar.example',
    employer_company_type: 'SaaS',
    job_city: 'Gurugram',
    job_state: 'Haryana',
    job_country: 'India',
    job_location: 'Gurugram, Haryana, India',
    job_employment_type: 'INTERN',
    job_is_remote: false,
    job_apply_link: 'https://northstar.example/careers/frontend-intern',
    job_google_link: 'https://northstar.example/jobs/frontend-intern',
    job_posted_at_datetime_utc: daysAgo(2),
    job_offer_expiration_datetime_utc: daysFromNow(20),
    job_description:
      '<p>Join our team to build <strong>React</strong> interfaces with JavaScript and TypeScript.</p><p>Stipend: ₹25,000 per month.</p>',
    job_required_skills: ['React', 'JavaScript'],
    job_min_salary: 20000,
    job_max_salary: 25000,
    job_salary_period: 'MONTH',
    ...overrides,
  };
}

describe('normalizeJSearchJob', () => {
  it('normalizes a valid NCR internship without auto-verifying it', () => {
    const result = normalizeJSearchJob(jsearchJob());

    expect(result.ok).toBe(true);
    expect(result.job).toMatchObject({
      company_name: 'Northstar Labs',
      job_title: 'Frontend Developer Intern',
      city: 'Gurugram',
      source: 'jsearch',
      source_job_id: 'jsearch-test-1',
      verification_status: 'pending',
      is_active: true,
      category: 'Web Development',
    });
    expect(result.job.job_description).not.toContain('<');
    expect(result.job.application_url).toBe('https://northstar.example/careers/frontend-intern');
    expect(result.job.required_skills).toEqual(expect.arrayContaining(['React', 'JavaScript']));
    expect(result.job.fingerprint).toHaveLength(64);
  });

  it('rejects roles outside Delhi NCR', () => {
    const result = normalizeJSearchJob(
      jsearchJob({
        job_city: 'Bengaluru',
        job_state: 'Karnataka',
        job_location: 'Bengaluru, Karnataka, India',
      }),
    );

    expect(result).toMatchObject({ ok: false, reason: 'outside_ncr' });
  });

  it('rejects non-internship listings', () => {
    const result = normalizeJSearchJob(
      jsearchJob({
        job_title: 'Senior Data Engineer',
        job_employment_type: 'FULLTIME',
        job_description: 'Lead a team of engineers with eight years of production experience.',
        job_required_skills: [],
      }),
    );

    expect(result).toMatchObject({ ok: false, reason: 'not_internship' });
  });

  it('rejects expired and stale postings', () => {
    const expired = normalizeJSearchJob(
      jsearchJob({ job_offer_expiration_datetime_utc: daysAgo(1) }),
    );
    const stale = normalizeJSearchJob(
      jsearchJob({ job_posted_at_datetime_utc: daysAgo(90) }),
    );

    expect(expired).toMatchObject({ ok: false, reason: 'expired' });
    expect(stale).toMatchObject({ ok: false, reason: 'stale' });
  });

  it('rejects records missing title, company, or a valid application URL', () => {
    expect(normalizeJSearchJob(jsearchJob({ job_title: '' }))).toMatchObject({
      ok: false,
      reason: 'missing_title',
    });
    expect(normalizeJSearchJob(jsearchJob({ employer_name: '' }))).toMatchObject({
      ok: false,
      reason: 'missing_company',
    });
    expect(normalizeJSearchJob(jsearchJob({ job_apply_link: 'javascript:alert(1)' }))).toMatchObject({
      ok: false,
      reason: 'invalid_application_url',
    });
  });
});

describe('normalizeAdzunaJob', () => {
  it('normalizes a supported Adzuna internship', () => {
    const result = normalizeAdzunaJob({
      id: 'adzuna-1',
      title: 'Data Analyst Intern',
      description:
        '<p>Work with SQL, Excel and Python to build dashboards for the analytics team.</p>',
      company: { display_name: 'Meridian Analytics' },
      location: { display_name: 'Noida, Uttar Pradesh', area: ['Noida'] },
      category: { label: 'Graduate Jobs' },
      created: daysAgo(3),
      redirect_url: 'https://meridian.example/jobs/data-analyst-intern',
      salary_min: 18000,
      salary_max: 22000,
      salary_is_predicted: '0',
    });

    expect(result.ok).toBe(true);
    expect(result.job).toMatchObject({
      company_name: 'Meridian Analytics',
      city: 'Noida',
      source: 'adzuna',
      verification_status: 'pending',
      category: 'Data Analytics',
    });
  });
});

describe('normalizeManualJob', () => {
  it('creates a pending manual record with normalized fields', () => {
    const result = normalizeManualJob({
      companyName: '  Indus AI  ',
      jobTitle: 'Machine Learning Intern',
      category: 'AI / ML / GenAI',
      city: 'Delhi',
      location: 'Okhla Phase 2, New Delhi',
      workMode: 'Hybrid',
      applicationUrl: 'https://indus.example/careers/ml-intern',
      jobDescription: 'Train and evaluate machine learning models in Python.',
      requiredSkills: ['Python', 'PyTorch'],
      stipend: '₹30,000 per month',
      deadline: daysFromNow(30),
    });

    expect(result.ok).toBe(true);
    expect(result.job).toMatchObject({
      company_name: 'Indus AI',
      job_title: 'Machine Learning Intern',
      city: 'Delhi',
      work_mode: 'Hybrid',
      source: 'manual',
      verification_status: 'pending',
      category: 'AI / ML / GenAI',
    });
    expect(result.job.stipend).toBe('₹30,000 per month');
    expect(result.job.required_skills).toEqual(expect.arrayContaining(['Python', 'PyTorch']));
    expect(result.job.source_job_id).toBeTruthy();
  });

  it('rejects a manual record with an unsafe or malformed URL', () => {
    const result = normalizeManualJob({
      companyName: 'Unsafe Co',
      jobTitle: 'Software Intern',
      city: 'Gurugram',
      applicationUrl: 'file:///etc/passwd',
    });

    expect(result).toMatchObject({ ok: false, reason: 'invalid_application_url' });
  });
});
