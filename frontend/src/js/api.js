import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
export const TOKEN_KEY = 'ncr.session.token';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'REQUEST_FAILED', details = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.cause = cause;
  }

  get isNetworkError() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status || 0;
    const requestUrl = String(error.config?.url || '');
    if (status === 401 && !requestUrl.includes('/auth/login') && !requestUrl.includes('/auth/me')) {
      window.dispatchEvent(new CustomEvent('ncr:unauthorized'));
    }
    return Promise.reject(normalizeError(error));
  },
);

function normalizeError(error) {
  if (error?.isAxiosError) {
    if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message)) {
      return new ApiError('The request took too long. Check the backend connection and try again.', {
        code: 'TIMEOUT',
        cause: error,
      });
    }

    if (error.response) {
      const payload = error.response.data;
      const apiError = payload?.error || {};
      return new ApiError(apiError.message || `The request failed (HTTP ${error.response.status}).`, {
        status: error.response.status,
        code: apiError.code || `HTTP_${error.response.status}`,
        details: apiError.details || null,
        cause: error,
      });
    }

    return new ApiError(
      'The backend could not be reached. Make sure the API server is running and try again.',
      { code: 'NETWORK_ERROR', cause: error },
    );
  }

  if (error instanceof ApiError) return error;
  return new ApiError(error?.message || 'Something went wrong. Please try again.', {
    code: 'UNEXPECTED_ERROR',
    cause: error,
  });
}

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable in hardened browsers. The page still works for the session.
  }
}

export function clearToken() {
  setToken(null);
}

export function unwrap(response) {
  return response?.data?.data;
}

export async function request(method, url, { params, data, timeout, headers } = {}) {
  const response = await api.request({ method, url, params, data, timeout, headers });
  return unwrap(response);
}

export const http = {
  get: (url, params, options = {}) => request('get', url, { params, ...options }),
  post: (url, data, options = {}) => request('post', url, { data, ...options }),
  patch: (url, data, options = {}) => request('patch', url, { data, ...options }),
  put: (url, data, options = {}) => request('put', url, { data, ...options }),
  delete: (url, options = {}) => request('delete', url, options),
};

export function describeError(error) {
  const apiError = error instanceof ApiError ? error : normalizeError(error);
  const details = apiError.details;

  if (Array.isArray(details)) {
    const extra = details
      .map((detail) => {
        if (!detail) return '';
        if (typeof detail === 'string') return detail;
        return detail.message || detail.reason || '';
      })
      .filter(Boolean);
    if (extra.length) return `${apiError.message} ${extra[0]}`;
  } else if (details && typeof details === 'object') {
    if (details.message) return `${apiError.message} ${details.message}`;
    if (details.reason) return `${apiError.message} (${details.reason}).`;
  }

  return apiError.message;
}
