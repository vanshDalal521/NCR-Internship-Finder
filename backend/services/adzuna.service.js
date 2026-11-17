import axios from 'axios';
import { env } from '../config/env.js';
import { ApiError } from '../utils/http-error.js';
import { logger } from '../utils/logger.js';

const client = axios.create({ timeout: 30_000 });

function mapError(error) {
  if (error instanceof ApiError) return error;
  const status = error.response?.status;
  if (status === 401 || status === 403) {
    return ApiError.unavailable(
      'Adzuna rejected the API credentials. Check ADZUNA_APP_ID and ADZUNA_APP_KEY.',
    );
  }
  if (status === 429) {
    return ApiError.tooManyRequests('The Adzuna rate limit has been reached. Try again later.');
  }
  if (status) return ApiError.upstream(`Adzuna returned HTTP ${status}.`);
  if (error.code === 'ECONNABORTED') return ApiError.upstream('Adzuna did not respond in time.');
  return ApiError.upstream('Adzuna could not be reached.', { reason: error.message });
}

export function isAdzunaConfigured() {
  return Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY);
}

export async function searchAdzuna({ query, location, pages = 1 }) {
  if (!isAdzunaConfigured()) {
    throw ApiError.unavailable('Adzuna is not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY.');
  }

  try {
    const results = [];
    for (let page = 1; page <= Math.min(Math.max(pages, 1), 2); page += 1) {
      const response = await client.get(
        `https://api.adzuna.com/v1/api/jobs/${env.ADZUNA_COUNTRY}/search/${page}`,
        {
          params: {
            app_id: env.ADZUNA_APP_ID,
            app_key: env.ADZUNA_APP_KEY,
            what: query,
            where: `${location}, India`,
            results_per_page: 50,
            max_days_old: 30,
            sort_by: 'date',
            'content-type': 'application/json',
          },
        },
      );
      if (Array.isArray(response.data?.results)) results.push(...response.data.results);
    }
    logger.info('Adzuna query completed', { query, location, returned: results.length });
    return results;
  } catch (error) {
    throw mapError(error);
  }
}
