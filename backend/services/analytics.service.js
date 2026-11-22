import { CATEGORIES, CATEGORY_TARGETS, CITIES, LOCATIONS, SOURCE_LABELS } from '../config/constants.js';
import { isPortalVisibleJob } from '../utils/freshness.js';
import { normalizeCompanyName } from '../utils/text.js';

const CATEGORY_ORDER = new Map(CATEGORIES.map((category, index) => [category, index]));
const CITY_ORDER = new Map(CITIES.map((city, index) => [city, index]));
const TARGET_TOTAL = 20;

function isVerifiedActive(job) {
  return job.verification_status === 'verified_active' && job.is_active !== false;
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item);
    if (key === undefined) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function sortedByOrder(map, order) {
  return [...map.entries()].sort((a, b) => {
    const ai = order.has(a[0]) ? order.get(a[0]) : 999;
    const bi = order.has(b[0]) ? order.get(b[0]) : 999;
    if (ai !== bi) return ai - bi;
    return b[1] - a[1];
  });
}

function buildDistributions(jobs) {
  const categories = countBy(jobs, (job) => job.category || 'Uncategorized');
  const locations = countBy(jobs, (job) => job.city || 'Other');
  const sources = countBy(jobs, (job) => job.source || 'manual');
  const workModes = countBy(jobs, (job) => job.work_mode || 'Not specified');

  return {
    categories: sortedByOrder(
      categories,
      new Map([...CATEGORY_ORDER, ['Uncategorized', 998]]),
    ).map(([category, count]) => ({
      category,
      count,
      target: CATEGORY_TARGETS[category] || 0,
    })),
    locations: sortedByOrder(locations, new Map([...CITY_ORDER, ['Other', 998]])).map(
      ([city, count]) => ({
        city,
        count,
        priority: LOCATIONS.find((location) => location.city === city)?.priority || null,
      }),
    ),
    sources: [...sources.entries()]
      .map(([source, count]) => ({ source, label: SOURCE_LABELS[source] || source, count }))
      .sort((a, b) => b.count - a.count),
    workModes: [...workModes.entries()].map(([mode, count]) => ({ mode, count })),
  };
}

function recentJob(job) {
  return {
    id: job.id,
    job_title: job.job_title,
    company_name: job.company_name,
    city: job.city,
    location: job.location,
    category: job.category,
    source: job.source,
    verification_status: job.verification_status,
    is_active: job.is_active,
    stipend: job.stipend,
    created_at: job.created_at,
    posted_at: job.posted_at,
    deadline: job.deadline,
  };
}

