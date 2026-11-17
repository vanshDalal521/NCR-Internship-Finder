import { http } from './api.js';

export const FALLBACK_CONFIG = {
  categories: [
    'Web Development',
    'Data Analytics',
    'AI / ML / GenAI',
    'Cybersecurity',
    'Software Engineering',
    'Cloud / DevOps',
    'Technical Operations',
    'Business Operations',
  ],
  categoryTargets: {
    'Web Development': 5,
    'Data Analytics': 4,
    'AI / ML / GenAI': 4,
    Cybersecurity: 2,
    'Software Engineering': 2,
    'Cloud / DevOps': 1,
    'Technical Operations': 1,
    'Business Operations': 1,
  },
  targetTotal: 20,
  locations: [
    { city: 'Gurugram', priority: 1, hubs: ['Cyber City', 'Udyog Vihar', 'Golf Course Road'] },
    { city: 'Noida', priority: 2, hubs: ['Sector 62', 'Sector 63', 'Sector 125'] },
    { city: 'Delhi', priority: 3, hubs: ['Okhla', 'Nehru Place', 'Connaught Place'] },
    { city: 'Faridabad', priority: 4, hubs: ['Ballabgarh'] },
  ],
  cities: ['Gurugram', 'Noida', 'Delhi', 'Faridabad'],
  searchKeywords: [
    'software developer intern',
    'frontend developer intern',
    'backend developer intern',
    'full stack developer intern',
    'react developer intern',
    'data analyst intern',
    'business analyst intern',
    'machine learning intern',
    'AI engineer intern',
    'generative AI intern',
    'cybersecurity intern',
    'SOC analyst intern',
    'cloud engineer intern',
    'DevOps intern',
    'technical operations intern',
    'business operations intern',
  ],
  workModes: ['On-site', 'Hybrid', 'Remote'],
  sources: ['jsearch', 'adzuna', 'manual'],
  sourceLabels: { jsearch: 'JSearch', adzuna: 'Adzuna', manual: 'Manual' },
  verificationStatuses: ['pending', 'verified_active', 'needs_review', 'expired', 'rejected'],
  verificationLabels: {
    pending: 'Pending',
    verified_active: 'Verified active',
    needs_review: 'Needs review',
    expired: 'Expired',
    rejected: 'Rejected',
  },
  userRoles: [
    'Placement Officer',
    'Faculty Coordinator',
    'Student Coordinator',
    'Committee Member',
  ],
  defaultPageSize: 20,
  maxPageSize: 100,
  discoveryDailyLimit: 40,
  discoveryMaxAgeDays: 45,
  configured: { jsearch: false, adzuna: false, gemini: false, supabase: false },
};

let cached = null;
let inflight = null;

export async function loadConfig({ force = false } = {}) {
  if (cached && !force) return cached;
  if (inflight && !force) return inflight;

  inflight = http
    .get('/system/config', null, { timeout: 15_000 })
    .then((data) => {
      cached = { ...FALLBACK_CONFIG, ...data, loaded: true };
      return cached;
    })
    .catch(() => {
      cached = cached || { ...FALLBACK_CONFIG, loaded: false };
      return cached;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function getConfig() {
  return cached || FALLBACK_CONFIG;
}

export function cityLabel(city) {
  const location = getConfig().locations?.find((item) => item.city === city) || {};
  if (!location) return city;
  return location.hubs?.length ? `${city}` : city;
}

export function shortCategory(category) {
  return (
    {
      'Web Development': 'Web Dev',
      'Data Analytics': 'Data Analytics',
      'AI / ML / GenAI': 'AI / ML',
      Cybersecurity: 'Cybersecurity',
      'Software Engineering': 'Software Eng',
      'Cloud / DevOps': 'Cloud / DevOps',
      'Technical Operations': 'Technical Ops',
      'Business Operations': 'Business Ops',
    }[category] || category
  );
}
