import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

export async function jsonBody(request) {
  try { return await request.json(); } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
  }
}

export function endpoint(handler, status = 200) {
  return async (request, context) => {
    try {
      const data = await handler(request, context);
      return Response.json({ data }, { status, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      if (error instanceof ZodError) {
        error = new ApiError(422, 'VALIDATION_ERROR', 'Input validation failed.', error.issues.map(({ path, message }) => ({ path, message })));
      } else if (error.code === 'P2002') {
        error = new ApiError(409, 'DUPLICATE_REQUEST', 'A live request already exists for this order and item.');
      } else if (error.code === 'P2025') {
        error = new ApiError(404, 'NOT_FOUND', 'Request not found.');
      } else if (error.code === 'P2004' || error.code === 'P2000') {
        error = new ApiError(422, 'INVALID_DATA', 'The supplied data violates a database constraint.');
      } else if (error.code === 'P2034' || error.code === 'P2028') {
        error = new ApiError(409, 'CONCURRENT_CHANGE', 'The request is busy or changed concurrently. Please retry.');
      }
      if (!(error instanceof ApiError)) {
        console.error('ReturnDesk API error:', error);
        error = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
      }
      const { code, message, details } = error;
      return Response.json({ error: { code, message, ...(details ? { details } : {}) } }, {
        status: error.status, headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}