export function buildDashboard(jobs, { scope = 'all' } = {}) {
  const verifiedJobs = jobs.filter(isVerifiedActive);
  const sortedRecent = jobs
    .filter((job) => isPortalVisibleJob(job))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const pendingQueue = [...jobs]
    .filter((job) => ['pending', 'needs_review'].includes(job.verification_status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const statusCounts = countBy(jobs, (job) => job.verification_status);
  const companyKeys = new Set(
    jobs.map((job) => normalizeCompanyName(job.company_name || '')).filter(Boolean),
  );

  const allDistributions = buildDistributions(jobs);
  const verifiedDistributions = buildDistributions(verifiedJobs);

  const categoryProgress = CATEGORIES.map((category) => ({
    category,
    target: CATEGORY_TARGETS[category] || 0,
    verified: verifiedJobs.filter((job) => job.category === category).length,
  }));

  return {
    scope,
    generatedAt: new Date().toISOString(),
    targetTotal: TARGET_TOTAL,
    stats: {
      discovered: jobs.length,
      verifiedActive: verifiedJobs.length,
      pendingVerification: statusCounts.get('pending') || 0,
      needsReview: statusCounts.get('needs_review') || 0,
      expired: statusCounts.get('expired') || 0,
      rejected: statusCounts.get('rejected') || 0,
      companies: companyKeys.size,
      shortlisted: jobs.filter((job) => job.saved).length,
      targetTotal: TARGET_TOTAL,
      targetProgress: Math.min(100, Math.round((verifiedJobs.length / TARGET_TOTAL) * 100)),
    },
    verificationCounts: {
      pending: statusCounts.get('pending') || 0,
      verified_active: statusCounts.get('verified_active') || 0,
      needs_review: statusCounts.get('needs_review') || 0,
      expired: statusCounts.get('expired') || 0,
      rejected: statusCounts.get('rejected') || 0,
    },
    distributions: {
      all: allDistributions,
      verified: verifiedDistributions,
    },
    categoryProgress,
    recent: sortedRecent.slice(0, 6).map(recentJob),
    reviewQueue: pendingQueue.slice(0, 5).map(recentJob),
  };
}

export function buildReportSummary(jobs) {
  const verified = jobs
    .filter(isVerifiedActive)
    .sort((a, b) => {
      const categoryComparison =
        (CATEGORY_ORDER.get(a.category) ?? 998) - (CATEGORY_ORDER.get(b.category) ?? 998);
      if (categoryComparison !== 0) return categoryComparison;
      return String(a.company_name || '').localeCompare(String(b.company_name || ''));
    });

  const categoryCounts = countBy(verified, (job) => job.category || 'Uncategorized');
  const companyCounts = countBy(verified, (job) => job.company_name || 'Unknown');
  const locationCounts = countBy(verified, (job) => job.city || 'Other');
  const companyKeys = new Set(jobs.map((job) => normalizeCompanyName(job.company_name || '')).filter(Boolean));

  return {
    generatedAt: new Date().toISOString(),
    targetTotal: TARGET_TOTAL,
    stats: {
      verified: verified.length,
      discovered: jobs.length,
      companies: companyKeys.size,
      targetTotal: TARGET_TOTAL,
      targetProgress: Math.min(100, Math.round((verified.length / TARGET_TOTAL) * 100)),
    },
    categoryBreakdown: CATEGORIES.map((category) => ({
      category,
      target: CATEGORY_TARGETS[category] || 0,
      count: categoryCounts.get(category) || 0,
    })).concat(
      categoryCounts.has('Uncategorized')
        ? [{ category: 'Uncategorized', target: 0, count: categoryCounts.get('Uncategorized') }]
        : [],
    ),
    companyBreakdown: [...companyCounts.entries()]
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count || a.company.localeCompare(b.company)),
    locationBreakdown: CITIES.map((city) => ({
      city,
      priority: LOCATIONS.find((location) => location.city === city)?.priority || null,
      count: locationCounts.get(city) || 0,
    })).filter((entry) => entry.count > 0),
    jobs: verified.map((job) => ({
      id: job.id,
      company: job.company_name,
      role: job.job_title,
      category: job.category || 'Uncategorized',
      city: job.city,
      location: job.location,
      workMode: job.work_mode,
      employmentType: job.employment_type,
      stipend: job.stipend,
      duration: job.duration,
      skills: job.required_skills || [],
      eligibility: job.eligibility,
      experience: job.experience_required,
      deadline: job.deadline,
      applicationUrl: job.application_url,
      source: SOURCE_LABELS[job.source] || job.source,
      sourceLabel: job.source,
      postedAt: job.posted_at,
      verifiedAt: job.last_verified_at,
      verifiedBy: job.verified_by,
      relevanceScore: job.relevance_score,
    })),
  };
}

export function buildCompanyDirectory(companies, jobs) {
  const displayJobs = jobs.filter((job) => isPortalVisibleJob(job));
  const jobsByCompany = new Map();
  for (const job of displayJobs) {
    const key = job.company_id || `name:${normalizeCompanyName(job.company_name || '')}`;
    if (!key) continue;
    if (!jobsByCompany.has(key)) jobsByCompany.set(key, []);
    jobsByCompany.get(key).push(job);
  }

  const directory = companies.map((company) => {
    const companyJobs = jobsByCompany.get(company.id) || [];
    return summarizeCompany(company, companyJobs);
  });

  // Jobs without a company record are still represented in the directory.

  const represented = new Set(directory.map((company) => company.id).filter(Boolean));
  for (const [key, companyJobs] of jobsByCompany.entries()) {
    if (represented.has(key) || !key.startsWith('name:')) continue;
    const first = companyJobs[0];
    directory.push(
      summarizeCompany(
        {
          id: null,
          name: first.company_name,
          industry: null,
          website: null,
          careers_url: null,
          location: first.location,
          city: first.city,
          contact_email: null,
          contact_phone: null,
        },
        companyJobs,
      ),
    );
  }

  return directory.sort((a, b) => b.verifiedActive - a.verifiedActive || b.totalJobs - a.totalJobs || a.name.localeCompare(b.name));
}

export function summarizeCompany(company, jobs) {
  const verifiedActive = jobs.filter(isVerifiedActive).length;
  const pending = jobs.filter((job) => job.verification_status === 'pending').length;
  const needsReview = jobs.filter((job) => job.verification_status === 'needs_review').length;
  const expired = jobs.filter((job) => job.verification_status === 'expired').length;
  const lastActivity = jobs
    .map((job) => job.updated_at || job.created_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;

  return {
    id: company.id,
    name: company.name,
    industry: company.industry || null,
    website: company.website || null,
    careersUrl: company.careers_url || null,
    location: company.location || null,
    city: company.city || null,
    contactEmail: company.contact_email || null,
    contactPhone: company.contact_phone || null,
    description: company.description || null,
    totalJobs: jobs.length,
    verifiedActive,
    pending,
    needsReview,
    expired,
    shortlisted: jobs.filter((job) => job.saved).length,
    locations: [...new Set(jobs.map((job) => job.city).filter(Boolean))],
    categories: [...new Set(jobs.map((job) => job.category).filter(Boolean))],
    lastActivity,
  };
}
