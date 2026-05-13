export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INTERNAL'
  | 'PASSWORD_REQUIRED'
  | 'INVALID_PASSWORD'
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMITED';

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown
): Response {
  return Response.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status }
  );
}

export function jsonOk<T>(body: T, status = 200): Response {
  return Response.json(body, { status });
}
