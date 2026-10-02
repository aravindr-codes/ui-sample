import { z } from 'zod';

export const ApiErrorCode = z.enum(['not_found', 'validation', 'conflict', 'unavailable', 'unknown']);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiErrorBody = z.object({
  code: ApiErrorCode,
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  not_found: 404,
  validation: 422,
  conflict: 409,
  unavailable: 503,
  unknown: 500,
};

export function statusForCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code];
}

export function codeForStatus(status: number): ApiErrorCode {
  if (status === 404) return 'not_found';
  if (status === 400 || status === 422) return 'validation';
  if (status === 409) return 'conflict';
  if (status === 502 || status === 503 || status === 504) return 'unavailable';
  return 'unknown';
}

/** The only error type any ApiClient adapter may throw. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.status = status;
    this.body = body;
  }

  get code(): ApiErrorCode {
    return this.body.code;
  }

  static of(code: ApiErrorCode, message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(statusForCode(code), details ? { code, message, details } : { code, message });
  }

  /** Converts a ZodError into a `validation` ApiError with per-path issues in `details.issues`. */
  static fromZod(error: z.ZodError, message = 'Validation failed'): ApiError {
    return ApiError.of('validation', message, {
      issues: error.issues.map((i) => ({ path: i.path.map(String).join('.'), message: i.message })),
    });
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
