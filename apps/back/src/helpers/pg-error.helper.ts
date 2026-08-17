const UNIQUE_VIOLATION = '23505'

/**
 * Turns a race on a unique key into a 409 rather than a 500, and keeps pg's error
 * `detail` (which quotes the conflicting value) out of both the response and the logs.
 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}
