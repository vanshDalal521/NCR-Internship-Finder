const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'refid',
  'referer',
  'referrer',
  'source',
  'src',
  'trk',
  'trackingid',
  'gh_src',
  'lever-source',
  'lever-origin',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'utm_name',
  'igshid',
  's_kwcid',
]);

export function normalizeApplicationUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    return null;
  }

  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.username || url.password) return null;

  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = '';
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();

  let pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
  url.pathname = pathname;

  return url.toString();
}

export function isHttpUrl(value) {
  return normalizeApplicationUrl(value) !== null;
}

export function urlHostname(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
