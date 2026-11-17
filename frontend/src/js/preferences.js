import { getConfig } from './config.js';

export const PREFS_KEY = 'ncr.prefs.v1';

const EMPTY = {
  profileName: '',
  role: 'Placement Committee',
  reviewerName: '',
  locationOrder: [],
  focusCategories: [],
};

function readRaw() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getPrefs(config = getConfig()) {
  const stored = readRaw();
  const locationOrder = Array.isArray(stored.locationOrder) && stored.locationOrder.length
    ? stored.locationOrder.filter((city) => config.cities.includes(city))
    : [...config.cities];

  for (const city of config.cities) {
    if (!locationOrder.includes(city)) locationOrder.push(city);
  }

  const focusCategories = Array.isArray(stored.focusCategories) && stored.focusCategories.length
    ? stored.focusCategories.filter((category) => config.categories.includes(category))
    : [...config.categories];

  return {
    ...EMPTY,
    ...stored,
    role: stored.role || EMPTY.role,
    locationOrder,
    focusCategories,
  };
}

export function savePrefs(patch) {
  try {
    const next = { ...readRaw(), ...patch };
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return readRaw();
  }
}

export function resetPrefs() {
  try {
    window.localStorage.removeItem(PREFS_KEY);
  } catch {
    // Ignore storage restrictions.
  }
}

export function getReviewerName(config = getConfig()) {
  const prefs = getPrefs(config);
  return String(prefs.reviewerName || prefs.profileName || 'Placement Committee').trim();
}

export function getProfile(config = getConfig()) {
  const prefs = getPrefs(config);
  return {
    name: String(prefs.profileName || 'Placement Committee').trim(),
    role: String(prefs.role || 'Placement Committee').trim(),
    reviewerName: String(prefs.reviewerName || prefs.profileName || 'Placement Committee').trim(),
  };
}

export function orderedLocations(config = getConfig()) {
  const prefs = getPrefs(config);
  const index = new Map(prefs.locationOrder.map((city, position) => [city, position]));
  return [...(config.locations || [])].sort((a, b) => {
    const ai = index.has(a.city) ? index.get(a.city) : 999;
    const bi = index.has(b.city) ? index.get(b.city) : 999;
    if (ai !== bi) return ai - bi;
    return (a.priority || 999) - (b.priority || 999);
  });
}

export function orderedCategories(config = getConfig()) {
  const prefs = getPrefs(config);
  const focus = new Set(prefs.focusCategories);
  return [...config.categories].sort((a, b) => {
    const af = focus.has(a) ? 0 : 1;
    const bf = focus.has(b) ? 0 : 1;
    return af - bf || config.categories.indexOf(a) - config.categories.indexOf(b);
  });
}
