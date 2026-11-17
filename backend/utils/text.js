import { createHash } from 'node:crypto';

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  bull: '•',
  hellip: '…',
  euro: '€',
  pound: '£',
  rupee: '₹',
};

export function decodeEntities(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITY_MAP[name.toLowerCase()] ?? match);
}

function safeFromCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

export function stripHtml(value = '') {
  if (!value) return '';
  return decodeEntities(
    String(value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|section)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim(),
  );
}

export function truncate(value, max) {
  if (!value) return '';
  const text = String(value).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function normalizeWhitespace(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

export function cleanCompanyName(value = '') {
  return normalizeWhitespace(value)
    .replace(/^at\s+/i, '')
    .replace(/\s*[|•-]\s*(hiring|careers?|jobs?)$/i, '')
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .trim();
}

const LEGAL_SUFFIXES = new Set([
  'pvt',
  'pvt.',
  'private',
  'ltd',
  'ltd.',
  'limited',
  'llp',
  'inc',
  'inc.',
  'incorporated',
  'corp',
  'corp.',
  'corporation',
  'co',
  'co.',
  'company',
  'plc',
]);

export function normalizeCompanyName(value = '') {
  return cleanCompanyName(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !LEGAL_SUFFIXES.has(token))
    .join(' ');
}

const TITLE_NOISE = new Set([
  'intern',
  'internship',
  'trainee',
  'hiring',
  'urgent',
  'immediate',
  'opening',
  'openings',
  'job',
  'role',
  'position',
  'remote',
  'onsite',
  'hybrid',
  'fresher',
]);

export function normalizeJobTitle(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !TITLE_NOISE.has(token))
    .sort()
    .join(' ');
}

export function createFingerprint({ companyName, jobTitle, city }) {
  const normalized = [
    normalizeCompanyName(companyName),
    normalizeJobTitle(jobTitle),
    normalizeWhitespace(city || '').toLowerCase(),
  ].join('|');
  return createHash('sha256').update(normalized).digest('hex');
}

export function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value).replace(/[,;]+$/, '');
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

export function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
