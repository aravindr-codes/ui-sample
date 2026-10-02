import { ApiError } from '@ifcui/api-contract';

export interface ErrorDescription {
  title: string;
  message: string;
  /** Whether retrying the same request may succeed. */
  retryable: boolean;
}

/** The single place where errors become user-facing text. */
export function describeError(error: unknown): ErrorDescription {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'not_found':
        return { title: 'Not found', message: error.message || 'The requested item does not exist.', retryable: false };
      case 'validation':
        return { title: 'Check your input', message: error.message || 'Some fields are invalid.', retryable: false };
      case 'conflict':
        return { title: 'Action not allowed', message: error.message, retryable: false };
      case 'unavailable':
        return {
          title: 'Service unavailable',
          message: 'The service is temporarily unavailable. Please try again.',
          retryable: true,
        };
      case 'unknown':
        return {
          title: 'Something went wrong',
          message: error.message || 'An unexpected error occurred.',
          retryable: true,
        };
    }
  }
  return {
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    retryable: true,
  };
}

/** Extracts per-field messages from a validation ApiError (`details.issues[].path`). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'validation') return {};
  const issues = error.body.details?.issues;
  if (!Array.isArray(issues)) return {};
  const out: Record<string, string> = {};
  for (const issue of issues) {
    if (typeof issue !== 'object' || issue === null) continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (typeof path === 'string' && path && typeof message === 'string' && !(path in out)) out[path] = message;
  }
  return out;
}

/** Only transient failures are retried; 4xx-style errors are final. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && error instanceof ApiError && error.code === 'unavailable';
}
