import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';

describe('ApiError', () => {
  describe('constructor', () => {
    it('creates an error with all properties', () => {
      const error = new ApiError(400, 'Bad request', 'BAD_REQUEST', {
        field: 'email',
      });

      expect(error.status).toBe(400);
      expect(error.message).toBe('Bad request');
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.details).toEqual({ field: 'email' });
      expect(error.name).toBe('ApiError');
    });

    it('works without optional parameters', () => {
      const error = new ApiError(500, 'Server error');

      expect(error.status).toBe(500);
      expect(error.message).toBe('Server error');
      expect(error.code).toBeUndefined();
      expect(error.details).toBeUndefined();
    });
  });

  describe('error type checks', () => {
    it('identifies network errors', () => {
      const error = new ApiError(0, 'Network error');
      expect(error.isNetworkError()).toBe(true);
      expect(error.isAuthError()).toBe(false);
    });

    it('identifies auth errors (401)', () => {
      const error = new ApiError(401, 'Unauthorized');
      expect(error.isAuthError()).toBe(true);
      expect(error.isForbiddenError()).toBe(false);
    });

    it('identifies forbidden errors (403)', () => {
      const error = new ApiError(403, 'Forbidden');
      expect(error.isForbiddenError()).toBe(true);
      expect(error.isAuthError()).toBe(false);
    });

    it('identifies not found errors (404)', () => {
      const error = new ApiError(404, 'Not found');
      expect(error.isNotFoundError()).toBe(true);
    });

    it('identifies validation errors (422)', () => {
      const error = new ApiError(422, 'Validation error');
      expect(error.isValidationError()).toBe(true);
    });

    it('identifies rate limit errors (429)', () => {
      const error = new ApiError(429, 'Too many requests');
      expect(error.isRateLimitError()).toBe(true);
    });

    it('identifies server errors (5xx)', () => {
      expect(new ApiError(500, 'Internal error').isServerError()).toBe(true);
      expect(new ApiError(502, 'Bad gateway').isServerError()).toBe(true);
      expect(new ApiError(503, 'Unavailable').isServerError()).toBe(true);
      expect(new ApiError(400, 'Bad request').isServerError()).toBe(false);
    });

    it('identifies client errors (4xx)', () => {
      expect(new ApiError(400, 'Bad request').isClientError()).toBe(true);
      expect(new ApiError(404, 'Not found').isClientError()).toBe(true);
      expect(new ApiError(500, 'Server error').isClientError()).toBe(false);
    });
  });

  describe('getFieldErrors', () => {
    it('returns empty object for non-validation errors', () => {
      const error = new ApiError(500, 'Server error');
      expect(error.getFieldErrors()).toEqual({});
    });

    it('parses FastAPI validation error format', () => {
      const error = new ApiError(422, 'Validation error', 'VALIDATION_ERROR', {
        detail: [
          { loc: ['body', 'email'], msg: 'Invalid email format' },
          { loc: ['body', 'password'], msg: 'Password too short' },
          { loc: ['body', 'password'], msg: 'Password needs uppercase' },
        ],
      });

      const fieldErrors = error.getFieldErrors();

      expect(fieldErrors.email).toEqual(['Invalid email format']);
      expect(fieldErrors.password).toEqual([
        'Password too short',
        'Password needs uppercase',
      ]);
    });
  });

  describe('static factory methods', () => {
    it('creates network error', () => {
      const error = ApiError.networkError();

      expect(error.status).toBe(0);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.isNetworkError()).toBe(true);
    });

    it('creates timeout error', () => {
      const error = ApiError.timeoutError();

      expect(error.status).toBe(0);
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.isNetworkError()).toBe(true);
    });

    it('creates from response with JSON body', async () => {
      const response = new Response(
        JSON.stringify({
          message: 'Resource not found',
          code: 'NOT_FOUND',
          id: '123',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const error = await ApiError.fromResponse(response);

      expect(error.status).toBe(404);
      expect(error.message).toBe('Resource not found');
      expect(error.code).toBe('NOT_FOUND');
    });

    it('creates from response without JSON body', async () => {
      const response = new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      });

      const error = await ApiError.fromResponse(response);

      expect(error.status).toBe(404);
      expect(error.message).toBe('Not Found');
    });
  });

  describe('type guard', () => {
    it('returns true for ApiError instances', () => {
      const error = new ApiError(400, 'Bad request');
      expect(ApiError.isApiError(error)).toBe(true);
    });

    it('returns false for regular errors', () => {
      const error = new Error('Regular error');
      expect(ApiError.isApiError(error)).toBe(false);
    });

    it('returns false for non-errors', () => {
      expect(ApiError.isApiError(null)).toBe(false);
      expect(ApiError.isApiError(undefined)).toBe(false);
      expect(ApiError.isApiError('string')).toBe(false);
      expect(ApiError.isApiError({ status: 400 })).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('serializes to plain object', () => {
      const error = new ApiError(400, 'Bad request', 'BAD_REQUEST', {
        field: 'email',
      });

      const json = error.toJSON();

      expect(json).toEqual({
        name: 'ApiError',
        status: 400,
        message: 'Bad request',
        code: 'BAD_REQUEST',
        details: { field: 'email' },
      });
    });
  });
});
