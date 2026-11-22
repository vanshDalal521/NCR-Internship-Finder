import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { ApiError } from '../utils/http-error.js';
import { normalizeApplicationUrl } from '../utils/url.js';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

export function isBlockedAddress(address) {
  if (!address || !net.isIP(address)) return true;

  if (net.isIPv4(address)) {
    const [a, b, c] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }

  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('2001:db8')) return true;
  if (normalized.startsWith('64:ff9b')) return true;
  if (normalized.startsWith('2002')) return true;
  if (normalized.startsWith('2001:0000') || normalized.startsWith('2001:0')) return true;
  if (normalized.startsWith('::ffff:')) {
    return isBlockedAddress(normalized.slice('::ffff:'.length));
  }
  return false;
}

async function resolveAddress(url) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost')
  ) {
    throw ApiError.badRequest('This link points to a private or local network address.');
  }

  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw ApiError.badRequest('This link points to a private or local network address.');
    }
    return { address: hostname, family: net.isIPv6(hostname) ? 6 : 4 };
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw ApiError.badRequest('The application link’s domain could not be resolved.');
  }

  if (!addresses.length) {
    throw ApiError.badRequest('The application link’s domain could not be resolved.');
  }

  for (const entry of addresses) {
    if (isBlockedAddress(entry.address)) {
      throw ApiError.badRequest('This link resolves to a private or local network address.');
    }
  }

  // Prefer IPv4: some container hosts and home networks advertise IPv6 routes
  // that cannot actually reach the public internet.
  const preferred = addresses.find((entry) => entry.family === 4) || addresses[0];
  return { address: preferred.address, family: preferred.family };
}

function requestOnce(url, { address, family }, timeoutMs) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers: {
          'User-Agent': 'NCR-Internship-Finder/1.0 (committee link checker)',
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          Range: 'bytes=0-0',
          Connection: 'close',
        },
        lookup: (_hostname, options, callback) => {
          // Node 20+ enables Happy Eyeballs (autoSelectFamily), which asks the
          // custom lookup for every address. Returning a single address keeps
          // the request bound to the SSRF-vetted IP.
          if (options?.all) callback(null, [{ address, family }]);
          else callback(null, address, family);
        },
        servername: url.protocol === 'https:' ? url.hostname.replace(/^\[|\]$/g, '') : undefined,
        timeout: timeoutMs,
      },
      (response) => {
        const result = {
          statusCode: response.statusCode || 0,
          statusMessage: response.statusMessage || '',
          location: response.headers.location || null,
        };
        response.destroy();
        finish(result);
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('The application page did not respond in time.'));
    });
    request.on('error', fail);
    request.end();
  });
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function classify(status) {
  if (status >= 200 && status < 300) return 'reachable';
  if (status === 401 || status === 403) return 'blocked';
  if (status === 429) return 'rate_limited';
  if (status === 404 || status === 410) return 'not_found';
  if (status >= 300 && status < 400) return 'redirect_issue';
  if (status >= 500) return 'server_error';
  return 'unexpected_response';
}

export async function checkApplicationLink(rawUrl, { timeoutMs = 10_000 } = {}) {
  const normalized = normalizeApplicationUrl(rawUrl);
  if (!normalized) {
    throw ApiError.badRequest('A valid http(s) application URL is required.');
  }

  const originalUrl = normalized;
  let currentUrl = new URL(normalized);
  let redirects = 0;
  let lastStatus = 0;
  const chain = [];

  while (redirects <= 3) {
    const resolved = await resolveAddress(currentUrl);
    let response;
    try {
      response = await requestOnce(currentUrl, resolved, timeoutMs);
    } catch (error) {
      return {
        checkedUrl: originalUrl,
        finalUrl: currentUrl.toString(),
        httpStatus: lastStatus || null,
        redirects,
        chain,
        reachable: false,
        outcome: 'unreachable',
        message:
          error.code === 'ENOTFOUND'
            ? 'The application page’s domain could not be reached.'
            : 'The application page did not respond.',
        checkedAt: new Date().toISOString(),
      };
    }

    lastStatus = response.statusCode;
    chain.push({ url: currentUrl.toString(), status: response.statusCode });

    if (REDIRECT_STATUSES.has(response.statusCode) && response.location) {
      redirects += 1;
      if (redirects > 3) break;
      try {
        currentUrl = new URL(response.location, currentUrl);
      } catch {
        break;
      }
      if (!['http:', 'https:'].includes(currentUrl.protocol)) break;
      continue;
    }

    const outcome = classify(response.statusCode);
    const messages = {
      reachable: 'The page responded successfully. A human must still review the posting before verifying it.',
      blocked: 'The page blocked automated checks. Open it manually to review the posting.',
      rate_limited: 'The site rate-limited the automated check. Open it manually.',
      not_found: 'The page returned not found or gone. The listing may be closed.',
      redirect_issue: 'The page redirected without a usable destination.',
      server_error: 'The employer site returned a server error. Try again or open it manually.',
      unexpected_response: 'The page returned an unexpected response. Review it manually.',
    };

    return {
      checkedUrl: originalUrl,
      finalUrl: currentUrl.toString(),
      httpStatus: response.statusCode,
      redirects,
      chain,
      reachable: outcome === 'reachable',
      outcome,
      message: messages[outcome],
      checkedAt: new Date().toISOString(),
    };
  }

  return {
    checkedUrl: originalUrl,
    finalUrl: currentUrl.toString(),
    httpStatus: lastStatus || null,
    redirects,
    chain,
    reachable: false,
    outcome: 'too_many_redirects',
    message: 'The link redirected too many times. Open it manually to review the listing.',
    checkedAt: new Date().toISOString(),
  };
}
