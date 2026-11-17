import { logger } from './logger.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = status < 500;
  }

  static badRequest(message, details) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Authentication is required.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have access to this resource.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'The requested resource was not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message, details) {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static tooManyRequests(message, details) {
    return new ApiError(429, 'RATE_LIMITED', message, details);
  }

  static upstream(message, details) {
    return new ApiError(502, 'UPSTREAM_ERROR', message, details);
  }

  static unavailable(message, details) {
    return new ApiError(503, 'SERVICE_UNAVAILABLE', message, details);
  }
}

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No API route matches ${req.method} ${req.originalUrl}.`));
}

export function errorHandler(error, req, res, _next) {
  const status = Number.isInteger(error.status) ? error.status : 500;
  const isServerError = status >= 500;

  if (isServerError) {
    logger.error('Request failed', {
      method: req.method,
      path: req.originalUrl,
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
  }

  const payload = {
    success: false,
    error: {
      code: error.code || (isServerError ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
      message:
        error.expose === false || isServerError
          ? 'Something went wrong while processing the request.'
          : error.message,
    },
  };

  if (error.details && !isServerError) payload.error.details = error.details;
  if (res.headersSent) return;

  res.status(status).json(payload);
}
