import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import {
  cleanCompanyName,
  createFingerprint,
  normalizeWhitespace,
  truncate,
  uniqueStrings,
} from '../utils/text.js';
import { normalizeApplicationUrl } from '../utils/url.js';
import { toIsoDate, toIsoDateFromUnix } from '../utils/dates.js';
import {
  cleanDescription,
  detectCity,
  extractDuration,
  extractEligibility,
  extractExperience,
  extractSkills,
  inferCategory,
  inferWorkMode,
  isInternshipLike,
  parseStipendFromText,
  stipendFromSalaryFields,
} from '../utils/job-intelligence.js';

function rejection(reason, detail = '') {
  return { ok: false, reason, detail };
}

function normalizeEmploymentType(value = '') {
  const text = String(value);
  if (/intern/i.test(text)) return 'Internship';
  if (/part[\s-]?time/i.test(text)) return 'Part-time';
  if (/contract/i.test(text)) return 'Contract';
  if (/full[\s-]?time/i.test(text)) return 'Full-time';
  if (/trainee/i.test(text)) return 'Trainee';
  return normalizeWhitespace(text) || 'Not specified';
}

function normalizeLocationCity(city, location) {
  return detectCity(city, location);
}

function isExpired(deadline) {
  if (!deadline) return false;
  const date = new Date(deadline);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function isStale(postedAt) {
  if (!postedAt) return false;
  const date = new Date(postedAt);
  if (Number.isNaN(date.getTime())) return false;
  const cutoff = Date.now() - env.DISCOVERY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return date.getTime() < cutoff;
}

function buildStipendFields(stipend) {
  if (!stipend) {
    return {
      stipend: null,
      stipend_min: null,
      stipend_max: null,
      stipend_monthly_min: null,
      stipend_monthly_max: null,
      stipend_currency: 'INR',
      stipend_period: null,
      stipend_note: null,
    };
  }

  return {
    stipend: stipend.display,
    stipend_min: stipend.min,
    stipend_max: stipend.max,
    stipend_monthly_min: stipend.monthlyMin,
    stipend_monthly_max: stipend.monthlyMax,
    stipend_currency: stipend.currency || 'INR',
    stipend_period: stipend.period || null,
    stipend_note: stipend.note || null,
  };
}

function buildJob({
  companyName,
  jobTitle,
  category,
  location,
  city,
  workMode,
  employmentType,
  description,
  providedSkills,
  stipend,
  duration,
  eligibility,
  experienceRequired,
  applicationUrl,
  source,
  sourceJobId,
  sourceUrl,
  postedAt,
  deadline,
  company,
  rawPayload,
}) {
  const application_url = normalizeApplicationUrl(applicationUrl);
  if (!application_url) return rejection('invalid_application_url');
  if (!sourceJobId) return rejection('missing_source_id');

  return {
    ok: true,
    job: {
      company_name: companyName,
      job_title: jobTitle,
      category: category || null,
      location,
      city,
      work_mode: workMode,
      employment_type: employmentType,
      job_description: description || null,
      required_skills: extractSkills(description, providedSkills),
      ...buildStipendFields(stipend),
      duration: duration || null,
      eligibility: eligibility || null,
      experience_required: experienceRequired || null,
      application_url,
      source,
      source_job_id: String(sourceJobId),
      source_url: normalizeApplicationUrl(sourceUrl) || application_url,
      fingerprint: createFingerprint({ companyName, jobTitle, city }),
      posted_at: toIsoDate(postedAt),
      deadline: toIsoDate(deadline),
      last_seen_at: new Date().toISOString(),
      verification_status: 'pending',
      last_verified_at: null,
      verified_by: null,
      is_active: true,
      relevance_score: null,
      raw_payload: rawPayload || null,
      company: {
        name: companyName,
        website: company?.website || null,
        careersUrl: company?.careersUrl || null,
        industry: company?.industry || null,
        location: company?.location || location,
        city,
      },
    },
  };
}

export function normalizeJSearchJob(raw, { analyzeCategory = true } = {}) {
  const title = normalizeWhitespace(raw.job_title || '');
  const companyName = cleanCompanyName(raw.employer_name || '');
  if (!title) return rejection('missing_title');
  if (!companyName) return rejection('missing_company');

  const locationText = normalizeWhitespace(
    raw.job_location || [raw.job_city, raw.job_state, raw.job_country].filter(Boolean).join(', '),
  );
  const city = normalizeLocationCity(raw.job_city, locationText);
  if (!city) return rejection('outside_ncr', locationText);

  const description = cleanDescription(raw.job_description || '');
  const employmentType = normalizeEmploymentType(raw.job_employment_type || '');
  if (!isInternshipLike({ title, employmentType, description })) {
    return rejection('not_internship', employmentType);
  }

  const postedAt =
    toIsoDate(raw.job_posted_at_datetime_utc) || toIsoDateFromUnix(raw.job_posted_at_timestamp);
  const deadline = toIsoDate(raw.job_offer_expiration_datetime_utc);
  if (isExpired(deadline)) return rejection('expired', deadline);
  if (isStale(postedAt)) return rejection('stale', postedAt);

  const stipend =
    stipendFromSalaryFields({
      min: raw.job_min_salary,
      max: raw.job_max_salary,
      period: raw.job_salary_period,
    }) || parseStipendFromText(description);

  const qualifications = Array.isArray(raw.job_highlights?.Qualifications)
    ? raw.job_highlights.Qualifications.join(' ')
    : '';
  const eligibility =
    truncate(normalizeWhitespace(qualifications), 900) || extractEligibility(description);

  let experience = '';
  const experienceData = raw.job_required_experience || {};
  if (experienceData.no_experience_required === true) experience = 'No prior experience required.';
  else if (Number(experienceData.required_experience_in_months) > 0) {
    experience = `${experienceData.required_experience_in_months} months of experience mentioned in the posting.`;
  }
  if (!experience) experience = extractExperience(description) || '';

  const category = analyzeCategory ? inferCategory(title, description) : null;

  return buildJob({
    companyName,
    jobTitle: title,
    category,
    location: locationText || `${city}, India`,
    city,
    workMode: inferWorkMode({ isRemote: raw.job_is_remote, description }),
    employmentType: employmentType === 'Not specified' ? 'Internship' : employmentType,
    description,
    providedSkills: Array.isArray(raw.job_required_skills) ? raw.job_required_skills : [],
    stipend,
    duration: extractDuration(description),
    eligibility,
    experienceRequired: experience,
    applicationUrl: raw.job_apply_link || raw.job_google_link,
    source: 'jsearch',
    sourceJobId: raw.job_id,
    sourceUrl: raw.job_google_link || raw.job_apply_link,
    postedAt,
    deadline,
    company: {
      website: raw.employer_website || null,
      industry: raw.employer_company_type || null,
      location: locationText,
    },
    rawPayload: {
      job_id: raw.job_id,
      employer_name: raw.employer_name,
      employer_website: raw.employer_website,
      employer_company_type: raw.employer_company_type,
      job_title: raw.job_title,
      job_city: raw.job_city,
      job_state: raw.job_state,
      job_country: raw.job_country,
      job_location: raw.job_location,
      job_employment_type: raw.job_employment_type,
      job_is_remote: raw.job_is_remote,
      job_posted_at_datetime_utc: raw.job_posted_at_datetime_utc,
      job_offer_expiration_datetime_utc: raw.job_offer_expiration_datetime_utc,
      job_min_salary: raw.job_min_salary,
      job_max_salary: raw.job_max_salary,
      job_salary_period: raw.job_salary_period,
      job_publisher: raw.job_publisher,
      job_apply_link: raw.job_apply_link,
      job_google_link: raw.job_google_link,
      job_description: truncate(description, 5000),
    },
  });
}

export function normalizeAdzunaJob(raw) {
  const title = normalizeWhitespace(raw.title || '');
  const companyName = cleanCompanyName(raw.company?.display_name || '');
  if (!title) return rejection('missing_title');
  if (!companyName) return rejection('missing_company');

  const areaText = Array.isArray(raw.location?.area) ? raw.location.area.join(', ') : '';
  const locationText = normalizeWhitespace(raw.location?.display_name || areaText);
  const city = normalizeLocationCity(locationText, areaText);
  if (!city) return rejection('outside_ncr', locationText);

  const description = cleanDescription(raw.description || '');
  if (!isInternshipLike({ title, description })) return rejection('not_internship');

  const postedAt = toIsoDate(raw.created);
  if (isStale(postedAt)) return rejection('stale', postedAt);

  const stipend = stipendFromSalaryFields({
    min: raw.salary_min,
    max: raw.salary_max,
    period: 'YEAR',
    predicted: raw.salary_is_predicted === '1' || raw.salary_is_predicted === 1,
  });

  const category =
    raw.category?.label && /intern|graduate/i.test(raw.category.label)
      ? inferCategory(title, description)
      : inferCategory(title, description);

  return buildJob({
    companyName,
    jobTitle: title,
    category,
    location: locationText,
    city,
    workMode: inferWorkMode({ description }),
    employmentType: 'Internship',
    description,
    providedSkills: [],
    stipend: stipend || parseStipendFromText(description),
    duration: extractDuration(description),
    eligibility: extractEligibility(description),
    experienceRequired: extractExperience(description),
    applicationUrl: raw.redirect_url,
    source: 'adzuna',
    sourceJobId: raw.id,
    sourceUrl: raw.redirect_url,
    postedAt,
    deadline: null,
    company: { location: locationText },
    rawPayload: {
      id: raw.id,
      title: raw.title,
      company: raw.company?.display_name,
      location: raw.location,
      category: raw.category,
      created: raw.created,
      salary_min: raw.salary_min,
      salary_max: raw.salary_max,
      salary_is_predicted: raw.salary_is_predicted,
      contract_time: raw.contract_time,
      redirect_url: raw.redirect_url,
      description: truncate(description, 5000),
    },
  });
}

export function normalizeManualJob(input) {
  const companyName = cleanCompanyName(input.companyName);
  const jobTitle = normalizeWhitespace(input.jobTitle);
  if (!companyName) return rejection('missing_company');
  if (!jobTitle) return rejection('missing_title');

  const description = normalizeWhitespace(input.jobDescription || '');
  const providedSkills = uniqueStrings(input.requiredSkills || []);
  const stipendText = normalizeWhitespace(input.stipend || '');
  const parsedStipend = stipendText ? parseStipendFromText(stipendText) : null;
  const stipend = stipendText
    ? parsedStipend
      ? { ...parsedStipend, display: stipendText }
      : {
          display: stipendText,
          min: input.stipendMin ?? null,
          max: input.stipendMax ?? null,
          currency: 'INR',
          period: null,
          monthlyMin: input.stipendMin ?? null,
          monthlyMax: input.stipendMax ?? null,
          note: '',
        }
    : null;

  const applicationUrl = normalizeApplicationUrl(input.applicationUrl);
  if (!applicationUrl) return rejection('invalid_application_url');

  const category = input.category || inferCategory(jobTitle, description);

  return buildJob({
    companyName,
    jobTitle,
    category,
    location: input.location || `${input.city}, India`,
    city: input.city,
    workMode: input.workMode || 'On-site',
    employmentType: input.employmentType || 'Internship',
    description,
    providedSkills,
    stipend,
    duration: input.duration || extractDuration(description),
    eligibility: input.eligibility || extractEligibility(description),
    experienceRequired: input.experienceRequired || extractExperience(description),
    applicationUrl,
    source: 'manual',
    sourceJobId: randomUUID(),
    sourceUrl: input.sourceUrl || applicationUrl,
    postedAt: input.postedAt,
    deadline: input.deadline,
    company: {
      website: input.companyWebsite,
      industry: input.companyIndustry,
      location: input.location || `${input.city}, India`,
    },
    rawPayload: {
      addedManually: true,
      notes: input.notes || null,
      originalApplicationUrl: input.applicationUrl,
      addedAt: new Date().toISOString(),
    },
  });
}
