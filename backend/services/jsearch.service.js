import axios from 'axios';
import { env } from '../config/env.js';
import { ApiError } from '../utils/http-error.js';
import { logger } from '../utils/logger.js';

const client = axios.create({
  baseURL: `https://${env.JSEARCH_API_HOST}`,
  timeout: 30_000,
  headers: {
    'X-RapidAPI-Host': env.JSEARCH_API_HOST,
  },
});

function mapError(error) {
  if (error instanceof ApiError) return error;
  const status = error.response?.status;
  if (status === 401 || status === 403) {
    return ApiError.unavailable(
      'JSearch rejected the API credentials. Check JSEARCH_API_KEY and the RapidAPI subscription.',
    );
  }
  if (status === 429) {
    return ApiError.tooManyRequests(
      'The JSearch monthly request quota has been reached. Try again later or use another source.',
    );
  }
  if (status) {
    return ApiError.upstream(`JSearch returned HTTP ${status}.`);
  }
  if (error.code === 'ECONNABORTED') return ApiError.upstream('JSearch did not respond in time.');
  return ApiError.upstream('JSearch could not be reached.', { reason: error.message });
}

export function isJSearchConfigured() {
  return Boolean(env.JSEARCH_API_KEY);
}

export async function searchJSearch({ query, location, pages = 1 }) {
  if (!isJSearchConfigured()) {
    throw ApiError.unavailable('JSearch is not configured. Add JSEARCH_API_KEY to the backend environment.');
  }

  try {
    const response = await client.get('/search-v2', {
      headers: { 'X-RapidAPI-Key': env.JSEARCH_API_KEY },
      params: {
        query: `${query} in ${location}, India`,
        num_pages: Math.min(Math.max(pages, 1), 2),
        country: env.JSEARCH_COUNTRY,
        date_posted: 'week',
      },
    });

    const payload = response.data?.data;
    const jobs = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.jobs)
        ? payload.jobs
        : [];
    logger.info('JSearch query completed', {
      query,
      location,
      returned: jobs.length,
      requestId: response.data?.request_id,
    });
    return jobs;
  } catch (error) {
    throw mapError(error);
  }
}
